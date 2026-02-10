import { randomUUID } from 'node:crypto';
import type { FigmaNode, FigmaPaint, FigmaColor, ReviewIssue } from '../../../figma/design_types.js';
import type { FileContext } from '../file_reader.js';
import { contrastRatio, meetsWcagAA, meetsWcagAAA, isLargeText } from '../../../utils/color.js';

// ── Accessibility Lint Rules ─────────────────────────────────────────────────

const MIN_FONT_SIZE = 12;
const MIN_TOUCH_TARGET = 44;

export function runA11yLint(
  node: FigmaNode,
  pageName: string,
  _ctx: FileContext,
  allNodes: Array<{ node: FigmaNode; pageName: string; depth: number }>,
  wcagLevel: 'AA' | 'AAA' = 'AA',
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  // Skip non-visual nodes
  if (['DOCUMENT', 'CANVAS'].includes(node.type)) return issues;

  // Check small text
  if (node.type === 'TEXT' && node.style?.fontSize) {
    if (node.style.fontSize < MIN_FONT_SIZE) {
      issues.push({
        issue_id: randomUUID(),
        dimension: 'a11y',
        severity: 'warning',
        rule_id: 'a11y/small-text',
        node_id: node.id,
        node_name: node.name,
        node_type: node.type,
        page_name: pageName,
        message: `Text "${truncate(node.characters ?? node.name, 30)}" has fontSize ${node.style.fontSize}px (min: ${MIN_FONT_SIZE}px)`,
        suggestion: `Increase font size to at least ${MIN_FONT_SIZE}px for readability`,
        detail: { fontSize: node.style.fontSize, minimum: MIN_FONT_SIZE },
      });
    }

    // Check text contrast ratio
    const fgColor = getFirstSolidFillColor(node);
    if (fgColor) {
      const bgColor = findParentBackgroundColor(node, allNodes);
      if (bgColor) {
        const ratio = contrastRatio(fgColor, bgColor);
        const largeText = isLargeText(node.style.fontSize, node.style.fontWeight);
        const meetsStandard = wcagLevel === 'AAA'
          ? meetsWcagAAA(ratio, largeText)
          : meetsWcagAA(ratio, largeText);

        if (!meetsStandard) {
          issues.push({
            issue_id: randomUUID(),
            dimension: 'a11y',
            severity: 'error',
            rule_id: 'a11y/contrast-ratio',
            node_id: node.id,
            node_name: node.name,
            node_type: node.type,
            page_name: pageName,
            message: `Contrast ratio ${ratio.toFixed(2)}:1 fails WCAG ${wcagLevel} (${largeText ? 'large text' : 'normal text'})`,
            suggestion: `Increase contrast to at least ${largeText ? (wcagLevel === 'AAA' ? '4.5' : '3') : (wcagLevel === 'AAA' ? '7' : '4.5')}:1`,
            detail: {
              ratio: Math.round(ratio * 100) / 100,
              wcagLevel,
              isLargeText: largeText,
              required: largeText
                ? (wcagLevel === 'AAA' ? 4.5 : 3)
                : (wcagLevel === 'AAA' ? 7 : 4.5),
            },
          });
        }
      }
    }
  }

  // Check touch target size (for interactive-looking elements)
  if (isLikelyInteractive(node) && node.absoluteBoundingBox) {
    const { width, height } = node.absoluteBoundingBox;
    if (width < MIN_TOUCH_TARGET || height < MIN_TOUCH_TARGET) {
      issues.push({
        issue_id: randomUUID(),
        dimension: 'a11y',
        severity: 'warning',
        rule_id: 'a11y/touch-target-size',
        node_id: node.id,
        node_name: node.name,
        node_type: node.type,
        page_name: pageName,
        message: `Interactive element "${node.name}" is ${Math.round(width)}×${Math.round(height)}px (min: ${MIN_TOUCH_TARGET}×${MIN_TOUCH_TARGET}px)`,
        suggestion: `Increase to at least ${MIN_TOUCH_TARGET}×${MIN_TOUCH_TARGET}px for touch accessibility`,
        detail: { width: Math.round(width), height: Math.round(height), minimum: MIN_TOUCH_TARGET },
      });
    }
  }

  return issues;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getFirstSolidFillColor(node: FigmaNode): FigmaColor | null {
  if (!node.fills || !Array.isArray(node.fills)) return null;
  for (const fill of node.fills) {
    const paint = fill as FigmaPaint;
    if (paint.type === 'SOLID' && paint.visible !== false && paint.color) {
      return paint.color;
    }
  }
  return null;
}

function findParentBackgroundColor(
  _targetNode: FigmaNode,
  allNodes: Array<{ node: FigmaNode; pageName: string; depth: number }>,
): FigmaColor | null {
  // Simple heuristic: find a nearby FRAME ancestor with a solid fill
  // Walk backwards through flattened nodes looking for a parent-like frame
  for (let i = allNodes.length - 1; i >= 0; i--) {
    const { node } = allNodes[i];
    if (node.type === 'FRAME' || node.type === 'RECTANGLE' || node.type === 'COMPONENT') {
      const bg = getFirstSolidFillColor(node);
      if (bg) return bg;
    }
  }
  // Default to white background
  return { r: 1, g: 1, b: 1, a: 1 };
}

function isLikelyInteractive(node: FigmaNode): boolean {
  const name = node.name.toLowerCase();
  return (
    node.type === 'INSTANCE' ||
    name.includes('button') ||
    name.includes('btn') ||
    name.includes('link') ||
    name.includes('tab') ||
    name.includes('toggle') ||
    name.includes('checkbox') ||
    name.includes('radio') ||
    name.includes('switch') ||
    name.includes('input')
  );
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}
