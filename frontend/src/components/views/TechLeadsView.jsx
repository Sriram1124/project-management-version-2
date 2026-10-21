import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, 
  Users, 
  FolderKanban, 
  Loader2, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  AlertOctagon, 
  TrendingUp, 
  Search, 
  Filter, 
  Target,
  Layers,
  ChevronDown,
  ChevronRight,
  X,
  Activity,
  ArrowUpRight,
  Info,
  Calendar,
  AlertCircle,
  HelpCircle
} from 'lucide-react';
import { projectsService } from '../../services/projects.service';

/**
 * Visual styling configurations based on Health Status
 */
const HEALTH_CONFIG = {
  HEALTHY: {
    label: 'Healthy',
    badge: 'text-emerald-700 bg-emerald-50 border-emerald-200/90 shadow-2xs',
    dot: 'bg-emerald-500',
    bar: 'bg-emerald-500',
    text: 'text-emerald-700',
    riskText: 'text-emerald-700 font-semibold',
  },
  NEEDS_ATTENTION: {
    label: 'Needs Attention',
    badge: 'text-amber-700 bg-amber-50 border-amber-200/90 shadow-2xs',
    dot: 'bg-amber-500',
    bar: 'bg-amber-500',
    text: 'text-amber-700',
    riskText: 'text-amber-700 font-semibold',
  },
  AT_RISK: {
    label: 'At Risk',
    badge: 'text-orange-700 bg-orange-50 border-orange-200/90 shadow-2xs',
    dot: 'bg-orange-500',
    bar: 'bg-orange-500',
    text: 'text-orange-700',
    riskText: 'text-orange-700 font-semibold',
  },
  CRITICAL: {
    label: 'Critical',
    badge: 'text-rose-700 bg-rose-50 border-rose-200/90 shadow-2xs',
    dot: 'bg-rose-500',
    bar: 'bg-rose-500',
    text: 'text-rose-700',
    riskText: 'text-rose-700 font-bold',
  },
  NOT_ASSESSED: {
    label: 'Not Assessed',
    badge: 'text-slate-600 bg-slate-100 border-slate-200/80 shadow-2xs',
    dot: 'bg-slate-400',
    bar: 'bg-slate-300',
    text: 'text-slate-500',
    riskText: 'text-slate-500',
  },
  INSUFFICIENT_DATA: {
    label: 'Not Assessed',
    badge: 'text-slate-600 bg-slate-100 border-slate-200/80 shadow-2xs',
    dot: 'bg-slate-400',
    bar: 'bg-slate-300',
    text: 'text-slate-500',
    riskText: 'text-slate-500',
  },
};

const getHealthMeta = (status) => {
  if (status === 'NOT_ASSESSED' || status === 'INSUFFICIENT_DATA') {
    return HEALTH_CONFIG.INSUFFICIENT_DATA;
  }
  return HEALTH_CONFIG[status] || HEALTH_CONFIG.INSUFFICIENT_DATA;
};

/**
 * Health Details Modal component explaining reasons & recommendations
 */
function ProjectHealthDetailsModal({ project, leadName, onClose, onSelectProject }) {
  if (!project) return null;

  const meta = getHealthMeta(project.health);
  const reasons = project.reasons && project.reasons.length > 0 ? project.reasons : [];
  const riskFactors = project.risk_factors && project.risk_factors.length > 0 ? project.risk_factors : reasons;
  const actions = project.recommended_actions && project.recommended_actions.length > 0 ? project.recommended_actions : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 truncate">
                {project.name}
              </h3>
              <p className="text-[11px] text-slate-500 truncate mt-0.5">
                Tech Lead: <span className="font-semibold text-slate-700">{leadName}</span>
                {project.status && ` · Status: ${project.status}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Main Health Banner */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Project Health Assessment
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-extrabold text-slate-900">
                  {project.health_score !== null && project.health_score !== undefined ? `${project.health_score}%` : 'Not Assessed'}
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${meta.badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                  <span>{project.health_label || meta.label}</span>
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Risk Level: <strong className={meta.riskText}>{project.risk_level || 'N/A'}</strong>
              </div>
            </div>

            <div className="sm:text-right">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Schedule Status
              </div>
              <div className="mt-1">
                <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold border ${
                  project.schedule_health === 'ON_TRACK' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  project.schedule_health === 'BEHIND' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                  project.schedule_health === 'AHEAD' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                  'bg-slate-100 text-slate-600 border-slate-200'
                }`}>
                  {project.schedule_label || 'Schedule On Track'}
                </span>
              </div>
              {project.schedule_variance_days !== null && project.schedule_variance_days !== undefined && (
                <div className="text-[11px] text-slate-500 mt-1">
                  {project.schedule_variance_days < 0 
                    ? `${Math.abs(project.schedule_variance_days)} days behind schedule`
                    : `${project.schedule_variance_days} days ahead of schedule`}
                </div>
              )}
            </div>
          </div>

          {/* Health Score Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-600">
              <span>Overall Delivery Health:</span>
              <span className="font-bold text-slate-800">
                {project.health_score !== null && project.health_score !== undefined ? `${project.health_score}% · ${project.health_label || meta.label}` : 'Not Assessed'}
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden shadow-inner">
              <div
                className={`h-full rounded-full transition-all duration-500 ${meta.bar}`}
                style={{ width: `${project.health_score !== null ? Math.min(100, Math.max(0, project.health_score)) : 0}%` }}
              />
            </div>
          </div>

          {/* 4 Key Metrics Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-center">
              <div className="text-xs font-extrabold text-slate-900">
                {(project.delivery_progress_percentage ?? project.progress_percentage ?? project.completion_rate) !== null
                  ? `${project.delivery_progress_percentage ?? project.progress_percentage ?? project.completion_rate}%`
                  : '—'}
              </div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mt-0.5">
                Delivery Progress
              </div>
              <div className="text-[10px] text-slate-500 mt-1 font-mono">
                {(project.total_sp > 0 || project.total_points > 0)
                  ? `${project.completed_sp ?? project.completed_points}/${project.total_sp ?? project.total_points} SP`
                  : `${project.completed_tasks}/${project.total_tasks} done`}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-center">
              <div className={`text-xs font-extrabold ${(project.overdue_sp || project.overdue_tasks || 0) > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                {project.total_sp > 0 ? `${project.overdue_sp ?? 0} SP` : (project.overdue_tasks || 0)}
              </div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mt-0.5">
                Overdue Work
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                {project.total_sp > 0
                  ? `${project.overdue_sp ?? 0}/${project.total_sp} SP (${project.overdue_sp_percentage ?? 0}%)`
                  : `${project.overdue_tasks || 0} tasks (${project.overdue_percentage || 0}%)`}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-center">
              <div className={`text-xs font-extrabold ${(project.blocked_sp || project.blocked_tasks || 0) > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
                {project.total_sp > 0 ? `${project.blocked_sp ?? 0} SP` : (project.blocked_tasks || 0)}
              </div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mt-0.5">
                Blocked Work
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                {project.total_sp > 0
                  ? `${project.blocked_sp ?? 0}/${project.total_sp} SP (${project.blocked_sp_percentage ?? 0}%)`
                  : `${project.blocked_tasks || 0} tasks (${project.blocked_percentage || 0}%)`}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-center">
              <div className={`text-xs font-extrabold ${
                project.schedule_health === 'BEHIND' ? 'text-rose-600' :
                project.schedule_health === 'AHEAD' ? 'text-blue-600' : 'text-emerald-600'
              }`}>
                {project.schedule_label || 'On Track'}
              </div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mt-0.5">
                Schedule
              </div>
              <div className="text-[10px] text-slate-500 mt-1 truncate">
                {project.schedule_variance_percentage !== null && project.schedule_variance_percentage !== undefined
                  ? `${project.schedule_variance_percentage > 0 ? '+' : ''}${project.schedule_variance_percentage}% var`
                  : 'Dates aligned'}
              </div>
            </div>
          </div>

          {/* Deliverables & Story Points Breakdown */}
          <div className="p-3 rounded-xl bg-purple-50/50 border border-purple-100 flex items-center justify-between text-xs flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-purple-900">Work Scope:</span>
              <span className="font-semibold text-slate-700">
                {(project.total_sp > 0 || project.total_points > 0)
                  ? `${project.completed_sp ?? project.completed_points} / ${project.total_sp ?? project.total_points} SP (${(project.progress_percentage !== null && project.progress_percentage !== undefined) ? project.progress_percentage : Math.round(((project.completed_sp ?? project.completed_points) / (project.total_sp ?? project.total_points)) * 100)}%)`
                  : `${project.completed_tasks} / ${project.total_tasks} tasks done`}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-600">
              {(project.remaining_sp !== undefined || project.remaining_points !== undefined) && (
                <span>{project.remaining_sp ?? project.remaining_points} SP remaining</span>
              )}
              {project.story_count > 0 && (
                <>
                  <span className="text-slate-300">•</span>
                  <span>{project.story_count} {project.story_count === 1 ? 'story' : 'stories'}</span>
                </>
              )}
              <span className="text-slate-300">•</span>
              <span>{project.completed_tasks}/{project.total_tasks} tasks completed</span>
            </div>
          </div>

          {/* Main Factors Lowering Score (Why this project is at risk) */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span>Factors Affecting Health Score</span>
            </h4>
            {riskFactors.length > 0 ? (
              <div className="space-y-1.5">
                {riskFactors.map((factor, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200/70 text-xs text-amber-900 flex items-start gap-2"
                  >
                    <span className="text-amber-500 font-bold shrink-0 mt-0.5">•</span>
                    <span className="leading-snug">{factor}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200/80 text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>All health metrics, task schedules, and deliverable workflows are operating within healthy thresholds.</span>
              </div>
            )}
          </div>

          {/* Recommended Actions */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
              <span>Recommended Actions</span>
            </h4>
            {actions.length > 0 ? (
              <div className="space-y-1.5">
                {actions.map((act, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg bg-purple-50/50 border border-purple-200/60 text-xs text-purple-950 flex items-start gap-2"
                  >
                    <span className="text-purple-600 font-bold shrink-0 mt-0.5">✓</span>
                    <span className="leading-snug">{act}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500">
                Maintain steady cadence and verify upcoming deliverables during routine standups.
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>

          {onSelectProject && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onSelectProject(project.id, project.name);
              }}
              className="px-4 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <span>Open Project Workspace</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TechLeadsView({ onRebalanceLead, onSelectProject }) {
  const [techLeads, setTechLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'HEALTHY' | 'NEEDS_ATTENTION' | 'AT_RISK' | 'ACTIVE_PROJECTS'
  const [selectedProjectForHealth, setSelectedProjectForHealth] = useState(null);

  useEffect(() => {
    void loadTechLeads();
  }, []);

  const loadTechLeads = async () => {
    try {
      setLoading(true);
      const data = await projectsService.getTechLeads();
      setTechLeads(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load tech leads oversight:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filtered tech leads based on search & health status filter
  const filteredTechLeads = useMemo(() => {
    return techLeads.filter((lead) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (lead.name || '').toLowerCase().includes(q);
        const matchEmail = (lead.email || '').toLowerCase().includes(q);
        const matchProjects = (lead.projects || []).some((p) => p.name.toLowerCase().includes(q));
        if (!matchName && !matchEmail && !matchProjects) return false;
      }

      if (statusFilter === 'HEALTHY') {
        if (lead.health_status !== 'HEALTHY') return false;
      } else if (statusFilter === 'NEEDS_ATTENTION') {
        if (lead.health_status !== 'NEEDS_ATTENTION') return false;
      } else if (statusFilter === 'AT_RISK') {
        if (lead.health_status !== 'AT_RISK' && lead.health_status !== 'CRITICAL') return false;
      } else if (statusFilter === 'ACTIVE_PROJECTS') {
        if (!lead.project_count || lead.project_count === 0) return false;
      }

      return true;
    });
  }, [techLeads, searchQuery, statusFilter]);

  // Overall metrics across all leads and projects
  const totalLeadsCount = techLeads.length;
  const totalOverseenProjects = techLeads.reduce((acc, l) => acc + (l.project_count || 0), 0);
  const totalOverseenTasks = techLeads.reduce((acc, l) => acc + (l.total_project_tasks || 0), 0);
  const totalCompletedTasks = techLeads.reduce((acc, l) => acc + (l.completed_project_tasks || 0), 0);

  const healthyLeadsCount = techLeads.filter((l) => l.health_status === 'HEALTHY').length;
  const attentionLeadsCount = techLeads.filter((l) => l.health_status === 'NEEDS_ATTENTION').length;
  const atRiskLeadsCount = techLeads.filter((l) => l.health_status === 'AT_RISK' || l.health_status === 'CRITICAL').length;

  return (
    <div className="space-y-6">
      {/* ── HEADER & OVERVIEW METRICS ────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Tech Leads & Project Health</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Supervise project lead assignments, project delivery health, active blockers, and schedule risks
          </p>
        </div>

        {/* Global summary chips */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl bg-purple-50 border border-purple-200/80 text-purple-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs">
            <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
            <span>{totalLeadsCount} Assigned Leads</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs">
            <FolderKanban className="w-3.5 h-3.5 text-slate-500" />
            <span>{totalOverseenProjects} Active Projects</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>{healthyLeadsCount} Healthy Leads</span>
          </div>
          {attentionLeadsCount > 0 && (
            <div className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>{attentionLeadsCount} Needs Attention</span>
            </div>
          )}
          {atRiskLeadsCount > 0 && (
            <div className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span>{atRiskLeadsCount} At Risk / Critical</span>
            </div>
          )}
        </div>
      </div>

      {/* ── SEARCH & FILTER CONTROLS ────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by tech lead name, email, or project..."
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            {[
              { id: 'ALL', label: 'All Leads' },
              { id: 'HEALTHY', label: `Healthy (≥75)${healthyLeadsCount > 0 ? ` (${healthyLeadsCount})` : ''}` },
              { id: 'NEEDS_ATTENTION', label: `Needs Attention (55–74)${attentionLeadsCount > 0 ? ` (${attentionLeadsCount})` : ''}` },
              { id: 'AT_RISK', label: `At Risk / Critical (<55)${atRiskLeadsCount > 0 ? ` (${atRiskLeadsCount})` : ''}` },
              { id: 'ACTIVE_PROJECTS', label: 'With Projects' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                  statusFilter === f.id
                    ? 'bg-purple-100 text-purple-700 font-semibold border border-purple-200/80'
                    : 'text-slate-600 hover:bg-slate-100 border border-transparent'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => { void loadTechLeads(); }}
          className="text-xs font-semibold text-purple-700 hover:text-purple-800 hover:underline shrink-0 cursor-pointer self-end sm:self-auto"
        >
          Refresh Data
        </button>
      </div>

      {/* ── TECH LEADS GRID / CARDS ────────────────────────────────────────── */}
      {loading ? (
        <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <Loader2 className="w-6 h-6 text-purple-600 animate-spin" />
          <span className="text-xs font-semibold text-slate-600">Loading assigned Tech Leads & project health assessments...</span>
        </div>
      ) : filteredTechLeads.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto border border-purple-100">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">No Tech Leads Found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            {searchQuery || statusFilter !== 'ALL'
              ? 'No tech leads match your search criteria. Try resetting filters.'
              : 'No project members are currently assigned the Tech Lead role in your projects.'}
          </p>
          {(searchQuery || statusFilter !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('ALL');
              }}
              className="px-3.5 py-1.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 text-xs font-semibold hover:bg-purple-100 transition-colors cursor-pointer"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTechLeads.map((lead) => {
            const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(lead.name || 'Lead')}&background=7C3AED&color=fff`;
            const leadMeta = getHealthMeta(lead.health_status);

            return (
              <div
                key={lead.id}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <div>
                  {/* Card Header: Avatar, Name, Email, Project Health Assessment Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={avatar}
                        alt={lead.name}
                        className="w-12 h-12 rounded-xl object-cover ring-2 ring-purple-100 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-sm font-bold text-slate-900 truncate">
                            {lead.name}
                          </h3>
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                          {lead.email}
                        </p>
                        {lead.batch && (
                          <span className="inline-block mt-1 text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                            Batch {lead.batch}{lead.subbatch ? ` · ${lead.subbatch}` : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Overall Project Health Assessment Badge */}
                    <div className="text-right shrink-0">
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border uppercase tracking-wider ${
                            leadMeta.badge
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${leadMeta.dot}`} />
                          <span>{lead.health_label || leadMeta.label}</span>
                        </span>
                        <div className="text-[11px] font-bold text-slate-700">
                          Health Score: <span className="font-extrabold text-slate-900">{lead.health_score !== null ? `${lead.health_score}/100` : '—'}</span>
                        </div>
                        <div className="text-[10px] font-medium text-slate-400">
                          Risk: <strong className={leadMeta.riskText}>{lead.risk_level || 'N/A'}</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* High-level Task & Health Overview Strip */}
                  <div className="grid grid-cols-4 gap-1.5 mt-4 p-2 rounded-xl bg-slate-50/80 border border-slate-100 text-center">
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        {lead.project_count || 0}
                      </div>
                      <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">
                        Projects
                      </div>
                    </div>
                    <div>
                      <div className={`text-xs font-bold ${(lead.total_project_sp > 0 ? (lead.overdue_project_sp || 0) : (lead.overdue_project_tasks || 0)) > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                        {lead.total_project_sp > 0 ? `${lead.overdue_project_sp || 0} SP` : (lead.overdue_project_tasks || 0)}
                      </div>
                      <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">
                        Overdue
                      </div>
                    </div>
                    <div>
                      <div className={`text-xs font-bold ${(lead.total_project_sp > 0 ? (lead.blocked_project_sp || 0) : (lead.blocked_project_tasks || 0)) > 0 ? 'text-amber-600' : 'text-slate-700'}`}>
                        {lead.total_project_sp > 0 ? `${lead.blocked_project_sp || 0} SP` : (lead.blocked_project_tasks || 0)}
                      </div>
                      <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">
                        Blocked
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-emerald-700">
                        {lead.project_sp_progress !== null && lead.project_sp_progress !== undefined
                          ? `${lead.project_sp_progress}%`
                          : `${lead.project_completion_rate || 0}%`}
                      </div>
                      <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">
                        Done
                      </div>
                    </div>
                  </div>

                  {/* Execution Progress Bar */}
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-medium text-slate-600">
                      <span>Delivery Progress:</span>
                      <span className="font-bold text-slate-900">
                        {lead.total_project_sp > 0 ? (
                          <>{lead.completed_project_sp}/{lead.total_project_sp} SP ({lead.project_sp_progress ?? lead.project_completion_rate}%)</>
                        ) : (
                          <>{lead.completed_project_tasks || 0} / {lead.total_project_tasks || 0} done ({lead.project_completion_rate || 0}%)</>
                        )}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          (lead.project_sp_progress ?? lead.project_completion_rate) >= 75
                            ? 'bg-emerald-600'
                            : (lead.project_sp_progress ?? lead.project_completion_rate) >= 40
                            ? 'bg-purple-600'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, lead.project_sp_progress ?? lead.project_completion_rate ?? 0))}%` }}
                      />
                    </div>
                  </div>

                  {/* ── ASSIGNED PROJECTS BREAKDOWN ────────────────────────── */}
                  <div className="mt-4 pt-3.5 border-t border-slate-100 space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <FolderKanban className="w-3.5 h-3.5 text-purple-600" />
                        <span>Assigned Projects ({lead.projects?.length || 0})</span>
                      </span>
                    </div>

                    {lead.projects && lead.projects.length > 0 ? (
                      <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
                        {lead.projects.map((proj) => {
                          const projMeta = getHealthMeta(proj.health);
                          const isProjNotAssessed =
                            proj.health === 'NOT_ASSESSED' ||
                            proj.health === 'INSUFFICIENT_DATA' ||
                            !proj.has_estimated_work ||
                            proj.health_score === null ||
                            proj.health_score === undefined;

                          return (
                            <div
                              key={proj.id}
                              className="p-3 rounded-xl bg-slate-50/90 border border-slate-200/80 hover:border-purple-300 transition-all space-y-2"
                            >
                              {/* Top Line: Project Name + Schedule/Risk Indicators + Health Details Button */}
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-slate-800 text-xs truncate">
                                      {proj.name}
                                    </span>
                                    {proj.status && (
                                      <span className="text-[9px] font-semibold text-slate-500 bg-slate-200/70 px-1.5 py-0.2 rounded uppercase">
                                        {proj.status}
                                      </span>
                                    )}
                                  </div>

                                  {/* Schedule & Risk Context (Health score badge removed beside project name) */}
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[10px]">
                                    <span className="text-slate-400 text-[10px]">
                                      Risk: <strong className={projMeta.riskText}>{proj.risk_level || 'N/A'}</strong>
                                    </span>

                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${
                                      proj.schedule_health === 'ON_TRACK' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                      proj.schedule_health === 'BEHIND' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                      proj.schedule_health === 'AHEAD' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                      'bg-slate-100 text-slate-500 border-slate-200'
                                    }`}>
                                      {proj.schedule_label || 'On Track'}
                                    </span>

                                    {proj.reasons && proj.reasons.length > 0 && (
                                      <span className="text-slate-400 truncate max-w-[200px]" title={proj.reasons[0]}>
                                        · {proj.reasons[0]}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* View Health Details Action Button */}
                                <button
                                  type="button"
                                  onClick={() => setSelectedProjectForHealth({ ...proj, leadName: lead.name })}
                                  className="px-2 py-1 rounded-lg bg-white border border-purple-200 text-purple-700 hover:bg-purple-50 text-[10px] font-bold shrink-0 transition-colors cursor-pointer shadow-2xs flex items-center gap-1 group/btn"
                                  title="View complete health metrics and recommendations"
                                >
                                  <span>Health Details</span>
                                  <ChevronRight className="w-3 h-3 group-hover/btn:translate-x-0.5 transition-transform" />
                                </button>
                              </div>

                              {/* Health Score & Classification + Proportional Health Progress Bar */}
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[10px] font-medium text-slate-600">
                                  <span>
                                    {proj.has_estimated_work && (proj.total_sp > 0 || proj.total_points > 0) ? (
                                      <>Delivery: {proj.completed_sp ?? proj.completed_points}/{proj.total_sp ?? proj.total_points} SP</>
                                    ) : (
                                      <>Delivery: {proj.completed_tasks}/{proj.total_tasks} tasks</>
                                    )}
                                  </span>
                                  <span className={`font-bold ${isProjNotAssessed ? 'text-slate-500' : projMeta.text}`}>
                                    {isProjNotAssessed ? 'Not Assessed' : `${proj.health_score}% · ${proj.health_label || projMeta.label}`}
                                  </span>
                                </div>
                                <div className="w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${isProjNotAssessed ? 'bg-slate-300' : projMeta.bar}`}
                                    style={{
                                      width: `${isProjNotAssessed ? 0 : Math.min(100, Math.max(0, proj.health_score))}%`
                                    }}
                                  />
                                </div>
                              </div>

                              {/* Compact Metric Signals: Overdue & Blocked counts & Tasks done */}
                              <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-200/50">
                                <div className="flex items-center gap-2">
                                  <span className={`font-semibold ${(proj.overdue_sp || proj.overdue_tasks || 0) > 0 ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>
                                    {proj.total_sp > 0
                                      ? `${proj.overdue_sp || 0}/${proj.total_sp} SP overdue`
                                      : (proj.overdue_tasks || 0) > 0 ? `${proj.overdue_tasks} overdue` : '0 overdue'}
                                  </span>
                                  <span className="text-slate-300">·</span>
                                  <span className={`font-semibold ${(proj.blocked_sp || proj.blocked_tasks || 0) > 0 ? 'text-amber-600 font-bold' : 'text-slate-400'}`}>
                                    {proj.total_sp > 0
                                      ? `${proj.blocked_sp || 0}/${proj.total_sp} SP blocked`
                                      : (proj.blocked_tasks || 0) > 0 ? `${proj.blocked_tasks} blocked` : '0 blocked'}
                                  </span>
                                </div>
                                <span className="text-slate-500 font-medium text-[10px]">
                                  {proj.total_sp > 0 ? `${proj.remaining_sp ?? 0} SP remaining` : `${proj.completed_tasks}/${proj.total_tasks} tasks`}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-400">
                        No projects actively assigned as Tech Lead yet.
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer with action */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-slate-400">
                    Direct Tasks: <strong className="text-slate-700">{lead.direct_completed_tasks || 0}/{lead.direct_assigned_tasks || 0}</strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── HEALTH DETAILS MODAL ────────────────────────────────────────── */}
      {selectedProjectForHealth && (
        <ProjectHealthDetailsModal
          project={selectedProjectForHealth}
          leadName={selectedProjectForHealth.leadName}
          onClose={() => setSelectedProjectForHealth(null)}
          onSelectProject={onSelectProject}
        />
      )}
    </div>
  );
}
