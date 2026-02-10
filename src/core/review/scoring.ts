import type { ReviewIssue } from '../../figma/design_types.js';

// ── Review Scoring ───────────────────────────────────────────────────────────

export function computeScore(issues: ReviewIssue[]): { score: number; grade: 'A' | 'B' | 'C' | 'D' | 'F' } {
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  for (const issue of issues) {
    switch (issue.severity) {
      case 'error': errorCount++; break;
      case 'warning': warningCount++; break;
      case 'info': infoCount++; break;
    }
  }

  const score = Math.max(0, Math.round(100 - (errorCount * 3) - (warningCount * 1) - (infoCount * 0.1)));

  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (score >= 90) grade = 'A';
  else if (score >= 75) grade = 'B';
  else if (score >= 60) grade = 'C';
  else if (score >= 40) grade = 'D';
  else grade = 'F';

  return { score, grade };
}
