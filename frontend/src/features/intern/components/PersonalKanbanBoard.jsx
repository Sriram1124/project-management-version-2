import React, { useState } from 'react';
import { Clock, Lock, CheckCircle2, AlertCircle, Plus, Sparkles, User } from 'lucide-react';
import { workItemsService } from '../services/workItemsService';
import { useAuth } from '../../../context/AuthContext';

const COLUMNS = [
  { id: 'TODO', title: 'TO DO', dotColor: 'bg-slate-400' },
  { id: 'IN_PROGRESS', title: 'IN PROGRESS', dotColor: 'bg-purple-600' },
  { id: 'IN_REVIEW', title: 'IN REVIEW', dotColor: 'bg-blue-500' },
  { id: 'BLOCKED', title: 'BLOCKED', dotColor: 'bg-rose-500' },
  { id: 'COMPLETED', title: 'DONE', dotColor: 'bg-emerald-500' }
];

export default function PersonalKanbanBoard({
  workItems = [],
  onTaskClick,
  onTaskUpdated,
  onToast
}) {
  const { user: authUser } = useAuth();
  const authRole = String(authUser?.role?.name || authUser?.role || authUser?.type || authUser?.user_type || '').toUpperCase();
  const authUserId = authUser?.id || authUser?.user_id || authUser?.userId || authUser?.user?.id;
  const isIntern = authRole === 'INTERN';

  const canDragTask = (task) => {
    if (!isIntern) return true;
    const assignees = task.assignees || task.work_item_assignees || [];
    const assignedUserIds = [
      ...assignees.map((a) => a.user_id || a.userId || a.assignee_id || a.user?.id || a.id),
      ...(task.assignee_ids || task.assigneeIds || []),
      ...(task.assignee ? [task.assignee.user_id || task.assignee.id] : []),
      ...(task.assignee_id ? [task.assignee_id] : []),
    ].filter(Boolean).map(String);
    return Boolean(authUserId) && assignedUserIds.includes(String(authUserId));
  };

  const [draggedId, setDraggedId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  const handleDragStart = (e, task) => {
    if (!canDragTask(task)) {
      e.preventDefault();
      return;
    }
    setDraggedId(task.id);
    e.dataTransfer.setData('text/plain', task.id);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverCol(null);
  };

  const handleDragOver = (e, colId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCol !== colId) {
      setDragOverCol(colId);
    }
  };

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverCol(null);
    }
  };

  const handleDrop = async (e, targetStatus) => {
    e.preventDefault();
    setDragOverCol(null);
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;

    const task = workItems.find((w) => w.id === taskId);
    if (!task || !canDragTask(task)) return;
    if (task && task.status !== targetStatus) {
      try {
        await workItemsService.updateWorkItem(taskId, { status: targetStatus });
        onToast?.(`Moved ${task.id} to ${targetStatus.replace('_', ' ')}`);
        onTaskUpdated?.();
      } catch (err) {
        onToast?.(err.message || 'Failed to update status');
      }
    }
  };

  const getPriorityBadgeStyle = (priority) => {
    switch (priority) {
      case 'URGENT':
      case 'HIGH':
        return 'bg-rose-50 text-rose-700 border border-rose-200';
      case 'MEDIUM':
        return 'bg-amber-50 text-amber-700 border border-amber-200';
      case 'LOW':
        return 'bg-slate-100 text-slate-600 border border-slate-200';
      default:
        return 'bg-slate-100 text-slate-700 border border-slate-200';
    }
  };

  const getTypeStyle = (type) => {
    switch (type) {
      case 'EPIC':
        return 'text-purple-700 bg-purple-50';
      case 'STORY':
        return 'text-emerald-700 bg-emerald-50';
      case 'BUG':
        return 'text-rose-700 bg-rose-50';
      case 'SUBTASK':
        return 'text-slate-700 bg-slate-100';
      default:
        return 'text-blue-700 bg-blue-50';
    }
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 select-none">
      {COLUMNS.map((col) => {
        const columnTasks = workItems.filter((w) => w.status === col.id);
        const isHovered = dragOverCol === col.id;

        return (
          <div
            key={col.id}
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.id)}
            className={`w-[260px] sm:w-[270px] min-w-[260px] shrink-0 rounded-xl p-3 border transition-colors flex flex-col min-h-[500px] ${
              isHovered
                ? 'bg-purple-50/60 border-purple-400 ring-2 ring-purple-400/20'
                : 'bg-[#F8FAFC] border-slate-200'
            }`}
          >
            {/* Column Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 mb-2.5">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full shrink-0 ${col.dotColor}`} />
                <h3 className="text-xs font-bold text-slate-800 tracking-tight">
                  {col.title}
                </h3>
              </div>
              <span className="text-[10px] font-bold text-slate-500 px-2 py-0.5 rounded-full bg-white border border-slate-200">
                {columnTasks.length}
              </span>
            </div>

            {/* Column Cards */}
            <div className="flex-1 space-y-2.5 overflow-y-auto">
              {columnTasks.length === 0 ? (
                <div className="h-24 flex items-center justify-center border-2 border-dashed border-slate-200/80 rounded-lg text-[11px] text-slate-400 font-medium">
                  No tasks
                </div>
              ) : (
                columnTasks.map((task) => {
                  const isOverdue = workItemsService.isOverdue(task);
                  const isBlocked = task.status === 'BLOCKED';
                  const isCompleted = task.status === 'COMPLETED';
                  const assignees = task.assignees || task.work_item_assignees || [];

                  const canDrag = canDragTask(task);

                  return (
                    <div
                      key={task.id}
                      draggable={canDrag}
                      onDragStart={(e) => handleDragStart(e, task)}
                      onDragEnd={handleDragEnd}
                      onClick={() => onTaskClick?.(task)}
                      className={`p-3 rounded-xl bg-white border transition-all ${
                        canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                      } hover:border-purple-300 hover:shadow-xs group ${
                        isBlocked
                          ? 'border-rose-300 bg-rose-50/20'
                          : isCompleted
                          ? 'border-slate-200 opacity-80'
                          : 'border-slate-200 shadow-2xs'
                      }`}
                    >
                      {/* Top Row: Type, ID, Priority */}
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded font-mono ${getTypeStyle(
                              task.type
                            )}`}
                          >
                            {task.type}
                          </span>
                          <span className="text-[11px] font-mono font-bold text-slate-500 group-hover:text-purple-700 transition-colors">
                            {task.id}
                          </span>
                        </div>

                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${getPriorityBadgeStyle(
                            task.priority
                          )}`}
                        >
                          {task.priority}
                        </span>
                      </div>

                      {/* Task Title */}
                      <h4
                        className={`text-xs font-semibold leading-snug text-slate-900 group-hover:text-purple-700 transition-colors line-clamp-2 ${
                          isCompleted ? 'text-slate-500' : ''
                        }`}
                      >
                        {task.title}
                      </h4>

                      {/* Project / Category */}
                      <div className="text-[10px] text-slate-400 mt-1 truncate">
                        {task.project_name || (task.project_id ? 'Project Task' : 'Personal Goal')}
                      </div>

                      {/* Divider */}
                      <div className="my-2 border-t border-slate-100" />

                      {/* Footer: Due Date & Assignee Avatar */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1">
                          <Clock
                            className={`w-3 h-3 ${
                              isOverdue ? 'text-rose-600' : 'text-slate-400'
                            }`}
                          />
                          <span
                            className={`text-[10px] font-medium ${
                              isOverdue
                                ? 'text-rose-600 font-bold'
                                : 'text-slate-500'
                            }`}
                          >
                            {isOverdue
                              ? 'Overdue'
                              : task.due_date
                              ? new Date(task.due_date).toLocaleDateString([], {
                                  month: 'short',
                                  day: 'numeric'
                                })
                              : 'No due date'}
                          </span>
                        </div>

                        {/* Assignee Avatar */}
                        <div className="flex items-center -space-x-1">
                          {assignees.map((a, idx) => (
                            <div
                              key={a.user_id || a.id || idx}
                              title={a.name || a.email}
                              className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 font-bold text-[9px] flex items-center justify-center border border-white"
                            >
                              {a.name ? a.name.charAt(0).toUpperCase() : 'U'}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
