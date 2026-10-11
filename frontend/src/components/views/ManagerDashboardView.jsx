import React, { useState, useEffect } from 'react';
import MetricCards from '../dashboard/MetricCards';
import BroadcastAlert from '../dashboard/BroadcastAlert';
import ProjectHealth from '../dashboard/ProjectHealth';
import { projectsService } from '../../services/projects.service';
import { workItemsService } from '../../services/workItems.service';
import { Calendar, Users, Sparkles, Clock } from 'lucide-react';

export default function ManagerDashboardView({ 
  onNavigate, 
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
  const [loading, setLoading] = useState(true);

  // If Cohort 2 is selected, render the clean future/empty state
  const isFutureCohort = selectedCohort?.code === 'cohort-2' || (selectedCohort?.name?.toLowerCase().includes('cohort 2') && (!selectedCohort?._count?.users || selectedCohort?._count?.users === 0));

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    const userParams = selectedCohort?.id ? { cohort_id: selectedCohort.id } : {};
    Promise.all([
      projectsService.getProjects().catch(() => ({ projects: [] })),
      projectsService.getUsers(userParams).catch(() => ({ users: [] })),
      workItemsService.listWorkItems().catch(() => [])
    ]).then(([projData, userData, workData]) => {
      if (isMounted) {
        setProjects(Array.isArray(projData) ? projData : (projData?.projects || []));
        const loadedUsers = Array.isArray(userData) ? userData : (userData?.users || []);
        setUsers(loadedUsers);
        setWorkItems(Array.isArray(workData) ? workData : []);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [selectedCohort?.id]);

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

  const dynamicProjectHealth = projects.map((proj) => {
    const ownerName = proj.owner ? (proj.owner.name || proj.owner.email) : 'Unassigned';
    const memberCount = proj._count?.members ?? (proj.members?.length ?? 0);

    // Filter work items belonging to this project (verifying project_id or project.id)
    const projItems = workItems.filter(
      (w) => w.project_id === proj.id || w.project?.id === proj.id
    );

    // Eligible leaf deliverables: Stories, Tasks, Bugs, Subtasks (exclude parent Epics to avoid double counting)
    const eligibleDeliverables = projItems.filter(
      (item) => String(item.type || '').toUpperCase() !== 'EPIC'
    );

    const completedDeliverables = eligibleDeliverables.filter(
      (item) => String(item.status || '').toUpperCase() === 'COMPLETED'
    );

    // If 0 eligible deliverables, return 0% (never default to arbitrary percentage)
    const progress = eligibleDeliverables.length > 0
      ? Math.round((completedDeliverables.length / eligibleDeliverables.length) * 100)
      : 0;

    return {
      id: proj.id,
      name: proj.name,
      lead: ownerName,
      section: proj.status,
      internsCount: memberCount,
      progress,
      status: proj.status,
      statusType: proj.status === 'ACTIVE' ? 'success' : (proj.status === 'PLANNED' ? 'warning' : 'default'),
    };
  });

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
          projects={dynamicProjectHealth}
          onViewAll={() => onNavigate('projects')}
        />
      </div>
    </div>
  );
}
