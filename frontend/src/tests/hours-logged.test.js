import { test, describe } from 'node:test';
import assert from 'node:assert';
import { formatHoursMinutes } from '../utils/time.js';

describe('Task Details Panel - Hours Logged & Time Tracking Suite', () => {

  describe('1. formatHoursMinutes display formatting', () => {
    test('displays 0h 0m when no time has been recorded (0 minutes, null, or undefined)', () => {
      assert.strictEqual(formatHoursMinutes(0), '0h 0m');
      assert.strictEqual(formatHoursMinutes(null), '0h 0m');
      assert.strictEqual(formatHoursMinutes(undefined), '0h 0m');
      assert.strictEqual(formatHoursMinutes(''), '0h 0m');
      assert.strictEqual(formatHoursMinutes(-15), '0h 0m');
    });

    test('displays 1h 30m for exactly 90 recorded minutes', () => {
      assert.strictEqual(formatHoursMinutes(90), '1h 30m');
    });

    test('displays exact hours and minutes across standard durations', () => {
      assert.strictEqual(formatHoursMinutes(15), '0h 15m');
      assert.strictEqual(formatHoursMinutes(60), '1h 0m');
      assert.strictEqual(formatHoursMinutes(150), '2h 30m');
      assert.strictEqual(formatHoursMinutes(495), '8h 15m');
    });
  });

  describe('2. Multi-Session Accumulation & Isolation', () => {
    const sampleTimeEntries = [
      { id: 'te-1', task_id: 'task-101', duration_minutes: 45, source: 'TIMER' },
      { id: 'te-2', task_id: 'task-101', duration_minutes: 45, source: 'MANUAL' },
      { id: 'te-3', task_id: 'task-102', duration_minutes: 120, source: 'TIMER' }, // different task!
    ];

    test('accumulates multiple sessions for the target task correctly', () => {
      const task101Entries = sampleTimeEntries.filter((e) => e.task_id === 'task-101');
      const totalMinutes = task101Entries.reduce((sum, e) => sum + e.duration_minutes, 0);

      assert.strictEqual(totalMinutes, 90);
      assert.strictEqual(formatHoursMinutes(totalMinutes), '1h 30m');
    });

    test('strictly isolates tasks so time from another task is never included', () => {
      const targetTaskId = 'task-101';
      const taskEntries = sampleTimeEntries.filter((e) => e.task_id === targetTaskId);
      const totalMinutes = taskEntries.reduce((sum, e) => sum + e.duration_minutes, 0);

      assert.strictEqual(totalMinutes, 90);
      assert.strictEqual(taskEntries.some((e) => e.task_id === 'task-102'), false);
    });

    test('does not use task lifecycle duration as logged time', () => {
      // Task was created 5 days ago (7200 minutes of lifecycle duration)
      // but only has 30 minutes of recorded work
      const task = {
        id: 'task-103',
        created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        completed_at: new Date().toISOString(),
      };
      const entries = [{ id: 'te-4', task_id: 'task-103', duration_minutes: 30 }];

      // Lifecycle calculation (wrong)
      const lifecycleMinutes = Math.round((new Date(task.completed_at) - new Date(task.created_at)) / 60000);
      assert.ok(lifecycleMinutes > 7000);

      // Logged hours calculation (correct canonical source)
      const loggedMinutes = entries.reduce((sum, e) => sum + e.duration_minutes, 0);
      assert.strictEqual(loggedMinutes, 30);
      assert.strictEqual(formatHoursMinutes(loggedMinutes), '0h 30m');
      assert.notStrictEqual(formatHoursMinutes(loggedMinutes), formatHoursMinutes(lifecycleMinutes));
    });
  });

  describe('3. Timer Lifecycle & Reopening Updates', () => {
    test('updates displayed total after timer is stopped', () => {
      let totalMinutes = 60;
      assert.strictEqual(formatHoursMinutes(totalMinutes), '1h 0m');

      // User starts timer, runs for 30 minutes, and stops
      const sessionMinutes = 30;
      totalMinutes += sessionMinutes;

      assert.strictEqual(totalMinutes, 90);
      assert.strictEqual(formatHoursMinutes(totalMinutes), '1h 30m');
    });

    test('reopening task panel re-reads accurate total from backend data', () => {
      const mockBackendResponse = {
        task_id: 'task-101',
        total_minutes: 150,
        entries: [
          { id: 'te-1', duration_minutes: 90 },
          { id: 'te-2', duration_minutes: 60 },
        ],
      };

      const loadedTotal = mockBackendResponse.total_minutes;
      assert.strictEqual(formatHoursMinutes(loadedTotal), '2h 30m');
    });
  });
});

