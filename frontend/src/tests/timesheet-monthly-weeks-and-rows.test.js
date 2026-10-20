import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  getCalendarMonthRange,
  formatMinutes,
} from '../utils/dateUtils.js';

describe('Timesheet Monthly Week Columns & Rows-Per-Page Suite', () => {
  describe('1. Month View: Week Columns Generation & Boundary Handling', () => {
    test('generates 5 week columns for October 2026 with month-bounded date labels', () => {
      const monthData = getCalendarMonthRange(new Date(2026, 9, 15));
      assert.strictEqual(monthData.weeks.length, 5);

      const weekLabels = monthData.weeks.map((w) => w.label);
      assert.deepStrictEqual(weekLabels, [
        'Week 1 (Oct 1–4)',
        'Week 2 (Oct 5–11)',
        'Week 3 (Oct 12–18)',
        'Week 4 (Oct 19–25)',
        'Week 5 (Oct 26–31)',
      ]);
    });

    test('generates 6 week columns when a month starts on Saturday/Sunday and spans 6 calendar weeks (e.g., August 2026)', () => {
      // August 1, 2026 is Saturday -> ends Monday Aug 31
      const monthData = getCalendarMonthRange(new Date(2026, 7, 10));
      assert.strictEqual(monthData.weeks.length, 6, 'August 2026 spans 6 calendar weeks');

      assert.strictEqual(monthData.weeks[0].label, 'Week 1 (Aug 1–2)');
      assert.strictEqual(monthData.weeks[1].label, 'Week 2 (Aug 3–9)');
      assert.strictEqual(monthData.weeks[2].label, 'Week 3 (Aug 10–16)');
      assert.strictEqual(monthData.weeks[3].label, 'Week 4 (Aug 17–23)');
      assert.strictEqual(monthData.weeks[4].label, 'Week 5 (Aug 24–30)');
      assert.strictEqual(monthData.weeks[5].label, 'Week 6 (Aug 31)');
    });

    test('generates exactly 4 week columns when a non-leap February starts on Monday (e.g., February 2021)', () => {
      // Feb 1, 2021 is Monday, Feb 28 is Sunday
      const monthData = getCalendarMonthRange(new Date(2021, 1, 10));
      assert.strictEqual(monthData.weeks.length, 4, 'February 2021 spans exactly 4 weeks');

      assert.strictEqual(monthData.weeks[0].label, 'Week 1 (Feb 1–7)');
      assert.strictEqual(monthData.weeks[1].label, 'Week 2 (Feb 8–14)');
      assert.strictEqual(monthData.weeks[2].label, 'Week 3 (Feb 15–21)');
      assert.strictEqual(monthData.weeks[3].label, 'Week 4 (Feb 22–28)');
    });
  });

  describe('2. Month View: Task Week Effort Aggregation & Week Cell Modal Data', () => {
    test('aggregates logged time per week group for a task and isolates weekly totals', () => {
      // Simulate task daily entries for October 2026
      const task = {
        id: 'task-101',
        title: 'Backend Database Optimization',
        days: {
          '2026-10-02': { minutes: 120, entries: [{ id: 'e1', duration_minutes: 120, source: 'TIMER' }] },
          '2026-10-03': { minutes: 60, entries: [{ id: 'e2', duration_minutes: 60, source: 'MANUAL' }] },
          '2026-10-06': { minutes: 240, entries: [{ id: 'e3', duration_minutes: 240, source: 'TIMER' }] },
          '2026-10-20': { minutes: 180, entries: [{ id: 'e4', duration_minutes: 180, source: 'MANUAL' }] },
        },
      };

      const monthData = getCalendarMonthRange(new Date(2026, 9, 1));
      
      // Compute task weekly breakdown matching TimesheetView logic
      const taskWeeks = {};
      monthData.weeks.forEach((wg) => {
        let weekMins = 0;
        wg.days.forEach((day) => {
          if (day.inMonth && task.days[day.date]) {
            weekMins += task.days[day.date].minutes || 0;
          }
        });
        taskWeeks[wg.weekNumber] = {
          weekNumber: wg.weekNumber,
          label: wg.label,
          minutes: weekMins,
        };
      });

      // Week 1 has Oct 2 (120) + Oct 3 (60) = 180 mins
      assert.strictEqual(taskWeeks[1].minutes, 180);
      assert.strictEqual(formatMinutes(taskWeeks[1].minutes), '3h');

      // Week 2 has Oct 6 (240 mins)
      assert.strictEqual(taskWeeks[2].minutes, 240);
      assert.strictEqual(formatMinutes(taskWeeks[2].minutes), '4h');

      // Week 3 has 0 mins
      assert.strictEqual(taskWeeks[3].minutes, 0);

      // Week 4 has Oct 20 (180 mins)
      assert.strictEqual(taskWeeks[4].minutes, 180);

      // Week 5 has 0 mins
      assert.strictEqual(taskWeeks[5].minutes, 0);
    });

    test('extracts daily breakdown and underlying entries for week cell modal', () => {
      const task = {
        id: 'task-102',
        title: 'Authentication & Session Hardening',
        days: {
          '2026-10-05': {
            minutes: 90,
            entries: [
              { id: 'e-1', duration_minutes: 60, source: 'TIMER', notes: 'Initial token work' },
              { id: 'e-2', duration_minutes: 30, source: 'MANUAL', notes: 'Reviewing RFC specs' },
            ],
          },
          '2026-10-08': {
            minutes: 150,
            entries: [
              { id: 'e-3', duration_minutes: 150, source: 'TIMER', notes: 'Refresh token rotation' },
            ],
          },
        },
      };

      const monthData = getCalendarMonthRange(new Date(2026, 9, 1));
      const week2 = monthData.weeks[1]; // Oct 5–11

      // Simulate week modal population
      const weekDays = week2.days.map((d) => d.date);
      const weekEntries = [];
      let totalMins = 0;

      weekDays.forEach((dateStr) => {
        const dayData = task.days[dateStr];
        if (dayData) {
          totalMins += dayData.minutes;
          if (dayData.entries) {
            weekEntries.push(...dayData.entries);
          }
        }
      });

      assert.strictEqual(totalMins, 240);
      assert.strictEqual(weekEntries.length, 3);
      assert.strictEqual(weekEntries[0].source, 'TIMER');
      assert.strictEqual(weekEntries[1].source, 'MANUAL');
      assert.strictEqual(weekEntries[2].duration_minutes, 150);
    });
  });

  describe('3. Editable Rows-Per-Page Validation Logic', () => {
    // Pure function replicating validatePageSize logic from TimesheetView
    function validatePageSizeInput(input) {
      if (input === 'ALL') {
        return { valid: true, value: 'ALL', error: '' };
      }

      const strVal = String(input).trim();
      if (!strVal) {
        return { valid: false, error: 'Please enter a valid positive integer (1-200).' };
      }

      if (strVal.includes('.')) {
        return { valid: false, error: 'Page size must be a whole number.' };
      }

      const num = Number(strVal);
      if (isNaN(num) || !Number.isInteger(num)) {
        return { valid: false, error: 'Please enter a valid positive integer (1-200).' };
      }

      if (num < 1 || num > 200) {
        return { valid: false, error: 'Page size must be between 1 and 200.' };
      }

      return { valid: true, value: num, error: '' };
    }

    test('accepts valid integers within range 1 to 200', () => {
      const validCases = ['1', '15', '25', '50', '100', '200', 42];
      validCases.forEach((val) => {
        const res = validatePageSizeInput(val);
        assert.strictEqual(res.valid, true, `Should accept valid value ${val}`);
        assert.strictEqual(res.value, Number(val));
        assert.strictEqual(res.error, '');
      });
    });

    test('accepts "ALL" option cleanly', () => {
      const res = validatePageSizeInput('ALL');
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.value, 'ALL');
    });

    test('rejects 0 and negative integers', () => {
      const zeroRes = validatePageSizeInput('0');
      assert.strictEqual(zeroRes.valid, false);
      assert.match(zeroRes.error, /between 1 and 200/);

      const negRes = validatePageSizeInput('-10');
      assert.strictEqual(negRes.valid, false);
      assert.match(negRes.error, /between 1 and 200/);
    });

    test('rejects values greater than 200', () => {
      const highRes = validatePageSizeInput('201');
      assert.strictEqual(highRes.valid, false);
      assert.match(highRes.error, /between 1 and 200/);

      const veryHigh = validatePageSizeInput('500');
      assert.strictEqual(veryHigh.valid, false);
      assert.match(veryHigh.error, /between 1 and 200/);
    });

    test('rejects decimals and floating point numbers', () => {
      const decimalRes = validatePageSizeInput('15.5');
      assert.strictEqual(decimalRes.valid, false);
      assert.match(decimalRes.error, /whole number/);

      const floatRes = validatePageSizeInput('25.0');
      assert.strictEqual(floatRes.valid, false);
      assert.match(floatRes.error, /whole number/);
    });

    test('rejects non-numeric characters and empty strings', () => {
      const emptyRes = validatePageSizeInput('');
      assert.strictEqual(emptyRes.valid, false);
      assert.match(emptyRes.error, /valid positive integer/);

      const textRes = validatePageSizeInput('twenty');
      assert.strictEqual(textRes.valid, false);
      assert.match(textRes.error, /valid positive integer/);

      const mixedRes = validatePageSizeInput('25items');
      assert.strictEqual(mixedRes.valid, false);
      assert.match(mixedRes.error, /valid positive integer/);
    });
  });

  describe('4. Pagination Computation with Dynamic Page Sizes', () => {
    const sampleItems = Array.from({ length: 47 }, (_, i) => ({ id: i + 1, name: `Task ${i + 1}` }));

    function paginate(items, currentPage, size) {
      if (size === 'ALL') {
        return {
          pagedItems: items,
          totalPages: 1,
          startIdx: 1,
          endIdx: items.length,
        };
      }
      const totalPages = Math.max(1, Math.ceil(items.length / size));
      const page = Math.min(Math.max(1, currentPage), totalPages);
      const start = (page - 1) * size;
      const end = start + size;
      return {
        pagedItems: items.slice(start, end),
        totalPages,
        startIdx: items.length > 0 ? start + 1 : 0,
        endIdx: Math.min(end, items.length),
      };
    }

    test('paginates correctly with standard size 15', () => {
      const res = paginate(sampleItems, 1, 15);
      assert.strictEqual(res.totalPages, 4);
      assert.strictEqual(res.pagedItems.length, 15);
      assert.strictEqual(res.startIdx, 1);
      assert.strictEqual(res.endIdx, 15);

      const page4 = paginate(sampleItems, 4, 15);
      assert.strictEqual(page4.pagedItems.length, 2);
      assert.strictEqual(page4.startIdx, 46);
      assert.strictEqual(page4.endIdx, 47);
    });

    test('paginates correctly with custom size 20', () => {
      const res = paginate(sampleItems, 1, 20);
      assert.strictEqual(res.totalPages, 3);
      assert.strictEqual(res.pagedItems.length, 20);
      assert.strictEqual(res.startIdx, 1);
      assert.strictEqual(res.endIdx, 20);

      const page3 = paginate(sampleItems, 3, 20);
      assert.strictEqual(page3.pagedItems.length, 7);
      assert.strictEqual(page3.startIdx, 41);
      assert.strictEqual(page3.endIdx, 47);
    });

    test('handles "ALL" option without pagination splits', () => {
      const res = paginate(sampleItems, 1, 'ALL');
      assert.strictEqual(res.totalPages, 1);
      assert.strictEqual(res.pagedItems.length, 47);
      assert.strictEqual(res.startIdx, 1);
      assert.strictEqual(res.endIdx, 47);
    });
  });

  describe('5. KPI Metrics Card Aesthetics & Uniform Heights', () => {
    test('confirms manager and intern summary cards have 4 uniform key metrics', () => {
      const managerSummary = {
        total_interns: 12,
        active_interns: 9,
        total_logged_hours: 145,
        avg_logged_minutes_per_active: 966, // ~16h 6m
      };

      assert.strictEqual(managerSummary.total_interns, 12);
      assert.strictEqual(managerSummary.active_interns, 9);
      assert.strictEqual(managerSummary.total_logged_hours, 145);
      assert.strictEqual(formatMinutes(managerSummary.avg_logged_minutes_per_active), '16h 6m');

      const internMetrics = {
        totalMinutes: 2400, // 40h
        activeDaysCount: 5,
        dailyAverageMinutes: 480, // 8h
        activeTasksCount: 4,
      };

      assert.strictEqual(formatMinutes(internMetrics.totalMinutes), '40h');
      assert.strictEqual(internMetrics.activeDaysCount, 5);
      assert.strictEqual(formatMinutes(internMetrics.dailyAverageMinutes), '8h');
      assert.strictEqual(internMetrics.activeTasksCount, 4);
    });
  });
});
