import React from 'react';
import { 
  LayoutDashboard, 
  FolderKanban, 
  CheckSquare,
  Users, 
  ShieldCheck, 
  BarChart3, 
  LogOut, 
  Hash,
  Clock,
  User
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
  const currentUser = user || authUser;
  const userName = currentUser?.name || 'Postman Manager Profile';
  const userRole = (currentUser?.role || 'MANAGER').toUpperCase();

  const getInitials = (name) => {
    if (!name) return 'PP';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

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
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      isActive || isProjectParentActive
                        ? 'bg-white/10 text-white font-bold shadow-2xs'
                        : 'text-purple-200/80 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive || isProjectParentActive ? 'text-white' : 'text-purple-300/80'}`} />
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
                onClick={() => {
                  setCurrentView('channels');
                  if (isProjectWorkspace) onExitProject?.();
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  !isProjectWorkspace && currentView === 'channels'
                    ? 'bg-white/10 text-white font-bold shadow-2xs'
                    : 'text-purple-200/80 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Hash className={`w-4 h-4 shrink-0 ${!isProjectWorkspace && currentView === 'channels' ? 'text-white' : 'text-purple-300/80'}`} />
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
                onClick={() => {
                  setCurrentView('profile');
                  if (isProjectWorkspace) onExitProject?.();
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  !isProjectWorkspace && currentView === 'profile'
                    ? 'bg-white/10 text-white font-bold shadow-2xs'
                    : 'text-purple-200/80 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <User className={`w-4 h-4 shrink-0 ${!isProjectWorkspace && currentView === 'profile' ? 'text-white' : 'text-purple-300/80'}`} />
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
            onClick={() => {
              setCurrentView('profile');
              if (isProjectWorkspace) onExitProject?.();
            }}
            className="flex items-center gap-2.5 flex-1 min-w-0 text-left rounded-lg transition-colors group cursor-pointer"
            title="View Profile (/manager/profile)"
          >
            <div className="w-9 h-9 rounded-xl bg-purple-600 border border-purple-400/30 flex items-center justify-center text-white font-bold text-xs tracking-wider shrink-0 shadow-2xs">
              {getInitials(userName)}
            </div>
            <div className="flex flex-col leading-tight min-w-0 flex-1">
              <span className="text-xs font-bold text-white truncate block">
                {userName}
              </span>
              <span className="text-[10px] font-semibold text-purple-300/70 tracking-wider uppercase block mt-0.5">
                {userRole}
              </span>
            </div>
          </button>

          <button 
            type="button"
            onClick={onLogout}
            title="Log out"
            className="p-1.5 rounded-lg text-purple-300/80 hover:text-white hover:bg-white/5 transition-colors shrink-0 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
