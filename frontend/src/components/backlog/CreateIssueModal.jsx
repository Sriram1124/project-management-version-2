import React, { useState, useEffect, useMemo } from 'react';
import { X, Bookmark, CheckSquare, AlertCircle, Layers, GitFork, Loader2 } from 'lucide-react';
import { workItemsService } from '../../services/workItems.service';

export default function CreateIssueModal({
  isOpen,
  onClose,
  projectId = null,
  projectName = '',
  epics = [],
  stories = [],
  workItems = [],
  sprints = [],
  members = [],
  initialSprintId = 'backlog',
  initialEpicId = '',
  initialIssueType = 'Story',
  parentItem = null,
  allowedTypes = null,
  isKanban = false,
  onCreateIssue,
  onCreateEpic,
}) {
  const [issueType, setIssueType] = useState(initialIssueType || 'Story'); // 'Story' | 'Task' | 'Bug' | 'Epic' | 'Subtask'
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState('');
  const [sprintId, setSprintId] = useState(initialSprintId || 'backlog');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [status, setStatus] = useState('TODO');
  const [submitting, setSubmitting] = useState(false);
  const [storyPoints, setStoryPoints] = useState(3);
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');

  const [projectItems, setProjectItems] = useState(workItems || []);
  const [loadingItems, setLoadingItems] = useState(false);

  // Load project items from backend to ensure real database parents
  useEffect(() => {
    if (isOpen && projectId) {
      setLoadingItems(true);
      workItemsService
        .listWorkItems({ project_id: projectId })
        .then((items) => {
          setProjectItems(items || []);
        })
        .catch((err) => {
          console.error('Failed to load project items for parent dropdown:', err);
        })
        .finally(() => {
          setLoadingItems(false);
        });
    }
  }, [isOpen, projectId]);

  // Sync with prop when passed
  useEffect(() => {
    if (workItems && workItems.length > 0) {
      setProjectItems((prev) => (prev.length === 0 ? workItems : prev));
    }
  }, [workItems]);

  // Compute allowed types based on Jira hierarchy
  const effectiveAllowedTypes = useMemo(() => {
    if (allowedTypes && Array.isArray(allowedTypes) && allowedTypes.length > 0) {
      return allowedTypes;
    }
    if (parentItem) {
      if (parentItem.type === 'EPIC') return ['Story', 'Bug'];
      if (parentItem.type === 'STORY') return ['Task', 'Bug'];
      if (parentItem.type === 'TASK') return ['Subtask'];
      return [];
    }
    return ['Story', 'Task', 'Bug', 'Epic'];
  }, [allowedTypes, parentItem]);

  // Compute available parents based on current issueType
  const availableParents = useMemo(() => {
    if (issueType === 'Epic' || parentItem) return [];

    // Combine projectItems with fallback epics/stories if items not yet loaded
    const allItems = [...projectItems];
    if (epics && epics.length > 0) {
      epics.forEach((ep) => {
        if (!allItems.some((item) => item.id === ep.id)) {
          allItems.push({ ...ep, type: 'EPIC', title: ep.name || ep.title });
        }
      });
    }

    return allItems.filter((item) => {
      // Reject cross-project items
      if (projectId && item.project_id && item.project_id !== projectId) {
        return false;
      }

      if (issueType === 'Story') {
        return item.type === 'EPIC';
      }
      if (issueType === 'Task') {
        return item.type === 'STORY';
      }
      if (issueType === 'Subtask') {
        return item.type === 'TASK';
      }
      if (issueType === 'Bug') {
        return item.type === 'EPIC' || item.type === 'STORY';
      }
      return false;
    });
  }, [issueType, projectItems, epics, projectId, parentItem]);

  // Handle issue type change: dynamically validate & clear parent if incompatible
  const handleTypeChange = (newType) => {
    setIssueType(newType);
    setError('');

    if (newType === 'Epic') {
      setParentId('');
      return;
    }

    if (parentItem) return;

    if (!parentId) return;

    // Check if current parent is valid for newType
    const currentParent =
      projectItems.find((p) => p.id === parentId) ||
      epics.find((e) => e.id === parentId);

    if (!currentParent) {
      setParentId('');
      return;
    }

    const pType = currentParent.type;
    let isValid = false;
    if (newType === 'Story' && pType === 'EPIC') isValid = true;
    else if (newType === 'Task' && pType === 'STORY') isValid = true;
    else if (newType === 'Subtask' && pType === 'TASK') isValid = true;
    else if (newType === 'Bug' && (pType === 'EPIC' || pType === 'STORY')) isValid = true;

    if (!isValid) {
      setParentId('');
    }
  };

  // Synchronize when modal opens
  useEffect(() => {
    if (isOpen) {
      setError('');
      setSubmitting(false);
      setSummary('');
      setDescription('');
      setAssigneeId('');
      setPriority('Medium');
      setStatus('TODO');
      setStoryPoints(3);
      setStartDate('');
      setDueDate('');
      setSprintId(initialSprintId || 'backlog');

      if (parentItem) {
        setParentId(parentItem.id);
        const defaultType =
          parentItem.type === 'EPIC'
            ? 'Story'
            : parentItem.type === 'STORY'
            ? 'Task'
            : 'Subtask';
        const chosen =
          initialIssueType && effectiveAllowedTypes.includes(initialIssueType)
            ? initialIssueType
            : defaultType;
        setIssueType(chosen);
      } else {
        const chosen =
          initialIssueType && effectiveAllowedTypes.includes(initialIssueType)
            ? initialIssueType
            : effectiveAllowedTypes[0] || 'Story';
        setIssueType(chosen);

        // When creating an issue from the main Create Issue button, default to no parent Epic
        setParentId('');
      }
    }
  }, [
    isOpen,
    initialIssueType,
    initialEpicId,
    initialSprintId,
    parentItem,
    effectiveAllowedTypes,
  ]);

  // Ensure parentId is cleared if it is no longer valid among available parents
  useEffect(() => {
    if (parentId && !parentItem && issueType !== 'Epic') {
      const exists = availableParents.some((p) => p.id === parentId);
      if (!exists && availableParents.length > 0) {
        setParentId('');
      }
    }
  }, [availableParents, parentId, parentItem, issueType]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!summary.trim()) return;

    if (startDate && dueDate && new Date(startDate) > new Date(dueDate)) {
      setError('Due date cannot be earlier than start date.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      if (issueType === 'Epic') {
        await onCreateEpic?.({
          type: 'EPIC',
          title: summary.trim(),
          description: description.trim(),
          status: status || 'TODO',
          assignee_ids: assigneeId ? [assigneeId] : [],
          priority: priority.toUpperCase(),
          start_date: startDate ? new Date(startDate).toISOString() : null,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
        });
      } else {
        const effectiveParentId = parentItem ? parentItem.id : parentId;
        const isParentOptional = issueType === 'Story' || issueType === 'Bug';
        if (!effectiveParentId && !isParentOptional) {
          setError(`A parent work item is required for ${issueType}. Please select a valid parent.`);
          setSubmitting(false);
          return;
        }

        // Enforce hierarchy validation before submit if a parent is selected
        if (effectiveParentId) {
          const selectedParent = parentItem || availableParents.find((p) => p.id === effectiveParentId);
          if (selectedParent) {
            const pType = selectedParent.type;
            if (issueType === 'Story' && pType !== 'EPIC') {
              setError('A Story can only have an Epic as its parent.');
              setSubmitting(false);
              return;
            }
            if (issueType === 'Task' && pType !== 'STORY') {
              setError('A Task must have a Story as its parent.');
              setSubmitting(false);
              return;
            }
            if (issueType === 'Subtask' && pType !== 'TASK') {
              setError('A Subtask must have a Task as its parent.');
              setSubmitting(false);
              return;
            }
            if (issueType === 'Bug' && pType !== 'EPIC' && pType !== 'STORY') {
              setError('A Bug can only have an Epic or Story as its parent.');
              setSubmitting(false);
              return;
            }
          }
        }

        const isApplicableType = ['Task', 'Subtask', 'Bug', 'Story'].includes(issueType);
        const sp = Number(storyPoints);
        if (isApplicableType) {
          if (!storyPoints || isNaN(sp) || !Number.isInteger(sp) || sp <= 0) {
            setError('Story points are mandatory for tasks, stories, subtasks, and bugs and must be a positive integer greater than 0.');
            setSubmitting(false);
            return;
          }
        }

        await onCreateIssue?.({
          type: issueType.toUpperCase(),
          title: summary.trim(),
          description: description.trim(),
          status: status || 'TODO',
          parent_id: effectiveParentId || null,
          sprint_id: sprintId === 'backlog' ? null : sprintId,
          assignee_ids: assigneeId ? [assigneeId] : [],
          priority: priority.toUpperCase(),
          story_points: sp > 0 ? sp : 0,
          start_date: startDate ? new Date(startDate).toISOString() : null,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
        });
      }

      // Reset and close only on success
      setSummary('');
      setDescription('');
      onClose();
    } catch (err) {
      console.error('Failed to create item in CreateIssueModal:', err);
      const errMsg = err?.response?.data?.error || err?.message || 'Failed to create work item';
      setError(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs select-none">
      <div className="w-full max-w-lg bg-white rounded-lg border border-slate-200 shadow-xl overflow-hidden text-xs animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-900 text-sm">
              {issueType === 'Epic' ? 'Create Epic' : 'Create Issue'}
            </h3>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500 font-medium">{projectName || 'Project Workspace'}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 max-h-[calc(100vh-200px)] overflow-y-auto">
          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center gap-2 text-xs font-medium">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Issue Type Selector */}
          <div>
            <label className="block text-slate-700 font-semibold mb-1">Issue Type</label>
            <div className="flex items-center gap-1.5">
              {[
                { type: 'Story', icon: Bookmark, color: 'text-emerald-600' },
                { type: 'Task', icon: CheckSquare, color: 'text-blue-600' },
                { type: 'Bug', icon: AlertCircle, color: 'text-rose-600' },
                { type: 'Epic', icon: Layers, color: 'text-purple-600' },
              ]
                .filter(({ type }) => effectiveAllowedTypes.includes(type))
                .map(({ type, icon: Icon, color }) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleTypeChange(type)}
                    className={`px-2.5 py-1.5 rounded border flex items-center gap-1.5 transition-colors cursor-pointer ${
                      issueType === type
                        ? 'border-purple-600 bg-purple-50 text-purple-700 font-semibold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 bg-white'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${color}`} />
                    <span>{type}</span>
                  </button>
                ))}
            </div>
          </div>

          {/* Summary / Title */}
          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              {issueType === 'Epic' ? 'Epic Name' : 'Summary'} <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={issueType === 'Epic' ? 'e.g. Core Authentication & RBAC' : 'What needs to be done?'}
              className="w-full px-3 py-1.5 rounded border border-slate-200 focus:outline-none focus:border-purple-600 text-slate-900 text-xs font-medium"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-slate-700 font-semibold mb-1">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add details, acceptance criteria, or context..."
              className="w-full px-3 py-2 rounded border border-slate-200 focus:outline-none focus:border-purple-600 text-slate-900 text-xs resize-none"
            />
          </div>

          {issueType !== 'Epic' ? (
            <div className={`grid ${isKanban ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
              {/* Parent Selector */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1 flex items-center gap-1">
                  <GitFork className="w-3 h-3 text-purple-600" />
                  <span>
                    {parentItem
                      ? `Parent ${parentItem.type}`
                      : issueType === 'Story'
                      ? 'Parent Epic'
                      : issueType === 'Bug'
                      ? 'Parent Epic or Story'
                      : issueType === 'Task'
                      ? 'Parent Story'
                      : 'Parent Task'}
                  </span>
                  {['Story', 'Bug'].includes(issueType) ? (
                    <span className="text-slate-400 font-normal text-[10px] ml-0.5">(Optional)</span>
                  ) : (
                    <span className="text-rose-500">*</span>
                  )}
                </label>
                {parentItem ? (
                  <div className="p-2 rounded border border-purple-200 bg-purple-50 text-slate-800 text-xs flex items-center justify-between">
                    <span className="font-semibold truncate">{parentItem.title}</span>
                    <span className="text-[10px] font-mono text-purple-700 font-bold ml-1 uppercase">{parentItem.type}</span>
                  </div>
                ) : loadingItems ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-200 bg-slate-50 text-slate-400 text-xs">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                    <span>Loading parents...</span>
                  </div>
                ) : !['Story', 'Bug'].includes(issueType) && availableParents.length === 0 ? (
                  <div className="p-2 rounded border border-amber-200 bg-amber-50 text-amber-800 text-[11px] font-medium leading-tight">
                    {issueType === 'Task'
                      ? 'No Stories found in this project. Create a Story first.'
                      : 'No Tasks found in this project. Create a Task first.'}
                  </div>
                ) : (
                  <select
                    value={parentId}
                    onChange={(e) => setParentId(e.target.value)}
                    required={!['Story', 'Bug'].includes(issueType)}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-purple-600 cursor-pointer"
                  >
                    <option value="">
                      {issueType === 'Story'
                        ? 'None (No Epic - Standalone Story)'
                        : issueType === 'Bug'
                        ? 'None (No Epic - Standalone Bug)'
                        : issueType === 'Task'
                        ? 'Select Parent Story *'
                        : 'Select Parent Task *'}
                    </option>
                    {availableParents.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.type}] {p.title || p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Cycle Selector (hidden in Kanban) */}
              {!isKanban && (
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Cycle</label>
                  <select
                    value={sprintId}
                    onChange={(e) => setSprintId(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-purple-600"
                  >
                    <option value="backlog">Backlog (No Cycle)</option>
                    {sprints.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ) : (
            <div className="p-2.5 rounded border border-purple-100 bg-purple-50/70 text-purple-900 text-[11px] flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-600 shrink-0" />
              <span>
                <strong>Epic:</strong> Sits at the root of the project hierarchy and cannot have a parent work item.
              </span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            {/* Assignee */}
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                {issueType === 'Epic' ? 'Epic Lead' : 'Assignee'}
              </label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-purple-600"
              >
                <option value="">Unassigned</option>
                {members.map((u) => {
                  const uid = u.user_id || u.id;
                  const uName = u.name || u.email;
                  const roleStr = u.project_role ? ` (${u.project_role})` : '';
                  return (
                    <option key={uid} value={uid}>
                      {uName}{roleStr}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-purple-600"
              >
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="IN_REVIEW">In Review</option>
                <option value="COMPLETED">Completed</option>
                <option value="BLOCKED">Blocked</option>
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-purple-600"
              >
                <option value="Urgent">Urgent</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          {/* Dates: Start Date & Due Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-purple-600"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-purple-600"
              />
            </div>
          </div>

          {/* Story Points (for non-epics) */}
          {issueType !== 'Epic' && (
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Story Points *
              </label>
              <input
                type="number"
                min={1}
                max={100}
                required
                value={storyPoints}
                onChange={(e) => setStoryPoints(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-purple-600 font-mono"
              />
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-white font-semibold transition-colors cursor-pointer"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{submitting ? 'Creating...' : `Create ${issueType}`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
