import { runSingleDimension } from '../../core/review/engine.js';
import type { ReviewIssue } from '../../figma/design_types.js';

interface ReviewStructureArgs {
  file_key: string;
  page_name?: string;
  max_depth?: number;
}

/**
 * figma_review_structure tool handler.
 */
export async function handleReviewStructure(args: ReviewStructureArgs): Promise<{
  issues: ReviewIssue[];
  stats: Record<string, unknown>;
}> {
  return runSingleDimension(args.file_key, 'structure', {
    page_name: args.page_name,
    max_depth: args.max_depth,
  });
}
