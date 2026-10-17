import { 
  LayoutDashboard, 
  FolderKanban, 
  CheckSquare,
  Users, 
  ShieldCheck, 
  BarChart3, 
  LogOut, 
  Hash,
  Clock
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function Sidebar({ 
  currentView, 
  setCurrentView, 
  activeProjectId, 
  onExitProject, 
  internCount = 0, 
  currentRole, 
  onTogglePerspective, 
  onLogout,
  user
}) {
  const { user: authUser } = useAuth();
  const userName = user?.name || authUser?.name || 'Program Manager';
  const userRole = user?.role || authUser?.role || 'Program Manager';
  const userAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=7C3AED&color=fff`;

  const isProjectWorkspace = Boolean(activeProjectId);

  const coreItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'projects', label: 'Projects', icon: FolderKanban },
    { id: 'my-tasks', label: 'My Tasks', icon: CheckSquare },
    { id: 'interns', label: 'Interns', icon: Users, badge: internCount > 0 ? internCount : null },
    { id: 'tech-leads', label: 'Tech Leads', icon: ShieldCheck },
  ];

  const analyticsItems = [
    { id: 'timesheets', label: 'Timesheets', icon: Clock },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
  ];

  return (
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
                Workspace v1.0
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Groups */}
        <div className="flex-1 min-h-0 px-2.5 py-3.5 space-y-4 overflow-y-auto">
          {/* CORE */}
          <div>
            <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-purple-300/50 mb-1">
              Core
            </div>
            <nav className="space-y-0.5">
              {coreItems.map((item) => {
                const Icon = item.icon;
                const isActive = !isProjectWorkspace && currentView === item.id;
                const isProjectParentActive = isProjectWorkspace && item.id === 'projects';
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.id === 'projects' && isProjectWorkspace) {
                        onExitProject?.();
                      } else {
                        setCurrentView(item.id);
                        if (isProjectWorkspace) onExitProject?.();
                      }
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      isActive || isProjectParentActive
                        ? 'bg-purple-900/80 text-white font-semibold shadow-2xs'
                        : 'text-purple-200/80 hover:bg-purple-800/40 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5 shrink-0 opacity-80" />
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
            <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-purple-300/50 mb-1">
              Analytics
            </div>
            <nav className="space-y-0.5">
              {analyticsItems.map((item) => {
                const Icon = item.icon;
                const isActive = !isProjectWorkspace && currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentView(item.id);
                      if (isProjectWorkspace) onExitProject?.();
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-purple-900/80 text-white font-semibold shadow-2xs'
                        : 'text-purple-200/80 hover:bg-purple-800/40 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5 shrink-0 opacity-80" />
                      <span>{item.label}</span>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* CHANNELS */}
          <div>
            <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-purple-300/50 mb-1">
              Channels
            </div>
            <nav className="space-y-0.5">
              <button
                onClick={() => {
                  setCurrentView('channels');
                  if (isProjectWorkspace) onExitProject?.();
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  !isProjectWorkspace && currentView === 'channels'
                    ? 'bg-purple-900/80 text-white font-semibold shadow-2xs'
                    : 'text-purple-200/80 hover:bg-purple-800/40 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Hash className="w-3.5 h-3.5 shrink-0 opacity-80" />
                  <span>Teams Channel</span>
                </div>
                <span className="px-1.5 py-0.2 text-[10px] font-mono rounded bg-emerald-950/60 text-emerald-300 border border-emerald-700/40">
                  Forms
                </span>
              </button>
            </nav>
          </div>

        </div>
      </div>

      {/* User Footer */}
      <div className="shrink-0 p-3 border-t border-purple-800/60 bg-purple-950/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src={userAvatar}
              alt={userName}
              className="w-7 h-7 rounded-md object-cover border border-purple-400/40"
            />
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-semibold text-white">{userName}</span>
              <span className="text-[10px] text-purple-300/70">{userRole}</span>
            </div>
          </div>
          <button 
            onClick={onLogout}
            title="Log out"
            className="p-1 rounded text-purple-300 hover:text-white hover:bg-purple-800/40 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
