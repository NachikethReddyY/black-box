import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'blackbox-reviewer-'));
  run(root, ['init', '-q']);
  run(root, ['config', 'user.email', 'reviewer@test.invalid']);
  run(root, ['config', 'user.name', 'Reviewer Test']);
  writeFileSync(join(root, 'index.ts'), 'export function value(): number { return 1; }\n');
  mkdirSync(join(root, 'tests'), { recursive: true });
  writeFileSync(join(root, 'tests', 'index.test.ts'), 'import { value } from "../index";\nvalue();\n');
  run(root, ['add', '.']);
  run(root, ['commit', '-qm', 'fixture']);
  return root;
}

export function run(cwd: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' } });
}
