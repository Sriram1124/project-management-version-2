import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  CheckSquare,
  Search,
  Plus,
  Filter,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  X,
  Layers,
  Eye,
  RotateCcw,
  Loader2,
  Check,
  Archive
} from 'lucide-react';
import TaskDetailModal from '../kanban/TaskDetailModal';
import CreatePersonalTaskModal from '../../features/intern/components/CreatePersonalTaskModal';
import { workItemsService } from '../../services/workItems.service';

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

export default function ManagerMyTasksView({ onToast }) {
  const [workItems, setWorkItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isCreatePersonalOpen, setIsCreatePersonalOpen] = useState(false);

  // View section: 'active' (default) vs 'completed' (archive)
  const [viewTab, setViewTab] = useState('active'); // 'active' | 'completed'

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [kpiFilter, setKpiFilter] = useState(null); // 'DUE_TODAY' | 'OVERDUE' | 'IN_PROGRESS' | null

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

  // Load manager's personal work items
  const loadWorkItems = useCallback(async () => {
    try {
      setLoading(true);
      const items = await workItemsService.listWorkItems({ assigned_to_me: true });
      setWorkItems(items || []);
    } catch (err) {
      console.error('Failed to load manager tasks:', err);
      onToast?.(err.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    void loadWorkItems();
  }, [loadWorkItems]);

  // Real-time KPIs derived directly from manager's personal tasks
  const kpis = useMemo(() => {
    const total = workItems.length;
    const dueToday = workItems.filter((i) => workItemsService.isDueToday(i)).length;
    const overdue = workItems.filter((i) => workItemsService.isOverdue(i)).length;
    const inProgress = workItems.filter((i) => i.status === 'IN_PROGRESS').length;
    const completed = workItems.filter((i) => i.status === 'COMPLETED').length;
    return { total, dueToday, overdue, inProgress, completed };
  }, [workItems]);

  const activeTasksCount = useMemo(() => {
    return workItems.filter((i) => i.status !== 'COMPLETED').length;
  }, [workItems]);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    return (
      filters.statuses.length +
      filters.priorities.length +
      filters.dueDates.length
    );
  }, [filters]);

  const toggleFilter = (category, value) => {
    setFilters((prev) => {
      const arr = prev[category] || [];
      const nextArr = arr.includes(value)
        ? arr.filter((v) => v !== value)
        : [...arr, value];
      return { ...prev, [category]: nextArr };
    });
  };

  const clearAllFilters = () => {
    setFilters({
      statuses: [],
      priorities: [],
      dueDates: [],
    });
    setKpiFilter(null);
    setSearch('');
  };

  const handleKpiClick = (type) => {
    if (type === 'TOTAL') {
      setViewTab('active');
      setKpiFilter(null);
      setFilters((prev) => ({
        ...prev,
        statuses: [],
        dueDates: [],
      }));
      return;
    }
    if (type === 'COMPLETED') {
      setViewTab('completed');
      setKpiFilter(null);
      return;
    }
    // For DUE_TODAY, OVERDUE, IN_PROGRESS: switch to active tasks and apply filter
    setViewTab('active');
    setKpiFilter((prev) => (prev === type ? null : type));
  };

  // Direct toggle task complete
  const handleToggleTask = async (taskId) => {
    const item = workItems.find((w) => w.id === taskId);
    if (!item) return;
    try {
      const updated = await workItemsService.toggleComplete(item);
      setWorkItems((prev) => prev.map((w) => (w.id === taskId ? updated : w)));
      onToast?.(
        updated.status === 'COMPLETED'
          ? `Marked "${updated.title}" completed (moved to Archive)`
          : `Reopened "${updated.title}" (moved to Active Tasks)`
      );
    } catch (err) {
      onToast?.(err.message || 'Failed to update task status');
    }
  };

  // Due Date Formatting
  const renderDueDate = (dueDate, status) => {
    if (!dueDate) {
      return <span className="text-slate-400 italic text-xs">No due date</span>;
    }
    const dateObj = new Date(dueDate);
    if (Number.isNaN(dateObj.getTime())) {
      return <span className="text-slate-400 italic text-xs">No due date</span>;
    }
    const formatted = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const isCompleted = status === 'COMPLETED';

    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueMidnight = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());

    if (!isCompleted && dueMidnight < todayMidnight) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md whitespace-nowrap">
          <span>Overdue · {formatted}</span>
        </span>
      );
    }
    if (!isCompleted && dueMidnight.getTime() === todayMidnight.getTime()) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md whitespace-nowrap">
          <span>Due Today</span>
        </span>
      );
    }
    return <span className="text-xs text-slate-600 font-medium whitespace-nowrap">{formatted}</span>;
  };

  // Filtering & Prioritization
  const filteredAndSortedItems = useMemo(() => {
    // 1. Filter
    const filtered = workItems.filter((item) => {
      // Archive / Completed separation:
      // In 'active' view, completed tasks are excluded so they do not clutter/group with active tasks.
      // In 'completed' view, only completed tasks are shown.
      if (viewTab === 'active' && item.status === 'COMPLETED') {
        return false;
      }
      if (viewTab === 'completed' && item.status !== 'COMPLETED') {
        return false;
      }

      // Search text across title and description
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = item.title?.toLowerCase().includes(q);
        const matchDesc = item.description?.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc) {
          return false;
        }
      }

      // KPI quick filter (active tab only)
      if (kpiFilter === 'DUE_TODAY' && !workItemsService.isDueToday(item)) return false;
      if (kpiFilter === 'OVERDUE' && !workItemsService.isOverdue(item)) return false;
      if (kpiFilter === 'IN_PROGRESS' && item.status !== 'IN_PROGRESS') return false;

      // Status multi-filter
      if (filters.statuses.length > 0 && !filters.statuses.includes(item.status)) {
        return false;
      }

      // Priority multi-filter
      if (filters.priorities.length > 0 && !filters.priorities.includes(item.priority)) {
        return false;
      }

      // Due date multi-filter
      if (filters.dueDates.length > 0) {
        const isOverdue = workItemsService.isOverdue(item);
        const isDueToday = workItemsService.isDueToday(item);
        const isDueThisWeek = (() => {
          if (!item.due_date || item.status === 'COMPLETED') return false;
          const due = new Date(item.due_date);
          const now = new Date();
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const end = new Date(start);
          end.setDate(end.getDate() + 7);
          return due >= start && due <= end;
        })();
        const hasNoDueDate = !item.due_date;

        const matches = filters.dueDates.some((dd) => {
          if (dd === 'OVERDUE') return isOverdue;
          if (dd === 'DUE_TODAY') return isDueToday;
          if (dd === 'DUE_THIS_WEEK') return isDueThisWeek;
          if (dd === 'NO_DUE_DATE') return hasNoDueDate;
          return false;
        });
        if (!matches) return false;
      }

      return true;
    });

    // 2. Sort:
    // If in completed archive, sort newest completed / created first
    if (viewTab === 'completed') {
      return [...filtered].sort((a, b) => {
        const dateA = new Date(a.completed_at || a.updated_at || a.created_at || 0);
        const dateB = new Date(b.completed_at || b.updated_at || b.created_at || 0);
        return dateB - dateA;
      });
    }

    // If in active view:
    // Overdue work > Due today > High/Urgent priority > In-progress work > Closest deadline
    return [...filtered].sort((a, b) => {
      const aOverdue = workItemsService.isOverdue(a);
      const bOverdue = workItemsService.isOverdue(b);
      if (aOverdue !== bOverdue) {
        return aOverdue ? -1 : 1;
      }

      const aDueToday = workItemsService.isDueToday(a);
      const bDueToday = workItemsService.isDueToday(b);
      if (aDueToday !== bDueToday) {
        return aDueToday ? -1 : 1;
      }

      const priorityWeight = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      const aPrio = priorityWeight[a.priority?.toUpperCase()] || 0;
      const bPrio = priorityWeight[b.priority?.toUpperCase()] || 0;
      if (aPrio !== bPrio) {
        return bPrio - aPrio;
      }

      const aInProgress = a.status === 'IN_PROGRESS';
      const bInProgress = b.status === 'IN_PROGRESS';
      if (aInProgress !== bInProgress) {
        return aInProgress ? -1 : 1;
      }

      if (a.due_date && b.due_date) {
        return new Date(a.due_date) - new Date(b.due_date);
      }
      if (a.due_date) return -1;
      if (b.due_date) return 1;

      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }, [workItems, viewTab, search, kpiFilter, filters]);

  return (
    <div className="space-y-5">
      {/* 1. Header & Title */}
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
          {/* Search Box */}
          <div className="relative min-w-[220px] sm:w-64">
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
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Button & Popover */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setIsFilterOpen((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition-all ${
                activeFilterCount > 0 || isFilterOpen
                  ? 'bg-purple-50 text-purple-700 border-purple-300 ring-2 ring-purple-100'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filter</span>
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Filter Popover */}
            {isFilterOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 z-40 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">Filters</span>
                    {activeFilterCount > 0 && (
                      <span className="text-[10px] font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                        {activeFilterCount} active
                      </span>
                    )}
                  </div>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={clearAllFilters}
                      className="text-[11px] font-semibold text-purple-600 hover:text-purple-800 transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                <div className="py-3 space-y-4 max-h-[380px] overflow-y-auto pr-1">
                  {/* Status (filtered for active tasks) */}
                  {viewTab === 'active' && (
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block mb-2">
                        Status
                      </span>
                      <div className="grid grid-cols-2 gap-1.5">
                        {Object.entries(STATUS_CONFIG)
                          .filter(([key]) => key !== 'COMPLETED')
                          .map(([key, cfg]) => {
                            const checked = filters.statuses.includes(key);
                            return (
                              <label
                                key={key}
                                htmlFor={`filter-status-${key}`}
                                aria-label={cfg.label}
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                                  checked
                                    ? 'bg-purple-50/70 border-purple-200 text-purple-900 font-semibold'
                                    : 'bg-slate-50/60 border-slate-200 text-slate-700 hover:bg-slate-100/60'
                                }`}
                              >
                                <input
                                  id={`filter-status-${key}`}
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
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block mb-2">
                      Priority
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => {
                        const checked = filters.priorities.includes(key);
                        return (
                          <label
                            key={key}
                            htmlFor={`filter-priority-${key}`}
                            aria-label={cfg.label}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                              checked
                                ? 'bg-purple-50/70 border-purple-200 text-purple-900 font-semibold'
                                : 'bg-slate-50/60 border-slate-200 text-slate-700 hover:bg-slate-100/60'
                            }`}
                          >
                            <input
                              id={`filter-priority-${key}`}
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
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block mb-2">
                      Due Date
                    </span>
                    <div className="space-y-1.5">
                      {[
                        { key: 'DUE_TODAY', label: 'Due Today' },
                        { key: 'OVERDUE', label: 'Overdue' },
                        { key: 'DUE_THIS_WEEK', label: 'Due This Week' },
                        { key: 'NO_DUE_DATE', label: 'No Due Date' },
                      ].map(({ key, label }) => {
                        const checked = filters.dueDates.includes(key);
                        return (
                          <label
                            key={key}
                            htmlFor={`filter-duedate-${key}`}
                            aria-label={label}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                              checked
                                ? 'bg-purple-50/70 border-purple-200 text-purple-900 font-semibold'
                                : 'bg-slate-50/60 border-slate-200 text-slate-700 hover:bg-slate-100/60'
                            }`}
                          >
                            <input
                              id={`filter-duedate-${key}`}
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

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    onClick={() => setIsFilterOpen(false)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* New Personal Task Button */}
          <button
            onClick={() => setIsCreatePersonalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Personal Task</span>
          </button>
        </div>
      </div>

      {/* 2. Manager Real-time Task KPIs (Exactly 5 KPIs) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* TOTAL TASKS */}
        <button
          onClick={() => handleKpiClick('TOTAL')}
          className={`text-left p-4 rounded-2xl border transition-all ${
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
          onClick={() => handleKpiClick('DUE_TODAY')}
          className={`text-left p-4 rounded-2xl border transition-all ${
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
          onClick={() => handleKpiClick('OVERDUE')}
          className={`text-left p-4 rounded-2xl border transition-all ${
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
          onClick={() => handleKpiClick('IN_PROGRESS')}
          className={`text-left p-4 rounded-2xl border transition-all ${
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

        {/* COMPLETED / ARCHIVE */}
        <button
          onClick={() => handleKpiClick('COMPLETED')}
          className={`text-left p-4 rounded-2xl border transition-all ${
            viewTab === 'completed'
              ? 'bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-500/30 shadow-card'
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

      {/* Active Filter Pills Bar (if filters or kpiFilter applied) */}
      {(activeFilterCount > 0 || kpiFilter || search) && (
        <div className="flex flex-wrap items-center gap-2 bg-slate-50/80 px-4 py-2.5 rounded-xl border border-slate-200 text-xs">
          <span className="font-semibold text-slate-500">Active Filters:</span>
          {kpiFilter && (
            <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md font-medium">
              KPI: {kpiFilter.replace('_', ' ')}
              <button onClick={() => setKpiFilter(null)} className="hover:text-purple-950">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {search && (
            <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md font-medium">
              Search: "{search}"
              <button onClick={() => setSearch('')} className="hover:text-purple-950">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.statuses.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md font-medium">
              Status: {STATUS_CONFIG[s]?.label || s}
              <button onClick={() => toggleFilter('statuses', s)} className="hover:text-purple-950">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {filters.priorities.map((p) => (
            <span key={p} className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md font-medium">
              Priority: {PRIORITY_CONFIG[p]?.label || p}
              <button onClick={() => toggleFilter('priorities', p)} className="hover:text-purple-950">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {filters.dueDates.map((d) => (
            <span key={d} className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md font-medium">
              Due: {d.replace('_', ' ')}
              <button onClick={() => toggleFilter('dueDates', d)} className="hover:text-purple-950">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button
            onClick={clearAllFilters}
            className="ml-auto text-xs font-semibold text-purple-600 hover:text-purple-800 flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset all</span>
          </button>
        </div>
      )}

      {/* 3. Task Management Workspace Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        {/* Table Header with Active vs Completed Sections Toggle */}
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              {viewTab === 'active' ? 'Active Personal Tasks' : 'Completed Archive'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {viewTab === 'active'
                ? `Showing ${filteredAndSortedItems.length} of ${activeTasksCount} active personal tasks`
                : `Showing ${filteredAndSortedItems.length} of ${kpis.completed} completed personal tasks in archive`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Section Switcher: Active Tasks vs Completed Archive */}
            <div className="flex items-center p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setViewTab('active');
                  setKpiFilter(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  viewTab === 'active'
                    ? 'bg-white text-purple-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Active ({activeTasksCount})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewTab('completed');
                  setKpiFilter(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  viewTab === 'completed'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Archive className="w-3.5 h-3.5" />
                <span>Completed ({kpis.completed})</span>
              </button>
            </div>

            {loading && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400 pl-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
              </div>
            )}
          </div>
        </div>

        {/* Content View */}
        {loading && workItems.length === 0 ? (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-3" />
            <p className="text-sm text-slate-600 font-medium">Loading your personal tasks...</p>
          </div>
        ) : viewTab === 'active' && activeTasksCount === 0 ? (
          /* Empty State for Active: all tasks are completed or none created */
          <div className="p-12 text-center max-w-sm mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-slate-900">All caught up!</h4>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              {kpis.completed > 0
                ? 'All your personal tasks are completed and archived in the Completed section.'
                : 'No active personal tasks. Create a new personal task to get started.'}
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setIsCreatePersonalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>New Personal Task</span>
              </button>
              {kpis.completed > 0 && (
                <button
                  onClick={() => setViewTab('completed')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>View Completed ({kpis.completed})</span>
                </button>
              )}
            </div>
          </div>
        ) : viewTab === 'completed' && kpis.completed === 0 ? (
          /* Empty State for Completed */
          <div className="p-12 text-center max-w-sm mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Archive className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-slate-900">No completed tasks yet</h4>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              When you complete tasks, they will be archived here so they don't clutter your active tasks.
            </p>
            <button
              onClick={() => setViewTab('active')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition-colors"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Back to Active Tasks</span>
            </button>
          </div>
        ) : filteredAndSortedItems.length === 0 ? (
          /* Empty State: Filtered out */
          <div className="p-12 text-center max-w-sm mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Search className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-slate-900">No matching tasks</h4>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              No tasks in this section match your current search and filter criteria.
            </p>
            <button
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear Filters</span>
            </button>
          </div>
        ) : (
          /* Structured Task Table */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5 min-w-[300px]">Task</th>
                  <th className="px-4 py-3.5 min-w-[120px]">Priority</th>
                  <th className="px-4 py-3.5 min-w-[140px]">Status</th>
                  <th className="px-4 py-3.5 min-w-[140px]">Due Date</th>
                  <th className="px-5 py-3.5 text-right min-w-[150px]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAndSortedItems.map((item) => {
                  const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.TODO;
                  const prioCfg = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.MEDIUM;
                  const isCompleted = item.status === 'COMPLETED';

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/70 transition-colors group"
                    >
                      {/* TASK Column */}
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col">
                          <button
                            onClick={() => setSelectedTask(item)}
                            className="text-left font-semibold text-slate-900 group-hover:text-purple-600 transition-colors cursor-pointer"
                          >
                            {item.title}
                          </button>
                          {item.description && (
                            <p className="text-[11px] text-slate-400 truncate max-w-sm mt-0.5">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* PRIORITY Column */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] tracking-wide border ${prioCfg.badgeClass}`}
                        >
                          {prioCfg.label}
                        </span>
                      </td>

                      {/* STATUS Column */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${statusCfg.badgeClass}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dotClass}`} />
                          {statusCfg.label}
                        </span>
                      </td>

                      {/* DUE DATE Column */}
                      <td className="px-4 py-3.5">
                        {renderDueDate(item.due_date, item.status)}
                      </td>

                      {/* ACTION Column with Done/Reopen and View buttons */}
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isCompleted ? (
                            <button
                              type="button"
                              onClick={() => { void handleToggleTask(item.id); }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                              title="Mark as done and archive"
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Done</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { void handleToggleTask(item.id); }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                              title="Reopen task and move to active"
                            >
                              <RotateCcw className="w-3 h-3 text-slate-400" />
                              <span>Reopen</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setSelectedTask(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>View</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Task Details Modal (Manager can view/edit/delete personal task) */}
      <TaskDetailModal
        task={selectedTask}
        isOpen={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
        hideAssignees={true}
        onTaskUpdated={() => {
          void loadWorkItems();
        }}
        onTaskDeleted={() => {
          setSelectedTask(null);
          void loadWorkItems();
          onToast?.('Task deleted successfully');
        }}
        onToast={onToast}
      />

      {/* Personal Task Creation Modal */}
      <CreatePersonalTaskModal
        isOpen={isCreatePersonalOpen}
        onClose={() => setIsCreatePersonalOpen(false)}
        onTaskCreated={() => {
          void loadWorkItems();
        }}
        onToast={onToast}
      />
    </div>
  );
}
