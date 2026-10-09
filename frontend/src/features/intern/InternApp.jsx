import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FolderKanban, 
  CheckSquare, 
  FileText, 
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
  Menu
} from 'lucide-react';

import InternDashboardTab from './components/InternDashboardTab';
import MyProjectsTab from './components/MyProjectsTab';
import ScopedProjectView from './components/ScopedProjectView';
import MyTasksTab from './components/MyTasksTab';
import AssignedFormsTab from './components/AssignedFormsTab';
import InternAttendanceTab from './components/InternAttendanceTab';
import InternProfileTab from './components/InternProfileTab';
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
    if (['alerts', 'projects', 'forms', 'attendance', 'profile'].includes(clean)) {
      return clean;
    }
    return 'dashboard';
  };

  const [currentTab, setCurrentTab] = useState(() => getTabFromPath(location.pathname));
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [workItems, setWorkItems] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [forms, setForms] = useState(formsService.getAssignedForms());
  const [notifications, setNotifications] = useState(notificationsService.getAllNotifications());
  const [notificationPopup, setNotificationPopup] = useState(false);

  useEffect(() => {
    const tabFromUrl = getTabFromPath(location.pathname);
    if (tabFromUrl !== currentTab) {
      setCurrentTab(tabFromUrl);
    }
  }, [location.pathname]);

  const handleTabChange = (tabId) => {
    setSelectedProjectId(null);
    setCurrentTab(tabId);
    setMobileMenuOpen(false);
    if (tabId === 'dashboard') {
      navigate('/intern/dashboard');
    } else {
      navigate(`/intern/${tabId}`);
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

  const loadWorkItems = async () => {
    try {
      setLoadingTasks(true);
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
      notificationsService.loadNotifications();
    }, 5000);

    return () => {
      unsubForms();
      unsubNotifs();
      window.clearInterval(notificationRefreshInterval);
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

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'alerts', label: 'Alerts & Notices', icon: Bell, badge: unreadCount, badgeColor: 'bg-rose-500' },
    { id: 'projects', label: 'My Projects', icon: FolderKanban },
    { id: 'tasks', label: 'My Tasks', icon: CheckSquare, badge: workItems.filter(w => w.status !== 'COMPLETED').length },
    { id: 'forms', label: 'Forms', icon: FileText, badge: pendingFormsCount, badgeColor: 'bg-amber-500' },
    { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
    { id: 'profile', label: 'Profile', icon: User },
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
      case 'forms':
        return 'Assigned Evaluations & Forms';
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
      <aside className="w-60 h-screen bg-[#4C1D95] text-slate-200 flex flex-col shrink-0 select-none sticky top-0 overflow-hidden border-r border-purple-900/40">
        <div className="flex flex-col flex-1 min-h-0">
          {/* Brand Header */}
          <div className="h-14 flex items-center justify-between px-4 border-b border-purple-800/60 bg-purple-950/30">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-white font-bold text-xs tracking-wider">
                IH
              </div>
              <div className="flex flex-col leading-tight">
                <span className="font-bold text-sm tracking-tight text-white">
                  INTERN HUB
                </span>
                <span className="text-[10px] font-mono tracking-wider text-purple-300/70">
                  Intern Workstation
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Items */}
          <div className="flex-1 min-h-0 px-2.5 py-4 space-y-4 overflow-y-auto">
            <div>
              <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-purple-300/50 mb-1.5">
                My Workspace
              </div>
              <nav className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabChange(item.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-purple-900/80 text-white font-bold shadow-2xs'
                          : 'text-purple-200/80 hover:bg-purple-800/40 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5 opacity-80" />
                        <span>{item.label}</span>
                      </div>

                      {item.badge > 0 && (
                        <span
                          className={`px-1.5 py-0.2 text-[10px] font-bold rounded-full text-white ${
                            item.badgeColor || 'bg-purple-950/80 border border-purple-700/50'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>

        {/* Intern User Footer */}
        <div className="shrink-0 p-3 border-t border-purple-800/60 bg-purple-950/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img
                src={userAvatar}
                alt={displayName}
                className="w-7 h-7 rounded-md object-cover border border-purple-400/40"
              />
              <div className="flex flex-col leading-tight">
                <span className="text-xs font-semibold text-white">
                  {displayName}
                </span>
                <span className="text-[10px] text-purple-300/70">
                  {displayRole}
                </span>
              </div>
            </div>

            <button
              onClick={onLogout}
              title="Sign Out / Switch Login"
              className="p-1 rounded text-purple-300 hover:text-white hover:bg-purple-800/40 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
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
        <main className="flex-1 min-h-0 p-4 sm:p-6 overflow-y-auto">
          <div className={currentTab === 'dashboard' ? 'w-full space-y-6' : 'max-w-6xl mx-auto space-y-6'}>
            {/* Render Tab View */}
            {currentTab === 'dashboard' && (
              <InternDashboardTab
                workItems={workItems}
                forms={forms}
                onOpenTaskModal={(t) => setSelectedTask(t)}
                onOpenFormModal={(f) => setSelectedForm(f)}
                onNavigateTab={(tabId) => handleTabChange(tabId)}
                onSelectProject={(projectId) => {
                  setSelectedProjectId(projectId);
                  handleTabChange('projects');
                }}
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
                <ScopedProjectView
                  project={projectsService.getProjectById(selectedProjectId)}
                  onBack={() => setSelectedProjectId(null)}
                  onTaskClick={(t) => setSelectedTask(t)}
                  onToast={onToast}
                />
              ) : (
                <MyProjectsTab
                  onSelectProject={(projectId) => setSelectedProjectId(projectId)}
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

            {currentTab === 'forms' && (
              <AssignedFormsTab
                forms={forms}
                onOpenFormModal={(f) => setSelectedForm(f)}
              />
            )}

            {currentTab === 'attendance' && (
              <InternAttendanceTab onToast={onToast} />
            )}

            {currentTab === 'profile' && (
              <InternProfileTab onToast={onToast} />
            )}
          </div>
        </main>
      </div>

      {/* Modals & Drawers */}
      <WorkItemDetailModal
        workItem={selectedTask}
        isOpen={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
        onTaskUpdated={loadWorkItems}
        onTaskDeleted={() => {
          setSelectedTask(null);
          loadWorkItems();
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
