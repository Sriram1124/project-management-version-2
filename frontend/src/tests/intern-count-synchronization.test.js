import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Intern Count Synchronization Suite (Dashboard & Timesheets)', () => {
  const dashboardViewPath = path.join(__dirname, '../components/views/ManagerDashboardView.jsx');
  const broadcastAlertPath = path.join(__dirname, '../components/dashboard/BroadcastAlert.jsx');
  const timesheetServicePath = path.join(__dirname, '../../../backend-node/src/services/timesheet.service.ts');

  const dashboardContent = fs.readFileSync(dashboardViewPath, 'utf8');
  const broadcastAlertContent = fs.readFileSync(broadcastAlertPath, 'utf8');
  const timesheetServiceContent = fs.readFileSync(timesheetServicePath, 'utf8');

  test('ManagerDashboardView strictly isolates intern pool from tech leads and management', () => {
    assert.match(
      dashboardContent,
      /const internUsers = React\.useMemo\(\(\) => \{/,
      'ManagerDashboardView must compute internUsers'
    );
    assert.match(
      dashboardContent,
      /const isLead = Boolean\(u\.is_tech_lead\) \|\| u\.type === 'TECH_LEAD' \|\| u\.role === 'TECH_LEAD' \|\| u\.project_role === 'TECH_LEAD'/,
      'Must exclude tech leads from total interns metric'
    );
    assert.match(
      dashboardContent,
      /const isManagement = u\.type === 'MANAGER' \|\| u\.role === 'MANAGER' \|\| u\.type === 'ADMIN' \|\| u\.type === 'SUPER_ADMIN'/,
      'Must exclude managers and admins from total interns metric'
    );
    assert.match(
      dashboardContent,
      /totalInterns:\s*\{\s*value:\s*internUsers\.length/,
      'totalInterns metric value must strictly match internUsers.length'
    );
  });

  test('BroadcastAlert strictly matches intern pool semantics', () => {
    assert.match(
      broadcastAlertContent,
      /const isLead = Boolean\(u\.is_tech_lead\) \|\| u\.type === 'TECH_LEAD' \|\| u\.role === 'TECH_LEAD' \|\| u\.project_role === 'TECH_LEAD'/,
      'BroadcastAlert must exclude tech leads'
    );
    assert.match(
      broadcastAlertContent,
      /const isManagement = u\.type === 'MANAGER' \|\| u\.role === 'MANAGER' \|\| u\.type === 'ADMIN' \|\| u\.type === 'SUPER_ADMIN'/,
      'BroadcastAlert must exclude managers and admins'
    );
  });

  test('Backend TimesheetService counts identical intern pool excluding management and tech leads', () => {
    assert.match(
      timesheetServiceContent,
      /name:\s*\{\s*in:\s*\[\s*'MANAGER',\s*'ADMIN',\s*'SUPER_ADMIN',\s*'TECH_LEAD'\s*\]\s*\}/,
      'TimesheetService must exclude managers, admins, and tech leads'
    );
  });
});
