import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  CheckSquare, 
  Search, 
  Plus, 
  Clock, 
  AlertCircle, 
  Check, 
  Calendar,
  Layers,
  Users,
  LayoutGrid,
  List,
  GitFork,
  Loader2,
  Filter,
  CheckCircle2,
  X,
  Archive,
  RotateCcw
} from 'lucide-react';
import PersonalKanbanBoard from './PersonalKanbanBoard';
import HierarchyTreeView from './HierarchyTreeView';
import { workItemsService } from '../services/workItemsService';

const STATUS_CONFIG = {
  TODO: { label: 'To Do', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200', dotClass: 'bg-slate-400' },
  IN_PROGRESS: { label: 'In Progress', badgeClass: 'bg-purple-50 text-purple-700 border-purple-200', dotClass: 'bg-purple-600' },
  IN_REVIEW: { label: 'In Review', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200', dotClass: 'bg-blue-600' },
  BLOCKED: { label: 'Blocked', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200', dotClass: 'bg-rose-600' },
  COMPLETED: { label: 'Completed', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200', dotClass: 'bg-emerald-600' },
};

const PRIORITY_CONFIG = {
  URGENT: { label: 'URGENT', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 font-bold' },
  HIGH: { label: 'HIGH', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 font-bold' },
  MEDIUM: { label: 'MEDIUM', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 font-medium' },
  LOW: { label: 'LOW', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200 font-medium' },
};

export default function MyTasksTab({
  workItems = [],
  loading = false,
  onReload,
  onOpenTaskModal,
  onOpenCreatePersonalTask,
  onToggleTask,
  onToast,
  showViewSwitcher = true,
  project = null,
  isKanban = false,
}) {
  const isKanbanProject = isKanban || project?.methodology === 'KANBAN';
  const Term = isKanbanProject ? 'Cycle' : 'Sprint';

  // Section: 'active' (default) vs 'completed' (archive)
  const [viewTab, setViewTab] = useState('active'); // 'active' | 'completed'

  // View mode: 'list' | 'board' | 'hierarchy'
  const [viewMode, setViewMode] = useState('list');

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [kpiFilter, setKpiFilter] = useState(null); // 'TOTAL' | 'DUE_TODAY' | 'OVERDUE' | 'IN_PROGRESS' | 'COMPLETED' | null
  const [selectedCycleId, setSelectedCycleId] = useState('ALL');

  const [filters, setFilters] = useState({
    statuses: [],
    priorities: [],
    dueDates: [],
  });

  const filterRef = useRef(null);

  // Close filter popover on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (filterRef.current && !filterRef.current.contains(event.target)) {
        setIsFilterOpen(false);
      }
    }
    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isFilterOpen]);

  // Extract all cycles present across the intern's assigned work items (Scrum only)
  const availableCycles = useMemo(() => {
    if (isKanbanProject) return [];
    const map = new Map();
    workItems.forEach((w) => {
      if (w.sprint?.id) {
        map.set(w.sprint.id, { id: w.sprint.id, name: w.sprint.name, status: w.sprint.status });
      } else if (w.sprint_id) {
        map.set(w.sprint_id, { id: w.sprint_id, name: w.sprint_name || Term, status: null });
      }
    });
    return Array.from(map.values());
  }, [workItems, Term, isKanbanProject]);

  // Real-time KPI metrics calculation
  const kpis = useMemo(() => {
    const total = workItems.length;
    const dueToday = workItems.filter((w) => workItemsService.isDueToday(w) && w.status !== 'COMPLETED').length;
    const overdue = workItems.filter((w) => workItemsService.isOverdue(w) && w.status !== 'COMPLETED').length;
    const inProgress = workItems.filter((w) => (w.status === 'IN_PROGRESS' || w.status === 'IN_REVIEW') && w.status !== 'COMPLETED').length;
    const completed = workItems.filter((w) => w.status === 'COMPLETED').length;
    return { total, dueToday, overdue, inProgress, completed };
  }, [workItems]);

  const activeCount = useMemo(() => {
    return workItems.filter((w) => w.status !== 'COMPLETED').length;
  }, [workItems]);

  const completedCount = kpis.completed;

  const activeFilterCount =
    filters.statuses.length +
    filters.priorities.length +
    filters.dueDates.length +
    (selectedCycleId !== 'ALL' ? 1 : 0);

  const toggleFilter = (type, value) => {
    setFilters((prev) => {
      const arr = prev[type] || [];
      const next = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
      return { ...prev, [type]: next };
    });
  };

  const clearFilters = () => {
    setFilters({ statuses: [], priorities: [], dueDates: [] });
    setSelectedCycleId('ALL');
    setKpiFilter(null);
    setSearch('');
  };

  const handleKpiClick = (type) => {
    if (type === 'COMPLETED') {
      setViewTab('completed');
      setKpiFilter(null);
      return;
    }
    setViewTab('active');
    if (type === 'TOTAL') {
      setKpiFilter(null);
      setFilters((prev) => ({ ...prev, statuses: [] }));
      return;
    }
    setKpiFilter((prev) => (prev === type ? null : type));
  };

  // Main filtered & sorted items
  const filteredItems = useMemo(() => {
    let items = workItems.filter((item) => {
      // 1. View tab separation
      if (viewTab === 'active' && item.status === 'COMPLETED') return false;
      if (viewTab === 'completed' && item.status !== 'COMPLETED') return false;

      // 2. Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const pName = (item.project?.name || item.project_name || '').toLowerCase();
        const title = (item.title || '').toLowerCase();
        const id = (item.id || '').toLowerCase();
        if (!title.includes(q) && !id.includes(q) && !pName.includes(q)) {
          return false;
        }
      }

      // 3. Cycle filter
      if (selectedCycleId === 'BACKLOG') {
        if (item.sprint_id !== null && item.sprint_id !== undefined) return false;
      } else if (selectedCycleId !== 'ALL') {
        if (item.sprint_id !== selectedCycleId && item.sprint?.id !== selectedCycleId) return false;
      }

      // 4. KPI Card single-click Quick Filter
      if (kpiFilter === 'DUE_TODAY' && !workItemsService.isDueToday(item)) return false;
      if (kpiFilter === 'OVERDUE' && !workItemsService.isOverdue(item)) return false;
      if (kpiFilter === 'IN_PROGRESS' && item.status !== 'IN_PROGRESS' && item.status !== 'IN_REVIEW') return false;

      // 5. Popover Filters
      if (filters.statuses.length > 0 && !filters.statuses.includes(item.status)) return false;
      if (filters.priorities.length > 0 && !filters.priorities.includes(item.priority)) return false;
      if (filters.dueDates.length > 0) {
        const isOverdue = workItemsService.isOverdue(item);
        const isDueToday = workItemsService.isDueToday(item);
        const hasNoDueDate = !item.due_date;
        const matches = filters.dueDates.some((dd) => {
          if (dd === 'OVERDUE') return isOverdue;
          if (dd === 'DUE_TODAY') return isDueToday;
          if (dd === 'NO_DUE_DATE') return hasNoDueDate;
          return false;
        });
        if (!matches) return false;
      }

      return true;
    });

    // Sort items:
    if (viewTab === 'completed') {
      return items.sort((a, b) => new Date(b.completed_at || b.updated_at || 0) - new Date(a.completed_at || a.updated_at || 0));
    }

    return items.sort((a, b) => {
      const aOverdue = workItemsService.isOverdue(a);
      const bOverdue = workItemsService.isOverdue(b);
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;

      const aDueToday = workItemsService.isDueToday(a);
      const bDueToday = workItemsService.isDueToday(b);
      if (aDueToday !== bDueToday) return aDueToday ? -1 : 1;

      const prioWeight = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      const aPrio = prioWeight[a.priority?.toUpperCase()] || 0;
      const bPrio = prioWeight[b.priority?.toUpperCase()] || 0;
      if (aPrio !== bPrio) return bPrio - aPrio;

      if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;

      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }, [workItems, viewTab, search, selectedCycleId, kpiFilter, filters]);

  const getTypeStyle = (type) => {
    switch (type) {
      case 'EPIC':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'STORY':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'TASK':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'SUBTASK':
        return 'bg-slate-100 text-slate-800 border-slate-200';
      case 'BUG':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="space-y-5 w-full min-w-0">
      {/* 1. Header Card with Title & Controls matching Manager My Tasks */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-card">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600">
              <CheckSquare className="w-4 h-4" />
            </div>
            <span>My Work Items</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Track your personal tasks, deadlines, priorities, and progress.
          </p>
        </div>

        {/* Action Controls: Search + Filter + New Personal Task */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Sprint / Cycle Dropdown for Scrum */}
          {!isKanbanProject && availableCycles.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl">
              <span className="text-[10px] font-bold uppercase text-slate-400">Sprint:</span>
              <select
                value={selectedCycleId}
                onChange={(e) => setSelectedCycleId(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Sprints ({workItems.length})</option>
                <option value="BACKLOG">Backlog ({workItems.filter(w => !w.sprint_id).length})</option>
                {availableCycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.status ? `(${c.status})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Search Box */}
          <div className="relative min-w-[200px] sm:w-60">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-slate-800 placeholder-slate-400 transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Popover */}
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
                activeFilterCount > 0
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filter</span>
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-[10px] flex items-center justify-center font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {isFilterOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">Filter Work Items</span>
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="text-[11px] font-semibold text-purple-600 hover:text-purple-700"
                    >
                      Reset All
                    </button>
                  )}
                </div>

                <div className="py-3 space-y-3.5 max-h-80 overflow-y-auto">
                  {/* Status */}
                  {viewTab === 'active' && (
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Status</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        {Object.entries(STATUS_CONFIG)
                          .filter(([k]) => k !== 'COMPLETED')
                          .map(([key, cfg]) => {
                            const checked = filters.statuses.includes(key);
                            return (
                              <label
                                key={key}
                                htmlFor={`my-task-status-${key}`}
                                aria-label={cfg.label}
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                                  checked
                                    ? 'bg-purple-50/70 border-purple-200 text-purple-900 font-semibold'
                                    : 'bg-slate-50/60 border-slate-200 text-slate-700 hover:bg-slate-100/60'
                                }`}
                              >
                                <input
                                  id={`my-task-status-${key}`}
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleFilter('statuses', key)}
                                  className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 accent-purple-600"
                                />
                                <span>{cfg.label}</span>
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Priority */}
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Priority</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => {
                        const checked = filters.priorities.includes(key);
                        return (
                          <label
                            key={key}
                            htmlFor={`my-task-priority-${key}`}
                            aria-label={cfg.label}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                              checked
                                ? 'bg-purple-50/70 border-purple-200 text-purple-900 font-semibold'
                                : 'bg-slate-50/60 border-slate-200 text-slate-700 hover:bg-slate-100/60'
                            }`}
                          >
                            <input
                              id={`my-task-priority-${key}`}
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleFilter('priorities', key)}
                              className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 accent-purple-600"
                            />
                            <span>{cfg.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Due Date */}
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Due Date</span>
                    <div className="space-y-1.5">
                      {[
                        { key: 'DUE_TODAY', label: 'Due Today' },
                        { key: 'OVERDUE', label: 'Overdue' },
                        { key: 'NO_DUE_DATE', label: 'No Due Date' },
                      ].map(({ key, label }) => {
                        const checked = filters.dueDates.includes(key);
                        return (
                          <label
                            key={key}
                            htmlFor={`my-task-duedate-${key}`}
                            aria-label={label}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                              checked
                                ? 'bg-purple-50/70 border-purple-200 text-purple-900 font-semibold'
                                : 'bg-slate-50/60 border-slate-200 text-slate-700 hover:bg-slate-100/60'
                            }`}
                          >
                            <input
                              id={`my-task-duedate-${key}`}
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleFilter('dueDates', key)}
                              className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 accent-purple-600"
                            />
                            <span>{label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setIsFilterOpen(false)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* New Personal Task Button */}
          <button
            type="button"
            onClick={onOpenCreatePersonalTask}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New Personal Task</span>
          </button>
        </div>
      </div>

      {/* 2. Real-time Task KPIs (Exactly 5 Cards matching Manager My Tasks) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* TOTAL TASKS */}
        <button
          type="button"
          onClick={() => handleKpiClick('TOTAL')}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            viewTab === 'active' && kpiFilter === null && filters.statuses.length === 0
              ? 'bg-white border-purple-300 ring-2 ring-purple-100 shadow-card'
              : 'bg-white border-slate-200 hover:border-purple-200 shadow-card'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">TOTAL TASKS</span>
            <Layers className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{kpis.total}</div>
        </button>

        {/* DUE TODAY */}
        <button
          type="button"
          onClick={() => handleKpiClick('DUE_TODAY')}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            viewTab === 'active' && kpiFilter === 'DUE_TODAY'
              ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-400/30 shadow-card'
              : 'bg-white border-slate-200 hover:border-amber-200 shadow-card'
          }`}
        >
          <div className="flex items-center justify-between text-amber-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">DUE TODAY</span>
            <Calendar className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-amber-900">{kpis.dueToday}</div>
        </button>

        {/* OVERDUE */}
        <button
          type="button"
          onClick={() => handleKpiClick('OVERDUE')}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            viewTab === 'active' && kpiFilter === 'OVERDUE'
              ? 'bg-rose-50/70 border-rose-300 ring-2 ring-rose-400/30 shadow-card'
              : 'bg-white border-slate-200 hover:border-rose-200 shadow-card'
          }`}
        >
          <div className="flex items-center justify-between text-rose-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">OVERDUE</span>
            <AlertCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-extrabold text-rose-900">{kpis.overdue}</div>
        </button>

        {/* IN PROGRESS */}
        <button
          type="button"
          onClick={() => handleKpiClick('IN_PROGRESS')}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            viewTab === 'active' && kpiFilter === 'IN_PROGRESS'
              ? 'bg-purple-50/70 border-purple-300 ring-2 ring-purple-400/30 shadow-card'
              : 'bg-white border-slate-200 hover:border-purple-200 shadow-card'
          }`}
        >
          <div className="flex items-center justify-between text-purple-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">IN PROGRESS</span>
            <Clock className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-extrabold text-purple-900">{kpis.inProgress}</div>
        </button>

        {/* COMPLETED */}
        <button
          type="button"
          onClick={() => handleKpiClick('COMPLETED')}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            viewTab === 'completed'
              ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-400/30 shadow-card'
              : 'bg-white border-slate-200 hover:border-emerald-200 shadow-card'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">COMPLETED</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-900">{kpis.completed}</div>
        </button>
      </div>

      {/* 3. Section Title & View Switchers */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-wider">
            {viewTab === 'active' ? 'ACTIVE PERSONAL TASKS' : 'COMPLETED TASKS ARCHIVE'}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Showing {filteredItems.length} of {viewTab === 'active' ? activeCount : completedCount} {viewTab === 'active' ? 'active personal tasks' : 'completed tasks'}
          </p>
        </div>

        {/* View Switchers on Right */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {showViewSwitcher && (
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-white text-purple-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>LIST</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('board')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  viewMode === 'board'
                    ? 'bg-white text-purple-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>BOARD</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('hierarchy')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  viewMode === 'hierarchy'
                    ? 'bg-white text-purple-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <GitFork className="w-3.5 h-3.5" />
                <span>HIERARCHY</span>
              </button>
            </div>
          )}

          {/* Active (X) vs Completed (Y) Pill Switcher */}
          <div className="flex items-center p-1 bg-slate-100 border border-slate-200/80 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => { setViewTab('active'); setKpiFilter(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewTab === 'active'
                  ? 'bg-white text-purple-700 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Active ({activeCount})</span>
            </button>
            <button
              type="button"
              onClick={() => { setViewTab('completed'); setKpiFilter(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewTab === 'completed'
                  ? 'bg-white text-emerald-700 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Completed ({completedCount})</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Task Content Area */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 text-slate-500 shadow-card">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-purple-600" />
          <h4 className="font-bold text-slate-800 text-sm">Loading your work items...</h4>
        </div>
      ) : viewTab === 'active' && activeCount === 0 && !search && activeFilterCount === 0 ? (
        /* Empty State matching the uploaded screenshot */
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-card space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h4 className="font-bold text-slate-800 text-base">All caught up!</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
            All your personal tasks are completed and archived in the Completed section.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={onOpenCreatePersonalTask}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Personal Task</span>
            </button>
            {completedCount > 0 && (
              <button
                type="button"
                onClick={() => setViewTab('completed')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors cursor-pointer"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>View Completed ({completedCount})</span>
              </button>
            )}
          </div>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 text-slate-400 shadow-card">
          <CheckSquare className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <h4 className="font-bold text-slate-700 text-sm">No tasks found</h4>
          <p className="text-xs text-slate-500 mt-1">
            {search || activeFilterCount > 0
              ? 'No work items match your search or filter criteria.'
              : viewTab === 'completed'
              ? 'You have not completed any tasks yet.'
              : 'You have no active tasks matching this view.'}
          </p>
          {(search || activeFilterCount > 0) && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 text-xs font-semibold text-purple-600 hover:text-purple-700"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* VIEW: BOARD */}
          {viewMode === 'board' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 pb-1">
                <span>Personal Kanban Board (Showing {filteredItems.length} items)</span>
                <span>Drag cards between columns to update status</span>
              </div>
              <PersonalKanbanBoard
                workItems={filteredItems}
                onTaskClick={onOpenTaskModal}
                onTaskUpdated={onReload}
                onToast={onToast}
              />
            </div>
          )}

          {/* VIEW: HIERARCHY */}
          {viewMode === 'hierarchy' && (
            <HierarchyTreeView
              workItems={filteredItems}
              onTaskClick={onOpenTaskModal}
              onToggleTask={onToggleTask}
            />
          )}

          {/* VIEW: LIST (Default) */}
          {viewMode === 'list' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-card divide-y divide-slate-100 overflow-hidden">
              {filteredItems.map((item) => {
                const isOverdue = workItemsService.isOverdue(item);
                const isDueToday = workItemsService.isDueToday(item);
                const isCompleted = item.status === 'COMPLETED';
                const isPersonal = item.project_id === null;
                const assigneesList = item.assignees || item.work_item_assignees || [];
                const hasMultipleAssignees = assigneesList.length > 1;
                const projectName = item.project?.name || item.project_name || (isPersonal ? 'Personal Goal' : 'Project Task');

                const statusCfg = STATUS_CONFIG[item.status] || {
                  label: item.status || 'To Do',
                  badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
                  dotClass: 'bg-slate-400',
                };

                const prioCfg = PRIORITY_CONFIG[item.priority] || {
                  label: item.priority || 'MEDIUM',
                  badgeClass: 'bg-slate-100 text-slate-600 border-slate-200 font-medium',
                };

                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenTaskModal?.(item)}
                    onKeyDown={(e) => {
                      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        onOpenTaskModal?.(item);
                      }
                    }}
                    className={`p-4 sm:p-5 flex items-center justify-between transition-colors cursor-pointer hover:bg-slate-50/80 select-none ${
                      isOverdue && !isCompleted ? 'bg-rose-50/20' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0 pr-3">
                      {/* Checkbox toggle */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void onToggleTask?.(item.id);
                        }}
                        className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                          isCompleted
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'border-slate-300 hover:border-purple-500 bg-white'
                        }`}
                        title={isCompleted ? 'Mark as incomplete' : 'Mark as complete'}
                      >
                        {isCompleted && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </button>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono font-bold text-slate-400">
                            {item.id}
                          </span>
                          <span
                            className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border ${getTypeStyle(
                              item.type
                            )}`}
                          >
                            {item.type}
                          </span>
                          {isPersonal && (
                            <span className="text-[9px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded">
                              Personal
                            </span>
                          )}
                          <h4
                            className={`text-xs sm:text-sm font-bold truncate ${
                              isCompleted
                                ? 'text-slate-400 line-through'
                                : 'text-slate-800'
                            }`}
                          >
                            {item.title}
                          </h4>
                        </div>

                        <div className="flex items-center gap-2.5 text-[11px] text-slate-400 mt-1 flex-wrap">
                          <span className="text-slate-600 font-medium">
                            {projectName}
                          </span>

                          {!isKanbanProject && ((item.sprint?.name || item.sprint_name) ? (
                            <>
                              <span>•</span>
                              <span className="text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded font-semibold text-[10px] border border-purple-200">
                                {item.sprint?.name || item.sprint_name}
                              </span>
                            </>
                          ) : !isPersonal ? (
                            <>
                              <span>•</span>
                              <span className="text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded text-[10px]">
                                Backlog
                              </span>
                            </>
                          ) : null)}

                          <span>•</span>
                          <span
                            className={
                              isOverdue && !isCompleted
                                ? 'text-rose-600 font-bold'
                                : isDueToday && !isCompleted
                                ? 'text-amber-600 font-bold'
                                : 'text-slate-500'
                            }
                          >
                            {isOverdue && !isCompleted
                              ? '⚠️ Overdue'
                              : isDueToday && !isCompleted
                              ? 'Due Today'
                              : item.due_date
                              ? `Due ${new Date(item.due_date).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
                              : 'No due date'}
                          </span>

                          {hasMultipleAssignees && (
                            <>
                              <span>•</span>
                              <span className="text-purple-600 font-medium flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                <span>{assigneesList.length} assignees</span>
                              </span>
                            </>
                          )}

                          {item.attachments?.length > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-slate-500">
                                📎 {item.attachments.length} files
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                      {/* Priority Badge */}
                      <span
                        className={`hidden sm:inline-flex px-2 py-0.5 rounded text-[10px] border ${prioCfg.badgeClass}`}
                      >
                        {prioCfg.label}
                      </span>

                      {/* Status Badge */}
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${statusCfg.badgeClass}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dotClass}`} />
                        <span>{statusCfg.label}</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
