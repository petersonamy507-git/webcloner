/**
 * Progress lines for long jobs. The backend reads stderr live and turns lines
 * starting with "@@progress " into job status; everything else stays a log line.
 */
let lastPercent = -1;

export function reportProgress(percent, stage, extra = {}) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  if (value < lastPercent) return;
  lastPercent = value;
  process.stderr.write(`@@progress ${JSON.stringify({ percent: value, stage, ...extra })}\n`);
}

/** Map step `done` of `total` into the [from, to] percent range. */
export function rangeProgress(from, to, done, total, stage) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  reportProgress(from + (to - from) * ratio, stage);
}
