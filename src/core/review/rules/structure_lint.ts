import { randomUUID } from 'node:crypto';
import type { FigmaNode, ReviewIssue } from '../../../figma/design_types.js';
import type { FileContext } from '../file_reader.js';

// ── Structure Lint Rules ─────────────────────────────────────────────────────

const DEFAULT_NAME_PATTERN = /^(Frame|Rectangle|Ellipse|Line|Group|Vector|Text|Polygon|Star|Section|Slice)\s+\d+$/;
const DEFAULT_MAX_DEPTH = 10;

export function runStructureLint(
  node: FigmaNode,
  pageName: string,
  _ctx: FileContext,
  depth: number,
  maxDepth: number = DEFAULT_MAX_DEPTH,
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  // Skip document/canvas level
  if (['DOCUMENT', 'CANVAS'].includes(node.type)) return issues;

  // Check for default naming
  if (DEFAULT_NAME_PATTERN.test(node.name)) {
    issues.push({
      issue_id: randomUUID(),
      dimension: 'structure',
      severity: 'warning',
      rule_id: 'struct/default-name',
      node_id: node.id,
      node_name: node.name,
      node_type: node.type,
      page_name: pageName,
      message: `Layer "${node.name}" uses a default auto-generated name`,
      suggestion: 'Rename to a descriptive name that reflects its purpose',
      detail: { currentName: node.name },
    });
  }

  // Check for empty frames
  if (node.type === 'FRAME' && (!node.children || node.children.length === 0)) {
    issues.push({
      issue_id: randomUUID(),
      dimension: 'structure',
      severity: 'info',
      rule_id: 'struct/empty-frame',
      node_id: node.id,
      node_name: node.name,
      node_type: node.type,
      page_name: pageName,
      message: `Frame "${node.name}" has no children`,
      suggestion: 'Remove empty frames or add content',
      detail: {},
    });
  }

  // Check for deep nesting
  if (depth > maxDepth) {
    issues.push({
      issue_id: randomUUID(),
      dimension: 'structure',
      severity: 'warning',
      rule_id: 'struct/deep-nesting',
      node_id: node.id,
      node_name: node.name,
      node_type: node.type,
      page_name: pageName,
      message: `Layer "${node.name}" is nested ${depth} levels deep (max: ${maxDepth})`,
      suggestion: 'Simplify the layer hierarchy or extract into a component',
      detail: { depth, maxDepth },
    });
  }

  return issues;
}

/**
 * Post-traversal: check for hidden layer bloat on a page.
 */
export function checkHiddenLayerBloat(
  allNodes: Array<{ node: FigmaNode; pageName: string }>,
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  // Group by page
  const byPage = new Map<string, { total: number; hidden: number }>();
  for (const { node, pageName } of allNodes) {
    if (['DOCUMENT', 'CANVAS'].includes(node.type)) continue;
    const stats = byPage.get(pageName) ?? { total: 0, hidden: 0 };
    stats.total++;
    if (node.visible === false) stats.hidden++;
    byPage.set(pageName, stats);
  }

  for (const [pageName, stats] of byPage) {
    if (stats.total > 10 && stats.hidden / stats.total > 0.3) {
      issues.push({
        issue_id: randomUUID(),
        dimension: 'structure',
        severity: 'info',
        rule_id: 'struct/hidden-layer-bloat',
        page_name: pageName,
        message: `Page "${pageName}" has ${stats.hidden}/${stats.total} hidden layers (${Math.round(stats.hidden / stats.total * 100)}%)`,
        suggestion: 'Remove unnecessary hidden layers to keep the file clean',
        detail: { total: stats.total, hidden: stats.hidden },
      });
    }
  }

  return issues;
}
