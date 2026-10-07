import React, { useState, useEffect } from 'react';
import { X, Plus, AlertCircle, Loader2, GitFork, User, Calendar, Tag, Search } from 'lucide-react';
import { workItemsService } from '../../services/workItems.service';
import { projectsService } from '../../services/projects.service';

const WORK_ITEM_TYPES = [
  { id: 'TASK', label: 'Task' },
  { id: 'EPIC', label: 'Epic' },
  { id: 'STORY', label: 'Story' },
  { id: 'SUBTASK', label: 'Subtask' },
  { id: 'BUG', label: 'Bug' },
];

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

export default function AddTaskModal({
  isOpen,
  onClose,
  projectId = null,
  initialType = 'TASK',
  initialParentId = null,
  onTaskCreated,
  onToast,
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState(initialType);
  const [status, setStatus] = useState('TODO');
  const [priority, setPriority] = useState('MEDIUM');
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || '');
  const [parentId, setParentId] = useState(initialParentId || '');
  const [assigneeId, setAssigneeId] = useState('');
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');

  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [potentialParents, setPotentialParents] = useState([]);
  const [loadingParents, setLoadingParents] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Sync initial props
  useEffect(() => {
    if (isOpen) {
      setSelectedProjectId(projectId || '');
      setType(initialType);
      setParentId(initialParentId || '');
      setTitle('');
      setDescription('');
      setStatus('TODO');
      setPriority('MEDIUM');
      setAssigneeId('');
      setStartDate('');
      setDueDate('');
      setError('');
    }
  }, [isOpen, projectId, initialType, initialParentId]);

  // Load available projects if not already specified
  useEffect(() => {
    if (isOpen && !projectId) {
      projectsService
        .getProjects()
        .then((list) => {
          setProjects(list || []);
          if (list && list.length > 0 && !selectedProjectId) {
            setSelectedProjectId(list[0].id);
          }
        })
        .catch((err) => console.error('Failed to load projects in AddTaskModal:', err));
    }
  }, [isOpen, projectId]);

  // Load project members when selected project changes
  useEffect(() => {
    const targetProjId = projectId || selectedProjectId;
    if (isOpen && targetProjId) {
      projectsService
        .getMembers(targetProjId)
        .then((list) => setMembers(list || []))
        .catch((err) => console.error('Failed to load members in AddTaskModal:', err));
    } else {
      setMembers([]);
    }
  }, [isOpen, projectId, selectedProjectId]);

  // Load potential parents based on hierarchy rules
  useEffect(() => {
    const targetProjId = projectId || selectedProjectId;
    if (!isOpen || !targetProjId) {
      setPotentialParents([]);
      return;
    }

    let requiredParentType = null;
    if (type === 'STORY') requiredParentType = 'EPIC';
    else if (type === 'TASK') requiredParentType = 'STORY';
    else if (type === 'SUBTASK') requiredParentType = 'TASK';

    if (requiredParentType) {
      setLoadingParents(true);
      workItemsService
        .listWorkItems({ project_id: targetProjId, type: requiredParentType })
        .then((items) => {
          setPotentialParents(items || []);
        })
        .catch((err) => console.error('Failed to load potential parents:', err))
        .finally(() => setLoadingParents(false));
    } else {
      setPotentialParents([]);
      setParentId('');
    }
  }, [isOpen, projectId, selectedProjectId, type]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;

    const targetProjId = projectId || selectedProjectId || null;

    if (type === 'SUBTASK' && !parentId) {
      setError('A parent Task is required for Subtasks.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        type,
        status,
        priority,
        project_id: targetProjId,
        parent_id: parentId || null,
        start_date: startDate ? new Date(startDate).toISOString() : null,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        assignee_ids: assigneeId ? [assigneeId] : [],
      };

      const newItem = await workItemsService.createWorkItem(payload);
      onToast?.(`Created ${type.toLowerCase()} "${newItem.title}"`);
      onTaskCreated?.(newItem);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create work item');
    } finally {
      setSubmitting(false);
    }
  };

  const currentProjId = projectId || selectedProjectId;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-purple-600" />
              <span>Create Work Item</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Add a new ticket to track deliverables and progress
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2 text-xs font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Project Selector (if not passed as prop) */}
          {!projectId && (
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Project *
              </label>
              <select
                required
                value={selectedProjectId}
                onChange={(e) => {
                  setSelectedProjectId(e.target.value);
                  setParentId('');
                  setAssigneeId('');
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-purple-600"
              >
                <option value="">Select Project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Work Item Type & Priority Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Issue Type *
              </label>
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  setParentId('');
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-purple-600"
              >
                {WORK_ITEM_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-purple-600"
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Implement Role-Based Access Control API"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-600"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide technical requirements, context, or acceptance criteria..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-600 resize-none"
            />
          </div>

          {/* Parent Work Item (Hierarchical Dependency) */}
          {(type === 'STORY' || type === 'TASK' || type === 'SUBTASK') && (
            <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-100">
              <label className="block text-[11px] font-bold text-purple-900 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <GitFork className="w-3.5 h-3.5 text-purple-600" />
                <span>
                  Parent {type === 'STORY' ? 'Epic' : type === 'TASK' ? 'Story (Optional)' : 'Task (Required)'}
                </span>
              </label>

              {loadingParents ? (
                <div className="flex items-center gap-2 text-slate-500 py-1 text-xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                  <span>Loading potential parent items...</span>
                </div>
              ) : potentialParents.length === 0 ? (
                <p className="text-[11px] text-amber-700 py-1">
                  {type === 'SUBTASK'
                    ? 'No Tasks found in this project. Create a Task first before adding subtasks.'
                    : type === 'STORY'
                    ? 'No Epics found in this project. Create an Epic first, or this Story will be standalone.'
                    : 'No Stories found in this project. This Task will be created as a standalone task.'}
                </p>
              ) : (
                <select
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  required={type === 'SUBTASK'}
                  className="w-full px-3 py-2 rounded-lg border border-purple-200 bg-white text-slate-800 focus:outline-none focus:border-purple-600"
                >
                  <option value="">{type === 'SUBTASK' ? 'Select Parent Task *' : 'No Parent (Standalone)'}</option>
                  {potentialParents.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.type}] {p.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Row: Status & Assignee */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Initial Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-purple-600"
              >
                {STATUS_OPTIONS.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>Assignee</span>
                </span>
                {assigneeSearch && (
                  <button
                    type="button"
                    onClick={() => setAssigneeSearch('')}
                    className="text-[10px] text-purple-600 hover:underline"
                  >
                    Clear search
                  </button>
                )}
              </label>
              <div className="space-y-1.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={assigneeSearch}
                    onChange={(e) => setAssigneeSearch(e.target.value)}
                    placeholder="Search assignees by name or email..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-purple-600"
                  />
                </div>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-purple-600"
                >
                  <option value="">Unassigned</option>
                  {members
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
              </div>
            </div>
          </div>

          {/* Row: Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Start Date</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-purple-600"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Due Date</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-purple-600"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Create Work Item</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
