import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Bookmark,
  CheckSquare,
  AlertCircle,
  Zap,
  CornerDownRight,
  User,
  Plus,
  MoreHorizontal,
  Trash2,
  ExternalLink,
  Calendar,
  Check,
  Flame,
  ArrowUp,
  ArrowDown,
  Minus
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

/**
 * Jira Type Icon helper with appropriate branding colors
 */
export function IssueTypeIcon({ type, className = "w-3.5 h-3.5" }) {
  const t = String(type || '').toUpperCase();
  switch (t) {
    case 'EPIC':
      return (
        <span title="Epic" className="w-4 h-4 rounded bg-purple-100 border border-purple-200 text-purple-700 flex items-center justify-center shrink-0 shadow-xs">
          <Zap className={`${className} fill-purple-600 text-purple-600`} />
        </span>
      );
    case 'STORY':
      return (
        <span title="Story" className="w-4 h-4 rounded bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0 shadow-xs">
          <Bookmark className={`${className} fill-emerald-600 text-emerald-600`} />
        </span>
      );
    case 'BUG':
      return (
        <span title="Bug" className="w-4 h-4 rounded bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0 shadow-xs">
          <AlertCircle className={`${className} text-rose-600`} />
        </span>
      );
    case 'SUBTASK':
      return (
        <span title="Subtask" className="w-4 h-4 rounded bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0 shadow-xs">
          <CornerDownRight className={`${className} text-indigo-600`} />
        </span>
      );
    case 'TASK':
    default:
      return (
        <span title="Task" className="w-4 h-4 rounded bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0 shadow-xs">
          <CheckSquare className={`${className} text-blue-600`} />
        </span>
      );
  }
}

/**
 * Priority badge helper
 */
export function PriorityBadge({ priority }) {
  const p = String(priority || 'MEDIUM').toUpperCase();
  switch (p) {
    case 'URGENT':
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600">
          <Flame className="w-3 h-3 text-red-500 fill-red-500" />
          Urgent
        </span>
      );
    case 'HIGH':
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600">
          <ArrowUp className="w-3 h-3 text-rose-500" />
          High
        </span>
      );
    case 'LOW':
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
          <ArrowDown className="w-3 h-3 text-slate-400" />
          Low
        </span>
      );
    case 'MEDIUM':
    default:
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600">
          <Minus className="w-3 h-3 text-amber-500" />
          Medium
        </span>
      );
  }
}

/**
 * Status badge helper
 */
export function StatusBadge({ status }) {
  const s = String(status || 'TODO').toUpperCase();
  switch (s) {
    case 'COMPLETED':
    case 'DONE':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/80">
          Done
        </span>
      );
    case 'IN_PROGRESS':
    case 'IN PROGRESS':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200/80">
          In Progress
        </span>
      );
    case 'IN_REVIEW':
    case 'IN REVIEW':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200/80">
          In Review
        </span>
      );
    case 'BLOCKED':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200/80">
          Blocked
        </span>
      );
    case 'TODO':
    case 'TO DO':
    default:
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200/80">
          To Do
        </span>
      );
  }
}

/**
 * Derives a read-only sprint summary for parent epics based on descendant work items.
 * Rules:
 * - All assigned descendants belong to one sprint: Show sprint name and count (e.g., "test1 · 3 items")
 * - Descendants span multiple sprints: Show "Multiple sprints" with detail breakdown
 * - Some assigned, some unassigned: Show assigned sprint breakdown and unassigned count
 * - No descendants assigned to a sprint: Show "Backlog"
 * - No descendants exist: Show "No child items"
 * - Counts each descendant once (including nested), never counting the epic itself.
 */
export function getEpicSprintSummary(epic, allWorkItems = [], sprints = []) {
  if (!epic) {
    return {
      type: 'NO_CHILDREN',
      label: 'No child items',
      badgeClass: 'bg-slate-50 text-slate-400 border-slate-200',
      title: 'No child items',
      details: [],
    };
  }

  // Build parent -> children map from allWorkItems
  const childrenMap = new Map();
  allWorkItems.forEach((w) => {
    if (w.parent_id) {
      if (!childrenMap.has(w.parent_id)) {
        childrenMap.set(w.parent_id, []);
      }
      childrenMap.get(w.parent_id).push(w);
    }
  });

  // Breadth-first traversal to collect all descendants uniquely
  const descendants = [];
  const visited = new Set([epic.id]);
  const queue = [...(childrenMap.get(epic.id) || [])];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.id)) continue;
    visited.add(current.id);
    descendants.push(current);
    const children = childrenMap.get(current.id) || [];
    for (const c of children) {
      if (!visited.has(c.id)) {
        queue.push(c);
      }
    }
  }

  const totalDescendants = descendants.length;
  if (totalDescendants === 0) {
    return {
      type: 'NO_CHILDREN',
      label: 'No child items',
      badgeClass: 'bg-slate-50 text-slate-400 border-slate-200',
      title: 'No child items in this epic',
      details: [],
    };
  }

  const sprintNameMap = new Map();
  sprints.forEach((s) => sprintNameMap.set(s.id, s.name));

  const sprintCounts = new Map();
  let unassignedCount = 0;
  let assignedCount = 0;

  descendants.forEach((d) => {
    const sid = d.sprint_id;
    if (!sid || sid === 'backlog') {
      unassignedCount++;
    } else {
      assignedCount++;
      const sName = sprintNameMap.get(sid) || d.sprint?.name || 'Sprint';
      if (!sprintCounts.has(sid)) {
        sprintCounts.set(sid, { id: sid, name: sName, count: 0 });
      }
      sprintCounts.get(sid).count++;
    }
  });

  const distinctSprints = Array.from(sprintCounts.values());

  // 1. No descendants assigned to any sprint
  if (assignedCount === 0) {
    return {
      type: 'BACKLOG',
      label: 'Backlog',
      badgeClass: 'bg-slate-50 text-slate-500 border-slate-200',
      title: `All ${totalDescendants} child items are in Backlog (unscheduled)`,
      details: [{ name: 'Backlog (Unassigned)', count: unassignedCount, isBacklog: true }],
    };
  }

  // 2. All assigned descendants belong to ONE sprint
  if (distinctSprints.length === 1) {
    const s = distinctSprints[0];
    const itemWord = s.count === 1 ? 'item' : 'items';

    if (unassignedCount === 0) {
      // 100% of descendants in one sprint
      return {
        type: 'SINGLE_SPRINT',
        label: `${s.name} · ${s.count} ${itemWord}`,
        badgeClass: 'bg-purple-50 text-purple-700 border-purple-200 font-medium',
        title: `${s.name}: ${s.count} ${itemWord}`,
        details: [{ name: s.name, count: s.count, isBacklog: false }],
      };
    } else {
      // Some assigned to one sprint, others unassigned
      const unassignedWord = unassignedCount === 1 ? 'item' : 'items';
      return {
        type: 'PARTIAL_SPRINT',
        label: `${s.name} · ${s.count} (${unassignedCount} unassigned)`,
        badgeClass: 'bg-purple-50 text-purple-700 border-purple-200 font-medium',
        title: `${s.name}: ${s.count} ${itemWord} · Backlog: ${unassignedCount} ${unassignedWord}`,
        details: [
          { name: s.name, count: s.count, isBacklog: false },
          { name: 'Backlog (Unassigned)', count: unassignedCount, isBacklog: true },
        ],
      };
    }
  }

  // 3. Descendants span MULTIPLE sprints
  const parts = distinctSprints.map((s) => `${s.name}: ${s.count} ${s.count === 1 ? 'item' : 'items'}`);
  if (unassignedCount > 0) {
    parts.push(`Backlog: ${unassignedCount} ${unassignedCount === 1 ? 'item' : 'items'}`);
  }

  return {
    type: 'MULTIPLE_SPRINTS',
    label: `Multiple sprints (${distinctSprints.length})`,
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 font-medium',
    title: `Descendants span multiple sprints:\n${parts.join('\n')}`,
    details: [
      ...distinctSprints.map((s) => ({ name: s.name, count: s.count, isBacklog: false })),
      ...(unassignedCount > 0 ? [{ name: 'Backlog (Unassigned)', count: unassignedCount, isBacklog: true }] : []),
    ],
  };
}

/**
 * Individual Interactive Row
 */
function HierarchicalRow({
  item,
  level = 0,
  children = [],
  allDescendants = [],
  isContextualParent = false,
  isFlatView = false,
  isExpanded,
  onToggleExpand,
  sprints = [],
  members = [],
  allWorkItems = [],
  selectedIssueId,
  onSelectIssue,
  onUpdateStatus,
  onUpdatePriority,
  onUpdateAssignee,
  onUpdateSprint,
  onUpdateStoryPoints,
  onUpdateDueDate,
  onDeleteIssue,
  onAddChild,
  onDragStart,
  onDragEnd,
}) {
  const { user: authUser } = useAuth();
  const isIntern = authUser?.role === 'INTERN';
  const currentUserId = authUser?.id || authUser?.user_id;

  const isAssignedToMe = useMemo(() => {
    if (!item || !currentUserId) return false;
    if (Array.isArray(item.assignees)) {
      return item.assignees.some((a) => (a.user_id === currentUserId || a.id === currentUserId));
    }
    if (item.assignee && (item.assignee.id === currentUserId || item.assignee.user_id === currentUserId)) return true;
    if (item.assigneeId === currentUserId) return true;
    return false;
  }, [item, currentUserId]);

  const canDrag = !isIntern || isAssignedToMe;
  const canChangeStatus = !isIntern || isAssignedToMe;
  const canChangePriority = !isIntern;
  const canChangeAssignee = !isIntern;
  const canChangeSprint = !isIntern;
  const canChangeStoryPoints = !isIntern;
  const canChangeDueDate = !isIntern;
  const canDelete = !isIntern;

  const [menuOpen, setMenuOpen] = useState(null); // 'status' | 'priority' | 'assignee' | 'sprint' | 'points' | 'date' | 'more' | 'epicSprint'
  const [editingPoints, setEditingPoints] = useState(false);
  const [pointsValue, setPointsValue] = useState(item.story_points ?? '');
  const rowRef = useRef(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (rowRef.current && !rowRef.current.contains(e.target)) {
        setMenuOpen(null);
        setEditingPoints(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasChildren = children.length > 0;
  const isSelected = selectedIssueId === item.id;
  const itemType = String(item.type || '').toUpperCase();
  const isEpic = itemType === 'EPIC';
  const isStory = itemType === 'STORY';
  const isTask = itemType === 'TASK';
  const isLeaf = itemType === 'SUBTASK' || itemType === 'BUG';

  // Derived read-only sprint summary for parent epics based on descendants
  const epicSprintSummary = useMemo(() => {
    if (!isEpic) return null;
    return getEpicSprintSummary(item, allWorkItems, sprints);
  }, [isEpic, item, allWorkItems, sprints]);

  // Eligible leaf descendants (excluding epics and items that have children among descendants)
  const descendantParentIds = new Set(allDescendants.map((d) => d.parent_id).filter(Boolean));
  const eligibleLeafDescendants = allDescendants.filter(
    (d) => d.type !== 'EPIC' && !descendantParentIds.has(d.id)
  );

  const descendantTotalSp = eligibleLeafDescendants.reduce((acc, d) => acc + (Number(d.story_points) || 0), 0);
  const descendantCompletedSp = eligibleLeafDescendants
    .filter((d) => String(d.status).toUpperCase() === 'COMPLETED')
    .reduce((acc, d) => acc + (Number(d.story_points) || 0), 0);

  const ownPoints = Number(item.story_points) || 0;
  // For Epics: rollup all descendant leaf items
  // For Stories: if has children, rollup child tasks; if no children, use own direct points
  // For Tasks/Bugs: use own direct points
  const totalRolledUpPoints = isEpic
    ? descendantTotalSp
    : isStory
    ? (hasChildren ? descendantTotalSp : ownPoints)
    : ownPoints;

  const completedRolledUpPoints = isEpic
    ? descendantCompletedSp
    : isStory
    ? (hasChildren ? descendantCompletedSp : (item.status === 'COMPLETED' ? ownPoints : 0))
    : (item.status === 'COMPLETED' ? ownPoints : 0);

  // Story-point based progress calculation
  const totalDescendantsCount = allDescendants.length;
  const completedDescendantsCount = allDescendants.filter(
    (d) => String(d.status).toUpperCase() === 'COMPLETED'
  ).length;
  const hasSpWork = totalRolledUpPoints > 0;
  const progressPercent = hasSpWork
    ? Math.round((completedRolledUpPoints / totalRolledUpPoints) * 100)
    : totalDescendantsCount > 0
    ? Math.round((completedDescendantsCount / totalDescendantsCount) * 100)
    : item.status === 'COMPLETED'
    ? 100
    : 0;

  // Format short Key (e.g., EPIC-1a2b, STORY-8f3c, or id)
  const keyLabel = `${itemType.substring(0, 4)}-${item.id.substring(0, 4)}`.toUpperCase();

  // Current assignee
  const assignedUser = item.assignees?.[0]
    ? {
        id: item.assignees[0].user_id || item.assignees[0].id,
        name: item.assignees[0].name || item.assignees[0].user?.name || item.assignees[0].email,
        email: item.assignees[0].email || item.assignees[0].user?.email,
      }
    : (item.assignee ? {
        id: item.assignee.user_id || item.assignee.id,
        name: item.assignee.name || item.assignee.user?.name || item.assignee.email,
        email: item.assignee.email || item.assignee.user?.email,
      } : null);

  // Current sprint for individual stories, tasks, bugs
  const currentSprint = sprints.find((s) => s.id === item.sprint_id);
  const sprintLabel = currentSprint ? currentSprint.name : 'Backlog';

  // Overdue check
  const isOverdue = Boolean(
    item.due_date &&
      new Date(item.due_date) < new Date() &&
      item.status !== 'COMPLETED'
  );

  const formattedDueDate = item.due_date
    ? new Date(item.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  // Indentation style based on hierarchy level (no indentation in flat view)
  const indentPaddingLeft = isFlatView || level === 0 ? 'pl-2' : level === 1 ? 'pl-7' : level === 2 ? 'pl-12' : 'pl-16';

  const handlePointsSubmit = (e) => {
    e.preventDefault();
    if (isTask || isLeaf) {
      const val = parseInt(pointsValue, 10);
      if (isNaN(val) || val <= 0) {
        alert('Story points are mandatory for tasks, subtasks, and bugs and must be a positive integer greater than 0.');
        setPointsValue(item.story_points ?? 1);
        setEditingPoints(false);
        return;
      }
      onUpdateStoryPoints?.(item.id, val);
    } else {
      const val = pointsValue === '' ? null : Math.max(0, parseInt(pointsValue, 10) || 0);
      onUpdateStoryPoints?.(item.id, val);
    }
    setEditingPoints(false);
  };

  return (
    <div ref={rowRef} className="group border-b border-slate-100 last:border-b-0">
      <div
        draggable={canDrag}
        onDragStart={(e) => canDrag && onDragStart?.(e, item.id)}
        onDragEnd={onDragEnd}
        onClick={() => onSelectIssue?.(item)}
        className={`grid grid-cols-[minmax(260px,2.5fr)_90px_120px_110px_125px_60px_85px_95px_75px] items-center gap-2 px-3 py-2 text-xs transition-colors cursor-pointer select-none ${
          isSelected
            ? 'bg-purple-50/90 border-l-2 border-l-purple-600'
            : isContextualParent && !isFlatView
            ? 'bg-slate-50/60 hover:bg-purple-50/20 border-l-2 border-l-slate-300'
            : isEpic
            ? 'bg-slate-50/40 hover:bg-purple-50/30'
            : 'hover:bg-slate-50/80 bg-white'
        }`}
      >
        {/* COL 1: HIERARCHY + EXPANDER + TYPE + KEY + SUMMARY */}
        <div className={`flex items-center gap-1.5 min-w-0 pr-2 ${indentPaddingLeft}`}>
          {/* Expand/Collapse Toggle (omitted in flat view) */}
          {!isFlatView && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand?.(item.id);
              }}
              className={`w-4 h-4 rounded flex items-center justify-center transition-colors text-slate-400 hover:text-slate-700 shrink-0 ${
                !hasChildren ? 'invisible pointer-events-none' : ''
              }`}
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-600" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              )}
            </button>
          )}

          {/* Type Icon */}
          <IssueTypeIcon type={item.type} />

          {/* Issue Key Badge */}
          <span
            className={`font-mono text-[11px] font-bold shrink-0 ${
              isEpic ? 'text-purple-700' : 'text-slate-500'
            }`}
            title={`ID: ${item.id}`}
          >
            {keyLabel}
          </span>

          {/* Contextual Parent Tag in key block if applicable and not flat view */}
          {isContextualParent && !isFlatView && (
            <span
              className="text-[9px] font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200 shrink-0 select-none"
              title="Parent issue context: included to preserve hierarchy for matching descendant issues"
            >
              Parent
            </span>
          )}

          {/* Summary / Title */}
          <span
            className={`font-medium truncate transition-colors flex-1 ${
              item.status === 'COMPLETED' ? 'text-slate-700' : 'text-slate-900 group-hover:text-purple-700'
            } ${isEpic ? 'font-bold text-slate-900' : ''} ${
              isContextualParent && !isFlatView ? 'text-slate-600 italic' : ''
            }`}
            title={item.title}
          >
            {item.title}
          </span>

          {/* Child count badge (hidden in flat view) */}
          {!isFlatView && hasChildren && (
            <span className="hidden sm:inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 shrink-0">
              {children.length} {children.length === 1 ? 'child' : 'children'}
            </span>
          )}
        </div>

        {/* COL 2: PRIORITY DROPDOWN */}
        <div className="relative text-left shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              if (canChangePriority) {
                setMenuOpen(menuOpen === 'priority' ? null : 'priority');
              }
            }}
            className={`p-1 rounded transition-colors ${canChangePriority ? 'hover:bg-slate-100 cursor-pointer' : 'cursor-default'}`}
          >
            <PriorityBadge priority={item.priority} />
          </button>

          {canChangePriority && menuOpen === 'priority' && (
            <div className="absolute left-0 mt-1 w-32 bg-white rounded-md shadow-lg border border-slate-200 py-1 z-40">
              {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    onUpdatePriority?.(item.id, p);
                    setMenuOpen(null);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 text-xs hover:bg-slate-50 flex items-center justify-between cursor-pointer ${
                    item.priority === p ? 'bg-purple-50 text-purple-700 font-semibold' : 'text-slate-700'
                  }`}
                >
                  <PriorityBadge priority={p} />
                  {item.priority === p && <Check className="w-3 h-3 text-purple-600" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* COL 3: ASSIGNEE DROPDOWN */}
        <div className="relative flex items-center min-w-0 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              if (canChangeAssignee) {
                setMenuOpen(menuOpen === 'assignee' ? null : 'assignee');
              }
            }}
            className={`flex items-center gap-1.5 p-1 rounded transition-colors max-w-full truncate ${canChangeAssignee ? 'hover:bg-slate-100 cursor-pointer' : 'cursor-default'}`}
          >
            {assignedUser ? (
              <>
                <img
                  src={`https://ui-avatars.com/api/?name=${encodeURIComponent(assignedUser.name || 'User')}&background=7C3AED&color=fff`}
                  alt={assignedUser.name}
                  className="w-4 h-4 rounded-full object-cover shrink-0 border border-purple-200"
                />
                <span className="text-xs text-slate-700 truncate font-medium">{assignedUser.name}</span>
              </>
            ) : (
              <div className="flex items-center gap-1 text-slate-400">
                <div className="w-4 h-4 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[8px]">
                  <User className="w-2.5 h-2.5 text-slate-400" />
                </div>
                <span className="text-[11px]">Unassigned</span>
              </div>
            )}
          </button>

          {canChangeAssignee && menuOpen === 'assignee' && (
            <div className="absolute left-0 mt-1 w-48 bg-white rounded-md shadow-lg border border-slate-200 py-1 z-40 max-h-56 overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  onUpdateAssignee?.(item.id, []);
                  setMenuOpen(null);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center justify-between cursor-pointer ${
                  !assignedUser ? 'bg-purple-50 text-purple-700 font-semibold' : 'text-slate-600'
                }`}
              >
                <span>Unassigned</span>
                {!assignedUser && <Check className="w-3 h-3 text-purple-600" />}
              </button>

              {members.map((member) => {
                const uid = member.user_id || member.id;
                const name = member.user?.name || member.name || 'Member';
                const isSelectedMember = assignedUser?.id === uid;
                return (
                  <button
                    key={uid}
                    type="button"
                    onClick={() => {
                      onUpdateAssignee?.(item.id, [uid]);
                      setMenuOpen(null);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center justify-between cursor-pointer ${
                      isSelectedMember ? 'bg-purple-50 text-purple-700 font-semibold' : 'text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <img
                        src={`https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7C3AED&color=fff`}
                        alt={name}
                        className="w-4 h-4 rounded-full object-cover shrink-0"
                      />
                      <span className="truncate">{name}</span>
                    </div>
                    {isSelectedMember && <Check className="w-3 h-3 text-purple-600" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* COL 4: STATUS DROPDOWN + CONTEXTUAL PARENT INDICATOR */}
        <div className="relative text-left shrink-0" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => {
                if (canChangeStatus) {
                  setMenuOpen(menuOpen === 'status' ? null : 'status');
                }
              }}
              className={`p-0.5 rounded transition-opacity ${canChangeStatus ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
            >
              <StatusBadge status={item.status} />
            </button>
            {isContextualParent && !isFlatView && (
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200 select-none shadow-2xs"
                title="Contextual parent included because child items match active filters"
              >
                Parent
              </span>
            )}
          </div>

          {canChangeStatus && menuOpen === 'status' && (
            <div className="absolute left-0 mt-1 w-36 bg-white rounded-md shadow-lg border border-slate-200 py-1 z-40">
              {['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'COMPLETED'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    onUpdateStatus?.(item.id, st);
                    setMenuOpen(null);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 text-xs hover:bg-slate-50 flex items-center justify-between cursor-pointer ${
                    item.status === st ? 'bg-purple-50 text-purple-700 font-semibold' : 'text-slate-700'
                  }`}
                >
                  <StatusBadge status={st} />
                  {item.status === st && <Check className="w-3 h-3 text-purple-600" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* COL 5: SPRINT DROPDOWN / READ-ONLY SUMMARY */}
        <div className="relative text-left shrink-0" onClick={(e) => e.stopPropagation()}>
          {isEpic ? (
            /* Derived read-only sprint summary for parent Epics */
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  if (epicSprintSummary?.details?.length > 1) {
                    setMenuOpen(menuOpen === 'epicSprint' ? null : 'epicSprint');
                  }
                }}
                className={`px-1.5 py-0.5 rounded text-[11px] border truncate max-w-[120px] block select-none ${
                  epicSprintSummary?.details?.length > 1 ? 'cursor-pointer hover:ring-1 hover:ring-purple-300' : 'cursor-default'
                } ${epicSprintSummary?.badgeClass || 'bg-slate-50 text-slate-500 border-slate-200'}`}
                title={epicSprintSummary?.title || 'Sprint summary'}
              >
                {epicSprintSummary?.label || 'Backlog'}
              </button>

              {/* Expandable breakdown popover for multiple sprints / partial assignments */}
              {menuOpen === 'epicSprint' && epicSprintSummary?.details?.length > 1 && (
                <div className="absolute left-0 mt-1 w-56 bg-white rounded-xl shadow-xl border border-slate-200 p-2.5 z-40 text-slate-800 animate-in fade-in duration-100">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-1.5 mb-1.5 border-b border-slate-100 flex items-center justify-between">
                    <span>Sprint Breakdown</span>
                    <span className="text-purple-700 font-bold">{totalDescendantsCount} items</span>
                  </div>
                  <div className="space-y-1">
                    {epicSprintSummary.details.map((d) => (
                      <div key={d.name} className="flex items-center justify-between text-xs py-0.5">
                        <span className={`truncate max-w-[140px] ${d.isBacklog ? 'text-slate-500 italic' : 'text-slate-700 font-medium'}`}>
                          {d.name}
                        </span>
                        <span className="font-mono font-bold text-purple-700 shrink-0 ml-2">
                          {d.count} {d.count === 1 ? 'item' : 'items'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Standard interactive sprint dropdown for stories, tasks, bugs */
            <>
              <button
                type="button"
                onClick={() => {
                  if (canChangeSprint) {
                    setMenuOpen(menuOpen === 'sprint' ? null : 'sprint');
                  }
                }}
                className={`px-1.5 py-0.5 rounded text-[11px] font-medium border truncate max-w-[120px] block transition-colors ${
                  item.sprint_id
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
                } ${canChangeSprint ? 'hover:bg-purple-100 cursor-pointer' : 'cursor-default'}`}
                title={`Sprint: ${sprintLabel}`}
              >
                {sprintLabel}
              </button>

              {canChangeSprint && menuOpen === 'sprint' && (
                <div className="absolute left-0 mt-1 w-44 bg-white rounded-md shadow-lg border border-slate-200 py-1 z-40 max-h-52 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateSprint?.(item.id, null);
                      setMenuOpen(null);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center justify-between cursor-pointer ${
                      !item.sprint_id ? 'bg-purple-50 text-purple-700 font-semibold' : 'text-slate-700'
                    }`}
                  >
                    <span>Backlog</span>
                    {!item.sprint_id && <Check className="w-3 h-3 text-purple-600" />}
                  </button>

                  {sprints.map((sprint) => (
                    <button
                      key={sprint.id}
                      type="button"
                      onClick={() => {
                        onUpdateSprint?.(item.id, sprint.id);
                        setMenuOpen(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center justify-between cursor-pointer ${
                        item.sprint_id === sprint.id ? 'bg-purple-50 text-purple-700 font-semibold' : 'text-slate-700'
                      }`}
                    >
                      <span className="truncate">{sprint.name}</span>
                      {item.sprint_id === sprint.id && <Check className="w-3 h-3 text-purple-600" />}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* COL 6: STORY POINTS */}
        <div className="flex justify-center shrink-0" onClick={(e) => e.stopPropagation()}>
          {canChangeStoryPoints && editingPoints ? (
            <form onSubmit={handlePointsSubmit} className="w-12">
              <input
                type="number"
                min="0"
                max="999"
                autoFocus
                value={pointsValue}
                onChange={(e) => setPointsValue(e.target.value)}
                onBlur={handlePointsSubmit}
                className="w-full px-1 py-0.5 text-center text-xs font-mono font-bold rounded border border-purple-400 bg-white shadow-xs focus:outline-none"
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (canChangeStoryPoints) {
                  setPointsValue(item.story_points ?? '');
                  setEditingPoints(true);
                }
              }}
              title={
                hasChildren
                  ? `Own: ${ownPoints} SP, Total (with descendants): ${totalRolledUpPoints} SP`
                  : canChangeStoryPoints ? 'Click to edit Story Points' : 'Story Points'
              }
              className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-slate-100 font-mono font-bold text-[11px] transition-colors ${
                canChangeStoryPoints ? 'hover:bg-purple-100 text-slate-700 hover:text-purple-800 cursor-pointer' : 'text-slate-600 cursor-default'
              }`}
            >
              {totalRolledUpPoints > 0 ? (
                <span>{totalRolledUpPoints}</span>
              ) : (
                <span className="text-slate-400">-</span>
              )}
            </button>
          )}
        </div>

        {/* COL 7: DUE DATE */}
        <div className="relative text-left shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              if (canChangeDueDate) {
                setMenuOpen(menuOpen === 'date' ? null : 'date');
              }
            }}
            className={`text-[11px] font-medium p-1 rounded transition-colors ${
              canChangeDueDate ? 'hover:bg-slate-100 cursor-pointer' : 'cursor-default'
            } ${
              isOverdue ? 'text-rose-600 font-bold' : item.due_date ? 'text-slate-600' : 'text-slate-300'
            }`}
          >
            {formattedDueDate || '-'}
          </button>

          {canChangeDueDate && menuOpen === 'date' && (
            <div className="absolute right-0 mt-1 w-44 bg-white rounded-md shadow-lg border border-slate-200 p-2 z-40">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Set Due Date
              </label>
              <input
                type="date"
                defaultValue={item.due_date ? new Date(item.due_date).toISOString().split('T')[0] : ''}
                onChange={(e) => {
                  onUpdateDueDate?.(item.id, e.target.value || null);
                  setMenuOpen(null);
                }}
                className="w-full text-xs p-1 border border-slate-300 rounded focus:outline-none focus:border-purple-600"
              />
              {item.due_date && (
                <button
                  type="button"
                  onClick={() => {
                    onUpdateDueDate?.(item.id, null);
                    setMenuOpen(null);
                  }}
                  className="mt-1.5 w-full text-[10px] text-rose-600 font-semibold hover:underline text-center cursor-pointer"
                >
                  Clear date
                </button>
              )}
            </div>
          )}
        </div>

        {/* COL 8: PROGRESS / TOTALS */}
        <div className="shrink-0 text-left">
          {totalDescendantsCount > 0 ? (
            <div className="space-y-0.5">
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span>
                  {hasSpWork
                    ? `${completedRolledUpPoints}/${totalRolledUpPoints} SP`
                    : `${completedDescendantsCount}/${totalDescendantsCount}`}
                </span>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden border border-slate-200">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          ) : (
            <span className="text-[10px] text-slate-300 font-mono">-</span>
          )}
        </div>

        {/* COL 9: CONTEXT-SENSITIVE ACTIONS (+ child, ...) */}
        <div className="flex items-center justify-end gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Quick Add Child Button (Only for non-leaf items: Epic, Story, Task; Interns cannot create stories on Epics) */}
          {!isLeaf && (!isIntern || isStory || isTask) && (
            <button
              type="button"
              onClick={() => onAddChild?.(item)}
              title={
                isEpic
                  ? 'Add Story or Bug under this Epic'
                  : isStory
                  ? 'Add Task or Bug under this Story'
                  : 'Add Subtask under this Task'
              }
              className="w-5 h-5 rounded hover:bg-purple-100 hover:text-purple-700 text-slate-400 flex items-center justify-center transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Row Menu Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(menuOpen === 'more' ? null : 'more')}
              className="w-5 h-5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>

            {menuOpen === 'more' && (
              <div className="absolute right-0 mt-1 w-36 bg-white rounded-md shadow-lg border border-slate-200 py-1 z-40">
                <button
                  type="button"
                  onClick={() => {
                    onSelectIssue?.(item);
                    setMenuOpen(null);
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                  <span>View Details</span>
                </button>

                {!isLeaf && (!isIntern || isStory || isTask) && (
                  <button
                    type="button"
                    onClick={() => {
                      onAddChild?.(item);
                      setMenuOpen(null);
                    }}
                    className="w-full text-left px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-purple-600" />
                    <span>
                      {isEpic ? 'Add Story/Bug' : isStory ? 'Add Task/Bug' : 'Add Subtask'}
                    </span>
                  </button>
                )}

                {canDelete && (
                  <>
                    <div className="my-1 border-t border-slate-100" />
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to delete "${item.title}"?`)) {
                          onDeleteIssue?.(item.id);
                        }
                        setMenuOpen(null);
                      }}
                      className="w-full text-left px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-1.5 font-medium cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3 text-rose-500" />
                      <span>Delete Issue</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Recursive Tree Node renderer
 */
function HierarchicalNode({
  node,
  level = 0,
  expandedIds,
  onToggleExpand,
  sprints,
  members,
  allWorkItems,
  selectedIssueId,
  onSelectIssue,
  onUpdateStatus,
  onUpdatePriority,
  onUpdateAssignee,
  onUpdateSprint,
  onUpdateStoryPoints,
  onUpdateDueDate,
  onDeleteIssue,
  onAddChild,
  onDragStart,
  onDragEnd,
  isFlatView = false,
}) {
  const isExpanded = expandedIds.has(node.item.id);

  return (
    <>
      <HierarchicalRow
        item={node.item}
        level={level}
        children={node.children.map((c) => c.item)}
        allDescendants={node.allDescendants}
        isContextualParent={node.isContextualParent}
        isFlatView={isFlatView}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
        sprints={sprints}
        members={members}
        allWorkItems={allWorkItems}
        selectedIssueId={selectedIssueId}
        onSelectIssue={onSelectIssue}
        onUpdateStatus={onUpdateStatus}
        onUpdatePriority={onUpdatePriority}
        onUpdateAssignee={onUpdateAssignee}
        onUpdateSprint={onUpdateSprint}
        onUpdateStoryPoints={onUpdateStoryPoints}
        onUpdateDueDate={onUpdateDueDate}
        onDeleteIssue={onDeleteIssue}
        onAddChild={onAddChild}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />

      {isExpanded && node.children.length > 0 && (
        <>
          {node.children.map((childNode) => (
            <HierarchicalNode
              key={childNode.item.id}
              node={childNode}
              level={level + 1}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              sprints={sprints}
              members={members}
              allWorkItems={allWorkItems}
              selectedIssueId={selectedIssueId}
              onSelectIssue={onSelectIssue}
              onUpdateStatus={onUpdateStatus}
              onUpdatePriority={onUpdatePriority}
              onUpdateAssignee={onUpdateAssignee}
              onUpdateSprint={onUpdateSprint}
              onUpdateStoryPoints={onUpdateStoryPoints}
              onUpdateDueDate={onUpdateDueDate}
              onDeleteIssue={onDeleteIssue}
              onAddChild={onAddChild}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              isFlatView={isFlatView}
            />
          ))}
        </>
      )}
    </>
  );
}

/**
 * Main Jira-style Expandable Table
 */
export default function HierarchicalIssueTable({
  issues = [],
  allWorkItems = [],
  sprints = [],
  members = [],
  selectedIssueId,
  onSelectIssue,
  onUpdateStatus,
  onUpdatePriority,
  onUpdateAssignee,
  onUpdateSprint,
  onUpdateStoryPoints,
  onUpdateDueDate,
  onDeleteIssue,
  onAddChild,
  expandedIds = new Set(),
  onToggleExpand,
  isHierarchical = true,
  hasActiveFilters = false,
  onDragStart,
  onDragEnd,
  emptyMessage = "No issues found in this view.",
}) {
  // Build tree nodes for hierarchical display
  const treeNodes = useMemo(() => {
    if (!isHierarchical) {
      return issues.map((item) => ({
        item,
        isContextualParent: false,
        children: [],
        allDescendants: [],
      }));
    }

    // Build an indexed lookup of all project items and issues in current view
    const itemMap = new Map();
    const pool = allWorkItems.length > 0 ? allWorkItems : issues;
    pool.forEach((item) => {
      itemMap.set(item.id, item);
    });

    // 1. Directly matching issue IDs
    const matchingIds = new Set(issues.map((i) => i.id));
    const isFilteringActive = Boolean(
      hasActiveFilters || (allWorkItems.length > 0 && matchingIds.size < pool.length)
    );

    // 2. Identify all required ancestors for directly matching issues
    const requiredAncestorIds = new Set();
    issues.forEach((item) => {
      let curr = itemMap.get(item.parent_id);
      while (curr) {
        requiredAncestorIds.add(curr.id);
        curr = itemMap.get(curr.parent_id);
      }
    });

    // 3. Determine visible items in this view:
    // Only direct matches + required ancestors should ever be visible
    const visibleIds = new Set([...matchingIds, ...requiredAncestorIds]);

    // 4. Map visible children to each parent
    const visibleChildrenByParent = new Map();
    pool.forEach((item) => {
      if (item.parent_id && visibleIds.has(item.id)) {
        if (!visibleChildrenByParent.has(item.parent_id)) {
          visibleChildrenByParent.set(item.parent_id, []);
        }
        visibleChildrenByParent.get(item.parent_id).push(item);
      }
    });

    // 5. Recursive node builder
    function buildNode(item) {
      const childItems = visibleChildrenByParent.get(item.id) || [];
      const childNodes = childItems.map(buildNode);

      let allDescendants = [...childItems];
      childNodes.forEach((cn) => {
        allDescendants = allDescendants.concat(cn.allDescendants);
      });

      // Contextual parent = included to preserve hierarchy, but did not match active filters or sprint scope directly
      const isContextualParent = !matchingIds.has(item.id);

      return {
        item,
        isContextualParent,
        children: childNodes,
        allDescendants,
      };
    }

    // 6. Identify root items for the visible hierarchy:
    // An item is a root if:
    // - It is visible (visibleIds.has(item.id)), AND
    // - It has no parent_id, OR its parent is NOT in visibleIds
    const rootItems = pool.filter((item) => {
      if (!visibleIds.has(item.id)) return false;
      if (!item.parent_id) return true;
      if (!visibleIds.has(item.parent_id)) return true;
      return false;
    });

    return rootItems.map(buildNode);
  }, [issues, allWorkItems, isHierarchical, hasActiveFilters]);

  return (
    <div className="rounded-md border border-slate-200 bg-white overflow-hidden shadow-xs">
      {/* Table Header: Precise columns matching Jira */}
      <div className="grid grid-cols-[minmax(260px,2.5fr)_90px_120px_110px_125px_60px_85px_95px_75px] items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider select-none">
        <div>Key &amp; Summary</div>
        <div>Priority</div>
        <div>Assignee</div>
        <div>Status</div>
        <div>Sprint</div>
        <div className="text-center">Points</div>
        <div>Due Date</div>
        <div>Progress</div>
        <div className="text-right pr-2">Actions</div>
      </div>

      {/* Table Body */}
      <div className="divide-y divide-slate-100">
        {treeNodes.length > 0 ? (
          treeNodes.map((node) => (
            <HierarchicalNode
              key={node.item.id}
              node={node}
              level={0}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              sprints={sprints}
              members={members}
              allWorkItems={allWorkItems}
              selectedIssueId={selectedIssueId}
              onSelectIssue={onSelectIssue}
              onUpdateStatus={onUpdateStatus}
              onUpdatePriority={onUpdatePriority}
              onUpdateAssignee={onUpdateAssignee}
              onUpdateSprint={onUpdateSprint}
              onUpdateStoryPoints={onUpdateStoryPoints}
              onUpdateDueDate={onUpdateDueDate}
              onDeleteIssue={onDeleteIssue}
              onAddChild={onAddChild}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              isFlatView={!isHierarchical}
            />
          ))
        ) : (
          <div className="py-12 text-center text-xs text-slate-400">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}

