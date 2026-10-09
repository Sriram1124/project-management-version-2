import React, { useState, useEffect } from 'react';
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

export default function IssueDetailDrawer({
  issue,
  epics = [],
  sprints = [],
  members = [],
  isOpen,
  onClose,
  onUpdateIssue,
  onDeleteIssue,
  onToggleSubtask,
  onAddSubtask,
}) {
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
    if (t === 'EPIC') return ['STORY', 'BUG'];
    if (t === 'STORY') return ['TASK', 'BUG'];
    if (t === 'TASK') return ['SUBTASK'];
    return [];
  }, [issue?.type]);

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

  const currentEpic = epics.find(e => e.id === issue?.epicId);
  const currentSprint = sprints.find(s => s.id === issue?.sprintId);

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
    onUpdateIssue?.({ ...issue, assignee: user, assigneeId: assigneeId || null });
  };

  const handleSprintChange = (sprintId) => {
    onUpdateIssue?.({ ...issue, sprintId });
  };

  const handleEpicChange = (epicId) => {
    onUpdateIssue?.({ ...issue, epicId });
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

  const handleAddChildSubmit = (e) => {
    e.preventDefault();
    if (newSubtaskTitle.trim() && allowedChildTypes.length > 0) {
      onAddSubtask?.(issue.id, newSubtaskTitle.trim(), childType);
      setNewSubtaskTitle('');
    }
  };

  if (!isOpen || !issue) return null;

  const completedSubtasks = (issue.subtasks || []).filter(s => s.done).length;
  const totalSubtasks = (issue.subtasks || []).length;
  const subtaskProgress = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;

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
          <button
            onClick={() => onDeleteIssue?.(issue.id)}
            title="Delete Issue"
            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Title Input */}
        <div>
          <textarea
            rows={2}
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            onBlur={handleTitleBlur}
            placeholder="Issue summary..."
            className="w-full text-sm font-bold text-slate-900 border border-transparent hover:border-slate-200 focus:border-purple-500 focus:bg-white p-1.5 rounded-md resize-none transition-colors outline-none"
          />
        </div>

        {/* Status / Priority / Assignee Attributes Grid */}
        <div className="rounded-md border border-slate-200 p-3 bg-slate-50/40 space-y-2.5">
          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Status</span>
            <select
              value={issue.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="px-2 py-1 rounded border border-slate-200 text-xs font-semibold bg-white text-slate-800 focus:outline-none focus:border-purple-600"
            >
              <option value="TO DO">TO DO</option>
              <option value="IN PROGRESS">IN PROGRESS</option>
              <option value="IN REVIEW">IN REVIEW</option>
              <option value="BLOCKED">BLOCKED</option>
              <option value="DONE">DONE</option>
            </select>
          </div>

          {/* Priority */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Priority</span>
            <select
              value={issue.priority}
              onChange={(e) => handlePriorityChange(e.target.value)}
              className="px-2 py-1 rounded border border-slate-200 text-xs font-medium bg-white text-slate-800 focus:outline-none focus:border-purple-600"
            >
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>

          {/* Assignee */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Assignee</span>
            <select
              value={issue.assignee?.id || issue.assignee?.user_id || ''}
              onChange={(e) => handleAssigneeChange(e.target.value)}
              className="px-2 py-1 rounded border border-slate-200 text-xs font-medium bg-white text-slate-800 focus:outline-none focus:border-purple-600 max-w-[180px]"
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
          </div>

          {/* Sprint */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Sprint</span>
            <select
              value={issue.sprintId || 'backlog'}
              onChange={(e) => handleSprintChange(e.target.value)}
              className="px-2 py-1 rounded border border-slate-200 text-xs font-medium bg-white text-slate-800 focus:outline-none focus:border-purple-600"
            >
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Epic */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Epic</span>
            <select
              value={issue.epicId || ''}
              onChange={(e) => handleEpicChange(e.target.value)}
              className="px-2 py-1 rounded border border-slate-200 text-xs font-medium bg-white text-slate-800 focus:outline-none focus:border-purple-600 max-w-[180px]"
            >
              <option value="">None</option>
              {epics.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>

          {/* Story Points */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Story Points</span>
            <input
              type="number"
              min={0}
              max={100}
              value={issue.storyPoints ?? 0}
              onChange={(e) => handleSPChange(e.target.value)}
              className="w-16 px-2 py-0.5 rounded border border-slate-200 text-xs font-mono font-semibold bg-white text-slate-800 text-right focus:outline-none focus:border-purple-600"
            />
          </div>

          {/* Due Date */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Due Date</span>
            </span>
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
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700">Description</label>
          <textarea
            rows={3}
            value={editedDesc}
            onChange={(e) => setEditedDesc(e.target.value)}
            onBlur={handleDescBlur}
            placeholder="Add a detailed description..."
            className="w-full text-xs text-slate-800 p-2.5 rounded-md border border-slate-200 focus:border-purple-500 focus:outline-none resize-y"
          />
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
            <span className="text-[10px] text-slate-400 font-semibold">{subtaskProgress}%</span>
          </div>

          {totalSubtasks > 0 && (
            <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all"
                style={{ width: `${subtaskProgress}%` }}
              />
            </div>
          )}

          {/* Child Items List */}
          <div className="space-y-1">
            {issue.subtasks?.map((st) => (
              <div
                key={st.id}
                className="flex items-center justify-between gap-2 p-1.5 rounded hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => onToggleSubtask?.(issue.id, st.id)}
                    className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                      st.done ? 'bg-purple-600 border-purple-600 text-white' : 'border-slate-300 bg-white'
                    }`}
                  >
                    {st.done && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </button>
                  <span className="font-mono text-[10px] text-slate-400">{st.id}</span>
                  <span className="text-xs text-slate-800 truncate">
                    {st.title}
                  </span>
                </div>
              </div>
            ))}

            {/* Context-Sensitive Add Child Item */}
            {allowedChildTypes.length > 0 ? (
              <form onSubmit={handleAddChildSubmit} className="flex items-center gap-1.5 pt-1">
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
                  className="px-2 py-1 rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-xs font-medium transition-colors"
                >
                  Add
                </button>
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

