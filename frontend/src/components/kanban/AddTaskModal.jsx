import React, { useState, useEffect } from 'react';
import { X, Plus, AlertCircle, Loader2, GitFork, User, Calendar, Tag, Search } from 'lucide-react';
import { workItemsService } from '../../services/workItems.service';
import { projectsService } from '../../services/projects.service';
import { sprintsService } from '../../services/sprints.service';

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
  initialStatus = 'TODO',
  initialSprintId = null,
  initialParentId = null,
  parentItem = null,
  allowedTypes = null,
  sprints = [],
  onTaskCreated,
  onToast,
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState(initialType);
  const [status, setStatus] = useState(initialStatus || 'TODO');
  const [priority, setPriority] = useState('MEDIUM');
  const [storyPoints, setStoryPoints] = useState(3);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || '');
  const [parentId, setParentId] = useState(initialParentId || '');
  const [sprintId, setSprintId] = useState(initialSprintId || '');
  const [assigneeId, setAssigneeId] = useState('');
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');

  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [availableSprints, setAvailableSprints] = useState(sprints || []);
  const [potentialParents, setPotentialParents] = useState([]);
  const [loadingParents, setLoadingParents] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Determine permitted types based on Jira hierarchy rules
  const effectiveAllowedTypes = React.useMemo(() => {
    if (allowedTypes && Array.isArray(allowedTypes) && allowedTypes.length > 0) {
      return allowedTypes;
    }
    if (parentItem) {
      if (parentItem.type === 'EPIC') return ['STORY', 'BUG'];
      if (parentItem.type === 'STORY') return ['TASK', 'BUG'];
      if (parentItem.type === 'TASK') return ['SUBTASK'];
      return [];
    }
    const targetProjId = projectId || selectedProjectId;
    if (!targetProjId) {
      return ['TASK'];
    }
    return ['EPIC', 'STORY', 'TASK', 'BUG', 'SUBTASK'];
  }, [allowedTypes, parentItem, projectId, selectedProjectId]);

  // Sync initial props
  useEffect(() => {
    if (isOpen) {
      setSelectedProjectId(projectId || '');
      setTitle('');
      setDescription('');
      setStatus(initialStatus || 'TODO');
      setSprintId(initialSprintId || '');
      setPriority('MEDIUM');
      setStoryPoints(3);
      setAssigneeId('');
      setStartDate('');
      setDueDate('');
      setError('');

      if (parentItem) {
        setParentId(parentItem.id);
        const defaultType =
          parentItem.type === 'EPIC'
            ? 'STORY'
            : parentItem.type === 'STORY'
            ? 'TASK'
            : 'SUBTASK';
        const chosenType =
          initialType && effectiveAllowedTypes.includes(initialType)
            ? initialType
            : defaultType;
        setType(chosenType);
      } else {
        setParentId(initialParentId || '');
        const chosenType =
          initialType && effectiveAllowedTypes.includes(initialType)
            ? initialType
            : effectiveAllowedTypes[0] || 'TASK';
        setType(chosenType);
      }

      if (sprints && sprints.length > 0) {
        setAvailableSprints(sprints);
      }
    }
  }, [
    isOpen,
    projectId,
    initialType,
    initialParentId,
    parentItem,
    initialStatus,
    initialSprintId,
    sprints,
    effectiveAllowedTypes,
  ]);

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

  // Load project members and sprints when selected project changes
  useEffect(() => {
    const targetProjId = projectId || selectedProjectId;
    if (isOpen && targetProjId) {
      projectsService
        .getMembers(targetProjId)
        .then((list) => setMembers(list || []))
        .catch((err) => console.error('Failed to load members in AddTaskModal:', err));

      if (!sprints || sprints.length === 0) {
        sprintsService
          .getSprints(targetProjId)
          .then((list) => setAvailableSprints(list || []))
          .catch((err) => console.error('Failed to load sprints in AddTaskModal:', err));
      }
    } else {
      setMembers([]);
    }
  }, [isOpen, projectId, selectedProjectId, sprints]);

  // Load potential parents based on hierarchy rules when no fixed parent is passed
  useEffect(() => {
    if (parentItem) {
      setPotentialParents([]);
      return;
    }

    const targetProjId = projectId || selectedProjectId;
    if (!isOpen || !targetProjId) {
      setPotentialParents([]);
      return;
    }

    if (type === 'EPIC') {
      setPotentialParents([]);
      setParentId('');
      return;
    }

    setLoadingParents(true);
    if (type === 'STORY') {
      workItemsService
        .listWorkItems({ project_id: targetProjId, type: 'EPIC' })
        .then((items) => {
          const list = items || [];
          setPotentialParents(list);
          setParentId((prev) => (list.some((p) => p.id === prev) ? prev : ''));
        })
        .catch((err) => console.error('Failed to load potential epics:', err))
        .finally(() => setLoadingParents(false));
    } else if (type === 'TASK') {
      workItemsService
        .listWorkItems({ project_id: targetProjId, type: 'STORY' })
        .then((items) => {
          const list = items || [];
          setPotentialParents(list);
          setParentId((prev) => (list.some((p) => p.id === prev) ? prev : ''));
        })
        .catch((err) => console.error('Failed to load potential stories:', err))
        .finally(() => setLoadingParents(false));
    } else if (type === 'SUBTASK') {
      workItemsService
        .listWorkItems({ project_id: targetProjId, type: 'TASK' })
        .then((items) => {
          const list = items || [];
          setPotentialParents(list);
          setParentId((prev) => (list.some((p) => p.id === prev) ? prev : ''));
        })
        .catch((err) => console.error('Failed to load potential tasks:', err))
        .finally(() => setLoadingParents(false));
    } else if (type === 'BUG') {
      workItemsService
        .listWorkItems({ project_id: targetProjId })
        .then((items) => {
          const validParents = (items || []).filter(
            (i) => i.type === 'EPIC' || i.type === 'STORY'
          );
          setPotentialParents(validParents);
          setParentId((prev) => (validParents.some((p) => p.id === prev) ? prev : ''));
        })
        .catch((err) => console.error('Failed to load potential bug parents:', err))
        .finally(() => setLoadingParents(false));
    }
  }, [isOpen, projectId, selectedProjectId, type, parentItem]);

  const handleTypeChange = (newType) => {
    setType(newType);
    setError('');

    if (newType === 'EPIC') {
      setParentId('');
      return;
    }

    if (parentItem) return;

    if (!parentId) return;

    const currentParent = potentialParents.find((p) => p.id === parentId);
    if (!currentParent) {
      setParentId('');
      return;
    }

    const pType = currentParent.type;
    let isValid = false;
    if (newType === 'STORY' && pType === 'EPIC') isValid = true;
    else if (newType === 'TASK' && pType === 'STORY') isValid = true;
    else if (newType === 'SUBTASK' && pType === 'TASK') isValid = true;
    else if (newType === 'BUG' && (pType === 'EPIC' || pType === 'STORY')) isValid = true;

    if (!isValid) {
      setParentId('');
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;

    const targetProjId = projectId || selectedProjectId || null;

    // Validate sprint date order
    if (startDate && dueDate && new Date(startDate) > new Date(dueDate)) {
      setError('Due date cannot be earlier than start date.');
      return;
    }

    if (targetProjId) {
      const effectiveParentId = parentItem ? parentItem.id : parentId;
      if (type !== 'EPIC' && !effectiveParentId) {
        setError(
          `A parent work item is required for ${type}. Only EPIC can be created at the project root.`
        );
        return;
      }
      if (type === 'EPIC' && effectiveParentId) {
        setError('An EPIC sits at the root and cannot have a parent.');
        return;
      }

      const effectiveParent = parentItem || potentialParents.find((p) => p.id === effectiveParentId);
      if (effectiveParent) {
        const pType = effectiveParent.type;
        if (type === 'STORY' && pType !== 'EPIC') {
          setError('A Story must have an Epic as its parent.');
          return;
        }
        if (type === 'TASK' && pType !== 'STORY') {
          setError('A Task must have a Story as its parent.');
          return;
        }
        if (type === 'SUBTASK' && pType !== 'TASK') {
          setError('A Subtask must have a Task as its parent.');
          return;
        }
        if (type === 'BUG' && pType !== 'EPIC' && pType !== 'STORY') {
          setError('A Bug must have an Epic or Story as its parent.');
          return;
        }
      }
    } else {
      if (type !== 'TASK') {
        setError('Personal tasks must be of type TASK.');
        return;
      }
    }

    const isTaskLike = type === 'TASK' || type === 'SUBTASK' || type === 'BUG';
    const sp = Number(storyPoints);
    if (isTaskLike) {
      if (!storyPoints || isNaN(sp) || !Number.isInteger(sp) || sp <= 0) {
        setError('Story points are mandatory for tasks, subtasks, and bugs and must be a positive integer greater than 0.');
        return;
      }
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
        story_points: type === 'EPIC' ? 0 : sp > 0 ? sp : 0,
        project_id: targetProjId,
        parent_id: parentId || null,
        sprint_id: sprintId || null,
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

          {/* Work Item Type, Priority & Story Points Row */}
          <div className={`grid gap-3 ${type !== 'EPIC' ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Issue Type *
              </label>
              <select
                value={type}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-purple-600 font-semibold"
              >
                {WORK_ITEM_TYPES.filter((t) => effectiveAllowedTypes.includes(t.id)).map((t) => (
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

            {type !== 'EPIC' && (
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>Story Points *</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="99"
                  step="1"
                  required
                  value={storyPoints}
                  onChange={(e) => setStoryPoints(e.target.value)}
                  placeholder="e.g. 3"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 font-mono font-bold focus:outline-none focus:border-purple-600"
                />
              </div>
            )}
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
          {parentItem ? (
            <div className="p-3 bg-purple-50/70 rounded-xl border border-purple-200">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 flex items-center gap-1">
                  <GitFork className="w-3.5 h-3.5" />
                  <span>Parent {parentItem.type} (Locked)</span>
                </span>
                <span className="text-[10px] font-mono font-semibold text-purple-600">
                  {parentItem.id}
                </span>
              </div>
              <p className="mt-1 font-semibold text-slate-800 text-xs truncate">
                {parentItem.title}
              </p>
            </div>
          ) : currentProjId ? (
            type === 'EPIC' ? (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-600">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-0.5">
                  Project Root Deliverable
                </span>
                <p className="text-[11px] text-slate-600">
                  EPIC items sit at the root of the project hierarchy and cannot have a parent.
                </p>
              </div>
            ) : (
              <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-100">
                <label className="block text-[11px] font-bold text-purple-900 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <GitFork className="w-3.5 h-3.5 text-purple-600" />
                  <span>
                    Parent {type === 'STORY' ? 'Epic *' : type === 'TASK' ? 'Story *' : type === 'SUBTASK' ? 'Task *' : 'Epic or Story *'}
                  </span>
                </label>

                {loadingParents ? (
                  <div className="flex items-center gap-2 text-slate-500 py-1 text-xs">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                    <span>Loading potential parent items...</span>
                  </div>
                ) : potentialParents.length === 0 ? (
                  <p className="text-[11px] text-amber-700 py-1 font-medium">
                    {type === 'STORY'
                      ? 'No Epics found in this project. Create an Epic first before creating a Story.'
                      : type === 'TASK'
                      ? 'No Stories found in this project. Create a Story first before creating a Task.'
                      : type === 'SUBTASK'
                      ? 'No Tasks found in this project. Create a Task first before creating a Subtask.'
                      : 'No Epics or Stories found in this project. Create an Epic or Story first before creating a Bug.'}
                  </p>
                ) : (
                  <select
                    value={parentId}
                    onChange={(e) => setParentId(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-purple-200 bg-white text-slate-800 focus:outline-none focus:border-purple-600"
                  >
                    <option value="">
                      Select Parent {type === 'STORY' ? 'Epic' : type === 'TASK' ? 'Story' : type === 'SUBTASK' ? 'Task' : 'Epic or Story'} *
                    </option>
                    {potentialParents.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.type}] {p.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )
          ) : null}

          {/* Row: Sprint & Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Sprint
              </label>
              <select
                value={sprintId}
                onChange={(e) => setSprintId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-purple-600"
              >
                <option value="">Project Backlog (No Sprint)</option>
                {availableSprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.status === 'ACTIVE' ? '• Active' : ''}
                  </option>
                ))}
              </select>
            </div>

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
