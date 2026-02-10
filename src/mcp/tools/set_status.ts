import { db } from '../../db/client.js';
import {
  enqueueSetStatus,
  enqueueRemoveReaction,
  processOperations,
} from '../../core/operations.js';
import { statusToEmoji, previousStatusEmoji } from '../../core/reconciler.js';
import type { LocalStatus } from '../../config.js';

interface SetStatusArgs {
  file_key: string;
  comment_id: string;
  status: 'PENDING' | 'DONE' | 'WONTFIX';
}

interface SetStatusResult {
  success: boolean;
  message: string;
  op_ids: string[];
}

/**
 * figma_set_status tool handler.
 *
 * Changes a thread's status by managing emoji reactions.
 * 1. Remove previous status emoji (if any)
 * 2. Add new status emoji
 * 3. Update local DB
 */
export async function handleSetStatus(args: SetStatusArgs): Promise<SetStatusResult> {
  const opIds: string[] = [];

  // Get current local status
  const comment = await db
    .selectFrom('comments')
    .select(['local_status'])
    .where('id', '=', args.comment_id)
    .where('file_key', '=', args.file_key)
    .executeTakeFirst();

  if (!comment) {
    return {
      success: false,
      message: `Comment ${args.comment_id} not found in local DB. Run figma_sync_comments first.`,
      op_ids: [],
    };
  }

  const currentStatus = comment.local_status as LocalStatus;
  const currentEmoji = previousStatusEmoji(currentStatus);
  const newEmoji = statusToEmoji(args.status);

  // 1. Remove previous emoji if it exists and differs
  if (currentEmoji && currentEmoji !== newEmoji) {
    const removeResult = await enqueueRemoveReaction(
      args.file_key,
      args.comment_id,
      currentEmoji,
    );
    opIds.push(removeResult.op_id);
  }

  // 2. Add new emoji
  if (newEmoji) {
    const addResult = await enqueueSetStatus(
      args.file_key,
      args.comment_id,
      newEmoji,
    );
    opIds.push(addResult.op_id);
  }

  // 3. Update local DB immediately
  await db
    .updateTable('comments')
    .set({
      local_status: args.status,
      remote_status_emoji: newEmoji,
    })
    .where('id', '=', args.comment_id)
    .execute();

  // 4. Process operations
  await processOperations(args.file_key);

  return {
    success: true,
    message: `Status changed from ${currentStatus} to ${args.status}`,
    op_ids: opIds,
  };
}
