import { db, rawDb } from '../db/client.js';
import { postComment, deleteComment, addReaction, removeReaction } from '../figma/api.js';
import { generateIdempotencyKey, generateOpId } from '../utils/hash.js';
import { formatBotReply } from '../utils/sanitizer.js';
import { appConfig } from '../config.js';
import type { OpType, OpState } from '../figma/types.js';
import type { OperationRow } from '../db/types.js';

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const IDEMPOTENCY_WINDOW_HOURS = 24;

// ── Enqueue Operations ──────────────────────────────────────────────────────

interface EnqueueResult {
  op_id: string;
  status: 'created' | 'duplicate';
  existing_op?: OperationRow;
}

/**
 * Enqueue a reply operation into the outbox.
 * Returns the operation ID if created, or the existing one if duplicate.
 */
export async function enqueueReply(
  fileKey: string,
  rootCommentId: string,
  message: string,
): Promise<EnqueueResult> {
  const formattedMessage = formatBotReply(message, appConfig.BOT_REPLY_PREFIX);
  const idempotencyKey = generateIdempotencyKey(
    fileKey,
    rootCommentId,
    'REPLY',
    formattedMessage,
  );

  return enqueueOperation(fileKey, 'REPLY', idempotencyKey, {
    comment_id: rootCommentId,
    message: formattedMessage,
  });
}

/**
 * Enqueue a status change operation (add reaction).
 */
export async function enqueueSetStatus(
  fileKey: string,
  commentId: string,
  emoji: string,
): Promise<EnqueueResult> {
  const idempotencyKey = generateIdempotencyKey(
    fileKey,
    commentId,
    'ADD_REACTION',
    emoji,
  );

  return enqueueOperation(fileKey, 'ADD_REACTION', idempotencyKey, {
    comment_id: commentId,
    emoji,
  });
}

/**
 * Enqueue a remove reaction operation.
 */
export async function enqueueRemoveReaction(
  fileKey: string,
  commentId: string,
  emoji: string,
): Promise<EnqueueResult> {
  const idempotencyKey = generateIdempotencyKey(
    fileKey,
    commentId,
    'REMOVE_REACTION',
    emoji,
  );

  return enqueueOperation(fileKey, 'REMOVE_REACTION', idempotencyKey, {
    comment_id: commentId,
    emoji,
  });
}

/**
 * Enqueue a delete comment operation.
 */
export async function enqueueDeleteComment(
  fileKey: string,
  commentId: string,
): Promise<EnqueueResult> {
  const idempotencyKey = generateIdempotencyKey(
    fileKey,
    commentId,
    'DELETE_COMMENT',
    commentId,
  );

  return enqueueOperation(fileKey, 'DELETE_COMMENT', idempotencyKey, {
    comment_id: commentId,
  });
}

// ── Core Enqueue Logic ──────────────────────────────────────────────────────

async function enqueueOperation(
  fileKey: string,
  opType: OpType,
  idempotencyKey: string,
  payload: Record<string, string>,
): Promise<EnqueueResult> {
  const opId = generateOpId();

  try {
    await db
      .insertInto('operations')
      .values({
        op_id: opId,
        idempotency_key: idempotencyKey,
        file_key: fileKey,
        op_type: opType,
        payload_json: JSON.stringify(payload),
        state: 'PENDING',
        retry_count: 0,
      })
      .execute();

    return { op_id: opId, status: 'created' };
  } catch (err: unknown) {
    // Check for UNIQUE constraint violation (duplicate idempotency key)
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('UNIQUE constraint failed') || message.includes('SQLITE_CONSTRAINT')) {
      const existing = await db
        .selectFrom('operations')
        .selectAll()
        .where('idempotency_key', '=', idempotencyKey)
        .executeTakeFirst();

      if (existing) {
        return { op_id: existing.op_id, status: 'duplicate', existing_op: existing };
      }
    }
    throw err;
  }
}

// ── Process Operations ──────────────────────────────────────────────────────

/**
 * Process all PENDING operations for a given file.
 * Executes them sequentially (single writer) against the Figma API.
 *
 * Returns the number of operations processed.
 */
export async function processOperations(fileKey: string): Promise<number> {
  const pending = await db
    .selectFrom('operations')
    .selectAll()
    .where('file_key', '=', fileKey)
    .where('state', 'in', ['PENDING', 'PROCESSING'])
    .where('retry_count', '<', MAX_RETRIES)
    .orderBy('created_at', 'asc')
    .execute();

  let processed = 0;

  for (const op of pending) {
    try {
      // Mark as PROCESSING
      await db
        .updateTable('operations')
        .set({ state: 'PROCESSING', updated_at: new Date().toISOString() })
        .where('op_id', '=', op.op_id)
        .execute();

      const payload = JSON.parse(op.payload_json);

      // Execute the operation
      let figmaResponseId: string | null = null;

      switch (op.op_type as OpType) {
        case 'REPLY': {
          const result = await postComment(fileKey, {
            message: payload.message,
            comment_id: payload.comment_id,
          });
          figmaResponseId = result.id;
          break;
        }
        case 'ADD_REACTION': {
          await addReaction(fileKey, payload.comment_id, {
            emoji: payload.emoji,
          });
          break;
        }
        case 'REMOVE_REACTION': {
          await removeReaction(fileKey, payload.comment_id, payload.emoji);
          break;
        }
        case 'DELETE_COMMENT': {
          await deleteComment(fileKey, payload.comment_id);
          break;
        }
        default:
          throw new Error(`Unknown operation type: ${op.op_type}`);
      }

      // Mark as CONFIRMED
      await db
        .updateTable('operations')
        .set({
          state: 'CONFIRMED',
          figma_response_id: figmaResponseId,
          updated_at: new Date().toISOString(),
        })
        .where('op_id', '=', op.op_id)
        .execute();

      processed++;
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : String(err);

      // Mark as FAILED or increment retry
      const newRetryCount = op.retry_count + 1;
      const newState: OpState =
        newRetryCount >= MAX_RETRIES ? 'FAILED' : 'PENDING';

      await db
        .updateTable('operations')
        .set({
          state: newState,
          retry_count: newRetryCount,
          error_message: errMessage,
          updated_at: new Date().toISOString(),
        })
        .where('op_id', '=', op.op_id)
        .execute();

      console.error(
        `⚠️  Operation ${op.op_id} (${op.op_type}) failed [retry ${newRetryCount}/${MAX_RETRIES}]: ${errMessage}`,
      );
    }
  }

  return processed;
}

/**
 * Clean up old CONFIRMED/FAILED operations beyond the idempotency window.
 */
export async function cleanupOldOperations(): Promise<number> {
  const cutoff = new Date(
    Date.now() - IDEMPOTENCY_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const result = await db
    .deleteFrom('operations')
    .where('state', 'in', ['CONFIRMED', 'FAILED'])
    .where('created_at', '<', cutoff)
    .executeTakeFirst();

  return Number(result.numDeletedRows);
}
