import ts from 'typescript';
import { sha256 } from './hash.js';
import { scanAndRedact } from './secrets.js';
import type { ContextPacket, EvidenceRef, RedactionResult, Snapshot, SourceFile, SymbolRecord } from './types.js';

export function buildContext(snapshot: Snapshot, maxPacketBytes: number): { packet: ContextPacket; redaction: RedactionResult } {
  const selected = selectFiles(snapshot);
  const redaction = scanAndRedact(selected);
  const symbols = redaction.files.flatMap(parseSymbols);
  const evidence = redaction.files.flatMap((file) => {
    if (!snapshot.changedPaths.includes(file.path) || file.binary) return [];
    return [{ path: file.path, sha256: file.sha256, start: 1, end: Math.max(1, file.content.split('\n').length), side: 'RIGHT' as const, reason: 'changed-file context' }];
  });
  let files = redaction.files;
  let packet = makePacket(files, symbols, evidence, redaction.findings, snapshot);
  while (Buffer.byteLength(JSON.stringify(packet), 'utf8') > maxPacketBytes && files.length > 1) {
    files = files.slice(0, -1);
    packet = makePacket(files, symbols.filter((symbol) => files.some((file) => file.path === symbol.path)), evidence.filter((ref) => files.some((file) => file.path === ref.path)), redaction.findings.filter((finding) => files.some((file) => file.path === finding.path)), snapshot);
  }
  return { packet, redaction: { ...redaction, files } };
}

function selectFiles(snapshot: Snapshot): SourceFile[] {
  const changed = new Set(snapshot.changedPaths);
  const changedBasenames = new Set(snapshot.changedPaths.map((path) => path.replace(/\.(?:tsx?|jsx?)$/, '').split('/').pop()));
  return snapshot.files.filter((file) => {
    if (file.binary || file.bytes > 1_048_576) return false;
    if (changed.has(file.path)) return true;
    const lower = file.path.toLowerCase();
    if (/(^|\/)(test|tests|__tests__|spec)(\/|$)/.test(lower)) return changedBasenames.has(file.path.replace(/\.(?:tsx?|jsx?)$/, '').split('/').pop());
    return false;
  });
}

function parseSymbols(file: SourceFile): SymbolRecord[] {
  if (file.binary || !/\.(?:[cm]?tsx?|jsx?)$/.test(file.path)) return [];
  const kind = file.path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, kind);
  const records: SymbolRecord[] = [];
  const add = (name: string, type: SymbolRecord['kind'], node: ts.Node) => {
    const start = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    const end = source.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
    records.push({ name, kind: type, path: file.path, start, end });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name) add(node.name.text, 'function', node);
    else if (ts.isClassDeclaration(node) && node.name) add(node.name.text, 'class', node);
    else if (ts.isInterfaceDeclaration(node)) add(node.name.text, 'interface', node);
    else if (ts.isTypeAliasDeclaration(node)) add(node.name.text, 'type', node);
    else if (ts.isVariableStatement(node)) { for (const declaration of node.declarationList.declarations) if (ts.isIdentifier(declaration.name)) add(declaration.name.text, 'variable', node); }
    else if (ts.isImportDeclaration(node)) add(node.moduleSpecifier.getText(source), 'import', node);
    else if (ts.isExportDeclaration(node)) add(node.moduleSpecifier?.getText(source) ?? '*', 'export', node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return records;
}

function makePacket(files: readonly SourceFile[], symbols: readonly SymbolRecord[], evidence: readonly EvidenceRef[], findings: ContextPacket['secretFindings'], snapshot: Snapshot): ContextPacket {
  const selected = new Set(files.map((file) => file.path));
  const omittedPaths = [...new Set([...snapshot.omittedPaths, ...snapshot.files.filter((file) => !selected.has(file.path)).map((file) => file.path)])].sort();
  return { files, symbols, evidence, secretFindings: findings, omittedPaths, snapshotId: snapshot.id };
}

export function packetText(packet: ContextPacket): string {
  return packet.files.map((file) => `FILE ${file.path}\n${file.content}`).join('\n\n');
}

export function packetHash(packet: ContextPacket): string {
  return sha256(JSON.stringify(packet));
}
