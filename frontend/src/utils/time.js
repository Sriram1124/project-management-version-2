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

