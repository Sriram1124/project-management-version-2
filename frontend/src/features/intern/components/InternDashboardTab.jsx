import React, { useState, useEffect } from 'react';
import { 
  ArrowRight, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  TrendingUp,
  FolderKanban,
  Calendar,
  User,
  ChevronRight,
  BarChart3,
  LineChart,
  Loader2
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { userService } from '../services/userService';
import { projectsService } from '../services/projectsService';
import { workItemsService } from '../services/workItemsService';

export default function InternDashboardTab({
  workItems = [],
  forms = [],
  onOpenTaskModal,
  onOpenFormModal,
  onNavigateTab,
  onSelectProject,
  onToggleTask
}) {
  const { user: authUser } = useAuth();
  const currentUser = userService.getCurrentUser();
  const userName = authUser?.name || currentUser.name || 'Intern';

  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  useEffect(() => {
    projectsService.getMyProjects()
      .then((data) => setProjects(data || []))
      .catch((err) => console.error('Failed to load my projects for dashboard:', err))
      .finally(() => setLoadingProjects(false));
  }, []);

  // Dynamic greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const greeting = getGreeting();

  // Real data calculations
  const totalTasks = workItems.length;
  const completedTasks = workItems.filter((w) => w.status === 'COMPLETED').length;
  const inProgressTasks = workItems.filter((w) => w.status === 'IN_PROGRESS');
  const inReviewTasks = workItems.filter((w) => w.status === 'IN_REVIEW');
  const dueTodayTasks = workItems.filter((w) => workItemsService.isDueToday(w));
  const overdueTasks = workItems.filter((w) => workItemsService.isOverdue(w));

  // Quick Status Bar Counts (honest 0 if no tasks)
  const dueTodayCount = dueTodayTasks.length;
  const overdueCount = overdueTasks.length;
  const inReviewCount = inReviewTasks.length;
  const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Priority Work Items
  const priorityItems = workItems.filter((w) => 
    workItemsService.isOverdue(w) || 
    workItemsService.isDueToday(w) || 
    w.priority === 'HIGH' || 
    w.priority === 'URGENT'
  ).slice(0, 3);

  // Upcoming items
  const upcomingItems = workItems.filter((w) => w.status !== 'COMPLETED' && w.due_date).slice(0, 3);

  return (
    <div className="w-full space-y-6 pb-10">
      
      {/* 1. TOP HEADER SECTION */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {greeting}, {userName}! 👋
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">
            Here is your daily workstation overview and active assignments.
          </p>
        </div>

      </div>

      {/* 2. QUICK STATUS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Due Today',
            value: dueTodayCount,
            icon: Clock,
            iconClasses: 'bg-amber-50 text-amber-600 border-amber-100',
            valueClasses: 'text-slate-900'
          },
          {
            label: 'Overdue',
            value: overdueCount,
            icon: AlertCircle,
            iconClasses: 'bg-rose-50 text-rose-500 border-rose-100',
            valueClasses: 'text-rose-600'
          },
          {
            label: 'In Review',
            value: inReviewCount,
            icon: TrendingUp,
            iconClasses: 'bg-blue-50 text-blue-600 border-blue-100',
            valueClasses: 'text-slate-900'
          },
          {
            label: 'Completion',
            value: `${progressPercentage}%`,
            icon: CheckCircle2,
            iconClasses: 'bg-purple-50 text-purple-600 border-purple-100',
            valueClasses: 'text-purple-700'
          }
        ].map(({ label, value, icon: Icon, iconClasses, valueClasses }) => (
          <div
            key={label}
            className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-card flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {label}
              </span>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${iconClasses}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <div className={`mt-3 text-3xl font-extrabold tracking-tight ${valueClasses}`}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* 3. TWO-COLUMN SPLIT: PRIORITY WORK ITEMS (LEFT) & PROGRESS (RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Card: PRIORITY WORK ITEMS */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                PRIORITY WORK ITEMS
              </h3>
              <span className="text-xs font-bold text-purple-700 font-mono bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                {priorityItems.length} High Priority
              </span>
            </div>

            {/* List */}
            {priorityItems.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-xs">
                <CheckCircle2 className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-600">No high priority tasks assigned</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Task assignments will appear here once allocated in V2.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {priorityItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => onOpenTaskModal?.(item)}
                    className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-purple-50/30 hover:border-purple-200 transition-all cursor-pointer flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-purple-600" />
                      <span className="text-xs sm:text-sm font-semibold text-slate-800 truncate">
                        {item.title}
                      </span>
                    </div>

                    <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded border uppercase shrink-0 bg-purple-50 text-purple-700 border-purple-200">
                      {item.priority}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onNavigateTab?.('tasks')}
              className="text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1.5 cursor-pointer group"
            >
              <span>View all tasks</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>

        {/* Right Card: MY PROGRESS & COMPLETION GRAPH */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                MY PROGRESS & VELOCITY
              </h3>
              <span className="text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-0.5 rounded-full">
                Planned for V2
              </span>
            </div>

            <div className="p-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-xs">
              <BarChart3 className="w-8 h-8 text-purple-400 mx-auto mb-2" />
              <p className="font-semibold text-slate-700 text-sm">Sprint Velocity & Burndown</p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
                Task completion curves, sprint analytics, and individual velocity tracking will be available in the V2 Work Management module.
              </p>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 font-medium">
            Daily completed tasks and cumulative velocity across sprint cycles
          </div>
        </div>
      </div>

      {/* 4. MY PROJECTS SECTION */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              MY PROJECTS
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Projects you are assigned to as an active contributor</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab?.('projects')}
            className="text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1.5 cursor-pointer group"
          >
            <span>View all ({projects.length})</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {loadingProjects ? (
          <div className="flex items-center justify-center p-8 text-slate-400">
            <Loader2 className="w-5 h-5 text-purple-600 animate-spin mr-2" />
            <span className="text-xs font-medium">Loading your projects...</span>
          </div>
        ) : projects.length === 0 ? (
          <div className="p-8 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-center">
            <FolderKanban className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <h4 className="text-xs font-bold text-slate-700">No Assigned Projects</h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              You have not been assigned to any projects yet. When a manager adds you to a project, it will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {projects.map((p) => {
              const memberCount = p.members?.length || 0;
              const ownerName = p.lead?.name || 'Project Owner';
              return (
                <div
                  key={p.id}
                  onClick={() => onSelectProject?.(p.id)}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 hover:bg-white hover:border-purple-300 hover:shadow-xs transition-all cursor-pointer space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-bold text-slate-900 leading-snug">
                      {p.name}
                    </h4>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-purple-50 text-purple-700 border border-purple-200 shrink-0">
                      {p.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                    {p.description}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                    <span>Owner: <strong className="text-slate-700 font-semibold">{ownerName}</strong></span>
                    <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. UPCOMING SECTION */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          UPCOMING DEADLINES
        </h3>

        {upcomingItems.length === 0 ? (
          <div className="p-6 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-xs">
            <Calendar className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <p className="font-semibold text-slate-600">No upcoming task deadlines</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Task deadlines and milestone schedules are planned for V2.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {upcomingItems.map((item) => (
              <div
                key={item.id}
                onClick={() => onOpenTaskModal?.(item)}
                className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-purple-200 transition-all cursor-pointer flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex flex-col items-center justify-center shrink-0">
                    <span className="text-[9px] font-bold text-purple-600 uppercase">DUE</span>
                    <span className="text-xs font-black text-purple-900">
                      {new Date(item.due_date).getDate()}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-semibold text-slate-800">
                      {item.title}
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {item.project_name || 'General'}
                    </p>
                  </div>
                </div>

                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded border uppercase shrink-0 bg-slate-100 text-slate-700 border-slate-200">
                  {item.priority}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
