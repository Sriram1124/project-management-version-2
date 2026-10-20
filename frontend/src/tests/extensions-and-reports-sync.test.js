import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Extensions Column, Performance Report Navigation & Tech Lead Sync Suite', () => {
  const internsViewPath = path.join(__dirname, '../components/views/InternsView.jsx');
  const userModalPath = path.join(__dirname, '../components/modals/UserDetailModal.jsx');
  const reportsViewPath = path.join(__dirname, '../components/views/ReportsView.jsx');
  const backendUserServicePath = path.join(__dirname, '../../../backend-node/src/services/user.service.ts');
  const backendWorkItemServicePath = path.join(__dirname, '../../../backend-node/src/services/work-item.service.ts');

  const internsViewContent = fs.readFileSync(internsViewPath, 'utf8');
  const userModalContent = fs.readFileSync(userModalPath, 'utf8');
  const reportsViewContent = fs.readFileSync(reportsViewPath, 'utf8');
  const backendUserServiceContent = fs.readFileSync(backendUserServicePath, 'utf8');
  const backendWorkItemServiceContent = fs.readFileSync(backendWorkItemServicePath, 'utf8');

  describe('1. Extensions Column Removed from Interns and Reports Tables', () => {
    test('Interns table header does not include Extensions column', () => {
      assert.doesNotMatch(
        internsViewContent,
        /<th[^>]*>Extensions<\/th>/,
        'Interns table header must not include an Extensions column'
      );
    });

    test('Reports table header does not include Extensions column', () => {
      assert.doesNotMatch(
        reportsViewContent,
        /<th[^>]*>Extensions<\/th>/,
        'Reports table header must not include an Extensions column'
      );
    });

    test('Backend UserService includes requested_extensions and maps count + stats', () => {
      assert.match(
        backendUserServiceContent,
        /requested_extensions:\s*\{[\s\S]*?select:\s*\{[\s\S]*?id:\s*true,[\s\S]*?status:\s*true/,
        'Backend UserService.listUsers must include requested_extensions relation'
      );
      assert.match(
        backendUserServiceContent,
        /extensions_count:\s*totalExtensions/,
        'Backend UserService must map extensions_count'
      );
      assert.match(
        backendUserServiceContent,
        /extension_stats:\s*\{[\s\S]*?total:[\s\S]*?pending:[\s\S]*?approved:[\s\S]*?rejected:/,
        'Backend UserService must return extension_stats with breakdown'
      );
    });
  });

  describe('2. Context-Aware Performance Report Navigation', () => {
    test('UserDetailModal navigates to /manager/reports with user ID in URL and route state', () => {
      assert.match(
        userModalContent,
        /\/manager\/reports\?userId=\$\{encodeURIComponent\(targetUserId\)\}/,
        'Must navigate to /manager/reports with targetUserId in query parameter'
      );
      assert.match(
        userModalContent,
        /state:\s*\{\s*userId:\s*targetUserId\s*\}/,
        'Must pass userId in navigation route state'
      );
    });

    test('InternsView wires onOpenPerformanceReport navigation to UserDetailModal', () => {
      assert.match(
        internsViewContent,
        /onOpenPerformanceReport=\{\(u\) => \{[\s\S]*?navigate\(`\/manager\/reports\?userId=\$\{encodeURIComponent\(u\.id\)\}`/,
        'InternsView must pass onOpenPerformanceReport navigating with user ID'
      );
    });

    test('ReportsView parses userId from searchParams and location state', () => {
      assert.match(
        reportsViewContent,
        /useSearchParams,\s*useLocation/,
        'ReportsView must import useSearchParams and useLocation from react-router-dom'
      );
      assert.match(
        reportsViewContent,
        /searchParams\.get\('userId'\)/,
        'ReportsView must read userId from URL searchParams'
      );
      assert.match(
        reportsViewContent,
        /location\?\.state\?\.userId/,
        'ReportsView must read userId from location state'
      );
    });

    test('ReportsView initializes selectedScope and triggers immediate analytics load', () => {
      assert.match(
        reportsViewContent,
        /const \[selectedScope, setSelectedScope\] = useState\(\(\) => queryUserId \|\| 'ALL'\)/,
        'ReportsView must initialize selectedScope with queryUserId if present'
      );
      assert.match(
        reportsViewContent,
        /targetScope = queryUserId \|\| selectedScope/,
        'Initial report load must respect queryUserId'
      );
      assert.match(
        reportsViewContent,
        /useEffect\(\(\) => \{[\s\S]*?if \(queryUserId && queryUserId !== selectedScope\) \{[\s\S]*?setSelectedScope\(queryUserId\);/,
        'ReportsView must synchronize selectedScope when queryUserId changes on navigation'
      );
    });

    test('ReportsView handles invalid or inactive user IDs gracefully without crashing', () => {
      assert.match(
        reportsViewContent,
        /selectedScopeMember = useMemo\(\(\) => \{[\s\S]*?return memberPerformanceMap\.get\(selectedScope\) \|\| members\.find\([\s\S]*?\) \|\| analytics\?\.target_user \|\| null;/,
        'ReportsView must provide safe fallbacks for selectedScopeMember'
      );
    });
  });

  describe('3. Tech Lead Synchronization in Performance Reports', () => {
    test('ReportsView identifies tech leads via role, type, project_role, or is_tech_lead flag', () => {
      assert.match(
        reportsViewContent,
        /const isLead = m\.role === 'TECH_LEAD' \|\| m\.type === 'TECH_LEAD' \|\| m\.project_role === 'TECH_LEAD' \|\| Boolean\(m\.is_tech_lead\)/,
        'ReportsView must detect tech lead through all canonical role definitions'
      );
    });

    test('ReportsView incorporates tech leads from live analytics response', () => {
      assert.match(
        reportsViewContent,
        /if \(Array\.isArray\(analytics\?\.members\)\) \{/,
        'ReportsView must incorporate members returned from live analytics API'
      );
      assert.match(
        reportsViewContent,
        /if \(analytics\?\.target_user\) \{/,
        'ReportsView must incorporate targeted user from analytics API'
      );
    });

    test('Backend WorkItemService queries tech leads across organization and cohort scope', () => {
      assert.match(
        backendWorkItemServiceContent,
        /orgTechLeads[\s\S]*?targetUserRecord/,
        'WorkItemService must destructure orgTechLeads and targetUserRecord in Promise.all'
      );
      assert.ok(
        backendWorkItemServiceContent.includes("role: { name: 'TECH_LEAD' }"),
        'WorkItemService must query users with TECH_LEAD role'
      );
      assert.match(
        backendWorkItemServiceContent,
        /pMembers[\s\S]*?project_role:\s*true/,
        'WorkItemService must query project members with roles'
      );
      assert.match(
        backendWorkItemServiceContent,
        /is_tech_lead:\s*isLead/,
        'WorkItemService must map is_tech_lead flag in projectMembers'
      );
    });

    test('Backend UserService allows Tech Leads to be retrieved when cohort filter is active', () => {
      assert.match(
        backendUserServiceContent,
        /roles:\s*\{\s*some:\s*\{\s*role:\s*\{\s*name:\s*'TECH_LEAD'\s*\}\s*\}\s*\}/,
        'UserService cohort filtering must allow Tech Leads'
      );
      assert.match(
        backendUserServiceContent,
        /is_tech_lead:\s*isTechLead/,
        'UserService mapped user must include is_tech_lead flag'
      );
    });

    test('Tech Leads section displays live tracked count and allows selectable rows to focus scope', () => {
      assert.match(
        reportsViewContent,
        /selectedScope === 'TECH_LEADS'\s*\?\s*'Tech Leads Performance & Delivery'/,
        'Must display "Tech Leads Performance & Delivery" heading when TECH_LEADS scope is active'
      );
      assert.match(
        reportsViewContent,
        /\{performanceRows\.length\} Tracked/,
        'Must display accurate count of tracked members in section heading'
      );
      assert.match(
        reportsViewContent,
        /\{performanceRows\.filter\(\(r\) => r\.isTechLead\)\.length\} tech leads/,
        'Must display count of tech leads in KPI summary strip'
      );
      assert.match(
        reportsViewContent,
        /onClick=\{\(\) => handleSelectScope\(isSelected \? 'ALL' : mem\.userId\)\}/,
        'Tech lead row must be clickable to focus report on that individual lead'
      );
    });
  });

  describe('4. Individual Scope Excludes Project Health in Performance Reports', () => {
    test('ReportsView computes isIndividualScope when scope is an individual intern or lead', () => {
      const freshReports = fs.readFileSync(reportsViewPath, 'utf8');
      assert.match(
        freshReports,
        /const isIndividualScope = selectedScope !== 'ALL' && selectedScope !== 'TECH_LEADS'/,
        'ReportsView must derive isIndividualScope accurately'
      );
    });

    test('ReportsView hides Project Health badge pill for individual member scopes', () => {
      const freshReports = fs.readFileSync(reportsViewPath, 'utf8');
      assert.match(
        freshReports,
        /{!isIndividualScope && \(analytics\?\.project_health \|\| analytics\?\.delivery_risk\) && \(/,
        'Project health pill must be wrapped with !isIndividualScope'
      );
    });

    test('ReportsView hides Project Health tab switcher for individual member scopes', () => {
      const freshReports = fs.readFileSync(reportsViewPath, 'utf8');
      assert.match(
        freshReports,
        /{!isIndividualScope && \(\s*<div className="w-full grid grid-cols-2/,
        'Project health tab switcher must only show when not in individual member scope'
      );
    });
  });
});
