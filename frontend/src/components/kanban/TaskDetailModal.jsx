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
  Search
} from 'lucide-react';
import { workItemsService } from '../../services/workItems.service';
import { projectsService } from '../../services/projects.service';
import { timesheetService } from '../../services/timesheet.service';
import { useAuth } from '../../context/AuthContext';

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
  onTaskDeleted,
  onToast,
}) {
  if (!isOpen || !task) return null;

  const { user: authUser } = useAuth();
  const [liveTask, setLiveTask] = useState(task);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [taskSession, setTaskSession] = useState(null);
  const [taskSessionLoading, setTaskSessionLoading] = useState(false);

  // Editable fields
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(task.title || '');
  const [description, setDescription] = useState(task.description || '');
  const [status, setStatus] = useState(task.status || 'TODO');
  const [priority, setPriority] = useState(task.priority || 'MEDIUM');
  const [startDate, setStartDate] = useState(
    task.start_date ? task.start_date.split('T')[0] : ''
  );
  const [dueDate, setDueDate] = useState(
    task.due_date ? task.due_date.split('T')[0] : ''
  );

  // Assignees
  const [projectMembers, setProjectMembers] = useState([]);
  const [selectedNewAssignee, setSelectedNewAssignee] = useState('');
  const [assigneeSearch, setAssigneeSearch] = useState('');

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
      setStartDate(data.start_date ? data.start_date.split('T')[0] : '');
      setDueDate(data.due_date ? data.due_date.split('T')[0] : '');
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

  // Load project members for assignee selection
  useEffect(() => {
    if (isOpen && liveTask?.project_id) {
      projectsService
        .getMembers(liveTask.project_id)
        .then((members) => setProjectMembers(members || []))
        .catch((err) => console.error('Failed to load project members:', err));
    }
  }, [isOpen, liveTask?.project_id]);

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

  const handleStatusChange = async (newStatus) => {
    try {
      setStatus(newStatus);
      const updated = await workItemsService.updateWorkItem(liveTask.id, { status: newStatus });
      setLiveTask(updated);
      onToast?.(`Status updated to ${newStatus}`);
      onTaskUpdated?.(updated);
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
      onTaskUpdated?.(updated);
    } catch (err) {
      setError(err.message || 'Failed to update priority');
    }
  };

  const handleSaveEdits = async () => {
    if (!title.trim()) {
      setError('Title cannot be empty');
      return;
    }

    try {
      setSaving(true);
      setError('');
      const updated = await workItemsService.updateWorkItem(liveTask.id, {
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        start_date: startDate ? new Date(startDate).toISOString() : null,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
      });

      setLiveTask(updated);
      setIsEditing(false);
      onToast?.('Task details saved successfully');
      onTaskUpdated?.(updated);
    } catch (err) {
      setError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleAddAssignee = async () => {
    if (!selectedNewAssignee) return;
    try {
      setError('');
      const updated = await workItemsService.addAssignee(liveTask.id, selectedNewAssignee);
      setLiveTask(updated);
      setSelectedNewAssignee('');
      onToast?.('Assignee added');
      onTaskUpdated?.(updated);
    } catch (err) {
      setError(err.message || 'Failed to add assignee');
    }
  };

  const handleRemoveAssignee = async (userId) => {
    try {
      setError('');
      await workItemsService.removeAssignee(liveTask.id, userId);
      setLiveTask((prev) => ({
        ...prev,
        assignees: prev.assignees.filter((a) => a.user_id !== userId && a.id !== userId),
      }));
      onToast?.('Assignee removed');
      onTaskUpdated?.();
    } catch (err) {
      setError(err.message || 'Failed to remove assignee');
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
      onTaskDeleted?.(liveTask.id);
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
  const isManagerOrAdmin = authUser?.role === 'MANAGER' || authUser?.role === 'ADMIN' || authUser?.role === 'TECH_LEAD';
  const canDelete = Boolean(liveTask?.id) && (isManagerOrAdmin || liveTask.created_by === authUser?.id);

  const handleStartWork = async () => {
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
            {!isEditing ? (
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

          {/* Status & Priority Row */}
          <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/70">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 font-semibold focus:outline-none focus:border-purple-600"
              >
                {STATUS_OPTIONS.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => handlePriorityChange(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 font-semibold focus:outline-none focus:border-purple-600"
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
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

          {/* Timeline / Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Start Date</span>
              </label>
              {isEditing ? (
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800"
                />
              ) : (
                <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                  {liveTask.start_date ? new Date(liveTask.start_date).toLocaleDateString() : 'Not set'}
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Due Date</span>
              </label>
              {isEditing ? (
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800"
                />
              ) : (
                <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                  {liveTask.due_date ? new Date(liveTask.due_date).toLocaleDateString() : 'Not set'}
                </div>
              )}
            </div>
          </div>

          {/* Hierarchy Section: Parent & Children */}
          {(parent || children.length > 0) && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              {parent && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Parent Work Item
                  </span>
                  <div className="p-2.5 bg-purple-50/60 border border-purple-100 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-200 text-purple-900">
                        {parent.type}
                      </span>
                      <span className="font-semibold text-slate-800 truncate">
                        {parent.title}
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold text-purple-700 uppercase">
                      {parent.status}
                    </span>
                  </div>
                </div>
              )}

              {children.length > 0 && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Child Items ({children.length})
                  </span>
                  <div className="space-y-1.5">
                    {children.map((child) => (
                      <div
                        key={child.id}
                        className="p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-200 text-slate-700">
                            {child.type}
                          </span>
                          <span className="font-medium text-slate-800 truncate">
                            {child.title}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-semibold">
                          {child.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Assignees Section */}
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
                      <button
                        type="button"
                        onClick={() => handleRemoveAssignee(a.user_id || a.id)}
                        className="p-0.5 text-purple-400 hover:text-rose-600 rounded cursor-pointer"
                        title="Remove assignee"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Assignee Selector with Search */}
              {projectMembers.length > 0 && (
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
                      onChange={(e) => setSelectedNewAssignee(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs focus:outline-none focus:border-purple-600"
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
                      disabled={!selectedNewAssignee}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-purple-100 text-purple-700 font-bold rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-40"
                    >
                      Assign
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
