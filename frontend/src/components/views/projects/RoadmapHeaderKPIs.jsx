import React, { memo } from 'react';
import { RefreshCw } from 'lucide-react';

export const RoadmapHeaderKPIs = memo(function RoadmapHeaderKPIs({
  project,
  isKanban,
  refreshing,
  metrics,
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Project Context */}
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
              isKanban
                ? 'text-indigo-700 bg-indigo-50 border-indigo-200/80'
                : 'text-purple-700 bg-purple-50 border-purple-200/80'
            }`}>
              {isKanban ? 'Kanban Deliverables Roadmap' : 'Scrum Deliverables Roadmap'}
            </span>

            <span className="text-slate-300">•</span>
            <span className="text-xs text-slate-500 font-medium">
              Methodology: <strong className={isKanban ? 'text-indigo-700 font-semibold' : 'text-purple-700 font-semibold'}>{isKanban ? 'Kanban (Flow)' : 'Scrum (Sprints)'}</strong>
            </span>
          </div>

          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span>{project?.name || 'Project Roadmap'}</span>
            {refreshing && (
              <RefreshCw className="w-3.5 h-3.5 text-purple-600 animate-spin" />
            )}
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
            Deliverable-based Gantt roadmap. Visualize project deliverables, Epics, Stories, and Bugs mapped across calendar milestones with synchronized progress and duration bars.
          </p>
        </div>

        {/* Right: Data-Driven Summary KPI Blocks */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
          {/* Total Deliverables */}
          <div className="px-3.5 py-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80 text-center min-w-[105px]">
            <span className="text-lg font-extrabold text-slate-800">
              {metrics.total}
            </span>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
              Deliverables
            </div>
            {metrics.totalPoints > 0 && (
              <div className="text-[9px] font-medium text-slate-500 mt-0.5">
                {metrics.totalPoints} Story Pts
              </div>
            )}
          </div>

          {/* Completed */}
          <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/70 text-center min-w-[105px]">
            <span className="text-lg font-extrabold text-emerald-700">
              {metrics.completed}
            </span>
            <div className="text-[10px] font-bold text-emerald-900/60 uppercase tracking-wider mt-0.5">
              Completed
            </div>
            <div className="text-[9px] font-semibold text-emerald-600 mt-0.5">
              {metrics.deliveryRate}% done
            </div>
          </div>

          {/* In Progress */}
          <div className={`px-3.5 py-2.5 rounded-xl border text-center min-w-[105px] ${
            isKanban
              ? 'bg-indigo-50/70 border-indigo-200/70 text-indigo-700'
              : 'bg-purple-50/70 border-purple-200/70 text-purple-700'
          }`}>
            <span className="text-lg font-extrabold">
              {metrics.inProgress}
            </span>
            <div className="text-[10px] font-bold opacity-75 uppercase tracking-wider mt-0.5">
              In Progress
            </div>
            <div className="text-[9px] font-semibold opacity-75 mt-0.5">
              Active flow
            </div>
          </div>

          {/* Overdue / At Risk */}
          <div className={`px-3.5 py-2.5 rounded-xl border text-center min-w-[105px] ${
            metrics.overdueOrAtRisk > 0 
              ? 'bg-rose-50/80 border-rose-200 text-rose-700'
              : 'bg-slate-50/90 border-slate-200/80 text-slate-600'
          }`}>
            <span className="text-lg font-extrabold">
              {metrics.overdueOrAtRisk}
            </span>
            <div className="text-[10px] font-bold opacity-75 uppercase tracking-wider mt-0.5">
              Overdue / At Risk
            </div>
            <div className="text-[9px] font-medium opacity-75 mt-0.5">
              {metrics.overdueOrAtRisk > 0 ? 'Requires attention' : 'On schedule'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

