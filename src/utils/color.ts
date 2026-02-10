import type { FigmaColor } from '../figma/design_types.js';

// ── Color Conversion ─────────────────────────────────────────────────────────

/** Convert Figma color (0-1 range) to hex string */
export function figmaColorToHex(color: FigmaColor): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
}

/** Convert Figma color to CSS rgba string */
export function figmaColorToRgba(color: FigmaColor): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `rgba(${r}, ${g}, ${b}, ${color.a.toFixed(2)})`;
}

// ── WCAG Contrast Ratio ──────────────────────────────────────────────────────

/** Calculate relative luminance (WCAG 2.1) */
function relativeLuminance(color: FigmaColor): number {
  const linearize = (c: number): number =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  const r = linearize(color.r);
  const g = linearize(color.g);
  const b = linearize(color.b);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Calculate WCAG contrast ratio between two colors */
export function contrastRatio(fg: FigmaColor, bg: FigmaColor): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Check if contrast meets WCAG AA standard */
export function meetsWcagAA(ratio: number, isLargeText: boolean): boolean {
  return isLargeText ? ratio >= 3 : ratio >= 4.5;
}

/** Check if contrast meets WCAG AAA standard */
export function meetsWcagAAA(ratio: number, isLargeText: boolean): boolean {
  return isLargeText ? ratio >= 4.5 : ratio >= 7;
}

/** Determine if text is "large" per WCAG (>= 18pt or >= 14pt bold) */
export function isLargeText(fontSize?: number, fontWeight?: number): boolean {
  if (!fontSize) return false;
  if (fontSize >= 24) return true; // 18pt ≈ 24px
  if (fontSize >= 18.66 && (fontWeight ?? 400) >= 700) return true; // 14pt bold ≈ 18.66px
  return false;
}

// ── Color Comparison ─────────────────────────────────────────────────────────

/** Check if two Figma colors are equal (within tolerance) */
export function colorsEqual(a: FigmaColor, b: FigmaColor, tolerance = 0.01): boolean {
  return (
    Math.abs(a.r - b.r) <= tolerance &&
    Math.abs(a.g - b.g) <= tolerance &&
    Math.abs(a.b - b.b) <= tolerance &&
    Math.abs(a.a - b.a) <= tolerance
  );
}
