import type { ReviewResult } from './types.js';
import type { ReviewPreview } from './github.js';

export const SUMMARY_START = '<!-- BlackBox pull request summary starts here -->';
export const SUMMARY_END = '<!-- BlackBox pull request summary ends here -->';
const REVIEWED_HEAD_PREFIX = '<!-- BlackBox reviewed-head: ';

export interface MergeabilityAssessment {
  readonly score: number;
  readonly label: 'Ready for merge review' | 'Needs changes' | 'Blocked';
  readonly reasons: readonly string[];
}

/**
 * The score is application-owned and advisory. The automatic merge gate still
 * requires a clean review, complete coverage, green CI, and an exact head.
 */
export function assessMergeability(result: ReviewResult): MergeabilityAssessment {
  if (result.outcome !== 'completed_clean' && result.outcome !== 'completed_findings') {
    return { score: 0, label: 'Blocked', reasons: ['The review did not finish.'] };
  }

  let score = 100;
  const reasons: string[] = [];
  if (!result.coverage.complete) {
    score -= 25;
    reasons.push('Some files could not be fully checked.');
  }
  for (const finding of result.findings) {
    const penalty = finding.candidate.severity === 'critical' ? 40
      : finding.candidate.severity === 'high' ? 25
        : finding.candidate.severity === 'medium' ? 12 : 4;
    score -= penalty;
  }
  if (result.findings.length > 0) {
    reasons.push(`${result.findings.length} inline issue${result.findings.length === 1 ? '' : 's'} need attention.`);
  } else {
    reasons.push('No supported issues were found.');
  }
  score = Math.max(0, Math.min(100, score));
  const label = result.outcome === 'completed_clean' && result.findings.length === 0 && result.coverage.complete
    ? 'Ready for merge review'
    : score >= 70 ? 'Needs changes' : 'Blocked';
  return { score, label, reasons };
}

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
  const assessment = assessMergeability(result);
  const verdict = result.outcome === 'completed_findings' ? 'Changes need attention' : result.outcome === 'completed_clean' ? 'No supported issues found' : 'Review incomplete';
  return ['## BB AI review', '', `Result: ${verdict}.`, `Mergeability: ${assessment.score}/100 — ${assessment.label}.`, `Why: ${assessment.reasons.join(' ')}`, `Findings: ${result.findings.length === 0 ? 'None.' : `${result.findings.length} inline issue(s).`}`, `Coverage: ${result.coverage.complete ? 'Complete.' : 'Partial.'}`, 'Written by: BB AI.', result.error ? `Status: ${result.error}` : ''].filter(Boolean).join('\n');
}

function commentBody(finding: ReviewResult['findings'][number]): string {
  const candidate = finding.candidate;
  const additionalLocations = [...new Set(candidate.evidence.map((evidence) => `${evidence.path}:${evidence.start}`).filter((location) => !location.startsWith(`${candidate.causalChangeRef[0]?.path ?? ''}:${candidate.causalChangeRef[0]?.start ?? -1}`)))];
  return [`**${capitalize(candidate.severity)} severity · ${candidate.category}**`, '', `**Finding:** ${candidate.title}`, '', `**Impact:** ${candidate.impact}`, '', `**Why this matters:** ${candidate.actual}. Expected: ${candidate.expected}.`, '', `**Additional locations:** ${additionalLocations.join(', ') || 'None identified.'}`, '', `**Verification:** ${finding.verification.reason}`, '', `<!-- BlackBox finding: ${finding.findingId} -->`].join('\n');
}

function capitalize(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1); }

export function mergeSummaryBody(existing: string | null, result: ReviewResult): string {
  const body = existing ?? '';
  const start = body.indexOf(SUMMARY_START);
  const end = body.indexOf(SUMMARY_END);
  if ((start >= 0) !== (end >= 0) || (start >= 0 && end < start)) throw new Error('PR description has an invalid BlackBox summary marker pair');
  const block = `${SUMMARY_START}\n> [!NOTE]\n> ### BB AI review\n>\n> ${summaryLines(result).join('\n> ')}\n>\n> ${REVIEWED_HEAD_PREFIX}${result.snapshot.headSha ?? result.snapshot.id} -->\n${SUMMARY_END}`;
  if (start < 0) return body.trimEnd() ? `${body.trimEnd()}\n\n${block}\n` : `${block}\n`;
  return `${body.slice(0, start)}${block}${body.slice(end + SUMMARY_END.length)}`;
}

export function summaryCoversHead(body: string | null, headSha: string): boolean {
  if (!body) return false;
  const start = body.indexOf(SUMMARY_START);
  const end = body.indexOf(SUMMARY_END);
  return start >= 0 && end > start && body.slice(start, end).includes(`${REVIEWED_HEAD_PREFIX}${headSha} -->`);
}

function summaryLines(result: ReviewResult): string[] {
  const assessment = assessMergeability(result);
  const verdict = result.outcome === 'completed_findings' ? 'Changes need attention' : result.outcome === 'completed_clean' ? 'No supported issues found' : 'Review incomplete';
  const findings = result.findings.length === 0 ? 'Findings: None.' : `Findings: ${result.findings.length} inline issue${result.findings.length === 1 ? '' : 's'} need attention.`;
  const nextStep = result.outcome === 'completed_clean' && result.coverage.complete ? 'Next step: Review CI, then merge when ready.' : result.findings.length > 0 ? 'Next step: Fix the inline issues and push a new commit.' : 'Next step: Run the review again after the missing checks are available.';
  return [`Result: ${verdict}.`, `Mergeability: ${assessment.score}/100 — ${assessment.label}.`, `Why: ${assessment.reasons.join(' ')}`, findings, `Coverage: ${result.coverage.complete ? 'Complete.' : 'Partial. Some files could not be fully checked.'}`, nextStep, 'Written by: BB AI.'];
}
