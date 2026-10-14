import React, { useState, useEffect } from 'react';
import MetricCards from '../dashboard/MetricCards';
import BroadcastAlert from '../dashboard/BroadcastAlert';
import ProjectHealth from '../dashboard/ProjectHealth';
import { projectsService } from '../../services/projects.service';
import { workItemsService } from '../../services/workItems.service';
import { Calendar, Users, Sparkles, Clock } from 'lucide-react';

export default function ManagerDashboardView({ 
  onNavigate, 
  onSelectProject,
  onOpenAlertModal, 
  onOpenExceptionModal,
  onSendAlertMessage,
  channelForms = [],
  onPostForm,
  onSubmitResponse,
  onToast,
  selectedCohort,
}) {
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [workItems, setWorkItems] = useState([]);
  const [healthOverview, setHealthOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [healthLoading, setHealthLoading] = useState(true);

  // If Cohort 2 is selected, render the clean future/empty state
  const isFutureCohort = selectedCohort?.code === 'cohort-2' || (selectedCohort?.name?.toLowerCase().includes('cohort 2') && (!selectedCohort?._count?.users || selectedCohort?._count?.users === 0));

  const fetchDashboardData = React.useCallback(() => {
    const userParams = selectedCohort?.id ? { cohort_id: selectedCohort.id } : {};
    return Promise.all([
      projectsService.getProjects().catch(() => ({ projects: [] })),
      projectsService.getUsers(userParams).catch(() => ({ users: [] })),
      workItemsService.listWorkItems().catch(() => []),
      projectsService.getHealthOverview(userParams).catch((err) => {
        console.error('Failed to load project health overview:', err);
        return null;
      }),
    ]).then(([projData, userData, workData, healthData]) => {
      setProjects(Array.isArray(projData) ? projData : (projData?.projects || []));
      const loadedUsers = Array.isArray(userData) ? userData : (userData?.users || []);
      setUsers(loadedUsers);
      setWorkItems(Array.isArray(workData) ? workData : []);
      setHealthOverview(healthData);
      setLoading(false);
      setHealthLoading(false);
    });
  }, [selectedCohort?.id]);

  useEffect(() => {
    setLoading(true);
    setHealthLoading(true);
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    const handleSync = () => {
      fetchDashboardData();
    };
    window.addEventListener('work-items-updated', handleSync);
    return () => window.removeEventListener('work-items-updated', handleSync);
  }, [fetchDashboardData]);

  if (isFutureCohort) {
    return (
      <div className="space-y-6">
        {/* Future Cohort Header Card */}
        <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-white via-purple-50/40 to-indigo-50/30 p-8 shadow-xs">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-bold uppercase tracking-wider mb-4 border border-purple-200/60">
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              <span>{selectedCohort?.name || 'Cohort 2'} — Future Cohort</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">
              No intern data has been added to {selectedCohort?.name || 'Cohort 2'} yet.
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              This cohort workspace is ready for upcoming interns. Once interns are enrolled into {selectedCohort?.name || 'Cohort 2'}, their project assignments, task analytics, sprint metrics, and attendance tracking will appear here automatically.
            </p>
          </div>
        </div>

        {/* Future State Outline Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="p-6 rounded-xl border border-dashed border-slate-300 bg-white/70 flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800 mb-1">0 Interns Enrolled</h3>
            <p className="text-xs text-slate-500">Cohort 2 intern roster will activate upon onboarding.</p>
          </div>

          <div className="p-6 rounded-xl border border-dashed border-slate-300 bg-white/70 flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
              <Clock className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800 mb-1">Attendance Inactive</h3>
            <p className="text-xs text-slate-500">Timesheets and session logs will start tracking with active interns.</p>
          </div>

          <div className="p-6 rounded-xl border border-dashed border-slate-300 bg-white/70 flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
              <Calendar className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800 mb-1">Task Board Uninitialized</h3>
            <p className="text-xs text-slate-500">Project tasks and milestones will populate when assignments begin.</p>
          </div>
        </div>
      </div>
    );
  }

  const activeProjectsCount = projects.filter((p) => p.status === 'ACTIVE' || p.status === 'PLANNED').length;
  const completedTasks = workItems.filter((w) => w.status === 'COMPLETED').length;
  const overdueTasks = workItems.filter((w) => workItemsService.isOverdue(w)).length;
  const activeUsersCount = users.filter((u) => u.is_active !== false).length;

  const dynamicMetrics = {
    totalInterns: {
      value: users.length,
      change: `${activeUsersCount} Active Members`,
    },
    activeProjects: {
      value: projects.length,
      subtitle: `${activeProjectsCount} In Progress / Planned`,
    },
    tasksCompleted: {
      value: completedTasks,
      change: `${completedTasks} of ${workItems.length} Total Tasks`,
    },
    overdueTasks: {
      value: overdueTasks,
      subtitle: overdueTasks > 0 ? `${overdueTasks} Tasks Require Attention` : 'All Tasks on Schedule',
    },
  };

  return (
    <div className="space-y-6">
      {/* Primary 4 Metric Cards */}
      <MetricCards 
        metrics={dynamicMetrics} 
        onCardClick={(type) => {
          if (type === 'interns') onNavigate('interns');
          else if (type === 'projects') onNavigate('projects');
        }}
      />

      {/* Main Content Sections: Stacked and grid-aligned */}
      <div className="space-y-6">
        {/* Admin Broadcast Alert Panel */}
        <BroadcastAlert 
          onSendAlert={onSendAlertMessage}
          onPreview={onOpenAlertModal}
          users={users}
          workItems={workItems}
        />

        {/* Project Health Card */}
        <ProjectHealth 
          healthOverview={healthOverview}
          loading={healthLoading}
          onViewAll={() => onNavigate('projects')}
          onSelectProject={onSelectProject}
        />
      </div>
    </div>
  );
}
