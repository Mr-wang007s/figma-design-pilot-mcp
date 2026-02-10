import { randomUUID } from 'node:crypto';
import type { FigmaNode, ReviewIssue } from '../../../figma/design_types.js';
import type { FileContext } from '../file_reader.js';

// ── Component Lint Rules ─────────────────────────────────────────────────────

const COMPONENT_NAME_PATTERN = /^[A-Z][a-zA-Z0-9]*\/[A-Z][a-zA-Z0-9]*/;

export function runComponentLint(
  node: FigmaNode,
  pageName: string,
  ctx: FileContext,
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  // Check INSTANCE nodes
  if (node.type === 'INSTANCE') {
    // Check if the main component exists
    if (node.componentId) {
      const mainComp = ctx.components[node.componentId];
      if (!mainComp) {
        issues.push({
          issue_id: randomUUID(),
          dimension: 'components',
          severity: 'error',
          rule_id: 'comp/missing-main',
          node_id: node.id,
          node_name: node.name,
          node_type: node.type,
          page_name: pageName,
          message: `Instance "${node.name}" references a missing main component (ID: ${node.componentId})`,
          suggestion: 'The main component may have been deleted. Recreate it or replace this instance.',
          detail: { componentId: node.componentId },
        });
      }
    }

    // Check for excessive overrides
    if (node.overrides && Array.isArray(node.overrides) && node.overrides.length > 5) {
      issues.push({
        issue_id: randomUUID(),
        dimension: 'components',
        severity: 'warning',
        rule_id: 'comp/excessive-overrides',
        node_id: node.id,
        node_name: node.name,
        node_type: node.type,
        page_name: pageName,
        message: `Instance "${node.name}" has ${node.overrides.length} overrides — consider creating a new variant`,
        suggestion: 'Too many overrides suggest this should be a separate component variant',
        detail: { overrideCount: node.overrides.length, threshold: 5 },
      });
    }
  }

  // Check COMPONENT naming convention
  if (node.type === 'COMPONENT') {
    if (!COMPONENT_NAME_PATTERN.test(node.name)) {
      issues.push({
        issue_id: randomUUID(),
        dimension: 'components',
        severity: 'warning',
        rule_id: 'comp/naming-convention',
        node_id: node.id,
        node_name: node.name,
        node_type: node.type,
        page_name: pageName,
        message: `Component "${node.name}" does not follow Category/Name convention`,
        suggestion: 'Rename to format like "Button/Primary" or "Icon/Search"',
        detail: { currentName: node.name, pattern: 'Category/Name' },
      });
    }
  }

  return issues;
}

/**
 * Post-traversal analysis for unused components and detached instances.
 * Run after collecting all nodes.
 */
export function runComponentAudit(
  allNodes: Array<{ node: FigmaNode; pageName: string }>,
  ctx: FileContext,
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  // Collect all referenced component IDs
  const referencedComponentIds = new Set<string>();
  const componentNodes: Array<{ node: FigmaNode; pageName: string }> = [];

  for (const { node, pageName } of allNodes) {
    if (node.type === 'INSTANCE' && node.componentId) {
      referencedComponentIds.add(node.componentId);
    }
    if (node.type === 'COMPONENT') {
      componentNodes.push({ node, pageName });
    }
  }

  // Check for unused local components
  for (const { node, pageName } of componentNodes) {
    const compMeta = Object.entries(ctx.components).find(([, meta]) => meta.name === node.name);
    const compId = compMeta?.[0] ?? node.id;
    if (!referencedComponentIds.has(compId) && !referencedComponentIds.has(node.id)) {
      issues.push({
        issue_id: randomUUID(),
        dimension: 'components',
        severity: 'info',
        rule_id: 'comp/unused-component',
        node_id: node.id,
        node_name: node.name,
        node_type: node.type,
        page_name: pageName,
        message: `Component "${node.name}" is defined but not used in this file`,
        suggestion: 'Consider removing unused components or publishing to a shared library',
        detail: { componentId: node.id },
      });
    }
  }

  return issues;
}
