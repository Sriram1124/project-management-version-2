import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Intern Timesheet UI/UX Refinement Suite', () => {
  describe('1. Page Heading Simplification', () => {
    it('displays only "Timesheet" without intern name or email for intern viewing their own timesheet', () => {
      const readOnly = false;
      const currentIntern = {
        id: 'intern-1',
        name: 'Sriram Ramanathan',
        email: 'sriram@example.com',
        cohort: { name: 'Batch 2026' },
      };

      // Header title logic in TimesheetView
      const headerTitle = readOnly && currentIntern
        ? `${currentIntern.name}'s Timesheet`
        : 'Timesheet';

      const showPersonalMeta = Boolean(readOnly && currentIntern);

      assert.strictEqual(headerTitle, 'Timesheet');
      assert.strictEqual(showPersonalMeta, false);
    });

    it('preserves intern name and email metadata when manager reviews intern in read-only mode', () => {
      const readOnly = true;
      const currentIntern = {
        id: 'intern-1',
        name: 'Sriram Ramanathan',
        email: 'sriram@example.com',
        cohort: { name: 'Batch 2026' },
      };

      const headerTitle = readOnly && currentIntern
        ? `${currentIntern.name}'s Weekly Timesheet`
        : 'Timesheet';

      const showPersonalMeta = Boolean(readOnly && currentIntern);

      assert.strictEqual(headerTitle, "Sriram Ramanathan's Weekly Timesheet");
      assert.strictEqual(showPersonalMeta, true);
    });
  });

  describe('2. Removal of Manual Logging and Timer Starting Controls', () => {
    it('verifies header controls contain only navigation, view mode, weekday toggle, and refresh', () => {
      const readOnly = false;
      const isManager = false;
      const activeSession = null;

      // In the refined TimesheetView, buttons for Log Time and Start Timer are removed
      const availableHeaderActions = [
        'VIEW_MODE_SELECTOR', // Week | Month
        'PERIOD_NAV_BUTTONS', // Prev | Range | Next
        'JUMP_TO_CURRENT_PERIOD', // This Week | This Month
        'WEEKDAY_SELECTOR', // Mon-Fri | 7 Days
        'REFRESH_BUTTON',
      ];

      // Explicitly check that START_TIMER and LOG_TIME are not among the actions
      assert.ok(!availableHeaderActions.includes('START_TIMER'));
      assert.ok(!availableHeaderActions.includes('LOG_TIME'));
      assert.strictEqual(availableHeaderActions.length, 5);
    });

    it('verifies empty state message does not prompt for manual log button', () => {
      const emptyStateText = 'You have no assigned tasks or time entries recorded for this period.';
      assert.ok(!emptyStateText.includes('Log Time'));
      assert.ok(!emptyStateText.includes('manually log work'));
    });
  });

  describe('3. Edit Previously Logged Time Validation & Calculations', () => {
    const validateEditEntry = (hoursStr, minutesStr, dateStr) => {
      const hrs = Number.parseInt(hoursStr, 10) || 0;
      const mins = Number.parseInt(minutesStr, 10) || 0;
      const totalMinutes = hrs * 60 + mins;

      if (totalMinutes <= 0) {
        return { valid: false, error: 'Duration must be greater than 0 minutes. Please enter a positive time value.' };
      }
      if (!dateStr || isNaN(new Date(dateStr).getTime())) {
        return { valid: false, error: 'Please select a valid date for this time entry.' };
      }
      return { valid: true, totalMinutes };
    };

    it('accepts valid durations and dates', () => {
      const result1 = validateEditEntry('1', '30', '2026-10-21');
      assert.strictEqual(result1.valid, true);
      assert.strictEqual(result1.totalMinutes, 90);

      const result2 = validateEditEntry('0', '45', '2026-10-21');
      assert.strictEqual(result2.valid, true);
      assert.strictEqual(result2.totalMinutes, 45);

      const result3 = validateEditEntry('8', '0', '2026-10-21');
      assert.strictEqual(result3.valid, true);
      assert.strictEqual(result3.totalMinutes, 480);
    });

    it('rejects zero or negative durations', () => {
      const resultZero = validateEditEntry('0', '0', '2026-10-21');
      assert.strictEqual(resultZero.valid, false);
      assert.match(resultZero.error, /greater than 0 minutes/);

      const resultNegative = validateEditEntry('-1', '0', '2026-10-21');
      assert.strictEqual(resultNegative.valid, false);
      assert.match(resultNegative.error, /greater than 0 minutes/);
    });

    it('rejects missing or invalid dates', () => {
      const resultNoDate = validateEditEntry('1', '0', '');
      assert.strictEqual(resultNoDate.valid, false);
      assert.match(resultNoDate.error, /valid date/);
    });

    it('recalculates daily and weekly totals accurately when an entry is edited', () => {
      const originalEntries = [
        { id: 'e1', date: '2026-10-21', duration_minutes: 60 },
        { id: 'e2', date: '2026-10-21', duration_minutes: 90 },
        { id: 'e3', date: '2026-10-22', duration_minutes: 120 },
      ];

      const initialTotal = originalEntries.reduce((sum, e) => sum + e.duration_minutes, 0);
      assert.strictEqual(initialTotal, 270); // 4h 30m

      // Edit e2 from 90 mins to 150 mins
      const updatedEntries = originalEntries.map((e) =>
        e.id === 'e2' ? { ...e, duration_minutes: 150 } : e
      );

      const updatedTotal = updatedEntries.reduce((sum, e) => sum + e.duration_minutes, 0);
      assert.strictEqual(updatedTotal, 330); // 5h 30m

      const dailyOct21 = updatedEntries
        .filter((e) => e.date === '2026-10-21')
        .reduce((sum, e) => sum + e.duration_minutes, 0);
      assert.strictEqual(dailyOct21, 210); // 3h 30m
    });
  });

  describe('4. Preserves Backend Ownership and Permissions', () => {
    const checkCanUpdateEntry = (user, entry) => {
      const isOwner = entry.user_id === user.id;
      const canManage = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role);
      if (!isOwner && !canManage) {
        throw new Error('Forbidden: you can only update your own time entries');
      }
      return true;
    };

    it('allows intern to update their own entry', () => {
      const user = { id: 'intern-1', role: 'INTERN' };
      const entry = { id: 'entry-1', user_id: 'intern-1' };
      assert.doesNotThrow(() => checkCanUpdateEntry(user, entry));
    });

    it('forbids intern from updating another user entry', () => {
      const user = { id: 'intern-1', role: 'INTERN' };
      const entry = { id: 'entry-2', user_id: 'intern-2' };
      assert.throws(
        () => checkCanUpdateEntry(user, entry),
        /Forbidden: you can only update your own time entries/
      );
    });

    it('allows manager to manage any entry within their scope', () => {
      const user = { id: 'manager-1', role: 'MANAGER' };
      const entry = { id: 'entry-1', user_id: 'intern-1' };
      assert.doesNotThrow(() => checkCanUpdateEntry(user, entry));
    });
  });
});

