import { id } from './hash.js';
import type { Candidate, ContextPacket, ProviderAdapter, ProviderRequest, ProviderResponse, ProviderRoute, Verification } from './types.js';

export const OPENAI_ROUTE: ProviderRoute = {
  profile: 'economy_cloud_luna_v1', provider: 'openai', modelId: 'gpt-6-luna', baseUrl: 'https://api.openai.com/v1', apiFormat: 'responses', reasoning: 'medium', structuredOutput: 'json_schema', toolMode: 'server_built_packet', inputPricePerMillion: 0.1, outputPricePerMillion: 0.5,
};

export const TOKENROUTER_ROUTE: ProviderRoute = {
  profile: 'economy_cloud_tokenrouter_luna_v1', provider: 'tokenrouter', modelId: 'openai/gpt-6-luna', baseUrl: 'https://tokenrouter.ai/api/v1', apiFormat: 'responses', reasoning: 'medium', structuredOutput: 'json_schema', toolMode: 'server_built_packet', inputPricePerMillion: 0.1, outputPricePerMillion: 0.5,
};

export class FakeProvider implements ProviderAdapter {
  readonly route = OPENAI_ROUTE;
  readonly requests: ProviderRequest[] = [];
  readonly responses: ProviderResponse[];
  constructor(responses: readonly ProviderResponse[] = []) { this.responses = [...responses]; }
  async review(request: ProviderRequest): Promise<ProviderResponse> {
    this.requests.push(request);
    return this.responses.shift() ?? defaultResponse(request);
  }
}

export class ResponsesProvider implements ProviderAdapter {
  readonly route: ProviderRoute;
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;
  constructor(route: ProviderRoute, apiKey: string, fetcher: typeof fetch = fetch) { this.route = route; this.#apiKey = apiKey; this.#fetch = fetcher; }
  async review(request: ProviderRequest): Promise<ProviderResponse> {
    const response = await this.#fetch(`${this.route.baseUrl}/responses`, {
      method: 'POST',
      signal: AbortSignal.timeout(180_000),
      headers: { authorization: `Bearer ${this.#apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: this.route.modelId, reasoning: { effort: this.route.reasoning }, max_output_tokens: request.maxOutputTokens, input: promptFor(request), text: { format: { type: 'json_schema', name: 'review_result', strict: true, schema: schemaFor(request.role) } } }),
    });
    const raw: unknown = await response.json();
    if (!response.ok) throw new Error(`provider returned HTTP ${response.status}`);
    return parseProviderResponse(raw, request);
  }
}

function promptFor(request: ProviderRequest): string {
  const packet = request.packet.files.map((file) => `FILE ${file.path}\n${file.content}`).join('\n\n');
  if (request.role === 'verifier') return `Verify only the supplied candidates. Do not invent new findings. Snapshot ${request.snapshotId}.\nCandidates:\n${JSON.stringify(request.candidates ?? [])}\nEvidence:\n${packet}`;
  const question = request.role === 'security' ? 'Find a concrete introduced or worsened security defect.' : 'Find a concrete introduced or worsened behavioral defect.';
  return `${question} Return only structured data. Snapshot ${request.snapshotId}.\nEvidence:\n${packet}`;
}

function schemaFor(role: ProviderRequest['role']): Record<string, unknown> {
  const evidence = {
    type: 'array',
    items: {
      type: 'object', additionalProperties: false,
      required: ['path', 'sha256', 'start', 'end', 'side', 'reason'],
      properties: {
        path: { type: 'string' }, sha256: { type: 'string' },
        start: { type: 'integer', minimum: 1 }, end: { type: 'integer', minimum: 1 },
        side: { enum: ['LEFT', 'RIGHT'] }, reason: { type: 'string' },
      },
    },
  };
  if (role === 'verifier') return {
    type: 'object', additionalProperties: false, required: ['verifications'],
    properties: {
      verifications: {
        type: 'array', items: {
          type: 'object', additionalProperties: false,
          required: ['candidateId', 'decision', 'evidenceChecked', 'causalLink', 'verificationKind', 'reason', 'uncertainty'],
          properties: {
            candidateId: { type: 'string' }, decision: { enum: ['supported', 'rejected', 'needs_more_context', 'requires_runtime_validation'] },
            evidenceChecked: { type: 'array', items: { type: 'string' } }, causalLink: { enum: ['introduced', 'worsened', 'pre_existing', 'uncertain'] },
            verificationKind: { enum: ['model_assessment', 'deterministic_analysis'] }, reason: { type: 'string' }, uncertainty: { type: 'string' },
          },
        },
      },
    },
  };
  return {
    type: 'object', additionalProperties: false, required: ['candidates'],
    properties: {
      candidates: {
        type: 'array', maxItems: 6, items: {
          type: 'object', additionalProperties: false,
          required: ['candidateId', 'category', 'severity', 'title', 'trigger', 'expected', 'actual', 'impact', 'changeRelevance', 'causalChangeRef', 'evidence', 'verificationKind', 'status'],
          properties: {
            candidateId: { type: 'string' }, category: { enum: ['correctness', 'security', 'performance', 'reliability', 'tests', 'policy'] }, severity: { enum: ['low', 'medium', 'high', 'critical'] },
            title: { type: 'string' }, trigger: { type: 'string' }, expected: { type: 'string' }, actual: { type: 'string' }, impact: { type: 'string' },
            changeRelevance: { enum: ['introduced', 'worsened', 'pre_existing', 'uncertain'] }, causalChangeRef: evidence, evidence,
            verificationKind: { enum: ['model_assessment', 'deterministic_analysis'] }, status: { enum: ['candidate'] },
          },
        },
      },
    },
  };
}

function parseProviderResponse(raw: unknown, request: ProviderRequest): ProviderResponse {
  const root = asRecord(raw);
  const output = typeof root.output_text === 'string' ? root.output_text : findOutputText(root.output);
  if (!output) throw new Error('provider response did not contain output text');
  const parsed: unknown = JSON.parse(output);
  const usage = asRecord(root.usage);
  const inputTokens = integer(usage.input_tokens);
  const outputTokens = integer(usage.output_tokens);
  if (request.role === 'verifier') return { verifications: parseVerifications(parsed), inputTokens, outputTokens, rawStatus: 'ok' };
  return { candidates: parseCandidates(parsed), inputTokens, outputTokens, rawStatus: 'ok' };
}

function defaultResponse(request: ProviderRequest): ProviderResponse {
  if (request.role === 'verifier') return { verifications: (request.candidates ?? []).map((candidate) => ({ candidateId: candidate.candidateId, decision: 'rejected', evidenceChecked: candidate.evidence.map((ref) => ref.path), causalLink: candidate.changeRelevance, verificationKind: 'model_assessment', reason: 'fake verifier default', uncertainty: 'test-only' })), inputTokens: 0, outputTokens: 0, rawStatus: 'ok' };
  return { candidates: [], inputTokens: 0, outputTokens: 0, rawStatus: 'ok' };
}

function parseCandidates(value: unknown): Candidate[] { const candidates = asRecord(value).candidates; if (!Array.isArray(candidates)) throw new Error('provider candidates missing'); return candidates.map((item) => validateCandidate(item)); }
function parseVerifications(value: unknown): Verification[] { const verifications = asRecord(value).verifications; if (!Array.isArray(verifications)) throw new Error('provider verifications missing'); return verifications.map((item) => validateVerification(item)); }

function validateCandidate(value: unknown): Candidate {
  const row = asRecord(value);
  const evidence = parseEvidence(row.evidence);
  const causal = parseEvidence(row.causalChangeRef);
  const kind = string(row.verificationKind);
  if (kind !== 'model_assessment' && kind !== 'deterministic_analysis') throw new Error('provider cannot claim runtime evidence');
  return { candidateId: string(row.candidateId) || id('cand', JSON.stringify(value)), category: enumValue(row.category, ['correctness', 'security', 'performance', 'reliability', 'tests', 'policy']), severity: enumValue(row.severity, ['low', 'medium', 'high', 'critical']), title: string(row.title), trigger: string(row.trigger), expected: string(row.expected), actual: string(row.actual), impact: string(row.impact), changeRelevance: enumValue(row.changeRelevance, ['introduced', 'worsened', 'pre_existing', 'uncertain']), causalChangeRef: causal, evidence, verificationKind: kind, status: 'candidate' };
}

function validateVerification(value: unknown): Verification {
  const row = asRecord(value);
  const kind = string(row.verificationKind);
  if (kind !== 'model_assessment' && kind !== 'deterministic_analysis') throw new Error('provider cannot claim runtime evidence');
  return { candidateId: string(row.candidateId), decision: enumValue(row.decision, ['supported', 'rejected', 'needs_more_context', 'requires_runtime_validation']), evidenceChecked: strings(row.evidenceChecked), causalLink: enumValue(row.causalLink, ['introduced', 'worsened', 'pre_existing', 'uncertain']), verificationKind: kind, reason: string(row.reason), uncertainty: string(row.uncertainty) };
}

function parseEvidence(value: unknown): Candidate['evidence'] { if (!Array.isArray(value)) return []; return value.map((item) => { const row = asRecord(item); return { path: string(row.path), sha256: string(row.sha256), start: integer(row.start), end: integer(row.end), side: enumValue(row.side, ['LEFT', 'RIGHT']), reason: string(row.reason) }; }); }
function findOutputText(value: unknown): string | undefined { if (!Array.isArray(value)) return undefined; for (const item of value) { const row = asRecord(item); if (typeof row.text === 'string') return row.text; const nested = findOutputText(row.content); if (nested) return nested; } return undefined; }
function asRecord(value: unknown): Record<string, unknown> { if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('provider response must be an object'); return value as Record<string, unknown>; }
function string(value: unknown): string { if (typeof value !== 'string') throw new Error('provider field must be a string'); return value; }
function integer(value: unknown): number { if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error('provider usage field must be a non-negative integer'); return Number(value); }
function strings(value: unknown): string[] { if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) throw new Error('provider field must be a string array'); return value; }
function enumValue<T extends string>(value: unknown, values: readonly T[]): T { if (typeof value !== 'string' || !values.includes(value as T)) throw new Error(`provider enum value invalid: ${String(value)}`); return value as T; }
