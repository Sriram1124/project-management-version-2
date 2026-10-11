import React from 'react';
import { ArrowUpRight } from 'lucide-react';

export default function ProjectHealth({ projects, onViewAll }) {
  const getStatusBadge = (status, type) => {
    switch (type) {
      case 'success':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200/70">
            {status}
          </span>
        );
      case 'warning':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-600 border border-amber-200/70">
            {status}
          </span>
        );
      case 'danger':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-600 border border-rose-200/70">
            {status}
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
            {status}
          </span>
        );
    }
  };

  const getProgressBarColor = (type, progress = 0) => {
    if (progress === 100) return 'bg-emerald-500';
    switch (type) {
      case 'success':
        return 'bg-emerald-500';
      case 'warning':
        return 'bg-amber-500';
      case 'danger':
        return 'bg-rose-500';
      default:
        return 'bg-purple-600';
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            Project Health
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            High-level progress and exceptions per active project
          </p>
        </div>
        <button
          onClick={onViewAll}
          className="text-xs font-semibold text-purple-600 hover:text-purple-700 flex items-center gap-1 transition-colors"
        >
          <span>View All Projects</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Projects List */}
      <div className="mt-5 space-y-4">
        {(!projects || projects.length === 0) ? (
          <div className="p-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
            No projects available yet. Create a project in the Projects Directory.
          </div>
        ) : (
          projects.map((proj) => (
          <div
            key={proj.id}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl hover:bg-slate-50/80 border border-transparent hover:border-slate-200/70 transition-all"
          >
            {/* Left: Project title & metadata */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800 hover:text-purple-700 transition-colors">
                  {proj.name}
                </span>
                <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-emerald-50 text-emerald-600 border border-emerald-200">
                  Active
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium">
                Lead: <span className="text-slate-600 font-semibold">{proj.lead}</span> • Section: {proj.section} • Interns: {proj.internsCount}
              </div>
            </div>

            {/* Right: Progress bar & status pill */}
            <div className="flex items-center gap-4 min-w-[240px] justify-between sm:justify-end">
              <div className="flex items-center gap-3 flex-1 max-w-[180px]">
                <span className="text-[10px] font-semibold text-slate-400 shrink-0">
                  Progress
                </span>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${getProgressBarColor(proj.statusType, proj.progress)}`}
                    style={{ width: `${proj.progress}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-700 shrink-0 w-8 text-right">
                  {proj.progress}%
                </span>
              </div>

              <div className="shrink-0">
                {getStatusBadge(proj.status, proj.statusType)}
              </div>
            </div>
          </div>
        )))}
      </div>
    </div>
  );
}

