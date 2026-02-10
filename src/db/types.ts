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

// ── Database Schema ─────────────────────────────────────────────────────────

export interface DatabaseSchema {
  comments: CommentsTable;
  operations: OperationsTable;
  sync_state: SyncStateTable;
  config: ConfigTable;
}
