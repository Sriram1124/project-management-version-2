import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Plus, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  Check, 
  Play,
  Users, 
  AlertTriangle,
  Loader2,
  Calendar,
  ChevronDown,
  ArrowLeft,
  Zap,
  Bookmark,
  Trash2,
  Edit3,
  TrendingUp,
  TrendingDown,
  Hourglass,
  Target,
  ChevronUp
} from 'lucide-react';
import { sprintsService } from '../../../services/sprints.service';
import { workItemsService } from '../../../services/workItems.service';
import { projectsService } from '../../../services/projects.service';
import { timesheetService } from '../../../services/timesheet.service';
import { useAuth } from '../../../context/AuthContext';
import AddTaskModal from '../../kanban/AddTaskModal';
import TaskDetailModal from '../../kanban/TaskDetailModal';
import CompleteSprintModal from '../../kanban/CompleteSprintModal';
import LogWorkModal from '../../kanban/LogWorkModal';
import CreateSprintModal from '../../modals/CreateSprintModal';
import EditSprintModal from '../../modals/EditSprintModal';

export default function ProjectSprintWorkspaceTab({ 
  projectId, 
  selectedSprintId: propSelectedSprintId, 
  onBackToRoadmap, 
  onToast,
  readOnly = false,
}) {
  const { user: authUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sprints, setSprints] = useState([]);
  const [workItems, setWorkItems] = useState([]);
  const [members, setMembers] = useState([]);

  // Selected sprint to display (defaults to prop if provided, else active sprint if available, or first planned/completed)
  const [selectedSprintId, setSelectedSprintId] = useState(propSelectedSprintId || null);

  useEffect(() => {
    if (propSelectedSprintId) {
      setSelectedSprintId(propSelectedSprintId);
    }
  }, [propSelectedSprintId]);
  const [quickFilter, setQuickFilter] = useState('all'); // 'all' | 'my-tasks' | 'overdue' | 'blocked'

  // Drag and Drop State
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverColId, setDragOverColId] = useState(null);

  // Modals
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [addTaskColumnId, setAddTaskColumnId] = useState('TODO');
  const [selectedTask, setSelectedTask] = useState(null);
  const [isLogWorkOpen, setIsLogWorkOpen] = useState(false);
  const [isCompleteSprintOpen, setIsCompleteSprintOpen] = useState(false);
  const [isCreateSprintOpen, setIsCreateSprintOpen] = useState(false);
  const [editingSprint, setEditingSprint] = useState(null);
  const [startingSprint, setStartingSprint] = useState(false);
  const [showSummaryTable, setShowSummaryTable] = useState(true);

  const hasLoadedRef = React.useRef(false);

  const loadData = useCallback(async (silent = false) => {
    if (!projectId) return;
    try {
      if (!silent && !hasLoadedRef.current) {
        setLoading(true);
      }
      const [sprintsList, itemsList, membersList] = await Promise.all([
        sprintsService.getSprints(projectId).catch(() => []),
        workItemsService.listWorkItems({ project_id: projectId }).catch(() => []),
        projectsService.getMembers(projectId).catch(() => []),
      ]);
      setSprints(sprintsList || []);
      setWorkItems(itemsList || []);
      setMembers(membersList || []);
      hasLoadedRef.current = true;

      // Auto-select propSelectedSprintId, active sprint, or planned, or first available
      if (propSelectedSprintId && (sprintsList || []).some((s) => s.id === propSelectedSprintId)) {
        setSelectedSprintId(propSelectedSprintId);
      } else {
        const active = (sprintsList || []).find((s) => s.status === 'ACTIVE');
        if (active) {
          setSelectedSprintId((prev) => prev || active.id);
        } else if (sprintsList && sprintsList.length > 0) {
          setSelectedSprintId((prev) => prev || sprintsList[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load sprint workspace data:', err);
      onToast?.('Failed to load sprint workspace data');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handleSync = (e) => {
      const detail = e?.detail;
      if (detail?.action === 'update' && detail?.item?.id) {
        setWorkItems((prev) => prev.map((item) => (item.id === detail.item.id ? { ...item, ...detail.item } : item)));
        setSelectedTask((prev) => (prev && prev.id === detail.item.id ? { ...prev, ...detail.item } : prev));
        return;
      }
      if (detail?.action === 'delete' && detail?.id) {
        setWorkItems((prev) => prev.filter((item) => item.id !== detail.id));
        setSelectedTask((prev) => (prev && prev.id === detail.id ? null : prev));
        return;
      }
      loadData(true);
    };
    window.addEventListener('work-items-updated', handleSync);
    return () => window.removeEventListener('work-items-updated', handleSync);
  }, [loadData]);

  // Active sprint in the project
  const activeSprint = useMemo(() => {
    return sprints.find((s) => s.status === 'ACTIVE') || null;
  }, [sprints]);

  // The sprint currently being viewed in the workspace
  const currentSprint = useMemo(() => {
    if (!sprints.length) return null;
    if (selectedSprintId) {
      const found = sprints.find((s) => s.id === selectedSprintId);
      if (found) return found;
    }
    return activeSprint || sprints[0];
  }, [sprints, selectedSprintId, activeSprint]);

  const upcomingSprints = useMemo(() => {
    return sprints.filter((s) => s.status === 'PLANNED');
  }, [sprints]);

  // All work items in the currently viewed sprint (including child tasks whose parent story is in this sprint)
  const sprintWorkItems = useMemo(() => {
    if (!currentSprint) return [];
    const storyInSprintIds = new Set(
      workItems.filter((w) => w.sprint_id === currentSprint.id && w.type === 'STORY').map((w) => w.id)
    );
    return workItems.filter(
      (w) =>
        w.type !== 'EPIC' &&
        (w.sprint_id === currentSprint.id || (w.parent_id && storyInSprintIds.has(w.parent_id)))
    );
  }, [workItems, currentSprint]);

  // Leaf deliverables in the sprint (avoids double counting parent stories and their child tasks)
  const parentIdsInSprint = useMemo(() => {
    return new Set(sprintWorkItems.map((w) => w.parent_id).filter(Boolean));
  }, [sprintWorkItems]);

  // Deliverable tasks/stories in the currently viewed sprint
  const sprintTasks = useMemo(() => {
    return sprintWorkItems.filter((w) => !parentIdsInSprint.has(w.id));
  }, [sprintWorkItems, parentIdsInSprint]);

  // Filter sprint tasks by quick filter
  const filteredTasks = useMemo(() => {
    const currentUserId = authUser?.id || authUser?.user_id;

    return sprintTasks.filter((t) => {
      if (quickFilter === 'my-tasks') {
        if (!currentUserId) return false;
        const isAssigned = Boolean(
          t.assignees?.some((a) => {
            const aId = a.user_id || a.id;
            return Boolean(aId) && aId === currentUserId;
          })
        );
        if (!isAssigned) return false;
      }
      if (quickFilter === 'overdue') {
        if (!t.due_date || new Date(t.due_date) >= new Date() || t.status === 'COMPLETED') {
          return false;
        }
      }
      if (quickFilter === 'blocked') {
        if (t.status !== 'BLOCKED') return false;
      }
      return true;
    });
  }, [sprintTasks, quickFilter, authUser]);

  // Metrics calculation
  const totalCount = sprintTasks.length;
  const completedCount = sprintTasks.filter((t) => t.status === 'COMPLETED').length;
  const inProgressCount = sprintTasks.filter((t) => t.status === 'IN_PROGRESS').length;
  const inReviewCount = sprintTasks.filter((t) => t.status === 'IN_REVIEW').length;
  const blockedCount = sprintTasks.filter((t) => t.status === 'BLOCKED').length;
  const overdueCount = sprintTasks.filter(
    (t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'COMPLETED'
  ).length;
  const incompleteCount = totalCount - completedCount;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Real logged minutes from timesheet entries on sprint tasks
  const totalLoggedMinutes = useMemo(() => {
    return sprintTasks.reduce((acc, t) => acc + (t.logged_minutes || 0), 0);
  }, [sprintTasks]);

  const hoursLoggedFormatted = `${Math.floor(totalLoggedMinutes / 60)}h ${totalLoggedMinutes % 60}m`;

  // Story Points rollup
  const totalStoryPoints = useMemo(() => {
    return sprintTasks.reduce((acc, t) => acc + (t.story_points || 0), 0);
  }, [sprintTasks]);

  const completedStoryPoints = useMemo(() => {
    return sprintTasks
      .filter((t) => t.status === 'COMPLETED')
      .reduce((acc, t) => acc + (t.story_points || 0), 0);
  }, [sprintTasks]);

  // Unique contributors
  const contributors = useMemo(() => {
    const set = new Set();
    sprintTasks.forEach((t) => {
      (t.assignees || []).forEach((a) => {
        if (a.name || a.email) set.add(a.name || a.email);
      });
    });
    return Array.from(set);
  }, [sprintTasks]);

  // Drag and Drop Handlers
  const handleDragStart = (e, taskId) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverColId(null);
  };

  const handleDropTask = async (e, targetColumnId) => {
    e.preventDefault();
    setDragOverColId(null);
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    if (!taskId) return;

    const task = workItems.find((t) => t.id === taskId);
    if (!task || task.status === targetColumnId) return;

    const prevStatus = task.status;
    const targetCol = columns.find((c) => c.id === targetColumnId);

    // Optimistic UI update
    setWorkItems((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: targetColumnId } : t))
    );

    try {
      await workItemsService.updateWorkItem(taskId, { status: targetColumnId });
      onToast?.(`Moved "${task.title}" to ${targetCol?.title || targetColumnId}`);
    } catch (err) {
      console.error('Failed to update task status:', err);
      // Rollback
      setWorkItems((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: prevStatus } : t))
      );
      onToast?.(err.message || 'Failed to update task status');
    }
  };

  // Real Log Work Handler
  const handleSaveLog = async ({ hours, minutes, description, date, taskId }) => {
    try {
      const durationMinutes = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
      if (durationMinutes <= 0) {
        onToast?.('Please enter a valid time duration');
        return;
      }
      if (!taskId) {
        onToast?.('Please select a task to log work against');
        return;
      }
      await timesheetService.createEntry({
        task_id: taskId,
        project_id: projectId,
        duration_minutes: durationMinutes,
        date: date || new Date().toISOString(),
        notes: description || null,
      });
      onToast?.(`Logged ${hours}h ${minutes}m successfully`);
      loadData();
    } catch (err) {
      console.error('Failed to log work:', err);
      onToast?.(err.message || 'Failed to log work');
    }
  };

  // Start Sprint Handler
  const handleStartSprint = async (sprintId) => {
    const activeSprint = sprints.find((s) => s.status === 'ACTIVE');
    if (activeSprint && activeSprint.id !== sprintId) {
      onToast?.(
        `Cannot start sprint: Sprint "${activeSprint.name}" is currently active. Please complete or resolve it first.`
      );
      return;
    }

    try {
      setStartingSprint(true);
      await sprintsService.startSprint(projectId, sprintId);
      onToast?.('Sprint started successfully');
      loadData();
    } catch (err) {
      console.error('Failed to start sprint:', err);
      onToast?.(err?.response?.data?.error || err.message || 'Failed to start sprint');
    } finally {
      setStartingSprint(false);
    }
  };

  // Complete Sprint Handler
  const handleConfirmCompleteSprint = async (optionsOrTarget) => {
    if (!currentSprint) return;
    try {
      const payload = typeof optionsOrTarget === 'object' && optionsOrTarget !== null
        ? optionsOrTarget
        : { target_sprint_id: optionsOrTarget };
      await sprintsService.completeSprint(projectId, currentSprint.id, payload);
      onToast?.(payload.unfinished_action === 'CONTINUE' ? `Sprint "${currentSprint.name}" continued` : `Sprint "${currentSprint.name}" completed successfully`);
      loadData();
    } catch (err) {
      console.error('Failed to complete sprint:', err);
      onToast?.(err.message || 'Failed to complete sprint');
    }
  };

  // Add Task Handlers
  const handleOpenAddTask = (columnId) => {
    setAddTaskColumnId(columnId || 'TODO');
    setIsAddTaskOpen(true);
  };

  const handleTaskCreated = (newTask) => {
    setWorkItems((prev) => [newTask, ...prev]);
    onToast?.(`Created ${newTask.type?.toLowerCase() || 'task'} "${newTask.title}"`);
  };

  // Task Details handlers
  const handleTaskUpdated = (updatedTask) => {
    setWorkItems((prev) =>
      prev.map((t) => (t.id === updatedTask.id ? updatedTask : t))
    );
    setSelectedTask(updatedTask);
  };

  const handleTaskDeleted = (taskId) => {
    setWorkItems((prev) => prev.filter((t) => t.id !== taskId));
    setSelectedTask(null);
  };

  // Columns definition
  const columns = [
    { id: 'TODO', title: 'To Do', dotColor: 'bg-slate-400' },
    { id: 'IN_PROGRESS', title: 'In Progress', dotColor: 'bg-purple-600' },
    { id: 'IN_REVIEW', title: 'In Review', dotColor: 'bg-amber-500' },
    { id: 'BLOCKED', title: 'Blocked', dotColor: 'bg-rose-600' },
    { id: 'COMPLETED', title: 'Completed', dotColor: 'bg-emerald-600' },
  ];

  if (loading && sprints.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-12 flex flex-col items-center justify-center min-h-[360px]">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-3" />
        <p className="text-xs font-semibold text-slate-700">Loading Sprint Workspace...</p>
        <p className="text-[11px] text-slate-400 mt-1">Retrieving sprint commitments and status</p>
      </div>
    );
  }

  // If no sprints exist in the project
  if (sprints.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center max-w-lg mx-auto my-6 shadow-2xs">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-3">
            <Calendar className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">No Sprints Configured</h3>
          <p className="text-xs text-slate-500 leading-relaxed max-w-md mx-auto mb-5">
            This project does not have any sprints created yet. Plan your first sprint to start tracking iterations and burndown.
          </p>
          {!readOnly && (
            <button
              onClick={() => setIsCreateSprintOpen(true)}
              className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Sprint</span>
            </button>
          )}
        </div>

        <CreateSprintModal
          isOpen={isCreateSprintOpen}
          onClose={() => setIsCreateSprintOpen(false)}
          projectId={projectId}
          existingSprints={sprints}
          onSuccess={() => {
            onToast?.('Sprint created successfully');
            loadData();
          }}
        />
      </div>
    );
  }

  const startDateFormatted = currentSprint?.start_date
    ? new Date(currentSprint.start_date).toLocaleDateString([], { month: 'short', day: 'numeric' })
    : 'Not set';
  const endDateFormatted = currentSprint?.end_date
    ? new Date(currentSprint.end_date).toLocaleDateString([], { month: 'short', day: 'numeric' })
    : 'Not set';

  return (
    <div className="space-y-6">

      {/* SPRINT WORKSPACE HEADER & SUMMARY */}
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          {/* Sprint Details & Goal */}
          <div className="space-y-2 max-w-3xl">
            {/* Sprint Selector & Status */}
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  currentSprint?.status === 'ACTIVE'
                    ? 'bg-purple-100 text-purple-700'
                    : currentSprint?.status === 'COMPLETED'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {currentSprint?.status === 'ACTIVE'
                  ? 'Active Sprint'
                  : currentSprint?.status === 'COMPLETED'
                  ? 'Completed Sprint'
                  : 'Planned Sprint'}
              </span>
              <span className="text-slate-300">•</span>

              {/* Sprint Dropdown Selector */}
              <div className="relative inline-block">
                <select
                  value={currentSprint?.id}
                  onChange={(e) => setSelectedSprintId(e.target.value)}
                  className="text-xs font-bold text-slate-900 bg-transparent pr-5 py-0.5 border-b border-slate-200 hover:border-purple-600 focus:outline-none cursor-pointer"
                >
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.status})
                    </option>
                  ))}
                </select>
              </div>

              <span className="text-slate-300">•</span>
              <span className="text-xs text-slate-500 font-medium">
                {startDateFormatted} – {endDateFormatted}
              </span>
            </div>

            <div>
              <span className="text-xs font-semibold text-slate-700">Goal: </span>
              <span className="text-xs text-slate-600 leading-relaxed">
                {currentSprint?.goal || 'No specific goal set for this sprint.'}
              </span>
            </div>

            {/* Inline Metrics Strip */}
            <div className="pt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 font-medium border-t border-slate-100 mt-3">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-900">{totalCount}</span>
                <span className="text-slate-500">committed</span>
              </div>
              <span className="text-slate-300">•</span>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-emerald-700">{completedCount}</span>
                <span className="text-slate-500">completed</span>
              </div>
              <span className="text-slate-300">•</span>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-rose-700">{overdueCount}</span>
                <span className="text-slate-500">overdue</span>
              </div>
              <span className="text-slate-300">•</span>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-900">{completedCount} / {totalCount}</span>
                <span className="text-slate-500">tasks</span>
              </div>
              <span className="text-slate-300">•</span>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-900">{hoursLoggedFormatted}</span>
                <span className="text-slate-500">logged</span>
              </div>
              {totalStoryPoints > 0 && (
                <>
                  <span className="text-slate-300">•</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-purple-700">{completedStoryPoints} / {totalStoryPoints}</span>
                    <span className="text-slate-500">pts</span>
                  </div>
                </>
              )}
              <span className="text-slate-300">•</span>
              <div className="flex items-center gap-1.5 text-rose-700">
                <AlertCircle className="w-3.5 h-3.5" />
                <span className="font-bold">{blockedCount}</span>
                <span>blocked</span>
              </div>
            </div>
          </div>

          {/* Action CTAs (Hidden for readOnly) */}
          {!readOnly && (
            <div className="flex items-center gap-2 self-start shrink-0">
              {currentSprint?.status === 'PLANNED' && (
                <button
                  onClick={() => handleStartSprint(currentSprint.id)}
                  disabled={startingSprint}
                  className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Start Sprint</span>
                </button>
              )}

              {currentSprint?.status === 'ACTIVE' && (
                <button
                  onClick={() => setIsCompleteSprintOpen(true)}
                  className="px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5 text-slate-500" />
                  <span>Complete Sprint</span>
                </button>
              )}

              {currentSprint && (
                <button
                  onClick={() => setEditingSprint(currentSprint)}
                  className="px-2.5 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Edit or delete current sprint"
                >
                  <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Edit Sprint</span>
                </button>
              )}

              <button
                onClick={() => setIsCreateSprintOpen(true)}
                className="px-2.5 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Plan next sprint"
              >
                <Plus className="w-3.5 h-3.5 text-slate-500" />
                <span>New Sprint</span>
              </button>
            </div>
          )}
        </div>

        {/* SPRINT BURNDOWN & HEALTH INLINE SECTIONS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-5 mt-5 border-t border-slate-200">
          {/* Burndown Chart (8 cols) */}
          <div className="lg:col-span-8 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Sprint Burndown
              </span>
              <span className="text-xs font-mono text-slate-500">
                {incompleteCount} remaining / {totalCount} total tasks
              </span>
            </div>

            <div className="h-28 w-full bg-slate-50/50 rounded-md border border-slate-200 p-3 flex flex-col justify-between">
              <svg viewBox="0 0 400 80" className="w-full h-20 overflow-visible">
                {/* Guidelines */}
                <line x1="10" y1="15" x2="390" y2="70" stroke="#CBD5E1" strokeDasharray="3 3" strokeWidth="1" />
                {/* Actual Line */}
                <polyline
                  fill="none"
                  stroke="#7C3AED"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={`10,15 130,${Math.max(15, 70 - Math.round(progressPct * 0.55))} 260,${Math.max(15, 70 - Math.round(progressPct * 0.55))} 390,${Math.max(15, 70 - Math.round(progressPct * 0.55))}`}
                />
                {/* Points */}
                <circle cx="10" cy="15" r="3" fill="#7C3AED" stroke="#FFFFFF" strokeWidth="1" />
                <circle cx="390" cy={Math.max(15, 70 - Math.round(progressPct * 0.55))} r="3" fill="#7C3AED" stroke="#FFFFFF" strokeWidth="1" />
              </svg>
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>{startDateFormatted} (Kickoff)</span>
                <span>Pace: {progressPct}% done</span>
                <span>{endDateFormatted} (Target)</span>
              </div>
            </div>
          </div>

          {/* Project Health (4 cols) */}
          <div className="lg:col-span-4 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Sprint Health
            </div>

            <div className="rounded-md border border-slate-200 p-3 space-y-2.5 bg-slate-50/50 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  Active Contributors:
                </span>
                <span className="font-semibold text-slate-900">
                  {contributors.length} {contributors.length === 1 ? 'Member' : 'Members'}
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200/60 pt-2">
                <span className="text-slate-600 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                  Blocked Tasks:
                </span>
                <span className={`font-semibold ${blockedCount > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                  {blockedCount} Blocked
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200/60 pt-2">
                <span className="text-slate-600">Completion Pace:</span>
                <span
                  className={`font-semibold ${
                    progressPct >= 70
                      ? 'text-emerald-700'
                      : progressPct >= 40
                      ? 'text-amber-700'
                      : 'text-slate-700'
                  }`}
                >
                  {progressPct}% ({progressPct >= 70 ? 'On Track' : 'In Progress'})
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SPRINT PERFORMANCE & SCHEDULE SUMMARY TABLE */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 bg-slate-50/80 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-600 shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Sprint Schedule & Completion Summary
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200/80">
              {sprints.length} {sprints.length === 1 ? 'Sprint' : 'Sprints'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 text-[11px] hidden sm:inline">
              Track schedule adherence and whether sprints ended early, on-time, or late
            </span>
            <button
              type="button"
              onClick={() => setShowSummaryTable(!showSummaryTable)}
              className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-purple-700 hover:bg-white rounded-md border border-slate-200/80 transition-colors flex items-center gap-1 cursor-pointer ml-auto"
            >
              <span>{showSummaryTable ? 'Hide Table' : 'Show Table'}</span>
              {showSummaryTable ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {showSummaryTable && (
          <div className="overflow-x-auto min-w-0 max-w-full">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50/60 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3.5">Sprint</th>
                  <th className="py-2.5 px-3.5">Status</th>
                  <th className="py-2.5 px-3.5">Planned Schedule</th>
                  <th className="py-2.5 px-3.5">Actual End / Updated</th>
                  <th className="py-2.5 px-3.5">Schedule Variance</th>
                  <th className="py-2.5 px-3.5">Scope & Points</th>
                  <th className="py-2.5 px-3.5">Completion Rate</th>
                  {!readOnly && <th className="py-2.5 px-3.5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sprints.map((s) => {
                  const isCurrent = s.id === currentSprint?.id;
                  const sStoryIds = new Set(
                    workItems.filter((w) => w.sprint_id === s.id && w.type === 'STORY').map((w) => w.id)
                  );
                  const sprintWorkItems = workItems.filter(
                    (w) =>
                      w.type !== 'EPIC' &&
                      (w.sprint_id === s.id || (w.parent_id && sStoryIds.has(w.parent_id)))
                  );
                  const sParentIds = new Set(sprintWorkItems.map((w) => w.parent_id).filter(Boolean));
                  const sLeaves = sprintWorkItems.filter((w) => !sParentIds.has(w.id));
                  const sTotalItems = s.total_items ?? sLeaves.length;
                  const sCompletedItems = s.completed_items ?? sLeaves.filter((w) => w.status === 'COMPLETED').length;
                  const sTotalPoints = s.total_points ?? sLeaves.reduce((acc, w) => acc + (Number(w.story_points) || 0), 0);
                  const sCompletedPoints = s.completed_points ?? sLeaves.filter((w) => w.status === 'COMPLETED').reduce((acc, w) => acc + (Number(w.story_points) || 0), 0);
                  const sCompletionRate = sTotalItems > 0 ? Math.round((sCompletedItems / sTotalItems) * 100) : (s.completion_percentage ?? 0);

                  const startDate = s.start_date ? new Date(s.start_date) : null;
                  const endDate = s.end_date ? new Date(s.end_date) : null;
                  const updatedAt = s.updated_at ? new Date(s.updated_at) : null;

                  const startFormatted = startDate
                    ? startDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'Not set';
                  const endFormatted = endDate
                    ? endDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'Not set';

                  // Calculate schedule status and variance
                  let varianceBadge = null;
                  let actualEndDisplay = '-';

                  if (s.status === 'COMPLETED') {
                    const finishDate = updatedAt || endDate;
                    actualEndDisplay = finishDate
                      ? finishDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
                      : '-';

                    if (endDate && finishDate) {
                      const diffTime = finishDate.getTime() - endDate.getTime();
                      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

                      if (diffDays < -1) {
                        varianceBadge = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <TrendingUp className="w-3 h-3 text-emerald-600" />
                            <span>Ended Early ({Math.abs(diffDays)}d early)</span>
                          </span>
                        );
                      } else if (diffDays > 1) {
                        varianceBadge = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <TrendingDown className="w-3 h-3 text-rose-600" />
                            <span>Ended Late (+{diffDays}d delay)</span>
                          </span>
                        );
                      } else {
                        varianceBadge = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <Check className="w-3 h-3 text-blue-600" />
                            <span>On Time</span>
                          </span>
                        );
                      }
                    } else {
                      varianceBadge = (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          <Check className="w-3 h-3" />
                          <span>Completed</span>
                        </span>
                      );
                    }
                  } else if (s.status === 'ACTIVE') {
                    if (endDate) {
                      const now = new Date();
                      const diffTime = now.getTime() - endDate.getTime();
                      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

                      if (diffDays > 0) {
                        varianceBadge = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            <span>Overdue (+{diffDays}d past target)</span>
                          </span>
                        );
                      } else {
                        const daysRemaining = Math.max(0, Math.abs(diffDays));
                        varianceBadge = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            <Clock className="w-3 h-3 text-purple-600" />
                            <span>In Progress ({daysRemaining}d left)</span>
                          </span>
                        );
                      }
                    } else {
                      varianceBadge = (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                          <Clock className="w-3 h-3" />
                          <span>Active</span>
                        </span>
                      );
                    }
                  } else {
                    varianceBadge = (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        <Hourglass className="w-3 h-3 text-slate-400" />
                        <span>Planned (Not Started)</span>
                      </span>
                    );
                  }

                  return (
                    <tr
                      key={s.id}
                      onClick={() => setSelectedSprintId(s.id)}
                      className={`transition-colors cursor-pointer ${
                        isCurrent
                          ? 'bg-purple-50/60 font-medium'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {/* Sprint Name */}
                      <td className="py-3 px-3.5">
                        <div className="flex items-center gap-2">
                          {isCurrent && (
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-600 shrink-0" />
                          )}
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{s.name}</span>
                              {isCurrent && (
                                <span className="text-[10px] font-semibold text-purple-600 bg-purple-100 px-1.5 py-0.2 rounded">
                                  Current
                                </span>
                              )}
                            </div>
                            {s.goal && (
                              <div className="text-[11px] text-slate-400 max-w-xs truncate mt-0.5">
                                {s.goal}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            s.status === 'ACTIVE'
                              ? 'bg-purple-100 text-purple-700 border border-purple-200'
                              : s.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>

                      {/* Planned Schedule */}
                      <td className="py-3 px-3.5 text-slate-600">
                        <div className="flex items-center gap-1 text-[11px]">
                          <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{startFormatted} &ndash; {endFormatted}</span>
                        </div>
                      </td>

                      {/* Actual End / Completed */}
                      <td className="py-3 px-3.5 text-slate-700 text-[11px] font-medium">
                        {actualEndDisplay}
                      </td>

                      {/* Schedule Variance Badge (Ended Early / Late / On Time) */}
                      <td className="py-3 px-3.5">
                        {varianceBadge}
                      </td>

                      {/* Scope & Points */}
                      <td className="py-3 px-3.5 text-[11px] text-slate-700">
                        <div>
                          <span className="font-semibold text-slate-900">{sCompletedItems}</span>
                          <span className="text-slate-400">/{sTotalItems} tasks</span>
                        </div>
                        {sTotalPoints > 0 && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {sCompletedPoints}/{sTotalPoints} SP
                          </div>
                        )}
                      </td>

                      {/* Progress Bar & Rate */}
                      <td className="py-3 px-3.5">
                        <div className="w-28 space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-700">
                            <span>{sCompletionRate}%</span>
                            <span className="text-slate-400">done</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                sCompletionRate === 100
                                  ? 'bg-emerald-600'
                                  : sCompletionRate >= 50
                                  ? 'bg-purple-600'
                                  : 'bg-amber-500'
                              }`}
                              style={{ width: `${sCompletionRate}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Action buttons (Hidden for readOnly) */}
                      {!readOnly && (
                        <td className="py-3 px-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setEditingSprint(s)}
                              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                              title="Edit or Delete Sprint"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* TASK STATUS OVERVIEW (5 COLUMNS) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Task Status
            </h3>
            <span className="text-xs text-slate-400">· 5 columns</span>
          </div>

          {/* Quick Filters */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium">Filter:</span>
            <button 
              onClick={() => setQuickFilter(quickFilter === 'all' ? 'my-tasks' : 'all')}
              className={`px-2 py-0.5 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                quickFilter === 'my-tasks'
                  ? 'bg-purple-50 border-purple-300 text-purple-700 font-semibold'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              My Tasks
            </button>
            <button 
              onClick={() => setQuickFilter(quickFilter === 'overdue' ? 'all' : 'overdue')}
              className={`px-2 py-0.5 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                quickFilter === 'overdue'
                  ? 'bg-rose-50 border-rose-300 text-rose-700 font-semibold'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Overdue
            </button>
            <button 
              onClick={() => setQuickFilter(quickFilter === 'blocked' ? 'all' : 'blocked')}
              className={`px-2 py-0.5 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                quickFilter === 'blocked'
                  ? 'bg-rose-50 border-rose-300 text-rose-700 font-semibold'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Blocked
            </button>
          </div>
        </div>

        {/* 5 Columns */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-start">
          {columns.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.status === col.id);
            return (
              <div
                key={col.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverColId !== col.id) setDragOverColId(col.id);
                }}
                onDragLeave={(e) => {
                  if (dragOverColId === col.id) setDragOverColId(null);
                }}
                onDrop={(e) => handleDropTask(e, col.id)}
                className={`rounded-lg p-2.5 border flex flex-col min-h-[380px] transition-colors ${
                  dragOverColId === col.id
                    ? 'bg-purple-50/50 border-purple-400 border-dashed'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${col.dotColor}`} />
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-tight">
                      {col.title}
                    </h4>
                    <span className="text-[10px] font-semibold text-slate-500 px-1 py-0.2 rounded bg-white border border-slate-200">
                      {colTasks.length}
                    </span>
                  </div>
                  {!readOnly && (
                    <button
                      onClick={() => handleOpenAddTask(col.id)}
                      title={`Add task to ${col.title}`}
                      className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-white transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Compact Task Cards */}
                <div className="space-y-2 flex-1">
                  {colTasks.map((card) => {
                    const isCardOverdue =
                      card.due_date &&
                      new Date(card.due_date) < new Date() &&
                      card.status !== 'COMPLETED';
                    const dueDateStr = card.due_date
                      ? new Date(card.due_date).toLocaleDateString([], { month: 'short', day: 'numeric' })
                      : 'No date';
                    const cardAssignees = card.assignees || [];

                    return (
                      <div
                        key={card.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, card.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => setSelectedTask(card)}
                        className={`p-2.5 rounded-md border bg-white transition-all cursor-grab active:cursor-grabbing hover:shadow-xs ${
                          draggedTaskId === card.id ? 'opacity-40 border-purple-400' : ''
                        } ${
                          isCardOverdue
                            ? 'border-rose-300 bg-rose-50/20'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              {card.priority}
                            </span>
                            {card.story_points > 0 && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                {card.story_points} pts
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-slate-400">{card.id}</span>
                        </div>

                        <h5 className="text-xs font-semibold text-slate-800 leading-snug line-clamp-2">
                          {card.title}
                        </h5>

                        {(() => {
                          const epicTitle = card.parent?.title || workItems.find((w) => w.id === card.parent_id)?.title;
                          if (!epicTitle) return null;
                          return (
                            <div className="flex items-center gap-1 text-[10px] font-semibold text-purple-700 bg-purple-50/80 border border-purple-200/60 rounded px-1.5 py-0.5 mt-1 max-w-full truncate">
                              <Zap className="w-2.5 h-2.5 shrink-0 fill-purple-600 text-purple-600" />
                              <span className="truncate">{epicTitle}</span>
                            </div>
                          );
                        })()}

                        {/* Card Footer: Due & Assignee */}
                        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1 text-slate-500">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span
                              className={`text-[10px] font-medium ${
                                isCardOverdue ? 'text-rose-600 font-semibold' : 'text-slate-500'
                              }`}
                            >
                              {isCardOverdue ? 'Overdue' : dueDateStr}
                            </span>
                          </div>

                          {cardAssignees.length > 0 ? (
                            <div className="flex items-center -space-x-1">
                              {cardAssignees.slice(0, 2).map((a, idx) => (
                                <div
                                  key={a.id || a.user_id || idx}
                                  title={a.name || a.email}
                                  className="w-4 h-4 rounded-full bg-purple-100 text-purple-700 border border-white flex items-center justify-center text-[9px] font-bold"
                                >
                                  {(a.name || a.email || '?')[0].toUpperCase()}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-[9px] font-bold">
                              ?
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {colTasks.length === 0 && (
                    <div className="h-24 rounded border border-dashed border-slate-200 flex flex-col items-center justify-center text-center p-2">
                      <span className="text-xs text-slate-400">No tasks</span>
                      <button
                        onClick={() => handleOpenAddTask(col.id)}
                        className="mt-1 text-[11px] font-medium text-purple-700 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modals */}
      <AddTaskModal
        isOpen={isAddTaskOpen}
        onClose={() => setIsAddTaskOpen(false)}
        projectId={projectId}
        initialStatus={addTaskColumnId}
        initialSprintId={currentSprint?.id || null}
        sprints={sprints}
        onTaskCreated={handleTaskCreated}
        onToast={onToast}
      />

      <TaskDetailModal
        task={selectedTask}
        isOpen={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
        onTaskUpdated={handleTaskUpdated}
        onTaskDeleted={handleTaskDeleted}
        onToast={onToast}
      />

      <LogWorkModal
        isOpen={isLogWorkOpen}
        onClose={() => setIsLogWorkOpen(false)}
        tasks={sprintTasks}
        onSaveLog={handleSaveLog}
      />

      <CompleteSprintModal
        isOpen={isCompleteSprintOpen}
        onClose={() => setIsCompleteSprintOpen(false)}
        sprint={currentSprint}
        upcomingSprints={upcomingSprints}
        completedCount={completedCount}
        incompleteCount={incompleteCount}
        tasks={workItems.filter((w) => w.sprint_id === currentSprint?.id)}
        isKanban={false}
        onConfirmComplete={handleConfirmCompleteSprint}
      />

      <CreateSprintModal
        isOpen={isCreateSprintOpen}
        onClose={() => setIsCreateSprintOpen(false)}
        projectId={projectId}
        existingSprints={sprints}
        isKanban={false}
        onSuccess={() => {
          onToast?.('Sprint created successfully');
          loadData();
        }}
      />

      <EditSprintModal
        isOpen={Boolean(editingSprint)}
        onClose={() => setEditingSprint(null)}
        projectId={projectId}
        sprint={editingSprint}
        allSprints={sprints}
        isKanban={false}
        onSuccess={(updated) => {
          onToast?.(`Sprint "${updated?.name || 'Sprint'}" updated successfully`);
          loadData();
        }}
        onDelete={(deleted) => {
          onToast?.(`Sprint "${deleted?.name || 'Sprint'}" deleted successfully`);
          setSelectedSprintId(null);
          loadData();
        }}
      />
    </div>
  );
}
