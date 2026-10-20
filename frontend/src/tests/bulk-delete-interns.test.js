import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Bulk Delete Interns & Password-Protected Verification Suite', () => {
  const internsViewPath = path.join(__dirname, '../components/views/InternsView.jsx');
  const modalPath = path.join(__dirname, '../components/modals/BulkDeleteInternsModal.jsx');
  const resultsModalPath = path.join(__dirname, '../components/modals/BulkDeleteResultsModal.jsx');
  const userServicePath = path.join(__dirname, '../services/users.service.js');

  const internsViewContent = fs.readFileSync(internsViewPath, 'utf8');
  const modalContent = fs.readFileSync(modalPath, 'utf8');
  const resultsModalContent = fs.readFileSync(resultsModalPath, 'utf8');
  const userServiceContent = fs.readFileSync(userServicePath, 'utf8');

  test('1. Table Header and Member Checkboxes for Bulk Selection', () => {
    // Header checkbox for selecting current page
    assert.match(
      internsViewContent,
      /ref=\{headerCheckboxRef\}/,
      'Must attach headerCheckboxRef for indeterminate and sync state'
    );
    assert.match(
      internsViewContent,
      /onChange=\{handleToggleSelectPage\}/,
      'Header checkbox must toggle selection of members on current page'
    );

    // Individual row checkboxes
    assert.match(
      internsViewContent,
      /onChange=\{\(\) => handleToggleUser\(user\.id\)\}/,
      'Each member row must have a checkbox toggling individual user selection'
    );
  });

  test('2. Selection Action Toolbar and Explicit Scope Banner Across Pages', () => {
    // Action toolbar displayed when selectedUserIds.size > 0
    assert.match(
      internsViewContent,
      /selectedUserIds\.size > 0/,
      'Must conditionally render selection bar when at least one user is selected'
    );
    assert.match(
      internsViewContent,
      /Delete Selected \(\{selectedUserIds\.size\}\)/,
      'Must display the exact count of selected members on the delete button'
    );
    assert.match(
      internsViewContent,
      /Clear selection/i,
      'Must provide an easy action to clear selection'
    );

    // Cross-page scope banner
    assert.match(
      internsViewContent,
      /Select all \{filteredUsers\.length\} matching members across every page/,
      'Must provide explicit option to expand selection across all pages'
    );
  });

  test('3. Confirmation Modal Security: Password Verification and DELETE Confirmation', () => {
    // Password verification input
    assert.match(
      modalContent,
      /type=\{showPassword \? 'text' : 'password'\}/,
      'Modal must have a password input with visibility toggle'
    );
    assert.match(
      modalContent,
      /autoComplete="current-password"/,
      'Password input should use current-password attribute'
    );

    // Explicit DELETE keyword verification
    assert.match(
      modalContent,
      /confirmText\.trim\(\) === 'DELETE'/,
      'Modal must strictly require the word DELETE to confirm'
    );

    // Can submit guard
    assert.match(
      modalContent,
      /const canSubmit = isConfirmed && hasPassword && !loading && selectedCount > 0/,
      'Must disable submission unless password is provided, DELETE is typed, and not loading'
    );

    // Displays affected count
    assert.match(
      modalContent,
      /Delete \{selectedCount\} Member/,
      'Confirmation action must clearly display the number of affected members'
    );
  });

  test('4. Frontend API Service Integration', () => {
    assert.match(
      userServiceContent,
      /deleteUsersBulk\(\{ userIds, password \}\)/,
      'usersService must provide deleteUsersBulk endpoint call'
    );
    assert.match(
      userServiceContent,
      /api\.post\('\/users\/bulk\/delete', \{ userIds, password \}\)/,
      'deleteUsersBulk must issue POST to /users/bulk/delete with userIds and password'
    );
  });

  test('5. Results and Protected Records Feedback Handling', () => {
    assert.match(
      resultsModalContent,
      /deletedCount/,
      'Results modal must display deleted count'
    );
    assert.match(
      resultsModalContent,
      /failedCount/,
      'Results modal must display failed or blocked count'
    );
    assert.match(
      resultsModalContent,
      /Protected Records/,
      'Results modal must display protected records and reasons'
    );
  });
});

