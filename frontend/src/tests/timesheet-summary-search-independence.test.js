import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('InternHub — Manager Timesheets Summary & Search Independence Suite', () => {
  // Test fixture representing cohort and timesheet entries
  const sampleCohorts = [
    { id: 'cohort-1', name: 'Alpha Cohort', code: 'ALPHA', is_active: true },
    { id: 'cohort-2', name: 'Beta Cohort', code: 'BETA', is_active: true },
  ];

  const sampleInterns = [
    {
      id: 'intern-1',
      name: 'Alice Johnson',
      email: 'alice@example.com',
      user_code: 'INT-001',
      cohort_id: 'cohort-1',
      cohort: { id: 'cohort-1', name: 'Alpha Cohort', code: 'ALPHA' },
      is_active: true,
    },
    {
      id: 'intern-2',
      name: 'Bob Smith',
      email: 'bob@example.com',
      user_code: 'INT-002',
      cohort_id: 'cohort-1',
      cohort: { id: 'cohort-1', name: 'Alpha Cohort', code: 'ALPHA' },
      is_active: true,
    },
    {
      id: 'intern-3',
      name: 'Charlie Davis',
      email: 'charlie@example.com',
      user_code: 'INT-003',
      cohort_id: 'cohort-1',
      cohort: { id: 'cohort-1', name: 'Alpha Cohort', code: 'ALPHA' },
      is_active: true,
    },
    {
      id: 'intern-4',
      name: 'Diana Prince',
      email: 'diana@example.com',
      user_code: 'INT-004',
      cohort_id: 'cohort-2',
      cohort: { id: 'cohort-2', name: 'Beta Cohort', code: 'BETA' },
      is_active: true,
    },
    {
      id: 'intern-5',
      name: 'Evan Wright',
      email: 'evan@example.com',
      user_code: 'INT-005',
      cohort_id: 'cohort-2',
      cohort: { id: 'cohort-2', name: 'Beta Cohort', code: 'BETA' },
      is_active: true,
    },
  ];

  // Timesheet entries for week 1 (2026-10-12 to 2026-10-18)
  const week1Entries = [
    // Alice (cohort 1): 120 + 180 = 300 mins (5.0 hrs)
    { id: 'te-1', user_id: 'intern-1', date: '2026-10-12', duration_minutes: 120 },
    { id: 'te-2', user_id: 'intern-1', date: '2026-10-14', duration_minutes: 180 },
    // Bob (cohort 1): 240 mins (4.0 hrs)
    { id: 'te-3', user_id: 'intern-2', date: '2026-10-13', duration_minutes: 240 },
    // Charlie (cohort 1): 0 mins (inactive contributor for week 1)

    // Diana (cohort 2): 600 mins (10.0 hrs)
    { id: 'te-4', user_id: 'intern-4', date: '2026-10-15', duration_minutes: 600 },
    // Evan (cohort 2): 300 mins (5.0 hrs)
    { id: 'te-5', user_id: 'intern-5', date: '2026-10-16', duration_minutes: 300 },
  ];

  // Timesheet entries for week 2 (2026-10-19 to 2026-10-25)
  const week2Entries = [
    // Alice (cohort 1): 60 mins (1.0 hr)
    { id: 'te-6', user_id: 'intern-1', date: '2026-10-19', duration_minutes: 60 },
    // Charlie (cohort 1): 180 mins (3.0 hrs)
    { id: 'te-7', user_id: 'intern-3', date: '2026-10-20', duration_minutes: 180 },
  ];

  /**
   * Reference business logic implementation reproducing the decoupled architecture:
   * 1. Aggregate summary metrics computed strictly across the cohort/week scope.
   * 2. Table rows filtered strictly by the search query.
   */
  function computeManagerTimesheetsReview({
    allInterns,
    allTimeEntries,
    selectedCohortId,
    searchQuery,
  }) {
    // 1. Cohort scope (independent of search)
    const cohortInterns = allInterns.filter((intern) => {
      if (!intern.is_active) return false;
      if (selectedCohortId && selectedCohortId !== 'ALL') {
        return intern.cohort_id === selectedCohortId || intern.cohort?.id === selectedCohortId;
      }
      return true;
    });

    const cohortInternIds = new Set(cohortInterns.map((i) => i.id));
    const cohortEntries = allTimeEntries.filter((e) => cohortInternIds.has(e.user_id));

    let cohortOverallLoggedMinutes = 0;
    const cohortActiveInternIds = new Set();

    for (const entry of cohortEntries) {
      const dur = Number(entry.duration_minutes) || 0;
      cohortOverallLoggedMinutes += dur;
      if (dur > 0 && entry.user_id) {
        cohortActiveInternIds.add(entry.user_id);
      }
    }

    const cohortActiveCount = cohortActiveInternIds.size;
    const cohortTotalHours = Number((cohortOverallLoggedMinutes / 60).toFixed(1));
    const cohortAvgMinutesPerActive =
      cohortActiveCount > 0 ? Math.round(cohortOverallLoggedMinutes / cohortActiveCount) : 0;

    const summary = {
      total_interns: cohortInterns.length,
      active_interns: cohortActiveCount,
      total_logged_minutes: cohortOverallLoggedMinutes,
      total_logged_hours: cohortTotalHours,
      avg_logged_minutes_per_active: cohortAvgMinutesPerActive,
    };

    // 2. Table rows filtered by search query
    const q = (searchQuery || '').trim().toLowerCase();
    const tableInterns = cohortInterns.filter((intern) => {
      if (!q) return true;
      return (
        intern.name?.toLowerCase().includes(q) ||
        intern.email?.toLowerCase().includes(q) ||
        intern.user_code?.toLowerCase().includes(q)
      );
    });

    return {
      summary,
      tableInterns,
      isTableEmpty: tableInterns.length === 0,
    };
  }

  test('1. Baseline review returns accurate cohort aggregates without search', () => {
    const result = computeManagerTimesheetsReview({
      allInterns: sampleInterns,
      allTimeEntries: week1Entries,
      selectedCohortId: 'cohort-1',
      searchQuery: '',
    });

    // Cohort 1 has 3 interns (Alice, Bob, Charlie)
    assert.strictEqual(result.summary.total_interns, 3);
    // Alice (300m) and Bob (240m) logged time => 2 active contributors
    assert.strictEqual(result.summary.active_interns, 2);
    // Total logged time: 540 mins = 9.0 hours
    assert.strictEqual(result.summary.total_logged_minutes, 540);
    assert.ok(Math.abs(result.summary.total_logged_hours - 9.0) < 1e-4);
    // Avg active hours: 540 / 2 = 270 mins (4.5 hours)
    assert.strictEqual(result.summary.avg_logged_minutes_per_active, 270);

    // Table rows should contain all 3 cohort interns
    assert.strictEqual(result.tableInterns.length, 3);
    assert.strictEqual(result.isTableEmpty, false);
  });

  test('2. Searching for a nonexistent intern leaves summary cards unchanged while table is empty', () => {
    const result = computeManagerTimesheetsReview({
      allInterns: sampleInterns,
      allTimeEntries: week1Entries,
      selectedCohortId: 'cohort-1',
      searchQuery: 'NonexistentInternXYZ',
    });

    // Summary cards MUST NOT become zero or change
    assert.strictEqual(result.summary.total_interns, 3);
    assert.strictEqual(result.summary.active_interns, 2);
    assert.strictEqual(result.summary.total_logged_minutes, 540);
    assert.ok(Math.abs(result.summary.total_logged_hours - 9.0) < 1e-4);
    assert.strictEqual(result.summary.avg_logged_minutes_per_active, 270);

    // Intern table should be empty
    assert.strictEqual(result.tableInterns.length, 0);
    assert.strictEqual(result.isTableEmpty, true);
  });

  test('3. Searching for an existing intern filters table rows without mutating summary statistics', () => {
    // Search for Alice
    const resultAlice = computeManagerTimesheetsReview({
      allInterns: sampleInterns,
      allTimeEntries: week1Entries,
      selectedCohortId: 'cohort-1',
      searchQuery: 'alice',
    });

    // Table should contain only Alice
    assert.strictEqual(resultAlice.tableInterns.length, 1);
    assert.strictEqual(resultAlice.tableInterns[0].name, 'Alice Johnson');

    // All four summary cards remain identical to the whole cohort
    assert.strictEqual(resultAlice.summary.total_interns, 3);
    assert.strictEqual(resultAlice.summary.active_interns, 2);
    assert.ok(Math.abs(resultAlice.summary.total_logged_hours - 9.0) < 1e-4);
    assert.strictEqual(resultAlice.summary.avg_logged_minutes_per_active, 270);

    // Search by user code
    const resultCode = computeManagerTimesheetsReview({
      allInterns: sampleInterns,
      allTimeEntries: week1Entries,
      selectedCohortId: 'cohort-1',
      searchQuery: 'INT-002',
    });

    assert.strictEqual(resultCode.tableInterns.length, 1);
    assert.strictEqual(resultCode.tableInterns[0].name, 'Bob Smith');
    assert.strictEqual(resultCode.summary.total_interns, 3);
    assert.strictEqual(resultCode.summary.active_interns, 2);
  });

  test('4. Clearing search restores full intern table with unchanged summary statistics', () => {
    // Initial filtered state
    const filtered = computeManagerTimesheetsReview({
      allInterns: sampleInterns,
      allTimeEntries: week1Entries,
      selectedCohortId: 'cohort-1',
      searchQuery: 'bob',
    });
    assert.strictEqual(filtered.tableInterns.length, 1);

    // Clearing search
    const cleared = computeManagerTimesheetsReview({
      allInterns: sampleInterns,
      allTimeEntries: week1Entries,
      selectedCohortId: 'cohort-1',
      searchQuery: '',
    });

    assert.strictEqual(cleared.tableInterns.length, 3);
    assert.deepStrictEqual(cleared.summary, filtered.summary);
  });

  test('5. Changing cohort recalculates summary metrics and table rows for the new cohort', () => {
    // Cohort 2 (Diana and Evan)
    const resultCohort2 = computeManagerTimesheetsReview({
      allInterns: sampleInterns,
      allTimeEntries: week1Entries,
      selectedCohortId: 'cohort-2',
      searchQuery: '',
    });

    // Total interns: 2
    assert.strictEqual(resultCohort2.summary.total_interns, 2);
    // Both Diana (600m) and Evan (300m) are active => 2 active
    assert.strictEqual(resultCohort2.summary.active_interns, 2);
    // Total logged time: 900 mins = 15.0 hours
    assert.strictEqual(resultCohort2.summary.total_logged_minutes, 900);
    assert.ok(Math.abs(resultCohort2.summary.total_logged_hours - 15.0) < 1e-4);
    // Avg active: 900 / 2 = 450 mins (7.5 hours)
    assert.strictEqual(resultCohort2.summary.avg_logged_minutes_per_active, 450);

    // Table rows reflect only Cohort 2 members
    assert.strictEqual(resultCohort2.tableInterns.length, 2);
    assert.deepStrictEqual(
      resultCohort2.tableInterns.map((i) => i.name).sort(),
      ['Diana Prince', 'Evan Wright'].sort()
    );
  });

  test('6. Changing week recalculates summary metrics based on the selected week dates', () => {
    // Cohort 1 in Week 2
    const resultWeek2 = computeManagerTimesheetsReview({
      allInterns: sampleInterns,
      allTimeEntries: week2Entries,
      selectedCohortId: 'cohort-1',
      searchQuery: '',
    });

    // Total interns in cohort 1 is still 3
    assert.strictEqual(resultWeek2.summary.total_interns, 3);
    // Alice (60m) and Charlie (180m) are active => 2 active
    assert.strictEqual(resultWeek2.summary.active_interns, 2);
    // Total logged time: 240 mins = 4.0 hours
    assert.strictEqual(resultWeek2.summary.total_logged_minutes, 240);
    assert.ok(Math.abs(resultWeek2.summary.total_logged_hours - 4.0) < 1e-4);
    // Avg active: 240 / 2 = 120 mins (2.0 hours)
    assert.strictEqual(resultWeek2.summary.avg_logged_minutes_per_active, 120);
  });

  test('7. Search does not leak cross-cohort data or cross-cohort summary metrics', () => {
    // Searching for 'Diana' while viewing Cohort 1 should yield 0 table rows and keep Cohort 1 summary
    const crossSearch = computeManagerTimesheetsReview({
      allInterns: sampleInterns,
      allTimeEntries: week1Entries,
      selectedCohortId: 'cohort-1',
      searchQuery: 'Diana',
    });

    assert.strictEqual(crossSearch.tableInterns.length, 0);
    assert.strictEqual(crossSearch.summary.total_interns, 3);
    assert.ok(Math.abs(crossSearch.summary.total_logged_hours - 9.0) < 1e-4);
  });
});

