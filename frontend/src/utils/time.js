/**
 * Time formatting helpers for InternHub
 */

/**
 * Formats duration in minutes into 'Xh Ym' display format (e.g. '2h 30m').
 * For 0, empty, null, or negative input, returns '0h 0m'.
 *
 * @param {number|string} totalMinutes
 * @returns {string} Formatted hours and minutes string
 */
export const formatHoursMinutes = (totalMinutes) => {
  const mins = Math.max(0, Math.floor(Number(totalMinutes) || 0));
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
};

/**
 * Calculates cutoff timestamp for an active work session.
 * Cutoff is 18:15 IST (12:45 UTC) on the day the session started.
 * If the session started at or after 18:15 IST, allows up to 4 hours.
 */
export const getSessionCutoffMs = (startedAt) => {
  if (!startedAt) return null;
  const started = new Date(startedAt);
  if (isNaN(started.getTime())) return null;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(started).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)])
  );
  // 18:15 IST is UTC 12:45
  const cutoffUtc = Date.UTC(parts.year, parts.month - 1, parts.day, 12, 45, 0, 0);
  if (started.getTime() < cutoffUtc) {
    return cutoffUtc;
  }
  return started.getTime() + 4 * 60 * 60 * 1000;
};

/**
 * Formats live elapsed time as HH:MM:SS clamped to 18:15 IST cutoff
 */
export const formatElapsed = (startedAt) => {
  if (!startedAt) return '00:00:00';
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const cutoff = getSessionCutoffMs(startedAt);
  const effectiveEnd = cutoff && now > cutoff ? cutoff : now;
  const diffSecs = Math.max(0, Math.floor((effectiveEnd - start) / 1000));
  const hrs = Math.floor(diffSecs / 3600);
  const mins = Math.floor((diffSecs % 3600) / 60);
  const secs = diffSecs % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

