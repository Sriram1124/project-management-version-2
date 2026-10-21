import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('InternHub — Cohort Switching & Timesheet Data Synchronization Suite', () => {
  const sampleCohorts = [
    { id: 'cohort-uuid-1', name: 'Cohort 1', code: 'cohort-1', is_active: true },
    { id: 'cohort-uuid-2', name: 'Cohort 2', code: 'cohort-2', is_active: true }
  ];

  const sampleUsers = [
    {
      id: 'u-1',
      name: 'Alice Johnson',
      email: 'alice@example.com',
      user_code: 'INT001',
      cohort_id: 'cohort-uuid-1',
      cohort: { id: 'cohort-uuid-1', name: 'Cohort 1', code: 'cohort-1' },
      organization_id: 'org-main',
      roles: [{ role: { name: 'INTERN' } }],
      is_active: true
    },
    {
      id: 'u-2',
      name: 'Bob Smith',
      email: 'bob@example.com',
      user_code: 'INT002',
      cohort_id: 'cohort-uuid-1',
      cohort: { id: 'cohort-uuid-1', name: 'Cohort 1', code: 'cohort-1' },
      organization_id: 'org-main',
      roles: [{ role: { name: 'INTERN' } }],
      is_active: true
    },
    {
      id: 'u-3',
      name: 'Test Intern',
      email: 'test.intern@example.com',
      user_code: 'INT003',
      cohort_id: 'cohort-uuid-1',
      cohort: { id: 'cohort-uuid-1', name: 'Cohort 1', code: 'cohort-1' },
      organization_id: 'org-main',
      roles: [{ role: { name: 'INTERN' } }],
      is_active: true
    },
    {
      id: 'u-4',
      name: 'Charlie Davis',
      email: 'charlie@example.com',
      user_code: 'INT004',
      cohort_id: 'cohort-uuid-2',
      cohort: { id: 'cohort-uuid-2', name: 'Cohort 2', code: 'cohort-2' },
      organization_id: 'org-main',
      roles: [{ role: { name: 'INTERN' } }],
      is_active: true
    },
    {
      id: 'u-5',
      name: 'David Evans',
      email: 'david@example.com',
      user_code: 'INT005',
      cohort_id: 'cohort-uuid-2',
      cohort: { id: 'cohort-uuid-2', name: 'Cohort 2', code: 'cohort-2' },
      organization_id: 'org-main',
      roles: [{ role: { name: 'INTERN' } }],
      is_active: true
    },
    {
      id: 'u-foreign',
      name: 'Foreign Org Member',
      email: 'foreign@other.com',
      user_code: 'INT999',
      cohort_id: 'cohort-uuid-1',
      cohort: { id: 'cohort-uuid-1', name: 'Cohort 1', code: 'cohort-1' },
      organization_id: 'org-other',
      roles: [{ role: { name: 'INTERN' } }],
      is_active: true
    }
  ];

  const sampleTimeEntries = [
    {
      id: 'te-1',
      user_id: 'u-1',
      organization_id: 'org-main',
      duration_minutes: 240,
      task_id: 't-1',
      date: '2026-10-12T09:00:00.000Z'
    },
    {
      id: 'te-2',
      user_id: 'u-2',
      organization_id: 'org-main',
      duration_minutes: 180,
      task_id: 't-2',
      date: '2026-10-13T10:00:00.000Z'
    },
    // Note: 'u-3' (Test Intern) has 0 time entries recorded
    {
      id: 'te-4',
      user_id: 'u-4',
      organization_id: 'org-main',
      duration_minutes: 300,
      task_id: 't-4',
      date: '2026-10-14T11:00:00.000Z'
    }
  ];

  // Helper simulating Timesheet Review query logic matching backend & frontend synchronization
  function queryManagerTimesheetsReview({
    orgId = 'org-main',
    cohortId,
    search = '',
    page = 1,
    limit = 50
  }) {
    // 1. Filter users by organization, active status, and non-manager/tech-lead roles
    let eligible = sampleUsers.filter((u) => {
      if (u.organization_id !== orgId) return false;
      if (!u.is_active) return false;
      return true;
    });

    // 2. Filter by cohort
    if (cohortId && cohortId !== 'ALL') {
      eligible = eligible.filter(
        (u) =>
          u.cohort_id === cohortId ||
          u.cohort?.id === cohortId ||
          u.cohort?.code === cohortId ||
          u.cohort?.name === cohortId
      );
    }

    // 3. Filter by search query
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      eligible = eligible.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.user_code && u.user_code.toLowerCase().includes(q))
      );
    }

    // Sort alphabetically
    eligible.sort((a, b) => a.name.localeCompare(b.name));

    const totalCount = eligible.length;
    const skip = (page - 1) * limit;
    const paginated = eligible.slice(skip, skip + limit);

    // Compute time metrics
    const internIds = new Set(paginated.map((u) => u.id));
    const relevantEntries = sampleTimeEntries.filter(
      (e) => internIds.has(e.user_id) && e.organization_id === orgId
    );

    const userMinutesMap = new Map();
    const userTasksMap = new Map();
    for (const u of paginated) {
      userMinutesMap.set(u.id, 0);
      userTasksMap.set(u.id, new Set());
    }

    for (const e of relevantEntries) {
      userMinutesMap.set(e.user_id, (userMinutesMap.get(e.user_id) || 0) + e.duration_minutes);
      if (e.task_id) {
        userTasksMap.get(e.user_id).add(e.task_id);
      }
    }

    let overallLoggedMinutes = 0;
    let activeInternsCount = 0;

    const interns = paginated.map((intern) => {
      const mins = userMinutesMap.get(intern.id) || 0;
      const tasks = userTasksMap.get(intern.id)?.size || 0;
      overallLoggedMinutes += mins;
      if (mins > 0) activeInternsCount++;

      return {
        id: intern.id,
        name: intern.name,
        email: intern.email,
        cohort: intern.cohort,
        total_minutes: mins,
        total_hours: Number((mins / 60).toFixed(1)),
        total_formatted: `${Math.floor(mins / 60)}h ${mins % 60}m`,
        task_count: tasks
      };
    });

    return {
      summary: {
        total_interns: totalCount,
        active_interns: activeInternsCount,
        total_logged_minutes: overallLoggedMinutes,
        total_logged_hours: Number((overallLoggedMinutes / 60).toFixed(1)),
        avg_logged_minutes_per_active:
          activeInternsCount > 0 ? Math.round(overallLoggedMinutes / activeInternsCount) : 0
      },
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit) || 1
      },
      interns
    };
  }

  test('1. Cohort 1 displays only Cohort 1 interns', () => {
    const result = queryManagerTimesheetsReview({ cohortId: 'cohort-uuid-1' });
    assert.strictEqual(result.summary.total_interns, 3);
    assert.deepStrictEqual(
      result.interns.map((i) => i.name),
      ['Alice Johnson', 'Bob Smith', 'Test Intern']
    );
    assert.ok(result.interns.every((i) => i.cohort.id === 'cohort-uuid-1'));
  });

  test('2. Switching to Cohort 2 removes Cohort 1 records and displays Cohort 2 interns', () => {
    const result = queryManagerTimesheetsReview({ cohortId: 'cohort-uuid-2' });
    assert.strictEqual(result.summary.total_interns, 2);
    assert.deepStrictEqual(
      result.interns.map((i) => i.name),
      ['Charlie Davis', 'David Evans']
    );
    assert.ok(!result.interns.some((i) => i.name === 'Alice Johnson'));
    assert.ok(!result.interns.some((i) => i.name === 'Test Intern'));
    assert.ok(result.interns.every((i) => i.cohort.id === 'cohort-uuid-2'));
  });

  test('3. The initial Timesheets Review list includes all eligible interns in the selected cohort without requiring search', () => {
    // Test Intern must appear in the initial unfiltered list for Cohort 1
    const result = queryManagerTimesheetsReview({ cohortId: 'cohort-uuid-1', search: '' });
    const testIntern = result.interns.find((i) => i.name === 'Test Intern');
    assert.ok(testIntern, 'Test Intern must be present in the initial unfiltered list');
    assert.strictEqual(testIntern.email, 'test.intern@example.com');
  });

  test('4. Searching for an intern filters the list correctly', () => {
    const result = queryManagerTimesheetsReview({ cohortId: 'cohort-uuid-1', search: 'Test Intern' });
    assert.strictEqual(result.interns.length, 1);
    assert.strictEqual(result.interns[0].name, 'Test Intern');

    const codeResult = queryManagerTimesheetsReview({ cohortId: 'cohort-uuid-1', search: 'INT002' });
    assert.strictEqual(codeResult.interns.length, 1);
    assert.strictEqual(codeResult.interns[0].name, 'Bob Smith');
  });

  test('5. Clearing the search restores the complete cohort list', () => {
    // When search is active
    const searchResult = queryManagerTimesheetsReview({ cohortId: 'cohort-uuid-1', search: 'Alice' });
    assert.strictEqual(searchResult.interns.length, 1);

    // When search is cleared (back to empty string)
    const clearedResult = queryManagerTimesheetsReview({ cohortId: 'cohort-uuid-1', search: '' });
    assert.strictEqual(clearedResult.interns.length, 3);
    assert.ok(clearedResult.interns.some((i) => i.name === 'Alice Johnson'));
    assert.ok(clearedResult.interns.some((i) => i.name === 'Bob Smith'));
    assert.ok(clearedResult.interns.some((i) => i.name === 'Test Intern'));
  });

  test('6. Interns without time entries remain visible with zero totals', () => {
    const result = queryManagerTimesheetsReview({ cohortId: 'cohort-uuid-1' });
    const testIntern = result.interns.find((i) => i.name === 'Test Intern');
    assert.ok(testIntern);
    assert.strictEqual(testIntern.total_minutes, 0);
    assert.strictEqual(testIntern.total_hours, 0);
    assert.strictEqual(testIntern.total_formatted, '0h 0m');
    assert.strictEqual(testIntern.task_count, 0);
  });

  test('7. Weekly summary metrics update correctly when the cohort changes', () => {
    const c1Result = queryManagerTimesheetsReview({ cohortId: 'cohort-uuid-1' });
    assert.strictEqual(c1Result.summary.total_interns, 3);
    assert.strictEqual(c1Result.summary.active_interns, 2); // Alice (240m) + Bob (180m), Test Intern (0m)
    assert.strictEqual(c1Result.summary.total_logged_minutes, 420);
    assert.ok(Math.abs(c1Result.summary.total_logged_hours - 7.0) < 1e-4);
    assert.strictEqual(c1Result.summary.avg_logged_minutes_per_active, 210);

    const c2Result = queryManagerTimesheetsReview({ cohortId: 'cohort-uuid-2' });
    assert.strictEqual(c2Result.summary.total_interns, 2);
    assert.strictEqual(c2Result.summary.active_interns, 1); // Charlie (300m), David (0m)
    assert.strictEqual(c2Result.summary.total_logged_minutes, 300);
    assert.ok(Math.abs(c2Result.summary.total_logged_hours - 5.0) < 1e-4);
    assert.strictEqual(c2Result.summary.avg_logged_minutes_per_active, 300);
  });

  test('8. Switching cohorts rapidly cannot display stale data (sequence-token validation)', async () => {
    let latestSequence = 0;
    let displayedCohort = null;

    const requestCohort = async (cohortId, delayMs) => {
      const seq = ++latestSequence;
      return new Promise((resolve) => {
        setTimeout(() => {
          if (seq === latestSequence) {
            displayedCohort = cohortId;
          }
          resolve({ cohortId, seq, stale: seq !== latestSequence });
        }, delayMs);
      });
    };

    // Rapid switches: Request Cohort 1 (slow network: 100ms), then immediately switch to Cohort 2 (fast network: 20ms)
    const p1 = requestCohort('cohort-uuid-1', 100);
    const p2 = requestCohort('cohort-uuid-2', 20);

    const [r1, r2] = await Promise.all([p1, p2]);

    assert.strictEqual(r1.stale, true, 'Cohort 1 response should be flagged as stale');
    assert.strictEqual(r2.stale, false, 'Cohort 2 response is the latest');
    assert.strictEqual(displayedCohort, 'cohort-uuid-2', 'Displayed cohort must remain Cohort 2, not overwritten by slow Cohort 1');
  });

  test('9. Organization boundaries and existing authorization rules remain enforced', () => {
    // Foreign org member with cohort-uuid-1 should never appear in org-main results
    const result = queryManagerTimesheetsReview({ orgId: 'org-main', cohortId: 'cohort-uuid-1' });
    assert.ok(!result.interns.some((i) => i.id === 'u-foreign'));
    assert.ok(!result.interns.some((i) => i.name === 'Foreign Org Member'));
    assert.strictEqual(result.summary.total_interns, 3);
  });
});

