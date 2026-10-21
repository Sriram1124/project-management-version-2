/**
 * Authoritative Date & Calendar Utility for InternHub Timesheets
 *
 * Implements strict calendar-week (Monday to Sunday) and calendar-month
 * boundaries, robust against timezone differences, leap years, and month/year boundaries.
 */

/**
 * Format a Date object to YYYY-MM-DD in local time
 * @param {Date|string} d
 * @returns {string}
 */
export const toLocalDateString = (d) => {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Parse a 'YYYY-MM-DD' or ISO string safely into a local Date object set to 00:00:00.000
 * @param {string|Date} dateStr
 * @returns {Date}
 */
export const parseLocalDate = (dateStr) => {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return new Date(dateStr.getFullYear(), dateStr.getMonth(), dateStr.getDate());
  
  // If it's a string like '2026-10-12' or '2026-10-12T...'
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  const fallback = new Date(dateStr);
  return Number.isNaN(fallback.getTime()) ? new Date() : new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/**
 * Check if two dates belong to the exact same calendar day
 */
export const isSameDay = (d1, d2) => {
  if (!d1 || !d2) return false;
  const a = d1 instanceof Date ? d1 : parseLocalDate(d1);
  const b = d2 instanceof Date ? d2 : parseLocalDate(d2);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
};

/**
 * Get authoritative Calendar Week Range (Monday to Sunday)
 *
 * @param {Date|string} referenceDate
 * @returns {Object}
 */
export const getCalendarWeekRange = (referenceDate = new Date()) => {
  const ref = parseLocalDate(referenceDate);
  const today = parseLocalDate(new Date());

  // Monday = 1, Sunday = 0
  const dayOfWeek = ref.getDay();
  const diffToMonday = (dayOfWeek + 6) % 7; // Monday = 0, Tuesday = 1, ..., Sunday = 6

  const startOfWeek = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - diffToMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  const start_date = toLocalDateString(startOfWeek);
  const end_date = toLocalDateString(endOfWeek);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const current = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + i);
    const dateStr = toLocalDateString(current);
    const dow = current.getDay();
    days.push({
      date: dateStr,
      dateObj: current,
      dayName: DAY_NAMES[dow],
      dayNumber: current.getDate(),
      isWeekend: dow === 0 || dow === 6,
      isToday: isSameDay(current, today),
    });
  }

  // Determine if this is the current calendar week
  const isCurrentWeek = today >= startOfWeek && today <= endOfWeek;

  // Format label
  const sMonth = MONTH_SHORT[startOfWeek.getMonth()];
  const eMonth = MONTH_SHORT[endOfWeek.getMonth()];
  const sYear = startOfWeek.getFullYear();
  const eYear = endOfWeek.getFullYear();

  let formattedRange = '';
  if (sYear !== eYear) {
    formattedRange = `${sMonth} ${startOfWeek.getDate()}, ${sYear} – ${eMonth} ${endOfWeek.getDate()}, ${eYear}`;
  } else if (sMonth !== eMonth) {
    formattedRange = `${sMonth} ${startOfWeek.getDate()} – ${eMonth} ${endOfWeek.getDate()}, ${sYear}`;
  } else {
    formattedRange = `${sMonth} ${startOfWeek.getDate()}–${endOfWeek.getDate()}, ${sYear}`;
  }

  return {
    startDate: startOfWeek,
    endDate: endOfWeek,
    start_date,
    end_date,
    startDateStr: start_date,
    endDateStr: end_date,
    days,
    isCurrentWeek,
    formattedRange,
    // Label for navigation button: "This Week" if current, or formatted date range if historical/future
    navLabel: isCurrentWeek ? 'This Week' : formattedRange,
    periodTitle: isCurrentWeek ? `This Week (${formattedRange})` : formattedRange,
  };
};

/**
 * Get authoritative Calendar Month Range and its 4-6 Calendar Week Groups
 *
 * @param {Date|string} referenceDate
 * @returns {Object}
 */
export const getCalendarMonthRange = (referenceDate = new Date()) => {
  const ref = parseLocalDate(referenceDate);
  const today = parseLocalDate(new Date());

  const year = ref.getFullYear();
  const month = ref.getMonth(); // 0-indexed (0 = Jan, 9 = Oct)

  const startOfMonth = new Date(year, month, 1);
  startOfMonth.setHours(0, 0, 0, 0);

  // Last day of month is day 0 of next month
  const endOfMonth = new Date(year, month + 1, 0);
  endOfMonth.setHours(23, 59, 59, 999);

  const start_date = toLocalDateString(startOfMonth);
  const end_date = toLocalDateString(endOfMonth);

  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const monthName = `${MONTH_NAMES[month]} ${year}`;
  const monthShort = MONTH_SHORT[month];

  // Calendar week groups:
  // Starts at the Monday of the week containing day 1
  const firstDayDow = startOfMonth.getDay();
  const diffToMonday = (firstDayDow + 6) % 7;
  const firstWeekMonday = new Date(year, month, 1 - diffToMonday);

  const weeks = [];
  let currentMonday = new Date(firstWeekMonday.getFullYear(), firstWeekMonday.getMonth(), firstWeekMonday.getDate());
  let weekIndex = 1;

  while (currentMonday <= endOfMonth) {
    const weekSunday = new Date(currentMonday.getFullYear(), currentMonday.getMonth(), currentMonday.getDate() + 6);
    weekSunday.setHours(23, 59, 59, 999);

    const weekStartDateStr = toLocalDateString(currentMonday);
    const weekEndDateStr = toLocalDateString(weekSunday);

    const days = [];
    let daysInMonthCount = 0;
    let firstInMonthDate = null;
    let lastInMonthDate = null;

    for (let i = 0; i < 7; i++) {
      const cur = new Date(currentMonday.getFullYear(), currentMonday.getMonth(), currentMonday.getDate() + i);
      const dateStr = toLocalDateString(cur);
      const dow = cur.getDay();
      const inMonth = cur >= startOfMonth && cur <= endOfMonth;

      if (inMonth) {
        daysInMonthCount++;
        if (!firstInMonthDate) firstInMonthDate = cur;
        lastInMonthDate = cur;
      }

      days.push({
        date: dateStr,
        dateObj: cur,
        dayName: DAY_NAMES[dow],
        dayNumber: cur.getDate(),
        inMonth,
        isWeekend: dow === 0 || dow === 6,
        isToday: isSameDay(cur, today),
      });
    }

    // Format week label
    let weekLabel = `Week ${weekIndex}`;
    if (firstInMonthDate && lastInMonthDate) {
      const sM = MONTH_SHORT[firstInMonthDate.getMonth()];
      const eM = MONTH_SHORT[lastInMonthDate.getMonth()];
      if (sM === eM) {
        if (firstInMonthDate.getDate() === lastInMonthDate.getDate()) {
          weekLabel = `Week ${weekIndex} (${sM} ${firstInMonthDate.getDate()})`;
        } else {
          weekLabel = `Week ${weekIndex} (${sM} ${firstInMonthDate.getDate()}–${lastInMonthDate.getDate()})`;
        }
      } else {
        weekLabel = `Week ${weekIndex} (${sM} ${firstInMonthDate.getDate()} – ${eM} ${lastInMonthDate.getDate()})`;
      }
    }

    weeks.push({
      weekNumber: weekIndex,
      startDate: currentMonday,
      endDate: weekSunday,
      start_date: weekStartDateStr,
      end_date: weekEndDateStr,
      startDateStr: weekStartDateStr,
      endDateStr: weekEndDateStr,
      label: weekLabel,
      days,
      daysInMonthCount,
    });

    // Advance to next Monday
    currentMonday = new Date(currentMonday.getFullYear(), currentMonday.getMonth(), currentMonday.getDate() + 7);
    weekIndex++;
  }

  return {
    year,
    month,
    monthName,
    monthShort,
    startDate: startOfMonth,
    endDate: endOfMonth,
    start_date,
    end_date,
    startDateStr: start_date,
    endDateStr: end_date,
    daysInMonth: endOfMonth.getDate(),
    isCurrentMonth,
    weeks,
    formattedRange: `${monthShort} 1–${endOfMonth.getDate()}, ${year}`,
    navLabel: isCurrentMonth ? 'This Month' : monthName,
    periodTitle: isCurrentMonth ? `This Month (${monthName})` : monthName,
  };
};

/**
 * Format minutes into standard "Xh Ym" string
 */
export const formatMinutes = (minutes = 0) => {
  const mins = Number(minutes) || 0;
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  if (hours === 0 && remainder === 0) return '0h 0m';
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
};
