import { randomUUID } from 'node:crypto';
import type { FigmaNode, ReviewIssue } from '../../../figma/design_types.js';
import type { FileContext } from '../file_reader.js';

// ── Typography Lint Rules ────────────────────────────────────────────────────

export function runTypographyLint(
  node: FigmaNode,
  pageName: string,
  ctx: FileContext,
  allowedFonts?: string[],
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  // Only check TEXT nodes
  if (node.type !== 'TEXT') return issues;

  const bv = node.boundVariables ?? {};
  const typeStyle = node.style;

  // Check for missing text style
  if (!node.styles?.['text']) {
    issues.push({
      issue_id: randomUUID(),
      dimension: 'typography',
      severity: 'error',
      rule_id: 'typo/no-text-style',
      node_id: node.id,
      node_name: node.name,
      node_type: node.type,
      page_name: pageName,
      message: `Text "${truncate(node.characters ?? node.name, 40)}" has no Text Style applied`,
      suggestion: 'Apply a shared Text Style from your design system',
      detail: {
        fontSize: typeStyle?.fontSize,
        fontFamily: typeStyle?.fontFamily,
        fontWeight: typeStyle?.fontWeight,
      },
    });
  }

  if (!typeStyle) return issues;

  // Check hardcoded font size
  if (typeStyle.fontSize && !bv['fontSize']) {
    issues.push({
      issue_id: randomUUID(),
      dimension: 'typography',
      severity: 'error',
      rule_id: 'typo/hardcoded-font-size',
      node_id: node.id,
      node_name: node.name,
      node_type: node.type,
      page_name: pageName,
      message: `Hardcoded fontSize: ${typeStyle.fontSize}px — not bound to a variable`,
      suggestion: 'Bind fontSize to a typography variable',
      detail: { property: 'fontSize', value: typeStyle.fontSize },
    });
  }

  // Check hardcoded line height
  if (typeStyle.lineHeightPx && !bv['lineHeight']) {
    issues.push({
      issue_id: randomUUID(),
      dimension: 'typography',
      severity: 'warning',
      rule_id: 'typo/hardcoded-line-height',
      node_id: node.id,
      node_name: node.name,
      node_type: node.type,
      page_name: pageName,
      message: `Hardcoded lineHeight: ${typeStyle.lineHeightPx}px — not bound to a variable`,
      suggestion: 'Bind lineHeight to a typography variable',
      detail: { property: 'lineHeight', value: typeStyle.lineHeightPx },
    });
  }

  // Check font family against allowed list
  if (allowedFonts && allowedFonts.length > 0 && typeStyle.fontFamily) {
    if (!allowedFonts.includes(typeStyle.fontFamily)) {
      issues.push({
        issue_id: randomUUID(),
        dimension: 'typography',
        severity: 'error',
        rule_id: 'typo/invalid-font-family',
        node_id: node.id,
        node_name: node.name,
        node_type: node.type,
        page_name: pageName,
        message: `Font family "${typeStyle.fontFamily}" is not in the allowed list`,
        suggestion: `Use one of: ${allowedFonts.join(', ')}`,
        detail: {
          property: 'fontFamily',
          value: typeStyle.fontFamily,
          allowed: allowedFonts,
        },
      });
    }
  }

  // Check text fill color (TEXT nodes have fills for text color)
  if (node.fills && Array.isArray(node.fills) && node.fills.length > 0) {
    const hasColorBound = bv['fills'];
    if (!hasColorBound) {
      issues.push({
        issue_id: randomUUID(),
        dimension: 'typography',
        severity: 'error',
        rule_id: 'typo/text-color-hardcoded',
        node_id: node.id,
        node_name: node.name,
        node_type: node.type,
        page_name: pageName,
        message: `Text color is hardcoded — not bound to a variable`,
        suggestion: 'Bind text color to a color variable',
        detail: { property: 'fills' },
      });
    }
  }

  return issues;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}
