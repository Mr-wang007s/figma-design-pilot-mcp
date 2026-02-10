import { listPendingThreads } from '../../core/sync.js';
import type { Thread } from '../../figma/types.js';

interface ListPendingArgs {
  file_key: string;
  limit?: number;
}

interface ListPendingResult {
  threads: Thread[];
  count: number;
}

/**
 * figma_list_pending tool handler.
 *
 * Query local DB for all OPEN/PENDING threads. No network request.
 */
export async function handleListPending(args: ListPendingArgs): Promise<ListPendingResult> {
  const threads = await listPendingThreads(args.file_key, args.limit ?? 20);

  return {
    threads,
    count: threads.length,
  };
}
