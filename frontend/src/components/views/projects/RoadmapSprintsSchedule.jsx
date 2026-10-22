import React, { memo } from 'react';
import { FolderKanban, Edit3, ExternalLink } from 'lucide-react';
import { formatShortDate } from './roadmapUtils';

export const RoadmapSprintsSchedule = memo(function RoadmapSprintsSchedule({
  sprints,
  isKanban,
  timeColumns,
  todayPositionPercent,
  timelineStartMs,
  totalDurationMs,
  readOnly,
  onSelectSprintDetails,
  onEditSprint,
  onOpenSprintBoard,
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
      <div className="p-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderKanban className="w-4 h-4 text-purple-600" />
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            {isKanban ? 'Planning Cycles Schedule' : 'Sprint Planning Iterations Schedule'}
          </h3>
        </div>
        <span className="text-[11px] text-slate-500">
          {sprints.length} {isKanban ? 'cycles configured' : 'sprints configured'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[840px] w-full">
          {/* Weekly Header for Cycles */}
          <div className="border-b border-slate-200 bg-slate-50/90 text-xs font-bold text-slate-700">
            <div 
              className="grid divide-x divide-slate-100"
              style={{ gridTemplateColumns: `repeat(${timeColumns.length}, minmax(130px, 1fr))` }}
            >
              {timeColumns.map((col) => (
                <div
                  key={col.id}
                  className={`py-3 px-2 text-center transition-colors ${
                    col.isActive ? 'bg-purple-50/80 border-t-2 border-t-purple-600' : 'bg-slate-50/40'
                  }`}
                >
                  <span className={`text-xs font-bold block ${col.isActive ? 'text-purple-800 font-extrabold' : 'text-slate-800'}`}>
                    {col.title}
                  </span>
                  <div className="text-[10px] text-slate-400 mt-0.5 font-normal truncate px-1">
                    {col.subtitle}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sprints Gantt Rows */}
          <div className="relative divide-y divide-slate-100 text-xs">
            {todayPositionPercent !== null && (
              <div
                className="absolute top-0 bottom-0 z-20 pointer-events-none"
                style={{ left: `${todayPositionPercent}%` }}
              >
                <div className="w-0.5 h-full bg-purple-500/80 shadow-xs relative">
                  <div className="absolute -top-3 -left-3.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-600 text-white shadow-xs">
                    Today
                  </div>
                </div>
              </div>
            )}

            {sprints.filter((s) => s.start_date && s.end_date).map((sprint) => {
              const sStart = Date.parse(sprint.start_date);
              const sEnd = Date.parse(sprint.end_date);
              const leftPercent = Math.max(0, Math.min(95, ((sStart - timelineStartMs) / totalDurationMs) * 100));
              const calculatedWidth = Math.max(8, ((Math.max(sEnd, sStart + 86400000) - sStart) / totalDurationMs) * 100);
              const widthPercent = Math.min(100 - leftPercent, calculatedWidth);

              const startFormatted = formatShortDate(sStart);
              const endFormatted = formatShortDate(sEnd);
              const dateDisplay = `${startFormatted} – ${endFormatted}`;

              const isActive = sprint.status === 'ACTIVE';
              const isCompleted = sprint.status === 'COMPLETED';

              return (
                <div 
                  key={sprint.id} 
                  className="relative py-4 px-2 hover:bg-slate-50/40 transition-colors group min-h-[64px] flex items-center"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectSprintDetails(sprint)}
                    onKeyDown={(e) => {
                      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        onSelectSprintDetails(sprint);
                      }
                    }}
                    title={`${sprint.name} (${dateDisplay}) • Click to view sprint details`}
                    style={{
                      marginLeft: `${Math.min(leftPercent, 75)}%`,
                      width: `${Math.max(widthPercent, 18)}%`,
                      minWidth: '260px',
                    }}
                    className={`relative z-10 cursor-pointer h-10 rounded-xl px-2.5 flex items-center justify-between shadow-xs transition-all duration-200 border border-purple-400/30 overflow-hidden group/bar select-none ${
                      isActive
                        ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-200/50 shadow-md ring-2 ring-purple-300'
                        : isCompleted
                        ? 'bg-purple-900/80 hover:bg-purple-900 text-purple-100'
                        : 'bg-purple-500 hover:bg-purple-600 text-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 shrink-0 min-w-0 pr-1 max-w-[130px]">
                      {isActive && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                      )}
                      <span className="font-bold text-xs truncate tracking-tight text-white">
                        {sprint.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                      <span className="font-medium text-white/90 truncate shrink-0 text-[10px]">
                        {dateDisplay}
                      </span>

                      <div className="flex items-center gap-1 shrink-0 ml-1">
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditSprint(sprint);
                            }}
                            title={`Edit ${sprint.name}`}
                            className="p-1 rounded-md bg-black/15 hover:bg-black/30 active:bg-black/40 text-white transition-all cursor-pointer shrink-0"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenSprintBoard?.(sprint.id);
                          }}
                          title={`Open ${sprint.name} board`}
                          className="p-1 rounded-md bg-black/15 hover:bg-black/30 active:bg-black/40 text-white transition-all cursor-pointer shrink-0"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {sprints.filter((s) => s.start_date && s.end_date).length === 0 && (
              <div className="p-10 text-center text-slate-400">
                <p className="text-xs font-semibold text-slate-700">No scheduled iterations found</p>
                <p className="text-[11px] text-slate-400 mt-1">Configure start and end dates to display iterations on the timeline</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

