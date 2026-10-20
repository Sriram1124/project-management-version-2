import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  getCalendarWeekRange,
  getCalendarMonthRange,
  toLocalDateString,
  parseLocalDate,
  formatMinutes,
} from '../utils/dateUtils.js';

describe('Timesheet Week/Month Authoritative Date Logic and Filtering Suite', () => {
  describe('1. Calendar Week Calculation & "This Week" Detection', () => {
    test('computes exact Monday-Sunday range for any given date', () => {
      // 2026-10-14 is Wednesday
      const d = new Date(2026, 9, 14);
      const week = getCalendarWeekRange(d);

      assert.strictEqual(week.startDateStr, '2026-10-12', 'Monday must be Oct 12');
      assert.strictEqual(week.endDateStr, '2026-10-18', 'Sunday must be Oct 18');
      assert.strictEqual(week.formattedRange, 'Oct 12–18, 2026');
      assert.strictEqual(week.days.length, 7);
      assert.strictEqual(week.days[0].dayName, 'Mon');
      assert.strictEqual(week.days[6].dayName, 'Sun');
    });

    test('accurately detects whether selected week is current week or historical week', () => {
      const today = new Date();
      const currentWeek = getCalendarWeekRange(today);
      assert.strictEqual(currentWeek.isCurrentWeek, true, 'Current date must be marked as current week');

      // 3 weeks ago
      const historicalDate = new Date(today);
      historicalDate.setDate(today.getDate() - 21);
      const historicalWeek = getCalendarWeekRange(historicalDate);
      assert.strictEqual(historicalWeek.isCurrentWeek, false, 'Historical date must NOT be marked as current week');
    });

    test('handles month boundary weeks correctly (e.g. Sept 28 to Oct 4, 2026)', () => {
      const d = new Date(2026, 9, 1); // Oct 1, 2026 is Thursday
      const week = getCalendarWeekRange(d);

      assert.strictEqual(week.startDateStr, '2026-09-28');
      assert.strictEqual(week.endDateStr, '2026-10-04');
      assert.strictEqual(week.formattedRange, 'Sep 28 – Oct 4, 2026');
    });
  });

  describe('2. Calendar Month Calculation & Dynamic Week Grouping', () => {
    test('dynamically partitions a month into 4, 5, or 6 calendar weeks', () => {
      // October 2026 starts on Thursday and ends on Saturday -> spans 5 calendar weeks
      const oct2026 = getCalendarMonthRange(new Date(2026, 9, 15));
      assert.strictEqual(oct2026.monthName, 'October 2026');
      assert.strictEqual(oct2026.daysInMonth, 31);
      assert.strictEqual(oct2026.weeks.length, 5, 'October 2026 must have 5 calendar weeks');

      // Check first week labels and bounds
      const w1 = oct2026.weeks[0];
      assert.strictEqual(w1.weekNumber, 1);
      assert.strictEqual(w1.startDateStr, '2026-09-28');
      assert.strictEqual(w1.endDateStr, '2026-10-04');
      assert.strictEqual(w1.label, 'Week 1 (Oct 1–4)');

      // Check last week
      const w5 = oct2026.weeks[4];
      assert.strictEqual(w5.weekNumber, 5);
      assert.strictEqual(w5.startDateStr, '2026-10-26');
      assert.strictEqual(w5.endDateStr, '2026-11-01');
      assert.strictEqual(w5.label, 'Week 5 (Oct 26–31)');
    });

    test('marks out-of-month days in boundary weeks accurately', () => {
      const oct2026 = getCalendarMonthRange(new Date(2026, 9, 1));
      const w1 = oct2026.weeks[0];

      // Sept 28, 29, 30 are in week 1 but outside October
      const outDays = w1.days.filter((d) => !d.inMonth);
      const inDays = w1.days.filter((d) => d.inMonth);
      assert.strictEqual(outDays.length, 3, 'Sept 28, 29, 30 must be marked out of month');
      assert.strictEqual(inDays.length, 4, 'Oct 1, 2, 3, 4 must be marked in month');
    });
  });

  describe('3. Out-of-Month Exclusion and True Month Totals', () => {
    test('strictly excludes out-of-month entries from monthly total', () => {
      const timeEntries = [
        { date: '2026-09-30', duration_minutes: 120, task_id: 't-1' }, // boundary week, but in September
        { date: '2026-10-01', duration_minutes: 60, task_id: 't-1' },  // October
        { date: '2026-10-15', duration_minutes: 180, task_id: 't-2' }, // October
        { date: '2026-10-31', duration_minutes: 90, task_id: 't-3' },  // October
        { date: '2026-11-01', duration_minutes: 60, task_id: 't-3' },  // boundary week, but in November
      ];

      const startOfMonth = '2026-10-01';
      const endOfMonth = '2026-10-31';

      const inMonthEntries = timeEntries.filter((e) => e.date >= startOfMonth && e.date <= endOfMonth);
      const totalMonthMinutes = inMonthEntries.reduce((sum, e) => sum + e.duration_minutes, 0);

      assert.strictEqual(totalMonthMinutes, 330, 'Total minutes must be 60 + 180 + 90 = 330, excluding Sept 30 and Nov 1');
      assert.strictEqual(formatMinutes(totalMonthMinutes), '5h 30m');
    });

    test('computes daily average by dividing only by active days with logged time', () => {
      const totalMonthMinutes = 330;
      // Active days: Oct 1, Oct 15, Oct 31 -> 3 active days (out of 31 calendar days)
      const activeDaysCount = 3;
      const dailyAverageMins = Math.round(totalMonthMinutes / activeDaysCount);

      assert.strictEqual(dailyAverageMins, 110);
      assert.strictEqual(formatMinutes(dailyAverageMins), '1h 50m');
    });
  });

  describe('4. Priority Filtering alongside Status and Time', () => {
    const tasks = [
      { id: '1', title: 'DB Schema', priority: 'URGENT', status: 'IN_PROGRESS', total_minutes: 120 },
      { id: '2', title: 'API Routes', priority: 'HIGH', status: 'IN_PROGRESS', total_minutes: 240 },
      { id: '3', title: 'Styling Fix', priority: 'MEDIUM', status: 'COMPLETED', total_minutes: 60 },
      { id: '4', title: 'Docs update', priority: 'LOW', status: 'TODO', total_minutes: 0 },
    ];

    function filterTasks(items, { priority = 'ALL', status = 'ALL', timeFilter = 'ALL', search = '' }) {
      return items.filter((item) => {
        if (priority !== 'ALL' && item.priority !== priority) return false;
        if (status !== 'ALL' && item.status !== status) return false;
        if (timeFilter === 'LOGGED' && (item.total_minutes || 0) <= 0) return false;
        if (timeFilter === 'NO_LOGGED' && (item.total_minutes || 0) > 0) return false;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          if (!item.title.toLowerCase().includes(q)) return false;
        }
        return true;
      });
    }

    test('filters strictly by priority', () => {
      const urgent = filterTasks(tasks, { priority: 'URGENT' });
      assert.strictEqual(urgent.length, 1);
      assert.strictEqual(urgent[0].id, '1');

      const high = filterTasks(tasks, { priority: 'HIGH' });
      assert.strictEqual(high.length, 1);
      assert.strictEqual(high[0].id, '2');
    });

    test('combines priority filter with status and time filter', () => {
      const filtered = filterTasks(tasks, { priority: 'HIGH', status: 'IN_PROGRESS', timeFilter: 'LOGGED' });
      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].title, 'API Routes');

      const noMatch = filterTasks(tasks, { priority: 'LOW', timeFilter: 'LOGGED' });
      assert.strictEqual(noMatch.length, 0);
    });
  });
});

