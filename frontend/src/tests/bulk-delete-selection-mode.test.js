import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Bulk Delete Selection Mode & Visibility Workflow Suite', () => {
  const internsViewPath = path.join(__dirname, '../components/views/InternsView.jsx');
  const modalPath = path.join(__dirname, '../components/modals/BulkDeleteInternsModal.jsx');

  const internsViewContent = fs.readFileSync(internsViewPath, 'utf8');
  const modalContent = fs.readFileSync(modalPath, 'utf8');

  test('1. Checkboxes are hidden by default and conditioned on selection mode', () => {
    // Selection mode state initialized to false
    assert.match(
      internsViewContent,
      /const\s*\[isSelectionMode,\s*setIsSelectionMode\]\s*=\s*useState\(false\)/,
      'isSelectionMode must be initialized to false'
    );

    // Table header checkbox is only rendered when isSelectionMode is true
    assert.match(
      internsViewContent,
      /\{isSelectionMode\s*&&\s*\(\s*<th[^>]*text-center[^>]*>/,
      'Header select-all checkbox must only be displayed in selection mode'
    );

    // Table row checkbox is only rendered when isSelectionMode is true
    assert.match(
      internsViewContent,
      /\{isSelectionMode\s*&&\s*\(\s*<td[^>]*text-center[^>]*>/,
      'Member row checkbox must only be displayed in selection mode'
    );
  });

  test('2. "Delete Selected" button is hidden when no members are selected', () => {
    // Delete Selected button condition strictly requires selectedUserIds.size > 0
    assert.match(
      internsViewContent,
      /selectedUserIds\.size\s*>\s*0\s*&&\s*\(\s*<button[^>]*onClick=\{\(\)\s*=>\s*setIsBulkDeleteModalOpen\(true\)\}/,
      'Delete Selected button must only appear when selectedUserIds.size > 0'
    );

    // Delete Selected text displays exact count of selected members
    assert.match(
      internsViewContent,
      /Delete Selected\s*\(\{selectedUserIds\.size\}\)/,
      'Delete Selected button must display the count of selected members'
    );
  });

  test('3. Clear selection workflow and cancel selection capability', () => {
    // Trigger to enter selection mode
    assert.match(
      internsViewContent,
      /onClick=\{\(\)\s*=>\s*setIsSelectionMode\(true\)\}/,
      'Must provide an action to enter selection mode'
    );

    // Cancel selection handler resets selection mode and selections
    assert.match(
      internsViewContent,
      /const\s+handleCancelSelection\s*=\s*\(\)\s*=>\s*\{[\s\S]*setIsSelectionMode\(false\)[\s\S]*setSelectedUserIds\(new Set\(\)\)/,
      'handleCancelSelection must turn off selection mode and clear selected users'
    );

    // Cancel selection button rendered in the UI
    assert.match(
      internsViewContent,
      /Cancel Selection/,
      'Must render Cancel Selection action for the user'
    );
  });

  test('4. Automatic reset of selections on filter, pagination, or cohort context change', () => {
    // Reset selections on cohort change
    assert.match(
      internsViewContent,
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*setSelectedUserIds\(new Set\(\)\);[\s\S]*\},\s*\[selectedCohortId\]\)/,
      'Must clear selections on selectedCohortId change'
    );

    // Reset selections on search, activeTab, subbatch, currentPage, or pageSize change
    assert.match(
      internsViewContent,
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*setSelectedUserIds\(new Set\(\)\);[\s\S]*\},\s*\[search,\s*activeTab,\s*selectedSubbatches,\s*currentPage,\s*pageSize\]\)/,
      'Must clear selections on search, activeTab, subbatch, or pagination changes to prevent accidental deletions'
    );
  });

  test('5. Bulk Delete Modal requires password and DELETE confirmation', () => {
    // Password input field
    assert.match(
      modalContent,
      /type=\{showPassword \? 'text' : 'password'\}/,
      'Modal must provide password input with visibility toggle'
    );

    // Current password autocomplete attribute
    assert.match(
      modalContent,
      /autoComplete="current-password"/,
      'Password input must specify current-password autocomplete'
    );

    // Irreversible warning message
    assert.match(
      modalContent,
      /This action permanently deletes member accounts and access credentials/,
      'Must state that action permanently deletes accounts and cannot be undone'
    );

    // DELETE keyword confirmation
    assert.match(
      modalContent,
      /confirmText\.trim\(\)\s*===\s*'DELETE'/,
      'Must require exact DELETE keyword to confirm'
    );

    // Target user IDs safely resolved
    assert.match(
      modalContent,
      /targetUserIds/,
      'Modal must safely resolve target user IDs for deletion'
    );
  });
});

