import { runDesignReview } from '../../core/review/engine.js';
import type { ReviewReport, ReviewDimension } from '../../figma/design_types.js';

interface DesignReviewArgs {
  file_key: string;
  page_name?: string;
  dimensions?: ReviewDimension[];
  severity_filter?: 'error' | 'warning' | 'info';
}

/**
 * figma_design_review tool handler.
 *
 * Run a full design review across all lint dimensions.
 */
export async function handleDesignReview(args: DesignReviewArgs): Promise<ReviewReport> {
  return runDesignReview({
    file_key: args.file_key,
    page_name: args.page_name,
    dimensions: args.dimensions,
    severity_filter: args.severity_filter,
  });
}
