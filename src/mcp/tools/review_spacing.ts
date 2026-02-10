import { runSingleDimension } from '../../core/review/engine.js';
import type { ReviewIssue } from '../../figma/design_types.js';

interface ReviewSpacingArgs {
  file_key: string;
  page_name?: string;
  grid_base?: number;
}

/**
 * figma_review_spacing tool handler.
 */
export async function handleReviewSpacing(args: ReviewSpacingArgs): Promise<{
  issues: ReviewIssue[];
  stats: Record<string, unknown>;
}> {
  return runSingleDimension(args.file_key, 'spacing', {
    page_name: args.page_name,
    grid_base: args.grid_base,
  });
}
