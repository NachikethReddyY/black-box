#!/usr/bin/env python3
"""Operator/Worker adapter example for a single AMR workflow dispatch.

Requires a reviewed GitHub App token. No hosted routing job or automatic paid
fallback exists. A busy or offline home runner is a waiting result.
"""
from __future__ import annotations
import argparse, json, os, re, sys, urllib.error, urllib.request, uuid

API = 'https://api.github.com'
HOME_LABELS = {'self-hosted', 'linux', 'x64', 'black-box-linux'}
SHA = re.compile(r'^[0-9a-fA-F]{40}$')
REF = re.compile(r'^refs/(heads|pull)/[A-Za-z0-9_./-]+$')

def fail(message):
    raise SystemExit(message)

def request(method, path, token, payload=None):
    body = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(API + path, data=body, method=method, headers={
        'Accept': 'application/vnd.github+json',
        'Authorization': f'Bearer {token}',
        'X-GitHub-Api-Version': '2026-03-10',
        'Content-Type': 'application/json',
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return json.loads(response.read() or b'{}')
    except urllib.error.HTTPError as error:
        fail(f'GitHub API {error.code} for {path}; dispatch status is unknown, reconcile request_id before retry')

def main():
    ap = argparse.ArgumentParser()
    for name in ('repository','commit-sha','head-sha','request-id','source-ref'):
        ap.add_argument('--'+name, required=True)
    ap.add_argument('--runner', choices=('home','github','blacksmith'), default='home')
    ap.add_argument('--pr-number')
    args=ap.parse_args()
    token=os.environ.get('GH_TOKEN') or fail('GH_TOKEN is required')
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',args.repository): fail('invalid repository')
    if not SHA.fullmatch(args.commit_sha) or not SHA.fullmatch(args.head_sha): fail('both SHAs must be full 40-character revisions')
    try: uuid.UUID(args.request_id)
    except ValueError: fail('request_id must be a UUID')
    if not REF.fullmatch(args.source_ref) or '..' in args.source_ref: fail('source_ref must be a safe full Git ref')
    if args.pr_number is not None and not re.fullmatch(r'[1-9][0-9]*',args.pr_number): fail('pr_number must be a decimal string')
    if args.runner == 'home':
        inventory=request('GET',f'/repos/{args.repository}/actions/runners?per_page=100',token)
        ready=[r for r in inventory.get('runners',[]) if r.get('status')=='online' and HOME_LABELS <= {x['name'] for x in r.get('labels',[])}]
        if not ready: fail('waiting: no online home runner has all required labels; no paid fallback')
        if all(r.get('busy') for r in ready): fail('waiting: home runner busy; no paid fallback')
    elif args.runner == 'github':
        if os.environ.get('BLACK_BOX_GITHUB_ENABLED') != 'true': fail('github provider disabled')
    else:
        if os.environ.get('BLACK_BOX_BLACKSMITH_ENABLED') != 'true' or not os.environ.get('BLACK_BOX_BLACKSMITH_RUNS_ON_JSON'): fail('blacksmith provider disabled or label mapping missing')
    workflow_ref=os.environ.get('BLACKBOX_WORKFLOW_REF') or fail('BLACKBOX_WORKFLOW_REF must name the reviewed branch/tag with the workflow definition')
    payload={'ref':workflow_ref,'inputs':{
        'runner':args.runner,'commit_sha':args.commit_sha.lower(),
        'head_sha':args.head_sha.lower(),'request_id':args.request_id,
        'source_ref':args.source_ref,'pr_number':args.pr_number or '', 'source_event':'pull_request' if args.pr_number else 'manual',
    }}
    request('POST',f'/repos/{args.repository}/actions/workflows/black-box-ci.yml/dispatches',token,payload)
    print(f'dispatched black-box:{args.request_id} on {args.runner}; tested commit {args.commit_sha.lower()}')
if __name__=='__main__': main()
