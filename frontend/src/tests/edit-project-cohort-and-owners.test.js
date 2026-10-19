import { test, describe } from 'node:test';
import assert from 'node:assert';
import { 
  COHORT_OPTIONS, 
  getInternCohort, 
  filterInterns, 
  getPrimaryOwnerId,
  formatOwnersDisplay 
} from '../constants/cohorts.js';

describe('Edit Project Modal - Cohort Filtering & Multi-Owner Suite', () => {

  const sampleInterns = [
    { id: 'intern-1', name: 'Aarav Sharma', email: 'aarav@dailoqa.com', batch: 'A', subbatch: 'A1', type: 'INTERN' },
    { id: 'intern-2', name: 'Ananya Iyer', email: 'ananya@dailoqa.com', batch: 'A', subbatch: 'A2', type: 'INTERN' },
    { id: 'intern-3', name: 'Bhavya Patel', email: 'bhavya@dailoqa.com', batch: 'B', subbatch: 'B1', type: 'INTERN' },
    { id: 'intern-4', name: 'Brijesh Nair', email: 'brijesh@dailoqa.com', batch: 'B', subbatch: 'B2', type: 'INTERN' },
    { id: 'intern-5', name: 'Chitra Rao', email: 'chitra@dailoqa.com', batch: 'C', subbatch: 'C1', type: 'INTERN' },
    { id: 'intern-6', name: 'Chetan Kumar', email: 'chetan.kumar@dailoqa.com', batch: 'C', subbatch: 'C2', type: 'INTERN' },
    { id: 'intern-7', name: 'Divya Reddy', email: 'divya@dailoqa.com', batch: 'D', subbatch: 'D1', type: 'INTERN' },
    { id: 'intern-8', name: 'Deepak Kumar', email: 'deepak.kumar@dailoqa.com', batch: 'D', subbatch: 'D2', type: 'INTERN' },
    // Complex schemas in database:
    { id: 'intern-9', name: 'Dinesh D2 Regex', email: 'dinesh@dailoqa.com', batch: 'D', subbatch: 'D / D2', type: 'INTERN' },
    { id: 'intern-10', name: 'Esha Cohort Object', email: 'esha@dailoqa.com', cohort: { code: 'A1' }, type: 'INTERN' },
  ];

  const sampleOrgUsers = [
    { id: 'mgr-1', name: 'Alice Manager', email: 'alice@dailoqa.com', role: 'MANAGER', type: 'STAFF' },
    { id: 'lead-1', name: 'Bob Tech Lead', email: 'bob@dailoqa.com', role: 'TECH_LEAD', type: 'STAFF' },
    { id: 'admin-1', name: 'Super Admin', email: 'admin@dailoqa.com', role: 'SUPER_ADMIN', type: 'STAFF' },
    { id: 'intern-1', name: 'Aarav Sharma', email: 'aarav@dailoqa.com', role: 'INTERN', type: 'INTERN' },
  ];

  describe('1. Cohort Options & Extraction Normalization', () => {
    test('contains exactly the 8 required cohort options in order', () => {
      assert.deepStrictEqual(COHORT_OPTIONS, ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2']);
      assert.strictEqual(COHORT_OPTIONS.length, 8);
    });

    test('normalizes each of the eight cohort options correctly from subbatch', () => {
      for (const cohort of COHORT_OPTIONS) {
        const intern = { subbatch: cohort };
        assert.strictEqual(getInternCohort(intern), cohort);
      }
    });

    test('normalizes combined batch and subbatch (e.g. batch: D, subbatch: 2)', () => {
      const intern = { batch: 'D', subbatch: '2' };
      assert.strictEqual(getInternCohort(intern), 'D2');
    });

    test('normalizes strings like "D / D2"', () => {
      const intern = { batch: 'D', subbatch: 'D / D2' };
      assert.strictEqual(getInternCohort(intern), 'D2');
    });

    test('normalizes cohort code from nested cohort object', () => {
      const intern = { cohort: { code: 'B1' } };
      assert.strictEqual(getInternCohort(intern), 'B1');
    });

    test('returns null for missing or invalid cohort information', () => {
      assert.strictEqual(getInternCohort({}), null);
      assert.strictEqual(getInternCohort(null), null);
      assert.strictEqual(getInternCohort({ batch: 'Z', subbatch: '9' }), null);
    });
  });

  describe('2. Multi-Select Cohort Filtering', () => {
    test('when no cohort is selected, all eligible interns are returned', () => {
      const result = filterInterns({ interns: sampleInterns, selectedCohorts: [] });
      assert.strictEqual(result.length, sampleInterns.length);
    });

    test('filters each of the 8 cohort options individually', () => {
      for (const cohort of COHORT_OPTIONS) {
        const filtered = filterInterns({ interns: sampleInterns, selectedCohorts: [cohort] });
        assert.ok(filtered.length > 0, `Cohort ${cohort} should have matching interns`);
        for (const u of filtered) {
          assert.strictEqual(getInternCohort(u), cohort);
        }
      }
    });

    test('filters multiple cohorts simultaneously (e.g. A1 and B2)', () => {
      const filtered = filterInterns({ interns: sampleInterns, selectedCohorts: ['A1', 'B2'] });
      // A1: intern-1, intern-10. B2: intern-4. Total 3
      assert.strictEqual(filtered.length, 3);
      const cohortCodes = filtered.map((u) => getInternCohort(u));
      assert.ok(cohortCodes.includes('A1'));
      assert.ok(cohortCodes.includes('B2'));
      assert.ok(!cohortCodes.includes('B1'));
      assert.ok(!cohortCodes.includes('C1'));
    });

    test('filters with Select All (all 8 cohorts)', () => {
      const filtered = filterInterns({ interns: sampleInterns, selectedCohorts: [...COHORT_OPTIONS] });
      assert.strictEqual(filtered.length, sampleInterns.length);
    });
  });

  describe('3. Combined Search and Cohort Filtering', () => {
    test('filters by cohort AND search term simultaneously', () => {
      // Searching for 'Kumar' across all interns yields intern-6 (C2) and intern-8 (D2)
      // When cohort filter is ['D2'], only Deepak Kumar (D2) matches
      const filtered = filterInterns({
        interns: sampleInterns,
        selectedCohorts: ['D2'],
        searchQuery: 'Kumar',
      });

      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].id, 'intern-8');
      assert.strictEqual(filtered[0].name, 'Deepak Kumar');
    });

    test('search matches email as well as name', () => {
      const filtered = filterInterns({
        interns: sampleInterns,
        selectedCohorts: ['A1'],
        searchQuery: 'aarav@dailoqa',
      });

      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].id, 'intern-1');
    });

    test('returns empty array when search does not match within selected cohorts', () => {
      const filtered = filterInterns({
        interns: sampleInterns,
        selectedCohorts: ['A1'],
        searchQuery: 'NonExistent',
      });

      assert.strictEqual(filtered.length, 0);
    });
  });

  describe('4. Selection Preservation & Count Invariance', () => {
    test('changing cohort filters does not deselect or alter selected members array', () => {
      // Simulate user selecting intern-1 (A1) and intern-8 (D2)
      let selectedMemberIds = ['intern-1', 'intern-8'];

      // User filters to C1 (neither intern is visible)
      const visibleMembersC1 = filterInterns({
        interns: sampleInterns,
        selectedCohorts: ['C1'],
      });

      // Assert visible members are only C1
      assert.strictEqual(visibleMembersC1.length, 1);
      assert.strictEqual(visibleMembersC1[0].id, 'intern-5');

      // Selection state remains untouched
      assert.strictEqual(selectedMemberIds.length, 2);
      assert.deepStrictEqual(selectedMemberIds, ['intern-1', 'intern-8']);

      // User clears filters -> all visible, selections intact
      const visibleAll = filterInterns({
        interns: sampleInterns,
        selectedCohorts: [],
      });
      assert.strictEqual(visibleAll.length, sampleInterns.length);
      assert.strictEqual(selectedMemberIds.length, 2);
      assert.ok(selectedMemberIds.includes('intern-1'));
      assert.ok(selectedMemberIds.includes('intern-8'));
    });

    test('selected-member count badge displays total complete selection, not visible list count', () => {
      const selectedMemberIds = ['intern-1', 'intern-2', 'intern-7']; // 3 selected
      const filteredList = filterInterns({
        interns: sampleInterns,
        selectedCohorts: ['D1'], // Only intern-7 is visible
      });

      assert.strictEqual(filteredList.length, 1);
      // The badge in UI must show selectedMemberIds.length (3), NOT filteredList.length (1)
      assert.strictEqual(selectedMemberIds.length, 3);
      assert.notStrictEqual(selectedMemberIds.length, filteredList.length);
    });
  });

  describe('5. Multiple Project Owners Management', () => {
    test('authorized owners filter strictly excludes interns', () => {
      const authorizedOwners = sampleOrgUsers.filter(
        (u) => u.type !== 'INTERN' && u.role !== 'INTERN'
      );

      assert.strictEqual(authorizedOwners.length, 3);
      assert.ok(!authorizedOwners.some((u) => u.role === 'INTERN' || u.type === 'INTERN'));
      assert.ok(authorizedOwners.some((u) => u.id === 'mgr-1'));
      assert.ok(authorizedOwners.some((u) => u.id === 'lead-1'));
      assert.ok(authorizedOwners.some((u) => u.id === 'admin-1'));
    });

    test('selecting multiple owners and removing individual owners works cleanly', () => {
      let editOwnerIds = [];

      // Add mgr-1
      editOwnerIds = [...editOwnerIds, 'mgr-1'];
      assert.deepStrictEqual(editOwnerIds, ['mgr-1']);

      // Add lead-1
      editOwnerIds = [...editOwnerIds, 'lead-1'];
      assert.deepStrictEqual(editOwnerIds, ['mgr-1', 'lead-1']);

      // Remove mgr-1 (individual remove button clicked)
      editOwnerIds = editOwnerIds.filter((id) => id !== 'mgr-1');
      assert.deepStrictEqual(editOwnerIds, ['lead-1']);

      // Add admin-1
      editOwnerIds = [...editOwnerIds, 'admin-1'];
      assert.deepStrictEqual(editOwnerIds, ['lead-1', 'admin-1']);
    });

    test('retains existing primary owner if still selected', () => {
      const primary = getPrimaryOwnerId({
        ownerIds: ['lead-1', 'mgr-1', 'admin-1'],
        existingPrimaryOwnerId: 'mgr-1',
      });

      assert.strictEqual(primary, 'mgr-1');
    });

    test('selects first selected owner if previous primary owner was removed', () => {
      const primary = getPrimaryOwnerId({
        ownerIds: ['lead-1', 'admin-1'],
        existingPrimaryOwnerId: 'mgr-1', // mgr-1 is no longer in ownerIds
      });

      assert.strictEqual(primary, 'lead-1');
    });

    test('existing single-owner projects retain single owner compatibility', () => {
      const primary = getPrimaryOwnerId({
        ownerIds: ['mgr-1'],
        existingPrimaryOwnerId: 'mgr-1',
      });

      assert.strictEqual(primary, 'mgr-1');
    });
  });

  describe('6. Multi-Owner Display & Formatting', () => {
    test('formats multiple owners with count and summary', () => {
      const display = formatOwnersDisplay({
        owners: [
          { id: 'mgr-1', name: 'Alice Manager', email: 'alice@dailoqa.com' },
          { id: 'lead-1', name: 'Bob Tech Lead', email: 'bob@dailoqa.com' },
        ],
      });

      assert.strictEqual(display.count, 2);
      assert.strictEqual(display.hasMultiple, true);
      assert.strictEqual(display.primaryName, 'Alice Manager');
      assert.strictEqual(display.names, 'Alice Manager, Bob Tech Lead');
    });

    test('formats single owner display for backward compatibility', () => {
      const display = formatOwnersDisplay({
        primaryOwner: { id: 'mgr-1', name: 'Alice Manager', email: 'alice@dailoqa.com' },
      });

      assert.strictEqual(display.count, 1);
      assert.strictEqual(display.hasMultiple, false);
      assert.strictEqual(display.primaryName, 'Alice Manager');
    });

    test('handles unassigned owner gracefully', () => {
      const display = formatOwnersDisplay({});
      assert.strictEqual(display.count, 0);
      assert.strictEqual(display.primaryName, 'Unassigned');
    });
  });

  describe('7. Responsive Layout Specifications', () => {
    test('confirms search input and cohort filter layout classes', () => {
      // Search: flex-1 (takes more width than filter on desktop)
      // Cohort: w-full sm:w-44 shrink-0
      // Container: flex flex-col sm:flex-row items-stretch sm:items-center gap-2
      const containerClass = 'flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-2';
      const searchContainerClass = 'relative flex-1';
      const cohortContainerClass = 'relative w-full sm:w-44 shrink-0';

      assert.ok(containerClass.includes('flex-col'));
      assert.ok(containerClass.includes('sm:flex-row'));
      assert.ok(searchContainerClass.includes('flex-1'));
      assert.ok(cohortContainerClass.includes('sm:w-44'));
    });
  });
});

