#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT=Path(__file__).parents[1]; sys.path.insert(0,str(ROOT))
from validate_template import validate
GOOD=(ROOT/"black-box-ci.yml").read_text(encoding="utf-8")
def expect(text,phrase):
    errors=validate(text); assert any(phrase in e for e in errors), errors
def main():
    assert validate(GOOD)==[], validate(GOOD)
    expect(GOOD.replace("  workflow_dispatch:","  push:\n    branches: [main]\n  workflow_dispatch:"),"triggers")
    expect(GOOD.replace("      commit_sha:","      removed_sha:"),"normalized inputs")
    expect(GOOD.replace("ref: ${{ inputs.commit_sha }}","ref: ${{ github.sha }}",1),"source ref/SHA")
    expect(GOOD.replace("runs-on: ${{ fromJSON(inputs.runner == 'home' && '[\"self-hosted\",\"linux\",\"x64\",\"black-box-linux\"]' || inputs.runner == 'github' && vars.BLACK_BOX_GITHUB_ENABLED == 'true' && '[\"ubuntu-24.04\"]' || inputs.runner == 'blacksmith' && vars.BLACK_BOX_BLACKSMITH_ENABLED == 'true' && vars.BLACK_BOX_BLACKSMITH_RUNS_ON_JSON || '[]') }}", "runs-on: ${{ inputs.runner }}", 1),"directly")
    expect(GOOD.replace("cancel-in-progress: true","cancel-in-progress: false"),"cancellation")
    print("validator fixture tests passed")
if __name__=="__main__": main()
