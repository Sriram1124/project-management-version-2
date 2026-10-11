import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, 
  Users, 
  FolderKanban, 
  Loader2, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  TrendingUp, 
  Search, 
  Filter, 
  Target,
  Layers,
  ChevronDown,
  X
} from 'lucide-react';
import { projectsService } from '../../services/projects.service';

export default function TechLeadsView({ onRebalanceLead }) {
  const [techLeads, setTechLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'HIGH_PERFORMER' | 'AT_RISK'

  useEffect(() => {
    loadTechLeads();
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

  // Filtered tech leads based on search & rating filter
  const filteredTechLeads = useMemo(() => {
    return techLeads.filter((lead) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (lead.name || '').toLowerCase().includes(q);
        const matchEmail = (lead.email || '').toLowerCase().includes(q);
        const matchProjects = (lead.projects || []).some((p) => p.name.toLowerCase().includes(q));
        if (!matchName && !matchEmail && !matchProjects) return false;
      }

      if (statusFilter === 'HIGH_PERFORMER') {
        if ((lead.performance_score || 0) < 70) return false;
      } else if (statusFilter === 'AT_RISK') {
        if ((lead.performance_score || 0) >= 50 || (lead.total_project_tasks || 0) === 0) return false;
      } else if (statusFilter === 'ACTIVE_PROJECTS') {
        if (!lead.project_count || lead.project_count === 0) return false;
      }

      return true;
    });
  }, [techLeads, searchQuery, statusFilter]);

  // Overall metric counters
  const totalLeadsCount = techLeads.length;
  const totalOverseenProjects = techLeads.reduce((acc, l) => acc + (l.project_count || 0), 0);
  const totalOverseenTasks = techLeads.reduce((acc, l) => acc + (l.total_project_tasks || 0), 0);
  const totalCompletedTasks = techLeads.reduce((acc, l) => acc + (l.completed_project_tasks || 0), 0);
  const avgPerformance = totalLeadsCount > 0
    ? Math.round(techLeads.reduce((acc, l) => acc + (l.performance_score || 0), 0) / totalLeadsCount)
    : 0;

  return (
    <div className="space-y-6">
      {/* ── HEADER & OVERVIEW METRICS ────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Tech Leads & Oversight</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Supervise project lead assignments, total project task execution, and real-time performance
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
            <span>{totalCompletedTasks}/{totalOverseenTasks} Tasks Completed</span>
          </div>
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
              { id: 'ACTIVE_PROJECTS', label: 'With Projects' },
              { id: 'HIGH_PERFORMER', label: 'Top Performers (≥70%)' },
              { id: 'AT_RISK', label: 'Needs Attention (<50%)' },
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
          onClick={loadTechLeads}
          className="text-xs font-semibold text-purple-700 hover:text-purple-800 hover:underline shrink-0 cursor-pointer self-end sm:self-auto"
        >
          Refresh Data
        </button>
      </div>

      {/* ── TECH LEADS GRID / CARDS ────────────────────────────────────────── */}
      {loading ? (
        <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <Loader2 className="w-6 h-6 text-purple-600 animate-spin" />
          <span className="text-xs font-semibold text-slate-600">Loading assigned Tech Leads & project metrics...</span>
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

            return (
              <div
                key={lead.id}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <div>
                  {/* Card Header: Avatar, Name, Email, Performance Badge */}
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

                    {/* Performance Rating Badge */}
                    <div className="text-right shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border uppercase tracking-wider ${
                          lead.performance_color || 'text-purple-700 bg-purple-50 border-purple-200'
                        }`}
                      >
                        <TrendingUp className="w-3 h-3" />
                        <span>{lead.performance_label}</span>
                      </span>
                      <div className="text-[10px] font-bold text-slate-400 mt-1">
                        Score: <span className="text-slate-800 font-extrabold">{lead.performance_score}%</span>
                      </div>
                    </div>
                  </div>

                  {/* High-level Task & Performance Overview Strip */}
                  <div className="grid grid-cols-3 gap-2 mt-4 p-2.5 rounded-xl bg-slate-50/80 border border-slate-100 text-center">
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        {lead.project_count || 0}
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">
                        {lead.project_count === 1 ? 'Project' : 'Projects'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-purple-700">
                        {lead.total_project_tasks || 0}
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">
                        Total Tasks
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-emerald-700">
                        {lead.project_completion_rate || 0}%
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">
                        Completed
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar of Total Project Tasks */}
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-medium text-slate-600">
                      <span>Execution Progress:</span>
                      <span className="font-bold text-slate-900">
                        {lead.completed_project_tasks || 0} / {lead.total_project_tasks || 0} done
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          lead.project_completion_rate >= 75
                            ? 'bg-emerald-600'
                            : lead.project_completion_rate >= 40
                            ? 'bg-purple-600'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, lead.project_completion_rate || 0))}%` }}
                      />
                    </div>
                  </div>

                  {/* ── ASSIGNED PROJECTS BREAKDOWN ────────────────────────── */}
                  <div className="mt-4 pt-3.5 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <FolderKanban className="w-3.5 h-3.5 text-purple-600" />
                        <span>Assigned Projects ({lead.projects?.length || 0})</span>
                      </span>
                    </div>

                    {lead.projects && lead.projects.length > 0 ? (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {lead.projects.map((proj) => (
                          <div
                            key={proj.id}
                            className="p-2 rounded-lg bg-slate-50 border border-slate-200/70 hover:bg-purple-50/40 transition-colors flex items-center justify-between text-xs"
                          >
                            <div className="min-w-0 flex-1 mr-2">
                              <span className="font-semibold text-slate-800 truncate block text-[11px]">
                                {proj.name}
                              </span>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                                <span>{proj.completed_tasks}/{proj.total_tasks} tasks</span>
                                {proj.total_points > 0 && (
                                  <span>· {proj.completed_points}/{proj.total_points} SP</span>
                                )}
                              </div>
                            </div>

                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                                proj.completion_rate >= 80
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : proj.completion_rate >= 40
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {proj.completion_rate}%
                            </span>
                          </div>
                        ))}
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
    </div>
  );
}
