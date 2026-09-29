#!/usr/bin/env python3
"""Static audit for the AMR workflow migration candidate."""
from __future__ import annotations
import argparse, re, sys
from pathlib import Path
EXPECTED_JOBS = {"local-checks", "local-postgres", "source-and-dependencies", "dast-tooling"}
INPUTS = {"runner", "commit_sha", "head_sha", "request_id", "source_ref", "source_event", "pr_number"}
SHA_ACTION = re.compile(r"uses:\s*[\w.-]+/[\w.-]+@([0-9a-fA-F]{40})(?:\s|#|$)")
def job_block(text, job):
    match = re.search(rf"^  {re.escape(job)}:\s*$", text, re.MULTILINE)
    if not match: return ""
    rest = text[match.end():]; nxt = re.search(r"^  [a-z][a-z0-9-]*:\s*$", rest, re.MULTILINE)
    return rest[:nxt.start() if nxt else len(rest)]
def source_signatures(text):
    return {line.strip() for line in text.splitlines() if re.match(r"\s*(- uses:|- run:|run:|uses:|name:)", line) and "ref:" not in line}
def validate(text, source_dir=None):
    errors=[]
    if text.count("workflow_dispatch:") != 1: errors.append("workflow must contain exactly one workflow_dispatch trigger")
    if re.search(r"^\s*(push|pull_request|pull_request_target|schedule):", text, re.MULTILINE): errors.append("push/PR/schedule triggers belong to the Worker adapter, not this workflow")
    found=set(re.findall(r"^      ([a-z_]+):\s*$", text, re.MULTILINE))
    if INPUTS-found: errors.append("missing normalized inputs: "+", ".join(sorted(INPUTS-found)))
    if "run-name: black-box:${{ inputs.request_id }}" not in text: errors.append("run-name must correlate with inputs.request_id")
    if "ref: ${{ inputs.commit_sha }}" not in text: errors.append("checkout must use inputs.commit_sha")
    if text.count("git rev-parse HEAD") != len(EXPECTED_JOBS): errors.append("each named job must prove its exact checkout revision")
    if "inputs.runner == 'home'" not in text or 'self-hosted' not in text or 'black-box-linux' not in text: errors.append("home runner mapping must require self-hosted/linux/x64/black-box-linux")
    if "BLACK_BOX_GITHUB_ENABLED" not in text or "BLACK_BOX_BLACKSMITH_ENABLED" not in text: errors.append("paid provider mappings need strict enable variables")
    if re.search(r"runs-on:\s*\$\{\{\s*inputs\.runner\s*\}\}", text): errors.append("runner enum must map to labels, never pass a label directly")
    runs_on=re.findall(r"^\s*runs-on:\s*(.+?)\s*$", text, re.MULTILINE)
    if len(runs_on)!=len(EXPECTED_JOBS): errors.append(f"expected {len(EXPECTED_JOBS)} runs-on entries, found {len(runs_on)}")
    jobs=set(re.findall(r"^  ([a-z][a-z0-9-]*):\s*$", text, re.MULTILINE))
    if EXPECTED_JOBS-jobs: errors.append("missing observed jobs: "+", ".join(sorted(EXPECTED_JOBS-jobs)))
    if "permissions:" not in text or not re.search(r"^\s+contents:\s+read\s*$", text, re.MULTILINE): errors.append("contents: read permission is missing")
    if text.count("timeout-minutes:")!=len(EXPECTED_JOBS): errors.append("each named job needs its source timeout")
    if "cancel-in-progress: true" not in text or "inputs.source_ref" not in text: errors.append("concurrency must use normalized source_ref and cancellation")
    if "github.ref" in text or "github.sha" in text or "github.event" in text: errors.append("source ref/SHA/event must come from normalized inputs")
    if "down --volumes --remove-orphans" not in text or "if: always()" not in text: errors.append("database cleanup must run on every outcome")
    for line in [x for x in text.splitlines() if "uses:" in x and not x.lstrip().startswith("#")]:
        if not SHA_ACTION.search(line): errors.append("un-pinned action: "+line.strip())
    if source_dir:
        for filename in ("checks.yml", "security.yml"):
            source=(source_dir/filename).read_text(encoding="utf-8")
            for job in re.findall(r"^  ([a-z][a-z0-9-]*):\s*$", source, re.MULTILINE):
                missing=source_signatures(job_block(source,job))-source_signatures(job_block(text,job))
                if job == "local-postgres" and "docker image rm amr-report-parser:ci || test ! -f" in source and "docker image rm \"amr-report-parser:ci-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}\"" in text:
                    missing={x for x in missing if "docker image rm amr-report-parser:ci" not in x}
                if missing: errors.append(f"{filename}/{job} source steps missing: "+"; ".join(sorted(missing)))
    return errors
def main():
    ap=argparse.ArgumentParser(); ap.add_argument("workflow",type=Path); ap.add_argument("--source-dir",type=Path); args=ap.parse_args()
    errors=validate(args.workflow.read_text(encoding="utf-8"),args.source_dir)
    if errors:
        print("AMR template validation failed:",file=sys.stderr); print("\n".join(f"- {e}" for e in errors),file=sys.stderr); return 1
    print(f"AMR template validation passed: {args.workflow}"); return 0
if __name__=="__main__": raise SystemExit(main())
