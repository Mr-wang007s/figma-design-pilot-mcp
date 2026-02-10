import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

// ── Comments Table ──────────────────────────────────────────────────────────

export interface CommentsTable {
  id: string;
  file_key: string;
  parent_id: string | null;
  root_id: string | null;
  message_text: string;
  author_id: string;
  author_handle: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
  reactions_json: string | null;
  remote_status_emoji: string | null;
  local_status: Generated<string>;       // DEFAULT 'OPEN'
  reply_posted_by_ai: Generated<number>; // DEFAULT 0
}

export type CommentRow = Selectable<CommentsTable>;
export type NewComment = Insertable<CommentsTable>;
export type CommentUpdate = Updateable<CommentsTable>;

// ── Operations Table (Outbox) ───────────────────────────────────────────────

export interface OperationsTable {
  op_id: string;
  idempotency_key: string;
  file_key: string;
  op_type: string;
  payload_json: string;
  state: Generated<string>;           // DEFAULT 'PENDING'
  retry_count: Generated<number>;     // DEFAULT 0
  error_message: string | null;
  figma_response_id: string | null;
  created_at: Generated<string>;      // DEFAULT datetime('now')
  updated_at: Generated<string>;      // DEFAULT datetime('now')
}

export type OperationRow = Selectable<OperationsTable>;
export type NewOperation = Insertable<OperationsTable>;
export type OperationUpdate = Updateable<OperationsTable>;

// ── Sync State Table ────────────────────────────────────────────────────────

export interface SyncStateTable {
  file_key: string;
  last_full_sync_at: string | null;
  last_event_id: string | null;
  bot_user_id: string | null;
  sync_config_json: string | null;
}

export type SyncStateRow = Selectable<SyncStateTable>;
export type NewSyncState = Insertable<SyncStateTable>;
export type SyncStateUpdate = Updateable<SyncStateTable>;

// ── Config Table ────────────────────────────────────────────────────────────

export interface ConfigTable {
  key: string;
  value: string;
}

export type ConfigRow = Selectable<ConfigTable>;
export type NewConfig = Insertable<ConfigTable>;
export type ConfigUpdate = Updateable<ConfigTable>;

// ── File Snapshots Table (V4.0) ─────────────────────────────────────────────

export interface FileSnapshotsTable {
  file_key: string;
  version_id: string;
  fetched_at: Generated<string>;
  file_name: string | null;
  node_count: number | null;
  components_json: string | null;
  component_sets_json: string | null;
  styles_json: string | null;
}

export type FileSnapshotRow = Selectable<FileSnapshotsTable>;
export type NewFileSnapshot = Insertable<FileSnapshotsTable>;

// ── Review Reports Table (V4.0) ─────────────────────────────────────────────

export interface ReviewReportsTable {
  report_id: string;
  file_key: string;
  version_id: string | null;
  page_name: string | null;
  created_at: Generated<string>;
  total_nodes: number | null;
  total_issues: number | null;
  error_count: number | null;
  warning_count: number | null;
  info_count: number | null;
  dimension_summary_json: string | null;
  token_coverage_percent: number | null;
  token_bound_count: number | null;
  token_total_count: number | null;
  score: number | null;
  grade: string | null;
}

export type ReviewReportRow = Selectable<ReviewReportsTable>;
export type NewReviewReport = Insertable<ReviewReportsTable>;

// ── Review Issues Table (V4.0) ──────────────────────────────────────────────

export interface ReviewIssuesTable {
  issue_id: string;
  report_id: string;
  dimension: string;
  severity: string;
  rule_id: string;
  node_id: string | null;
  node_name: string | null;
  node_type: string | null;
  page_name: string | null;
  message: string;
  suggestion: string | null;
  detail_json: string | null;
  status: Generated<string>;         // DEFAULT 'OPEN'
  comment_id: string | null;
}

export type ReviewIssueRow = Selectable<ReviewIssuesTable>;
export type NewReviewIssue = Insertable<ReviewIssuesTable>;

// ── Review Rules Table (V4.0) ───────────────────────────────────────────────

export interface ReviewRulesTable {
  rule_id: string;
  dimension: string;
  severity: Generated<string>;
  enabled: Generated<number>;
  config_json: string | null;
  description: string | null;
}

export type ReviewRuleRow = Selectable<ReviewRulesTable>;
export type NewReviewRule = Insertable<ReviewRulesTable>;

// ── Database Schema ─────────────────────────────────────────────────────────

export interface DatabaseSchema {
  comments: CommentsTable;
  operations: OperationsTable;
  sync_state: SyncStateTable;
  config: ConfigTable;
  file_snapshots: FileSnapshotsTable;
  review_reports: ReviewReportsTable;
  review_issues: ReviewIssuesTable;
  review_rules: ReviewRulesTable;
}
