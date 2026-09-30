import type { ReviewResult } from './types.js';
import type { ReviewPreview } from './github.js';

export const SUMMARY_START = '<!-- BlackBox pull request summary starts here -->';
export const SUMMARY_END = '<!-- BlackBox pull request summary ends here -->';

export function buildReviewPreview(result: ReviewResult, changedLines?: ReadonlyMap<string, ReadonlySet<number>>): ReviewPreview {
  const head = result.snapshot.headSha;
  if (!head) throw new Error('local working-tree and staged reviews cannot produce GitHub anchors');
  const comments = result.findings.flatMap((finding) => {
    const ref = finding.candidate.evidence.find((evidence) => evidence.side === 'RIGHT' && result.snapshot.changedPaths.includes(evidence.path));
    if (!ref) return [];
    const allowedLines = changedLines?.get(ref.path);
    if (allowedLines && !allowedLines.has(ref.start)) return [];
    return [{ path: ref.path, line: ref.start, side: ref.side, body: commentBody(finding) }];
  });
  return { commit_id: head, event: 'COMMENT', body: summaryBody(result), comments };
}

function summaryBody(result: ReviewResult): string {
  const headline = result.outcome === 'completed_findings' ? 'Review completed with findings' : result.outcome === 'completed_clean' ? 'Review completed with no supported findings' : 'Review incomplete';
  return [`## ${headline}`, '', `Revision: \`${result.snapshot.headSha ?? result.snapshot.id}\``, `Coverage: ${result.coverage.complete ? 'complete' : 'partial'}`, `Attempts: ${result.attempts}`, `Estimated cost: $${result.estimatedCostUsd.toFixed(6)}`, result.error ? `Status: ${result.error}` : ''].filter(Boolean).join('\n');
}

function commentBody(finding: ReviewResult['findings'][number]): string {
  const candidate = finding.candidate;
  const additionalLocations = [...new Set(candidate.evidence.map((evidence) => `${evidence.path}:${evidence.start}`).filter((location) => !location.startsWith(`${candidate.causalChangeRef[0]?.path ?? ''}:${candidate.causalChangeRef[0]?.start ?? -1}`)))];
  return [`**${capitalize(candidate.severity)} severity · ${candidate.category}**`, '', `**Finding:** ${candidate.title}`, '', `**Impact:** ${candidate.impact}`, '', `**Why this matters:** ${candidate.actual}. Expected: ${candidate.expected}.`, '', `**Reviewed by:** ${capitalize(candidate.category)} specialist and skeptical verifier.`, `**Additional locations:** ${additionalLocations.join(', ') || 'None identified.'}`, '', `**Verification:** ${finding.verification.reason}`, '', `<!-- BlackBox finding: ${finding.findingId} -->`].join('\n');
}

function capitalize(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1); }

export function mergeSummaryBody(existing: string | null, result: ReviewResult): string {
  const body = existing ?? '';
  const start = body.indexOf(SUMMARY_START);
  const end = body.indexOf(SUMMARY_END);
  if ((start >= 0) !== (end >= 0) || (start >= 0 && end < start)) throw new Error('PR description has an invalid BlackBox summary marker pair');
  const block = `${SUMMARY_START}\n> [!NOTE]\n> ### Black Box AI review\n>\n> ${summaryLines(result).join('\n> ')}\n${SUMMARY_END}`;
  if (start < 0) return body.trimEnd() ? `${body.trimEnd()}\n\n${block}\n` : `${block}\n`;
  return `${body.slice(0, start)}${block}${body.slice(end + SUMMARY_END.length)}`;
}

export function summaryCoversHead(body: string | null, headSha: string): boolean {
  if (!body) return false;
  const start = body.indexOf(SUMMARY_START);
  const end = body.indexOf(SUMMARY_END);
  return start >= 0 && end > start && body.slice(start, end).includes(`Revision: \`${headSha}\``);
}

function summaryLines(result: ReviewResult): string[] {
  const verdict = result.outcome === 'completed_findings' ? 'Findings require review' : result.outcome === 'completed_clean' ? 'No supported findings' : 'Review incomplete';
  const findings = result.findings.length === 0 ? 'No validated inline findings.' : `${result.findings.length} validated inline finding(s).`;
  const changed = result.snapshot.changedPaths.slice(0, 8).join(', ');
  const titles = result.findings.slice(0, 5).map((finding) => finding.candidate.title).join('; ');
  return [`Verdict: ${verdict}.`, `Revision: \`${result.snapshot.headSha ?? result.snapshot.id}\`.`, `Changed files: ${changed || 'none reported'}.`, `Coverage: ${result.coverage.complete ? 'complete' : 'partial'}.`, findings, titles ? `Validated findings: ${titles}` : 'Validated findings: none.', `Model attempts: ${result.attempts}; estimated cost: $${result.estimatedCostUsd.toFixed(6)}.`, 'This review was written by AI and published by BB CoPilot Bot.'];
}
