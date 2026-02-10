import { randomUUID } from 'node:crypto';
import { db } from '../../db/client.js';
import type {
  ReviewReport,
  ReviewIssue,
  DimensionResult,
  ReviewDimension,
  TokenCoverageStats,
  FigmaNode,
} from '../../figma/design_types.js';
import {
  fetchFileContext,
  getPages,
  flattenNodes,
  countNodes,
} from './file_reader.js';
import type { FileContext } from './file_reader.js';
import { runColorLint } from './rules/color_lint.js';
import { runSpacingLint } from './rules/spacing_lint.js';
import { runTypographyLint } from './rules/typography_lint.js';
import { runComponentLint, runComponentAudit } from './rules/component_lint.js';
import {
  runTokenCoverage,
  mergeCounters,
  computeCoverageStats,
  createEmptyCounters,
} from './rules/token_coverage.js';
import { runStructureLint, checkHiddenLayerBloat } from './rules/structure_lint.js';
import { runA11yLint } from './rules/a11y_lint.js';
import { computeScore } from './scoring.js';

// ── Review Options ───────────────────────────────────────────────────────────

export interface ReviewOptions {
  file_key: string;
  page_name?: string;
  dimensions?: ReviewDimension[];
  severity_filter?: 'error' | 'warning' | 'info';
  grid_base?: number;
  max_depth?: number;
  allowed_fonts?: string[];
  wcag_level?: 'AA' | 'AAA';
}

// ── Main Review Engine ───────────────────────────────────────────────────────

const ALL_DIMENSIONS: ReviewDimension[] = [
  'colors', 'spacing', 'typography', 'components', 'token_coverage', 'structure', 'a11y',
];

export async function runDesignReview(opts: ReviewOptions): Promise<ReviewReport> {
  const { file_key, page_name, severity_filter } = opts;
  const dimensions = opts.dimensions ?? ALL_DIMENSIONS;

  // 1. Fetch file context
  const ctx = await fetchFileContext(file_key);

  // 2. Get target pages
  const pages = getPages(ctx.document);
  const targetPages = page_name
    ? pages.filter((p) => p.name === page_name)
    : pages;

  if (page_name && targetPages.length === 0) {
    throw new Error(`Page "${page_name}" not found. Available pages: ${pages.map((p) => p.name).join(', ')}`);
  }

  // 3. Flatten all nodes
  const allNodes: Array<{ node: FigmaNode; pageName: string; depth: number }> = [];
  for (const page of targetPages) {
    allNodes.push(...flattenNodes(page, page.name));
  }

  // 4. Run lint rules per node
  const allIssues: ReviewIssue[] = [];
  const tokenCounters = createEmptyCounters();

  for (const { node, pageName, depth } of allNodes) {
    if (dimensions.includes('colors')) {
      allIssues.push(...runColorLint(node, pageName, ctx));
    }
    if (dimensions.includes('spacing')) {
      allIssues.push(...runSpacingLint(node, pageName, ctx, opts.grid_base));
    }
    if (dimensions.includes('typography')) {
      allIssues.push(...runTypographyLint(node, pageName, ctx, opts.allowed_fonts));
    }
    if (dimensions.includes('components')) {
      allIssues.push(...runComponentLint(node, pageName, ctx));
    }
    if (dimensions.includes('token_coverage')) {
      const { issues, counters } = runTokenCoverage(node, pageName, ctx);
      allIssues.push(...issues);
      mergeCounters(tokenCounters, counters);
    }
    if (dimensions.includes('structure')) {
      allIssues.push(...runStructureLint(node, pageName, ctx, depth, opts.max_depth));
    }
    if (dimensions.includes('a11y')) {
      allIssues.push(...runA11yLint(node, pageName, ctx, allNodes, opts.wcag_level));
    }
  }

  // 5. Post-traversal audits
  if (dimensions.includes('components')) {
    allIssues.push(...runComponentAudit(allNodes, ctx));
  }
  if (dimensions.includes('structure')) {
    allIssues.push(...checkHiddenLayerBloat(allNodes));
  }

  // 6. Apply severity filter
  const filteredIssues = severity_filter
    ? allIssues.filter((i) => severityRank(i.severity) >= severityRank(severity_filter))
    : allIssues;

  // 7. Compute scores
  const { score, grade } = computeScore(filteredIssues);
  const tokenCoverage = computeCoverageStats(tokenCounters);

  // 8. Build dimension results
  const dimensionResults = buildDimensionResults(filteredIssues, dimensions);

  // 9. Build report
  const report: ReviewReport = {
    report_id: randomUUID(),
    file_key,
    file_name: ctx.fileName,
    version: ctx.version,
    page_name,
    created_at: new Date().toISOString(),
    score,
    grade,
    summary: {
      total_nodes: allNodes.length,
      total_issues: filteredIssues.length,
      errors: filteredIssues.filter((i) => i.severity === 'error').length,
      warnings: filteredIssues.filter((i) => i.severity === 'warning').length,
      info: filteredIssues.filter((i) => i.severity === 'info').length,
    },
    token_coverage: tokenCoverage,
    dimensions: dimensionResults,
    issues: filteredIssues,
  };

  // 10. Persist report
  await persistReport(report);

  return report;
}

// ── Single Dimension Runners (for individual tools) ──────────────────────────

export async function runSingleDimension(
  fileKey: string,
  dimension: ReviewDimension,
  opts?: Partial<ReviewOptions>,
): Promise<{ issues: ReviewIssue[]; stats: Record<string, unknown> }> {
  const ctx = await fetchFileContext(fileKey);
  const pages = getPages(ctx.document);
  const targetPages = opts?.page_name
    ? pages.filter((p) => p.name === opts.page_name)
    : pages;

  const allNodes: Array<{ node: FigmaNode; pageName: string; depth: number }> = [];
  for (const page of targetPages) {
    allNodes.push(...flattenNodes(page, page.name));
  }

  const issues: ReviewIssue[] = [];
  const tokenCounters = createEmptyCounters();

  for (const { node, pageName, depth } of allNodes) {
    switch (dimension) {
      case 'colors':
        issues.push(...runColorLint(node, pageName, ctx));
        break;
      case 'spacing':
        issues.push(...runSpacingLint(node, pageName, ctx, opts?.grid_base));
        break;
      case 'typography':
        issues.push(...runTypographyLint(node, pageName, ctx, opts?.allowed_fonts));
        break;
      case 'components':
        issues.push(...runComponentLint(node, pageName, ctx));
        break;
      case 'token_coverage': {
        const result = runTokenCoverage(node, pageName, ctx);
        issues.push(...result.issues);
        mergeCounters(tokenCounters, result.counters);
        break;
      }
      case 'structure':
        issues.push(...runStructureLint(node, pageName, ctx, depth, opts?.max_depth));
        break;
      case 'a11y':
        issues.push(...runA11yLint(node, pageName, ctx, allNodes, opts?.wcag_level));
        break;
    }
  }

  // Post-traversal
  if (dimension === 'components') {
    issues.push(...runComponentAudit(allNodes, ctx));
  }
  if (dimension === 'structure') {
    issues.push(...checkHiddenLayerBloat(allNodes));
  }

  const stats: Record<string, unknown> = {
    total_nodes: allNodes.length,
    total_issues: issues.length,
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    info: issues.filter((i) => i.severity === 'info').length,
  };

  if (dimension === 'token_coverage') {
    const coverage = computeCoverageStats(tokenCounters);
    Object.assign(stats, { coverage });
  }

  return { issues, stats };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function severityRank(s: string): number {
  switch (s) {
    case 'error': return 3;
    case 'warning': return 2;
    case 'info': return 1;
    default: return 0;
  }
}

function buildDimensionResults(
  issues: ReviewIssue[],
  dimensions: ReviewDimension[],
): Record<ReviewDimension, DimensionResult> {
  const result = {} as Record<ReviewDimension, DimensionResult>;
  for (const dim of ALL_DIMENSIONS) {
    const dimIssues = dimensions.includes(dim)
      ? issues.filter((i) => i.dimension === dim)
      : [];
    const errors = dimIssues.filter((i) => i.severity === 'error').length;
    const warnings = dimIssues.filter((i) => i.severity === 'warning').length;
    const info = dimIssues.filter((i) => i.severity === 'info').length;
    result[dim] = {
      passed: errors === 0,
      errors,
      warnings,
      info,
      issues: dimIssues,
    };
  }
  return result;
}

async function persistReport(report: ReviewReport): Promise<void> {
  try {
    await db
      .insertInto('review_reports')
      .values({
        report_id: report.report_id,
        file_key: report.file_key,
        version_id: report.version,
        page_name: report.page_name ?? null,
        total_nodes: report.summary.total_nodes,
        total_issues: report.summary.total_issues,
        error_count: report.summary.errors,
        warning_count: report.summary.warnings,
        info_count: report.summary.info,
        dimension_summary_json: JSON.stringify(
          Object.fromEntries(
            Object.entries(report.dimensions).map(([k, v]) => [k, { errors: v.errors, warnings: v.warnings, info: v.info }]),
          ),
        ),
        token_coverage_percent: report.token_coverage.percentage,
        token_bound_count: report.token_coverage.bound,
        token_total_count: report.token_coverage.total,
        score: report.score,
        grade: report.grade,
      })
      .execute();

    // Persist individual issues (batch insert)
    if (report.issues.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < report.issues.length; i += batchSize) {
        const batch = report.issues.slice(i, i + batchSize);
        await db
          .insertInto('review_issues')
          .values(
            batch.map((issue) => ({
              issue_id: issue.issue_id,
              report_id: report.report_id,
              dimension: issue.dimension,
              severity: issue.severity,
              rule_id: issue.rule_id,
              node_id: issue.node_id ?? null,
              node_name: issue.node_name ?? null,
              node_type: issue.node_type ?? null,
              page_name: issue.page_name ?? null,
              message: issue.message,
              suggestion: issue.suggestion ?? null,
              detail_json: JSON.stringify(issue.detail),
              comment_id: null,
            })),
          )
          .execute();
      }
    }
  } catch (err) {
    console.error('⚠️  Failed to persist review report:', err instanceof Error ? err.message : String(err));
  }
}
