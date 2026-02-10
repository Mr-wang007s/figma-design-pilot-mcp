import { randomUUID } from 'node:crypto';
import type { FigmaNode, FigmaPaint, ReviewIssue } from '../../../figma/design_types.js';
import type { FileContext } from '../file_reader.js';
import { figmaColorToHex } from '../../../utils/color.js';

// ── Color Lint Rules ─────────────────────────────────────────────────────────

export function runColorLint(
  node: FigmaNode,
  pageName: string,
  ctx: FileContext,
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  // Skip non-visual nodes
  if (['DOCUMENT', 'CANVAS'].includes(node.type)) return issues;

  // Check fills
  if (node.fills && Array.isArray(node.fills)) {
    for (let i = 0; i < node.fills.length; i++) {
      const fill = node.fills[i] as FigmaPaint;
      if (fill.visible === false) continue;

      if (fill.type === 'SOLID' && fill.color) {
        const isBound = hasBoundVariable(node, 'fills', i);
        if (!isBound) {
          const hex = figmaColorToHex(fill.color);
          issues.push({
            issue_id: randomUUID(),
            dimension: 'colors',
            severity: 'error',
            rule_id: 'color/hardcoded-fill',
            node_id: node.id,
            node_name: node.name,
            node_type: node.type,
            page_name: pageName,
            message: `Hardcoded fill color ${hex} — not bound to a variable`,
            suggestion: 'Bind this fill to a color variable from your design system',
            detail: { property: 'fill', index: i, color: hex, rgba: fill.color },
          });
        }
      }

      if (fill.type.startsWith('GRADIENT_')) {
        const isBound = hasBoundVariable(node, 'fills', i);
        if (!isBound) {
          issues.push({
            issue_id: randomUUID(),
            dimension: 'colors',
            severity: 'warning',
            rule_id: 'color/hardcoded-gradient',
            node_id: node.id,
            node_name: node.name,
            node_type: node.type,
            page_name: pageName,
            message: 'Hardcoded gradient fill — not bound to a variable',
            suggestion: 'Consider binding gradient colors to variables',
            detail: { property: 'fill', index: i, type: fill.type },
          });
        }
      }
    }
  }

  // Check strokes
  if (node.strokes && Array.isArray(node.strokes)) {
    for (let i = 0; i < node.strokes.length; i++) {
      const stroke = node.strokes[i] as FigmaPaint;
      if (stroke.visible === false) continue;

      if (stroke.type === 'SOLID' && stroke.color) {
        const isBound = hasBoundVariable(node, 'strokes', i);
        if (!isBound) {
          const hex = figmaColorToHex(stroke.color);
          issues.push({
            issue_id: randomUUID(),
            dimension: 'colors',
            severity: 'warning',
            rule_id: 'color/hardcoded-stroke',
            node_id: node.id,
            node_name: node.name,
            node_type: node.type,
            page_name: pageName,
            message: `Hardcoded stroke color ${hex} — not bound to a variable`,
            suggestion: 'Bind this stroke to a color variable',
            detail: { property: 'stroke', index: i, color: hex },
          });
        }
      }
    }
  }

  // Check effects (shadow colors)
  if (node.effects && Array.isArray(node.effects)) {
    for (const effect of node.effects) {
      if (effect.visible === false) continue;
      if ((effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') && effect.color) {
        const effectsBound = node.boundVariables?.['effects'];
        if (!effectsBound) {
          const hex = figmaColorToHex(effect.color);
          issues.push({
            issue_id: randomUUID(),
            dimension: 'colors',
            severity: 'warning',
            rule_id: 'color/hardcoded-effect',
            node_id: node.id,
            node_name: node.name,
            node_type: node.type,
            page_name: pageName,
            message: `Hardcoded shadow color ${hex} — not bound to a variable`,
            suggestion: 'Bind shadow color to an effect variable',
            detail: { property: 'effect', type: effect.type, color: hex },
          });
        }
      }
    }
  }

  // Check opacity without token
  if (node.opacity !== undefined && node.opacity < 1) {
    const opacityBound = node.boundVariables?.['opacity'];
    if (!opacityBound) {
      issues.push({
        issue_id: randomUUID(),
        dimension: 'colors',
        severity: 'warning',
        rule_id: 'color/opacity-without-token',
        node_id: node.id,
        node_name: node.name,
        node_type: node.type,
        page_name: pageName,
        message: `Opacity ${(node.opacity * 100).toFixed(0)}% — not bound to a variable`,
        suggestion: 'Use a semantic opacity token instead of hardcoded value',
        detail: { property: 'opacity', value: node.opacity },
      });
    }
  }

  return issues;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hasBoundVariable(node: FigmaNode, property: string, _index: number): boolean {
  if (!node.boundVariables) return false;
  const bound = node.boundVariables[property];
  if (!bound) return false;
  // Could be a single alias or array of aliases
  if (Array.isArray(bound)) return bound.length > 0;
  if (typeof bound === 'object' && 'type' in bound) return true;
  return Object.keys(bound).length > 0;
}
