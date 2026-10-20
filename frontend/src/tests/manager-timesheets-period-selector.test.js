import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Manager Timesheets Period Selector (Week, Month, All Time) Suite', () => {
  const managerViewPath = path.join(__dirname, '../components/views/ManagerTimesheetsView.jsx');
  const timesheetServicePath = path.join(__dirname, '../services/timesheet.service.js');
  const backendControllerPath = path.join(__dirname, '../../../backend-node/src/controllers/timesheet.controller.ts');
  const backendServicePath = path.join(__dirname, '../../../backend-node/src/services/timesheet.service.ts');

  const managerViewContent = fs.readFileSync(managerViewPath, 'utf8');
  const timesheetServiceContent = fs.readFileSync(timesheetServicePath, 'utf8');
  const backendControllerContent = fs.readFileSync(backendControllerPath, 'utf8');
  const backendServiceContent = fs.readFileSync(backendServicePath, 'utf8');

  describe('1. Frontend ManagerTimesheetsView UI & State', () => {
    test('State initializes with period defaulted to WEEK', () => {
      assert.match(
        managerViewContent,
        /const \[period, setPeriod\] = useState\('WEEK'\)/,
        'ManagerTimesheetsView must initialize period state to WEEK'
      );
    });

    test('Renders period selector buttons for This Week, This Month, and All Time', () => {
      assert.match(
        managerViewContent,
        /onClick=\{\(\) => \{\s*setPeriod\('WEEK'\)/,
        'Must have click handler to switch to WEEK period'
      );
      assert.match(
        managerViewContent,
        /onClick=\{\(\) => \{\s*setPeriod\('MONTH'\)/,
        'Must have click handler to switch to MONTH period'
      );
      assert.match(
        managerViewContent,
        /onClick=\{\(\) => \{\s*setPeriod\('ALL_TIME'\)/,
        'Must have click handler to switch to ALL_TIME period'
      );
      assert.ok(
        managerViewContent.includes('This Week') &&
        managerViewContent.includes('This Month') &&
        managerViewContent.includes('All Time'),
        'Must display button labels for This Week, This Month, and All Time'
      );
    });

    test('Date navigation stepper adapts to active period', () => {
      assert.match(
        managerViewContent,
        /period === 'WEEK' && \([\s\S]*?handlePrevWeek[\s\S]*?handleNextWeek/,
        'Week period must render week steppers'
      );
      assert.match(
        managerViewContent,
        /period === 'MONTH' && \([\s\S]*?handlePrevMonth[\s\S]*?handleNextMonth/,
        'Month period must render month steppers'
      );
      assert.match(
        managerViewContent,
        /period === 'ALL_TIME' && \([\s\S]*?All-Time Records/,
        'All Time period must render All-Time Records badge'
      );
    });

    test('Active Contributors card subtitle updates based on period', () => {
      assert.match(
        managerViewContent,
        /period === 'WEEK'\s*\?\s*'Logged hours this week'\s*:\s*period === 'MONTH'\s*\?\s*'Logged hours this month'\s*:\s*'Logged hours all time'/,
        'Active Contributors card subtitle must reflect current period'
      );
    });

    test('Table columns adapt to active period', () => {
      assert.match(
        managerViewContent,
        /period === 'WEEK'\s*\?\s*'Weekly Total'\s*:\s*period === 'MONTH'\s*\?\s*'Monthly Total'\s*:\s*'All-Time Total'/,
        'Table total column header must adapt to period'
      );
      assert.match(
        managerViewContent,
        /period === 'WEEK'\s*\?\s*'Daily Breakdown \(Mon–Sun\)'\s*:\s*period === 'MONTH'\s*\?\s*'Weekly Breakdown'\s*:\s*'Activity Overview'/,
        'Table breakdown column header must adapt to period'
      );
    });

    test('Table rows render appropriate breakdown per period', () => {
      assert.match(
        managerViewContent,
        /period === 'WEEK'\s*\?\s*\([\s\S]*?intern\.daily_breakdown/,
        'Must render daily breakdown when period is WEEK'
      );
      assert.match(
        managerViewContent,
        /period === 'MONTH'\s*\?\s*\([\s\S]*?intern\.weekly_breakdown/,
        'Must render weekly breakdown when period is MONTH'
      );
      assert.match(
        managerViewContent,
        /intern\.active_days_count \|\| 0/,
        'Must render active days count when period is ALL_TIME'
      );
    });
  });

  describe('2. Frontend Timesheet Service Integration', () => {
    test('timesheetService.getManagerReview appends period to query parameters', () => {
      assert.match(
        timesheetServiceContent,
        /if \(filters\.period\) params\.set\('period', filters\.period\)/,
        'getManagerReview must serialize filters.period'
      );
    });
  });

  describe('3. Backend Timesheet Review Architecture', () => {
    test('Backend Controller passes period from query params', () => {
      assert.match(
        backendControllerContent,
        /const \{[^}]*period[^}]*\} = req\.query/,
        'TimesheetController must extract period from req.query'
      );
      assert.match(
        backendControllerContent,
        /period:\s*\(period as any\) \|\| 'WEEK'/,
        'TimesheetController must forward period to service'
      );
    });

    test('Backend Service handles WEEK, MONTH, and ALL_TIME date ranges', () => {
      assert.match(
        backendServiceContent,
        /period\?: 'WEEK' \| 'MONTH' \| 'ALL_TIME' \| string/,
        'Service options must declare period type'
      );
      assert.match(
        backendServiceContent,
        /const period = \(options\.period \|\| 'WEEK'\)\.toUpperCase\(\)/,
        'Service must normalize period to uppercase'
      );
      assert.match(
        backendServiceContent,
        /const dateQueryFilter = period === 'ALL_TIME'[\s\S]*?: period === 'MONTH'[\s\S]*?: \{ date: \{ gte: startOfWeek, lte: endOfWeek \} \}/,
        'Service must compute appropriate date query filter for the selected period'
      );
      assert.match(
        backendServiceContent,
        /weekly_breakdown:\s*weeks\.map/,
        'Service must populate weekly_breakdown for each intern'
      );
    });
  });
});

