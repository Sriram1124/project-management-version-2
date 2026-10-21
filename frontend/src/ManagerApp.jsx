import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import ManagerDashboardView from './components/views/ManagerDashboardView';

const ProjectsDirectoryView = React.lazy(() => import('./components/views/projects/ProjectsDirectoryView'));
const ProjectWorkspaceView = React.lazy(() => import('./components/views/projects/ProjectWorkspaceView'));
const InternsView = React.lazy(() => import('./components/views/InternsView'));
const TechLeadsView = React.lazy(() => import('./components/views/TechLeadsView'));
const TasksView = React.lazy(() => import('./components/views/TasksView'));
const ManagerMyTasksView = React.lazy(() => import('./components/views/ManagerMyTasksView'));
const ReportsView = React.lazy(() => import('./components/views/ReportsView'));
const ManagerTimesheetsView = React.lazy(() => import('./components/views/ManagerTimesheetsView'));
const ManagerProfileView = React.lazy(() => import('./components/views/ManagerProfileView'));
const InternPortalView = React.lazy(() => import('./components/views/InternPortalView'));
const AlertModal = React.lazy(() => import('./components/modals/AlertModal'));
const QuickSearchModal = React.lazy(() => import('./components/modals/QuickSearchModal'));
const ExceptionDetailModal = React.lazy(() => import('./components/modals/ExceptionDetailModal'));
const TeamsChannelView = React.lazy(() => import('./components/channels/TeamsChannelView'));

function ViewLoadingFallback() {
  return (
    <div className="p-8 flex items-center justify-center min-h-[300px]">
      <div className="flex flex-col items-center gap-2">
        <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-medium text-slate-400">Loading view...</span>
      </div>
    </div>
  );
}
import { CheckCircle2 } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { notificationsService } from './services/notifications.service';
import { cohortsService } from './services/cohorts.service';

// Module-level cache to ensure zero-latency renders across component remounts
let cachedCohortsList = null;

export default function ManagerApp() {
  const { user: authUser, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

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

  const getInitialProjectState = (pathname) => {
    try {
      let clean = pathname.replace(/^\/manager\/?/, '');
      while (clean.endsWith('/')) {
        clean = clean.slice(0, -1);
      }
      if (clean !== 'projects') {
        return { projId: null, tab: 'overview' };
      }
      const sp = new URLSearchParams(window.location.search);
      const projId = sp.get('projectId') || sp.get('project') || null;
      const tab = sp.get('tab') || 'overview';
      return { projId, tab };
    } catch {
      return { projId: null, tab: 'overview' };
    }
  };

  const initialProjectState = getInitialProjectState(location.pathname);
  const [currentRole, setCurrentRole] = useState('manager'); // 'manager' | 'intern'
  const [currentView, setCurrentView] = useState(() => {
    return getViewFromPath(location.pathname);
  });
  const [activeProjectId, setActiveProjectId] = useState(() => {
    const v = getViewFromPath(location.pathname);
    return v === 'projects' ? initialProjectState.projId : null;
  });
  const [activeProjectName, setActiveProjectName] = useState(null);
  const [activeProjectTab, setActiveProjectTab] = useState(initialProjectState.tab);

  // Cohort state management - initialize from module cache or sessionStorage for instant render
  const [cohorts, setCohorts] = useState(() => {
    if (cachedCohortsList && cachedCohortsList.length > 0) return cachedCohortsList;
    try {
      const stored = sessionStorage.getItem('internhub_cohorts');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          cachedCohortsList = parsed;
          return parsed;
        }
      }
    } catch (e) {}
    return [];
  });
  const [selectedCohortId, setSelectedCohortId] = useState(() => {
    return localStorage.getItem('selected_cohort_id') || null;
  });

  useEffect(() => {
    let isMounted = true;
    cohortsService.getCohorts()
      .then((data) => {
        if (isMounted && Array.isArray(data) && data.length > 0) {
          setCohorts(data);
          cachedCohortsList = data;
          try {
            sessionStorage.setItem('internhub_cohorts', JSON.stringify(data));
          } catch (e) {}

          // Default to stored cohort if valid, else first cohort (Cohort 1)
          const stored = localStorage.getItem('selected_cohort_id');
          const found = data.find((c) => c.id === stored);
          if (found) {
            setSelectedCohortId(found.id);
          } else {
            setSelectedCohortId(data[0].id);
            localStorage.setItem('selected_cohort_id', data[0].id);
          }
        }
      })
      .catch((err) => console.error('Failed to load cohorts:', err));

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelectCohort = (cohortId) => {
    setSelectedCohortId(cohortId);
    localStorage.setItem('selected_cohort_id', cohortId);
    const chosen = cohorts.find((c) => c.id === cohortId);
    if (chosen) {
      triggerToast(`Switched view to ${chosen.name}`);
    }
  };

  useEffect(() => {
    const view = getViewFromPath(location.pathname);
    const sp = new URLSearchParams(location.search);
    const pId = view === 'projects' ? (sp.get('projectId') || sp.get('project') || null) : null;
    const tab = sp.get('tab') || 'overview';

    if (pId !== activeProjectId) {
      setActiveProjectId(pId);
      if (!pId) setActiveProjectName(null);
    }
    if (tab !== activeProjectTab) {
      setActiveProjectTab(tab);
    }
    if (view !== currentView) {
      setCurrentView(view);
    }
  }, [location.pathname, location.search, activeProjectId, activeProjectTab, currentView]);

  const handleNavigate = (viewId) => {
    setCurrentView(viewId);
    setActiveProjectId(null);
    setActiveProjectName(null);
    if (currentRole !== 'manager') setCurrentRole('manager');
    if (viewId === 'dashboard') {
      navigate('/manager/dashboard');
    } else {
      navigate(`/manager/${viewId}`);
    }
  };
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [selectedException, setSelectedException] = useState(null);
  const [toast, setToast] = useState(null);
  const [channelForms, setChannelForms] = useState([]);

  const handlePostChannelForm = (newForm) => {
    setChannelForms((prev) => [newForm, ...prev]);
    triggerToast(`Form "${newForm.title}" posted to Teams Channel`);
  };

  const handleSubmitChannelFormResponse = ({ formId, internName, section, rating, blocker }) => {
    setChannelForms((prev) =>
      prev.map((f) => {
        if (f.id === formId) {
          const newResp = {
            id: `r-${Date.now()}`,
            internName,
            section,
            submittedAt: 'Just now',
            rating,
            blocker,
          };
          return {
            ...f,
            submittedCount: Math.min(f.totalTarget, f.submittedCount + 1),
            sampleResponses: [newResp, ...(f.sampleResponses || [])],
          };
        }
        return f;
      })
    );
    triggerToast('Form response submitted successfully!');
  };

  // Global Keyboard Shortcuts (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setIsAlertModalOpen(false);
        setSelectedException(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const triggerToast = (msg) => {
    const text = typeof msg === 'object' && msg !== null 
      ? (msg.message || msg.msg || JSON.stringify(msg)) 
      : String(msg || '');
    setToast({ msg: text });
    setTimeout(() => setToast(null), 3500);
  };

  const handleAlertSent = (message, targetGroup) => {
    triggerToast(
      `Broadcast alert dispatched to ${
        targetGroup === 'all-cohort' ? 'all 48 interns' : '11 pending/overdue recipients'
      }`
    );
  };

  const handleCustomAlertFromBar = async (alertData, recipientIds = []) => {
    try {
      const title = alertData && typeof alertData === 'object' && alertData.title ? alertData.title : 'Broadcast Announcement';
      const message = alertData && typeof alertData === 'object' && alertData.message ? alertData.message : String(alertData || '');

      await notificationsService.sendBroadcast({
        title,
        message,
        recipient_ids: recipientIds,
      });

      triggerToast(`Broadcast alert dispatched to ${recipientIds.length} recipient${recipientIds.length === 1 ? '' : 's'}`);
    } catch (err) {
      console.error('Failed to send broadcast alert:', err);
      triggerToast(err.message || 'Failed to dispatch broadcast alert');
    }
  };

  const handleActionFromException = (actionName) => {
    triggerToast(`Action initiated: ${actionName}`);
  };

  const handleSelectProject = (projectId, projectName) => {
    setActiveProjectId(projectId);
    setActiveProjectName(projectName || null);
    setActiveProjectTab('overview');
    setCurrentView('projects');
    const sp = new URLSearchParams(window.location.search);
    sp.set('projectId', projectId);
    sp.set('tab', 'overview');
    navigate(`/manager/projects?${sp.toString()}`, { replace: false });
    triggerToast(projectName ? `Loaded Project: ${projectName}` : 'Loaded Project Workspace');
  };

  const handleProjectTabChange = (tabId) => {
    setActiveProjectTab(tabId);
    if (activeProjectId) {
      const sp = new URLSearchParams(window.location.search);
      sp.set('projectId', activeProjectId);
      sp.set('tab', tabId);
      navigate(`/manager/projects?${sp.toString()}`, { replace: true });
    }
  };

  const handleExitProject = () => {
    setActiveProjectId(null);
    setActiveProjectName(null);
    setCurrentView('projects');
    const sp = new URLSearchParams(window.location.search);
    sp.delete('projectId');
    sp.delete('project');
    sp.delete('tab');
    const qs = sp.toString();
    navigate(qs ? `/manager/projects?${qs}` : '/manager/projects', { replace: false });
  };

  const handleTogglePerspective = () => {
    if (currentRole === 'manager') {
      setCurrentRole('intern');
      triggerToast('Switched perspective to Intern Portal');
    } else {
      setCurrentRole('manager');
      triggerToast('Returned to Manager Console');
    }
  };

  const getViewTitle = () => {
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

  const getBreadcrumbs = () => {
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

  return (
    <div className="h-screen flex overflow-hidden bg-[#F7F8FC] font-sans antialiased text-slate-800 selection:bg-purple-200">
      {/* Sidebar navigation */}
      <Sidebar
        currentView={currentView}
        setCurrentView={(view) => handleNavigate(view)}
        activeProjectId={activeProjectId}
        onExitProject={handleExitProject}
        activeProjectTab={activeProjectTab}
        onSelectProjectTab={(tabId) => setActiveProjectTab(tabId)}
        internCount={0}
        currentRole={currentRole}
        onTogglePerspective={handleTogglePerspective}
        onLogout={logout}
        user={authUser}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-[#F7F8FC]">
        {/* Header */}
        <Header
          breadcrumbs={getBreadcrumbs()}
          title={getViewTitle()}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenAlertModal={() => setIsAlertModalOpen(true)}
          unreadAlertCount={0}
          onBackClick={currentView === 'projects' && activeProjectId ? handleExitProject : null}
          cohorts={cohorts}
          selectedCohortId={selectedCohortId}
          onSelectCohort={handleSelectCohort}
          onBreadcrumbClick={(crumb) => {
            if (crumb === 'Projects') {
              handleExitProject();
            } else if (crumb === 'Console') {
              handleNavigate('dashboard');
            }
          }}
        />

        {/* Page Content Container */}
        <main
          className={`flex-1 min-h-0 min-w-0 ${
            currentView === 'channels'
              ? 'p-3 sm:p-4 md:p-5 flex flex-col overflow-hidden h-full'
              : (currentView === 'projects' && activeProjectId)
              ? 'px-4 sm:px-6 pb-4 sm:pb-6 pt-0 overflow-y-auto overflow-x-hidden'
              : 'p-4 sm:p-6 pb-12 sm:pb-16 overflow-y-auto overflow-x-hidden bg-[#F7F8FC]'
          }`}
        >
          <React.Suspense fallback={<ViewLoadingFallback />}>
          {currentRole === 'intern' ? (
            <InternPortalView onSwitchToManager={() => setCurrentRole('manager')} />
          ) : (currentView === 'projects' && activeProjectId) ? (
            <ProjectWorkspaceView
              projectId={activeProjectId}
              onBackToDirectory={handleExitProject}
              activeTab={activeProjectTab}
              onTabChange={handleProjectTabChange}
              onOpenSearch={() => setIsSearchOpen(true)}
              onActionTrigger={(action) => triggerToast(`Action opened: ${action}`)}
              onToast={triggerToast}
              onProjectLoaded={(proj) => {
                if (proj?.name) setActiveProjectName(proj.name);
              }}
            />
          ) : (
            <>
              {currentView === 'dashboard' && (
                <ManagerDashboardView
                  onNavigate={(v) => handleNavigate(v)}
                  onSelectProject={handleSelectProject}
                  onOpenAlertModal={() => setIsAlertModalOpen(true)}
                  onOpenExceptionModal={(excId) => setSelectedException(excId)}
                  onSendAlertMessage={handleCustomAlertFromBar}
                  channelForms={channelForms}
                  onPostForm={handlePostChannelForm}
                  onSubmitResponse={handleSubmitChannelFormResponse}
                  onToast={triggerToast}
                  selectedCohort={cohorts.find((c) => c.id === selectedCohortId) || cohorts[0]}
                />
              )}
              {currentView === 'projects' && (
                <ProjectsDirectoryView onSelectProject={handleSelectProject} />
              )}
              {currentView === 'interns' && (
                <InternsView
                  cohorts={cohorts}
                  selectedCohortId={selectedCohortId}
                  onPingIntern={(intern) =>
                    triggerToast(`Message prompt opened for ${intern.name}`)
                  }
                />
              )}
              {currentView === 'tech-leads' && (
                <TechLeadsView
                  onRebalanceLead={(lead) =>
                    triggerToast(`Opened review rebalance for ${lead.name}`)
                  }
                  onSelectProject={handleSelectProject}
                />
              )}
              {currentView === 'my-tasks' && <ManagerMyTasksView onToast={triggerToast} />}
              {currentView === 'reports' && (
                <ReportsView
                  onToast={triggerToast}
                  selectedCohort={cohorts.find((c) => c.id === selectedCohortId) || cohorts[0]}
                  selectedCohortId={selectedCohortId}
                />
              )}
              {(currentView === 'timesheets' || currentView === 'timesheet') && (
                <ManagerTimesheetsView
                  onToast={triggerToast}
                  cohorts={cohorts}
                  selectedCohortId={selectedCohortId}
                  onSelectCohort={handleSelectCohort}
                />
              )}
              {currentView === 'channels' && (
                <TeamsChannelView
                  forms={channelForms}
                  onPostForm={handlePostChannelForm}
                  onSubmitResponse={handleSubmitChannelFormResponse}
                  onToast={triggerToast}
                  selectedCohort={cohorts.find((c) => c.id === selectedCohortId) || cohorts[0]}
                  selectedCohortId={selectedCohortId}
                  cohorts={cohorts}
                />
              )}
              {currentView === 'profile' && (
                <ManagerProfileView
                  onSelectProject={handleSelectProject}
                  onToast={triggerToast}
                />
              )}
            </>
          )}
          </React.Suspense>
        </main>
      </div>

      {/* Modals */}
      <React.Suspense fallback={null}>
      <AlertModal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        onSent={handleAlertSent}
      />

      <QuickSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectResult={(type, item) => {
          if (type === 'interns') {
            handleNavigate('interns');
          } else if (type === 'projects') {
            handleSelectProject(item.id);
          } else if (type === 'tasks') {
            handleNavigate('tasks');
          }
          triggerToast(`Navigated to ${item.name || item.title}`);
        }}
      />

      <ExceptionDetailModal
        exceptionId={selectedException}
        onClose={() => setSelectedException(null)}
        onActionTaken={handleActionFromException}
      />
      </React.Suspense>

      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-3.5 py-2.5 rounded-md bg-slate-900 text-white text-xs font-medium shadow-md animate-in slide-in-from-bottom-2 duration-150 border border-slate-700">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
