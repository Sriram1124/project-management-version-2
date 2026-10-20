import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Intern Portal Header & Protected Routes Regression Suite', () => {
  const internAppPath = path.join(__dirname, '../features/intern/InternApp.jsx');
  const protectedRoutePath = path.join(__dirname, '../shared/components/ProtectedRoute.jsx');

  const internAppContent = fs.readFileSync(internAppPath, 'utf8');
  const protectedRouteContent = fs.readFileSync(protectedRoutePath, 'utf8');

  test('1. "Manager Workspace" button is completely removed from InternApp header', () => {
    assert.doesNotMatch(
      internAppContent,
      /Manager Workspace/,
      'InternApp header must not contain "Manager Workspace" button or text'
    );
    assert.doesNotMatch(
      internAppContent,
      /title="Switch to Manager Workspace"/,
      'InternApp header must not contain title tooltip for switching to Manager Workspace'
    );
    assert.doesNotMatch(
      internAppContent,
      /navigate\('\/manager\/dashboard'\)/,
      'InternApp must not have navigate calls routing to /manager/dashboard'
    );
  });

  test('2. InternApp header retains breadcrumbs, notification trigger, and date display', () => {
    assert.match(
      internAppContent,
      /getBreadcrumbTitle\(\)/,
      'InternApp header must retain breadcrumb title'
    );
    assert.match(
      internAppContent,
      /title="Notifications"/,
      'InternApp header must preserve the notification button'
    );
    assert.match(
      internAppContent,
      /toLocaleDateString\('en-US'/,
      'InternApp header must preserve the formatted date display'
    );
  });

  test('3. ProtectedRoute strictly prohibits interns from accessing manager routes', () => {
    // Confirm intern and employee exclusion from manager routes
    assert.match(
      protectedRouteContent,
      /user\.role !== 'INTERN'/,
      'ProtectedRoute must explicitly prevent INTERN from accessing manager routes'
    );
    assert.match(
      protectedRouteContent,
      /user\.role !== 'EMPLOYEE'/,
      'ProtectedRoute must explicitly prevent EMPLOYEE from accessing manager routes'
    );
    // Confirm manager role check
    assert.match(
      protectedRouteContent,
      /allowedRoles\.includes\(user\.role\)/,
      'ProtectedRoute must allow users whose role is in allowedRoles'
    );
  });
});

