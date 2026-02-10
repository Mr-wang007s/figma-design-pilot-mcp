import { syncComments } from '../../core/sync.js';
import { processOperations } from '../../core/operations.js';
import type { SyncResult } from '../../figma/types.js';

/**
 * figma_sync_comments tool handler.
 *
 * Full sync: fetch comments from Figma, diff against local DB,
 * return threads that need attention (OPEN/PENDING).
 */
export async function handleSyncComments(args: {
  file_key: string;
  force_full_sync?: boolean;
}): Promise<SyncResult> {
  // 1. Sync comments from Figma
  const result = await syncComments(args.file_key, args.force_full_sync ?? false);

  // 2. Process any pending outbox operations
  await processOperations(args.file_key);

  return result;
}
