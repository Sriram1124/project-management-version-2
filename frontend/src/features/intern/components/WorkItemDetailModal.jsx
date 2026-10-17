import React, { useState, useEffect } from 'react';
import { 
  X, 
  Clock, 
  Calendar, 
  Users, 
  CheckCircle2, 
  AlertCircle, 
  CornerDownRight, 
  Layers,
  Check,
  User,
  Loader2,
  Trash2
} from 'lucide-react';
import { workItemsService } from '../services/workItemsService';
import { timesheetService } from '../../../services/timesheet.service';
import { useAuth } from '../../../context/AuthContext';
import WorkItemComments from '../../../components/common/WorkItemComments';

export default function WorkItemDetailModal({
  workItem,
  isOpen,
  onClose,
  onTaskUpdated,
  onTaskDeleted,
  onToast
}) {
  const [activeTab, setActiveTab] = useState('details'); // 'details' | 'attachments' | 'activity' | 'comments'
  const [liveItem, setLiveItem] = useState(workItem || {});
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(workItem?.status || 'TODO');
  const [priority, setPriority] = useState(workItem?.priority || 'MEDIUM');
  const [taskSession, setTaskSession] = useState(null);
  const [taskSessionLoading, setTaskSessionLoading] = useState(false);
  const { user: authUser } = useAuth();

  useEffect(() => {
    if (workItem?.id && isOpen) {
      setLiveItem(workItem);
      setStatus(workItem.status);
      setPriority(workItem.priority);
      setError('');
      setLoading(true);
      workItemsService.getWorkItem(workItem.id)
        .then((data) => {
          setLiveItem(data);
          setStatus(data.status);
          setPriority(data.priority);
        })
        .catch((err) => {
          console.error('Failed to load work item details:', err);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [workItem?.id, isOpen]);

  useEffect(() => {
    const currentItemId = liveItem?.id || workItem?.id;
    if (!isOpen || !currentItemId) return;
    let cancelled = false;
    setTaskSessionLoading(true);
    timesheetService.getActiveTaskSession(currentItemId)
      .then((data) => {
        if (!cancelled) setTaskSession(data?.session || null);
      })
      .catch(() => {
        if (!cancelled) setTaskSession(null);
      })
      .finally(() => {
        if (!cancelled) setTaskSessionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, liveItem?.id, workItem?.id]);

  const item = liveItem || workItem;
  const isOverdue = workItemsService.isOverdue(item);
  const childItems = item.children || [];
  const parentItem = item.parent || null;
  const assignees = item.assignees || [];
  const authRole = String(authUser?.role?.name || authUser?.role || authUser?.type || authUser?.user_type || '').toUpperCase();
  const authUserId = authUser?.id || authUser?.user_id || authUser?.userId || authUser?.user?.id;
  const assignedUserIds = [
    ...assignees.map((assignee) => assignee.user_id || assignee.userId || assignee.assignee_id || assignee.user?.id || assignee.user?.user_id || assignee.id),
    ...(item.assignee_ids || item.assigneeIds || []),
  ].filter(Boolean).map(String);
  const isIntern = authRole === 'INTERN';
  const isAssignedIntern = ['INTERN', 'EMPLOYEE'].includes(authRole) && Boolean(authUserId) && assignedUserIds.includes(String(authUserId));
  const isManagerOrAdmin = authUser?.role === 'MANAGER' || authUser?.role === 'ADMIN' || authUser?.role === 'TECH_LEAD';
  const canDelete = !isIntern && isManagerOrAdmin;
  const canUpdateStatus = !isIntern || isAssignedIntern;
  const canEditFields = !isIntern;

  const canToggleChild = (child) => {
    if (!isIntern) return true;
    const childAssignees = child.assignees || [];
    const childAssignedIds = [
      ...childAssignees.map((a) => a.user_id || a.userId || a.assignee_id || a.user?.id || a.id),
      ...(child.assignee_ids || child.assigneeIds || []),
    ].filter(Boolean).map(String);
    return childAssignedIds.includes(String(authUserId)) || (childAssignedIds.length === 0 && isAssignedIntern);
  };

  const handleStartWork = async () => {
    try {
      setTaskSessionLoading(true);
      setError('');
      const response = await timesheetService.startSession({ task_id: item.id });
      setTaskSession(response.session || null);
      onToast?.('Work started for this task');
    } catch (err) {
      setError(err.message || 'Unable to start work');
    } finally {
      setTaskSessionLoading(false);
    }
  };

  const handleStopWork = async () => {
    try {
      setTaskSessionLoading(true);
      setError('');
      const response = await timesheetService.endSession({ task_id: item.id });
      setTaskSession(null);
      onToast?.(`Work stopped: ${response.session?.time_entry?.duration_minutes || 0} minutes recorded`);
    } catch (err) {
      setError(err.message || 'Unable to stop work');
    } finally {
      setTaskSessionLoading(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      setStatus(newStatus);
      await workItemsService.updateWorkItem(item.id, { status: newStatus });
      setLiveItem((prev) => ({ ...prev, status: newStatus }));
      onToast?.(`Updated status to ${newStatus.replace('_', ' ')}`);
      onTaskUpdated?.();
    } catch (err) {
      setStatus(item.status);
      onToast?.(err.message || 'Failed to update status');
    }
  };

  const handlePriorityChange = async (newPriority) => {
    try {
      setPriority(newPriority);
      await workItemsService.updateWorkItem(item.id, { priority: newPriority });
      setLiveItem((prev) => ({ ...prev, priority: newPriority }));
      onToast?.(`Priority changed to ${newPriority}`);
      onTaskUpdated?.();
    } catch (err) {
      setPriority(item.priority);
      onToast?.(err.message || 'Failed to update priority');
    }
  };

  const handleToggleChild = async (child) => {
    if (!canToggleChild(child)) return;
    try {
      await workItemsService.toggleComplete(child.id);
      const updated = await workItemsService.getWorkItem(item.id);
      setLiveItem(updated);
      onTaskUpdated?.();
    } catch (err) {
      onToast?.(err.message || 'Failed to update child task');
    }
  };

  const handleDelete = async () => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete this ${(item.type || 'task').toLowerCase()}?\n"${item.title}"`
    );
    if (!confirmDelete) return;

    try {
      setDeleting(true);
      setError('');
      await workItemsService.deleteWorkItem(item.id);
      onToast?.('Task deleted successfully');
      onTaskDeleted?.(item.id);
      onClose();
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('child items') || msg.includes('children')) {
        setError(
          'This task cannot be deleted because it has child tasks. Remove or delete the child tasks first.'
        );
      } else {
        setError(msg || 'Failed to delete task');
      }
      onToast?.(msg || 'Failed to delete task');
    } finally {
      setDeleting(false);
    }
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case 'EPIC':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'STORY':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'TASK':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'SUBTASK':
        return 'bg-slate-100 text-slate-800 border-slate-200';
      case 'BUG':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  if (!isOpen || !workItem) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-start justify-between">
          <div className="space-y-1.5 min-w-0 pr-4">
            {/* Hierarchy Breadcrumb */}
            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
              <span className="font-semibold text-purple-700">
                {item.project_name || (item.project_id ? 'Project Task' : 'Personal Workspace')}
              </span>
              {parentItem && (
                <>
                  <span>/</span>
                  <span className="flex items-center gap-1 text-slate-600">
                    <CornerDownRight className="w-3 h-3 text-slate-400" />
                    Parent: {parentItem.title}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${getTypeBadge(
                  item.type
                )}`}
              >
                {item.type}
              </span>
              <span className="text-xs font-mono text-slate-400 font-bold">
                {item.id}
              </span>

              {isOverdue && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100 border border-rose-200 px-2 py-0.5 rounded">
                  <AlertCircle className="w-3 h-3" /> Overdue
                </span>
              )}

              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600 ml-2" />}
            </div>

            <h3 className="text-base font-bold text-slate-900">
              {item.title}
            </h3>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                title="Delete this work item"
              >
                {deleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                )}
                <span>Delete</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 border-b border-slate-200 bg-white text-xs">
          {[
            { id: 'details', label: 'Details & Scope' },
            { id: 'attachments', label: 'Attachments' },
            { id: 'comments', label: 'Comments' },
            { id: 'activity', label: 'Activity Log' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-3 font-semibold border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-purple-600 text-purple-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 text-xs text-slate-700">
          {activeTab === 'details' && (
            <div className="space-y-6">
              {/* Description */}
              <div>
                <h4 className="text-[11px] font-bold uppercase text-slate-400 tracking-wider mb-1.5">
                  Description
                </h4>
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 leading-relaxed whitespace-pre-wrap">
                  {item.description || 'No description provided.'}
                </div>
              </div>

              {/* Status & Priority Controls Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-purple-50/40 rounded-xl border border-purple-100">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Status
                  </label>
                  {canUpdateStatus ? (
                    <select
                      value={status}
                      onChange={(e) => handleStatusChange(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-purple-200 bg-white font-semibold text-xs text-slate-900 focus:outline-none focus:border-purple-600"
                    >
                      <option value="TODO">To Do</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="IN_REVIEW">In Review</option>
                      <option value="BLOCKED">Blocked</option>
                      <option value="COMPLETED">Completed</option>
                    </select>
                  ) : (
                    <div className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-100 font-semibold text-xs text-slate-800">
                      {status.replace('_', ' ')}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Priority
                  </label>
                  {canEditFields ? (
                    <select
                      value={priority}
                      onChange={(e) => handlePriorityChange(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-purple-200 bg-white font-semibold text-xs text-slate-900 focus:outline-none focus:border-purple-600"
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                  ) : (
                    <div className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-100 font-semibold text-xs text-slate-800">
                      {priority}
                    </div>
                  )}
                </div>
              </div>

              {isAssignedIntern && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-purple-100 bg-purple-50/40 p-4">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-purple-700">Task work timer</div>
                    <div className="mt-1 text-xs text-slate-600">{taskSession ? `Started ${new Date(taskSession.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Record actual work time for this task.'}</div>
                  </div>
                  <button type="button" onClick={taskSession ? handleStopWork : handleStartWork} disabled={taskSessionLoading} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50 ${taskSession ? 'bg-rose-600 hover:bg-rose-700' : 'bg-purple-600 hover:bg-purple-700'}`}>
                    {taskSessionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
                    {taskSession ? 'Stop Work' : 'Start Work'}
                  </button>
                </div>
              )}

              {/* Dates & Deadlines */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                    Start Date
                  </span>
                  <div className="flex items-center gap-2 text-slate-800 font-semibold">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {item.start_date
                        ? new Date(item.start_date).toLocaleDateString()
                        : 'Not specified'}
                    </span>
                  </div>
                </div>

                <div
                  className={`p-3 border rounded-xl ${
                    isOverdue
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                    Due Date
                  </span>
                  <div className="flex items-center gap-2 font-semibold">
                    <Clock
                      className={`w-3.5 h-3.5 ${
                        isOverdue ? 'text-rose-600' : 'text-slate-400'
                      }`}
                    />
                    <span>
                      {item.due_date
                        ? new Date(item.due_date).toLocaleDateString()
                        : 'No due date'}
                    </span>
                    {isOverdue && (
                      <span className="text-[10px] font-bold text-rose-600 uppercase ml-auto">
                        (Overdue)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Cycle Assignment & Story Points */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                    Cycle Assignment
                  </span>
                  <div className="flex items-center gap-2 text-slate-800 font-semibold text-xs">
                    <Layers className="w-3.5 h-3.5 text-purple-600" />
                    <span>
                      {item.sprint?.name || item.sprint_name || (item.project_id ? 'Backlog (Unassigned)' : 'Personal Task')}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                    Story Points
                  </span>
                  <div className="flex items-center gap-2 text-slate-800 font-semibold text-xs">
                    <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-bold text-xs">
                      {item.story_points ?? 0} pts
                    </span>
                  </div>
                </div>
              </div>

              {/* Assignees Section */}
              <div>
                <h4 className="text-[11px] font-bold uppercase text-slate-400 tracking-wider mb-2">
                  Work Item Assignees ({assignees.length})
                </h4>

                {assignees.length === 0 ? (
                  <p className="text-slate-400 italic">No assignees assigned</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {assignees.map((assignee) => (
                      <div
                        key={assignee.user_id || assignee.id}
                        className="flex items-center gap-2.5 p-2.5 rounded-xl border bg-white border-slate-200 text-slate-800"
                      >
                        <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs shrink-0">
                          {assignee.name ? assignee.name.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold truncate text-slate-900">
                            {assignee.name || 'Unknown User'}
                          </div>
                          <span className="text-[10px] text-slate-500 block truncate">
                            {assignee.email || ''}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Child Subtasks Section */}
              {childItems.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-bold uppercase text-slate-400 tracking-wider mb-2">
                    Child Items ({childItems.length})
                  </h4>
                  <div className="space-y-2">
                    {childItems.map((child) => (
                      <div
                        key={child.id}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => handleToggleChild(child)}
                            disabled={!canToggleChild(child)}
                            className={`w-4 h-4 rounded border flex items-center justify-center ${
                              !canToggleChild(child) ? 'opacity-50 cursor-not-allowed ' : 'cursor-pointer '
                            }${
                              child.status === 'COMPLETED'
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'border-slate-300'
                            }`}
                            title={!canToggleChild(child) ? 'Only the assigned intern or manager can update this task' : undefined}
                          >
                            {child.status === 'COMPLETED' && <Check className="w-3 h-3" />}
                          </button>
                          <span
                            className={
                              child.status === 'COMPLETED'
                                ? 'text-slate-500 font-medium'
                                : 'text-slate-800 font-semibold'
                            }
                          >
                            {child.title}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {child.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Attachments Tab - Honest V2 State */}
          {activeTab === 'attachments' && (
            <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400">
              <p className="font-semibold text-slate-700">Attachments Planned for V2</p>
              <p className="text-[11px] mt-1 text-slate-500">
                Work Item attachments are part of the upcoming V2 collaboration suite.
              </p>
            </div>
          )}

          {/* Comments Tab */}
          {activeTab === 'comments' && (
            <div className="pt-2">
              <WorkItemComments workItemId={item.id} onToast={onToast} />
            </div>
          )}

          {/* Activity Log Tab - Honest V2 State */}
          {activeTab === 'activity' && (
            <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400">
              <p className="font-semibold text-slate-700">Activity Log Planned for V2</p>
              <p className="text-[11px] mt-1 text-slate-500">
                Detailed audit history and timeline tracking are scheduled for V2.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-[11px] text-slate-400">
            Work Item ID: <span className="font-mono text-slate-700 font-bold">{item.id}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
