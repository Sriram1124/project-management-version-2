/**
 * Kanban Metrics Calculation Utility
 *
 * Authoritatively calculates real-time summary metrics for Kanban/Scrum boards
 * from task lifecycle timestamps and workflow status definitions.
 */

export function calculateKanbanMetrics(tasks = []) {
  const safeTasks = Array.isArray(tasks) ? tasks.filter((t) => t && t.type !== 'EPIC') : [];
  const total = safeTasks.length;
  const completed = safeTasks.filter((t) => t.status === 'COMPLETED').length;
  const inProgressWip = safeTasks.filter(
    (t) => t.status === 'IN_PROGRESS' || t.status === 'IN_REVIEW'
  ).length;
  const blocked = safeTasks.filter((t) => t.status === 'BLOCKED').length;
  const todo = safeTasks.filter((t) => t.status === 'TODO').length;

  // Filter completed items with valid start and end lifecycle timestamps
  const completedWithDates = safeTasks.filter((t) => {
    if (t.status !== 'COMPLETED') return false;
    const start = t.start_date || t.created_at;
    const end = t.completed_at || t.updated_at;
    if (!start || !end) return false;
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    return !isNaN(s) && !isNaN(e) && e >= s;
  });

  let avgCycleTimeFormatted = null;
  let avgCycleTimeHours = null;
  let avgCycleTimeDays = null;

  if (completedWithDates.length > 0) {
    const totalMs = completedWithDates.reduce((sum, t) => {
      const s = new Date(t.start_date || t.created_at).getTime();
      const e = new Date(t.completed_at || t.updated_at).getTime();
      return sum + (e - s);
    }, 0);
    const avgMs = totalMs / completedWithDates.length;
    avgCycleTimeHours = +(avgMs / (1000 * 60 * 60)).toFixed(1);
    avgCycleTimeDays = +(avgMs / (1000 * 60 * 60 * 24)).toFixed(1);

    if (avgCycleTimeDays < 1) {
      const avgHours = Math.round(avgCycleTimeHours);
      avgCycleTimeFormatted = `${avgHours < 1 && avgMs > 0 ? '<1' : avgHours}h avg cycle`;
    } else {
      const roundedD = +(avgCycleTimeDays.toFixed(1));
      avgCycleTimeFormatted = `${roundedD % 1 === 0 ? Math.round(roundedD) : roundedD}d avg cycle`;
    }
  }

  return {
    total,
    completed,
    inProgressWip,
    blocked,
    todo,
    avgCycleTimeHours,
    avgCycleTimeDays,
    avgCycleTimeFormatted,
    avgCycleTimeDisplay: avgCycleTimeFormatted ? `~${avgCycleTimeFormatted}` : '—',
  };
}

