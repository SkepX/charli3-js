export interface AggregateOptions {
  iqrMultiplier?: number;
  divergencyFactor?: number;
}

export interface AggregateOutput<T extends { value: number }> {
  median: number;
  nonOutliers: T[];
  outliers: T[];
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n % 2 === 1) return sorted[Math.floor(n / 2)];
  return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

export function aggregate<T extends { value: number }>(
  feeds: T[],
  opts: AggregateOptions = {},
): AggregateOutput<T> {
  const multiplier = opts.iqrMultiplier ?? 1.5;
  const divergency = opts.divergencyFactor ?? 0.03;

  if (feeds.length === 0) {
    return { median: NaN, nonOutliers: [], outliers: [] };
  }

  const sortedValues = feeds.map((f) => f.value).sort((a, b) => a - b);
  const med = median(sortedValues);

  if (feeds.length === 1) {
    return { median: med, nonOutliers: [...feeds], outliers: [] };
  }

  let lower: number;
  let upper: number;

  if (feeds.length < 4) {
    lower = med - divergency * Math.abs(med);
    upper = med + divergency * Math.abs(med);
  } else {
    const n = sortedValues.length;
    const q1 = sortedValues[Math.floor(n * 0.25)];
    const q3 = sortedValues[Math.floor(n * 0.75)];
    const iqr = q3 - q1;

    if (iqr === 0) {
      lower = med - divergency * Math.abs(med);
      upper = med + divergency * Math.abs(med);
    } else {
      lower = q1 - multiplier * iqr;
      upper = q3 + multiplier * iqr;
    }
  }

  const nonOutliers: T[] = [];
  const outliers: T[] = [];
  for (const f of feeds) {
    if (f.value >= lower && f.value <= upper) nonOutliers.push(f);
    else outliers.push(f);
  }

  return { median: med, nonOutliers, outliers };
}
