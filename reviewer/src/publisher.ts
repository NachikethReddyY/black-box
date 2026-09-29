import type { ReviewResult } from './types.js';
import type { ReviewPreview } from './github.js';

export function buildReviewPreview(result: ReviewResult): ReviewPreview {
  const head = result.snapshot.headSha;
  if (!head) throw new Error('local working-tree and staged reviews cannot produce GitHub anchors');
  const comments = result.findings.flatMap((finding) => {
    const ref = finding.candidate.evidence.find((evidence) => evidence.side === 'RIGHT' && result.snapshot.changedPaths.includes(evidence.path));
    if (!ref) return [];
    return [{ path: ref.path, line: ref.start, side: ref.side, body: commentBody(finding.candidate.title, finding.candidate.impact, finding.verification.reason) }];
  });
  return { commit_id: head, event: 'COMMENT', body: summaryBody(result), comments };
}

function summaryBody(result: ReviewResult): string {
  const headline = result.outcome === 'completed_findings' ? 'Review completed with findings' : result.outcome === 'completed_clean' ? 'Review completed with no supported findings' : 'Review incomplete';
  return [`## ${headline}`, '', `Revision: \`${result.snapshot.headSha ?? result.snapshot.id}\``, `Coverage: ${result.coverage.complete ? 'complete' : 'partial'}`, `Attempts: ${result.attempts}`, `Estimated cost: $${result.estimatedCostUsd.toFixed(6)}`, result.error ? `Status: ${result.error}` : ''].filter(Boolean).join('\n');
}

function commentBody(title: string, impact: string, verification: string): string {
  return `**Finding:** ${title}\n\n**Impact:** ${impact}\n\n**Verification:** ${verification}\n\n<!-- BlackBox finding: preview-only -->`;
}
