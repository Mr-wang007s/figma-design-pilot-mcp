import { randomUUID } from 'node:crypto';
import type { FigmaNode, ReviewIssue, TokenCoverageStats } from '../../../figma/design_types.js';
import type { FileContext } from '../file_reader.js';

// ── Token Coverage Analysis ──────────────────────────────────────────────────

interface TokenCounter {
  total: number;
  bound: number;
}

interface TokenCounters {
  fills: TokenCounter;
  strokes: TokenCounter;
  spacing: TokenCounter;
  typography: TokenCounter;
  effects: TokenCounter;
  radius: TokenCounter;
}

export function runTokenCoverage(
  node: FigmaNode,
  pageName: string,
  _ctx: FileContext,
): { issues: ReviewIssue[]; counters: TokenCounters } {
  const issues: ReviewIssue[] = [];
  const counters: TokenCounters = {
    fills: { total: 0, bound: 0 },
    strokes: { total: 0, bound: 0 },
    spacing: { total: 0, bound: 0 },
    typography: { total: 0, bound: 0 },
    effects: { total: 0, bound: 0 },
    radius: { total: 0, bound: 0 },
  };

  if (['DOCUMENT', 'CANVAS'].includes(node.type)) {
    return { issues, counters };
  }

  const bv = node.boundVariables ?? {};

  // Fills
  if (node.fills && Array.isArray(node.fills)) {
    const visibleFills = node.fills.filter((f) => f.visible !== false);
    if (visibleFills.length > 0) {
      counters.fills.total += visibleFills.length;
      if (bv['fills']) {
        const boundArr = Array.isArray(bv['fills']) ? bv['fills'] : [bv['fills']];
        counters.fills.bound += Math.min(boundArr.length, visibleFills.length);
      }
      if (!bv['fills'] && visibleFills.length > 0) {
        issues.push({
          issue_id: randomUUID(),
          dimension: 'token_coverage',
          severity: 'error',
          rule_id: 'token/fill-unbound',
          node_id: node.id,
          node_name: node.name,
          node_type: node.type,
          page_name: pageName,
          message: `${visibleFills.length} fill(s) not bound to variables`,
          detail: { property: 'fills', count: visibleFills.length },
        });
      }
    }
  }

  // Strokes
  if (node.strokes && Array.isArray(node.strokes)) {
    const visibleStrokes = node.strokes.filter((s) => s.visible !== false);
    if (visibleStrokes.length > 0) {
      counters.strokes.total += visibleStrokes.length;
      if (bv['strokes']) {
        const boundArr = Array.isArray(bv['strokes']) ? bv['strokes'] : [bv['strokes']];
        counters.strokes.bound += Math.min(boundArr.length, visibleStrokes.length);
      }
      if (!bv['strokes']) {
        issues.push({
          issue_id: randomUUID(),
          dimension: 'token_coverage',
          severity: 'error',
          rule_id: 'token/stroke-unbound',
          node_id: node.id,
          node_name: node.name,
          node_type: node.type,
          page_name: pageName,
          message: `${visibleStrokes.length} stroke(s) not bound to variables`,
          detail: { property: 'strokes', count: visibleStrokes.length },
        });
      }
    }
  }

  // Spacing (padding + gap)
  const spacingProps = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'itemSpacing'] as const;
  for (const prop of spacingProps) {
    const value = node[prop];
    if (value !== undefined && value !== 0) {
      counters.spacing.total++;
      if (bv[prop]) {
        counters.spacing.bound++;
      } else {
        issues.push({
          issue_id: randomUUID(),
          dimension: 'token_coverage',
          severity: 'warning',
          rule_id: 'token/spacing-unbound',
          node_id: node.id,
          node_name: node.name,
          node_type: node.type,
          page_name: pageName,
          message: `${prop}: ${value}px not bound to a variable`,
          detail: { property: prop, value },
        });
      }
    }
  }

  // Corner radius
  if (node.cornerRadius !== undefined && node.cornerRadius !== 0) {
    counters.radius.total++;
    if (bv['cornerRadius']) {
      counters.radius.bound++;
    } else {
      issues.push({
        issue_id: randomUUID(),
        dimension: 'token_coverage',
        severity: 'warning',
        rule_id: 'token/radius-unbound',
        node_id: node.id,
        node_name: node.name,
        node_type: node.type,
        page_name: pageName,
        message: `cornerRadius: ${node.cornerRadius}px not bound to a variable`,
        detail: { property: 'cornerRadius', value: node.cornerRadius },
      });
    }
  }

  // Typography (fontSize on TEXT nodes)
  if (node.type === 'TEXT' && node.style?.fontSize) {
    counters.typography.total++;
    if (bv['fontSize']) {
      counters.typography.bound++;
    } else {
      issues.push({
        issue_id: randomUUID(),
        dimension: 'token_coverage',
        severity: 'warning',
        rule_id: 'token/font-size-unbound',
        node_id: node.id,
        node_name: node.name,
        node_type: node.type,
        page_name: pageName,
        message: `fontSize: ${node.style.fontSize}px not bound to a variable`,
        detail: { property: 'fontSize', value: node.style.fontSize },
      });
    }
  }

  // Effects
  if (node.effects && Array.isArray(node.effects)) {
    const visibleEffects = node.effects.filter((e) => e.visible !== false);
    if (visibleEffects.length > 0) {
      counters.effects.total += visibleEffects.length;
      if (bv['effects']) {
        counters.effects.bound += visibleEffects.length;
      } else {
        issues.push({
          issue_id: randomUUID(),
          dimension: 'token_coverage',
          severity: 'warning',
          rule_id: 'token/effect-unbound',
          node_id: node.id,
          node_name: node.name,
          node_type: node.type,
          page_name: pageName,
          message: `${visibleEffects.length} effect(s) not bound to variables`,
          detail: { property: 'effects', count: visibleEffects.length },
        });
      }
    }
  }

  return { issues, counters };
}

/** Merge token counters from multiple nodes */
export function mergeCounters(target: TokenCounters, source: TokenCounters): void {
  for (const key of Object.keys(target) as Array<keyof TokenCounters>) {
    target[key].total += source[key].total;
    target[key].bound += source[key].bound;
  }
}

/** Convert token counters to coverage stats */
export function computeCoverageStats(counters: TokenCounters): TokenCoverageStats {
  const totalBound = Object.values(counters).reduce((s, c) => s + c.bound, 0);
  const totalAll = Object.values(counters).reduce((s, c) => s + c.total, 0);

  const by_category: Record<string, { bound: number; total: number; percentage: number }> = {};
  for (const [key, counter] of Object.entries(counters)) {
    by_category[key] = {
      bound: counter.bound,
      total: counter.total,
      percentage: counter.total > 0 ? Math.round((counter.bound / counter.total) * 1000) / 10 : 100,
    };
  }

  return {
    percentage: totalAll > 0 ? Math.round((totalBound / totalAll) * 1000) / 10 : 100,
    bound: totalBound,
    total: totalAll,
    by_category,
  };
}

/** Create empty counters */
export function createEmptyCounters(): TokenCounters {
  return {
    fills: { total: 0, bound: 0 },
    strokes: { total: 0, bound: 0 },
    spacing: { total: 0, bound: 0 },
    typography: { total: 0, bound: 0 },
    effects: { total: 0, bound: 0 },
    radius: { total: 0, bound: 0 },
  };
}
