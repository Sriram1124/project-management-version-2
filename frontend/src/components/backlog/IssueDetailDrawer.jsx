import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Check, 
  Trash2, 
  Plus, 
  CornerDownRight, 
  Clock, 
  User, 
  Bookmark, 
  CheckSquare, 
  AlertCircle,
  MessageSquare,
  History,
  Activity,
  Calendar,
  GitFork
} from 'lucide-react';
import { getEpicSprintSummary } from './HierarchicalIssueTable';
import { useAuth } from '../../context/AuthContext';

export default function IssueDetailDrawer({
  issue,
  epics = [],
  sprints = [],
  members = [],
  workItems = [],
  isOpen,
  onClose,
  onUpdateIssue,
  onDeleteIssue,
  onToggleSubtask,
  onAddSubtask,
}) {
  const { user: authUser } = useAuth();
  const isIntern = authUser?.role === 'INTERN';
  const currentUserId = authUser?.id || authUser?.user_id;

  const isAssignedToMe = useMemo(() => {
    if (!issue || !currentUserId) return false;
    if (issue.assignee && (issue.assignee.id === currentUserId || issue.assignee.user_id === currentUserId)) return true;
    if (issue.assigneeId === currentUserId || issue.assignee_id === currentUserId) return true;
    if (Array.isArray(issue.assignees)) {
      return issue.assignees.some((a) => (a.id === currentUserId || a.user_id === currentUserId));
    }
    return false;
  }, [issue, currentUserId]);

  const currentAssigneeId = useMemo(() => {
    if (!issue) return '';
    if (issue.assignee?.user_id) return String(issue.assignee.user_id);
    if (issue.assignee?.id) return String(issue.assignee.id);
    if (Array.isArray(issue.assignees) && issue.assignees.length > 0) {
      const first = issue.assignees[0];
      return String(first.user_id || first.id || '');
    }
    if (issue.assignee_id) return String(issue.assignee_id);
    if (issue.assigneeId) return String(issue.assigneeId);
    return '';
  }, [issue]);

  const currentAssignee = useMemo(() => {
    if (!issue) return null;
    if (issue.assignee && (issue.assignee.name || issue.assignee.user?.name)) {
      return issue.assignee;
    }
    if (Array.isArray(issue.assignees) && issue.assignees.length > 0) {
      return issue.assignees[0];
    }
    if (currentAssigneeId) {
      const match = members.find((m) => (m.user_id || m.id) === currentAssigneeId);
      if (match) return match;
    }
    return null;
  }, [issue, currentAssigneeId, members]);

  const canDelete = !isIntern;
  const canEditTitleAndDesc = !isIntern;
  const canChangeStatus = !isIntern || isAssignedToMe;
  const canChangePriority = !isIntern;
  const canChangeAssignee = !isIntern;
  const canChangeSprint = !isIntern;
  const canChangeEpic = !isIntern;
  const canChangeStoryPoints = !isIntern;
  const canChangeDueDate = !isIntern;

  const [activeTab, setActiveTab] = useState('comments'); // 'comments' | 'worklog' | 'history'
  const [editedTitle, setEditedTitle] = useState(issue?.title || '');
  const [editedDesc, setEditedDesc] = useState(issue?.description || '');
  const [newComment, setNewComment] = useState('');
  const [comments, setComments] = useState([
    { id: 'c1', author: 'Priya Sharma', time: 'Yesterday at 3:45 PM', text: 'Please ensure migration handles foreign key cascade deletes properly.' }
  ]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [childType, setChildType] = useState('SUBTASK');

  const allowedChildTypes = React.useMemo(() => {
    const t = String(issue?.type || '').toUpperCase();
    if (isIntern) {
      if (t === 'STORY') return ['TASK', 'BUG'];
      if (t === 'TASK') return ['SUBTASK'];
      return [];
    }
    if (t === 'EPIC') return ['STORY', 'BUG'];
    if (t === 'STORY') return ['TASK', 'BUG'];
    if (t === 'TASK') return ['SUBTASK'];
    return [];
  }, [issue?.type, isIntern]);

  useEffect(() => {
    if (allowedChildTypes.length > 0) {
      setChildType(allowedChildTypes[0]);
    }
  }, [allowedChildTypes]);

  useEffect(() => {
    if (issue) {
      setEditedTitle(issue.title || '');
      setEditedDesc(issue.description || '');
    }
  }, [issue]);

  // Recursively or directly resolve ancestor Epic for this issue
  const currentEpic = React.useMemo(() => {
    if (!issue) return null;

    // 1. If this issue itself is an Epic
    if (String(issue.type).toUpperCase() === 'EPIC') {
      return { id: issue.id, name: issue.title || issue.name };
    }

    // 2. Direct epicId or explicit parent is an Epic
    if (issue.epicId) {
      const match = epics.find((e) => e.id === issue.epicId);
      if (match) return match;
    }

    if (issue.parent_id) {
      const directParent = (workItems || []).find((w) => w.id === issue.parent_id);
      if (directParent) {
        if (String(directParent.type).toUpperCase() === 'EPIC') {
          return { id: directParent.id, name: directParent.title };
        }
        // If parent is a Story or Task, look up its parent (the Epic)
        if (directParent.parent_id) {
          const grandParent = (workItems || []).find((w) => w.id === directParent.parent_id);
          if (grandParent && String(grandParent.type).toUpperCase() === 'EPIC') {
            return { id: grandParent.id, name: grandParent.title };
          }
        }
      }
    }

    // 3. Fallback to direct parent if parent is in epics list
    const parentInEpics = epics.find((e) => e.id === issue.parent_id);
    if (parentInEpics) return parentInEpics;

    return null;
  }, [issue, epics, workItems]);

  const currentSprint = sprints.find(s => s.id === (issue?.sprint_id || issue?.sprintId));
  const isEpic = String(issue?.type || '').toUpperCase() === 'EPIC';
  const epicSprintSummary = useMemo(() => {
    if (!isEpic || !issue) return null;
    return getEpicSprintSummary(issue, workItems, sprints);
  }, [isEpic, issue, workItems, sprints]);

  const handleTitleBlur = () => {
    if (editedTitle.trim() && editedTitle !== issue?.title) {
      onUpdateIssue?.({ ...issue, title: editedTitle.trim() });
    }
  };

  const handleDescBlur = () => {
    if (editedDesc !== issue?.description) {
      onUpdateIssue?.({ ...issue, description: editedDesc });
    }
  };

  const handleStatusChange = (newStatus) => {
    onUpdateIssue?.({ ...issue, status: newStatus });
  };

  const handlePriorityChange = (newPriority) => {
    onUpdateIssue?.({ ...issue, priority: newPriority });
  };

  const handleAssigneeChange = (assigneeId) => {
    const user = members.find((u) => (u.user_id || u.id) === assigneeId) || null;
    const newAssignees = user
      ? [
          {
            id: user.user_id || user.id,
            user_id: user.user_id || user.id,
            name: user.name || user.user?.name || user.email || 'Member',
            email: user.email || user.user?.email || '',
          },
        ]
      : [];

    onUpdateIssue?.({
      ...issue,
      assignee: user,
      assigneeId: assigneeId || null,
      assignee_id: assigneeId || null,
      assignees: newAssignees,
      assignee_ids: assigneeId ? [assigneeId] : [],
    });
  };

  const handleSprintChange = (sprintVal) => {
    const targetSprint = sprintVal === 'backlog' || !sprintVal ? null : sprintVal;
    onUpdateIssue?.({
      ...issue,
      sprintId: targetSprint,
      sprint_id: targetSprint,
    });
  };

  const handleEpicChange = (epicVal) => {
    const targetEpic = epicVal === '' || !epicVal ? null : epicVal;
    onUpdateIssue?.({
      ...issue,
      epicId: targetEpic,
      parent_id: targetEpic,
    });
  };

  const handleSPChange = (sp) => {
    onUpdateIssue?.({ ...issue, storyPoints: Number(sp) || 0 });
  };

  const handleDueDateChange = (dueDate) => {
    onUpdateIssue?.({ ...issue, dueDate, due_date: dueDate });
  };

  const rawDueDate = issue?.due_date || issue?.dueDate;
  let formattedDueDateForInput = '';
  if (rawDueDate) {
    try {
      const d = new Date(rawDueDate);
      if (!isNaN(d.getTime())) {
        formattedDueDateForInput = d.toISOString().split('T')[0];
      }
    } catch (_) {}
  }

  const handleAddComment = (e) => {
    e.preventDefault();
    if (newComment.trim()) {
      setComments(prev => [
        ...prev,
        { id: `c-${Date.now()}`, author: 'Sarah Mitchell', time: 'Just now', text: newComment.trim() }
      ]);
      setNewComment('');
    }
  };

  const [childSprintId, setChildSprintId] = useState('');

  // Child items from workItems or issue.subtasks
  const childItems = React.useMemo(() => {
    if (!issue) return [];
    const fromWorkItems = (workItems || []).filter((w) => w.parent_id === issue.id);
    if (fromWorkItems.length > 0) {
      return fromWorkItems.map((item) => {
        const sp = sprints.find((s) => s.id === item.sprint_id);
        return {
          id: item.id,
          title: item.title,
          type: item.type,
          status: item.status,
          done: item.status === 'COMPLETED',
          sprint_id: item.sprint_id,
          sprintName: sp ? sp.name : 'Backlog',
          priority: item.priority,
        };
      });
    }
    return (issue.subtasks || []).map((st) => ({
      ...st,
      sprintName: sprints.find((s) => s.id === st.sprint_id)?.name || 'Backlog',
    }));
  }, [issue, workItems, sprints]);

  const handleAddChildSubmit = (e) => {
    e.preventDefault();
    if (newSubtaskTitle.trim() && allowedChildTypes.length > 0) {
      onAddSubtask?.(issue.id, newSubtaskTitle.trim(), childType, childSprintId || null);
      setNewSubtaskTitle('');
    }
  };

  if (!isOpen || !issue) return null;

  const completedSubtasks = childItems.filter((s) => s.done).length;
  const totalSubtasks = childItems.length;
  const subtaskProgress = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : null;

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[460px] bg-white border-l border-slate-200 shadow-xl z-50 flex flex-col text-xs select-none animate-in slide-in-from-right duration-200">
      {/* Top Drawer Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-slate-50/70 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-slate-700 text-xs">
            {issue.id}
          </span>
          <span className="text-slate-300">/</span>
          <span className="text-[11px] text-slate-500 font-medium">
            {currentEpic?.name || 'No Epic'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {canDelete && (
            <button
              onClick={() => onDeleteIssue?.(issue.id)}
              title="Delete Issue"
              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Title Input */}
        <div>
          {canEditTitleAndDesc ? (
            <textarea
              rows={2}
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleTitleBlur}
              placeholder="Issue summary..."
              className="w-full text-sm font-bold text-slate-900 border border-transparent hover:border-slate-200 focus:border-purple-500 focus:bg-white p-1.5 rounded-md resize-none transition-colors outline-none"
            />
          ) : (
            <div className="w-full text-sm font-bold text-slate-900 p-1.5 select-text">
              {issue.title || 'Untitled'}
            </div>
          )}
        </div>

        {/* Status / Priority / Assignee Attributes Grid */}
        <div className="rounded-md border border-slate-200 p-3 bg-slate-50/40 space-y-2.5">
          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Status</span>
            {canChangeStatus ? (
              <select
                value={issue.status || 'TODO'}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="px-2 py-1 rounded border border-slate-200 text-xs font-semibold bg-white text-slate-800 focus:outline-none focus:border-purple-600 cursor-pointer"
              >
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="IN_REVIEW">In Review</option>
                <option value="BLOCKED">Blocked</option>
                <option value="COMPLETED">Completed</option>
              </select>
            ) : (
              <span className="px-2 py-1 rounded border border-slate-200 text-xs font-semibold bg-slate-50 text-slate-700 select-none">
                {issue.status === 'IN_PROGRESS' ? 'In Progress' : issue.status === 'IN_REVIEW' ? 'In Review' : issue.status === 'COMPLETED' ? 'Completed' : issue.status === 'BLOCKED' ? 'Blocked' : 'To Do'}
              </span>
            )}
          </div>

          {/* Priority */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Priority</span>
            {canChangePriority ? (
              <select
                value={issue.priority || 'MEDIUM'}
                onChange={(e) => handlePriorityChange(e.target.value)}
                className="px-2 py-1 rounded border border-slate-200 text-xs font-medium bg-white text-slate-800 focus:outline-none focus:border-purple-600 cursor-pointer"
              >
                <option value="URGENT">Urgent</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            ) : (
              <span className="px-2 py-1 rounded border border-slate-200 text-xs font-medium bg-slate-50 text-slate-700 select-none">
                {issue.priority || 'Medium'}
              </span>
            )}
          </div>

          {/* Assignee */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Assignee</span>
            {canChangeAssignee ? (
              <select
                value={currentAssigneeId}
                onChange={(e) => handleAssigneeChange(e.target.value)}
                className="px-2 py-1 rounded border border-slate-200 text-xs font-medium bg-white text-slate-800 focus:outline-none focus:border-purple-600 max-w-[180px] cursor-pointer"
              >
                <option value="">Unassigned</option>
                {members.map((u) => {
                  const uid = u.user_id || u.id;
                  const uName = u.name || u.user?.name || u.email || u.user?.email || 'Member';
                  return (
                    <option key={uid} value={uid}>
                      {uName}
                    </option>
                  );
                })}
              </select>
            ) : (
              <span className="px-2 py-1 rounded border border-slate-200 text-xs font-medium bg-slate-50 text-slate-700 select-none truncate max-w-[180px]">
                {currentAssignee?.name || currentAssignee?.user?.name || currentAssignee?.email || 'Unassigned'}
              </span>
            )}
          </div>

          {/* Sprint */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Sprint</span>
            {isEpic ? (
              <span
                className={`px-2 py-1 rounded border text-xs font-medium max-w-[180px] truncate select-none ${
                  epicSprintSummary?.badgeClass || 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
                title={epicSprintSummary?.title || 'Derived from child items'}
              >
                {epicSprintSummary?.label || 'Backlog'}
              </span>
            ) : canChangeSprint ? (
              <select
                value={issue.sprint_id || issue.sprintId || 'backlog'}
                onChange={(e) => handleSprintChange(e.target.value)}
                className="px-2 py-1 rounded border border-slate-200 text-xs font-medium bg-white text-slate-800 focus:outline-none focus:border-purple-600 max-w-[180px] cursor-pointer"
              >
                <option value="backlog">Backlog (No Sprint)</option>
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.status})
                  </option>
                ))}
              </select>
            ) : (
              <span className="px-2 py-1 rounded border text-xs font-medium bg-slate-50 text-slate-600 border-slate-200 select-none truncate max-w-[180px]">
                {currentSprint ? currentSprint.name : 'Backlog'}
              </span>
            )}
          </div>

          {/* Epic */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Epic</span>
            {canChangeEpic ? (
              <select
                value={currentEpic?.id || issue.parent_id || issue.epicId || ''}
                onChange={(e) => handleEpicChange(e.target.value)}
                className="px-2 py-1 rounded border border-slate-200 text-xs font-medium bg-white text-slate-800 focus:outline-none focus:border-purple-600 max-w-[180px] cursor-pointer"
              >
                <option value="">None (No Epic)</option>
                {epics.map((e) => (
                  <option key={e.id} value={e.id}>{e.name || e.title}</option>
                ))}
              </select>
            ) : (
              <span className="px-2 py-1 rounded border border-slate-200 text-xs font-medium bg-slate-50 text-slate-700 select-none truncate max-w-[180px]">
                {currentEpic?.name || 'None'}
              </span>
            )}
          </div>

          {/* Story Points */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Story Points</span>
            {canChangeStoryPoints ? (
              <input
                type="number"
                min={0}
                max={100}
                value={issue.storyPoints ?? 0}
                onChange={(e) => handleSPChange(e.target.value)}
                className="w-16 px-2 py-0.5 rounded border border-slate-200 text-xs font-mono font-semibold bg-white text-slate-800 text-right focus:outline-none focus:border-purple-600 cursor-pointer"
              />
            ) : (
              <span className="px-2 py-0.5 text-xs font-mono font-semibold text-slate-700 select-none">
                {issue.storyPoints ?? issue.story_points ?? 0}
              </span>
            )}
          </div>

          {/* Due Date */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Due Date</span>
            </span>
            {canChangeDueDate ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={formattedDueDateForInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    const isoDate = val ? new Date(val).toISOString() : null;
                    handleDueDateChange(isoDate);
                  }}
                  className="px-2 py-0.5 rounded border border-slate-200 text-xs font-medium bg-white text-slate-800 focus:outline-none focus:border-purple-600 cursor-pointer shadow-2xs"
                />
                {formattedDueDateForInput && (
                  <button
                    type="button"
                    onClick={() => handleDueDateChange(null)}
                    title="Clear due date"
                    className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ) : (
              <span className="text-xs font-medium text-slate-700 select-none">
                {formattedDueDateForInput ? new Date(formattedDueDateForInput).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'No due date'}
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700">Description</label>
          {canEditTitleAndDesc ? (
            <textarea
              rows={3}
              value={editedDesc}
              onChange={(e) => setEditedDesc(e.target.value)}
              onBlur={handleDescBlur}
              placeholder="Add a detailed description..."
              className="w-full text-xs text-slate-800 p-2.5 rounded-md border border-slate-200 focus:border-purple-500 focus:outline-none resize-y"
            />
          ) : (
            <div className="w-full text-xs text-slate-800 p-2.5 rounded-md border border-slate-200 bg-slate-50/50 whitespace-pre-wrap min-h-[50px] select-text">
              {issue.description || <span className="text-slate-400 italic">No description provided.</span>}
            </div>
          )}
        </div>

        {/* Child Items Section */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
              <span>Child Items</span>
              <span className="text-slate-400 font-mono text-[11px]">
                ({completedSubtasks}/{totalSubtasks})
              </span>
            </div>
            {subtaskProgress !== null ? (
              <span className="text-[10px] text-purple-700 font-bold">{subtaskProgress}%</span>
            ) : (
              <span className="text-[10px] text-slate-400 font-medium">No child items</span>
            )}
          </div>

          {totalSubtasks > 0 && subtaskProgress !== null && (
            <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all"
                style={{ width: `${subtaskProgress}%` }}
              />
            </div>
          )}

          {/* Child Items List */}
          <div className="space-y-1">
            {childItems.map((st) => (
              <div
                key={st.id}
                className="flex items-center justify-between gap-2 p-1.5 rounded hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isIntern || canChangeStatus) {
                        onToggleSubtask?.(issue.id, st.id);
                      }
                    }}
                    disabled={isIntern && !canChangeStatus}
                    className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors shrink-0 ${
                      st.done ? 'bg-purple-600 border-purple-600 text-white' : 'border-slate-300 bg-white'
                    } ${isIntern && !canChangeStatus ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                  >
                    {st.done && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </button>
                  <span className="font-mono text-[10px] text-slate-400 shrink-0">{st.id}</span>
                  {st.type && (
                    <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-slate-100 text-slate-600 uppercase shrink-0">
                      {st.type}
                    </span>
                  )}
                  <span className={`text-xs truncate ${st.done ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                    {st.title}
                  </span>
                </div>

                {/* Sprint Badge */}
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 shrink-0">
                  {st.sprintName}
                </span>
              </div>
            ))}

            {/* Context-Sensitive Add Child Item */}
            {allowedChildTypes.length > 0 ? (
              <form onSubmit={handleAddChildSubmit} className="flex flex-col gap-1.5 pt-1">
                <div className="flex items-center gap-1.5">
                  {allowedChildTypes.length > 1 && (
                    <select
                      value={childType}
                      onChange={(e) => setChildType(e.target.value)}
                      className="px-1.5 py-1 text-[11px] font-bold rounded border border-purple-200 bg-purple-50 text-purple-800"
                    >
                      {allowedChildTypes.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  )}
                  <input
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder={`+ Add new ${childType.toLowerCase()}...`}
                    className="flex-1 px-2 py-1 text-xs rounded border border-slate-200 focus:outline-none focus:border-purple-600"
                  />
                  <button
                    type="submit"
                    disabled={!newSubtaskTitle.trim()}
                    className="px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-xs font-medium transition-colors cursor-pointer"
                  >
                    Add
                  </button>
                </div>

                {/* Sprint Selection */}
                {sprints.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pl-1">
                    <span>Assign to:</span>
                    <select
                      value={childSprintId}
                      onChange={(e) => setChildSprintId(e.target.value)}
                      className="px-1.5 py-0.5 text-[11px] rounded border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-purple-600"
                    >
                      <option value="">Backlog (No Sprint)</option>
                      {sprints.map((s) => (
                        <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
                      ))}
                    </select>
                  </div>
                )}
              </form>
            ) : (
              <div className="text-[11px] text-slate-400 italic py-1">
                Leaf item · Cannot have child items
              </div>
            )}
          </div>
        </div>

        {/* Activity & Comments Section */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between border-b border-slate-200">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveTab('comments')}
                className={`pb-1.5 font-semibold text-xs border-b-2 transition-colors ${
                  activeTab === 'comments'
                    ? 'border-purple-600 text-purple-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Comments ({comments.length})
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`pb-1.5 font-semibold text-xs border-b-2 transition-colors ${
                  activeTab === 'history'
                    ? 'border-purple-600 text-purple-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                History
              </button>
            </div>
          </div>

          {activeTab === 'comments' ? (
            <div className="space-y-2 pt-1">
              {/* Add Comment */}
              <form onSubmit={handleAddComment} className="space-y-1.5">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-200 focus:outline-none focus:border-purple-600"
                />
                {newComment.trim() && (
                  <button
                    type="submit"
                    className="px-2.5 py-1 rounded bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 transition-colors"
                  >
                    Save
                  </button>
                )}
              </form>

              {/* Comments List */}
              <div className="space-y-2 pt-2">
                {comments.map((c) => (
                  <div key={c.id} className="p-2 rounded bg-slate-50 border border-slate-100 space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-slate-800">{c.author}</span>
                      <span className="text-slate-400">{c.time}</span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed">{c.text}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-3 text-center text-xs text-slate-400">
              Activity log: Task moved to Sprint 04 on Dec 1 by Priya Sharma.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

