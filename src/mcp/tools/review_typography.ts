import { runSingleDimension } from '../../core/review/engine.js';
import type { ReviewIssue } from '../../figma/design_types.js';

interface ReviewTypographyArgs {
  file_key: string;
  page_name?: string;
  allowed_fonts?: string[];
}

/**
 * figma_review_typography tool handler.
 */
export async function handleReviewTypography(args: ReviewTypographyArgs): Promise<{
  issues: ReviewIssue[];
  stats: Record<string, unknown>;
}> {
  return runSingleDimension(args.file_key, 'typography', {
    page_name: args.page_name,
    allowed_fonts: args.allowed_fonts,
  });
}
