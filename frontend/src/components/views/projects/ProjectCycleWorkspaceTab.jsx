import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Plus, 
  Calendar, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  Check, 
  Play, 
  Layers, 
  Users, 
  AlertTriangle, 
  Loader2, 
  Edit3, 
  ArrowRight, 
  Trash2, 
  ChevronDown, 
  TrendingUp, 
  X,
  Target,
  Sparkles,
  Inbox,
  ArrowUpRight
} from 'lucide-react';
import { sprintsService } from '../../../services/sprints.service';
import { workItemsService } from '../../../services/workItems.service';
import { projectsService } from '../../../services/projects.service';
import { useAuth } from '../../../context/AuthContext';
import TaskDetailModal from '../../kanban/TaskDetailModal';
import AddTaskModal from '../../kanban/AddTaskModal';

export default function ProjectCycleWorkspaceTab({
  projectId,
  selectedCycleId: propSelectedCycleId,
  onToast,
  readOnly = false,
}) {
  const { user: authUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [cycles, setCycles] = useState([]);
  const [workItems, setWorkItems] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedCycleId, setSelectedCycleId] = useState(propSelectedCycleId || null);

  // Modals & form state
  const [isCreateCycleOpen, setIsCreateCycleOpen] = useState(false);
  const [isEditCycleOpen, setIsEditCycleOpen] = useState(false);
  const [isCloseCycleOpen, setIsCloseCycleOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [cycleFormName, setCycleFormName] = useState('');
  const [cycleFormGoal, setCycleFormGoal] = useState('');
  const [cycleFormStartDate, setCycleFormStartDate] = useState('');
  const [cycleFormEndDate, setCycleFormEndDate] = useState('');
  const [cycleFormSubmitting, setCycleFormSubmitting] = useState(false);
  const [cycleFormError, setCycleFormError] = useState('');

  // Close cycle modal state
  const [closeAction, setCloseAction] = useState('KEEP_IN_CYCLE'); // 'KEEP_IN_CYCLE' | 'MOVE_TO_BACKLOG'

  const hasLoadedRef = React.useRef(false);

  const loadData = useCallback(async (silent = false) => {
    if (!projectId) return;
    try {
      if (!silent && !hasLoadedRef.current) {
        setLoading(true);
      }
      const [cyclesList, itemsList, membersList] = await Promise.all([
        sprintsService.getSprints(projectId).catch(() => []),
        workItemsService.listWorkItems({ project_id: projectId }).catch(() => []),
        projectsService.getMembers(projectId).catch(() => []),
      ]);

      const sortedCycles = (cyclesList || []).sort((a, b) => {
        const order = { ACTIVE: 1, PLANNED: 2, COMPLETED: 3, CANCELLED: 4 };
        return (order[a.status] || 5) - (order[b.status] || 5);
      });

      setCycles(sortedCycles);
      setWorkItems(itemsList || []);
      setMembers(membersList || []);
      hasLoadedRef.current = true;

      if (propSelectedCycleId && sortedCycles.some((c) => c.id === propSelectedCycleId)) {
        setSelectedCycleId(propSelectedCycleId);
      } else {
        const active = sortedCycles.find((c) => c.status === 'ACTIVE');
        if (active) {
          setSelectedCycleId((prev) => prev || active.id);
        } else if (sortedCycles.length > 0) {
          setSelectedCycleId((prev) => prev || sortedCycles[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load cycle workspace data:', err);
      onToast?.('Failed to load planning cycles data');
    } finally {
      setLoading(false);
    }
  }, [projectId, propSelectedCycleId, onToast]);

  useEffect(() => {
    void loadData();
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
      void loadData(true);
    };
    window.addEventListener('work-items-updated', handleSync);
    return () => window.removeEventListener('work-items-updated', handleSync);
  }, [loadData]);

  // Current selected cycle
  const currentCycle = useMemo(() => {
    if (!cycles.length) return null;
    return cycles.find((c) => c.id === selectedCycleId) || cycles[0];
  }, [cycles, selectedCycleId]);

  // Deliverables in current cycle (non-epics)
  const cycleWorkItems = useMemo(() => {
    if (!currentCycle) return [];
    return workItems.filter((w) => w.sprint_id === currentCycle.id && w.type !== 'EPIC');
  }, [workItems, currentCycle]);

  // Unassigned work items (continuous flow backlog)
  const unassignedWorkItems = useMemo(() => {
    return workItems.filter((w) => !w.sprint_id && w.type !== 'EPIC');
  }, [workItems]);

  // Cycle Metrics
  const totalCycleItems = cycleWorkItems.length;
  const completedCycleItems = cycleWorkItems.filter((w) => w.status === 'COMPLETED').length;
  const inProgressCycleItems = cycleWorkItems.filter((w) => w.status === 'IN_PROGRESS' || w.status === 'IN_REVIEW').length;
  const todoCycleItems = cycleWorkItems.filter((w) => w.status === 'TODO').length;
  const blockedCycleItems = cycleWorkItems.filter((w) => w.status === 'BLOCKED').length;

  const now = new Date();
  const overdueCycleItems = cycleWorkItems.filter((w) => {
    if (w.status === 'COMPLETED') return false;
    if (w.due_date && new Date(w.due_date) < now) return true;
    if (currentCycle?.end_date && w.due_date && new Date(w.due_date) > new Date(currentCycle.end_date)) return true;
    return false;
  }).length;

  const progressPercentage = totalCycleItems > 0 ? Math.round((completedCycleItems / totalCycleItems) * 100) : 0;
  const totalCyclePoints = cycleWorkItems.reduce((acc, w) => acc + (Number(w.story_points) || 0), 0);
  const completedCyclePoints = cycleWorkItems
    .filter((w) => w.status === 'COMPLETED')
    .reduce((acc, w) => acc + (Number(w.story_points) || 0), 0);

  // Cycle creation / editing handlers
  const handleOpenCreateCycle = () => {
    setCycleFormName('');
    setCycleFormGoal('');
    setCycleFormStartDate(new Date().toISOString().split('T')[0]);
    const targetEnd = new Date();
    targetEnd.setDate(targetEnd.getDate() + 14);
    setCycleFormEndDate(targetEnd.toISOString().split('T')[0]);
    setCycleFormError('');
    setIsCreateCycleOpen(true);
  };

  const handleOpenEditCycle = () => {
    if (!currentCycle) return;
    setCycleFormName(currentCycle.name || '');
    setCycleFormGoal(currentCycle.goal || '');
    setCycleFormStartDate(currentCycle.start_date ? new Date(currentCycle.start_date).toISOString().split('T')[0] : '');
    setCycleFormEndDate(currentCycle.end_date ? new Date(currentCycle.end_date).toISOString().split('T')[0] : '');
    setCycleFormError('');
    setIsEditCycleOpen(true);
  };

  const handleSaveCreateCycle = async (e) => {
    e.preventDefault();
    if (!cycleFormName.trim()) {
      setCycleFormError('Cycle name is required');
      return;
    }
    if (cycleFormStartDate && cycleFormEndDate && new Date(cycleFormStartDate) > new Date(cycleFormEndDate)) {
      setCycleFormError('Cycle start date cannot be later than target end date');
      return;
    }

    try {
      setCycleFormSubmitting(true);
      setCycleFormError('');
      const created = await sprintsService.createSprint(projectId, {
        name: cycleFormName.trim(),
        goal: cycleFormGoal.trim() || null,
        start_date: cycleFormStartDate || null,
        end_date: cycleFormEndDate || null,
        status: 'PLANNED',
      });
      setIsCreateCycleOpen(false);
      setSelectedCycleId(created.id);
      void loadData();
      onToast?.(`Planning cycle "${created.name}" created`);
    } catch (err) {
      console.error('Failed to create cycle:', err);
      setCycleFormError(err?.response?.data?.error || err.message || 'Failed to create planning cycle');
    } finally {
      setCycleFormSubmitting(false);
    }
  };

  const handleSaveEditCycle = async (e) => {
    e.preventDefault();
    if (!currentCycle) return;
    if (!cycleFormName.trim()) {
      setCycleFormError('Cycle name cannot be empty');
      return;
    }
    if (cycleFormStartDate && cycleFormEndDate && new Date(cycleFormStartDate) > new Date(cycleFormEndDate)) {
      setCycleFormError('Cycle start date cannot be later than target end date');
      return;
    }

    try {
      setCycleFormSubmitting(true);
      setCycleFormError('');
      await sprintsService.updateSprint(projectId, currentCycle.id, {
        name: cycleFormName.trim(),
        goal: cycleFormGoal.trim() || null,
        start_date: cycleFormStartDate || null,
        end_date: cycleFormEndDate || null,
      });
      setIsEditCycleOpen(false);
      void loadData();
      onToast?.(`Planning cycle "${cycleFormName.trim()}" updated`);
    } catch (err) {
      console.error('Failed to update cycle:', err);
      setCycleFormError(err?.response?.data?.error || err.message || 'Failed to update planning cycle');
    } finally {
      setCycleFormSubmitting(false);
    }
  };

  const handleActivateCycle = async (cycleId) => {
    try {
      await sprintsService.startSprint(projectId, cycleId);
      void loadData();
      onToast?.('Planning cycle activated');
    } catch (err) {
      console.error('Failed to activate cycle:', err);
      onToast?.(err?.response?.data?.error || err.message || 'Failed to activate cycle');
    }
  };

  const handleCloseCycleConfirm = async () => {
    if (!currentCycle) return;
    try {
      await sprintsService.completeSprint(projectId, currentCycle.id, {
        unfinished_action: closeAction,
      });
      setIsCloseCycleOpen(false);
      void loadData();
      onToast?.(`Planning cycle "${currentCycle.name}" closed`);
    } catch (err) {
      console.error('Failed to close cycle:', err);
      onToast?.(err?.response?.data?.error || err.message || 'Failed to close cycle');
    }
  };

  const handleDeleteCycle = async () => {
    if (!currentCycle) return;
    if (!window.confirm(`Delete planning cycle "${currentCycle.name}"? All assigned items will return to continuous flow unassigned.`)) {
      return;
    }
    try {
      await sprintsService.deleteSprint(projectId, currentCycle.id);
      setSelectedCycleId(null);
      void loadData();
      onToast?.('Planning cycle deleted');
    } catch (err) {
      console.error('Failed to delete cycle:', err);
      onToast?.(err.message || 'Failed to delete cycle');
    }
  };

  // Assign or remove items from cycle
  const handleAssignItemToCycle = async (itemId, targetCycleId) => {
    try {
      await workItemsService.updateWorkItem(itemId, { sprint_id: targetCycleId });
      void loadData();
      onToast?.(targetCycleId ? 'Item assigned to cycle' : 'Item returned to continuous flow');
    } catch (err) {
      console.error('Failed to update item cycle assignment:', err);
      onToast?.('Failed to update item assignment');
    }
  };

  const startDateFormatted = currentCycle?.start_date
    ? new Date(currentCycle.start_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Not scheduled';
  const endDateFormatted = currentCycle?.end_date
    ? new Date(currentCycle.end_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    : 'No target end';

  if (loading && cycles.length === 0 && workItems.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 flex flex-col items-center justify-center min-h-[360px]">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
        <p className="text-xs font-semibold text-slate-700">Loading Planning &amp; Cycles Workspace...</p>
        <p className="text-[11px] text-slate-400 mt-1">Gathering Kanban workflow, prioritization, and cycles</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. KANBAN PLANNING CONTEXT HEADER */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-2 max-w-3xl">
            {/* Tagline & Methodology Notice */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                Kanban Methodology
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs text-slate-500 font-medium">
                Continuous delivery with optional time-based planning cycles
              </span>
            </div>

            {/* Cycle Selector & State */}
            {cycles.length > 0 ? (
              <div className="pt-1 flex flex-wrap items-center gap-2.5">
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                    currentCycle?.status === 'ACTIVE'
                      ? 'bg-indigo-100 text-indigo-800'
                      : currentCycle?.status === 'COMPLETED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {currentCycle?.status === 'ACTIVE'
                    ? 'Active Cycle'
                    : currentCycle?.status === 'COMPLETED'
                    ? 'Closed Cycle'
                    : 'Planned Cycle'}
                </span>
                <span className="text-slate-300">•</span>

                {/* Dropdown Selector */}
                <div className="relative inline-block">
                  <select
                    value={currentCycle?.id}
                    onChange={(e) => setSelectedCycleId(e.target.value)}
                    className="text-sm font-bold text-slate-900 bg-transparent pr-6 py-0.5 border-b border-slate-300 hover:border-indigo-600 focus:outline-none cursor-pointer"
                  >
                    {cycles.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.status})
                      </option>
                    ))}
                  </select>
                </div>

                <span className="text-slate-300">•</span>
                <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {startDateFormatted} – {endDateFormatted}
                </span>
              </div>
            ) : (
              <h2 className="text-base font-bold text-slate-900">
                No Planning Cycles Created Yet
              </h2>
            )}

            {/* Cycle Goal or Continuous Flow guidance */}
            <div className="pt-1">
              <span className="text-xs font-semibold text-slate-700">Theme / Scope: </span>
              <span className="text-xs text-slate-600 leading-relaxed">
                {currentCycle?.goal || 'Work moves continuously through the Kanban board. You can optionally group high-priority deliverables into cycles.'}
              </span>
            </div>

            {/* Quick Metrics Strip */}
            {currentCycle && (
              <div className="pt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 font-medium border-t border-slate-100 mt-3">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-900">{totalCycleItems}</span>
                  <span className="text-slate-500">in cycle</span>
                </div>
                <span className="text-slate-300">•</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-emerald-700">{completedCycleItems}</span>
                  <span className="text-slate-500">completed</span>
                </div>
                <span className="text-slate-300">•</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-indigo-700">{inProgressCycleItems}</span>
                  <span className="text-slate-500">in progress</span>
                </div>
                <span className="text-slate-300">•</span>
                <div className="flex items-center gap-1.5">
                  <span className={`font-bold ${overdueCycleItems > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                    {overdueCycleItems}
                  </span>
                  <span className="text-slate-500">overdue</span>
                </div>
                {totalCyclePoints > 0 && (
                  <>
                    <span className="text-slate-300">•</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-purple-700">{completedCyclePoints} / {totalCyclePoints}</span>
                      <span className="text-slate-500">SP completed</span>
                    </div>
                  </>
                )}
                <span className="text-slate-300">•</span>
                <div className="flex items-center gap-1.5 text-slate-500">
                  <span>Continuous Flow:</span>
                  <strong className="text-slate-800">{unassignedWorkItems.length}</strong>
                  <span>unassigned items</span>
                </div>
              </div>
            )}
          </div>

          {/* Action CTAs */}
          {!readOnly && (
            <div className="flex items-center gap-2 self-start shrink-0 flex-wrap">
              {currentCycle?.status === 'PLANNED' && (
                <button
                  type="button"
                  onClick={() => { void handleActivateCycle(currentCycle.id); }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Activate Cycle</span>
                </button>
              )}

              {currentCycle?.status === 'ACTIVE' && (
                <button
                  type="button"
                  onClick={() => setIsCloseCycleOpen(true)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Check className="w-3.5 h-3.5 text-slate-600" />
                  <span>Close Cycle</span>
                </button>
              )}

              {currentCycle && (
                <button
                  type="button"
                  onClick={handleOpenEditCycle}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
                  title="Edit planning cycle"
                >
                  <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Edit</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleOpenCreateCycle}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Cycle</span>
              </button>
            </div>
          )}
        </div>

        {/* Cycle Progress Bar */}
        {currentCycle && (
          <div className="pt-4 mt-4 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold text-slate-700">
                Cycle Delivery Progress
              </span>
              <span className="font-bold text-indigo-700">
                {progressPercentage}% ({completedCycleItems} of {totalCycleItems} items completed)
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
              <div 
                className="bg-emerald-500 transition-all duration-300" 
                style={{ width: `${progressPercentage}%` }} 
                title={`${completedCycleItems} Completed`}
              />
              <div 
                className="bg-indigo-400 transition-all duration-300" 
                style={{ width: `${totalCycleItems > 0 ? (inProgressCycleItems / totalCycleItems) * 100 : 0}%` }} 
                title={`${inProgressCycleItems} In Progress`}
              />
            </div>
          </div>
        )}
      </div>

      {/* 2. DUAL WORKSPACE: CYCLE SCOPE vs CONTINUOUS FLOW BACKLOG */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: CURRENT CYCLE ITEMS (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="p-3.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  {currentCycle ? `Cycle Deliverables (${currentCycle.name})` : 'Cycle Deliverables'}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                  {cycleWorkItems.length}
                </span>
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setIsAddTaskOpen(true)}
                  className="px-2.5 py-1 rounded text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Issue</span>
                </button>
              )}
            </div>

            {cycleWorkItems.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {cycleWorkItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 hover:bg-slate-50/70 transition-colors flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                        item.status === 'COMPLETED'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : item.status === 'IN_PROGRESS' || item.status === 'IN_REVIEW'
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          : item.status === 'BLOCKED'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        {item.status.replace('_', ' ')}
                      </span>

                      <button
                        type="button"
                        onClick={() => setSelectedTask(item)}
                        className="font-semibold text-slate-800 hover:text-indigo-600 truncate text-left cursor-pointer"
                      >
                        {item.title}
                      </button>

                      {item.story_points ? (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded border border-purple-200 shrink-0">
                          {item.story_points} SP
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.assignees && item.assignees.length > 0 ? (
                        <div className="flex items-center -space-x-1.5" title={item.assignees.map(a => a.name || a.email).join(', ')}>
                          {item.assignees.slice(0, 2).map((a, i) => (
                            <img
                              key={i}
                              src={a.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(a.name || a.email || 'User')}&background=6366F1&color=fff`}
                              alt={a.name || 'Assignee'}
                              className="w-5 h-5 rounded-full border border-white object-cover"
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">Unassigned</span>
                      )}

                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => { void handleAssignItemToCycle(item.id, null); }}
                          className="px-2 py-1 rounded text-[11px] font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Remove from cycle (returns to continuous flow)"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs">
                <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-700">No work items assigned to this cycle</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Click &ldquo;Add to Cycle&rdquo; on any continuous flow task on the right to group it here.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: UNASSIGNED CONTINUOUS FLOW WORK (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="p-3.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Continuous Flow Backlog
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  {unassignedWorkItems.length}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">Unassigned to any cycle</span>
            </div>

            {unassignedWorkItems.length > 0 ? (
              <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                {unassignedWorkItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 hover:bg-slate-50/70 transition-colors flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => setSelectedTask(item)}
                        className="font-semibold text-slate-800 hover:text-indigo-600 truncate block text-left cursor-pointer"
                      >
                        {item.title}
                      </button>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                          item.priority === 'URGENT' || item.priority === 'HIGH'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {item.priority}
                        </span>
                        <span className="text-[10px] text-slate-400">{item.status.replace('_', ' ')}</span>
                      </div>
                    </div>

                    {!readOnly && currentCycle && (
                      <button
                        type="button"
                        onClick={() => { void handleAssignItemToCycle(item.id, currentCycle.id); }}
                        className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                        title={`Assign to ${currentCycle.name}`}
                      >
                        <span>Add</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs">
                <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-700">All deliverables are in cycles or completed</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Items created in backlog will appear here for continuous flow execution.
                </p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 3. MODALS: CREATE CYCLE, EDIT CYCLE, CLOSE CYCLE, TASK DETAILS */}
      {/* CREATE PLANNING CYCLE MODAL */}
      {isCreateCycleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shadow-xs">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 tracking-tight">Create Planning Cycle</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Define a time-based focus cycle for Kanban delivery</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateCycleOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCreateCycle} className="p-5 space-y-4">
              {cycleFormError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{cycleFormError}</span>
                </div>
              )}

              <div>
                <label htmlFor="create-cycle-name" className="block text-xs font-semibold text-slate-700 mb-1">
                  Cycle Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="create-cycle-name"
                  type="text"
                  required
                  value={cycleFormName}
                  onChange={(e) => setCycleFormName(e.target.value)}
                  placeholder="e.g., Cycle 1 - Core Flow, Q4 Delivery Cycle"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div>
                <label htmlFor="create-cycle-goal" className="block text-xs font-semibold text-slate-700 mb-1">
                  Cycle Goal / Scope
                </label>
                <textarea
                  id="create-cycle-goal"
                  rows={2}
                  value={cycleFormGoal}
                  onChange={(e) => setCycleFormGoal(e.target.value)}
                  placeholder="Describe priority objectives, throughput goals, or deliverables..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="create-cycle-start-date" className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
                  <input
                    id="create-cycle-start-date"
                    type="date"
                    value={cycleFormStartDate}
                    onChange={(e) => setCycleFormStartDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>
                <div>
                  <label htmlFor="create-cycle-end-date" className="block text-xs font-semibold text-slate-700 mb-1">Target End Date</label>
                  <input
                    id="create-cycle-end-date"
                    type="date"
                    value={cycleFormEndDate}
                    onChange={(e) => setCycleFormEndDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateCycleOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cycleFormSubmitting}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {cycleFormSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Create Cycle</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PLANNING CYCLE MODAL */}
      {isEditCycleOpen && currentCycle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shadow-xs">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 tracking-tight">Edit Planning Cycle</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Update planning parameters or schedule</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditCycleOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditCycle} className="p-5 space-y-4">
              {cycleFormError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{cycleFormError}</span>
                </div>
              )}

              <div>
                <label htmlFor="edit-cycle-name" className="block text-xs font-semibold text-slate-700 mb-1">
                  Cycle Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="edit-cycle-name"
                  type="text"
                  required
                  value={cycleFormName}
                  onChange={(e) => setCycleFormName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div>
                <label htmlFor="edit-cycle-goal" className="block text-xs font-semibold text-slate-700 mb-1">
                  Cycle Goal / Scope
                </label>
                <textarea
                  id="edit-cycle-goal"
                  rows={2}
                  value={cycleFormGoal}
                  onChange={(e) => setCycleFormGoal(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-cycle-start-date" className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
                  <input
                    id="edit-cycle-start-date"
                    type="date"
                    value={cycleFormStartDate}
                    onChange={(e) => setCycleFormStartDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>
                <div>
                  <label htmlFor="edit-cycle-end-date" className="block text-xs font-semibold text-slate-700 mb-1">Target End Date</label>
                  <input
                    id="edit-cycle-end-date"
                    type="date"
                    value={cycleFormEndDate}
                    onChange={(e) => setCycleFormEndDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditCycleOpen(false);
                    void handleDeleteCycle();
                  }}
                  className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Cycle</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditCycleOpen(false)}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={cycleFormSubmitting}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {cycleFormSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Save Changes</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CLOSE PLANNING CYCLE MODAL */}
      {isCloseCycleOpen && currentCycle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
                  <Check className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 tracking-tight">Close Planning Cycle</h2>
                  <p className="text-xs text-slate-500 mt-0.5">&ldquo;{currentCycle.name}&rdquo;</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCloseCycleOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Completed Deliverables:</span>
                  <span className="font-bold text-emerald-700">{completedCycleItems} items</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Incomplete Deliverables:</span>
                  <span className="font-bold text-amber-700">{totalCycleItems - completedCycleItems} items</span>
                </div>
              </div>

              <div>
                <span className="block text-xs font-semibold text-slate-700 mb-2">
                  Handling Incomplete Deliverables:
                </span>
                <div className="space-y-2 text-xs">
                  <label htmlFor="close-action-keep" aria-label="Keep in Closed Cycle (Recommended)" className="flex items-start gap-2 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      id="close-action-keep"
                      type="radio"
                      name="closeAction"
                      checked={closeAction === 'KEEP_IN_CYCLE'}
                      onChange={() => setCloseAction('KEEP_IN_CYCLE')}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-600"
                    />
                    <div>
                      <span className="font-semibold text-slate-900 block">Keep in Closed Cycle (Recommended)</span>
                      <span className="text-slate-500 text-[11px]">
                        Preserves cycle audit history while items remain active on the Kanban board.
                      </span>
                    </div>
                  </label>

                  <label htmlFor="close-action-move" aria-label="Return to Unassigned Continuous Flow" className="flex items-start gap-2 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      id="close-action-move"
                      type="radio"
                      name="closeAction"
                      checked={closeAction === 'MOVE_TO_BACKLOG'}
                      onChange={() => setCloseAction('MOVE_TO_BACKLOG')}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-600"
                    />
                    <div>
                      <span className="font-semibold text-slate-900 block">Return to Unassigned Continuous Flow</span>
                      <span className="text-slate-500 text-[11px]">
                        Clears cycle assignment so items can be scheduled into future cycles.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCloseCycleOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => { void handleCloseCycleConfirm(); }}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
                >
                  Confirm &amp; Close Cycle
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TASK DETAIL MODAL */}
      {selectedTask && (
        <TaskDetailModal
          isOpen={Boolean(selectedTask)}
          onClose={() => setSelectedTask(null)}
          task={selectedTask}
          projectId={projectId}
          onUpdateTask={(updated) => {
            setWorkItems((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            setSelectedTask(updated);
          }}
          onDeleteTask={(deletedId) => {
            setWorkItems((prev) => prev.filter((t) => t.id !== deletedId));
            setSelectedTask(null);
          }}
          onToast={onToast}
        />
      )}

      {/* ADD TASK MODAL */}
      <AddTaskModal
        isOpen={isAddTaskOpen}
        onClose={() => setIsAddTaskOpen(false)}
        projectId={projectId}
        initialStatus="TODO"
        initialSprintId={currentCycle?.id || null}
        onSave={(newTask) => {
          setWorkItems((prev) => [newTask, ...prev]);
          setIsAddTaskOpen(false);
          onToast?.(`Deliverable "${newTask.title}" added`);
        }}
      />
    </div>
  );
}

