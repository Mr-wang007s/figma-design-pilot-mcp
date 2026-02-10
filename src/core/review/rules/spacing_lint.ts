import { randomUUID } from 'node:crypto';
import type { FigmaNode, ReviewIssue } from '../../../figma/design_types.js';
import type { FileContext } from '../file_reader.js';

// ── Spacing Lint Rules ───────────────────────────────────────────────────────

const DEFAULT_GRID_BASE = 8;

export function runSpacingLint(
  node: FigmaNode,
  pageName: string,
  _ctx: FileContext,
  gridBase: number = DEFAULT_GRID_BASE,
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  // Skip non-layout nodes
  if (['DOCUMENT', 'CANVAS'].includes(node.type)) return issues;

  const bv = node.boundVariables ?? {};

  // Check padding values
  const paddingProps = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const;
  for (const prop of paddingProps) {
    const value = node[prop];
    if (value !== undefined && value !== 0) {
      if (!bv[prop]) {
        issues.push({
          issue_id: randomUUID(),
          dimension: 'spacing',
          severity: 'error',
          rule_id: 'spacing/hardcoded-padding',
          node_id: node.id,
          node_name: node.name,
          node_type: node.type,
          page_name: pageName,
          message: `Hardcoded ${prop}: ${value}px — not bound to a variable`,
          suggestion: `Bind ${prop} to a spacing variable`,
          detail: { property: prop, value },
        });
      }

      // Off-grid check
      if (value % gridBase !== 0) {
        const nearest = Math.round(value / gridBase) * gridBase;
        issues.push({
          issue_id: randomUUID(),
          dimension: 'spacing',
          severity: 'warning',
          rule_id: 'spacing/off-grid',
          node_id: node.id,
          node_name: node.name,
          node_type: node.type,
          page_name: pageName,
          message: `${prop}: ${value}px is not on the ${gridBase}px grid (nearest: ${nearest}px)`,
          suggestion: `Change to ${nearest}px to align with the ${gridBase}px grid`,
          detail: { property: prop, value, gridBase, nearest },
        });
      }
    }
  }

  // Check item spacing (gap)
  if (node.itemSpacing !== undefined && node.itemSpacing !== 0) {
    if (!bv['itemSpacing']) {
      issues.push({
        issue_id: randomUUID(),
        dimension: 'spacing',
        severity: 'error',
        rule_id: 'spacing/hardcoded-gap',
        node_id: node.id,
        node_name: node.name,
        node_type: node.type,
        page_name: pageName,
        message: `Hardcoded itemSpacing: ${node.itemSpacing}px — not bound to a variable`,
        suggestion: 'Bind itemSpacing to a spacing variable',
        detail: { property: 'itemSpacing', value: node.itemSpacing },
      });
    }

    if (node.itemSpacing % gridBase !== 0) {
      const nearest = Math.round(node.itemSpacing / gridBase) * gridBase;
      issues.push({
        issue_id: randomUUID(),
        dimension: 'spacing',
        severity: 'warning',
        rule_id: 'spacing/off-grid',
        node_id: node.id,
        node_name: node.name,
        node_type: node.type,
        page_name: pageName,
        message: `itemSpacing: ${node.itemSpacing}px is not on the ${gridBase}px grid`,
        suggestion: `Change to ${nearest}px`,
        detail: { property: 'itemSpacing', value: node.itemSpacing, gridBase, nearest },
      });
    }
  }

  // Check corner radius
  if (node.cornerRadius !== undefined && node.cornerRadius !== 0) {
    if (!bv['cornerRadius']) {
      issues.push({
        issue_id: randomUUID(),
        dimension: 'spacing',
        severity: 'warning',
        rule_id: 'spacing/hardcoded-radius',
        node_id: node.id,
        node_name: node.name,
        node_type: node.type,
        page_name: pageName,
        message: `Hardcoded cornerRadius: ${node.cornerRadius}px — not bound to a variable`,
        suggestion: 'Bind cornerRadius to a radius variable',
        detail: { property: 'cornerRadius', value: node.cornerRadius },
      });
    }
  }

  // Check for missing Auto Layout on FRAME nodes with children
  if (node.type === 'FRAME' && node.children && node.children.length > 0) {
    if (!node.layoutMode || node.layoutMode === 'NONE') {
      issues.push({
        issue_id: randomUUID(),
        dimension: 'spacing',
        severity: 'warning',
        rule_id: 'spacing/no-auto-layout',
        node_id: node.id,
        node_name: node.name,
        node_type: node.type,
        page_name: pageName,
        message: `Frame "${node.name}" has ${node.children.length} children but no Auto Layout`,
        suggestion: 'Enable Auto Layout for responsive and maintainable layouts',
        detail: { childCount: node.children.length },
      });
    }
  }

  return issues;
}
