import { sha256 } from './hash.js';
import type { RedactionResult, SecretFinding, SourceFile } from './types.js';

const rules: readonly [string, RegExp][] = [
  ['private_key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['github_token', /(?:ghp_|gho_|github_pat_)[A-Za-z0-9_]{20,}/g],
  ['openai_like_key', /\bsk-[A-Za-z0-9_-]{16,}\b/g],
  ['aws_access_key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['assignment_secret', /\b(?:LUNA_API_KEY|SPAN_API_KEY|OPENAI_API_KEY|TOKENROUTER_API_KEY|GITHUB_TOKEN)\s*=\s*([^\s#]+)/g],
];

export function scanAndRedact(files: readonly SourceFile[]): RedactionResult {
  const findings: SecretFinding[] = [];
  const redacted = files.map((file) => {
    if (file.binary) return file;
    let content = file.content;
    for (const [rule, pattern] of rules) {
      pattern.lastIndex = 0;
      content = content.replace(pattern, (...args: unknown[]) => {
        const match = args[0];
        const capturedValue = rule === 'assignment_secret' && typeof args[1] === 'string' ? args[1] : undefined;
        const offset = args.at(-2);
        const whole = args.at(-1);
        if (typeof match !== 'string' || typeof offset !== 'number' || typeof whole !== 'string') return '';
        const value = capturedValue ?? match;
        if (value.length < 12 && rule !== 'private_key') return match;
        const line = whole.slice(0, offset).split('\n').length;
        findings.push({ kind: 'secret', path: file.path, line, rule, redacted: sha256(value).slice(0, 12) });
        if (capturedValue !== undefined) return match.replace(capturedValue, '<REDACTED>');
        return '<REDACTED_SECRET>';
      });
    }
    return { ...file, content };
  });
  return { files: redacted, findings, scannerVersion: 'local-regex-1', packetSha256: sha256(redacted.map((file) => `${file.path}\0${file.content}`).join('\0')) };
}
