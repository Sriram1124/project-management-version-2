import React from 'react';
import { 
  ArrowUpRight, 
  CheckCircle2, 
  AlertTriangle, 
  AlertOctagon, 
  HelpCircle,
  ChevronRight,
  Activity
} from 'lucide-react';

const HEALTH_CONFIG = {
  HEALTHY: {
    label: 'HEALTHY',
    icon: CheckCircle2,
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200/90 shadow-2xs',
    iconBg: 'bg-emerald-100 text-emerald-600 border-emerald-200/80',
    borderAccent: 'border-l-emerald-500',
    barColor: 'bg-emerald-500',
    percentColor: 'text-emerald-700',
    dotColor: 'bg-emerald-500',
  },
  NEEDS_ATTENTION: {
    label: 'NEEDS ATTENTION',
    icon: AlertTriangle,
    badgeBg: 'bg-amber-50 text-amber-700 border-amber-200/90 shadow-2xs',
    iconBg: 'bg-amber-100 text-amber-600 border-amber-200/80',
    borderAccent: 'border-l-amber-500',
    barColor: 'bg-amber-500',
    percentColor: 'text-amber-700',
    dotColor: 'bg-amber-500',
  },
  AT_RISK: {
    label: 'AT RISK',
    icon: AlertTriangle,
    badgeBg: 'bg-orange-50 text-orange-700 border-orange-200/90 shadow-2xs',
    iconBg: 'bg-orange-100 text-orange-600 border-orange-200/80',
    borderAccent: 'border-l-orange-500',
    barColor: 'bg-orange-500',
    percentColor: 'text-orange-700',
    dotColor: 'bg-orange-500',
  },
  CRITICAL: {
    label: 'CRITICAL',
    icon: AlertOctagon,
    badgeBg: 'bg-rose-50 text-rose-700 border-rose-200/90 shadow-2xs',
    iconBg: 'bg-rose-100 text-rose-600 border-rose-200/80',
    borderAccent: 'border-l-rose-500',
    barColor: 'bg-rose-500',
    percentColor: 'text-rose-700',
    dotColor: 'bg-rose-500',
  },
  NOT_ASSESSED: {
    label: 'NOT ASSESSED',
    icon: HelpCircle,
    badgeBg: 'bg-slate-100 text-slate-600 border-slate-200 shadow-2xs',
    iconBg: 'bg-slate-100 text-slate-400 border-slate-200/80',
    borderAccent: 'border-l-slate-300',
    barColor: 'bg-slate-300',
    percentColor: 'text-slate-400',
    dotColor: 'bg-slate-400',
  },
};

const getHealthConfig = (health) => {
  if (health === 'INSUFFICIENT_DATA') return HEALTH_CONFIG.NOT_ASSESSED;
  return HEALTH_CONFIG[health] || HEALTH_CONFIG.NOT_ASSESSED;
};

const getPrimaryReason = (proj) => {
  if (proj.reasons && proj.reasons.length > 0) {
    return proj.reasons[0];
  }
  if (proj.health === 'HEALTHY') {
    return proj.remaining_sp === 0 ? 'All deliverables completed' : 'On schedule · 0 overdue · 0 blocked';
  }
  if (proj.health === 'NOT_ASSESSED' || proj.health === 'INSUFFICIENT_DATA' || !proj.has_estimated_work) {
    return 'No estimated work defined for this project';
  }
  return 'Delivery status on track';
};

export default function ProjectHealth({ 
  healthOverview, 
  loading = false, 
  onViewAll, 
  onSelectProject,
  limit = 4
}) {
  const [healthFilter, setHealthFilter] = React.useState('ALL');
  const allProjects = healthOverview?.projects || [];

  const healthyCount = allProjects.filter((p) => p.health === 'HEALTHY').length;
  const needsAttentionCount = allProjects.filter((p) => p.health === 'NEEDS_ATTENTION').length;
  const atRiskCount = allProjects.filter((p) => p.health === 'AT_RISK' || p.health === 'CRITICAL').length;

  const filteredProjects = React.useMemo(() => {
    if (healthFilter === 'HEALTHY') {
      return allProjects.filter((p) => p.health === 'HEALTHY');
    }
    if (healthFilter === 'NEEDS_ATTENTION') {
      return allProjects.filter((p) => p.health === 'NEEDS_ATTENTION');
    }
    if (healthFilter === 'AT_RISK') {
      return allProjects.filter((p) => p.health === 'AT_RISK' || p.health === 'CRITICAL');
    }
    return allProjects;
  }, [allProjects, healthFilter]);

  const projects = limit ? filteredProjects.slice(0, limit) : filteredProjects;

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-card animate-pulse space-y-5">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="h-5 w-48 bg-slate-200 rounded-md" />
            <div className="h-3.5 w-72 bg-slate-100 rounded-md" />
          </div>
          <div className="h-4 w-28 bg-slate-200 rounded-md" />
        </div>
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-slate-50 border border-slate-100 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-card space-y-5">
      {/* 1. Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-purple-600" />
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Project Health Overview
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Instant delivery health, active blockers, and story-point schedule status for each project
          </p>
        </div>
        <button
          onClick={onViewAll}
          className="text-xs font-semibold text-purple-600 hover:text-purple-700 flex items-center gap-1 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-purple-50"
        >
          <span>View All Projects</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Filter Tabs */}
      {allProjects.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {[
            { id: 'ALL', label: `All (${allProjects.length})` },
            { id: 'HEALTHY', label: `Healthy (${healthyCount})` },
            { id: 'NEEDS_ATTENTION', label: `Needs Attention (${needsAttentionCount})` },
            { id: 'AT_RISK', label: `At Risk / Critical (${atRiskCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setHealthFilter(tab.id)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                healthFilter === tab.id
                  ? 'bg-purple-100 text-purple-800 border border-purple-200 shadow-2xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* 2. Project-by-Project Health Overview */}
      <div className="space-y-3">
        {projects.length === 0 ? (
          <div className="p-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
            {allProjects.length === 0
              ? 'No projects found in this organization. Projects will appear here as they are created.'
              : 'No projects match the selected health filter.'}
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((proj) => {
              const config = getHealthConfig(proj.health);
              const StatusIcon = config.icon;
              const primaryReason = getPrimaryReason(proj);
              const isNotAssessed =
                proj.health === 'NOT_ASSESSED' ||
                proj.health === 'INSUFFICIENT_DATA' ||
                !proj.has_estimated_work ||
                proj.progress_percentage === null;

              return (
                <div
                  key={proj.id}
                  onClick={() => onSelectProject?.(proj.id, proj.name)}
                  className={`group relative p-4 sm:p-5 rounded-xl border border-slate-200/80 hover:border-violet-300 bg-white hover:bg-violet-50/20 transition-all cursor-pointer shadow-2xs hover:shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 ${config.borderAccent}`}
                >
                  {/* Left Side: Prominent Icon + Name + Badge + Primary Reason + Supporting Signals */}
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    {/* Prominent colored health icon */}
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border shadow-2xs ${config.iconBg}`}>
                      <StatusIcon className="w-5 h-5 stroke-[2.2]" />
                    </div>

                    <div className="space-y-1.5 min-w-0 flex-1">
                      {/* Project Name & Prominent Health Badge */}
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-base font-bold text-slate-900 group-hover:text-purple-700 transition-colors truncate">
                          {proj.name}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide border ${config.badgeBg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
                          <span>{proj.health_score !== null && proj.health_score !== undefined ? `${proj.health_score}/100 · ` : ''}{config.label}</span>
                        </span>
                      </div>

                      {/* Concise explanation of the primary health reason */}
                      <p className="text-xs font-medium text-slate-600 leading-snug">
                        {primaryReason}
                      </p>

                      {/* Supporting Signals */}
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 flex-wrap pt-0.5">
                        {proj.has_estimated_work ? (
                          <>
                            <span className="font-semibold text-slate-700">
                              {proj.completed_sp} / {proj.total_sp} SP ({proj.delivery_progress_percentage ?? proj.progress_percentage ?? 0}%)
                            </span>
                            <span className="text-slate-300">•</span>
                            <span>{proj.remaining_sp} SP remaining</span>
                            {(proj.overdue_sp > 0 || proj.overdue_tasks > 0) && (
                              <>
                                <span className="text-slate-300">•</span>
                                <span className="text-rose-600 font-semibold">
                                  {proj.total_sp > 0
                                    ? `${proj.overdue_sp || 0}/${proj.total_sp} SP overdue (${proj.overdue_sp_percentage ?? 0}%)`
                                    : `${proj.overdue_tasks} overdue`}
                                </span>
                              </>
                            )}
                            {(proj.blocked_sp > 0 || proj.blocked_tasks > 0) && (
                              <>
                                <span className="text-slate-300">•</span>
                                <span className="text-amber-600 font-semibold">
                                  {proj.total_sp > 0
                                    ? `${proj.blocked_sp || 0}/${proj.total_sp} SP blocked (${proj.blocked_sp_percentage ?? 0}%)`
                                    : `${proj.blocked_tasks} blocked`}
                                </span>
                              </>
                            )}
                            {proj.project_overdue_days > 0 && (
                              <>
                                <span className="text-slate-300">•</span>
                                <span className="text-rose-600 font-semibold">
                                  {proj.project_overdue_days}d project overdue
                                </span>
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="text-slate-500 font-medium">0 SP estimated</span>
                            <span className="text-slate-300">•</span>
                            <span>{proj.total_tasks || 0} tasks defined</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Large Completion Percentage + Progress Bar + Navigation Chevron */}
                  <div className="flex items-center justify-between md:justify-end gap-5 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                    <div className="flex flex-col items-start md:items-end gap-1.5 min-w-[140px]">
                      <div className="flex items-baseline gap-1.5">
                        <span className={`text-2xl font-bold tracking-tight ${config.percentColor}`}>
                          {isNotAssessed ? '—' : `${proj.progress_percentage}%`}
                        </span>
                        <span className="text-xs font-medium text-slate-400">
                          completed
                        </span>
                      </div>

                      {/* Compact Progress Bar */}
                      <div className="w-32 sm:w-36 bg-slate-100 rounded-full h-2 overflow-hidden shadow-inner">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${config.barColor}`}
                          style={{ width: `${isNotAssessed ? 0 : proj.progress_percentage}%` }}
                        />
                      </div>
                    </div>

                    {/* Navigation Chevron */}
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 group-hover:text-purple-600 group-hover:bg-purple-50 transition-all shrink-0">
                      <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
