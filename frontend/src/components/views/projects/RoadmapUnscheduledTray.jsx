import React, { memo } from 'react';
import { ChevronDown, Calendar, Layers } from 'lucide-react';

export const RoadmapUnscheduledTray = memo(function RoadmapUnscheduledTray({
  unscheduledRows,
  showUnscheduled,
  onToggleShow,
  onSelectTask,
  readOnly,
  typeConfig,
  statusConfig,
}) {
  if (unscheduledRows.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <h3 className="text-sm font-bold text-slate-900 tracking-tight">
            Unscheduled Deliverables
          </h3>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200/80">
            {unscheduledRows.length} {unscheduledRows.length === 1 ? 'item' : 'items'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <p className="text-xs text-slate-400 hidden sm:block">
            Dates not set. Assign start and due dates to plot deliverables on the roadmap timeline.
          </p>
          <button
            type="button"
            onClick={onToggleShow}
            className="text-xs font-semibold text-purple-700 hover:text-purple-800 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <span>{showUnscheduled ? 'Hide' : 'Show'}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showUnscheduled ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {showUnscheduled && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
          {unscheduledRows.map((row) => {
            const item = row.item;
            const typeMeta = typeConfig[item.type] || typeConfig.TASK;
            const statusMeta = statusConfig[item.status] || statusConfig.TODO;
            const Icon = typeMeta.icon;
            const primaryAssignee = item.assignees?.[0] || item.assignee;

            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectTask(item)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onSelectTask(item);
                  }
                }}
                className="p-3 rounded-xl border border-dashed border-slate-300 hover:border-purple-400 bg-slate-50/50 hover:bg-purple-50/20 transition-all flex flex-col justify-between gap-2.5 cursor-pointer group"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`p-1 rounded-md border shrink-0 ${typeMeta.color}`}>
                        <Icon className="w-3 h-3" />
                      </span>
                      <span className="font-bold text-xs text-slate-900 truncate group-hover:text-purple-700 transition-colors">
                        {item.title}
                      </span>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border shrink-0 ${statusMeta.badgeClass}`}>
                      {statusMeta.label}
                    </span>
                  </div>

                  {item.description && (
                    <p className="text-[11px] text-slate-500 line-clamp-1">
                      {item.description}
                    </p>
                  )}

                  {/* Parent Epic / Hierarchy indicator */}
                  {row.parentEpicId && (
                    <div className="flex items-center gap-1 text-[10px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 w-fit">
                      <Layers className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate max-w-[140px] font-medium">
                        {item.parent?.title || 'Parent Epic'}
                      </span>
                    </div>
                  )}
                  {row.isEpic && (
                    <div className="flex items-center gap-1 text-[10px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 w-fit font-semibold">
                      <Layers className="w-2.5 h-2.5 shrink-0" />
                      <span>Epic ({row.childCount} {row.childCount === 1 ? 'child' : 'children'})</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-[11px]">
                  <div className="flex items-center gap-2">
                    {primaryAssignee ? (
                      <span className="text-slate-600 font-medium truncate max-w-[100px]">
                        {primaryAssignee.name || primaryAssignee.email}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">Unassigned</span>
                    )}
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-500 font-mono font-medium">{item.story_points ?? 0} SP</span>
                  </div>

                  {!readOnly && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTask(item);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-purple-50 border border-slate-200 hover:border-purple-300 text-purple-700 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                    >
                      <Calendar className="w-3 h-3 text-purple-600" />
                      <span>Set Dates</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

