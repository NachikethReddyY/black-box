import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "cache.py"
SPEC = importlib.util.spec_from_file_location("blackbox_cache", SCRIPT)
assert SPEC and SPEC.loader
cache = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(cache)


def policy(**overrides):
    value = {
        "enabled": True,
        "trusted_repo": "acme/amr-api",
        "lineage": "main-linux",
        "owner_label": "com.blackbox.runner.owner=black-box-ci",
        "cache_root": "/tmp/black-box-cache",
        "buildkit": {
            "size": "5GB",
            "maxUsedSpace": "20GB",
            "minFreeSpace": "2GB",
        },
        "package_managers": ["pnpm", "npm"],
    }
    value.update(overrides)
    return value


class CachePolicyTests(unittest.TestCase):
    def test_identity_is_explicit_and_stable(self):
        first = cache.load_policy(policy())
        second = cache.load_policy(policy())
        self.assertEqual(first.identity, second.identity)
        self.assertIn("acme-amr-api", first.builder_name)
        self.assertIn(first.identity[:8], first.builder_name)

    def test_identity_changes_with_lineage(self):
        first = cache.load_policy(policy())
        second = cache.load_policy(policy(lineage="release"))
        self.assertNotEqual(first.identity, second.identity)
        self.assertNotEqual(first.builder_name, second.builder_name)

    def test_buildkit_config_maps_size_policy_to_gc(self):
        loaded = cache.load_policy(policy())
        config = cache.buildkit_config(loaded)
        self.assertIn("reservedSpace = \"5GB\"", config)
        self.assertIn("maxUsedSpace = \"20GB\"", config)
        self.assertIn("minFreeSpace = \"2GB\"", config)
        self.assertIn("gc = true", config)

    def test_prepare_command_is_named_container_builder_with_labels(self):
        loaded = cache.load_policy(policy())
        command = cache.prepare_command(loaded, "/tmp/buildkit.toml")
        self.assertEqual(command[:5], ["docker", "buildx", "create", "--name", loaded.builder_name])
        self.assertIn("--driver", command)
        self.assertEqual(command[command.index("--driver") + 1], "docker-container")
        self.assertIn("--buildkitd-config", command)
        self.assertIn("--use", command)
        self.assertIn("--bootstrap", command)
        self.assertIn("--driver-opt", command)
        opts = [command[index + 1] for index, item in enumerate(command[:-1]) if item == "--driver-opt"]
        self.assertIn("container-label=com.blackbox.runner.owner=black-box-ci", opts)
        self.assertTrue(any(item.startswith("container-label=com.blackbox.runner.cache.repo=") for item in opts))
        self.assertTrue(any(item.startswith("container-label=com.blackbox.runner.cache.lineage=") for item in opts))

    def test_disabled_policy_cannot_prepare(self):
        with self.assertRaises(cache.CacheConfigError):
            cache.load_policy(policy(enabled=False))

    def test_package_commands_use_tool_configuration(self):
        loaded = cache.load_policy(policy(package_managers=["pnpm", "npm", "yarn"]))
        commands = cache.package_store_commands(loaded)
        self.assertEqual(commands["pnpm"], ["pnpm", "store", "path", "--silent"])
        self.assertEqual(commands["npm"], ["npm", "config", "get", "cache"])
        self.assertEqual(commands["yarn"], ["yarn", "cache", "dir"])

    def test_manifest_fingerprint_contains_versions_only(self):
        manifest = cache.environment_manifest(
            {"node": "v24.20.0", "pnpm": "9.15.0", "SECRET_TOKEN": "do-not-record"}
        )
        self.assertEqual(manifest["versions"], {"node": "v24.20.0", "pnpm": "9.15.0"})
        self.assertNotIn("SECRET_TOKEN", json.dumps(manifest))
        self.assertEqual(len(manifest["fingerprint"]), 64)

    def test_cache_evidence_stays_unknown_without_build_output(self):
        self.assertEqual(cache.cache_evidence(), {"outcome": "unknown", "reason": "not measured"})

    def test_load_policy_requires_trusted_identity(self):
        bad = policy()
        del bad["trusted_repo"]
        with self.assertRaises(cache.CacheConfigError):
            cache.load_policy(bad)


if __name__ == "__main__":
    unittest.main()
