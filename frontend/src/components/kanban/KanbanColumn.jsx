import React, { useState } from 'react';
import TaskCard from './TaskCard';
import { Plus } from 'lucide-react';

export default function KanbanColumn({
  column,
  tasks = [],
  onAddTask,
  onTaskClick,
  onDragStart,
  onDragEnd,
  onDropTask,
  readOnly = false,
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) {
      onDropTask?.(taskId, column.id);
    }
  };

  // Map 'Completed' to 'DONE' for standard Jira/enterprise convention if desired
  const displayTitle = column.title.toUpperCase() === 'COMPLETED' ? 'DONE' : column.title.toUpperCase();

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`w-[260px] sm:w-[275px] min-w-[260px] sm:min-w-[275px] shrink-0 rounded-md p-2.5 border transition-colors flex flex-col h-full max-h-[calc(100vh-240px)] min-h-[540px] ${
        isDragOver
          ? 'bg-purple-50/50 border-purple-400'
          : 'bg-[#F8FAFC] border-slate-200'
      }`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-2 select-none shrink-0">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${column.dotColor}`} />
          <h3 className="text-xs font-bold text-slate-800 tracking-tight">
            {displayTitle}
          </h3>
          <span
            title={column.wipLimit ? `Work in Progress Limit: ${column.wipLimit}` : undefined}
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-colors ${
              column.wipLimit && tasks.length > column.wipLimit
                ? 'bg-amber-50 text-amber-800 border-amber-300 font-bold'
                : 'bg-white text-slate-500 border-slate-200'
            }`}
          >
            {tasks.length}{column.wipLimit ? ` / ${column.wipLimit} max` : ''}
          </span>
        </div>

        {!readOnly && (
          <button
            onClick={() => onAddTask?.(column.id)}
            title={`Add task to ${column.title}`}
            className="w-5 h-5 rounded text-slate-400 hover:text-slate-700 hover:bg-white flex items-center justify-center transition-colors border border-transparent hover:border-slate-200"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Task List */}
      <div className="space-y-2 flex-1 overflow-y-auto pr-0.5">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onClick={onTaskClick}
            onDragStart={readOnly ? undefined : onDragStart}
            onDragEnd={readOnly ? undefined : onDragEnd}
          />
        ))}

        {tasks.length === 0 && (
          <div className="h-28 rounded border border-dashed border-slate-200 flex flex-col items-center justify-center text-center p-2">
            <span className="text-xs text-slate-400">No tasks</span>
            {!readOnly && (
              <button
                onClick={() => onAddTask?.(column.id)}
                className="mt-1 text-[11px] font-medium text-purple-700 hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>Create</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
