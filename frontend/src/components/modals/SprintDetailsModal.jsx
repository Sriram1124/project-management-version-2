import React from 'react';
import { 
  X, 
  Calendar, 
  Target, 
  Layers, 
  CheckCircle2, 
  Clock, 
  Edit3, 
  ExternalLink, 
  ArrowRight 
} from 'lucide-react';

export default function SprintDetailsModal({
  isOpen,
  onClose,
  sprint,
  allSprints = [],
  isKanban = false,
  onEdit,
  onOpenSprintBoard,
}) {
  if (!isOpen || !sprint) return null;

  const Term = isKanban ? 'Cycle' : 'Sprint';
  const term = isKanban ? 'cycle' : 'sprint';

  const isActive = sprint.status === 'ACTIVE';
  const isCompleted = sprint.status === 'COMPLETED';
  const activeSprint = allSprints.find((s) => s.status === 'ACTIVE');

  const startDateFormatted = sprint.start_date
    ? new Date(sprint.start_date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Not set';

  const endDateFormatted = sprint.end_date
    ? new Date(sprint.end_date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Not set';

  // Calculate duration in days if both dates set
  let durationDays = null;
  if (sprint.start_date && sprint.end_date) {
    const start = new Date(sprint.start_date);
    const end = new Date(sprint.end_date);
    const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diff > 0) durationDays = diff;
  }

  const statusLabel = isActive
    ? `Active ${Term}`
    : isCompleted
    ? 'Completed'
    : sprint.status === 'CANCELLED'
    ? 'Cancelled'
    : 'Planned';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-xs ${
              isActive
                ? 'bg-purple-600 text-white'
                : isCompleted
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-purple-100 text-purple-700'
            }`}>
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  {sprint.name}
                </h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : isCompleted
                    ? 'bg-slate-100 text-slate-700 border-slate-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                }`}>
                  {statusLabel}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Iteration Schedule & Overview
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          {/* Timeline & Duration Card */}
          <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Calendar className="w-4 h-4 text-purple-600 shrink-0" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-purple-900/60">
                  Schedule Window
                </div>
                <div className="text-xs font-semibold text-slate-800 mt-0.5">
                  {startDateFormatted} &ndash; {endDateFormatted}
                </div>
              </div>
            </div>
            {durationDays !== null && (
              <span className="px-2.5 py-1 rounded-lg bg-white border border-purple-200/80 text-[11px] font-bold text-purple-700 shadow-2xs">
                {durationDays} {durationDays === 1 ? 'day' : 'days'}
              </span>
            )}
          </div>

          {/* Goal Section */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
              <Target className="w-3.5 h-3.5 text-purple-600" />
              <span>{Term} Goal</span>
            </div>
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs text-slate-700 leading-relaxed min-h-[50px]">
              {sprint.goal ? (
                <span>{sprint.goal}</span>
              ) : (
                <span className="text-slate-400 italic">No specific goal configured for this {term}.</span>
              )}
            </div>
          </div>

          {/* Metrics summary (if present on sprint object) */}
          {(sprint.total_items !== undefined || sprint.total_points !== undefined) && (
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
                <div className="text-sm font-extrabold text-slate-800">
                  {sprint.total_items ?? 0}
                </div>
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Total Items
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
                <div className="text-sm font-extrabold text-emerald-700">
                  {sprint.completed_items ?? 0}
                </div>
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Completed
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
                <div className="text-sm font-extrabold text-purple-700">
                  {sprint.total_points ?? 0}
                </div>
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Story Points
                </div>
              </div>
            </div>
          )}

          {/* Active sprint notice for planned sprints */}
          {!isActive && activeSprint && (
            <div className="p-3 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs flex items-center justify-between">
              <span className="text-slate-500 font-medium">Active {Term} in this Project:</span>
              <span className="font-bold text-purple-700 bg-purple-50 border border-purple-200/80 px-2.5 py-0.5 rounded-md text-[11px]">
                {activeSprint.name}
              </span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onEdit?.(sprint);
            }}
            className="px-3.5 py-2 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit {Term}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenSprintBoard?.(sprint.id);
              }}
              className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>Open {Term} Board</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

