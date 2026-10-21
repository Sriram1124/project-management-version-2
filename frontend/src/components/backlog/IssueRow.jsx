import React, { useState } from 'react';
import { 
  ChevronRight, 
  ChevronDown, 
  Bookmark, 
  CheckSquare, 
  AlertCircle, 
  Clock, 
  User, 
  Plus, 
  Check, 
  CornerDownRight 
} from 'lucide-react';

export default function IssueRow({
  issue,
  epic,
  isSelected,
  onSelectIssue,
  onDragStart,
  onDragEnd,
  onToggleSubtask,
  onAddSubtask,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);

  const hasSubtasks = issue.subtasks && issue.subtasks.length > 0;
  const isOverdue = issue.isOverdue || (issue.dueDate && issue.dueDate.toLowerCase().includes('overdue'));

  // Issue Type Icon & Color
  const renderTypeIcon = () => {
    switch (issue.type?.toLowerCase()) {
      case 'story':
        return (
          <span title="Story" className="w-4 h-4 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 flex items-center justify-center shrink-0">
            <Bookmark className="w-2.5 h-2.5 fill-emerald-600" />
          </span>
        );
      case 'bug':
        return (
          <span title="Bug" className="w-4 h-4 rounded bg-rose-500/10 border border-rose-500/30 text-rose-600 flex items-center justify-center shrink-0">
            <AlertCircle className="w-2.5 h-2.5" />
          </span>
        );
      case 'task':
      default:
        return (
          <span title="Task" className="w-4 h-4 rounded bg-blue-500/10 border border-blue-500/30 text-blue-600 flex items-center justify-center shrink-0">
            <CheckSquare className="w-2.5 h-2.5" />
          </span>
        );
    }
  };

  // Status Badge Styling
  const getStatusBadge = (status) => {
    switch (status?.toUpperCase()) {
      case 'DONE':
      case 'COMPLETED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'IN PROGRESS':
        return 'bg-purple-50 text-purple-700 border-purple-200 font-semibold';
      case 'IN REVIEW':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'BLOCKED':
        return 'bg-rose-50 text-rose-700 border-rose-200 font-semibold';
      case 'TO DO':
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  // Priority styling
  const getPriorityBadge = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return 'text-rose-600 font-semibold';
      case 'medium':
        return 'text-amber-600';
      case 'low':
        return 'text-slate-500';
      default:
        return 'text-slate-500';
    }
  };

  const handleSubtaskSubmit = (e) => {
    e.preventDefault();
    if (newSubtaskTitle.trim()) {
      const childType = String(issue?.type || '').toUpperCase() === 'STORY' ? 'TASK' : 'SUBTASK';
      onAddSubtask?.(issue.id, newSubtaskTitle.trim(), childType);
      setNewSubtaskTitle('');
      setIsAddingSubtask(false);
    }
  };

  return (
    <div className="group border-b border-slate-100 last:border-b-0">
      {/* INVISIBLE-GRID ROW: PERFECT COLUMN ALIGNMENT ACROSS ALL ROWS */}
      <div
        role="button"
        tabIndex={0}
        draggable
        onDragStart={(e) => onDragStart?.(e, issue.id)}
        onDragEnd={onDragEnd}
        onClick={() => onSelectIssue?.(issue)}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onSelectIssue?.(issue);
          }
        }}
        className={`grid grid-cols-[1fr_75px_110px_95px_40px_70px] items-center gap-2.5 px-3 py-2 text-xs transition-colors cursor-pointer select-none ${
          isSelected
            ? 'bg-purple-50/80 border-l-2 border-l-purple-600'
            : 'hover:bg-slate-50/80 bg-white'
        }`}
      >
        {/* COLUMN 1: ISSUE / SUMMARY (CONSUMES MOST OF AVAILABLE WIDTH) */}
        <div className="flex items-center gap-2 min-w-0 pr-2">
          {/* Subtask expander */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className={`w-4 h-4 rounded flex items-center justify-center transition-colors text-slate-400 hover:text-slate-700 shrink-0 ${
              !hasSubtasks ? 'opacity-0 pointer-events-none' : ''
            }`}
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          {/* Type Icon */}
          {renderTypeIcon()}

          {/* Key */}
          <span className="font-mono text-[11px] font-semibold text-slate-500 shrink-0 w-16">
            {issue.id}
          </span>

          {/* Summary */}
          <span
            className="font-medium text-slate-800 truncate group-hover:text-purple-700 transition-colors flex-1"
          >
            {issue.title}
          </span>

          {/* Epic Tag */}
          {epic && (
            <span className="hidden xl:inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: epic.color }} />
              <span className="truncate max-w-[110px]">{epic.name}</span>
            </span>
          )}
        </div>

        {/* COLUMN 2: PRIORITY (FIXED 75px) */}
        <div className="text-left shrink-0">
          <span className={`text-[11px] ${getPriorityBadge(issue.priority)}`}>
            {issue.priority}
          </span>
        </div>

        {/* COLUMN 3: ASSIGNEE (FIXED 110px) */}
        <div className="flex items-center gap-1.5 shrink-0 min-w-0">
          {issue.assignee ? (
            <>
              <img
                src={issue.assignee.avatar}
                alt={issue.assignee.name}
                className="w-4 h-4 rounded-full object-cover border border-slate-200 shrink-0"
              />
              <span className="text-xs text-slate-700 truncate">{issue.assignee.name}</span>
            </>
          ) : (
            <div className="flex items-center gap-1 text-slate-400">
              <div className="w-4 h-4 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[8px]">
                <User className="w-2.5 h-2.5 text-slate-400" />
              </div>
              <span className="text-[11px]">Unassigned</span>
            </div>
          )}
        </div>

        {/* COLUMN 4: STATUS (FIXED 95px) */}
        <div className="text-left shrink-0">
          <span
            className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold border inline-block ${getStatusBadge(
              issue.status
            )}`}
          >
            {issue.status}
          </span>
        </div>

        {/* COLUMN 5: STORY POINTS (FIXED 40px) */}
        <div className="flex justify-center shrink-0">
          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-mono font-bold text-[10px] flex items-center justify-center border border-slate-200">
            {issue.story_points ?? issue.storyPoints ?? '-'}
          </span>
        </div>

        {/* COLUMN 6: DUE DATE (FIXED 70px) */}
        <div className="text-right shrink-0">
          {issue.dueDate ? (
            <span className={`text-[11px] font-medium ${isOverdue ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>
              {issue.dueDate}
            </span>
          ) : (
            <span className="text-slate-300">-</span>
          )}
        </div>
      </div>

      {/* Expanded Subtasks Tree (Hierarchy) */}
      {isExpanded && (
        <div className="bg-slate-50/60 pl-8 pr-4 py-1.5 border-t border-slate-100 space-y-1">
          {issue.subtasks?.map((subtask) => (
            <div
              key={subtask.id}
              className="flex items-center justify-between gap-2 py-1 px-2 rounded hover:bg-white text-xs transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <CornerDownRight className="w-3 h-3 text-slate-300 shrink-0" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSubtask?.(issue.id, subtask.id);
                  }}
                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                    subtask.done
                      ? 'bg-purple-600 border-purple-600 text-white'
                      : 'border-slate-300 bg-white hover:border-purple-500'
                  }`}
                >
                  {subtask.done && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                </button>
                <span className="font-mono text-[10px] text-slate-400 font-medium">
                  {subtask.id}
                </span>
                <span
                  className="text-xs text-slate-700 truncate"
                >
                  {subtask.title}
                </span>
              </div>

              <span className={`text-[10px] font-semibold ${subtask.done ? 'text-emerald-600' : 'text-slate-400'}`}>
                {subtask.done ? 'COMPLETED' : 'TO DO'}
              </span>
            </div>
          ))}

          {/* Quick Add Child Item Row (Only for non-leaf items: Task & Story) */}
          {(String(issue?.type || '').toUpperCase() === 'TASK' ||
            String(issue?.type || '').toUpperCase() === 'STORY') && (
            isAddingSubtask ? (
              <form onSubmit={handleSubtaskSubmit} className="flex items-center gap-2 pl-5 pt-1">
                <CornerDownRight className="w-3 h-3 text-slate-300 shrink-0" />
                <input
                  type="text"
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  placeholder={`${
                    String(issue?.type || '').toUpperCase() === 'STORY'
                      ? 'Task'
                      : 'Subtask'
                  } summary... (Press Enter)`}
                  className="flex-1 px-2 py-1 text-xs rounded border border-purple-300 focus:outline-none focus:ring-1 focus:ring-purple-600 bg-white"
                />
                <button
                  type="submit"
                  className="px-2 py-1 rounded bg-purple-600 text-white text-[11px] font-medium"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingSubtask(false)}
                  className="px-1.5 py-1 text-slate-400 hover:text-slate-600 text-[11px]"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                onClick={() => setIsAddingSubtask(true)}
                className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-purple-700 pl-5 py-0.5 transition-colors"
              >
                <Plus className="w-3 h-3" />
                <span>
                  {String(issue?.type || '').toUpperCase() === 'STORY'
                    ? 'Add task'
                    : 'Add subtask'}
                </span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
