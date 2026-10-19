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
  Trash2,
  Plus,
  RotateCcw
} from 'lucide-react';
import { workItemsService } from '../services/workItemsService';
import { timesheetService } from '../../../services/timesheet.service';
import { useAuth } from '../../../context/AuthContext';
import WorkItemComments from '../../../components/common/WorkItemComments';
import { getSessionCutoffMs } from '../../../components/views/TimesheetView';

export default function WorkItemDetailModal({
  workItem,
  isOpen,
  onClose,
  onTaskUpdated,
  onTaskDeleted,
  onToast,
  isKanban = false,
}) {
  const [activeTab, setActiveTab] = useState('details'); // 'details' | 'attachments' | 'activity' | 'comments'
  const [liveItem, setLiveItem] = useState(workItem || {});
  const isKanbanProject = isKanban || liveItem?.project?.methodology === 'KANBAN' || workItem?.project?.methodology === 'KANBAN';
  const Term = isKanbanProject ? 'Cycle' : 'Sprint';
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(workItem?.status || 'TODO');
  const [priority, setPriority] = useState(workItem?.priority || 'MEDIUM');
  const [taskSession, setTaskSession] = useState(null);
  const [taskSessionLoading, setTaskSessionLoading] = useState(false);
  const [elapsedText, setElapsedText] = useState('00:00:00');
  const [timeEntries, setTimeEntries] = useState([]);
  const [totalLoggedMinutes, setTotalLoggedMinutes] = useState(0);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [logHours, setLogHours] = useState('');
  const [logMinutes, setLogMinutes] = useState('30');
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [logNotes, setLogNotes] = useState('');
  const [extensionRequests, setExtensionRequests] = useState([]);
  const [loadingExtensions, setLoadingExtensions] = useState(false);
  const [isExtensionModalOpen, setIsExtensionModalOpen] = useState(false);
  const [requestedDueDate, setRequestedDueDate] = useState('');
  const [extensionReason, setExtensionReason] = useState('');
  const [extensionSubmitting, setExtensionSubmitting] = useState(false);
  const [extensionError, setExtensionError] = useState('');

  // Time correction state
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [correctionTargetEntry, setCorrectionTargetEntry] = useState(null);
  const [correctionExcessMinutes, setCorrectionExcessMinutes] = useState(30);
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);
  const [correctionError, setCorrectionError] = useState('');

  const { user: authUser } = useAuth();
  const item = liveItem || workItem;

  const loadExtensionRequests = React.useCallback(async () => {
    const currentItemId = liveItem?.id || workItem?.id;
    if (!currentItemId) return;
    try {
      setLoadingExtensions(true);
      const res = await workItemsService.getExtensionRequests(currentItemId);
      setExtensionRequests(Array.isArray(res) ? res : []);
    } catch {
      setExtensionRequests([]);
    } finally {
      setLoadingExtensions(false);
    }
  }, [liveItem?.id, workItem?.id]);

  const loadTaskEntries = React.useCallback(async () => {
    const currentItemId = liveItem?.id || workItem?.id;
    if (!currentItemId) return;
    try {
      const res = await timesheetService.getTaskEntries(currentItemId);
      setTimeEntries(res?.entries || []);
      setTotalLoggedMinutes(res?.total_minutes || 0);
    } catch {
      setTimeEntries([]);
      setTotalLoggedMinutes(0);
    }
  }, [liveItem?.id, workItem?.id]);

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
    loadTaskEntries();
    loadExtensionRequests();
    return () => {
      cancelled = true;
    };
  }, [isOpen, liveItem?.id, workItem?.id, loadTaskEntries, loadExtensionRequests]);

  // Sync timer state on window focus, visibility change, and timer update events
  useEffect(() => {
    const currentItemId = liveItem?.id || workItem?.id;
    if (!isOpen || !currentItemId) return;

    const handleSync = () => {
      timesheetService.getActiveTaskSession(currentItemId)
        .then((data) => setTaskSession(data?.session || null))
        .catch(() => setTaskSession(null));
      loadTaskEntries();
    };

    window.addEventListener('timer-session-updated', handleSync);
    window.addEventListener('focus', handleSync);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleSync();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('timer-session-updated', handleSync);
      window.removeEventListener('focus', handleSync);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isOpen, liveItem?.id, workItem?.id, loadTaskEntries]);

  useEffect(() => {
    if (!taskSession?.started_at) {
      setElapsedText('00:00:00');
      return;
    }
    const update = () => {
      const start = new Date(taskSession.started_at).getTime();
      const cutoff = getSessionCutoffMs(taskSession.started_at);
      const effectiveEnd = cutoff && Date.now() > cutoff ? cutoff : Date.now();
      const diff = Math.max(0, Math.floor((effectiveEnd - start) / 1000));
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setElapsedText(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
      if (cutoff && Date.now() >= cutoff) {
        timesheetService.getActiveTaskSession(item?.id).then((res) => {
          setTaskSession(res?.session || null);
          loadTaskEntries();
        }).catch(() => {});
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [taskSession, item?.id, loadTaskEntries]);

  const isOverdue = workItemsService.isOverdue(item);
  const isProjectArchived = String(item?.project?.status || item?.project_status || '').toUpperCase() === 'ARCHIVED';
  const pendingExtension = extensionRequests.find((r) => r.status === 'PENDING') || item.pending_extension || null;
  const latestReviewedExtension = extensionRequests.find((r) => r.status !== 'PENDING') || null;
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
    const authRole = String(
      authUser?.role?.name || authUser?.role || authUser?.type || authUser?.user_type || ''
    ).toUpperCase();
    if (authRole === 'MANAGER') {
      setError('Managers do not have permission to start timers on tasks');
      return;
    }
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
      const mins = response.session?.time_entry?.duration_minutes || 0;
      onToast?.(`Work stopped: ${mins} minutes recorded`);
      await loadTaskEntries();
    } catch (err) {
      setError(err.message || 'Unable to stop work');
    } finally {
      setTaskSessionLoading(false);
    }
  };

  const handleSaveWorklog = async (e) => {
    e.preventDefault();
    const hours = parseInt(logHours, 10) || 0;
    const minutes = parseInt(logMinutes, 10) || 0;
    const totalMins = hours * 60 + minutes;

    if (totalMins <= 0) {
      setError('Please enter a duration greater than 0 minutes.');
      return;
    }

    try {
      setTaskSessionLoading(true);
      setError('');
      await timesheetService.createEntry({
        task_id: item.id,
        date: logDate,
        duration_minutes: totalMins,
        notes: logNotes.trim() || null,
      });
      setIsLogModalOpen(false);
      setLogHours('');
      setLogMinutes('30');
      setLogNotes('');
      onToast?.(`Logged ${totalMins} minutes!`);
      await loadTaskEntries();
    } catch (err) {
      setError(err.message || 'Failed to save worklog entry');
    } finally {
      setTaskSessionLoading(false);
    }
  };

  const handleDeleteWorklog = async (entryId) => {
    if (!window.confirm('Are you sure you want to delete this time entry?')) return;
    try {
      setTaskSessionLoading(true);
      setError('');
      await timesheetService.deleteEntry(entryId);
      onToast?.('Time entry deleted');
      await loadTaskEntries();
    } catch (err) {
      setError(err.message || 'Failed to delete time entry');
    } finally {
      setTaskSessionLoading(false);
    }
  };

  const handleOpenCorrectionModal = (entry) => {
    const origMins = Number(entry?.duration_minutes) || 0;
    setCorrectionTargetEntry({
      ...entry,
      duration_minutes: origMins,
    });
    setCorrectionExcessMinutes(Math.min(30, Math.max(5, Math.floor(origMins / 2))));
    setCorrectionReason('');
    setCorrectionError('');
    setIsCorrectionModalOpen(true);
  };

  const handleCorrectionSubmit = async (e) => {
    e.preventDefault();
    if (!correctionTargetEntry) {
      setCorrectionError('No entry selected.');
      return;
    }
    const excess = Number(correctionExcessMinutes);
    if (!excess || excess <= 0) {
      setCorrectionError('Excess minutes to deduct must be greater than 0.');
      return;
    }
    const orig = Number(correctionTargetEntry.duration_minutes || 0);
    if (excess >= orig) {
      setCorrectionError(`Excess minutes must be less than original duration (${orig}m).`);
      return;
    }
    if (!correctionReason.trim()) {
      setCorrectionError('Please provide a reason for the correction.');
      return;
    }

    try {
      setCorrectionSubmitting(true);
      setCorrectionError('');
      await timesheetService.requestTimeCorrection({
        time_entry_id: correctionTargetEntry.id,
        excess_minutes: excess,
        reason: correctionReason.trim(),
      });
      onToast?.('Time correction request submitted for manager review');
      setIsCorrectionModalOpen(false);
      setCorrectionTargetEntry(null);
      setCorrectionReason('');
      await loadTaskEntries();
    } catch (err) {
      setCorrectionError(err.message || 'Unable to submit correction request');
    } finally {
      setCorrectionSubmitting(false);
    }
  };

  const handleRequestExtension = async (e) => {
    e?.preventDefault();
    setExtensionError('');

    if (!requestedDueDate) {
      setExtensionError('Please select a new requested due date.');
      return;
    }

    const currentDue = item.due_date ? new Date(item.due_date).getTime() : 0;
    const chosen = new Date(requestedDueDate).getTime();

    if (item.due_date && chosen <= currentDue) {
      setExtensionError('Requested due date must be later than the current due date.');
      return;
    }
    if (!item.due_date && chosen <= Date.now()) {
      setExtensionError('Requested due date must be in the future.');
      return;
    }
    if (!extensionReason || !extensionReason.trim()) {
      setExtensionError('Reason is mandatory for requesting an extension.');
      return;
    }

    try {
      setExtensionSubmitting(true);
      const res = await workItemsService.requestExtension(item.id, {
        requested_due_date: new Date(requestedDueDate).toISOString(),
        reason: extensionReason.trim(),
      });
      setIsExtensionModalOpen(false);
      setRequestedDueDate('');
      setExtensionReason('');
      await loadExtensionRequests();
      onToast?.('Extension request submitted to project manager.');
      onTaskUpdated?.({
        ...item,
        has_pending_extension: true,
        pending_extension: res,
      });
    } catch (err) {
      setExtensionError(err.message || 'Failed to submit extension request.');
    } finally {
      setExtensionSubmitting(false);
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
            { id: 'worklog', label: `Worklog (${timeEntries.length})` },
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

              {(isAssignedIntern || isManagerOrAdmin) && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-purple-100 bg-purple-50/40 p-4">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-purple-700">
                      Task work timer · {Math.floor(totalLoggedMinutes / 60)}h {totalLoggedMinutes % 60}m logged
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {taskSession ? (
                        <span className="font-semibold text-purple-900">
                          Timer running: <span className="font-mono text-purple-700 font-bold">{elapsedText}</span>
                        </span>
                      ) : (
                        'Record real-time or manual work effort for this task.'
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={taskSession ? handleStopWork : handleStartWork}
                    disabled={taskSessionLoading}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50 transition-colors ${
                      taskSession ? 'bg-rose-600 hover:bg-rose-700' : 'bg-purple-600 hover:bg-purple-700'
                    }`}
                  >
                    {taskSessionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
                    {taskSession ? `Stop (${elapsedText})` : 'Start Timer'}
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

                  {/* Extension Status / Action immediately below Due Date */}
                  {item.project_id && (
                    <div className="mt-2.5 pt-2 border-t border-slate-200/80">
                      {pendingExtension ? (
                        <div className="bg-amber-100/70 border border-amber-300 rounded-lg p-2 text-amber-900">
                          <div className="flex items-center justify-between text-[11px] font-bold">
                            <span className="flex items-center gap-1.5 text-amber-800">
                              <Clock className="w-3.5 h-3.5 text-amber-600" />
                              Extension Pending
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 text-[10px]">
                              {new Date(pendingExtension.requested_due_date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-amber-950/80 italic line-clamp-2" title={pendingExtension.reason}>
                            "{pendingExtension.reason}"
                          </p>
                        </div>
                      ) : isProjectArchived ? (
                        <div className="text-[11px] text-slate-400 italic text-center py-1.5 bg-slate-100/60 rounded-lg border border-slate-200">
                          Project is archived (Read-Only)
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setExtensionError('');
                            setRequestedDueDate('');
                            setExtensionReason('');
                            setIsExtensionModalOpen(true);
                          }}
                          className="w-full py-1.5 px-2.5 text-xs font-semibold rounded-lg bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 hover:border-purple-300 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                          <Calendar className="w-3.5 h-3.5 text-purple-600" />
                          <span>Request Extension</span>
                        </button>
                      )}

                      {latestReviewedExtension && !pendingExtension && (
                        <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
                          <span>
                            Prior: <span className={latestReviewedExtension.status === 'APPROVED' ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>{latestReviewedExtension.status}</span>
                          </span>
                          <span className="text-slate-400">
                            {new Date(latestReviewedExtension.reviewed_at || latestReviewedExtension.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Sprint / Cycle Assignment & Story Points */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                    {Term} Assignment
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

          {/* Worklog Tab */}
          {activeTab === 'worklog' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-purple-50/50 rounded-xl border border-purple-100">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 block">
                    Recorded Work Effort
                  </span>
                  <div className="text-base font-extrabold text-slate-900 mt-0.5">
                    {Math.floor(totalLoggedMinutes / 60)}h {totalLoggedMinutes % 60}m
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsLogModalOpen(!isLogModalOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs transition-colors cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Log Time</span>
                </button>
              </div>

              {/* Inline Manual Entry Form */}
              {isLogModalOpen && (
                <form onSubmit={handleSaveWorklog} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-xs">Record Manual Time</span>
                    <button type="button" onClick={() => setIsLogModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Date</label>
                      <input
                        type="date"
                        value={logDate}
                        onChange={(e) => setLogDate(e.target.value)}
                        required
                        className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 focus:outline-none focus:border-purple-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Hours</label>
                      <input
                        type="number"
                        min="0"
                        max="24"
                        placeholder="0"
                        value={logHours}
                        onChange={(e) => setLogHours(e.target.value)}
                        className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 font-mono focus:outline-none focus:border-purple-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Minutes</label>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        step="5"
                        placeholder="30"
                        value={logMinutes}
                        onChange={(e) => setLogMinutes(e.target.value)}
                        className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 font-mono focus:outline-none focus:border-purple-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Notes (Optional)</label>
                    <textarea
                      rows={2}
                      value={logNotes}
                      onChange={(e) => setLogNotes(e.target.value)}
                      placeholder="What was completed?"
                      className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 resize-none focus:outline-none focus:border-purple-600"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsLogModalOpen(false)}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-white text-slate-600 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={taskSessionLoading}
                      className="px-3.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      Save Log
                    </button>
                  </div>
                </form>
              )}

              {/* Entries list */}
              {timeEntries.length === 0 ? (
                <div className="p-6 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-slate-100">
                  <p>No worklog entries recorded yet.</p>
                  <p className="text-[11px] mt-1 text-slate-400">
                    Use the Timer or click &quot;Log Time&quot; above to record effort.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {timeEntries.map((entry) => {
                    const isOwner = entry.user_id === authUserId;
                    const canDeleteEntry = isOwner || isManagerOrAdmin;
                    return (
                      <div
                        key={entry.id}
                        className="p-3 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50/50 transition-colors flex items-start justify-between gap-2 shadow-2xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900 text-xs">
                              {entry.duration_formatted}
                            </span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase ${
                                entry.source === 'TIMER'
                                  ? 'bg-purple-100 text-purple-800 border-purple-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {entry.source || 'MANUAL'}
                            </span>
                            <span className="text-slate-400 text-[10px]">
                              {entry.date ? new Date(entry.date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-600">
                            <span className="font-semibold text-slate-800">{entry.user_name}</span>
                            {entry.notes && <span>— &quot;{entry.notes}&quot;</span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {isOwner && (
                            <button
                              type="button"
                              onClick={() => handleOpenCorrectionModal(entry)}
                              title="Request time correction for this entry"
                              className="px-2 py-0.5 rounded-lg text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 transition-colors flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3 text-amber-600" />
                              <span>Correct</span>
                            </button>
                          )}
                          {canDeleteEntry && (
                            <button
                              type="button"
                              onClick={() => handleDeleteWorklog(entry.id)}
                              disabled={taskSessionLoading}
                              title="Delete entry"
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
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

      {/* Request Extension Modal */}
      {isExtensionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Request Due Date Extension</h3>
                  <p className="text-[11px] text-slate-500">Submit an extension request to the project manager</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsExtensionModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {extensionError && (
              <div className="mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{extensionError}</span>
              </div>
            )}

            <form onSubmit={handleRequestExtension} className="mt-4 space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Task
                </label>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800">
                  {item.title}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Current Due Date
                </label>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {item.due_date ? new Date(item.due_date).toLocaleDateString() : 'No current due date'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Requested New Due Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  min={
                    item.due_date
                      ? new Date(new Date(item.due_date).getTime() + 86400000).toISOString().split('T')[0]
                      : new Date().toISOString().split('T')[0]
                  }
                  value={requestedDueDate}
                  onChange={(e) => setRequestedDueDate(e.target.value)}
                  className="w-full p-2.5 bg-white rounded-xl border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Reason for Extension <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  maxLength={2000}
                  value={extensionReason}
                  onChange={(e) => setExtensionReason(e.target.value)}
                  placeholder="Explain why you need additional time to complete this deliverable..."
                  className="w-full p-2.5 bg-white rounded-xl border border-slate-200 text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600 resize-none"
                />
                <div className="text-[10px] text-right text-slate-400 mt-0.5">
                  {extensionReason.length} / 2000
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsExtensionModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={extensionSubmitting}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-purple-600 hover:bg-purple-700 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  {extensionSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Time Correction Request Modal */}
      {isCorrectionModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden text-xs">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-amber-50/70">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-amber-100 text-amber-700">
                  <RotateCcw className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Request Time Correction
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Deduct accidental excess time from this recorded session
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCorrectionModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCorrectionSubmit} className="p-5 space-y-4">
              {correctionError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{correctionError}</span>
                </div>
              )}

              {correctionTargetEntry && (
                <>
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Original Recorded Time:</span>
                      <span className="font-bold text-slate-900 font-mono text-xs">
                        {correctionTargetEntry.duration_formatted || `${correctionTargetEntry.duration_minutes || 0}m`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span>Excess to Deduct:</span>
                      <span className="font-bold text-rose-600 font-mono text-xs">
                        -{correctionExcessMinutes}m
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between font-bold">
                      <span className="text-slate-800">New Corrected Time:</span>
                      <span className="text-emerald-700 font-mono text-sm">
                        {Math.max(0, (correctionTargetEntry.duration_minutes || 0) - correctionExcessMinutes)}m
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Excess Minutes to Remove *
                      </label>
                      <span className="text-[10px] text-slate-400">
                        Max: {(correctionTargetEntry.duration_minutes || 1) - 1}m
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="1"
                        max={(correctionTargetEntry.duration_minutes || 1) - 1}
                        value={correctionExcessMinutes}
                        onChange={(e) => setCorrectionExcessMinutes(Number(e.target.value) || 0)}
                        required
                        className="w-28 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:border-amber-500 font-mono text-xs"
                      />
                      <span className="text-slate-500 text-xs">mins</span>
                      <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                        {[15, 30, 45, 60].map((mins) => (
                          (correctionTargetEntry.duration_minutes || 0) > mins && (
                            <button
                              key={mins}
                              type="button"
                              onClick={() => setCorrectionExcessMinutes(mins)}
                              className={`px-2 py-0.5 rounded-lg border text-[10px] font-medium transition-colors cursor-pointer ${
                                correctionExcessMinutes === mins
                                  ? 'bg-amber-100 border-amber-300 text-amber-800 font-bold'
                                  : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-600'
                              }`}
                            >
                              {mins}m
                            </button>
                          )
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Reason for Correction *
                    </label>
                    <textarea
                      rows={3}
                      value={correctionReason}
                      onChange={(e) => setCorrectionReason(e.target.value)}
                      placeholder="e.g., Accidentally left timer running while stepped away from workstation"
                      required
                      minLength={5}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:border-amber-500 text-xs placeholder:text-slate-400"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Your manager will receive a notification to review and approve this correction.
                    </p>
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCorrectionModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={correctionSubmitting || !correctionTargetEntry || correctionExcessMinutes <= 0 || !correctionReason.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{correctionSubmitting ? 'Submitting...' : 'Submit Request'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
