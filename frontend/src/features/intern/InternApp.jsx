import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FolderKanban, 
  CheckSquare, 
  Hash, 
  CalendarCheck, 
  User, 
  LogOut, 
  Bell, 
  Search, 
  ArrowLeft,
  X,
  ChevronRight,
  ShieldAlert,
  ArrowRightLeft,
  Menu,
  BarChart3,
  Clock
} from 'lucide-react';

import InternDashboardTab from './components/InternDashboardTab';
import MyProjectsTab from './components/MyProjectsTab';
import ScopedProjectView from './components/ScopedProjectView';
import ProjectsDirectoryView from '../../components/views/projects/ProjectsDirectoryView';
import ProjectWorkspaceView from '../../components/views/projects/ProjectWorkspaceView';
import ProjectTaskCharts from '../../components/views/projects/ProjectTaskCharts';
import MyTasksTab from './components/MyTasksTab';
import AssignedFormsTab from './components/AssignedFormsTab';
import InternAttendanceTab from './components/InternAttendanceTab';
import InternProfileTab from './components/InternProfileTab';
import TimesheetView from '../../components/views/TimesheetView';
import DynamicFormModal from './components/DynamicFormModal';
import WorkItemDetailModal from './components/WorkItemDetailModal';
import CreatePersonalTaskModal from './components/CreatePersonalTaskModal';
import NotificationsDrawer from './components/NotificationsDrawer';
import AlertsTab from './components/AlertsTab';
import { useAuth } from '../../context/AuthContext';

import { userService } from './services/userService';
import { projectsService } from './services/projectsService';
import { workItemsService } from './services/workItemsService';
import { formsService } from './services/formsService';
import { notificationsService } from './services/notificationsService';

export default function InternApp({ onLogout, onSelectProject, onToast }) {
  const { user: authUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const getTabFromPath = (pathname) => {
    const clean = pathname.replace(/^\/intern\/?/, '');
    if (!clean || clean === 'dashboard') return 'dashboard';
    if (clean === 'tasks' || clean === 'my-tasks') return 'tasks';
    if (['alerts', 'projects', 'tasks', 'timesheet', 'analytics', 'forms', 'attendance', 'profile'].includes(clean)) {
      return clean;
    }
    return 'dashboard';
  };

  const getInitialProjectId = () => {
    try {
      const sp = new URLSearchParams(window.location.search);
      return sp.get('projectId') || sp.get('project') || null;
    } catch {
      return null;
    }
  };

  const initialProjId = getInitialProjectId();
  const [currentTab, setCurrentTab] = useState(() => {
    if (initialProjId) return 'projects';
    return getTabFromPath(location.pathname);
  });
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjId);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [workItems, setWorkItems] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [forms, setForms] = useState(formsService.getAssignedForms());
  const [notifications, setNotifications] = useState(notificationsService.getAllNotifications());
  const [notificationPopup, setNotificationPopup] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const pId = sp.get('projectId') || sp.get('project') || null;
    if (pId !== selectedProjectId) {
      setSelectedProjectId(pId);
      if (pId) setCurrentTab('projects');
    }
    const tabFromUrl = getTabFromPath(location.pathname);
    if (tabFromUrl !== currentTab && !pId) {
      setCurrentTab(tabFromUrl);
    }
  }, [location.pathname, location.search, selectedProjectId, currentTab]);

  const handleTabChange = (tabId) => {
    setSelectedProjectId(null);
    setCurrentTab(tabId);
    setMobileMenuOpen(false);
    const sp = new URLSearchParams(window.location.search);
    sp.delete('projectId');
    sp.delete('project');
    const qs = sp.toString();
    const dest = tabId === 'dashboard' ? '/intern/dashboard' : `/intern/${tabId}`;
    navigate(qs ? `${dest}?${qs}` : dest);
  };

  const handleSelectInternProject = (projectId) => {
    setSelectedProjectId(projectId);
    setCurrentTab('projects');
    const sp = new URLSearchParams(window.location.search);
    if (projectId) {
      sp.set('projectId', projectId);
      navigate(`/intern/projects?${sp.toString()}`, { replace: false });
    } else {
      sp.delete('projectId');
      sp.delete('project');
      const qs = sp.toString();
      navigate(qs ? `/intern/projects?${qs}` : '/intern/projects', { replace: false });
    }
  };

  // Modal states
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedForm, setSelectedForm] = useState(null);
  const [isCreatePersonalOpen, setIsCreatePersonalOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const currentUser = userService.getCurrentUser();
  const displayName = authUser?.name || currentUser.name || 'Intern';
  const displayRole = authUser?.role || 'Intern';
  const userAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=7C3AED&color=fff`;
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const pendingFormsCount = forms.filter((f) => f.submission_status === 'PENDING').length;

  const getInitials = (name) => {
    if (!name) return 'IN';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const loadWorkItems = async (silent = false) => {
    try {
      if (!silent) setLoadingTasks(true);
      const items = await workItemsService.listWorkItems({ assigned_to_me: true });
      setWorkItems(items || []);
    } catch (err) {
      console.error('Failed to load intern work items:', err);
    } finally {
      setLoadingTasks(false);
    }
  };

  useEffect(() => {
    loadWorkItems();
    const unsubForms = formsService.subscribe(setForms);
    let knownNotificationIds = new Set(
      notificationsService.getAllNotifications().map((notification) => notification.id)
    );
    let hasLoadedNotifications = false;
    const unsubNotifs = notificationsService.subscribe((nextNotifications) => {
      setNotifications(nextNotifications);

      if (hasLoadedNotifications) {
        const receivedManagerAlert = nextNotifications.some(
          (notification) =>
            !knownNotificationIds.has(notification.id) &&
            notification.type === 'BROADCAST' &&
            !notification.is_read
        );
        if (receivedManagerAlert) setNotificationPopup(true);
      }

      knownNotificationIds = new Set(nextNotifications.map((notification) => notification.id));
    });
    notificationsService.loadNotifications().then((loadedNotifications) => {
      knownNotificationIds = new Set(loadedNotifications.map((notification) => notification.id));
      hasLoadedNotifications = true;
    });
    const notificationRefreshInterval = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      notificationsService.loadNotifications();
    }, 20000);

    const handleWorkItemsSync = (e) => {
      const detail = e?.detail;
      if (detail?.action === 'update' && detail?.item?.id) {
        const item = detail.item;
        const currentUserId = authUser?.id || currentUser?.id;
        const isAssigned =
          (item.assignee_ids || []).includes(currentUserId) ||
          (item.assignees || []).some((a) => a.id === currentUserId);

        setWorkItems((prev) => {
          const exists = prev.some((w) => w.id === item.id);
          if (isAssigned) {
            return exists ? prev.map((w) => (w.id === item.id ? { ...w, ...item } : w)) : [item, ...prev];
          } else {
            return prev.filter((w) => w.id !== item.id);
          }
        });
        setSelectedTask((prev) => (prev && prev.id === item.id ? { ...prev, ...item } : prev));
        return;
      }
      if (detail?.action === 'delete' && detail?.id) {
        setWorkItems((prev) => prev.filter((w) => w.id !== detail.id));
        setSelectedTask((prev) => (prev && prev.id === detail.id ? null : prev));
        return;
      }
      loadWorkItems(true);
    };
    window.addEventListener('work-items-updated', handleWorkItemsSync);

    return () => {
      unsubForms();
      unsubNotifs();
      window.clearInterval(notificationRefreshInterval);
      window.removeEventListener('work-items-updated', handleWorkItemsSync);
    };
  }, []);

  useEffect(() => {
    if (!notificationPopup || currentTab !== 'dashboard') return undefined;
    const timeoutId = window.setTimeout(() => setNotificationPopup(false), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [notificationPopup, currentTab]);

  const handleToggleTask = async (taskId) => {
    const item = workItems.find((w) => w.id === taskId);
    if (!item) return;
    try {
      const updated = await workItemsService.toggleComplete(item);
      setWorkItems((prev) => prev.map((w) => (w.id === taskId ? updated : w)));
      onToast?.(
        updated.status === 'COMPLETED'
          ? `Marked "${updated.title}" completed!`
          : `Reopened "${updated.title}"`
      );
    } catch (err) {
      onToast?.(err.message || 'Failed to update task status');
    }
  };

  const isTechLead = 
    authUser?.role === 'TECH_LEAD' || 
    Boolean(authUser?.is_tech_lead) || 
    (Array.isArray(authUser?.lead_project_ids) && authUser.lead_project_ids.length > 0);

  const incompleteTasksCount = workItems.filter(w => w.status !== 'COMPLETED').length;

  const coreNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'projects', label: 'Projects', icon: FolderKanban },
    { id: 'tasks', label: 'My Tasks', icon: CheckSquare, badge: incompleteTasksCount > 0 ? incompleteTasksCount : null },
    { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
  ];

  const analyticsNavItems = [
    { id: 'timesheet', label: 'Timesheets', icon: Clock },
    { id: 'alerts', label: 'Alerts & Notices', icon: Bell, badge: unreadCount > 0 ? unreadCount : null, badgeColor: 'bg-rose-500' },
    { id: 'analytics', label: 'Reports', icon: BarChart3 },
  ];

  const getBreadcrumbTitle = () => {
    switch (currentTab) {
      case 'dashboard':
        return 'Intern Workstation';
      case 'alerts':
        return 'Organization Alerts & Notices';
      case 'projects':
        if (selectedProjectId) {
          const p = projectsService.getProjectById(selectedProjectId);
          return `My Assigned Projects / ${p?.name || 'Workspace'}`;
        }
        return 'My Assigned Projects';
      case 'tasks':
        return 'Task & Subtask Board';
      case 'timesheet':
        return 'Weekly Timesheet & Worklogs';
      case 'analytics':
        return 'Task Analytics & Work Distribution';
      case 'forms':
        return 'Teams Channel';
      case 'attendance':
        return 'Attendance & Session History';
      case 'profile':
        return 'Intern Profile & Privileges';
      default:
        return 'Intern Portal';
    }
  };

  return (
    <div className="h-screen flex overflow-hidden bg-[#F7F8FC] font-sans antialiased text-slate-800 selection:bg-purple-200">
      {/* 1. DEDICATED INTERN SIDEBAR */}
      <aside className="w-60 sm:w-64 h-screen bg-[#4C1D95] text-slate-200 flex flex-col shrink-0 select-none sticky top-0 overflow-hidden border-r border-purple-900/40">
        <div className="flex flex-col flex-1 min-h-0">
          {/* Brand Header */}
          <div className="h-16 flex items-center px-4 border-b border-purple-800/60 bg-purple-950/20 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-white font-bold text-sm tracking-wider shadow-inner shrink-0">
                IH
              </div>
              <div className="flex flex-col leading-tight min-w-0">
                <span className="font-extrabold text-sm tracking-wider text-white truncate">
                  INTERN HUB
                </span>
                <span className="text-[10px] font-mono tracking-wider text-purple-300/80 mt-0.5 truncate">
                  Workspace v1.0
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Groups (Scrollable) */}
          <div className="flex-1 min-h-0 px-3 py-3 space-y-1 overflow-y-auto">
            {/* CORE */}
            <div>
              <div className="px-3 text-[11px] font-bold uppercase tracking-wider text-purple-300/60 mb-2 mt-2">
                Core
              </div>
              <nav className="space-y-1">
                {coreNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabChange(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-white/10 text-white font-bold shadow-2xs'
                          : 'text-purple-200/80 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-purple-300/80'}`} />
                        <span>{item.label}</span>
                      </div>

                      {item.badge && (
                        <span className="px-1.5 py-0.2 text-[10px] font-mono rounded bg-purple-950/60 text-purple-300 border border-purple-700/40">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* ANALYTICS */}
            <div>
              <div className="px-3 text-[11px] font-bold uppercase tracking-wider text-purple-300/60 mb-2 mt-5">
                Analytics
              </div>
              <nav className="space-y-1">
                {analyticsNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabChange(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-white/10 text-white font-bold shadow-2xs'
                          : 'text-purple-200/80 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-purple-300/80'}`} />
                        <span>{item.label}</span>
                      </div>

                      {item.badge && (
                        <span className={`px-1.5 py-0.2 text-[10px] font-mono rounded ${item.badgeColor ? 'bg-rose-500 text-white' : 'bg-purple-950/60 text-purple-300 border border-purple-700/40'}`}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* CHANNELS */}
            <div>
              <div className="px-3 text-[11px] font-bold uppercase tracking-wider text-purple-300/60 mb-2 mt-5">
                Channels
              </div>
              <nav className="space-y-1">
                <button
                  onClick={() => handleTabChange('forms')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    currentTab === 'forms'
                      ? 'bg-white/10 text-white font-bold shadow-2xs'
                      : 'text-purple-200/80 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Hash className={`w-4 h-4 shrink-0 ${currentTab === 'forms' ? 'text-white' : 'text-purple-300/80'}`} />
                    <span>Teams Channel</span>
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-[#064e3b] text-[#34d399] border border-[#047857]/40 tracking-wide font-mono">
                    Forms
                  </span>
                </button>
              </nav>
            </div>

            {/* Divider between Channels and Profile */}
            <div className="my-4 border-t border-purple-800/60 mx-1" />

            {/* PROFILE */}
            <div>
              <div className="px-3 text-[11px] font-bold uppercase tracking-wider text-purple-300/60 mb-2">
                Profile
              </div>
              <nav className="space-y-1">
                <button
                  onClick={() => handleTabChange('profile')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    currentTab === 'profile'
                      ? 'bg-white/10 text-white font-bold shadow-2xs'
                      : 'text-purple-200/80 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <User className={`w-4 h-4 shrink-0 ${currentTab === 'profile' ? 'text-white' : 'text-purple-300/80'}`} />
                    <span>Profile</span>
                  </div>
                </button>
              </nav>
            </div>
          </div>
        </div>

        {/* Bottom Account Area */}
        <div className="shrink-0 p-3 bg-purple-950/40 border-t border-purple-800/60">
          <div className="flex items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={() => handleTabChange('profile')}
              className="flex items-center gap-2.5 flex-1 min-w-0 text-left rounded-lg transition-colors group cursor-pointer"
              title="View Profile (/intern/profile)"
            >
              <div className="w-9 h-9 rounded-xl bg-purple-600 border border-purple-400/30 flex items-center justify-center text-white font-bold text-xs tracking-wider shrink-0 shadow-2xs">
                {getInitials(displayName)}
              </div>
              <div className="flex flex-col leading-tight min-w-0 flex-1">
                <span className="text-xs font-bold text-white truncate block">
                  {displayName}
                </span>
                <span className="text-[10px] font-semibold text-purple-300/70 tracking-wider uppercase block mt-0.5">
                  {displayRole.toUpperCase()}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={onLogout}
              title="Sign Out / Switch Login"
              className="p-1.5 rounded-lg text-purple-300/80 hover:text-white hover:bg-white/5 transition-colors shrink-0 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* 2. MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Header */}
        <header className="h-14 bg-white px-6 flex items-center justify-between border-b border-slate-200 select-none">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
            <span>Intern Portal</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-900 font-bold">{getBreadcrumbTitle()}</span>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-3">
            {/* Notifications Trigger */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotificationPopup(false);
                  setIsNotificationsOpen(true);
                }}
                className="relative p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 absolute top-1.5 right-1.5" />
                )}
              </button>
              {notificationPopup && currentTab === 'dashboard' && (
                <div
                  role="status"
                  aria-live="polite"
                  className="absolute bottom-full right-0 z-40 mb-2 flex w-56 max-w-[80vw] items-center gap-2 rounded-full border border-purple-200 bg-white px-3 py-2 text-left shadow-lg animate-in fade-in zoom-in-95 slide-in-from-bottom-1 duration-200"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-100">
                    <Bell className="h-3.5 w-3.5 text-purple-700" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-slate-900">New manager alert</span>
                    <span className="block text-[10px] font-medium text-slate-500">Tap the bell to view</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setNotificationPopup(false)}
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Dismiss notification popup"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Date Display */}
            <div className="pl-3 border-l border-slate-200 text-xs font-medium text-slate-500">
              {new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className={`flex-1 min-h-0 min-w-0 ${
          currentTab === 'forms'
            ? 'p-3 sm:p-4 md:p-5 flex flex-col overflow-hidden h-full'
            : selectedProjectId && currentTab === 'projects'
            ? 'px-4 sm:px-6 pb-4 sm:pb-6 pt-0 overflow-y-auto'
            : 'p-4 sm:p-6 overflow-y-auto'
        }`}>
          <div className={
            currentTab === 'forms'
              ? 'w-full h-full min-h-0 min-w-0 flex flex-col'
              : currentTab === 'dashboard' || currentTab === 'projects' || currentTab === 'profile' || currentTab === 'analytics'
              ? 'w-full space-y-6 min-w-0'
              : 'max-w-6xl mx-auto space-y-6 min-w-0'
          }>
            {/* Render Tab View */}
            {currentTab === 'dashboard' && (
              <InternDashboardTab
                workItems={workItems}
                forms={forms}
                onOpenTaskModal={(t) => setSelectedTask(t)}
                onOpenFormModal={(f) => setSelectedForm(f)}
                onNavigateTab={(tabId) => handleTabChange(tabId)}
                onSelectProject={(projectId) => handleSelectInternProject(projectId)}
                onToggleTask={handleToggleTask}
              />
            )}
 
            {currentTab === 'alerts' && (
              <AlertsTab
                notifications={notifications}
                onToast={onToast}
              />
            )}

            {currentTab === 'projects' && (
              selectedProjectId ? (
                <ProjectWorkspaceView
                  projectId={selectedProjectId}
                  onBackToDirectory={() => handleSelectInternProject(null)}
                  readOnly={!isTechLead}
                  onToast={onToast}
                  isIntern={true}
                />
              ) : (
                <ProjectsDirectoryView
                  onSelectProject={(projectId) => handleSelectInternProject(projectId)}
                  isIntern={true}
                />
              )
            )}

            {currentTab === 'tasks' && (
              <MyTasksTab
                workItems={workItems}
                loading={loadingTasks}
                onReload={loadWorkItems}
                onOpenTaskModal={(t) => setSelectedTask(t)}
                onOpenCreatePersonalTask={() => setIsCreatePersonalOpen(true)}
                onToggleTask={handleToggleTask}
                onToast={onToast}
                showViewSwitcher={false}
              />
            )}

            {currentTab === 'timesheet' && (
              <TimesheetView onToast={onToast} />
            )}

            {currentTab === 'analytics' && (
              <ProjectTaskCharts />
            )}

            {currentTab === 'forms' && (
              <AssignedFormsTab
                forms={forms}
                onOpenFormModal={(f) => setSelectedForm(f)}
                onToast={onToast}
              />
            )}

            {currentTab === 'attendance' && (
              <InternAttendanceTab onToast={onToast} />
            )}

            {currentTab === 'profile' && (
              <InternProfileTab onToast={onToast} onSelectProject={handleSelectInternProject} />
            )}
          </div>
        </main>
      </div>

      {/* Modals & Drawers */}
      <WorkItemDetailModal
        workItem={selectedTask}
        isOpen={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
        onTaskUpdated={(updated) => {
          if (updated && updated.id) {
            setWorkItems((prev) => prev.map((w) => (w.id === updated.id ? { ...w, ...updated } : w)));
            setSelectedTask((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
          } else {
            loadWorkItems(true);
          }
        }}
        onTaskDeleted={(deletedId) => {
          setSelectedTask(null);
          if (deletedId) {
            setWorkItems((prev) => prev.filter((w) => w.id !== deletedId));
          } else {
            loadWorkItems(true);
          }
        }}
        onToast={onToast}
      />

      <DynamicFormModal
        form={selectedForm}
        isOpen={Boolean(selectedForm)}
        onClose={() => setSelectedForm(null)}
        onSubmitSuccess={async () => setForms(await formsService.getForms())}
        onToast={onToast}
      />

      <CreatePersonalTaskModal
        isOpen={isCreatePersonalOpen}
        onClose={() => setIsCreatePersonalOpen(false)}
        onTaskCreated={() => loadWorkItems()}
        onToast={onToast}
      />

      <NotificationsDrawer
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        onOpenTarget={(notif) => {
          setIsNotificationsOpen(false);
          if (notif.target_type === 'task') {
            const item = workItemsService.getWorkItemById(notif.target_id);
            if (item) setSelectedTask(item);
          } else if (notif.target_type === 'form') {
            const form = formsService.getFormById(notif.target_id);
            if (form) setSelectedForm(form);
          }
        }}
        onToast={onToast}
      />
    </div>
  );
}
