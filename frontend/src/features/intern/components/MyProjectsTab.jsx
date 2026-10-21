import React, { useState, useEffect } from 'react';
import { 
  FolderKanban, 
  Calendar, 
  Clock, 
  Users, 
  ArrowRight, 
  CheckCircle2, 
  FileText, 
  ExternalLink,
  ShieldCheck,
  Activity,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { projectsService } from '../services/projectsService';

export default function MyProjectsTab({ onSelectProject }) {
  const [myProjects, setMyProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await projectsService.getMyProjects();
      setMyProjects(data);
    } catch (err) {
      setError(err?.message || 'Failed to load assigned projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchProjects();
  }, []);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'PLANNED':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'COMPLETED':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'ARCHIVED':
        return 'bg-slate-100 text-slate-600 border-slate-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FolderKanban className="w-4 h-4 text-purple-600" />
            <span>My Projects</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Projects you are assigned to as an active contributor or collaborator
          </p>
        </div>
        <span className="text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-3 py-1 rounded-full w-fit">
          {myProjects.length} Active {myProjects.length === 1 ? 'Membership' : 'Memberships'}
        </span>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-slate-200 text-slate-500">
          <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-3" />
          <p className="text-sm font-medium">Loading your projects...</p>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex items-center justify-between p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => { void fetchProjects(); }}
            className="px-3 py-1 bg-white border border-rose-200 hover:bg-rose-100 rounded-lg text-rose-700 font-semibold"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && myProjects.length === 0 && (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-slate-200 text-center">
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-3">
            <FolderKanban className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">No Projects Assigned</h3>
          <p className="text-xs text-slate-500 max-w-sm mt-1">
            You are not currently enrolled as an active member in any workspace projects. Contact your Tech Lead or Manager for project assignment.
          </p>
        </div>
      )}

      {/* Projects Grid */}
      {!loading && !error && myProjects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {myProjects.map((p) => (
            <div
              key={p.id}
              className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card hover:border-purple-300 hover:shadow-card-hover transition-all flex flex-col justify-between"
            >
              <div className="space-y-4">
                {/* Top Row: Code, Status, Lead */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-slate-400">
                        {p.code}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${getStatusBadge(
                          p.status
                        )}`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mt-1">
                      {p.name}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 p-1.5 rounded-xl">
                    <img
                      src={p.lead.avatar}
                      alt={p.lead.name}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                    <div className="text-right pr-1">
                      <span className="text-[10px] font-bold text-slate-800 block leading-tight">
                        {p.lead.name}
                      </span>
                      <span className="text-[9px] text-slate-400 block leading-none">
                        {p.lead.role}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                  {p.description}
                </p>

                {/* Dates & Members */}
                <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
                  <span className="flex items-center gap-1.5 text-[11px]">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {p.startDate} - {p.endDate}
                  </span>

                  <div className="flex items-center -space-x-1.5">
                    {p.members.map((m) => (
                      <img
                        key={m.id}
                        src={m.avatar}
                        alt={m.name}
                        title={m.name}
                        className="w-5 h-5 rounded-full border border-white object-cover"
                      />
                    ))}
                    <span className="text-[10px] font-bold text-slate-500 pl-2">
                      {p.members.length} {p.members.length === 1 ? 'member' : 'members'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Button: Opens existing project details interface */}
              <div className="pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => onSelectProject?.(p.id)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs transition-all active:scale-[0.99] cursor-pointer"
                >
                  <span>Open Project Workspace</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
