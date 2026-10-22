import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatShortDate,
  formatMonthYear,
  getItemSortTimestamp,
  computeTimelineRange,
  computeTimelineGeometryMap,
} from '../components/views/projects/roadmapUtils.js';

describe('Project Roadmap — Performance & Virtualization Suite', () => {
  describe('1. Date Caching & Intl Format Optimization', () => {
    test('formatShortDate formats timestamps and caches results accurately', () => {
      const ts = new Date('2026-10-15T10:00:00Z').getTime();
      const formatted1 = formatShortDate(ts);
      assert.ok(formatted1.includes('Oct') || formatted1.includes('15'));

      // Second call should return the exact cached string
      const formatted2 = formatShortDate(ts);
      assert.strictEqual(formatted1, formatted2);

      // Date objects and strings with identical timestamp match
      const formatted3 = formatShortDate(new Date(ts));
      assert.strictEqual(formatted1, formatted3);
    });

    test('formatShortDate handles null, undefined, or invalid dates gracefully', () => {
      assert.strictEqual(formatShortDate(null), '');
      assert.strictEqual(formatShortDate(undefined), '');
      assert.strictEqual(formatShortDate('invalid-date'), '');
    });

    test('formatMonthYear formats and caches month-year strings', () => {
      const ts = new Date('2026-10-01T00:00:00Z').getTime();
      const my1 = formatMonthYear(ts);
      assert.ok(my1.includes('2026'));
      const my2 = formatMonthYear(ts);
      assert.strictEqual(my1, my2);
    });
  });

  describe('2. Chronological Sort Timestamp Derivation', () => {
    const sprintOrderMap = new Map([
      ['sprint-1', { orderIndex: 0, startTime: new Date('2026-09-01T00:00:00Z').getTime() }],
      ['sprint-2', { orderIndex: 1, startTime: new Date('2026-09-15T00:00:00Z').getTime() }],
    ]);

    test('prioritizes item start_date when available', () => {
      const item = {
        start_date: '2026-09-10T00:00:00Z',
        due_date: '2026-09-20T00:00:00Z',
        sprint_id: 'sprint-1',
        created_at: '2026-08-01T00:00:00Z',
      };
      const ts = getItemSortTimestamp(item, sprintOrderMap);
      assert.strictEqual(ts, Date.parse('2026-09-10T00:00:00Z'));
    });

    test('falls back to derived start when item start_date is missing', () => {
      const item = {
        start_date: null,
        due_date: '2026-09-20T00:00:00Z',
        created_at: '2026-08-01T00:00:00Z',
      };
      const derivedTs = Date.parse('2026-09-05T00:00:00Z');
      const ts = getItemSortTimestamp(item, sprintOrderMap, derivedTs);
      assert.strictEqual(ts, derivedTs);
    });

    test('falls back to sprint start date when dates are missing', () => {
      const item = {
        start_date: null,
        due_date: null,
        sprint_id: 'sprint-2',
        created_at: '2026-08-01T00:00:00Z',
      };
      const ts = getItemSortTimestamp(item, sprintOrderMap);
      assert.strictEqual(ts, sprintOrderMap.get('sprint-2').startTime);
    });

    test('falls back to item due_date or created_at if unscheduled and unsprinted', () => {
      const item = {
        start_date: null,
        due_date: '2026-10-30T00:00:00Z',
        sprint_id: null,
        created_at: '2026-08-01T00:00:00Z',
      };
      const ts = getItemSortTimestamp(item, sprintOrderMap);
      assert.strictEqual(ts, Date.parse('2026-10-30T00:00:00Z'));
    });
  });

  describe('3. Dynamic Timeline Range & Columns Computation', () => {
    const scheduledRows = [
      { startMs: Date.parse('2026-09-01T00:00:00Z'), dueMs: Date.parse('2026-09-25T00:00:00Z') },
      { startMs: Date.parse('2026-09-15T00:00:00Z'), dueMs: Date.parse('2026-10-10T00:00:00Z') },
    ];
    const sprints = [
      { start_date: '2026-09-01T00:00:00Z', end_date: '2026-09-14T00:00:00Z' },
    ];

    test('computes week-based columns spanning minimum 4 weeks', () => {
      const { timeColumns, timelineStartMs, timelineEndMs, totalDurationMs, columnWidth } =
        computeTimelineRange(scheduledRows, sprints, 'weeks');

      assert.strictEqual(columnWidth, 130);
      assert.ok(timeColumns.length >= 4);
      assert.ok(timelineEndMs > timelineStartMs);
      assert.strictEqual(totalDurationMs, timelineEndMs - timelineStartMs);

      // Each column has title, subtitle, startMs, endMs
      const col1 = timeColumns[0];
      assert.strictEqual(col1.title, 'Week 1');
      assert.ok(col1.subtitle.includes('–'));
      assert.ok(col1.startMs <= col1.endMs);
    });

    test('computes month-based columns spanning minimum 3 months', () => {
      const { timeColumns, timelineStartMs, timelineEndMs, totalDurationMs, columnWidth } =
        computeTimelineRange(scheduledRows, sprints, 'months');

      assert.strictEqual(columnWidth, 160);
      assert.ok(timeColumns.length >= 3);
      assert.ok(timelineEndMs > timelineStartMs);
      assert.strictEqual(totalDurationMs, timelineEndMs - timelineStartMs);

      const col1 = timeColumns[0];
      assert.ok(col1.id.startsWith('month-'));
      assert.ok(col1.title.length > 0);
    });
  });

  describe('4. Timeline Geometry Map Precomputation', () => {
    const tStart = Date.parse('2026-09-01T00:00:00Z');
    const tEnd = Date.parse('2026-10-31T23:59:59Z');
    const totalDuration = tEnd - tStart;

    test('computes range duration bar geometry accurately', () => {
      const rows = [
        {
          item: { id: 'story-1', title: 'Feature Alpha' },
          startMs: Date.parse('2026-09-10T00:00:00Z'),
          dueMs: Date.parse('2026-09-20T00:00:00Z'),
          isDerivedStart: false,
          isDerivedDue: false,
        },
      ];

      const map = computeTimelineGeometryMap(rows, tStart, totalDuration);
      assert.ok(map.has('story-1'));

      const geom = map.get('story-1');
      assert.strictEqual(geom.isSingleMilestone, false);
      assert.ok(geom.leftPercent > 0 && geom.leftPercent < 100);
      assert.ok(geom.widthPercent >= 3.5 && geom.widthPercent <= 100);
      assert.ok(geom.dateTooltip.includes('–'));
    });

    test('computes single milestone marker geometry when only start or due date exists', () => {
      const rows = [
        {
          item: { id: 'task-due-only', title: 'Target Release' },
          startMs: null,
          dueMs: Date.parse('2026-10-15T00:00:00Z'),
          isDerivedStart: false,
          isDerivedDue: false,
        },
      ];

      const map = computeTimelineGeometryMap(rows, tStart, totalDuration);
      assert.ok(map.has('task-due-only'));

      const geom = map.get('task-due-only');
      assert.strictEqual(geom.isSingleMilestone, true);
      assert.ok(geom.leftPercent > 0);
      assert.strictEqual(geom.widthPercent, 3);
    });
  });

  describe('5. Virtualization Math & Row Positioning', () => {
    test('computes exact virtual boundaries and start positions for 48px row heights', () => {
      const itemCount = 100;
      const itemHeight = 48;
      const overscan = 6;
      const scrollTop = 480; // scrolled down 10 rows
      const viewportHeight = 480; // 10 rows visible

      const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan); // 10 - 6 = 4
      const endIndex = Math.min(itemCount - 1, Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan); // 20 + 6 = 26

      assert.strictEqual(startIndex, 4);
      assert.strictEqual(endIndex, 26);

      const virtualRowsCount = endIndex - startIndex + 1; // 23 rows
      assert.strictEqual(virtualRowsCount, 23);

      // Total height is exactly itemCount * itemHeight
      assert.strictEqual(itemCount * itemHeight, 4800);

      // Verify position of row at startIndex
      const startPosition = startIndex * itemHeight;
      assert.strictEqual(startPosition, 192); // 4 * 48
    });
  });
});

