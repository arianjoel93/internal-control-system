export type AxisScale = {
  toPlot: (value: number) => number;
  fromPlot: (position: number) => number;
};

export function cappedMarginPercent(marginPct: number, capPct: number): number {
  return Math.min(Math.max(0, marginPct), Math.max(1, capPct));
}

// Keep the business threshold at the center while compressing outliers on either side.
export function createBalancedAxis(min: number, threshold: number, max: number): AxisScale {
  const lower = Math.min(min, threshold - 0.001);
  const upper = Math.max(max, threshold + 0.001);
  const exponent = 0.68;
  return {
    toPlot(value) {
      if (value < threshold) return 0.5 * Math.pow(Math.max(0, (value - lower) / (threshold - lower)), exponent);
      return 0.5 + 0.5 * Math.pow(Math.min(1, (value - threshold) / (upper - threshold)), exponent);
    },
    fromPlot(position) {
      if (position < 0.5) return lower + (threshold - lower) * Math.pow(Math.max(0, position * 2), 1 / exponent);
      return threshold + (upper - threshold) * Math.pow(Math.min(1, (position - 0.5) * 2), 1 / exponent);
    },
  };
}
