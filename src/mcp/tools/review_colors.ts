import { runSingleDimension } from '../../core/review/engine.js';
import type { ReviewIssue } from '../../figma/design_types.js';

interface ReviewColorsArgs {
  file_key: string;
  page_name?: string;
}

/**
 * figma_review_colors tool handler.
 */
export async function handleReviewColors(args: ReviewColorsArgs): Promise<{
  issues: ReviewIssue[];
  stats: Record<string, unknown>;
}> {
  return runSingleDimension(args.file_key, 'colors', { page_name: args.page_name });
}
