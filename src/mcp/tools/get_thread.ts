import { getThread } from '../../core/sync.js';
import type { Thread } from '../../figma/types.js';

interface GetThreadArgs {
  file_key: string;
  thread_id: string;
}

/**
 * figma_get_thread tool handler.
 *
 * Returns a single thread's full context from local DB.
 */
export async function handleGetThread(args: GetThreadArgs): Promise<Thread | { error: string }> {
  const thread = await getThread(args.file_key, args.thread_id);

  if (!thread) {
    return {
      error: `Thread ${args.thread_id} not found in local DB for file ${args.file_key}. Run figma_sync_comments first.`,
    };
  }

  return thread;
}
