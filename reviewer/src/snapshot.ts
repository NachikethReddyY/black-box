import { lstatSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { git, gitBytes, nulList } from './git.js';
import { id, sha256, stableJson } from './hash.js';
import type { ReviewConfig, Snapshot, SnapshotId, SnapshotMode, SourceFile } from './types.js';

const MAX_FILE_BYTES = 1_048_576;
const MAX_FILES = 5_000;

export function captureSnapshot(config: ReviewConfig, mode: SnapshotMode, ref?: string): Snapshot {
  const root = resolve(config.root);
  const headSha = mode === 'ref' ? git(root, ['rev-parse', '--verify', `${ref ?? 'HEAD'}^{commit}`]).trim() : git(root, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  const baseRef = ref ?? 'HEAD';
  if (mode !== 'ref' && nulList(git(root, ['ls-files', '-u', '-z'])).length > 0) throw new Error('cannot capture a snapshot with unresolved index conflicts');
  const paths = mode === 'ref' ? nulList(git(root, ['ls-tree', '-r', '--name-only', '-z', `${baseRef}`])) : nulList(git(root, ['ls-files', '-co', '--exclude-standard', '-z']));
  if (paths.length > MAX_FILES) throw new Error(`snapshot exceeds ${MAX_FILES} files`);
  const files = paths.map((path) => readSource(root, path, mode, baseRef));
  const changedPaths = mode === 'ref' ? paths : changed(root, mode, paths);
  const omittedPaths = files.filter((file) => file.binary || file.bytes > MAX_FILE_BYTES).map((file) => file.path);
  const manifest = { mode, baseRef, headSha, files: files.map(({ path, sha256: hash, bytes, binary }) => ({ path, sha256: hash, bytes, binary })), changedPaths, omittedPaths };
  const manifestSha256 = sha256(stableJson(manifest));
  const snapshotId = id('snap', `${manifestSha256}:${mode}:${headSha}`) as SnapshotId;
  return { id: snapshotId, mode, root, baseRef, headRef: mode === 'ref' ? baseRef : 'working-tree', headSha: mode === 'ref' ? headSha : null, files, changedPaths, omittedPaths, manifestSha256 };
}

function readSource(root: string, path: string, mode: SnapshotMode, ref: string): SourceFile {
  assertSafeRelativePath(path);
  const absolute = join(root, path);
  let bytes: Buffer;
  if (mode === 'ref') {
    bytes = gitBytes(root, ['show', `${ref}:${path}`]);
  } else if (mode === 'staged') {
    bytes = gitBytes(root, ['show', `:${path}`]);
  } else {
    const before = lstatSync(absolute);
    if (before.isSymbolicLink() || !before.isFile()) throw new Error(`unsupported working-tree path: ${path}`);
    bytes = readFileSync(absolute);
    const after = lstatSync(absolute);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error(`working-tree file changed during capture: ${path}`);
  }
  const binary = bytes.subarray(0, Math.min(bytes.length, 8_192)).includes(0);
  return { path, sha256: sha256(bytes), bytes: bytes.length, binary, content: binary ? '' : bytes.toString('utf8') };
}

function changed(root: string, mode: SnapshotMode, paths: readonly string[]): string[] {
  const diff = mode === 'staged' ? git(root, ['diff', '--cached', '--name-only', '-z', 'HEAD']) : git(root, ['diff', '--name-only', '-z', 'HEAD']);
  const listed = new Set(nulList(diff));
  for (const path of paths) if (!gitTracked(root, path)) listed.add(path);
  return [...listed].sort();
}

function gitTracked(root: string, path: string): boolean {
  try {
    return git(root, ['ls-files', '--error-unmatch', '--', path]).trim() === path;
  } catch {
    return false;
  }
}

function assertSafeRelativePath(path: string): void {
  if (!path || path.includes('\0') || path.startsWith('/') || path.split('/').includes('..') || path.includes('\\')) throw new Error(`unsafe repository path: ${path}`);
}

export function snapshotPath(snapshot: Snapshot, path: string): string {
  assertSafeRelativePath(path);
  const absolute = resolve(snapshot.root, path);
  const root = `${resolve(snapshot.root)}${sep}`;
  if (!absolute.startsWith(root)) throw new Error('snapshot path escaped repository root');
  return absolute;
}
