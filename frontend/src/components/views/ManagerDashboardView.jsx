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
  const cohortReqSeq = React.useRef(0);

  // If Cohort 2 is selected, render the clean future/empty state
  const isFutureCohort = (selectedCohort?.code === 'cohort-2' || selectedCohort?.name?.toLowerCase().includes('cohort 2')) && (!selectedCohort?._count?.users || selectedCohort?._count?.users === 0 || users.length === 0);

  // Fetch cohort-independent data (projects and work items) once on mount
  const fetchGlobalData = React.useCallback(() => {
    return Promise.all([
      projectsService.getProjects().catch(() => ({ projects: [] })),
      workItemsService.listWorkItems({ overdue_only: true }).catch(() => []),
    ]).then(([projData, workData]) => {
      setProjects(Array.isArray(projData) ? projData : (projData?.projects || []));
      setWorkItems(Array.isArray(workData) ? workData : []);
    });
  }, []);

  // Fetch cohort-scoped data (users and health overview) whenever selectedCohort changes
  const fetchCohortData = React.useCallback(() => {
    if (!selectedCohort?.id) return Promise.resolve();
    const seq = ++cohortReqSeq.current;
    const userParams = { cohort_id: selectedCohort.id };
    setHealthLoading(true);
    return Promise.all([
      projectsService.getUsers(userParams).catch(() => ({ users: [] })),
      projectsService.getHealthOverview(userParams).catch((err) => {
        console.error('Failed to load project health overview:', err);
        return null;
      }),
    ]).then(([userData, healthData]) => {
      if (seq !== cohortReqSeq.current) return;
      const loadedUsers = Array.isArray(userData) ? userData : (userData?.users || []);
      setUsers(loadedUsers);
      setHealthOverview(healthData);
      setHealthLoading(false);
    });
  }, [selectedCohort?.id]);

  // Initial load: fetch global data once on mount
  useEffect(() => {
    setLoading(true);
    fetchGlobalData().finally(() => {
      setLoading(false);
    });
  }, [fetchGlobalData]);

  // When selectedCohort changes, only re-fetch cohort-scoped data (avoid duplicate projects/workItems requests)
  useEffect(() => {
    if (selectedCohort?.id) {
      setUsers([]);
      setHealthOverview(null);
      fetchCohortData();
    }
  }, [fetchCohortData, selectedCohort?.id]);

  useEffect(() => {
    const handleSync = () => {
      fetchGlobalData();
      fetchCohortData();
    };
    window.addEventListener('work-items-updated', handleSync);
    return () => window.removeEventListener('work-items-updated', handleSync);
  }, [fetchGlobalData, fetchCohortData]);

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

  const internUsers = React.useMemo(() => {
    return users.filter((u) => {
      const isLead = Boolean(u.is_tech_lead) || u.type === 'TECH_LEAD' || u.role === 'TECH_LEAD' || u.project_role === 'TECH_LEAD';
      const isManagement = u.type === 'MANAGER' || u.role === 'MANAGER' || u.type === 'ADMIN' || u.type === 'SUPER_ADMIN';
      if (isLead || isManagement) return false;
      if (selectedCohort?.id && selectedCohort.id !== 'ALL') {
        const matchesCohort =
          u.cohort_id === selectedCohort.id ||
          u.cohort?.id === selectedCohort.id ||
          u.cohort?.code === selectedCohort.id ||
          u.cohort?.code === selectedCohort?.code ||
          u.cohort?.name === selectedCohort?.name;
        if (!matchesCohort) return false;
      }
      return true;
    });
  }, [users, selectedCohort]);

  const activeProjectsCount = projects.filter((p) => p.status === 'ACTIVE' || p.status === 'PLANNED').length;
  const activeInternsCount = internUsers.filter((u) => u.is_active !== false).length;

  const dynamicMetrics = {
    totalInterns: {
      value: internUsers.length,
      change: `${activeInternsCount} Active Members`,
    },
    activeProjects: {
      value: projects.length,
      subtitle: `${activeProjectsCount} In Progress / Planned`,
    },
  };

  return (
    <div className="space-y-6">
      {/* Primary 4 Metric Cards */}
      <MetricCards 
        metrics={dynamicMetrics} 
        healthOverview={healthOverview}
        healthLoading={healthLoading}
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
          limit={4}
        />
      </div>
    </div>
  );
}
