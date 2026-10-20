import React, { useState, useEffect } from 'react';
import { 
  X, 
  Clock, 
  User, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Edit2, 
  Save, 
  Loader2, 
  Plus, 
  GitFork, 
  Calendar,
  Layers,
  Search,
  MessageSquare
} from 'lucide-react';
import { workItemsService } from '../../services/workItems.service';
import { projectsService } from '../../services/projects.service';
import { sprintsService } from '../../services/sprints.service';
import { timesheetService } from '../../services/timesheet.service';
import { useAuth } from '../../context/AuthContext';
import AddTaskModal from './AddTaskModal';
import WorkItemComments from '../common/WorkItemComments';

const STATUS_OPTIONS = [
  { id: 'TODO', label: 'To Do' },
  { id: 'IN_PROGRESS', label: 'In Progress' },
  { id: 'IN_REVIEW', label: 'In Review' },
  { id: 'COMPLETED', label: 'Completed' },
  { id: 'BLOCKED', label: 'Blocked' },
];

const PRIORITY_OPTIONS = [
  { id: 'LOW', label: 'Low' },
  { id: 'MEDIUM', label: 'Medium' },
  { id: 'HIGH', label: 'High' },
  { id: 'URGENT', label: 'Urgent' },
];

export default function TaskDetailModal({
  task,
  isOpen,
  onClose,
  onTaskUpdated,
  onUpdateTask,
  onTaskDeleted,
  onDeleteTask,
  onToast,
  hideAssignees = false,
  isKanban = false,
  projectId = null,
}) {
  const { user: authUser } = useAuth();
  const [projectMethodology, setProjectMethodology] = useState(null);

  useEffect(() => {
    const effectivePid = projectId || task?.project_id;
    if (effectivePid && !isKanban) {
      projectsService
        .getProjectById(effectivePid)
        .then((p) => {
          if (p?.methodology) setProjectMethodology(p.methodology);
        })
        .catch(() => {});
    }
  }, [projectId, task?.project_id, isKanban]);

  const isKanbanProject = isKanban || projectMethodology === 'KANBAN' || task?.project?.methodology === 'KANBAN';
  const Term = isKanbanProject ? 'Cycle' : 'Sprint';
  const term = isKanbanProject ? 'cycle' : 'sprint';

  const [liveTask, setLiveTask] = useState(task || {});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [assigneeLoading, setAssigneeLoading] = useState(false);
  const [error, setError] = useState('');
  const [taskSession, setTaskSession] = useState(null);
  const [taskSessionLoading, setTaskSessionLoading] = useState(false);

  const notifyTaskUpdated = (updated) => {
    (onTaskUpdated || onUpdateTask)?.(updated);
  };
  const notifyTaskDeleted = (id) => {
    (onTaskDeleted || onDeleteTask)?.(id);
  };

  // Editable fields
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [status, setStatus] = useState(task?.status || 'TODO');
  const [priority, setPriority] = useState(task?.priority || 'MEDIUM');
  const [storyPoints, setStoryPoints] = useState(task?.story_points ?? '');
  const [startDate, setStartDate] = useState(
    task?.start_date ? task.start_date.split('T')[0] : ''
  );
  const [dueDate, setDueDate] = useState(
    task?.due_date ? task.due_date.split('T')[0] : ''
  );

  // Due-Date Extension Requests
  const [extensionRequests, setExtensionRequests] = useState([]);
  const [decisionNote, setDecisionNote] = useState('');
  const [decidingId, setDecidingId] = useState(null);
  const [isExtensionModalOpen, setIsExtensionModalOpen] = useState(false);
  const [requestedDueDate, setRequestedDueDate] = useState('');
  const [extensionReason, setExtensionReason] = useState('');
  const [extensionSubmitting, setExtensionSubmitting] = useState(false);
  const [extensionError, setExtensionError] = useState('');

  const loadExtensionRequests = async (id) => {
    if (!id) return;
    try {
      const res = await workItemsService.getExtensionRequests(id);
      setExtensionRequests(Array.isArray(res) ? res : []);
    } catch {
      setExtensionRequests([]);
    }
  };

  const handleDecideExtension = async (decision) => {
    const pendingReq = extensionRequests.find((r) => r.status === 'PENDING') || liveTask.pending_extension;
    if (!pendingReq || !liveTask.id) return;
    try {
      setDecidingId(pendingReq.id);
      const res = await workItemsService.decideExtension(liveTask.id, pendingReq.id, {
        decision,
        decision_note: decisionNote.trim() || undefined,
      });
      await loadExtensionRequests(liveTask.id);
      setDecisionNote('');
      onToast?.(`Extension ${decision === 'APPROVE' ? 'approved' : 'rejected'}`);
      if (res.work_item) {
        setLiveTask(res.work_item);
        if (res.work_item.due_date) {
          setDueDate(res.work_item.due_date.split('T')[0]);
        }
        notifyTaskUpdated(res.work_item);
      } else {
        const nextDate = decision === 'APPROVE' && pendingReq.requested_due_date ? pendingReq.requested_due_date.split('T')[0] : dueDate;
        setDueDate(nextDate);
        notifyTaskUpdated({
          ...liveTask,
          due_date: decision === 'APPROVE' ? pendingReq.requested_due_date : liveTask.due_date,
          has_pending_extension: false,
          pending_extension: null,
        });
      }
    } catch (err) {
      setError(err.message || 'Failed to record decision');
    } finally {
      setDecidingId(null);
    }
  };

  const handleRequestExtension = async (e) => {
    e?.preventDefault();
    setExtensionError('');
    if (!requestedDueDate) {
      setExtensionError('Please select a new requested due date.');
      return;
    }
    const currentDue = liveTask.due_date ? new Date(liveTask.due_date).getTime() : 0;
    const chosen = new Date(requestedDueDate).getTime();
    if (liveTask.due_date && chosen <= currentDue) {
      setExtensionError('Requested due date must be later than the current due date.');
      return;
    }
    if (!liveTask.due_date && chosen <= Date.now()) {
      setExtensionError('Requested due date must be in the future.');
      return;
    }
    if (!extensionReason || !extensionReason.trim()) {
      setExtensionError('Reason is mandatory.');
      return;
    }
    try {
      setExtensionSubmitting(true);
      const res = await workItemsService.requestExtension(liveTask.id, {
        requested_due_date: new Date(requestedDueDate).toISOString(),
        reason: extensionReason.trim(),
      });
      setIsExtensionModalOpen(false);
      setRequestedDueDate('');
      setExtensionReason('');
      await loadExtensionRequests(liveTask.id);
      onToast?.('Extension request submitted');
      notifyTaskUpdated({
        ...liveTask,
        has_pending_extension: true,
        pending_extension: res,
      });
    } catch (err) {
      setExtensionError(err.message || 'Failed to submit extension request');
    } finally {
      setExtensionSubmitting(false);
    }
  };

  // Assignees
  const [projectMembers, setProjectMembers] = useState([]);
  const [selectedNewAssignee, setSelectedNewAssignee] = useState('');
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [projectSprints, setProjectSprints] = useState([]);
  const [childModal, setChildModal] = useState({
    isOpen: false,
    initialType: 'STORY',
    allowedTypes: ['STORY', 'BUG'],
  });

  // Reload task details from backend
  const fetchTaskDetails = async (id) => {
    try {
      setLoading(true);
      setError('');
      const data = await workItemsService.getWorkItem(id);
      setLiveTask(data);
      setTitle(data.title || '');
      setDescription(data.description || '');
      setStatus(data.status || 'TODO');
      setPriority(data.priority || 'MEDIUM');
      setStoryPoints(data.story_points ?? '');
      setStartDate(data.start_date ? data.start_date.split('T')[0] : '');
      setDueDate(data.due_date ? data.due_date.split('T')[0] : '');
      loadExtensionRequests(id);
    } catch (err) {
      setError(err.message || 'Failed to fetch task details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && task?.id) {
      fetchTaskDetails(task.id);
      setIsEditing(false);
      setError('');
    }
  }, [isOpen, task?.id]);

  // Load project members and sprints for assignee selection and child creation
  useEffect(() => {
    if (isOpen && liveTask?.project_id) {
      projectsService
        .getMembers(liveTask.project_id)
        .then((members) => setProjectMembers(members || []))
        .catch((err) => console.error('Failed to load project members:', err));

      if (!isKanbanProject) {
        sprintsService
          .getSprints(liveTask.project_id)
          .then((s) => setProjectSprints(s || []))
          .catch((err) => console.error('Failed to load project sprints:', err));
      } else {
        setProjectSprints([]);
      }
    }
  }, [isOpen, liveTask?.project_id, isKanbanProject]);

  useEffect(() => {
    if (!isOpen || !liveTask?.id) return;
    let cancelled = false;
    setTaskSessionLoading(true);
    timesheetService
      .getActiveTaskSession(liveTask.id)
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
  }, [isOpen, liveTask?.id]);

  useEffect(() => {
    if (!isOpen || !liveTask?.id) return;
    const handleSync = () => {
      timesheetService
        .getActiveTaskSession(liveTask.id)
        .then((data) => setTaskSession(data?.session || null))
        .catch(() => setTaskSession(null));
    };

    window.addEventListener('timer-session-updated', handleSync);
    window.addEventListener('focus', handleSync);
    const handleVis = () => {
      if (document.visibilityState === 'visible') {
        handleSync();
      }
    };
    document.addEventListener('visibilitychange', handleVis);

    return () => {
      window.removeEventListener('timer-session-updated', handleSync);
      window.removeEventListener('focus', handleSync);
      document.removeEventListener('visibilitychange', handleVis);
    };
  }, [isOpen, liveTask?.id]);

  const handleStatusChange = async (newStatus) => {
    try {
      setStatus(newStatus);
      const updated = await workItemsService.updateWorkItem(liveTask.id, { status: newStatus });
      setLiveTask(updated);
      onToast?.(`Status updated to ${newStatus}`);
      notifyTaskUpdated(updated);
    } catch (err) {
      setError(err.message || 'Failed to update status');
    }
  };

  const handlePriorityChange = async (newPriority) => {
    try {
      setPriority(newPriority);
      const updated = await workItemsService.updateWorkItem(liveTask.id, { priority: newPriority });
      setLiveTask(updated);
      onToast?.(`Priority changed to ${newPriority}`);
      notifyTaskUpdated(updated);
    } catch (err) {
      setError(err.message || 'Failed to update priority');
    }
  };

  const handleStartDateChange = async (newDate) => {
    try {
      setStartDate(newDate);
      const isoDate = newDate ? new Date(newDate).toISOString() : null;
      const updated = await workItemsService.updateWorkItem(liveTask.id, { start_date: isoDate });
      setLiveTask(updated);
      onToast?.(newDate ? `Start date set to ${newDate}` : 'Start date cleared');
      notifyTaskUpdated(updated);
    } catch (err) {
      setError(err.message || 'Failed to update start date');
    }
  };

  const handleDueDateChange = async (newDate) => {
    try {
      setDueDate(newDate);
      const isoDate = newDate ? new Date(newDate).toISOString() : null;
      const updated = await workItemsService.updateWorkItem(liveTask.id, { due_date: isoDate });
      setLiveTask(updated);
      onToast?.(newDate ? `Due date set to ${newDate}` : 'Due date cleared');
      notifyTaskUpdated(updated);
    } catch (err) {
      setError(err.message || 'Failed to update due date');
    }
  };

  const handleSprintChange = async (newSprintId) => {
    try {
      const targetId = !newSprintId || newSprintId === 'backlog' ? null : newSprintId;
      const updated = await workItemsService.updateWorkItem(liveTask.id, { sprint_id: targetId });
      setLiveTask(updated);
      const sName = targetId ? projectSprints.find((s) => s.id === targetId)?.name || Term : 'Backlog';
      onToast?.(`Assigned to ${sName}`);
      notifyTaskUpdated(updated);
    } catch (err) {
      setError(err.message || `Failed to update ${term} assignment`);
    }
  };

  const handleToggleDone = async () => {
    const isCurrentlyDone = (status === 'COMPLETED' || liveTask?.status === 'COMPLETED');
    const nextStatus = isCurrentlyDone ? 'TODO' : 'COMPLETED';
    await handleStatusChange(nextStatus);
  };

  const handleSaveEdits = async () => {
    if (!title.trim()) {
      setError('Title cannot be empty');
      return;
    }

    const requiresStoryPoints = ['TASK', 'SUBTASK', 'BUG', 'STORY'].includes(liveTask.type);
    const sp = Number(storyPoints);
    if (requiresStoryPoints && !isIntern) {
      if (
        storyPoints === '' ||
        storyPoints === null ||
        storyPoints === undefined ||
        isNaN(sp) ||
        !Number.isInteger(sp) ||
        sp < 0
      ) {
        setError('Story points are mandatory for tasks, stories, subtasks, and bugs and must be a non-negative integer (0 or greater).');
        return;
      }
    }

    try {
      setSaving(true);
      setError('');
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        start_date: startDate ? new Date(startDate).toISOString() : null,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        ...(!isIntern && storyPoints !== '' && !isNaN(sp) && sp >= 0 ? { story_points: sp } : {}),
      };

      const updated = await workItemsService.updateWorkItem(liveTask.id, payload);

      setLiveTask(updated);
      setIsEditing(false);
      onToast?.('Task details saved successfully');
      notifyTaskUpdated(updated);
    } catch (err) {
      setError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleAddAssignee = async () => {
    if (!selectedNewAssignee || assigneeLoading) return;
    try {
      setAssigneeLoading(true);
      setError('');
      const updated = await workItemsService.addAssignee(liveTask.id, selectedNewAssignee);
      setLiveTask(updated);
      setSelectedNewAssignee('');
      onToast?.('Assignee added');
      notifyTaskUpdated(updated);
    } catch (err) {
      setError(err.message || 'Failed to add assignee');
    } finally {
      setAssigneeLoading(false);
    }
  };

  const handleRemoveAssignee = async (userId) => {
    if (assigneeLoading) return;
    try {
      setAssigneeLoading(true);
      setError('');
      await workItemsService.removeAssignee(liveTask.id, userId);
      const nextAssignees = (liveTask.assignees || []).filter((a) => a.user_id !== userId && a.id !== userId);
      const updated = {
        ...liveTask,
        assignees: nextAssignees,
      };
      setLiveTask(updated);
      onToast?.('Assignee removed');
      notifyTaskUpdated(updated);
    } catch (err) {
      setError(err.message || 'Failed to remove assignee');
    } finally {
      setAssigneeLoading(false);
    }
  };

  const handleDelete = async () => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete this ${(liveTask.type || 'task').toLowerCase()}?\n"${liveTask.title}"`
    );
    if (!confirmDelete) return;

    try {
      setDeleting(true);
      setError('');
      await workItemsService.deleteWorkItem(liveTask.id);
      onToast?.('Task deleted successfully');
      notifyTaskDeleted(liveTask.id);
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

  const isOverdue = liveTask.is_overdue || workItemsService.isOverdue(liveTask);
  const pendingExtension = extensionRequests.find((r) => r.status === 'PENDING') || liveTask.pending_extension || null;
  const latestReviewedExtension = extensionRequests.find((r) => r.status !== 'PENDING') || null;
  const children = liveTask.children || [];
  const parent = liveTask.parent;
  const currentAssignees = liveTask.assignees || [];
  const authRole = String(authUser?.role?.name || authUser?.role || authUser?.type || authUser?.user_type || '').toUpperCase();
  const authUserId = authUser?.id || authUser?.user_id || authUser?.userId || authUser?.user?.id;
  const assignedUserIds = [
    ...currentAssignees.map((assignee) => assignee.user_id || assignee.userId || assignee.assignee_id || assignee.user?.id || assignee.user?.user_id || assignee.id),
    ...(liveTask.assignee_ids || liveTask.assigneeIds || []),
  ].filter(Boolean).map(String);
  const isAssignedIntern = ['INTERN', 'EMPLOYEE'].includes(authRole) && Boolean(authUserId) && assignedUserIds.includes(String(authUserId));
  const effectivePid = projectId || task?.project_id || liveTask?.project_id;
  const isTechLead =
    authRole === 'TECH_LEAD' ||
    Boolean(authUser?.is_tech_lead) ||
    Boolean(authUser?.lead_project_ids?.includes(effectivePid));
  const isManagerOrAdmin =
    authUser?.role === 'MANAGER' ||
    authUser?.role === 'ADMIN' ||
    authUser?.role === 'TECH_LEAD' ||
    authRole === 'MANAGER' ||
    authRole === 'ADMIN' ||
    authRole === 'SUPER_ADMIN' ||
    isTechLead;
  const isManagerOrLead = isManagerOrAdmin;
  const isIntern = authRole === 'INTERN' && !isTechLead;
  const isCreator = Boolean(authUserId && (liveTask.created_by === authUserId || liveTask.creator_id === authUserId));
  const canDelete = Boolean(liveTask?.id) && (isManagerOrAdmin || !isIntern || isCreator);
  const canEditFields = !isIntern || isManagerOrAdmin;
  const canUpdateStatus = !isIntern || isAssignedIntern || isManagerOrAdmin;
  const canAssignOrReassign = !isIntern || isManagerOrAdmin;

  // Story-level aggregated task story points
  const childTasks = children.filter((c) => c.type === 'TASK' || c.type === 'BUG');
  const storyTotalSp = childTasks.reduce((sum, c) => sum + (Number(c.story_points) || 0), 0);
  const storyCompletedSp = childTasks
    .filter((c) => c.status === 'COMPLETED')
    .reduce((sum, c) => sum + (Number(c.story_points) || 0), 0);
  const storyRemainingSp = Math.max(0, storyTotalSp - storyCompletedSp);
  const storyProgress = storyTotalSp > 0 ? Math.round((storyCompletedSp / storyTotalSp) * 100) : null;

  const handleStartWork = async () => {
    if (authRole === 'MANAGER') {
      setError('Managers do not have permission to start timers on tasks');
      return;
    }
    try {
      setTaskSessionLoading(true);
      setError('');
      const response = await timesheetService.startSession({ task_id: liveTask.id });
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
      const response = await timesheetService.endSession({ task_id: liveTask.id });
      setTaskSession(null);
      onToast?.(`Work stopped: ${response.session?.time_entry?.duration_minutes || 0} minutes recorded`);
    } catch (err) {
      setError(err.message || 'Unable to stop work');
    } finally {
      setTaskSessionLoading(false);
    }
  };

  if (!isOpen || !task) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">
              {liveTask.type}
            </span>
            <span className="text-xs font-mono font-medium text-slate-500">
              {liveTask.id}
            </span>
            {isOverdue && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                <span>OVERDUE</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {canUpdateStatus && (
              <button
                type="button"
                onClick={handleToggleDone}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  (status === 'COMPLETED' || liveTask?.status === 'COMPLETED')
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{(status === 'COMPLETED' || liveTask?.status === 'COMPLETED') ? 'Done' : 'Mark as Done'}</span>
              </button>
            )}

            {canEditFields && (
              !isEditing ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Edit2 className="w-3 h-3 text-slate-500" />
                  <span>Edit</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSaveEdits}
                  disabled={saving}
                  className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  <span>Save</span>
                </button>
              )
            )}

            {canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                title="Delete task"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin text-rose-600" /> : <Trash2 className="w-4 h-4" />}
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Title Area */}
          <div>
            {isEditing ? (
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-semibold rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:border-purple-600"
                />
              </div>
            ) : (
              <h2 className="text-base font-bold text-slate-900 leading-snug">
                {liveTask.title}
              </h2>
            )}
          </div>

          {/* Due-Date Extension Request Banner */}
          {pendingExtension && (
            <div className="p-3.5 rounded-xl border border-amber-300 bg-amber-50/90 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                    Due Date Extension Requested
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-800">
                  PENDING REVIEW
                </span>
              </div>

              <div className="text-xs text-amber-950 space-y-1">
                <div>
                  <span className="text-slate-500">Requested by: </span>
                  <span className="font-semibold text-slate-800">
                    {pendingExtension.requester?.name || pendingExtension.requester?.email || 'Intern'}
                  </span>
                  <span className="text-slate-400 text-[10px] ml-1.5">
                    ({new Date(pendingExtension.created_at).toLocaleString()})
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div>
                    <span className="text-slate-500">Current Due Date: </span>
                    <span className="font-medium line-through text-slate-600">
                      {pendingExtension.original_due_date ? new Date(pendingExtension.original_due_date).toLocaleDateString() : 'None'}
                    </span>
                  </div>
                  <div>
                    <span className="text-amber-800 font-semibold">Requested: </span>
                    <span className="font-bold text-amber-900">
                      {new Date(pendingExtension.requested_due_date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="mt-1 pt-1 border-t border-amber-200/60">
                  <span className="font-semibold text-amber-900">Reason: </span>
                  <span className="italic text-amber-900">"{pendingExtension.reason}"</span>
                </div>
              </div>

              {/* Decision note & Action buttons for Manager */}
              {isManagerOrLead && (
                <div className="pt-2 border-t border-amber-200 space-y-2">
                  <input
                    type="text"
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                    placeholder="Optional decision note for intern..."
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-amber-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={decidingId === pendingExtension.id}
                      onClick={() => handleDecideExtension('REJECT')}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={decidingId === pendingExtension.id}
                      onClick={() => handleDecideExtension('APPROVE')}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      {decidingId === pendingExtension.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Approve Extension
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Story Progress Banner (Aggregated Child Task SP) */}
          {liveTask.type === 'STORY' && (
            <div className="p-3 bg-purple-50/70 border border-purple-200/80 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-purple-900 uppercase text-[10px] tracking-wider">
                  Story Progress (Aggregated Task SP)
                </span>
                <span className="font-mono font-bold text-purple-800">
                  {storyTotalSp > 0
                    ? `${storyCompletedSp} / ${storyTotalSp} SP (${storyProgress}%)`
                    : 'No task story points defined'}
                </span>
              </div>
              <div className="w-full bg-purple-200/60 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-purple-600 h-full rounded-full transition-all"
                  style={{ width: `${storyProgress || 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-purple-700 pt-0.5 font-medium">
                <span>{childTasks.length} child task{childTasks.length === 1 ? '' : 's'}</span>
                <span>{storyRemainingSp} SP remaining</span>
              </div>
            </div>
          )}

          {/* Status, Priority, Sprint & Story Points Row */}
          <div className={`grid grid-cols-2 ${!isKanbanProject ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} gap-3 p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/70`}>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Status
              </label>
              {canUpdateStatus ? (
                <select
                  value={status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 font-semibold focus:outline-none focus:border-purple-600 text-xs"
                >
                  {STATUS_OPTIONS.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-700 font-semibold text-xs">
                  {STATUS_OPTIONS.find((s) => s.id === status)?.label || status}
                </div>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Priority
              </label>
              {canEditFields ? (
                <select
                  value={priority}
                  onChange={(e) => handlePriorityChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 font-semibold focus:outline-none focus:border-purple-600 text-xs"
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-700 font-semibold text-xs">
                  {PRIORITY_OPTIONS.find((p) => p.id === priority)?.label || priority}
                </div>
              )}
            </div>

            {Boolean(liveTask.project_id) && liveTask.type !== 'EPIC' && !isKanbanProject && (
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Sprint
                </label>
                {canEditFields ? (
                  <select
                    value={liveTask.sprint_id || 'backlog'}
                    onChange={(e) => handleSprintChange(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 font-semibold focus:outline-none focus:border-purple-600 text-xs"
                  >
                    <option value="backlog">Backlog (No Sprint)</option>
                    {projectSprints.map((s) => (
                      <option key={s.id} value={s.id} disabled={s.status === 'COMPLETED' && liveTask.sprint_id !== s.id}>
                        {s.name} {s.status === 'COMPLETED' ? '(Completed)' : s.status === 'ACTIVE' ? '(Active)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-700 font-semibold text-xs truncate">
                    {liveTask.sprint?.name || projectSprints.find((s) => s.id === liveTask.sprint_id)?.name || 'Backlog (No Sprint)'}
                  </div>
                )}
              </div>
            )}

            {liveTask.type !== 'EPIC' && (
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Story Points *
                </label>
                {canEditFields && isEditing ? (
                  <input
                    type="number"
                    min="0"
                    max="99"
                    step="1"
                    value={storyPoints}
                    onChange={(e) => setStoryPoints(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-purple-300 bg-white text-slate-800 font-mono font-bold text-xs focus:outline-none focus:border-purple-600"
                  />
                ) : (
                  <div className="px-2.5 py-1.5 rounded-lg border border-purple-100 bg-purple-50 text-purple-700 font-mono font-bold text-xs flex items-center justify-between">
                    <span>{liveTask.story_points !== null && liveTask.story_points !== undefined ? `${liveTask.story_points} SP` : '—'}</span>
                    {canEditFields && !isEditing && (
                      <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="text-[10px] text-purple-600 hover:underline font-sans font-normal cursor-pointer"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {isAssignedIntern && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-violet-100 bg-violet-50/50 p-3.5">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-violet-700">Task work timer</div>
                <div className="mt-1 text-xs text-slate-600">{taskSession ? `Started ${new Date(taskSession.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Record actual work time for this task.'}</div>
              </div>
              <button type="button" onClick={taskSession ? handleStopWork : handleStartWork} disabled={taskSessionLoading} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50 ${taskSession ? 'bg-rose-600 hover:bg-rose-700' : 'bg-violet-600 hover:bg-violet-700'}`}>
                {taskSessionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
                {taskSession ? 'Stop Work' : 'Start Work'}
              </button>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Description
            </label>
            {isEditing ? (
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:border-purple-600 resize-none"
              />
            ) : (
              <div className="p-3 bg-white rounded-xl border border-slate-200 text-slate-700 leading-relaxed min-h-[60px] whitespace-pre-wrap">
                {liveTask.description || <span className="text-slate-400 italic">No description provided.</span>}
              </div>
            )}
          </div>

          {/* Timeline / Dates - Directly editable */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Start Date</span>
                </label>
                {canEditFields && startDate && (
                  <button
                    type="button"
                    onClick={() => handleStartDateChange('')}
                    className="text-[10px] font-semibold text-slate-400 hover:text-rose-600 transition-colors"
                    title="Clear start date"
                  >
                    Clear
                  </button>
                )}
              </div>
              {canEditFields ? (
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs font-medium focus:outline-hidden focus:border-purple-600 focus:ring-2 focus:ring-purple-500/20"
                />
              ) : (
                <div className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 text-xs font-medium">
                  {startDate || <span className="text-slate-400 italic">Not set</span>}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Due Date</span>
                </label>
                {canEditFields && dueDate && (
                  <button
                    type="button"
                    onClick={() => handleDueDateChange('')}
                    className="text-[10px] font-semibold text-slate-400 hover:text-rose-600 transition-colors"
                    title="Clear due date"
                  >
                    Clear
                  </button>
                )}
              </div>
              {canEditFields ? (
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => handleDueDateChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs font-medium focus:outline-hidden focus:border-purple-600 focus:ring-2 focus:ring-purple-500/20"
                />
              ) : (
                <div className="space-y-1.5">
                  <div className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 text-xs font-medium">
                    {dueDate || <span className="text-slate-400 italic">Not set</span>}
                  </div>
                  {Boolean(liveTask.project_id) && (
                    pendingExtension ? (
                      <div className="px-2 py-1 rounded bg-amber-100 text-amber-800 text-[11px] font-semibold flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-600" />
                        <span>Extension Pending ({new Date(pendingExtension.requested_due_date).toLocaleDateString([], { month: 'short', day: 'numeric' })})</span>
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
                        className="w-full py-1 px-2 text-xs font-semibold rounded bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Calendar className="w-3.5 h-3.5 text-purple-600" />
                        <span>Request Extension</span>
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Hierarchy Section: Parent & Children (Shown for project work items) */}
          {Boolean(liveTask.project_id) && (
            <div className="space-y-3 pt-3 border-t border-slate-100">
              {parent && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Parent Work Item (Click to open)
                  </span>
                  <div
                    onClick={() => fetchTaskDetails(parent.id)}
                    className="p-2.5 bg-purple-50/70 border border-purple-200/80 rounded-xl flex items-center justify-between cursor-pointer hover:bg-purple-100/70 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-200 text-purple-900">
                        {parent.type}
                      </span>
                      <span className="font-semibold text-slate-800 truncate text-xs">
                        {parent.title}
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold text-purple-700 uppercase">
                      {parent.status}
                    </span>
                  </div>
                </div>
              )}

              {/* Children Header with Context-Sensitive Actions */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Child Items ({children.length})
                </span>

                {/* Context-Sensitive Actions based on Jira Hierarchy */}
                {(!isIntern || isManagerOrAdmin) && liveTask.type === 'EPIC' && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setChildModal({
                           isOpen: true,
                          initialType: 'STORY',
                          allowedTypes: ['STORY', 'BUG'],
                        })
                      }
                      className="px-2.5 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Create Story</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setChildModal({
                          isOpen: true,
                          initialType: 'BUG',
                          allowedTypes: ['STORY', 'BUG'],
                        })
                      }
                      className="px-2.5 py-1 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Create Bug</span>
                    </button>
                  </div>
                )}

                {liveTask.type === 'STORY' && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setChildModal({
                          isOpen: true,
                          initialType: 'TASK',
                          allowedTypes: ['TASK', 'BUG'],
                        })
                      }
                      className="px-2.5 py-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Create Task</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setChildModal({
                          isOpen: true,
                          initialType: 'BUG',
                          allowedTypes: ['TASK', 'BUG'],
                        })
                      }
                      className="px-2.5 py-1 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Create Bug</span>
                    </button>
                  </div>
                )}

                {liveTask.type === 'TASK' && (
                  <button
                    type="button"
                    onClick={() =>
                      setChildModal({
                        isOpen: true,
                        initialType: 'SUBTASK',
                        allowedTypes: ['SUBTASK'],
                      })
                    }
                    className="px-2.5 py-1 text-[11px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Create Subtask</span>
                  </button>
                )}

                {(liveTask.type === 'SUBTASK' || liveTask.type === 'BUG') && (
                  <span className="text-[10px] font-medium text-slate-400 italic">
                    Leaf item · No child items allowed
                  </span>
                )}
              </div>

              {/* Children List */}
              {children.length === 0 ? (
                <div className="p-3 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                  No child items yet.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {children.map((child) => (
                    <div
                      key={child.id}
                      onClick={() => fetchTaskDetails(child.id)}
                      className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg flex items-center justify-between cursor-pointer transition-colors"
                      title="Click to view details"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                            child.type === 'BUG'
                              ? 'bg-rose-100 text-rose-700 border border-rose-200'
                              : child.type === 'STORY'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : child.type === 'TASK'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-purple-100 text-purple-800 border border-purple-200'
                          }`}
                        >
                          {child.type}
                        </span>
                        <span className="font-medium text-slate-800 truncate text-xs">
                          {child.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {child.story_points > 0 && (
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                            {child.story_points} SP
                          </span>
                        )}
                        <span className="text-[10px] text-slate-500 font-semibold uppercase">
                          {child.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Assignees Section - only shown for project tasks when hideAssignees is not true */}
          {!hideAssignees && Boolean(liveTask.project_id) && (
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  <span>Assignees ({currentAssignees.length})</span>
                </label>
              </div>

            <div className="space-y-2">
              {currentAssignees.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic">No assignees yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {currentAssignees.map((a) => (
                    <div
                      key={a.user_id || a.id}
                      className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 bg-purple-50 border border-purple-200 text-purple-800 rounded-lg text-[11px] font-medium"
                    >
                      <span>{a.name || a.email || a.user?.name || a.user?.email || 'Assignee'}</span>
                      {canAssignOrReassign && (
                        <button
                          type="button"
                          onClick={() => handleRemoveAssignee(a.user_id || a.id)}
                          className="p-0.5 text-purple-400 hover:text-rose-600 rounded cursor-pointer"
                          title="Remove assignee"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add Assignee Selector with Search */}
              {canAssignOrReassign && projectMembers.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="relative">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={assigneeSearch}
                      onChange={(e) => setAssigneeSearch(e.target.value)}
                      placeholder="Search members by name or email..."
                      className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs focus:outline-none focus:border-purple-600"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedNewAssignee}
                      disabled={assigneeLoading}
                      onChange={(e) => setSelectedNewAssignee(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs focus:outline-none focus:border-purple-600 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <option value="">Select project member to assign...</option>
                      {projectMembers
                        .filter((m) => !currentAssignees.some((a) => (a.user_id || a.id) === (m.user_id || m.id)))
                        .filter((m) => {
                          if (!assigneeSearch.trim()) return true;
                          const q = assigneeSearch.toLowerCase();
                          const name = (m.name || m.user?.name || '').toLowerCase();
                          const email = (m.email || m.user?.email || '').toLowerCase();
                          return name.includes(q) || email.includes(q);
                        })
                        .map((m) => (
                          <option key={m.id || m.user_id} value={m.user_id || m.id}>
                            {m.name || m.user?.name} ({m.email || m.user?.email})
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAddAssignee}
                      disabled={!selectedNewAssignee || assigneeLoading}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-purple-100 text-purple-700 font-bold rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      {assigneeLoading && <Loader2 className="w-3 h-3 text-purple-600 animate-spin" />}
                      <span>Assign</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          )}

          {/* Discussion & Comments Section */}
          <div className="pt-4 border-t border-slate-200">
            <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-purple-600" />
              <span>Discussion & Comments</span>
            </h4>
            <WorkItemComments workItemId={liveTask.id} onToast={onToast} />
          </div>
        </div>
      </div>

      {/* Context-sensitive Child Creation Submodal */}
      {childModal.isOpen && (
        <AddTaskModal
          isOpen={childModal.isOpen}
          onClose={() =>
            setChildModal({
              isOpen: false,
              initialType: 'STORY',
              allowedTypes: [],
            })
          }
          projectId={liveTask.project_id}
          parentItem={liveTask}
          initialType={childModal.initialType}
          allowedTypes={childModal.allowedTypes}
          initialSprintId={liveTask.sprint_id || null}
          sprints={projectSprints}
          onTaskCreated={async (newChild) => {
            await fetchTaskDetails(liveTask.id);
            notifyTaskUpdated(newChild);
            onToast?.(`Created child ${newChild.type.toLowerCase()}: "${newChild.title}"`);
          }}
          onToast={onToast}
        />
      )}

      {/* Request Extension Modal Dialog */}
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
                  {liveTask.title}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Current Due Date
                </label>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {liveTask.due_date ? new Date(liveTask.due_date).toLocaleDateString() : 'No current due date'}
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
                    liveTask.due_date
                      ? new Date(new Date(liveTask.due_date).getTime() + 86400000).toISOString().split('T')[0]
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
    </div>
  );
}
