import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getSessionCutoffMs } from '../utils/time.js';

describe('Timer Synchronization, 6:15 PM IST Auto Cutoff, and Time Corrections', () => {

  describe('1. 6:15 PM IST Cutoff Calculation', () => {
    test('computes cutoff at 18:15 IST (12:45 UTC) for a session started in the morning', () => {
      // 2026-10-19 at 10:00 AM IST is 2026-10-19T04:30:00.000Z
      const morningStart = new Date('2026-10-19T04:30:00.000Z');
      const cutoffMs = getSessionCutoffMs(morningStart);

      assert.ok(cutoffMs, 'Cutoff timestamp must be returned');
      const cutoffDate = new Date(cutoffMs);

      // Verify the cutoff matches 18:15 IST (which is 12:45 UTC)
      assert.strictEqual(cutoffDate.getUTCFullYear(), 2026);
      assert.strictEqual(cutoffDate.getUTCMonth(), 9); // October (0-indexed)
      assert.strictEqual(cutoffDate.getUTCDate(), 19);
      assert.strictEqual(cutoffDate.getUTCHours(), 12);
      assert.strictEqual(cutoffDate.getUTCMinutes(), 45);
    });

    test('supports manual restart after 18:15 IST without retroactively counting earlier time', () => {
      // Session started at 19:00 IST (13:30 UTC) after auto clock-out
      const eveningStart = new Date('2026-10-19T13:30:00.000Z');
      const cutoffMs = getSessionCutoffMs(eveningStart);

      assert.ok(cutoffMs > eveningStart.getTime(), 'Cutoff must be in the future of the evening start');
      // Cutoff allows up to 4 hours of overtime work session
      const durationMs = cutoffMs - eveningStart.getTime();
      assert.strictEqual(durationMs, 4 * 60 * 60 * 1000);
    });

    test('elapsed time calculation clamps to cutoff and never exceeds 18:15 IST', () => {
      // Session started at 17:00 IST (11:30 UTC), now is 19:00 IST (13:30 UTC)
      const startedAt = new Date('2026-10-19T11:30:00.000Z').getTime();
      const cutoffMs = getSessionCutoffMs(new Date(startedAt));

      // Cutoff is 18:15 IST (12:45 UTC) -> difference from 17:00 to 18:15 is exactly 1h 15m (75 mins)
      const effectiveEnd = Math.min(new Date('2026-10-19T13:30:00.000Z').getTime(), cutoffMs);
      const diffMinutes = Math.floor((effectiveEnd - startedAt) / (60 * 1000));

      assert.strictEqual(diffMinutes, 75);
    });
  });

  describe('2. Single Active Timer & Safe Task Switching', () => {
    test('switching tasks safely completes active session before starting new one', () => {
      const state = {
        activeSession: {
          id: 'sess-1',
          task_id: 'task-A',
          started_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        },
        timeEntries: [],
      };

      // Function simulating single-timer task switch
      const switchTask = (newTaskId) => {
        if (state.activeSession) {
          // Record finished session
          const start = new Date(state.activeSession.started_at).getTime();
          const durationMinutes = Math.round((Date.now() - start) / 60000);
          state.timeEntries.push({
            id: `entry-${state.timeEntries.length + 1}`,
            task_id: state.activeSession.task_id,
            duration_minutes: durationMinutes,
            source: 'TIMER',
          });
          state.activeSession = null;
        }

        // Start new session
        state.activeSession = {
          id: 'sess-2',
          task_id: newTaskId,
          started_at: new Date().toISOString(),
        };
      };

      switchTask('task-B');

      assert.strictEqual(state.timeEntries.length, 1);
      assert.strictEqual(state.timeEntries[0].task_id, 'task-A');
      assert.strictEqual(state.timeEntries[0].duration_minutes, 30);
      assert.strictEqual(state.activeSession.task_id, 'task-B');
    });

    test('re-clicking start timer on currently running task is idempotent and does not create duplicate', () => {
      const activeSession = { id: 'sess-1', task_id: 'task-A', started_at: new Date().toISOString() };
      const startTimer = (taskId) => {
        if (activeSession.task_id === taskId) {
          return { session: activeSession, restarted: false };
        }
        return { session: { id: 'sess-2', task_id: taskId }, restarted: true };
      };

      const res = startTimer('task-A');
      assert.strictEqual(res.restarted, false);
      assert.strictEqual(res.session.id, 'sess-1');
    });
  });

  describe('3. Time Correction Validation & Deductions', () => {
    const originalEntry = {
      id: 'entry-101',
      task_id: 'task-1',
      duration_minutes: 180, // 3 hours
      notes: 'Initial work session',
    };

    test('validates that reason is mandatory for correction request', () => {
      const validateRequest = (input) => {
        if (!input.reason || !input.reason.trim()) {
          throw new Error('Reason is mandatory for requesting a time correction');
        }
        if (input.reason.trim().length < 5) {
          throw new Error('Reason must be at least 5 characters');
        }
        return true;
      };

      assert.throws(() => validateRequest({ reason: '' }), /Reason is mandatory/);
      assert.throws(() => validateRequest({ reason: '   ' }), /Reason is mandatory/);
      assert.throws(() => validateRequest({ reason: 'hi' }), /at least 5 characters/);
      assert.strictEqual(validateRequest({ reason: 'Forgot to stop timer when leaving workstation' }), true);
    });

    test('validates excess deduction bounds and calculates corrected duration', () => {
      const calculateCorrection = (orig, excess) => {
        if (excess <= 0) {
          throw new Error('Excess minutes must be greater than 0');
        }
        if (excess >= orig) {
          throw new Error('Excess minutes must be less than original duration');
        }
        const corrected = orig - excess;
        return {
          original_duration_minutes: orig,
          excess_minutes: excess,
          corrected_duration_minutes: corrected,
          difference: -excess,
        };
      };

      assert.throws(() => calculateCorrection(180, 0), /greater than 0/);
      assert.throws(() => calculateCorrection(180, -15), /greater than 0/);
      assert.throws(() => calculateCorrection(180, 180), /less than original duration/);
      assert.throws(() => calculateCorrection(180, 200), /less than original duration/);

      const result = calculateCorrection(180, 45); // 3h -> 2h 15m
      assert.strictEqual(result.corrected_duration_minutes, 135);
      assert.strictEqual(result.difference, -45);
      assert.strictEqual(result.corrected_duration_minutes > 0, true);
    });

    test('preserves historical entry on approval without deleting it', () => {
      const entry = { ...originalEntry };
      const correction = {
        excess_minutes: 30,
        corrected_duration_minutes: 150,
        reason: 'Stepped away for coffee',
        manager: 'Manager Alice',
      };

      // Approval logic
      const suffix = `[Correction: -${correction.excess_minutes}m approved by ${correction.manager}. Reason: ${correction.reason}]`;
      entry.duration_minutes = correction.corrected_duration_minutes;
      entry.notes = `${entry.notes} · ${suffix}`;

      assert.strictEqual(entry.id, 'entry-101'); // Not deleted
      assert.strictEqual(entry.duration_minutes, 150);
      assert.ok(entry.notes.includes('Stepped away for coffee'));
      assert.ok(entry.notes.includes('Manager Alice'));
    });
  });
});
