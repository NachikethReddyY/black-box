#!/usr/bin/env python3
"""Bounded, opt-in BuildKit and package-store cache management.

The default path is read-only.  A policy names the trusted repository and
lineage before a Buildx docker-container builder can be prepared.  BuildKit's
garbage-collection policy owns cache limits; this module never removes cache
state itself.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence


SCHEMA = "blackbox.runner.cache/v1"
OWNER_LABEL_KEY = "com.blackbox.runner.owner"
OWNER_MARKER = ".black-box-cache-owned"
KNOWN_MANAGERS = ("pnpm", "npm", "yarn", "bun")
KNOWN_VERSION_KEYS = {
    "node",
    "pnpm",
    "npm",
    "yarn",
    "bun",
    "docker",
    "buildx",
    "python",
    "git",
    "runner",
    "corepack",
}
SPACE_RE = re.compile(r"^(?:\d+(?:\.\d+)?)(?:B|KB|MB|GB|TB|%)$")
REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
LINEAGE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$")
LABEL_RE = re.compile(r"^[A-Za-z0-9_.-]+=[A-Za-z0-9_.:/-]+$")
VERSION_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._+:/() ,=-]{0,127}$")


class CacheConfigError(ValueError):
    """A policy is absent, malformed, or not safe to use."""


class CachePolicy:
    __slots__ = (
        "trusted_repo",
        "lineage",
        "owner_label",
        "cache_root",
        "reserved_space",
        "max_used_space",
        "min_free_space",
        "package_managers",
        "identity",
        "builder_name",
    )

    def __init__(
        self,
        trusted_repo: str,
        lineage: str,
        owner_label: str,
        cache_root: Path,
        reserved_space: str,
        max_used_space: str,
        min_free_space: str,
        package_managers: tuple[str, ...],
        identity: str,
        builder_name: str,
    ) -> None:
        self.trusted_repo = trusted_repo
        self.lineage = lineage
        self.owner_label = owner_label
        self.cache_root = cache_root
        self.reserved_space = reserved_space
        self.max_used_space = max_used_space
        self.min_free_space = min_free_space
        self.package_managers = package_managers
        self.identity = identity
        self.builder_name = builder_name


def _require_text(value: Any, field: str, *, pattern: re.Pattern[str] | None = None) -> str:
    if not isinstance(value, str) or not value or "\n" in value or "\r" in value:
        raise CacheConfigError(f"{field} must be a non-empty single-line string")
    if pattern and not pattern.fullmatch(value):
        raise CacheConfigError(f"{field} has an unsupported value")
    return value


def _space_value(value: Any, field: str) -> str:
    return _require_text(value, field, pattern=SPACE_RE)


def _safe_fragment(value: str) -> str:
    result = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return result[:30] or "unnamed"


def _cache_identity(repo: str, lineage: str) -> str:
    material = json.dumps(
        {"schema": SCHEMA, "trusted_repo": repo, "lineage": lineage},
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(material).hexdigest()


def load_policy(raw: Mapping[str, Any]) -> CachePolicy:
    """Validate trusted operator input and derive an immutable cache identity."""

    if not isinstance(raw, Mapping):
        raise CacheConfigError("cache policy must be a JSON object")
    if raw.get("enabled") is not True:
        raise CacheConfigError("cache policy is disabled; set enabled=true as an explicit opt-in")
    repo = _require_text(raw.get("trusted_repo"), "trusted_repo", pattern=REPO_RE)
    lineage = _require_text(raw.get("lineage"), "lineage", pattern=LINEAGE_RE)
    owner_label = _require_text(raw.get("owner_label"), "owner_label", pattern=LABEL_RE)
    owner_key = owner_label.split("=", 1)[0]
    if owner_key != OWNER_LABEL_KEY:
        raise CacheConfigError(f"owner_label must use the runner owner key {OWNER_LABEL_KEY}")

    raw_root = _require_text(raw.get("cache_root"), "cache_root")
    cache_root = Path(raw_root).expanduser()
    if not cache_root.is_absolute() or cache_root == Path("/"):
        raise CacheConfigError("cache_root must be an absolute, non-root path")
    if any(part == ".." for part in cache_root.parts):
        raise CacheConfigError("cache_root cannot contain '..'")
    if any(str(cache_root).startswith(prefix) for prefix in ("/mnt/", "/media/", "/run/media/")):
        raise CacheConfigError("cache_root must stay on the Linux filesystem")

    buildkit = raw.get("buildkit")
    if not isinstance(buildkit, Mapping):
        raise CacheConfigError("buildkit must be an object")
    reserved = buildkit.get("size", buildkit.get("reservedSpace"))
    reserved_space = _space_value(reserved, "buildkit.size")
    max_used = _space_value(buildkit.get("maxUsedSpace"), "buildkit.maxUsedSpace")
    min_free = _space_value(buildkit.get("minFreeSpace"), "buildkit.minFreeSpace")

    managers = raw.get("package_managers", [])
    if not isinstance(managers, list) or not managers or any(manager not in KNOWN_MANAGERS for manager in managers):
        raise CacheConfigError(f"package_managers must be a non-empty list from {KNOWN_MANAGERS}")
    if len(set(managers)) != len(managers):
        raise CacheConfigError("package_managers must not contain duplicates")

    identity = _cache_identity(repo, lineage)
    builder_name = "blackbox-cache-{}-{}-{}".format(
        _safe_fragment(repo), _safe_fragment(lineage), identity[:12]
    )
    return CachePolicy(
        trusted_repo=repo,
        lineage=lineage,
        owner_label=owner_label,
        cache_root=cache_root,
        reserved_space=reserved_space,
        max_used_space=max_used,
        min_free_space=min_free,
        package_managers=tuple(managers),
        identity=identity,
        builder_name=builder_name,
    )


def load_policy_file(path: Path) -> CachePolicy:
    if path.is_symlink() or not path.is_file():
        raise CacheConfigError(f"cache policy is not a regular file: {path}")
    if path.stat().st_size > 64 * 1024:
        raise CacheConfigError("cache policy is larger than 64 KiB")
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise CacheConfigError(f"could not read cache policy: {exc}") from exc
    return load_policy(raw)


def buildkit_config(policy: CachePolicy) -> str:
    """Render the small BuildKit config used by the named builder."""

    return (
        f"# {SCHEMA}\n"
        f"# identity={policy.identity}\n"
        f"# trusted_repo={policy.trusted_repo}\n"
        f"# lineage={policy.lineage}\n"
        "[worker.oci]\n"
        "  gc = true\n"
        f'  reservedSpace = "{policy.reserved_space}"\n'
        f'  maxUsedSpace = "{policy.max_used_space}"\n'
        f'  minFreeSpace = "{policy.min_free_space}"\n'
    )


def prepare_command(policy: CachePolicy, buildkit_config_path: str | Path) -> list[str]:
    """Build the exact, bounded command used only by ``prepare --apply``."""

    labels = (
        f"container-label={policy.owner_label}",
        f"container-label=com.blackbox.runner.cache.repo={policy.trusted_repo}",
        f"container-label=com.blackbox.runner.cache.lineage={policy.lineage}",
    )
    command = [
        "docker",
        "buildx",
        "create",
        "--name",
        policy.builder_name,
        "--driver",
        "docker-container",
        "--buildkitd-config",
        str(buildkit_config_path),
    ]
    for option in labels:
        command.extend(("--driver-opt", option))
    command.extend(("--use", "--bootstrap"))
    return command


def inspect_command(policy: CachePolicy) -> list[str]:
    return ["docker", "buildx", "inspect", policy.builder_name]


def package_store_commands(policy: CachePolicy) -> dict[str, list[str]]:
    available = {
        "pnpm": ["pnpm", "store", "path", "--silent"],
        "npm": ["npm", "config", "get", "cache"],
        "yarn": ["yarn", "cache", "dir"],
        "bun": ["bun", "pm", "cache"],
    }
    return {manager: available[manager] for manager in policy.package_managers}


def _run(
    command: Sequence[str],
    *,
    timeout: float,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> subprocess.CompletedProcess[str]:
    return runner(
        list(command),
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def _bounded_output(value: str, limit: int = 512) -> str:
    return value.strip().splitlines()[0][:limit] if value.strip() else ""


def _path_size(path: Path, max_entries: int = 10_000) -> int | None:
    if not path.exists() or path.is_symlink():
        return None
    if path.is_file():
        try:
            return path.stat().st_size
        except OSError:
            return None
    total = 0
    entries = 0
    try:
        for item in path.rglob("*"):
            entries += 1
            if entries > max_entries:
                return None
            if item.is_file() and not item.is_symlink():
                total += item.stat().st_size
    except OSError:
        return None
    return total


def package_store_inventory(
    policy: CachePolicy,
    *,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
    which: Callable[[str], str | None] = shutil.which,
) -> list[dict[str, Any]]:
    """Ask each package manager for its configured store, never guessing paths."""

    inventory: list[dict[str, Any]] = []
    for manager, command in package_store_commands(policy).items():
        record: dict[str, Any] = {"manager": manager, "command": command}
        if which(command[0]) is None:
            record.update({"available": False, "path": None, "reason": "tool unavailable"})
            inventory.append(record)
            continue
        try:
            result = _run(command, timeout=5, runner=runner)
        except (OSError, subprocess.TimeoutExpired) as exc:
            record.update({"available": False, "path": None, "reason": type(exc).__name__})
            inventory.append(record)
            continue
        output = _bounded_output(result.stdout)
        path = Path(output).expanduser() if result.returncode == 0 and output and output != "undefined" else None
        record.update(
            {
                "available": result.returncode == 0 and path is not None,
                "path": str(path) if path else None,
                "exists": bool(path and path.exists()),
                "size_bytes": _path_size(path) if path else None,
            }
        )
        if result.returncode != 0:
            record["reason"] = "tool command failed"
        inventory.append(record)
    return inventory


def _normalise_version_key(key: str) -> str | None:
    if not isinstance(key, str):
        return None
    candidate = key.strip().lower().replace("-", "_").replace(".", "_")
    if candidate.endswith("_version"):
        candidate = candidate[: -len("_version")]
    return candidate if candidate in KNOWN_VERSION_KEYS else None


def _safe_version(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value if VERSION_RE.fullmatch(value) else None


def environment_manifest(versions: Mapping[str, Any]) -> dict[str, Any]:
    """Hash version strings only.  Environment variables and their values never enter the manifest."""

    normalised: dict[str, str] = {}
    for key, value in versions.items():
        version_key = _normalise_version_key(key)
        safe_value = _safe_version(value)
        if version_key and safe_value:
            normalised[version_key] = safe_value
    canonical = json.dumps(normalised, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return {
        "versions": normalised,
        "fingerprint": hashlib.sha256(canonical).hexdigest(),
    }


def collect_tool_versions(
    *,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> dict[str, str]:
    commands: dict[str, list[str]] = {
        "node": ["node", "--version"],
        "pnpm": ["pnpm", "--version"],
        "npm": ["npm", "--version"],
        "yarn": ["yarn", "--version"],
        "bun": ["bun", "--version"],
        "docker": ["docker", "version", "--format", "{{.Server.Version}}"],
        "buildx": ["docker", "buildx", "version"],
        "python": [sys.executable, "--version"],
        "git": ["git", "--version"],
    }
    versions: dict[str, str] = {}
    for key, command in commands.items():
        try:
            result = _run(command, timeout=4, runner=runner)
        except (OSError, subprocess.TimeoutExpired):
            continue
        if result.returncode == 0:
            value = _bounded_output(result.stdout or result.stderr, 128)
            if _safe_version(value):
                versions[key] = value
    return versions


def cache_evidence() -> dict[str, str]:
    return {"outcome": "unknown", "reason": "not measured"}


def inspect_builder(
    policy: CachePolicy,
    *,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> dict[str, Any]:
    command = inspect_command(policy)
    try:
        result = _run(command, timeout=8, runner=runner)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"builder": policy.builder_name, "ready": False, "reason": type(exc).__name__}
    output = (result.stdout or "")[:4096]
    status = output.lower()
    ready = result.returncode == 0 and ("status: running" in status or "buildkit version:" in status)
    return {
        "builder": policy.builder_name,
        "ready": ready,
        "reason": "ready" if ready else "builder unavailable",
        "output": output,
    }


def _validate_cache_root(path: Path) -> None:
    current = path
    while current != current.parent:
        if current.is_symlink():
            raise CacheConfigError(f"cache_root contains a symlink: {current}")
        current = current.parent


def _prepare_files(policy: CachePolicy, config_path: Path) -> None:
    _validate_cache_root(policy.cache_root)
    policy.cache_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    marker = policy.cache_root / OWNER_MARKER
    marker_text = f"black-box-cache-v1\nidentity={policy.identity}\n"
    if marker.exists() or marker.is_symlink():
        if marker.is_symlink() or marker.read_text(encoding="utf-8") != marker_text:
            raise CacheConfigError(f"cache ownership marker does not match policy: {marker}")
    else:
        marker.write_text(marker_text, encoding="utf-8")
        marker.chmod(stat.S_IRUSR | stat.S_IWUSR)
    existing = config_path.read_text(encoding="utf-8") if config_path.exists() else None
    rendered = buildkit_config(policy)
    if existing is not None and existing != rendered:
        raise CacheConfigError(f"refusing to replace an existing BuildKit config: {config_path}")
    if existing is None:
        config_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd, temp_name = tempfile.mkstemp(prefix="buildkit-", suffix=".toml", dir=config_path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(rendered)
            os.chmod(temp_name, stat.S_IRUSR | stat.S_IWUSR)
            os.replace(temp_name, config_path)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)


def _read_json(path: Path) -> Mapping[str, Any]:
    if path.is_symlink() or not path.is_file():
        raise CacheConfigError(f"cache policy is not a regular file: {path}")
    if path.stat().st_size > 64 * 1024:
        raise CacheConfigError("cache policy is larger than 64 KiB")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise CacheConfigError(f"could not read cache policy: {exc}") from exc
    if not isinstance(value, Mapping):
        raise CacheConfigError("cache policy must be a JSON object")
    return value


def _command_result(command: Sequence[str], timeout: float) -> dict[str, Any]:
    try:
        result = _run(command, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"ok": False, "reason": type(exc).__name__}
    return {
        "ok": result.returncode == 0,
        "returncode": result.returncode,
        "stdout": (result.stdout or "")[:4096],
        "stderr": (result.stderr or "")[:1024],
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True, type=Path, help="trusted operator cache policy JSON")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("inspect", help="read builder state without starting or changing it")
    prepare = commands.add_parser("prepare", help="show or explicitly prepare the named builder")
    prepare.add_argument("--apply", action="store_true", help="write policy files and run Buildx")
    commands.add_parser("inventory", help="inspect package managers' configured stores")
    commands.add_parser("manifest", help="record tool-version fingerprint and cache evidence")
    args = parser.parse_args(argv)
    try:
        raw = _read_json(args.config)
        policy = load_policy(raw)
        if args.command == "inspect":
            result = inspect_builder(policy)
            result["identity"] = policy.identity
            result["policy"] = {
                "trusted_repo": policy.trusted_repo,
                "lineage": policy.lineage,
                "owner_label": policy.owner_label,
            }
        elif args.command == "prepare":
            config_path = policy.cache_root / "buildkitd.toml"
            command = prepare_command(policy, config_path)
            if args.apply:
                _prepare_files(policy, config_path)
                result = _command_result(command, timeout=60)
                result.update({"builder": policy.builder_name, "identity": policy.identity, "applied": True})
            else:
                result = {
                    "applied": False,
                    "builder": policy.builder_name,
                    "identity": policy.identity,
                    "command": command,
                    "message": "dry-run; pass --apply for the explicit operator action",
                }
        elif args.command == "inventory":
            result = {"identity": policy.identity, "stores": package_store_inventory(policy)}
        else:
            result = {
                "identity": policy.identity,
                "environment": environment_manifest(collect_tool_versions()),
                "cache": cache_evidence(),
            }
        print(json.dumps(result, sort_keys=True))
        return 0
    except CacheConfigError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
