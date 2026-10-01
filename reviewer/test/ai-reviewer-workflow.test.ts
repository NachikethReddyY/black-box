import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(resolve(repositoryRoot, '.github/workflows/ai-reviewer.yml'), 'utf8');

test('AI reviewer workflow is event-scoped, trusted, and fork-isolated', () => {
  const trigger = workflow.slice(workflow.indexOf('on:'), workflow.indexOf('permissions:'));
  assert.match(trigger, /pull_request_target:\s+types:/);
  for (const event of ['opened', 'synchronize', 'reopened', 'ready_for_review']) assert.match(trigger, new RegExp(`- ${event}\\b`));

  assert.match(workflow, /if: >-[\s\S]*head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /runs-on: \[self-hosted, linux, black-box-reviewer\]/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(workflow, /GITHUB_APP_PRIVATE_KEY: \$\{\{ secrets\.BB_GITHUB_APP_PRIVATE_KEY \}\}/);
  assert.match(workflow, /APP_PRIVATE_KEY: \$\{\{ secrets\.BB_GITHUB_APP_PRIVATE_KEY \}\}/);
  assert.match(workflow, /REVIEWER_REPOSITORY: \$\{\{ github\.event\.repository\.full_name \}\}/);
  assert.match(workflow, /REVIEWER_PR_NUMBER: \$\{\{ github\.event\.pull_request\.number \}\}/);
  assert.match(workflow, /REVIEWER_UPDATE_PR_DESCRIPTION: 'true'/);
  assert.equal((workflow.match(/pnpm --dir reviewer run pr-review/g) ?? []).length, 1);
  assert.doesNotMatch(workflow, /^\s+GITHUB_TOKEN:/m);
  assert.doesNotMatch(workflow, /pnpm --dir reviewer run (watch|poll-once)/);
  assert.match(workflow, /pull_request\.user\.login == github\.repository_owner/);
  assert.doesNotMatch(workflow, /runner\.temp.*(pem|key)|tailscale|Tailscale|status-server|pnpm run serve/i);
});

test('AI reviewer workflow keeps the existing reviewer CI workflow separate', () => {
  const existingWorkflow = readFileSync(resolve(repositoryRoot, '.github/workflows/reviewer.yml'), 'utf8');
  assert.match(existingWorkflow, /name: Reviewer/);
  assert.match(existingWorkflow, /runs-on: ubuntu-latest/);
  assert.match(existingWorkflow, /pnpm test/);
});
