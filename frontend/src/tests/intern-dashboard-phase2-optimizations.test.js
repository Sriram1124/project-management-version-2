import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Intern Dashboard Phase 2 Performance Optimizations Suite', () => {
  const internProjectsServicePath = path.join(__dirname, '../features/intern/services/projectsService.js');
  const centralProjectsServicePath = path.join(__dirname, '../services/projects.service.js');
  const internAppPath = path.join(__dirname, '../features/intern/InternApp.jsx');
  const internNotificationsServicePath = path.join(__dirname, '../features/intern/services/notificationsService.js');
  const hierarchicalTablePath = path.join(__dirname, '../components/backlog/HierarchicalIssueTable.jsx');

  const internProjectsContent = fs.readFileSync(internProjectsServicePath, 'utf8');
  const centralProjectsContent = fs.readFileSync(centralProjectsServicePath, 'utf8');
  const internAppContent = fs.readFileSync(internAppPath, 'utf8');
  const internNotificationsContent = fs.readFileSync(internNotificationsServicePath, 'utf8');
  const hierarchicalTableContent = fs.readFileSync(hierarchicalTablePath, 'utf8');

  describe('1. Redundant Project Requests & TTL Caching', () => {
    test('intern projectsService implements 30-second TTL and in-flight request deduplication', () => {
      assert.match(
        internProjectsContent,
        /const\s+CACHE_TTL_MS\s*=\s*30_?000/,
        'Must define 30-second cache TTL'
      );
      assert.match(
        internProjectsContent,
        /let\s+inFlightPromise\s*=\s*null/,
        'Must maintain inFlightPromise for request deduplication'
      );
      assert.match(
        internProjectsContent,
        /if\s*\(\s*isFresh\s*\)\s*\{\s*return\s+cachedProjects;\s*\}/,
        'Must return cached projects immediately when fresh'
      );
      assert.match(
        internProjectsContent,
        /if\s*\(\s*inFlightPromise\s*\)\s*\{\s*return\s+inFlightPromise;\s*\}/,
        'Must return existing inFlightPromise to avoid concurrent duplicate requests'
      );
    });

    test('intern projectsService exports invalidateProjectsCache and listens to mutation events', () => {
      assert.match(
        internProjectsContent,
        /export\s+function\s+invalidateProjectsCache\s*\(\s*\)/,
        'Must export invalidateProjectsCache'
      );
      assert.match(
        internProjectsContent,
        /window\.addEventListener\(['"]project-updated['"]/,
        'Must listen for project updates to automatically invalidate cache'
      );
    });

    test('central projects.service.js implements TTL caching and auto-invalidates on mutations', () => {
      assert.match(
        centralProjectsContent,
        /let\s+cachedMyProjects\s*=\s*null/,
        'Must maintain cachedMyProjects'
      );
      assert.match(
        centralProjectsContent,
        /export\s+function\s+invalidateCentralProjectsCache\s*\(\s*\)/,
        'Must export central invalidation function'
      );
      assert.match(
        centralProjectsContent,
        /createProject[\s\S]*?invalidateCentralProjectsCache\(\)/,
        'Must invalidate cache on createProject'
      );
      assert.match(
        centralProjectsContent,
        /updateProject[\s\S]*?invalidateCentralProjectsCache\(\)/,
        'Must invalidate cache on updateProject'
      );
      assert.match(
        centralProjectsContent,
        /deleteProject[\s\S]*?invalidateCentralProjectsCache\(\)/,
        'Must invalidate cache on deleteProject'
      );
    });
  });

  describe('2. Notification Polling Optimization & Lifecycle', () => {
    test('notificationsService guards against overlapping concurrent requests', () => {
      assert.match(
        internNotificationsContent,
        /let\s+inFlightLoadPromise\s*=\s*null/,
        'Must maintain inFlightLoadPromise'
      );
      assert.match(
        internNotificationsContent,
        /if\s*\(\s*inFlightLoadPromise\s*\)\s*return\s+inFlightLoadPromise;/,
        'Must return existing inFlightLoadPromise when fetch is already running'
      );
      assert.match(
        internNotificationsContent,
        /inFlightLoadPromise\s*=\s*null;/,
        'Must reset inFlightLoadPromise in finally block'
      );
    });

    test('InternApp pauses polling when tab is hidden and resumes when visible', () => {
      assert.match(
        internAppContent,
        /document\.addEventListener\(['"]visibilitychange['"],\s*handleVisibilityChange\)/,
        'Must listen for visibilitychange events'
      );
      assert.match(
        internAppContent,
        /if\s*\(\s*document\.hidden\s*\)\s*\{\s*stopPolling\(\);/,
        'Must stop polling interval when document is hidden'
      );
      assert.match(
        internAppContent,
        /notificationsService\.loadNotifications\(\);\s*startPolling\(\);/,
        'Must immediately refresh notifications and restart interval when tab becomes visible'
      );
    });

    test('InternApp cleans up timers and visibility listener on unmount', () => {
      assert.match(
        internAppContent,
        /stopPolling\(\);/,
        'Must stop polling on unmount'
      );
      assert.match(
        internAppContent,
        /document\.removeEventListener\(['"]visibilitychange['"],\s*handleVisibilityChange\)/,
        'Must remove visibilitychange listener on unmount'
      );
    });
  });

  describe('3. Hierarchical Issue Table Optimization', () => {
    test('HierarchicalRow is wrapped in React.memo', () => {
      assert.match(
        hierarchicalTableContent,
        /const\s+HierarchicalRow\s*=\s*React\.memo\s*\(\s*function\s+HierarchicalRow/,
        'HierarchicalRow must be wrapped with React.memo'
      );
    });

    test('HierarchicalNode is wrapped in React.memo', () => {
      assert.match(
        hierarchicalTableContent,
        /const\s+HierarchicalNode\s*=\s*React\.memo\s*\(\s*function\s+HierarchicalNode/,
        'HierarchicalNode must be wrapped with React.memo'
      );
    });

    test('Table row incorporates content-visibility: auto for rendering optimization', () => {
      assert.match(
        hierarchicalTableContent,
        /contentVisibility:\s*['"]auto['"]/,
        'Rows must use contentVisibility: auto'
      );
      assert.match(
        hierarchicalTableContent,
        /containIntrinsicSize:\s*['"]0\s+40px['"]/,
        'Rows must specify containIntrinsicSize for stable scroll height'
      );
    });
  });
});

