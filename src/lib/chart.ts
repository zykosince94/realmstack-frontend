// Pure helpers for the Dashboard's hand-drawn SVG charts (no chart library: two small
// single-series charts do not justify a dependency).

/**
 * A clean y-axis for counts: a "nice" top (1, 2 or 5 × a power of ten per step) at or
 * above max, and the ticks from 0 to it. Counts are whole numbers, so the step is at least
 * 1, and an all-zero series still gets a visible axis (0–4).
 */
export function niceScale(max: number, targetTicks = 4): { max: number; ticks: number[] } {
  const raw = Math.max(max, 1) / targetTicks;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, ([1, 2, 5, 10].find((m) => m * power >= raw) ?? 10) * power);
  const top = max <= 0 ? step * targetTicks : step * Math.ceil(max / step);
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
  return { max: top, ticks };
}

/** Axis numbers: in full under 10,000, compact (12K, 1.2M) above, as the dataviz spec asks. */
export function formatCount(value: number): string {
  if (Math.abs(value) < 10_000) return value.toLocaleString();
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** A column with a 4px rounded data end and a square base, growing up from baseY. */
export function columnPath(x: number, width: number, topY: number, baseY: number, radius = 4): string {
  const height = baseY - topY;
  if (height <= 0) return "";
  const r = Math.min(radius, width / 2, height);
  return `M${x},${baseY}V${topY + r}Q${x},${topY} ${x + r},${topY}H${x + width - r}Q${x + width},${topY} ${x + width},${topY + r}V${baseY}Z`;
}

/** Index of the data point nearest to a pointer, given its x inside the plot (0..plotWidth). */
export function nearestIndex(plotX: number, plotWidth: number, count: number): number {
  if (count <= 1 || plotWidth <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round((plotX / plotWidth) * (count - 1))));
}
