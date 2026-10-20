import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('InternHub — Project Overview Filters & Role-Aware Empty State Suite', () => {

  // Helper simulating the filter resolution logic from ProjectTaskCharts
  function resolveFilters({ projectId, projectMethodology, accessibleSprints = [], filtersState = {} }) {
    const isKanban = projectMethodology === 'KANBAN';
    const showProjectDropdown = !projectId;
    const showSprintDropdown = !isKanban && accessibleSprints.length > 0;
    const showDateRangeFilter = true;

    const defaultProjectId = projectId || '';
    const defaultSprintId = 'ALL';
    const defaultDateRange = 'ALL';

    const selectedProjectId = filtersState.selectedProjectId ?? defaultProjectId;
    const selectedSprintId = filtersState.selectedSprintId ?? defaultSprintId;
    const dateRangeFilter = filtersState.dateRangeFilter ?? defaultDateRange;

    const isFiltersChanged = Boolean(
      (!projectId && selectedProjectId !== defaultProjectId) ||
      (!isKanban && selectedSprintId !== defaultSprintId) ||
      (dateRangeFilter !== defaultDateRange)
    );

    return {
      showProjectDropdown,
      showSprintDropdown,
      showDateRangeFilter,
      isFiltersChanged,
      effectiveProjectId: projectId || selectedProjectId,
    };
  }

  // Helper simulating the role-aware empty state logic from ProjectTaskCharts
  function resolveEmptyState({ role, isTechLead, projectTotalTasks, internAssignedTasks, projectName = 'Demo Project' }) {
    const isManager = role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN';
    const hasFullTeamAccess = isManager || Boolean(isTechLead);
    const isInternUser = !hasFullTeamAccess;

    // For managers/leads, task count is project-level; for interns, it is personal assigned tasks
    const effectiveTotal = hasFullTeamAccess ? projectTotalTasks : internAssignedTasks;

    if (effectiveTotal > 0) {
      return {
        showEmptyState: false,
        view: 'CHARTS_AND_METRICS',
        total: effectiveTotal,
      };
    }

    if (hasFullTeamAccess) {
      return {
        showEmptyState: true,
        type: 'MANAGER_EMPTY_STATE',
        title: 'Nothing on the board just yet.',
        description: "Tasks and deliverables for this project will appear here as your team starts adding work. You're all set to review project progress once work gets underway.",
        buttonText: 'View Project Board',
      };
    }

    return {
      showEmptyState: true,
      type: 'INTERN_EMPTY_STATE',
      title: `No tasks assigned to you in ${projectName}`,
      description: 'You currently have no tasks assigned to your account in this selected project.',
      buttonText: 'View Project Board',
    };
  }

  describe('1. Project Dropdown Removal & Scoped Filter Resolution', () => {
    test('removes Project dropdown when viewing within a specific project context', () => {
      const result = resolveFilters({
        projectId: 'proj-123',
        projectMethodology: 'SCRUM',
        accessibleSprints: [{ id: 'sp-1', name: 'Sprint 1' }],
      });

      assert.strictEqual(result.showProjectDropdown, false, 'Project dropdown must be removed inside a project');
      assert.strictEqual(result.effectiveProjectId, 'proj-123');
      assert.strictEqual(result.showSprintDropdown, true, 'Sprint dropdown should be retained for Scrum');
      assert.strictEqual(result.showDateRangeFilter, true, 'Date range filter should be retained');
    });

    test('retains Project dropdown when on cross-project screens where projectId is omitted', () => {
      const result = resolveFilters({
        projectId: null,
        projectMethodology: null,
        filtersState: { selectedProjectId: 'proj-456' },
      });

      assert.strictEqual(result.showProjectDropdown, true, 'Project dropdown retained when no projectId passed');
      assert.strictEqual(result.effectiveProjectId, 'proj-456');
    });

    test('omits Sprint dropdown on Kanban projects while retaining Date Range filter', () => {
      const result = resolveFilters({
        projectId: 'proj-kanban-1',
        projectMethodology: 'KANBAN',
        accessibleSprints: [{ id: 'sp-1', name: 'Sprint 1' }], // Even if sprints exist in db, Kanban ignores sprints
      });

      assert.strictEqual(result.showProjectDropdown, false);
      assert.strictEqual(result.showSprintDropdown, false, 'Kanban must omit Sprint filter');
      assert.strictEqual(result.showDateRangeFilter, true);
    });
  });

  describe('2. Manager Empty State Resolution', () => {
    test('displays team-oriented copy for manager when project has 0 total tasks', () => {
      const emptyState = resolveEmptyState({
        role: 'MANAGER',
        isTechLead: false,
        projectTotalTasks: 0,
        internAssignedTasks: 0,
        projectName: 'Student Management',
      });

      assert.strictEqual(emptyState.showEmptyState, true);
      assert.strictEqual(emptyState.type, 'MANAGER_EMPTY_STATE');
      assert.strictEqual(emptyState.title, 'Nothing on the board just yet.');
      assert.strictEqual(
        emptyState.description,
        "Tasks and deliverables for this project will appear here as your team starts adding work. You're all set to review project progress once work gets underway."
      );
      assert.strictEqual(emptyState.buttonText, 'View Project Board');
    });

    test('displays team-oriented copy for tech lead when project has 0 total tasks', () => {
      const emptyState = resolveEmptyState({
        role: 'TECH_LEAD',
        isTechLead: true,
        projectTotalTasks: 0,
        internAssignedTasks: 0,
      });

      assert.strictEqual(emptyState.showEmptyState, true);
      assert.strictEqual(emptyState.type, 'MANAGER_EMPTY_STATE');
      assert.strictEqual(emptyState.title, 'Nothing on the board just yet.');
    });

    test('shows full charts and metrics for manager when project has tasks assigned to other team members', () => {
      const state = resolveEmptyState({
        role: 'MANAGER',
        isTechLead: false,
        projectTotalTasks: 8, // Team has 8 tasks on project
        internAssignedTasks: 0, // Manager personally has 0 tasks assigned
        projectName: 'Student Management',
      });

      assert.strictEqual(state.showEmptyState, false);
      assert.strictEqual(state.view, 'CHARTS_AND_METRICS');
      assert.strictEqual(state.total, 8);
    });
  });

  describe('3. Intern Experience & Personal Empty State', () => {
    test('retains personal task-focused messaging for intern with 0 assigned tasks', () => {
      const emptyState = resolveEmptyState({
        role: 'INTERN',
        isTechLead: false,
        projectTotalTasks: 12, // Project has tasks, but none assigned to this intern
        internAssignedTasks: 0,
        projectName: 'Student Management',
      });

      assert.strictEqual(emptyState.showEmptyState, true);
      assert.strictEqual(emptyState.type, 'INTERN_EMPTY_STATE');
      assert.strictEqual(emptyState.title, 'No tasks assigned to you in Student Management');
      assert.strictEqual(
        emptyState.description,
        'You currently have no tasks assigned to your account in this selected project.'
      );
      assert.notStrictEqual(emptyState.title, 'Nothing on the board just yet.');
    });

    test('shows personal task charts for intern when they have assigned tasks', () => {
      const state = resolveEmptyState({
        role: 'INTERN',
        isTechLead: false,
        projectTotalTasks: 15,
        internAssignedTasks: 4,
        projectName: 'Student Management',
      });

      assert.strictEqual(state.showEmptyState, false);
      assert.strictEqual(state.view, 'CHARTS_AND_METRICS');
      assert.strictEqual(state.total, 4);
    });
  });

  describe('4. Reset Filters Behavior without Redundant Project Dropdown', () => {
    test('isFiltersChanged is false on initial load inside project', () => {
      const initial = resolveFilters({
        projectId: 'proj-123',
        projectMethodology: 'SCRUM',
        accessibleSprints: [{ id: 'sp-1', name: 'Sprint 1' }],
        filtersState: { selectedSprintId: 'ALL', dateRangeFilter: 'ALL' },
      });
      assert.strictEqual(initial.isFiltersChanged, false);
    });

    test('isFiltersChanged is true when date range or sprint filter is modified', () => {
      const modifiedDate = resolveFilters({
        projectId: 'proj-123',
        projectMethodology: 'SCRUM',
        accessibleSprints: [{ id: 'sp-1', name: 'Sprint 1' }],
        filtersState: { selectedSprintId: 'ALL', dateRangeFilter: '7D' },
      });
      assert.strictEqual(modifiedDate.isFiltersChanged, true);

      const modifiedSprint = resolveFilters({
        projectId: 'proj-123',
        projectMethodology: 'SCRUM',
        accessibleSprints: [{ id: 'sp-1', name: 'Sprint 1' }],
        filtersState: { selectedSprintId: 'sp-1', dateRangeFilter: 'ALL' },
      });
      assert.strictEqual(modifiedSprint.isFiltersChanged, true);
    });
  });
});

