import { runSingleDimension } from '../../core/review/engine.js';
import type { ReviewIssue } from '../../figma/design_types.js';

interface ReviewA11yArgs {
  file_key: string;
  page_name?: string;
  wcag_level?: 'AA' | 'AAA';
}

/**
 * figma_review_a11y tool handler.
 */
export async function handleReviewA11y(args: ReviewA11yArgs): Promise<{
  issues: ReviewIssue[];
  stats: Record<string, unknown>;
}> {
  return runSingleDimension(args.file_key, 'a11y', {
    page_name: args.page_name,
    wcag_level: args.wcag_level,
  });
}
