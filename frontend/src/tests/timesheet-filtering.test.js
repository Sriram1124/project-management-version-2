import { test, describe } from 'node:test';
import assert from 'node:assert';
import { COLUMNS_CONFIG } from '../constants/kanban.js';

describe('InternHub Timesheet Filtering & Status Filter Suite', () => {
  const sampleTaskRows = [
    {
      id: 'task-1',
      key: 'task-1',
      title: 'Setup PostgreSQL Database and migrations',
      status: 'COMPLETED',
      total_minutes: 240,
      days: { '2026-10-12': { minutes: 120 }, '2026-10-13': { minutes: 120 } },
      project: { name: 'Core Infrastructure' }
    },
    {
      id: 'task-2',
      key: 'task-2',
      title: 'Fix Authentication Token Refresh Bug',
      status: 'COMPLETED',
      total_minutes: 0,
      days: { '2026-10-12': { minutes: 0 }, '2026-10-13': { minutes: 0 } },
      project: { name: 'Authentication' }
    },
    {
      id: 'task-3',
      key: 'task-3',
      title: 'Implement Timesheet Weekly Matrix View',
      status: 'IN_PROGRESS',
      total_minutes: 180,
      days: { '2026-10-12': { minutes: 90 }, '2026-10-13': { minutes: 90 } },
      project: { name: 'InternHub' }
    },
    {
      id: 'task-4',
      key: 'task-4',
      title: 'Peer Review PR for Role Permissions Modal',
      status: 'IN_REVIEW',
      total_minutes: 60,
      days: { '2026-10-14': { minutes: 60 } },
      project: { name: 'RBAC Module' }
    },
    {
      id: 'task-5',
      key: 'task-5',
      title: 'Deploy to Staging Environment',
      status: 'BLOCKED',
      total_minutes: 0,
      days: {},
      project: { name: 'DevOps' }
    },
    {
      id: 'task-6',
      key: 'task-6',
      title: 'Draft Sprint Retrospective Document',
      status: 'TODO',
      total_minutes: 0,
      days: {},
      project: { name: 'InternHub' }
    }
  ];

  const displayedDays = [
    { date: '2026-10-12', isWeekend: false },
    { date: '2026-10-13', isWeekend: false },
    { date: '2026-10-14', isWeekend: false },
    { date: '2026-10-15', isWeekend: false },
    { date: '2026-10-16', isWeekend: false },
  ];

  function filterTasks(tasks, statusFilter, timeFilter, searchQuery) {
    return tasks.filter((task) => {
      if (statusFilter !== 'ALL') {
        const s = (task.status || 'TODO').toUpperCase();
        if (s !== statusFilter) return false;
      }
      const totalMins = Number(task.total_minutes) || 0;
      if (timeFilter === 'LOGGED' && totalMins <= 0) return false;
      if (timeFilter === 'NO_LOGGED' && totalMins > 0) return false;

      if (searchQuery && searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const titleMatch = (task.title || '').toLowerCase().includes(q);
        const keyMatch = (task.key || task.id || '').toLowerCase().includes(q);
        const projMatch = (task.project?.name || '').toLowerCase().includes(q);
        if (!titleMatch && !keyMatch && !projMatch) return false;
      }
      return true;
    });
  }

  function calculateTotals(tasks, days) {
    let totalMinutes = 0;
    const dailyTotals = {};
    days.forEach((d) => { dailyTotals[d.date] = 0; });

    tasks.forEach((task) => {
      totalMinutes += Number(task.total_minutes) || 0;
      days.forEach((d) => {
        const mins = Number(task.days?.[d.date]?.minutes) || 0;
        dailyTotals[d.date] = (dailyTotals[d.date] || 0) + mins;
      });
    });

    return { totalMinutes, dailyTotals };
  }

  test('Existing application statuses are properly mapped and complete', () => {
    const statusIds = COLUMNS_CONFIG.map((c) => c.id);
    assert.deepStrictEqual(statusIds, ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'COMPLETED']);
    const titles = COLUMNS_CONFIG.map((c) => c.title);
    assert.deepStrictEqual(titles, ['To Do', 'In Progress', 'In Review', 'Blocked', 'Completed']);
  });

  test('Filters by status individual values correctly', () => {
    const todo = filterTasks(sampleTaskRows, 'TODO', 'ALL', '');
    assert.strictEqual(todo.length, 1);
    assert.strictEqual(todo[0].id, 'task-6');

    const inProgress = filterTasks(sampleTaskRows, 'IN_PROGRESS', 'ALL', '');
    assert.strictEqual(inProgress.length, 1);
    assert.strictEqual(inProgress[0].id, 'task-3');

    const inReview = filterTasks(sampleTaskRows, 'IN_REVIEW', 'ALL', '');
    assert.strictEqual(inReview.length, 1);
    assert.strictEqual(inReview[0].id, 'task-4');

    const blocked = filterTasks(sampleTaskRows, 'BLOCKED', 'ALL', '');
    assert.strictEqual(blocked.length, 1);
    assert.strictEqual(blocked[0].id, 'task-5');

    const completed = filterTasks(sampleTaskRows, 'COMPLETED', 'ALL', '');
    assert.strictEqual(completed.length, 2);
  });

  test('Filters completed tasks with no time logged (Requirement 5)', () => {
    const completedNoTime = filterTasks(sampleTaskRows, 'COMPLETED', 'NO_LOGGED', '');
    assert.strictEqual(completedNoTime.length, 1);
    assert.strictEqual(completedNoTime[0].id, 'task-2');
    assert.strictEqual(completedNoTime[0].title, 'Fix Authentication Token Refresh Bug');
    assert.strictEqual(completedNoTime[0].total_minutes, 0);
  });

  test('Filters tasks by search query combined with status and time-logged', () => {
    const searchResult = filterTasks(sampleTaskRows, 'COMPLETED', 'LOGGED', 'PostgreSQL');
    assert.strictEqual(searchResult.length, 1);
    assert.strictEqual(searchResult[0].id, 'task-1');

    const noMatch = filterTasks(sampleTaskRows, 'COMPLETED', 'LOGGED', 'NonExistentTaskXYZ');
    assert.strictEqual(noMatch.length, 0);
  });

  test('Totals distinguish filtered tasks from overall total consistently', () => {
    const overall = calculateTotals(sampleTaskRows, displayedDays);
    assert.strictEqual(overall.totalMinutes, 480); // 240 + 0 + 180 + 60 + 0 + 0
    assert.strictEqual(overall.dailyTotals['2026-10-12'], 210); // 120 + 90
    assert.strictEqual(overall.dailyTotals['2026-10-13'], 210); // 120 + 90
    assert.strictEqual(overall.dailyTotals['2026-10-14'], 60);

    const filtered = filterTasks(sampleTaskRows, 'IN_PROGRESS', 'ALL', '');
    const filteredTotals = calculateTotals(filtered, displayedDays);
    assert.strictEqual(filteredTotals.totalMinutes, 180);
    assert.strictEqual(filteredTotals.dailyTotals['2026-10-12'], 90);
    assert.strictEqual(filteredTotals.dailyTotals['2026-10-13'], 90);
    assert.strictEqual(filteredTotals.dailyTotals['2026-10-14'], 0);
  });
});

