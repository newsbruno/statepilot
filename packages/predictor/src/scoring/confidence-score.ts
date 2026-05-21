export function clampConfidence(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

export function confidenceFromSuccessRate(successRate: number, successCount: number): number {
  const sampleBoost = Math.min(0.1, Math.log10(successCount + 1) * 0.08);
  return clampConfidence(successRate * 0.9 + sampleBoost);
}
