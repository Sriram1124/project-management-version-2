import React from 'react';
import { 
  Layers, 
  CornerDownRight, 
  ChevronRight, 
  Check, 
  Clock, 
  AlertCircle,
  FolderGit2
} from 'lucide-react';
import { workItemsService } from '../services/workItemsService';
import { useAuth } from '../../../context/AuthContext';

export default function HierarchyTreeView({
  workItems = [],
  onTaskClick,
  onToggleTask
}) {
  const { user: authUser } = useAuth();
  const authRole = String(authUser?.role?.name || authUser?.role || authUser?.type || authUser?.user_type || '').toUpperCase();
  const authUserId = authUser?.id || authUser?.user_id || authUser?.userId || authUser?.user?.id;
  const isIntern = authRole === 'INTERN';

  const canToggleItem = (item) => {
    if (!isIntern) return true;
    const assignees = item.assignees || item.work_item_assignees || [];
    const assignedUserIds = [
      ...assignees.map((a) => a.user_id || a.userId || a.assignee_id || a.user?.id || a.id),
      ...(item.assignee_ids || item.assigneeIds || []),
      ...(item.assignee ? [item.assignee.user_id || item.assignee.id] : []),
      ...(item.assignee_id ? [item.assignee_id] : []),
    ].filter(Boolean).map(String);
    return Boolean(authUserId) && assignedUserIds.includes(String(authUserId));
  };

  // Group work items by their hierarchy
  // Root items are Epics or items without parent_id
  const epics = workItems.filter((w) => w.type === 'EPIC');
  const standaloneItems = workItems.filter(
    (w) => w.type !== 'EPIC' && !w.parent_id
  );

  const getChildren = (parentId) => {
    return workItems.filter((w) => w.parent_id === parentId);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-emerald-100 text-emerald-800';
      case 'IN_PROGRESS':
        return 'bg-purple-100 text-purple-800';
      case 'IN_REVIEW':
        return 'bg-blue-100 text-blue-800';
      case 'BLOCKED':
        return 'bg-rose-100 text-rose-800';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const renderItemRow = (item, depth = 0) => {
    const isCompleted = item.status === 'COMPLETED';
    const isOverdue = workItemsService.isOverdue(item);
    const children = getChildren(item.id);
    const canToggle = canToggleItem(item);

    return (
      <div key={item.id} className="space-y-1">
        <div
          role="button"
          tabIndex={0}
          onClick={() => onTaskClick?.(item)}
          onKeyDown={(e) => {
            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onTaskClick?.(item);
            }
          }}
          className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer hover:bg-slate-50 select-none ${
            depth === 0
              ? 'bg-purple-50/30 border-purple-200 shadow-2xs font-semibold'
              : depth === 1
              ? 'ml-6 bg-slate-50/60 border-slate-200'
              : 'ml-12 bg-white border-slate-200'
          } ${isOverdue ? 'bg-rose-50/20' : ''}`}
        >
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            {depth > 0 && (
              <CornerDownRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            )}

            {/* Checkbox button */}
            <button
              type="button"
              disabled={!canToggle}
              title={!canToggle ? 'Only the assigned intern or manager can update status' : undefined}
              onClick={(e) => {
                e.stopPropagation();
                onToggleTask?.(item.id);
              }}
              className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
                !canToggle ? 'opacity-40 cursor-not-allowed ' : 'cursor-pointer '
              }${
                isCompleted
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'border-slate-300 hover:border-purple-500 bg-white'
              }`}
            >
              {isCompleted && <Check className="w-3.5 h-3.5 stroke-[3]" />}
            </button>

            <span className="text-[10px] font-mono text-slate-400 font-bold">
              {item.id}
            </span>

            <span
              className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded font-mono ${
                item.type === 'EPIC'
                  ? 'bg-purple-100 text-purple-800'
                  : item.type === 'STORY'
                  ? 'bg-emerald-100 text-emerald-800'
                  : item.type === 'BUG'
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-blue-100 text-blue-800'
              }`}
            >
              {item.type}
            </span>

            <span
              className={`text-xs truncate ${
                isCompleted
                  ? 'text-slate-500 font-medium'
                  : 'text-slate-800 font-medium'
              }`}
            >
              {item.title}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isOverdue && (
              <span className="text-[10px] font-bold text-rose-600">
                Overdue
              </span>
            )}
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${getStatusBadge(
                item.status
              )}`}
            >
              {item.status.replace('_', ' ')}
            </span>
          </div>
        </div>

        {/* Recursive Children */}
        {children.length > 0 && (
          <div className="space-y-1">
            {children.map((child) => renderItemRow(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-500 pb-1">
        <span>Work Item Tree: Epic → Story → Task → Subtask</span>
        <span>Scoped to your assigned deliverables</span>
      </div>

      <div className="space-y-3">
        {/* Render Epics first */}
        {epics.map((epic) => renderItemRow(epic, 0))}

        {/* Standalone items (Personal tasks, unparented tickets) */}
        {standaloneItems.length > 0 && (
          <div className="pt-2 space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Independent Tasks & Personal Work
            </span>
            {standaloneItems.map((item) => renderItemRow(item, 0))}
          </div>
        )}
      </div>
    </div>
  );
}
