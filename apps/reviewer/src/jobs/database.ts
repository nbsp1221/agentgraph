import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { type ReviewResult, findingFingerprint } from '../review/result.js';
import type { ManualCommand } from './command.js';

export interface PullRequestJobInput {
  action: string;
  deliveryId: string;
  headSha: string;
  installationId: number;
  policyVersion: string;
  pullRequestNumber: number;
  repository: string;
}

export interface EnqueueResult {
  deliveryAccepted: boolean;
  jobCreated: boolean;
  jobsSuperseded: number;
}

export interface PullRequestCancellationInput {
  action: 'closed' | 'converted_to_draft';
  deliveryId: string;
  headSha: string;
  installationId: number;
  pullRequestNumber: number;
  repository: string;
}

export interface CancellationResult {
  deliveryAccepted: boolean;
  jobsCancelled: number;
}

export interface ReviewJob extends PullRequestJobInput {
  /**
   * Monotonically increasing claim/revival token used to reject stale worker
   * updates. Jobs created before this column existed are assigned zero and
   * receive their first token when claimed.
   */
  attempt?: number;
  checkRunId: number | undefined;
  id: number;
  publishedReviewId: number | undefined;
  resultPath: string | undefined;
  state: string;
}

export interface PullRequestState {
  currentHeadSha: string;
  currentJobId: number;
  statusCommentId: number | undefined;
}

export interface PreviousReview {
  headSha: string;
  resultPaths: string[];
}

export interface ReviewFinding {
  evidence: string;
  file: string;
  fingerprint: string;
  firstSeenJobId: number;
  lastSeenJobId: number;
  line: number;
  state: 'FIXED' | 'OPEN' | 'STILL_PRESENT';
  title: string;
}

export interface LatestJobStatus {
  error: string | undefined;
  headSha: string;
  id: number;
  state: string;
}

export class JobDatabase {
  readonly #database: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    }

    this.#database = new DatabaseSync(path);
    this.#database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        delivery_id TEXT PRIMARY KEY,
        received_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS review_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repository TEXT NOT NULL,
        pull_request_number INTEGER NOT NULL,
        head_sha TEXT NOT NULL,
        policy_version TEXT NOT NULL,
        installation_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        delivery_id TEXT NOT NULL REFERENCES webhook_deliveries(delivery_id),
        state TEXT NOT NULL DEFAULT 'QUEUED',
        attempt INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        check_run_id INTEGER,
        result_path TEXT,
        published_review_id INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(repository, pull_request_number, head_sha, policy_version)
      );

      CREATE TABLE IF NOT EXISTS pull_request_state (
        repository TEXT NOT NULL,
        pull_request_number INTEGER NOT NULL,
        status_comment_id INTEGER,
        current_job_id INTEGER NOT NULL REFERENCES review_jobs(id),
        current_head_sha TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(repository, pull_request_number)
      );

      CREATE TABLE IF NOT EXISTS review_findings (
        repository TEXT NOT NULL,
        pull_request_number INTEGER NOT NULL,
        fingerprint TEXT NOT NULL,
        file TEXT NOT NULL,
        line INTEGER NOT NULL,
        title TEXT NOT NULL,
        evidence TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('OPEN', 'STILL_PRESENT', 'FIXED')),
        first_seen_job_id INTEGER NOT NULL REFERENCES review_jobs(id),
        last_seen_job_id INTEGER NOT NULL REFERENCES review_jobs(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(repository, pull_request_number, fingerprint)
      );

      CREATE TABLE IF NOT EXISTS command_audits (
        delivery_id TEXT PRIMARY KEY,
        repository TEXT NOT NULL,
        pull_request_number INTEGER NOT NULL,
        comment_id INTEGER NOT NULL,
        actor TEXT NOT NULL,
        command TEXT NOT NULL,
        outcome TEXT NOT NULL,
        detail TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    this.#ensureColumn('review_jobs', 'error', 'TEXT');
    this.#ensureColumn('review_jobs', 'attempt', 'INTEGER NOT NULL DEFAULT 0');
    this.#ensureColumn('review_jobs', 'check_run_id', 'INTEGER');
    this.#ensureColumn('review_jobs', 'result_path', 'TEXT');
    this.#ensureColumn('review_jobs', 'published_review_id', 'INTEGER');
    this.#database.exec(`
      UPDATE review_jobs
      SET state = 'QUEUED', updated_at = datetime('now')
      WHERE state IN ('CHECKING_OUT', 'SANDBOX_CREATING', 'REVIEWING', 'VALIDATING', 'PUBLISHING')
    `);
  }

  close(): void {
    this.#database.close();
  }

  enqueuePullRequest(input: PullRequestJobInput): EnqueueResult {
    const now = new Date().toISOString();
    const insertDelivery = this.#database.prepare(`
      INSERT OR IGNORE INTO webhook_deliveries (delivery_id, received_at)
      VALUES (?, ?)
    `);
    const insertJob = this.#database.prepare(`
      INSERT OR IGNORE INTO review_jobs (
        repository,
        pull_request_number,
        head_sha,
        policy_version,
        installation_id,
        action,
        delivery_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const reviveJob = this.#database.prepare(`
      UPDATE review_jobs
      SET installation_id = ?, action = ?, delivery_id = ?, state = 'QUEUED',
          attempt = attempt + 1,
          error = NULL, check_run_id = NULL, result_path = NULL,
          published_review_id = NULL, updated_at = ?
      WHERE repository = ?
        AND pull_request_number = ?
        AND head_sha = ?
        AND policy_version = ?
        AND state IN ('CANCELLED', 'SUPERSEDED')
    `);
    const supersedeOlderQueuedJobs = this.#database.prepare(`
      UPDATE review_jobs
      SET state = 'SUPERSEDED', updated_at = ?
      WHERE repository = ?
        AND pull_request_number = ?
        AND state = 'QUEUED'
        AND NOT (head_sha = ? AND policy_version = ?)
    `);

    this.#database.exec('BEGIN IMMEDIATE');
    try {
      const delivery = insertDelivery.run(input.deliveryId, now);
      if (delivery.changes === 0) {
        this.#database.exec('COMMIT');
        return { deliveryAccepted: false, jobCreated: false, jobsSuperseded: 0 };
      }

      const insertedJob = insertJob.run(
        input.repository,
        input.pullRequestNumber,
        input.headSha,
        input.policyVersion,
        input.installationId,
        input.action,
        input.deliveryId,
        now,
        now,
      );
      const revivedJob =
        insertedJob.changes === 0
          ? reviveJob.run(
              input.installationId,
              input.action,
              input.deliveryId,
              now,
              input.repository,
              input.pullRequestNumber,
              input.headSha,
              input.policyVersion,
            )
          : { changes: 0 };
      const jobCreated = insertedJob.changes === 1 || revivedJob.changes === 1;
      const superseded = jobCreated
        ? supersedeOlderQueuedJobs.run(
            now,
            input.repository,
            input.pullRequestNumber,
            input.headSha,
            input.policyVersion,
          )
        : { changes: 0 };
      this.#database.exec('COMMIT');
      return {
        deliveryAccepted: true,
        jobCreated,
        jobsSuperseded: Number(superseded.changes),
      };
    } catch (error) {
      this.#database.exec('ROLLBACK');
      throw error;
    }
  }

  cancelPullRequest(input: PullRequestCancellationInput): CancellationResult {
    const now = new Date().toISOString();
    const reason =
      input.action === 'closed' ? 'Pull request closed.' : 'Pull request converted to draft.';

    this.#database.exec('BEGIN IMMEDIATE');
    try {
      const delivery = this.#database
        .prepare(`
          INSERT OR IGNORE INTO webhook_deliveries (delivery_id, received_at)
          VALUES (?, ?)
        `)
        .run(input.deliveryId, now);
      if (delivery.changes === 0) {
        this.#database.exec('COMMIT');
        return { deliveryAccepted: false, jobsCancelled: 0 };
      }

      const cancelled = this.#database
        .prepare(`
          UPDATE review_jobs
          SET state = 'CANCELLED', error = ?, updated_at = ?
          WHERE repository = ?
            AND pull_request_number = ?
            AND state IN (
              'QUEUED',
              'CHECKING_OUT',
              'SANDBOX_CREATING',
              'REVIEWING',
              'VALIDATING',
              'PUBLISHING'
            )
        `)
        .run(reason, now, input.repository, input.pullRequestNumber);
      this.#database.exec('COMMIT');
      return {
        deliveryAccepted: true,
        jobsCancelled: Number(cancelled.changes),
      };
    } catch (error) {
      this.#database.exec('ROLLBACK');
      throw error;
    }
  }

  countJobs(): number {
    const row = this.#database.prepare('SELECT COUNT(*) AS count FROM review_jobs').get() as {
      count: number;
    };
    return row.count;
  }

  getActiveJobIds(): Set<number> {
    const rows = this.#database
      .prepare(`
        SELECT id FROM review_jobs
        WHERE state IN (
          'CHECKING_OUT', 'SANDBOX_CREATING', 'REVIEWING', 'VALIDATING', 'PUBLISHING'
        )
      `)
      .all() as Array<{ id: number }>;
    return new Set(rows.map((row) => Number(row.id)));
  }

  acceptManualCommand(command: ManualCommand): boolean {
    const now = new Date().toISOString();
    const result = this.#database
      .prepare(`
        INSERT OR IGNORE INTO command_audits (
          delivery_id, repository, pull_request_number, comment_id,
          actor, command, outcome, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'RECEIVED', ?, ?)
      `)
      .run(
        command.deliveryId,
        command.repository,
        command.pullRequestNumber,
        command.commentId,
        command.actor,
        command.command,
        now,
        now,
      );
    if (result.changes === 1) {
      return true;
    }
    const retried = this.#database
      .prepare(`
        UPDATE command_audits
        SET outcome = 'RECEIVED', detail = NULL, updated_at = ?
        WHERE delivery_id = ? AND outcome = 'FAILED'
      `)
      .run(now, command.deliveryId);
    return retried.changes === 1;
  }

  completeManualCommand(deliveryId: string, outcome: string, detail?: string): void {
    this.#database
      .prepare(`
        UPDATE command_audits
        SET outcome = ?, detail = ?, updated_at = ?
        WHERE delivery_id = ?
      `)
      .run(outcome, detail ?? null, new Date().toISOString(), deliveryId);
  }

  cancelActiveJobs(repository: string, pullRequestNumber: number, reason: string): number {
    const result = this.#database
      .prepare(`
        UPDATE review_jobs
        SET state = 'CANCELLED', error = ?, updated_at = ?
        WHERE repository = ? AND pull_request_number = ?
          AND state IN (
            'QUEUED', 'CHECKING_OUT', 'SANDBOX_CREATING',
            'REVIEWING', 'VALIDATING', 'PUBLISHING'
          )
      `)
      .run(reason, new Date().toISOString(), repository, pullRequestNumber);
    return Number(result.changes);
  }

  /**
   * Put work interrupted by service shutdown back into the durable queue.
   * Incrementing the attempt invalidates any asynchronous work that is still
   * unwinding and leaves check/publication identities available for retry.
   */
  requeueActiveJobs(): number {
    const result = this.#database
      .prepare(`
        UPDATE review_jobs
        SET state = 'QUEUED', error = NULL, attempt = attempt + 1, updated_at = ?
        WHERE state IN (
          'CHECKING_OUT', 'SANDBOX_CREATING', 'REVIEWING', 'VALIDATING', 'PUBLISHING'
        )
      `)
      .run(new Date().toISOString());
    return Number(result.changes);
  }

  getLatestJobStatus(repository: string, pullRequestNumber: number): LatestJobStatus | undefined {
    const row = this.#database
      .prepare(`
        SELECT id, head_sha, state, error
        FROM review_jobs
        WHERE repository = ? AND pull_request_number = ?
        ORDER BY id DESC
        LIMIT 1
      `)
      .get(repository, pullRequestNumber) as Record<string, unknown> | undefined;
    return row === undefined
      ? undefined
      : {
          error: typeof row.error === 'string' ? row.error : undefined,
          headSha: String(row.head_sha),
          id: Number(row.id),
          state: String(row.state),
        };
  }

  findPreviousCompletedReview(job: ReviewJob): PreviousReview | undefined {
    const row = this.#database
      .prepare(`
        SELECT head_sha
        FROM review_jobs
        WHERE repository = ?
          AND pull_request_number = ?
          AND id < ?
          AND state = 'DONE'
          AND result_path IS NOT NULL
        ORDER BY id DESC
        LIMIT 1
      `)
      .get(job.repository, job.pullRequestNumber, job.id) as Record<string, unknown> | undefined;

    if (row === undefined) {
      return undefined;
    }
    const resultPaths = this.#database
      .prepare(`
        SELECT result_path
        FROM review_jobs
        WHERE repository = ?
          AND pull_request_number = ?
          AND id < ?
          AND state = 'DONE'
          AND result_path IS NOT NULL
        ORDER BY id DESC
        LIMIT 20
      `)
      .all(job.repository, job.pullRequestNumber, job.id) as Array<{
      result_path: string;
    }>;
    return {
      headSha: String(row.head_sha),
      resultPaths: resultPaths.map((result) => String(result.result_path)),
    };
  }

  reconcileFindings(input: {
    job: ReviewJob;
    previousResult: ReviewResult | undefined;
    result: ReviewResult;
  }): void {
    const now = new Date().toISOString();
    const upsertFinding = this.#database.prepare(`
      INSERT INTO review_findings (
        repository, pull_request_number, fingerprint, file, line, title,
        evidence, state, first_seen_job_id, last_seen_job_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)
      ON CONFLICT(repository, pull_request_number, fingerprint) DO UPDATE SET
        file = excluded.file,
        line = excluded.line,
        title = excluded.title,
        evidence = excluded.evidence,
        state = 'OPEN',
        last_seen_job_id = excluded.last_seen_job_id,
        updated_at = excluded.updated_at
    `);
    const seedFinding = this.#database.prepare(`
      INSERT OR IGNORE INTO review_findings (
        repository, pull_request_number, fingerprint, file, line, title,
        evidence, state, first_seen_job_id, last_seen_job_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)
    `);
    const updateFinding = this.#database.prepare(`
      UPDATE review_findings
      SET state = ?, evidence = ?, last_seen_job_id = ?, updated_at = ?
      WHERE repository = ? AND pull_request_number = ? AND fingerprint = ?
    `);

    this.#database.exec('BEGIN IMMEDIATE');
    try {
      for (const finding of input.previousResult?.findings ?? []) {
        seedFinding.run(
          input.job.repository,
          input.job.pullRequestNumber,
          findingFingerprint(finding),
          finding.file,
          finding.line,
          finding.title,
          finding.evidence,
          input.job.id,
          input.job.id,
          now,
          now,
        );
      }
      for (const finding of input.result.findings) {
        upsertFinding.run(
          input.job.repository,
          input.job.pullRequestNumber,
          findingFingerprint(finding),
          finding.file,
          finding.line,
          finding.title,
          finding.evidence,
          input.job.id,
          input.job.id,
          now,
          now,
        );
      }
      for (const update of input.result.finding_updates ?? []) {
        updateFinding.run(
          update.status === 'fixed' ? 'FIXED' : 'STILL_PRESENT',
          update.evidence,
          input.job.id,
          now,
          input.job.repository,
          input.job.pullRequestNumber,
          update.fingerprint,
        );
      }
      this.#database.exec('COMMIT');
    } catch (error) {
      this.#database.exec('ROLLBACK');
      throw error;
    }
  }

  getReviewFindings(repository: string, pullRequestNumber: number): ReviewFinding[] {
    const rows = this.#database
      .prepare(`
        SELECT * FROM review_findings
        WHERE repository = ? AND pull_request_number = ?
        ORDER BY first_seen_job_id, fingerprint
      `)
      .all(repository, pullRequestNumber) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      evidence: String(row.evidence),
      file: String(row.file),
      fingerprint: String(row.fingerprint),
      firstSeenJobId: Number(row.first_seen_job_id),
      lastSeenJobId: Number(row.last_seen_job_id),
      line: Number(row.line),
      state: String(row.state) as ReviewFinding['state'],
      title: String(row.title),
    }));
  }

  activatePullRequestJob(job: ReviewJob): PullRequestState {
    const row = this.#database
      .prepare(`
        INSERT INTO pull_request_state (
          repository,
          pull_request_number,
          current_job_id,
          current_head_sha,
          updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(repository, pull_request_number) DO UPDATE SET
          current_job_id = excluded.current_job_id,
          current_head_sha = excluded.current_head_sha,
          updated_at = excluded.updated_at
        RETURNING *
      `)
      .get(
        job.repository,
        job.pullRequestNumber,
        job.id,
        job.headSha,
        new Date().toISOString(),
      ) as Record<string, unknown>;

    return mapPullRequestState(row);
  }

  attachStatusComment(input: {
    attempt?: number;
    commentId: number;
    jobId: number;
    pullRequestNumber: number;
    repository: string;
  }): boolean {
    const conditions = ['repository = ?', 'pull_request_number = ?', 'current_job_id = ?'];
    const parameters: Array<number | string> = [
      input.repository,
      input.pullRequestNumber,
      input.jobId,
    ];
    if (input.attempt !== undefined) {
      conditions.push(
        'EXISTS (SELECT 1 FROM review_jobs WHERE id = current_job_id AND attempt = ?)',
      );
      parameters.push(input.attempt);
    }
    const result = this.#database
      .prepare(`
        UPDATE pull_request_state
        SET status_comment_id = ?, updated_at = ?
        WHERE ${conditions.join(' AND ')}
      `)
      .run(input.commentId, new Date().toISOString(), ...parameters);
    return result.changes === 1;
  }

  isCurrentPullRequestJob(input: {
    attempt?: number;
    jobId: number;
    pullRequestNumber: number;
    repository: string;
  }): boolean {
    const row = this.#database
      .prepare(`
        SELECT state.current_job_id, jobs.attempt
        FROM pull_request_state AS state
        JOIN review_jobs AS jobs ON jobs.id = state.current_job_id
        WHERE state.repository = ? AND state.pull_request_number = ?
      `)
      .get(input.repository, input.pullRequestNumber) as
      | { attempt: number; current_job_id: number }
      | undefined;
    return (
      row?.current_job_id === input.jobId &&
      (input.attempt === undefined || row.attempt === input.attempt)
    );
  }

  isJobAttemptCurrent(input: { attempt: number; jobId: number }): boolean {
    const row = this.#database
      .prepare('SELECT attempt FROM review_jobs WHERE id = ?')
      .get(input.jobId) as { attempt: number } | undefined;
    return row?.attempt === input.attempt;
  }

  claimNextJob(): ReviewJob | undefined {
    const row = this.#database
      .prepare(`
        UPDATE review_jobs
        SET state = 'CHECKING_OUT', attempt = attempt + 1, updated_at = ?
        WHERE id = (
          SELECT id FROM review_jobs
          WHERE state = 'QUEUED'
            AND NOT EXISTS (
              SELECT 1
              FROM review_jobs AS newer
              WHERE newer.repository = review_jobs.repository
                AND newer.pull_request_number = review_jobs.pull_request_number
                AND newer.state = 'QUEUED'
                AND newer.id > review_jobs.id
            )
          ORDER BY id
          LIMIT 1
        )
        RETURNING *
      `)
      .get(new Date().toISOString()) as Record<string, unknown> | undefined;

    return row === undefined ? undefined : mapReviewJob(row);
  }

  updateJob(input: {
    checkRunId?: number;
    error?: string | null;
    attempt?: number;
    expectedStates?: readonly string[];
    id: number;
    publishedReviewId?: number;
    resultPath?: string;
    state: string;
  }): boolean {
    const conditions = ['id = ?'];
    const parameters: Array<number | string | null> = [
      input.state,
      input.error ?? null,
      input.checkRunId ?? null,
      input.resultPath ?? null,
      input.publishedReviewId ?? null,
      new Date().toISOString(),
      input.id,
    ];
    if (input.attempt !== undefined) {
      conditions.push('attempt = ?');
      parameters.push(input.attempt);
    }
    if (input.expectedStates !== undefined && input.expectedStates.length > 0) {
      conditions.push(`state IN (${input.expectedStates.map(() => '?').join(', ')})`);
      parameters.push(...input.expectedStates);
    }
    const result = this.#database
      .prepare(`
        UPDATE review_jobs
        SET state = ?, error = ?, check_run_id = COALESCE(?, check_run_id),
            result_path = COALESCE(?, result_path),
            published_review_id = COALESCE(?, published_review_id), updated_at = ?
        WHERE ${conditions.join(' AND ')}
      `)
      .run(...parameters);
    return Number(result.changes) === 1;
  }

  #ensureColumn(table: string, column: string, type: string): void {
    const columns = this.#database.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string;
    }>;
    if (!columns.some((candidate) => candidate.name === column)) {
      this.#database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }
}

function mapReviewJob(row: Record<string, unknown>): ReviewJob {
  return {
    action: String(row.action),
    attempt: Number(row.attempt ?? 0),
    deliveryId: String(row.delivery_id),
    checkRunId:
      row.check_run_id === null || row.check_run_id === undefined
        ? undefined
        : Number(row.check_run_id),
    headSha: String(row.head_sha),
    id: Number(row.id),
    installationId: Number(row.installation_id),
    policyVersion: String(row.policy_version),
    publishedReviewId:
      row.published_review_id === null || row.published_review_id === undefined
        ? undefined
        : Number(row.published_review_id),
    pullRequestNumber: Number(row.pull_request_number),
    repository: String(row.repository),
    resultPath:
      row.result_path === null || row.result_path === undefined
        ? undefined
        : typeof row.result_path === 'string'
          ? row.result_path
          : undefined,
    state: String(row.state),
  };
}

function mapPullRequestState(row: Record<string, unknown>): PullRequestState {
  return {
    currentHeadSha: String(row.current_head_sha),
    currentJobId: Number(row.current_job_id),
    statusCommentId:
      row.status_comment_id === null || row.status_comment_id === undefined
        ? undefined
        : Number(row.status_comment_id),
  };
}
