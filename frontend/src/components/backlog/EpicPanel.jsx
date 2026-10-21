import React from 'react';
import { Layers, Plus, ChevronRight, CheckCircle2, User } from 'lucide-react';

export default function EpicPanel({
  epics = [],
  selectedEpicId,
  onSelectEpicId,
  issues = [],
  onCreateEpic,
  onCreateIssueForEpic,
}) {
  return (
    <div className="w-64 bg-white rounded-md border border-slate-200 p-2.5 shrink-0 select-none text-xs flex flex-col space-y-2">
      {/* Panel Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
        <div className="flex items-center gap-1.5 font-bold text-slate-800">
          <Layers className="w-3.5 h-3.5 text-purple-600" />
          <span>Epics</span>
          <span className="text-[10px] font-mono text-slate-400">({epics.length})</span>
        </div>

        <button
          onClick={onCreateEpic}
          className="p-1 rounded text-slate-400 hover:text-purple-700 hover:bg-purple-50 transition-colors"
          title="Create new Epic"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* All Issues / Clear Filter Option */}
      <button
        type="button"
        onClick={() => onSelectEpicId?.(null)}
        className={`w-full text-left px-2 py-1.5 rounded-md font-medium transition-colors flex items-center justify-between ${
          !selectedEpicId
            ? 'bg-purple-50 text-purple-700 font-semibold border border-purple-200'
            : 'text-slate-600 hover:bg-slate-50'
        }`}
      >
        <span>All Issues</span>
        <span className="text-[10px] text-slate-400 font-mono">{issues.length}</span>
      </button>

      {/* Epics List */}
      <div className="space-y-1 overflow-y-auto max-h-[calc(100vh-320px)] pr-0.5">
        {epics.map((epic) => {
          const epicIssues = issues.filter(i => i.epicId === epic.id);
          const completedCount = epicIssues.filter(i => i.status === 'DONE' || i.status === 'COMPLETED').length;
          const epicTotalSp = epicIssues.reduce((acc, i) => acc + (Number(i.story_points || i.storyPoints) || 0), 0);
          const epicCompletedSp = epicIssues
            .filter((i) => i.status === 'DONE' || i.status === 'COMPLETED')
            .reduce((acc, i) => acc + (Number(i.story_points || i.storyPoints) || 0), 0);
          const isSelected = selectedEpicId === epic.id;
          const progressPercent = epicTotalSp > 0
            ? Math.round((epicCompletedSp / epicTotalSp) * 100)
            : epicIssues.length > 0
            ? Math.round((completedCount / epicIssues.length) * 100)
            : epic.progress || 0;

          return (
            <button
              type="button"
              key={epic.id}
              onClick={() => onSelectEpicId?.(isSelected ? null : epic.id)}
              className={`w-full text-left p-2 rounded-md border transition-colors cursor-pointer space-y-1.5 ${
                isSelected
                  ? 'border-purple-400 bg-purple-50/50 shadow-2xs'
                  : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50/70 bg-white'
              }`}
            >
              {/* Top: Epic Key, Color dot, and Title */}
              <div className="flex items-start justify-between gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: epic.color }}
                  />
                  <span className="font-mono text-[10px] text-slate-400 font-semibold">
                    {epic.id}
                  </span>
                </div>

                <span className="text-[10px] font-mono text-slate-400">
                  {epicIssues.length} {epicIssues.length === 1 ? 'issue' : 'issues'}
                </span>
              </div>

              <h4 className="font-medium text-slate-800 text-xs leading-snug line-clamp-2">
                {epic.name}
              </h4>

              {/* Progress Bar & Lead */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>{progressPercent}% complete</span>
                  <span className="truncate max-w-[80px]">{epic.lead}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${progressPercent}%`,
                      backgroundColor: epic.color || '#7C3AED',
                    }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

