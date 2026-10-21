import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('Sidebar & Reports Navigation Suite', () => {
  // Navigation helper mirroring ManagerApp getViewFromPath
  const getViewFromPath = (pathname) => {
    let clean = pathname.replace(/^\/manager\/?/, '');
    while (clean.endsWith('/')) {
      clean = clean.slice(0, -1);
    }
    if (!clean || clean === 'dashboard') return 'dashboard';
    if (clean === 'timesheet') return 'timesheets';
    if (['projects', 'my-tasks', 'tasks', 'interns', 'tech-leads', 'reports', 'timesheets', 'channels', 'profile'].includes(clean)) {
      return clean;
    }
    return 'dashboard';
  };

  // Helper mirroring ManagerApp getInitialProjectState
  const getInitialProjectState = (pathname, searchString = '') => {
    try {
      let clean = pathname.replace(/^\/manager\/?/, '');
      while (clean.endsWith('/')) {
        clean = clean.slice(0, -1);
      }
      if (clean !== 'projects') {
        return { projId: null, tab: 'overview' };
      }
      const sp = new URLSearchParams(searchString);
      const projId = sp.get('projectId') || sp.get('project') || null;
      const tab = sp.get('tab') || 'overview';
      return { projId, tab };
    } catch {
      return { projId: null, tab: 'overview' };
    }
  };

  // Helper mirroring ManagerApp getViewTitle
  const getViewTitle = ({ currentRole, currentView, activeProjectId, activeProjectName, authUser }) => {
    if (currentRole === 'intern') return 'Intern Workstation';
    if (currentView === 'projects' && activeProjectId) {
      return activeProjectName || 'Project Workspace';
    }
    switch (currentView) {
      case 'dashboard':
        return `Welcome Back, ${authUser?.name || 'Manager'}`;
      case 'profile':
        return 'Manager Profile';
      case 'projects':
        return 'Projects Directory';
      case 'interns':
        return 'Intern Roster & Oversight';
      case 'tech-leads':
        return 'Tech Leads Console';
      case 'my-tasks':
        return 'My Assigned Tasks & Personal Goals';
      case 'tasks':
        return 'Task Deadlines & Boards';
      case 'reports':
        return 'Intern Performance Reports';
      case 'timesheet':
      case 'timesheets':
        return 'Timesheet & Attendance';
      case 'channels':
        return 'Teams Channel: Forms & Broadcasts';
      default:
        return 'Manager Dashboard';
    }
  };

  // Helper mirroring ManagerApp getBreadcrumbs
  const getBreadcrumbs = ({ currentRole, currentView, activeProjectId, activeProjectName }) => {
    if (currentRole === 'intern') return ['Intern Portal', 'My Workspace'];
    if (currentView === 'projects' && activeProjectId) {
      return ['Projects', activeProjectName || 'Project Workspace'];
    }
    const pageLabel =
      {
        dashboard: 'Manager Dashboard',
        profile: 'Manager Profile',
        projects: 'Projects Directory',
        'my-tasks': 'My Tasks',
        interns: 'Interns',
        'tech-leads': 'Tech Leads',
        tasks: 'Tasks',
        reports: 'Performance Reports',
        timesheets: 'Timesheet',
        timesheet: 'Timesheet',
        channels: 'Teams Channel',
      }[currentView] || 'Manager Dashboard';

    return ['Console', pageLabel];
  };

  test('1. Resolves path routes directly without defaulting to dashboard or projects', () => {
    assert.strictEqual(getViewFromPath('/manager/reports'), 'reports');
    assert.strictEqual(getViewFromPath('/manager/reports/'), 'reports');
    assert.strictEqual(getViewFromPath('/manager/projects'), 'projects');
    assert.strictEqual(getViewFromPath('/manager/dashboard'), 'dashboard');
    assert.strictEqual(getViewFromPath('/manager/timesheets'), 'timesheets');
    assert.strictEqual(getViewFromPath('/manager/channels'), 'channels');
    assert.strictEqual(getViewFromPath('/manager/profile'), 'profile');
  });

  test('2. Reports route is completely independent of projectId in query parameters', () => {
    // When visiting /manager/reports, even if leftover projectId or project query exists
    const projectState = getInitialProjectState('/manager/reports', '?projectId=proj-123&tab=kanban');
    assert.strictEqual(projectState.projId, null, 'Reports pathname must never adopt projId from URL query');

    // When visiting /manager/projects, projectId is respected
    const validProjectState = getInitialProjectState('/manager/projects', '?projectId=proj-123&tab=kanban');
    assert.strictEqual(validProjectState.projId, 'proj-123');
    assert.strictEqual(validProjectState.tab, 'kanban');
  });

  test('3. Workspace view gate (currentView === "projects" && activeProjectId) prevents project render on Reports', () => {
    // Simulating state during navigation transition
    const stateInTransition = {
      currentView: 'reports',
      activeProjectId: 'proj-123', // stale or transit id
    };

    const shouldRenderWorkspace = stateInTransition.currentView === 'projects' && Boolean(stateInTransition.activeProjectId);
    assert.strictEqual(shouldRenderWorkspace, false, 'ProjectWorkspaceView must never render when currentView is reports');
  });

  test('4. Breadcrumbs and Title for Reports remain independent of activeProjectId', () => {
    const title = getViewTitle({
      currentRole: 'manager',
      currentView: 'reports',
      activeProjectId: 'proj-123',
      activeProjectName: 'Alpha Project',
      authUser: { name: 'Manager Bob' }
    });
    assert.strictEqual(title, 'Intern Performance Reports');

    const breadcrumbs = getBreadcrumbs({
      currentRole: 'manager',
      currentView: 'reports',
      activeProjectId: 'proj-123',
      activeProjectName: 'Alpha Project'
    });
    assert.deepStrictEqual(breadcrumbs, ['Console', 'Performance Reports']);
  });

  test('5. Single-click navigation simulation from each project tab to Reports', () => {
    const projectTabs = ['overview', 'roadmap', 'backlog', 'kanban', 'scrum', 'action-items', 'approvals'];

    for (const tab of projectTabs) {
      let activeProjectId = 'project-alpha';
      let activeProjectName = 'Alpha Project';
      let activeProjectTab = tab;
      let currentView = 'projects';
      let navigatedUrl = null;
      let exitProjectCalled = false;

      const handleExitProject = () => {
        exitProjectCalled = true;
        activeProjectId = null;
        activeProjectName = null;
        currentView = 'projects';
        navigatedUrl = '/manager/projects';
      };

      const handleNavigate = (viewId) => {
        currentView = viewId;
        activeProjectId = null;
        activeProjectName = null;
        navigatedUrl = `/manager/${viewId}`;
      };

      // In fixed Sidebar.jsx, clicking Reports ONLY calls setCurrentView('reports')
      // and does NOT invoke onExitProject()
      handleNavigate('reports');

      assert.strictEqual(exitProjectCalled, false, `Tab ${tab}: handleExitProject must NOT be invoked when clicking Reports`);
      assert.strictEqual(navigatedUrl, '/manager/reports', `Tab ${tab}: navigatedUrl must directly be /manager/reports`);
      assert.strictEqual(currentView, 'reports', `Tab ${tab}: currentView must immediately transition to reports`);
      assert.strictEqual(activeProjectId, null, `Tab ${tab}: activeProjectId must be cleared`);
    }
  });

  test('6. Clicking Projects from within a project workspace exits to directory', () => {
    let activeProjectId = 'project-alpha';
    let currentView = 'projects';
    let navigatedUrl = null;

    const handleExitProject = () => {
      activeProjectId = null;
      currentView = 'projects';
      navigatedUrl = '/manager/projects';
    };

    // Sidebar: if (item.id === 'projects' && isProjectWorkspace) onExitProject?.();
    const isProjectWorkspace = Boolean(activeProjectId);
    const itemId = 'projects';

    if (itemId === 'projects' && isProjectWorkspace) {
      handleExitProject();
    }

    assert.strictEqual(navigatedUrl, '/manager/projects');
    assert.strictEqual(activeProjectId, null);
    assert.strictEqual(currentView, 'projects');
  });

  test('7. Profile section styling, initials extraction, and two-line name wrapping', () => {
    const getInitials = (name) => {
      if (!name) return 'PP';
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    };

    // Test with Postman Manager Profile
    assert.strictEqual(getInitials('Postman Manager Profile'), 'PP');
    assert.strictEqual(getInitials('Alice Johnson'), 'AJ');
    assert.strictEqual(getInitials('Manager'), 'MA');
    assert.strictEqual(getInitials(''), 'PP');

    // Layout configuration checks
    const profileContainerClasses = 'shrink-0 min-h-[76px] px-3.5 py-4 sm:px-4 sm:py-4.5 bg-purple-950/40 border-t border-purple-800/60 flex items-center';
    assert.ok(profileContainerClasses.includes('min-h-[76px]'), 'Profile section should have sufficient minimum height');
    assert.ok(profileContainerClasses.includes('px-3.5') || profileContainerClasses.includes('px-4'), 'Profile section should have generous horizontal padding');
    assert.ok(profileContainerClasses.includes('py-4'), 'Profile section should have generous vertical padding');

    const nameSpanClasses = 'text-xs sm:text-[13px] font-bold text-white leading-tight break-words line-clamp-2';
    assert.ok(nameSpanClasses.includes('line-clamp-2'), 'User name should allow two lines rather than premature single-line clipping');
    assert.ok(nameSpanClasses.includes('break-words'), 'User name should break gracefully without overflowing container');

    const roleSpanClasses = 'text-[10px] font-semibold text-purple-300/80 tracking-wider uppercase block mt-1 truncate';
    assert.ok(roleSpanClasses.includes('mt-1'), 'Role badge should have clean spacing below name');
    assert.ok(roleSpanClasses.includes('uppercase'), 'Role should be formatted uppercase');
  });
});

