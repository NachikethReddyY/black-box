import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReviewResult } from './types.js';

export function reportJson(result: ReviewResult): string { return `${JSON.stringify(result, null, 2)}\n`; }

export function reportMarkdown(result: ReviewResult): string {
  const lines = [`# Review ${result.reviewId}`, '', `- Outcome: **${result.outcome}**`, `- Profile: \`${result.profile}\``, `- Snapshot: \`${result.snapshot.id}\``, `- Mode: \`${result.snapshot.mode}\``, `- Coverage: ${result.coverage.complete ? 'complete' : 'partial'}`, ''];
  if (result.error) lines.push(`## Status\n\n${result.error}\n`);
  lines.push(`## Findings\n`);
  if (result.findings.length === 0) lines.push('No verified findings were published.\n');
  for (const finding of result.findings) lines.push(`### ${finding.candidate.severity}: ${finding.candidate.title}\n\n- Category: ${finding.candidate.category}\n- Relevance: ${finding.candidate.changeRelevance}\n- Evidence: ${finding.candidate.evidence.map((ref) => `${ref.path}:${ref.start}`).join(', ') || 'none'}\n- Verification: ${finding.verification.reason}\n`);
  if (result.secretFindings.length > 0) lines.push(`## Local secret scan\n\n${result.secretFindings.length} potential secret(s) detected locally. Values are omitted from this report.\n`);
  if (result.coverage.omittedPaths.length > 0) lines.push(`## Omitted scope\n\n${result.coverage.omittedPaths.map((path) => `- ${path}`).join('\n')}\n`);
  return lines.join('\n');
}

export function writeReports(result: ReviewResult, directory: string): { jsonPath: string; markdownPath: string } {
  mkdirSync(directory, { recursive: true });
  const jsonPath = join(directory, 'review.json');
  const markdownPath = join(directory, 'review.md');
  writeFileSync(jsonPath, reportJson(result), { mode: 0o600 });
  writeFileSync(markdownPath, reportMarkdown(result), { mode: 0o600 });
  return { jsonPath, markdownPath };
}
