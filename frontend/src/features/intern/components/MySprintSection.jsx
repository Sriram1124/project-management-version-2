import React from 'react';
import { 
  Zap, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Lock, 
  ArrowRight,
  TrendingUp,
  Check
} from 'lucide-react';
import { workItemsService } from '../services/workItemsService';

export default function MySprintSection({
  cycleName = 'Sprint 05: Authentication & Access Control',
  cycleDates = 'Active Iteration',
  sprintName,
  sprintDates,
  activeCycle = null,
  workItems = [],
  isKanban = false,
  onTaskClick,
  onToggleTask
}) {
  const Term = isKanban ? 'Cycle' : 'Sprint';
  const term = isKanban ? 'cycle' : 'sprint';

  const effectiveName = activeCycle?.name || sprintName || cycleName;
  const effectiveDates = activeCycle?.start_date && activeCycle?.end_date
    ? `${new Date(activeCycle.start_date).toLocaleDateString([], { month: 'short', day: 'numeric' })} — ${new Date(activeCycle.end_date).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
    : (sprintDates || cycleDates);

  // Filter items in active cycle
  const cycleTasks = workItems.filter(
    (w) => (activeCycle ? w.sprint_id === activeCycle.id : (w.sprint_id || w.project_id === 'PROJ-MAD-2025'))
  );

  const completed = cycleTasks.filter((t) => t.status === 'COMPLETED').length;
  const inProgress = cycleTasks.filter((t) => t.status === 'IN_PROGRESS').length;
  const inReview = cycleTasks.filter((t) => t.status === 'IN_REVIEW').length;
  const todo = cycleTasks.filter((t) => t.status === 'TODO').length;
  const blocked = cycleTasks.filter((t) => t.status === 'BLOCKED').length;
  const overdue = cycleTasks.filter((t) => workItemsService.isOverdue(t)).length;

  const total = cycleTasks.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
              <Zap className="w-3 h-3 fill-purple-600" /> Active {Term}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {effectiveName.split(':')[0] || Term}
            </span>
          </div>
          <h3 className="text-base font-bold text-slate-900 mt-1">
            {effectiveName}
          </h3>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>{effectiveDates}</span>
            <span>•</span>
            <span className="font-semibold text-purple-700">
              Your {Term} Contribution: {total} Assigned Tasks
            </span>
          </div>
        </div>

        {/* Cycle Personal Progress Bar */}
        <div className="sm:text-right min-w-[180px]">
          <div className="flex items-center justify-between sm:justify-end gap-2 text-xs">
            <span className="text-[11px] font-bold text-slate-500">
              My Velocity
            </span>
            <span className="text-sm font-extrabold text-purple-700">
              {percentage}%
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 mt-1.5 overflow-hidden">
            <div
              className="bg-purple-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-400 block mt-1">
            {completed} of {total} {term} items delivered
          </span>
        </div>
      </div>

      {/* 5 Status Breakdown Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center">
        <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
          <span className="text-[10px] font-bold text-slate-400 uppercase block">
            To Do
          </span>
          <span className="text-base font-extrabold text-slate-800">{todo}</span>
        </div>

        <div className="p-2.5 bg-purple-50/60 rounded-xl border border-purple-100">
          <span className="text-[10px] font-bold text-purple-600 uppercase block">
            In Progress
          </span>
          <span className="text-base font-extrabold text-purple-700">
            {inProgress + inReview}
          </span>
        </div>

        <div className="p-2.5 bg-emerald-50/60 rounded-xl border border-emerald-100">
          <span className="text-[10px] font-bold text-emerald-600 uppercase block">
            Done
          </span>
          <span className="text-base font-extrabold text-emerald-700">
            {completed}
          </span>
        </div>

        <div className="p-2.5 bg-rose-50/60 rounded-xl border border-rose-100">
          <span className="text-[10px] font-bold text-rose-600 uppercase block">
            Blocked
          </span>
          <span className="text-base font-extrabold text-rose-700">{blocked}</span>
        </div>

        <div className="p-2.5 bg-amber-50/60 rounded-xl border border-amber-100">
          <span className="text-[10px] font-bold text-amber-600 uppercase block">
            Overdue
          </span>
          <span className="text-base font-extrabold text-amber-700">{overdue}</span>
        </div>
      </div>

      {/* Intern's Cycle Tickets List */}
      <div className="space-y-2 pt-1">
        <h4 className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
          My {Term} Work Items ({cycleTasks.length})
        </h4>

        {cycleTasks.map((t) => {
          const isOverdue = workItemsService.isOverdue(t);
          const isDone = t.status === 'COMPLETED';

          return (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={() => onTaskClick?.(t)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onTaskClick?.(t);
                }
              }}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                isDone
                  ? 'bg-emerald-50/40 border-emerald-200/60 opacity-80'
                  : t.status === 'BLOCKED'
                  ? 'bg-rose-50/30 border-rose-200'
                  : 'bg-white border-slate-200 hover:border-purple-300'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleTask?.(t.id);
                  }}
                  className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
                    isDone
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'border-slate-300 hover:border-purple-500 bg-white'
                  }`}
                >
                  {isDone && <Check className="w-3 h-3 stroke-[3]" />}
                </button>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-bold text-slate-400">
                      {t.id}
                    </span>
                    <h5
                      className={`text-xs font-bold truncate ${
                        isDone ? 'text-slate-500' : 'text-slate-800'
                      }`}
                    >
                      {t.title}
                    </h5>
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Due {new Date(t.due_date).toLocaleDateString()}
                    {isOverdue && (
                      <span className="text-rose-600 font-bold ml-1">
                        (Overdue)
                      </span>
                    )}
                  </span>
                </div>
              </div>

              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                  isDone
                    ? 'bg-emerald-100 text-emerald-800'
                    : t.status === 'BLOCKED'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-purple-100 text-purple-800'
                }`}
              >
                {t.status.replace('_', ' ')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

