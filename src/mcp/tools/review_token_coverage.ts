import { runSingleDimension } from '../../core/review/engine.js';
import type { ReviewIssue } from '../../figma/design_types.js';

interface ReviewTokenCoverageArgs {
  file_key: string;
  page_name?: string;
}

/**
 * figma_review_token_coverage tool handler.
 */
export async function handleReviewTokenCoverage(args: ReviewTokenCoverageArgs): Promise<{
  issues: ReviewIssue[];
  stats: Record<string, unknown>;
}> {
  return runSingleDimension(args.file_key, 'token_coverage', { page_name: args.page_name });
}
