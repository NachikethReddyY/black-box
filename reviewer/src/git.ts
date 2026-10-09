import { execFileSync } from 'node:child_process';

export function git(root: string, args: readonly string[]): string {
  const safeArgs = ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'diff.external=', '-c', 'diff.submodule=short', ...args];
  return execFileSync('git', safeArgs, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -oBatchMode=yes' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function gitBytes(root: string, args: readonly string[]): Buffer {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'diff.external=', '-c', 'diff.submodule=short', ...args], {
    cwd: root,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -oBatchMode=yes' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function nulList(text: string): string[] {
  return text.split('\0').filter(Boolean);
}
