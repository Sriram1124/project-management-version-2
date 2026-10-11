import React, { useState, useEffect, useCallback, useMemo } from 'react';
import FilterBar from './FilterBar';
import KanbanColumn from './KanbanColumn';
import AddTaskModal from './AddTaskModal';
import TaskDetailModal from './TaskDetailModal';
import LogWorkModal from './LogWorkModal';
import CompleteSprintModal from './CompleteSprintModal';
import { Plus, Check, Loader2 } from 'lucide-react';
import { 
  COLUMNS_CONFIG, 
  KANBAN_STATUSES, 
  KANBAN_PRIORITIES 
} from '../../constants/kanban';
import { workItemsService } from '../../services/workItems.service';
import { sprintsService } from '../../services/sprints.service';
import { projectsService } from '../../services/projects.service';
import { timesheetService } from '../../services/timesheet.service';
import { useAuth } from '../../context/AuthContext';

export default function KanbanBoard({ projectId, onToast }) {
  const { user: authUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [workItems, setWorkItems] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [members, setMembers] = useState([]);
  const [draggedTaskId, setDraggedTaskId] = useState(null);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSprint, setSelectedSprint] = useState('All Sprints');
  const [selectedAssignee, setSelectedAssignee] = useState(null);
  const [selectedPriority, setSelectedPriority] = useState(null);
  const [selectedEpic, setSelectedEpic] = useState(null);
  const [quickFilterMyTasks, setQuickFilterMyTasks] = useState(false);
  const [quickFilterOverdue, setQuickFilterOverdue] = useState(false);
  const [quickFilterBlocked, setQuickFilterBlocked] = useState(false);

  // Modal States
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [addTaskColumnId, setAddTaskColumnId] = useState(KANBAN_STATUSES.TODO);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isLogWorkOpen, setIsLogWorkOpen] = useState(false);
  const [isCompleteSprintOpen, setIsCompleteSprintOpen] = useState(false);

  // Load project data
  const loadProjectData = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const [sprintsList, itemsList, membersList] = await Promise.all([
        sprintsService.getSprints(projectId).catch(() => []),
        workItemsService.listWorkItems({ project_id: projectId }).catch(() => []),
        projectsService.getMembers(projectId).catch(() => []),
      ]);
      setSprints(sprintsList || []);
      setWorkItems(itemsList || []);
      setMembers(membersList || []);

      // Default selected sprint to ACTIVE sprint if exists
      const active = (sprintsList || []).find((s) => s.status === 'ACTIVE');
      if (active) {
        setSelectedSprint(active.name);
      } else {
        setSelectedSprint('All Sprints');
      }
    } catch (err) {
      console.error('Failed to load kanban data:', err);
      onToast?.('Failed to load project board data');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadProjectData();
  }, [loadProjectData]);

  // Active sprint
  const activeSprint = useMemo(() => {
    return sprints.find((s) => s.status === 'ACTIVE') || null;
  }, [sprints]);

  const upcomingSprints = useMemo(() => {
    return sprints.filter((s) => s.status === 'PLANNED');
  }, [sprints]);

  // Epics list for filtering
  const epics = useMemo(() => {
    return workItems
      .filter((w) => w.type === 'EPIC')
      .map((e) => ({ id: e.id, name: e.title }));
  }, [workItems]);

  // Drag and drop handlers
  const handleDragStart = (e, taskId) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData('text/plain', taskId);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
  };

  const handleDropTask = async (taskId, targetColumnId) => {
    const task = workItems.find((t) => t.id === taskId);
    if (!task || task.status === targetColumnId) return;

    const prevStatus = task.status;
    const targetCol = COLUMNS_CONFIG.find((c) => c.id === targetColumnId);

    // Optimistic UI update
    setWorkItems((prev) =>
      prev.map((t) => {
        if (t.id === taskId) {
          return {
            ...t,
            status: targetColumnId,
          };
        }
        return t;
      })
    );

    try {
      await workItemsService.updateWorkItem(taskId, { status: targetColumnId });
      onToast?.(`Moved ${task.title || taskId} to ${targetCol?.title || targetColumnId}`);
    } catch (err) {
      console.error('Failed to update work item status:', err);
      // Rollback
      setWorkItems((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: prevStatus } : t))
      );
      onToast?.(`Failed to move task: ${err.message || 'Error'}`);
    }
  };

  // Add Task
  const handleOpenAddTask = (columnId) => {
    setAddTaskColumnId(columnId || KANBAN_STATUSES.TODO);
    setIsAddTaskOpen(true);
  };

  const handleSaveTask = (newTask) => {
    setWorkItems((prev) => [newTask, ...prev]);
    onToast?.(`Created task ${newTask.id}: ${newTask.title}`);
  };

  // Task Details / Update / Delete
  const handleTaskClick = (task) => {
    setSelectedTask(task);
  };

  const handleUpdateTask = (updatedTask) => {
    setWorkItems((prev) =>
      prev.map((t) => (t.id === updatedTask.id ? updatedTask : t))
    );
    setSelectedTask(updatedTask);
  };

  const handleDeleteTask = (taskId) => {
    setWorkItems((prev) => prev.filter((t) => t.id !== taskId));
    setSelectedTask(null);
  };

  // Real Log Work
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
      loadProjectData();
    } catch (err) {
      console.error('Failed to log work:', err);
      onToast?.(err.message || 'Failed to log work');
    }
  };

  // Complete Sprint
  const handleConfirmCompleteSprint = async (targetSprintId) => {
    if (!activeSprint) return;
    try {
      await sprintsService.completeSprint(projectId, activeSprint.id, {
        target_sprint_id: targetSprintId,
      });
      onToast?.(`Sprint "${activeSprint.name}" completed successfully`);
      loadProjectData();
    } catch (err) {
      console.error('Failed to complete sprint:', err);
      onToast?.(`Failed to complete sprint: ${err.message || 'Error'}`);
    }
  };

  // Clear all filters
  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedAssignee(null);
    setSelectedPriority(null);
    setSelectedEpic(null);
    setQuickFilterMyTasks(false);
    setQuickFilterOverdue(false);
    setQuickFilterBlocked(false);
  };

  // Filter Tasks (Kanban displays non-epic items: stories, tasks, bugs, subtasks)
  const nonEpicItems = useMemo(() => {
    return workItems.filter((w) => w.type !== 'EPIC');
  }, [workItems]);

  const filteredTasks = useMemo(() => {
    return nonEpicItems.filter((task) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchId = task.id?.toLowerCase().includes(q);
        const matchTitle = task.title?.toLowerCase().includes(q);
        const matchDesc = task.description?.toLowerCase().includes(q);
        const matchEpic = task.parent?.title?.toLowerCase().includes(q);
        const matchAssignee = task.assignees?.some((a) =>
          (a.name || a.email || '').toLowerCase().includes(q)
        );
        if (!matchId && !matchTitle && !matchDesc && !matchEpic && !matchAssignee) {
          return false;
        }
      }

      if (selectedAssignee) {
        const targetAssigneeId = selectedAssignee.user_id || selectedAssignee.id;
        if (!targetAssigneeId) return false;
        const hasAssignee = Boolean(
          task.assignees?.some((a) => {
            const aId = a.user_id || a.id;
            return Boolean(aId) && aId === targetAssigneeId;
          })
        );
        if (!hasAssignee) return false;
      }

      if (selectedPriority && selectedPriority !== 'All Priorities') {
        if (task.priority !== selectedPriority.toUpperCase()) {
          return false;
        }
      }

      if (selectedEpic && selectedEpic !== 'All Epics') {
        const epicId = typeof selectedEpic === 'object' ? selectedEpic.id : selectedEpic;
        if (task.parent_id !== epicId && task.parent?.title !== selectedEpic) {
          return false;
        }
      }

      // Sprint filter
      if (selectedSprint && selectedSprint !== 'All Sprints') {
        if (selectedSprint === 'Backlog Only') {
          if (task.sprint_id !== null) return false;
        } else {
          const matchSprint =
            task.sprint?.name === selectedSprint ||
            task.sprint_id === selectedSprint ||
            (activeSprint && activeSprint.name === selectedSprint && task.sprint_id === activeSprint.id);
          if (!matchSprint) return false;
        }
      }

      if (quickFilterMyTasks) {
        const currentUserId = authUser?.id || authUser?.user_id;
        if (!currentUserId) return false;
        const isAssigned = Boolean(
          task.assignees?.some((a) => {
            const aId = a.user_id || a.id;
            return Boolean(aId) && aId === currentUserId;
          })
        );
        if (!isAssigned) return false;
      }

      if (quickFilterOverdue) {
        if (!task.due_date || new Date(task.due_date) >= new Date() || task.status === 'COMPLETED') {
          return false;
        }
      }

      if (quickFilterBlocked && task.status !== 'BLOCKED') {
        return false;
      }

      return true;
    });
  }, [
    nonEpicItems,
    searchQuery,
    selectedAssignee,
    selectedPriority,
    selectedEpic,
    selectedSprint,
    activeSprint,
    quickFilterMyTasks,
    authUser,
    quickFilterOverdue,
    quickFilterBlocked,
  ]);

  const completedTasks = filteredTasks.filter((t) => t.status === 'COMPLETED');
  const completedCount = completedTasks.length;
  const blockedCount = filteredTasks.filter((t) => t.status === 'BLOCKED').length;
  const incompleteCount = filteredTasks.length - completedCount;

  // Real Logged Hours & Story Points derived from filtered tasks
  const totalLoggedMinutes = useMemo(() => {
    return filteredTasks.reduce((acc, t) => acc + (t.logged_minutes || 0), 0);
  }, [filteredTasks]);

  const hoursLoggedFormatted = `${Math.floor(totalLoggedMinutes / 60)}h ${totalLoggedMinutes % 60}m`;

  const totalStoryPoints = useMemo(() => {
    return filteredTasks.reduce((acc, t) => acc + (t.story_points || 0), 0);
  }, [filteredTasks]);

  const completedStoryPoints = useMemo(() => {
    return filteredTasks
      .filter((t) => t.status === 'COMPLETED')
      .reduce((acc, t) => acc + (t.story_points || 0), 0);
  }, [filteredTasks]);

  // Header display details
  const displaySprintHeader = useMemo(() => {
    if (selectedSprint === 'All Sprints') {
      return {
        title: 'All Sprints & Backlog',
        sub: 'Aggregated view of all project work items',
        isActive: false,
      };
    }
    if (selectedSprint === 'Backlog Only') {
      return {
        title: 'Project Backlog',
        sub: 'Unassigned tasks for future sprint planning',
        isActive: false,
      };
    }
    const matched = sprints.find((s) => s.name === selectedSprint || s.id === selectedSprint);
    if (matched) {
      const startStr = matched.start_date
        ? new Date(matched.start_date).toLocaleDateString([], { month: 'short', day: 'numeric' })
        : '';
      const endStr = matched.end_date
        ? new Date(matched.end_date).toLocaleDateString([], { month: 'short', day: 'numeric' })
        : '';
      const dates = startStr && endStr ? `${startStr} – ${endStr}` : '';
      return {
        title: matched.name,
        sub: dates || (matched.goal ? `Goal: ${matched.goal}` : ''),
        isActive: matched.status === 'ACTIVE',
      };
    }
    return {
      title: selectedSprint,
      sub: '',
      isActive: false,
    };
  }, [selectedSprint, sprints]);

  if (loading && workItems.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-12 flex flex-col items-center justify-center min-h-[360px]">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-3" />
        <p className="text-xs font-semibold text-slate-700">Loading Kanban Board...</p>
        <p className="text-[11px] text-slate-400 mt-1">Retrieving sprint and task metrics</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* KANBAN BOARD HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white px-3 py-2 sm:py-2.5 rounded-md border border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Kanban Board
            </h2>
            <span className="text-slate-300">·</span>
            <span
              className={`text-xs font-semibold ${
                displaySprintHeader.isActive ? 'text-purple-700' : 'text-slate-700'
              }`}
            >
              {displaySprintHeader.title}
            </span>
            {displaySprintHeader.sub && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-xs text-slate-500">{displaySprintHeader.sub}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 font-medium">
            <span>{filteredTasks.length} tasks</span>
            <span>•</span>
            <span className="text-emerald-700 font-semibold">{completedCount} completed</span>
            <span>•</span>
            <span className="text-rose-700 font-semibold">{blockedCount} blocked</span>
            {totalStoryPoints > 0 && (
              <>
                <span>•</span>
                <span className="text-purple-700 font-semibold">{completedStoryPoints} / {totalStoryPoints} pts</span>
              </>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {activeSprint && (
            <button
              onClick={() => setIsCompleteSprintOpen(true)}
              className="px-2.5 py-1.5 rounded-md border border-emerald-200 text-xs font-medium text-emerald-800 bg-emerald-50/50 hover:bg-emerald-100 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>Complete Sprint</span>
            </button>
          )}

          <button
            onClick={() => handleOpenAddTask(KANBAN_STATUSES.TODO)}
            className="px-3 py-1.5 rounded-md bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Task</span>
          </button>
        </div>
      </div>

      {/* FILTER BAR */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        members={members}
        epics={epics}
        sprints={sprints}
        selectedAssignee={selectedAssignee}
        onSelectAssignee={setSelectedAssignee}
        selectedPriority={selectedPriority}
        onSelectPriority={setSelectedPriority}
        selectedEpic={selectedEpic}
        onSelectEpic={setSelectedEpic}
        selectedSprint={selectedSprint}
        onSelectSprint={setSelectedSprint}
        quickFilterMyTasks={quickFilterMyTasks}
        onToggleMyTasks={() => setQuickFilterMyTasks(!quickFilterMyTasks)}
        quickFilterOverdue={quickFilterOverdue}
        onToggleOverdue={() => setQuickFilterOverdue(!quickFilterOverdue)}
        quickFilterBlocked={quickFilterBlocked}
        onToggleBlocked={() => setQuickFilterBlocked(!quickFilterBlocked)}
        onClearFilters={handleClearFilters}
      />

      {/* KANBAN BOARD COLUMNS */}
      <div className="overflow-x-auto pb-4 pt-1">
        <div className="flex gap-3 min-w-[1380px]">
          {COLUMNS_CONFIG.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.status === col.id);
            return (
              <KanbanColumn
                key={col.id}
                column={col}
                tasks={colTasks}
                onAddTask={handleOpenAddTask}
                onTaskClick={handleTaskClick}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDropTask={handleDropTask}
              />
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
        initialSprintId={activeSprint?.id || null}
        sprints={sprints}
        onTaskCreated={handleSaveTask}
        onToast={onToast}
      />

      <TaskDetailModal
        task={selectedTask}
        isOpen={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
        onTaskUpdated={handleUpdateTask}
        onTaskDeleted={handleDeleteTask}
        onToast={onToast}
      />

      <LogWorkModal
        isOpen={isLogWorkOpen}
        onClose={() => setIsLogWorkOpen(false)}
        tasks={workItems}
        onSaveLog={handleSaveLog}
      />

      <CompleteSprintModal
        isOpen={isCompleteSprintOpen}
        onClose={() => setIsCompleteSprintOpen(false)}
        sprint={activeSprint}
        upcomingSprints={upcomingSprints}
        completedCount={completedCount}
        incompleteCount={incompleteCount}
        onConfirmComplete={handleConfirmCompleteSprint}
      />
    </div>
  );
}
