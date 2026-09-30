import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ReviewConfig, ReviewResult, ReviewId } from './types.js';

export interface Reservation {
  readonly reservationId: string;
  readonly reviewId: ReviewId;
  readonly maxAttempts: number;
  readonly maxCostCents: number;
  readonly status: 'reserved' | 'reconciled' | 'unknown';
}

export class ReviewStore {
  readonly #db: DatabaseSync;
  readonly dbPath: string;

  constructor(config: ReviewConfig, dbPath?: string) {
    const path = dbPath ?? join(config.dataDir, 'reviewer.sqlite');
    this.dbPath = path;
    mkdirSync(join(path, '..'), { recursive: true });
    this.#db = new DatabaseSync(path);
    this.#db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS reviews (
        review_id TEXT PRIMARY KEY,
        snapshot_id TEXT NOT NULL,
        profile TEXT NOT NULL,
        outcome TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reservations (
        reservation_id TEXT PRIMARY KEY,
        review_id TEXT NOT NULL,
        max_attempts INTEGER NOT NULL,
        max_cost_cents INTEGER NOT NULL,
        status TEXT NOT NULL,
        used_attempts INTEGER NOT NULL DEFAULT 0,
        used_cost_cents INTEGER NOT NULL DEFAULT 0,
        lease_generation INTEGER NOT NULL DEFAULT 1,
        UNIQUE(review_id)
      );
      CREATE TABLE IF NOT EXISTS attempts (
        attempt_id TEXT PRIMARY KEY,
        review_id TEXT NOT NULL,
        role TEXT NOT NULL,
        request_id TEXT NOT NULL,
        status TEXT NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        cost_cents INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS outbox (
        outbox_id TEXT PRIMARY KEY,
        review_id TEXT NOT NULL,
        reviewed_head TEXT,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS automatic_heads (
        head_key TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        pull_number INTEGER NOT NULL,
        head_sha TEXT NOT NULL,
        status TEXT NOT NULL,
        review_id TEXT,
        lease_until INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  reserve(reviewId: ReviewId, maxAttempts: number, maxCostCents: number): Reservation {
    const reservationId = `res_${reviewId}`;
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.#db.prepare('SELECT reservation_id, review_id, max_attempts, max_cost_cents, status FROM reservations WHERE review_id = ?').get(reviewId) as Reservation | undefined;
      if (existing) { this.#db.exec('COMMIT'); return existing; }
      this.#db.prepare('INSERT INTO reservations (reservation_id, review_id, max_attempts, max_cost_cents, status) VALUES (?, ?, ?, ?, ?)').run(reservationId, reviewId, maxAttempts, maxCostCents, 'reserved');
      this.#db.exec('COMMIT');
      return { reservationId, reviewId, maxAttempts, maxCostCents, status: 'reserved' };
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  recordAttempt(reviewId: ReviewId, role: string, requestId: string, status: string, inputTokens: number, outputTokens: number, costCents: number): void {
    const attemptId = `${reviewId}:${requestId}`;
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.#db.prepare('SELECT used_attempts, used_cost_cents, lease_generation, max_attempts, max_cost_cents FROM reservations WHERE review_id = ?').get(reviewId) as { used_attempts: number; used_cost_cents: number; lease_generation: number; max_attempts: number; max_cost_cents: number } | undefined;
      if (!row || row.used_attempts >= row.max_attempts) throw new Error('provider attempt exceeds reservation');
      if (this.#db.prepare('SELECT 1 FROM attempts WHERE attempt_id = ?').get(attemptId)) { this.#db.exec('COMMIT'); return; }
      if (row.used_cost_cents + costCents > row.max_cost_cents) throw new Error('provider attempt exceeds cost reservation');
      this.#db.prepare('INSERT INTO attempts (attempt_id, review_id, role, request_id, status, input_tokens, output_tokens, cost_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(attemptId, reviewId, role, requestId, status, inputTokens, outputTokens, costCents, new Date().toISOString());
      this.#db.prepare('UPDATE reservations SET used_attempts = used_attempts + 1, used_cost_cents = used_cost_cents + ? WHERE review_id = ? AND lease_generation = ?').run(costCents, reviewId, row.lease_generation);
      this.#db.exec('COMMIT');
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  checkpoint(): void { this.#db.exec('PRAGMA wal_checkpoint(FULL)'); }

  saveResult(result: ReviewResult): void {
    this.#db.prepare('INSERT OR REPLACE INTO reviews (review_id, snapshot_id, profile, outcome, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(result.reviewId, result.snapshot.id, result.profile, result.outcome, JSON.stringify(result), new Date().toISOString());
  }

  queuePublication(reviewId: ReviewId, reviewedHead: string | null, payload: unknown): void {
    this.#db.prepare('INSERT OR REPLACE INTO outbox (outbox_id, review_id, reviewed_head, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(`out_${reviewId}`, reviewId, reviewedHead, JSON.stringify(payload), 'preview', new Date().toISOString());
  }

  markPublication(reviewId: ReviewId, status: 'published' | 'not_published' | 'unknown'): void {
    this.#db.prepare('UPDATE outbox SET status = ? WHERE review_id = ?').run(status, reviewId);
  }

  getReview(reviewId: string): ReviewResult | undefined {
    const row = this.#db.prepare('SELECT payload_json FROM reviews WHERE review_id = ?').get(reviewId) as { payload_json: string } | undefined;
    return row ? JSON.parse(row.payload_json) as ReviewResult : undefined;
  }

  hasSnapshot(snapshotId: string): boolean {
    const row = this.#db.prepare('SELECT 1 FROM reviews WHERE snapshot_id = ? LIMIT 1').get(snapshotId);
    return row !== undefined;
  }

  claimAutomaticHead(owner: string, repo: string, pullNumber: number, headSha: string, leaseMs: number, now = Date.now()): boolean {
    const headKey = `${owner}/${repo}#${pullNumber}@${headSha}`;
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.#db.prepare('SELECT status, lease_until FROM automatic_heads WHERE head_key = ?').get(headKey) as { status: string; lease_until: number } | undefined;
      if (existing?.status === 'completed' || (existing?.status === 'processing' && existing.lease_until > now) || (existing?.status === 'failed' && existing.lease_until > now)) {
        this.#db.exec('COMMIT');
        return false;
      }
      this.#db.prepare(`INSERT INTO automatic_heads (head_key, owner, repo, pull_number, head_sha, status, review_id, lease_until, updated_at)
        VALUES (?, ?, ?, ?, ?, 'processing', NULL, ?, ?)
        ON CONFLICT(head_key) DO UPDATE SET status = 'processing', lease_until = excluded.lease_until, updated_at = excluded.updated_at`).run(headKey, owner, repo, pullNumber, headSha, now + leaseMs, new Date(now).toISOString());
      this.#db.exec('COMMIT');
      return true;
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  completeAutomaticHead(owner: string, repo: string, pullNumber: number, headSha: string, status: 'completed' | 'failed', reviewId?: string, retryAfterMs = 900_000, now = Date.now()): void {
    const headKey = `${owner}/${repo}#${pullNumber}@${headSha}`;
    this.#db.prepare('UPDATE automatic_heads SET status = ?, review_id = ?, lease_until = ?, updated_at = ? WHERE head_key = ?').run(status, reviewId ?? null, status === 'completed' ? Number.MAX_SAFE_INTEGER : now + retryAfterMs, new Date(now).toISOString(), headKey);
  }

  listReviews(): readonly { reviewId: string; snapshotId: string; profile: string; outcome: string; createdAt: string }[] {
    const rows = this.#db.prepare('SELECT review_id, snapshot_id, profile, outcome, created_at FROM reviews ORDER BY created_at DESC').all() as { review_id: string; snapshot_id: string; profile: string; outcome: string; created_at: string }[];
    return rows.map((row) => ({ reviewId: row.review_id, snapshotId: row.snapshot_id, profile: row.profile, outcome: row.outcome, createdAt: row.created_at }));
  }

  integrityCheck(): string {
    const row = this.#db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    return row.integrity_check;
  }

  close(): void { this.#db.close(); }
}
