import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateKanbanMetrics } from '../utils/kanbanMetrics.js';

describe('InternHub — Dynamic Kanban Board Summary Metrics Suite', () => {

  describe('1. Zero and Empty State Handling', () => {
    test('returns exact zeros and — for average cycle time when tasks array is empty', () => {
      const result = calculateKanbanMetrics([]);
      assert.strictEqual(result.total, 0);
      assert.strictEqual(result.completed, 0);
      assert.strictEqual(result.inProgressWip, 0);
      assert.strictEqual(result.blocked, 0);
      assert.strictEqual(result.todo, 0);
      assert.strictEqual(result.avgCycleTimeFormatted, null);
      assert.strictEqual(result.avgCycleTimeDisplay, '—');
    });

    test('handles null or undefined input safely without throwing', () => {
      const resultNull = calculateKanbanMetrics(null);
      assert.strictEqual(resultNull.total, 0);
      assert.strictEqual(resultNull.avgCycleTimeDisplay, '—');

      const resultUndef = calculateKanbanMetrics(undefined);
      assert.strictEqual(resultUndef.total, 0);
      assert.strictEqual(resultUndef.avgCycleTimeDisplay, '—');
    });

    test('excludes EPIC containers from task counts and metrics', () => {
      const tasksWithEpic = [
        { id: 'epic-1', type: 'EPIC', status: 'IN_PROGRESS' },
        { id: 'task-1', type: 'TASK', status: 'TODO' },
      ];
      const result = calculateKanbanMetrics(tasksWithEpic);
      assert.strictEqual(result.total, 1);
      assert.strictEqual(result.todo, 1);
      assert.strictEqual(result.inProgressWip, 0);
    });
  });

  describe('2. Workflow Status Mapping and WIP Calculations', () => {
    test('correctly maps IN_PROGRESS and IN_REVIEW to inProgressWip', () => {
      const tasks = [
        { id: 't-1', type: 'TASK', status: 'IN_PROGRESS' },
        { id: 't-2', type: 'STORY', status: 'IN_REVIEW' },
        { id: 't-3', type: 'BUG', status: 'TODO' },
        { id: 't-4', type: 'SUBTASK', status: 'BLOCKED' },
        { id: 't-5', type: 'TASK', status: 'COMPLETED' },
      ];
      const result = calculateKanbanMetrics(tasks);
      assert.strictEqual(result.total, 5);
      assert.strictEqual(result.inProgressWip, 2);
      assert.strictEqual(result.blocked, 1);
      assert.strictEqual(result.completed, 1);
      assert.strictEqual(result.todo, 1);
    });

    test('counts blocked tasks accurately when blockedCount > 0 and when 0', () => {
      const noBlocked = [
        { id: 't-1', type: 'TASK', status: 'TODO' },
        { id: 't-2', type: 'TASK', status: 'IN_PROGRESS' },
      ];
      assert.strictEqual(calculateKanbanMetrics(noBlocked).blocked, 0);

      const twoBlocked = [
        { id: 't-1', type: 'TASK', status: 'BLOCKED' },
        { id: 't-2', type: 'TASK', status: 'BLOCKED' },
      ];
      assert.strictEqual(calculateKanbanMetrics(twoBlocked).blocked, 2);
    });
  });

  describe('3. Authoritative Average Cycle Time Calculations', () => {
    test('calculates exact cycle time in hours when duration is under 24 hours', () => {
      // 15 hours elapsed
      const start = new Date('2026-10-01T08:00:00Z');
      const end = new Date('2026-10-01T23:00:00Z'); // 15 hours later
      const tasks = [
        {
          id: 't-1',
          type: 'TASK',
          status: 'COMPLETED',
          start_date: start.toISOString(),
          completed_at: end.toISOString(),
        },
      ];
      const result = calculateKanbanMetrics(tasks);
      assert.strictEqual(result.completed, 1);
      assert.strictEqual(result.avgCycleTimeHours, 15);
      assert.strictEqual(result.avgCycleTimeFormatted, '15h avg cycle');
      assert.strictEqual(result.avgCycleTimeDisplay, '~15h avg cycle');
    });

    test('calculates multi-task average cycle time accurately', () => {
      // Task 1: 10 hours, Task 2: 20 hours -> Average = 15 hours
      const t1Start = new Date('2026-10-01T00:00:00Z');
      const t1End = new Date('2026-10-01T10:00:00Z');
      const t2Start = new Date('2026-10-01T00:00:00Z');
      const t2End = new Date('2026-10-01T20:00:00Z');
      const tasks = [
        { id: 't-1', type: 'TASK', status: 'COMPLETED', created_at: t1Start.toISOString(), completed_at: t1End.toISOString() },
        { id: 't-2', type: 'TASK', status: 'COMPLETED', created_at: t2Start.toISOString(), completed_at: t2End.toISOString() },
      ];
      const result = calculateKanbanMetrics(tasks);
      assert.strictEqual(result.avgCycleTimeHours, 15);
      assert.strictEqual(result.avgCycleTimeDisplay, '~15h avg cycle');
    });

    test('formats cycle time in days when duration exceeds 24 hours', () => {
      // 36 hours elapsed = 1.5 days
      const start = new Date('2026-10-01T00:00:00Z');
      const end = new Date('2026-10-02T12:00:00Z');
      const tasks = [
        { id: 't-1', type: 'TASK', status: 'COMPLETED', start_date: start.toISOString(), completed_at: end.toISOString() },
      ];
      const result = calculateKanbanMetrics(tasks);
      assert.ok(Math.abs(result.avgCycleTimeDays - 1.5) < 1e-4);
      assert.strictEqual(result.avgCycleTimeFormatted, '1.5d avg cycle');
      assert.strictEqual(result.avgCycleTimeDisplay, '~1.5d avg cycle');
    });

    test('formats whole days cleanly without trailing decimal', () => {
      // 48 hours = 2 days
      const start = new Date('2026-10-01T00:00:00Z');
      const end = new Date('2026-10-03T00:00:00Z');
      const tasks = [
        { id: 't-1', type: 'TASK', status: 'COMPLETED', start_date: start.toISOString(), completed_at: end.toISOString() },
      ];
      const result = calculateKanbanMetrics(tasks);
      assert.strictEqual(result.avgCycleTimeDays, 2);
      assert.strictEqual(result.avgCycleTimeFormatted, '2d avg cycle');
      assert.strictEqual(result.avgCycleTimeDisplay, '~2d avg cycle');
    });
  });

  describe('4. Missing Timestamps and Corrupted Lifecycles (Safe Fallbacks)', () => {
    test('returns — for average cycle time when completed task has null completed_at and null updated_at', () => {
      const tasks = [
        { id: 't-1', type: 'TASK', status: 'COMPLETED', start_date: '2026-10-01T00:00:00Z', completed_at: null, updated_at: null },
      ];
      const result = calculateKanbanMetrics(tasks);
      assert.strictEqual(result.completed, 1);
      assert.strictEqual(result.avgCycleTimeFormatted, null);
      assert.strictEqual(result.avgCycleTimeDisplay, '—');
    });

    test('returns — when completed task has invalid non-parseable date string', () => {
      const tasks = [
        { id: 't-1', type: 'TASK', status: 'COMPLETED', start_date: 'not-a-valid-date', completed_at: '2026-10-01T00:00:00Z' },
      ];
      const result = calculateKanbanMetrics(tasks);
      assert.strictEqual(result.completed, 1);
      assert.strictEqual(result.avgCycleTimeFormatted, null);
      assert.strictEqual(result.avgCycleTimeDisplay, '—');
    });

    test('ignores invalid negative durations (completed before start date)', () => {
      const start = new Date('2026-10-05T00:00:00Z');
      const invalidEnd = new Date('2026-10-01T00:00:00Z'); // 4 days prior
      const tasks = [
        { id: 't-1', type: 'TASK', status: 'COMPLETED', start_date: start.toISOString(), completed_at: invalidEnd.toISOString() },
      ];
      const result = calculateKanbanMetrics(tasks);
      assert.strictEqual(result.completed, 1);
      assert.strictEqual(result.avgCycleTimeFormatted, null);
      assert.strictEqual(result.avgCycleTimeDisplay, '—');
    });

    test('falls back to created_at and updated_at when start_date or completed_at are omitted', () => {
      const created = new Date('2026-10-01T00:00:00Z');
      const updated = new Date('2026-10-01T05:00:00Z'); // 5 hours later
      const tasks = [
        { id: 't-1', type: 'TASK', status: 'COMPLETED', created_at: created.toISOString(), updated_at: updated.toISOString() },
      ];
      const result = calculateKanbanMetrics(tasks);
      assert.strictEqual(result.completed, 1);
      assert.strictEqual(result.avgCycleTimeHours, 5);
      assert.strictEqual(result.avgCycleTimeDisplay, '~5h avg cycle');
    });
  });

  describe('5. Real-Time Task State Transitions & Synchronization', () => {
    test('updates metrics dynamically as tasks change lifecycle states', () => {
      let tasks = [
        { id: 't-1', type: 'TASK', status: 'TODO', created_at: '2026-10-01T00:00:00Z' },
        { id: 't-2', type: 'TASK', status: 'TODO', created_at: '2026-10-01T00:00:00Z' },
        { id: 't-3', type: 'TASK', status: 'TODO', created_at: '2026-10-01T00:00:00Z' },
      ];

      // Step 1: Initial state (all TODO)
      let m = calculateKanbanMetrics(tasks);
      assert.strictEqual(m.total, 3);
      assert.strictEqual(m.todo, 3);
      assert.strictEqual(m.inProgressWip, 0);
      assert.strictEqual(m.completed, 0);
      assert.strictEqual(m.blocked, 0);
      assert.strictEqual(m.avgCycleTimeDisplay, '—');

      // Step 2: Move Task 1 to IN_PROGRESS
      tasks = tasks.map((t) => (t.id === 't-1' ? { ...t, status: 'IN_PROGRESS' } : t));
      m = calculateKanbanMetrics(tasks);
      assert.strictEqual(m.inProgressWip, 1);
      assert.strictEqual(m.todo, 2);

      // Step 3: Mark Task 2 BLOCKED
      tasks = tasks.map((t) => (t.id === 't-2' ? { ...t, status: 'BLOCKED' } : t));
      m = calculateKanbanMetrics(tasks);
      assert.strictEqual(m.blocked, 1);
      assert.strictEqual(m.todo, 1);

      // Step 4: Complete Task 1 after 15 hours
      tasks = tasks.map((t) =>
        t.id === 't-1'
          ? { ...t, status: 'COMPLETED', completed_at: '2026-10-01T15:00:00Z' }
          : t
      );
      m = calculateKanbanMetrics(tasks);
      assert.strictEqual(m.completed, 1);
      assert.strictEqual(m.inProgressWip, 0);
      assert.strictEqual(m.avgCycleTimeDisplay, '~15h avg cycle');

      // Step 5: Unblock Task 2 to IN_REVIEW
      tasks = tasks.map((t) => (t.id === 't-2' ? { ...t, status: 'IN_REVIEW' } : t));
      m = calculateKanbanMetrics(tasks);
      assert.strictEqual(m.blocked, 0);
      assert.strictEqual(m.inProgressWip, 1);

      // Step 6: Delete Task 3
      tasks = tasks.filter((t) => t.id !== 't-3');
      m = calculateKanbanMetrics(tasks);
      assert.strictEqual(m.total, 2);
    });

    test('matches exact user sample values when state matches sample scenario', () => {
      // 10 tasks, 3 completed (~15h avg cycle), 2 in-progress WIP, 1 blocked, 4 todo
      const tasks = [
        // 3 completed (avg 15h)
        { id: 'c-1', type: 'TASK', status: 'COMPLETED', created_at: '2026-10-01T00:00:00Z', completed_at: '2026-10-01T15:00:00Z' },
        { id: 'c-2', type: 'TASK', status: 'COMPLETED', created_at: '2026-10-01T00:00:00Z', completed_at: '2026-10-01T15:00:00Z' },
        { id: 'c-3', type: 'TASK', status: 'COMPLETED', created_at: '2026-10-01T00:00:00Z', completed_at: '2026-10-01T15:00:00Z' },
        // 2 in-progress WIP
        { id: 'w-1', type: 'TASK', status: 'IN_PROGRESS' },
        { id: 'w-2', type: 'TASK', status: 'IN_REVIEW' },
        // 1 blocked
        { id: 'b-1', type: 'TASK', status: 'BLOCKED' },
        // 4 todo
        { id: 't-1', type: 'TASK', status: 'TODO' },
        { id: 't-2', type: 'TASK', status: 'TODO' },
        { id: 't-3', type: 'TASK', status: 'TODO' },
        { id: 't-4', type: 'TASK', status: 'TODO' },
      ];

      const m = calculateKanbanMetrics(tasks);
      assert.strictEqual(m.total, 10);
      assert.strictEqual(m.completed, 3);
      assert.strictEqual(m.inProgressWip, 2);
      assert.strictEqual(m.avgCycleTimeDisplay, '~15h avg cycle');
      assert.strictEqual(m.blocked, 1);
    });
  });
});

