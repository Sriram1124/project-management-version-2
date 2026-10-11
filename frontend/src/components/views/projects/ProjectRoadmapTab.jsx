import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  Play, 
  Search, 
  ChevronDown, 
  Calendar,
  Layers, 
  Loader2, 
  Check, 
  Clock, 
  AlertTriangle, 
  Filter, 
  ArrowRight, 
  X,
  ExternalLink,
  Plus,
  Edit3
} from 'lucide-react';
import { sprintsService } from '../../../services/sprints.service';
import CreateSprintModal from '../../modals/CreateSprintModal';
import EditSprintModal from '../../modals/EditSprintModal';
import SprintDetailsModal from '../../modals/SprintDetailsModal';

export default function ProjectRoadmapTab({ 
  projectId, 
  project, 
  onOpenSprintBoard, 
  onToast,
  readOnly = false,
}) {
  const [loading, setLoading] = useState(true);
  const [sprints, setSprints] = useState([]);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All'); // 'All' | 'ACTIVE' | 'PLANNED' | 'COMPLETED'
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

  // Modals
  const [isCreateSprintOpen, setIsCreateSprintOpen] = useState(false);
  const [editingSprint, setEditingSprint] = useState(null);
  const [selectedSprintDetails, setSelectedSprintDetails] = useState(null);

  // References for dropdowns and scroll
  const timelineScrollRef = useRef(null);
  const statusMenuRef = useRef(null);

  // Close filter dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target)) {
        setStatusDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadData = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const sprintsList = await sprintsService.getSprints(projectId).catch(() => []);
      setSprints(sprintsList || []);
    } catch (err) {
      console.error('Failed to load roadmap sprints data:', err);
      onToast?.('Failed to load sprints data');
    } finally {
      setLoading(false);
    }
  }, [projectId, onToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sprints sorted chronologically by start date (null dates at end)
  const sortedSprints = useMemo(() => {
    return [...sprints].sort((a, b) => {
      if (a.start_date && b.start_date) {
        return new Date(a.start_date) - new Date(b.start_date);
      }
      if (a.start_date) return -1;
      if (b.start_date) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [sprints]);

  // Metrics
  const metrics = useMemo(() => {
    const totalSprints = sprints.length;
    const activeSprints = sprints.filter((s) => s.status === 'ACTIVE');
    const plannedSprints = sprints.filter((s) => s.status === 'PLANNED' || !s.status);
    const completedSprints = sprints.filter((s) => s.status === 'COMPLETED');

    return {
      totalSprints,
      activeCount: activeSprints.length,
      activeSprintNames: activeSprints.length > 0 ? activeSprints.map((s) => s.name).join(', ') : 'None active',
      plannedCount: plannedSprints.length,
      completedCount: completedSprints.length,
    };
  }, [sprints]);

  // Filtered Sprints based on search & status filter
  const filteredSprints = useMemo(() => {
    return sortedSprints.filter((s) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = (s.name || '').toLowerCase().includes(q);
        const matchGoal = (s.goal || '').toLowerCase().includes(q);
        if (!matchName && !matchGoal) return false;
      }

      if (statusFilter !== 'All') {
        const st = s.status || 'PLANNED';
        if (statusFilter === 'PLANNED' && (st === 'PLANNED' || !s.status)) return true;
        if (st !== statusFilter) return false;
      }

      return true;
    });
  }, [sortedSprints, search, statusFilter]);

  // Separate sprints with dates (scheduled) vs sprints without dates (unscheduled)
  const scheduledSprints = useMemo(() => {
    return filteredSprints.filter((s) => Boolean(s.start_date && s.end_date));
  }, [filteredSprints]);

  const unscheduledSprints = useMemo(() => {
    return filteredSprints.filter((s) => !s.start_date || !s.end_date);
  }, [filteredSprints]);

  // -------------------------------------------------------------
  // DYNAMIC WEEKLY TIMELINE CALCULATION
  // Generates weekly intervals spanning all sprints + current date
  // -------------------------------------------------------------
  const { weekColumns, timelineStartMs, timelineEndMs, totalDurationMs } = useMemo(() => {
    const dates = [];

    // Include today to ensure Today marker is visible in timeline range
    const today = new Date();
    dates.push(today);

    // Include all sprint start and end dates
    sprints.forEach((s) => {
      if (s.start_date) dates.push(new Date(s.start_date));
      if (s.end_date) dates.push(new Date(s.end_date));
    });

    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

    // Align start to the Monday of minDate's week
    const startDay = minDate.getDay();
    const startDiff = minDate.getDate() - startDay + (startDay === 0 ? -6 : 1);
    const timelineStart = new Date(minDate);
    timelineStart.setDate(startDiff);
    timelineStart.setHours(0, 0, 0, 0);

    // Align end to Sunday of maxDate's week, ensuring at least 4-6 weeks visible
    const endDay = maxDate.getDay();
    const endDiff = maxDate.getDate() + (endDay === 0 ? 0 : 7 - endDay);
    const timelineEnd = new Date(maxDate);
    timelineEnd.setDate(endDiff);
    timelineEnd.setHours(23, 59, 59, 999);

    // Ensure minimum span of 4 weeks for clear visualization
    const diffWeeks = Math.ceil((timelineEnd.getTime() - timelineStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (diffWeeks < 4) {
      timelineEnd.setDate(timelineEnd.getDate() + (4 - diffWeeks) * 7);
    }

    const weeks = [];
    let currentWeekStart = new Date(timelineStart);
    let weekIndex = 1;

    while (currentWeekStart <= timelineEnd) {
      const currentWeekEnd = new Date(currentWeekStart);
      currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);
      currentWeekEnd.setHours(23, 59, 59, 999);

      const isCurrentWeek = today >= currentWeekStart && today <= currentWeekEnd;

      weeks.push({
        id: `week-${weekIndex}`,
        title: `Week ${weekIndex}`,
        subtitle: `${currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${currentWeekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        startDate: new Date(currentWeekStart),
        endDate: new Date(currentWeekEnd),
        isActive: isCurrentWeek,
      });

      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
      weekIndex++;
    }

    const tStartMs = timelineStart.getTime();
    const tEndMs = timelineEnd.getTime();
    const totalMs = Math.max(1, tEndMs - tStartMs);

    return {
      weekColumns: weeks,
      timelineStartMs: tStartMs,
      timelineEndMs: tEndMs,
      totalDurationMs: totalMs,
    };
  }, [sprints]);

  // Today marker percentage across the timeline
  const todayPositionPercent = useMemo(() => {
    const nowMs = new Date().getTime();
    if (nowMs < timelineStartMs || nowMs > timelineEndMs) return null;
    return Math.max(0, Math.min(100, ((nowMs - timelineStartMs) / totalDurationMs) * 100));
  }, [timelineStartMs, timelineEndMs, totalDurationMs]);

  // Helper to detect if a sprint's schedule overlaps with another sprint in the project
  const getSprintOverlaps = useCallback((targetSprint) => {
    if (!targetSprint?.start_date || !targetSprint?.end_date) return [];
    const tStart = new Date(targetSprint.start_date).getTime();
    const tEnd = new Date(targetSprint.end_date).getTime();
    if (isNaN(tStart) || isNaN(tEnd)) return [];

    return sprints.filter((s) => {
      if (s.id === targetSprint.id) return false;
      if (!s.start_date || !s.end_date) return false;
      const sStart = new Date(s.start_date).getTime();
      const sEnd = new Date(s.end_date).getTime();
      if (isNaN(sStart) || isNaN(sEnd)) return false;
      return tStart <= sEnd && tEnd >= sStart;
    });
  }, [sprints]);

  const hasActiveFilters = Boolean(search.trim() || statusFilter !== 'All');
  const handleClearFilters = () => {
    setSearch('');
    setStatusFilter('All');
  };

  const ownerName = project?.owner
    ? project.owner.name || project.owner.email
    : 'Project Lead';

  if (loading && sprints.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-16 flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-3" />
        <p className="text-xs font-semibold text-slate-700">Loading Sprint Roadmap...</p>
        <p className="text-[11px] text-slate-400 mt-1">Retrieving scheduled sprint iterations and timelines</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* -------------------------------------------------------------
          SECTION 1: PAGE HIERARCHY & SUMMARY METRICS
          ------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left: Project Context */}
          <div className="space-y-1 max-w-2xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200/80">
                Sprint Timeline Roadmap
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs text-slate-500 font-medium">
                Lead: <strong className="text-slate-700 font-semibold">{ownerName}</strong>
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs text-slate-500 font-medium">
                Active: <strong className="text-purple-700 font-semibold">{metrics.activeSprintNames}</strong>
              </span>
            </div>

            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              {project?.name || 'Project Roadmap'}
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
              {project?.description || 'Gantt-style sprint schedule. Visualize when iterations start, how long they run, and track active deliverables across the calendar.'}
            </p>
          </div>

          {/* Right: Sprint Summary Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
            <div className="px-3.5 py-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80 text-center min-w-[95px]">
              <span className="text-lg font-extrabold text-slate-800">
                {metrics.totalSprints}
              </span>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                Total Sprints
              </div>
            </div>

            <div className="px-3.5 py-2.5 rounded-xl bg-purple-50/70 border border-purple-200/70 text-center min-w-[95px]">
              <span className="text-lg font-extrabold text-purple-700">
                {metrics.activeCount}
              </span>
              <div className="text-[10px] font-bold text-purple-900/60 uppercase tracking-wider mt-0.5">
                Active Now
              </div>
            </div>

            <div className="px-3.5 py-2.5 rounded-xl bg-blue-50/70 border border-blue-200/70 text-center min-w-[95px]">
              <span className="text-lg font-extrabold text-blue-700">
                {metrics.plannedCount}
              </span>
              <div className="text-[10px] font-bold text-blue-900/60 uppercase tracking-wider mt-0.5">
                Planned
              </div>
            </div>

            <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/70 text-center min-w-[95px]">
              <span className="text-lg font-extrabold text-emerald-700">
                {metrics.completedCount}
              </span>
              <div className="text-[10px] font-bold text-emerald-900/60 uppercase tracking-wider mt-0.5">
                Completed
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------
          SECTION 2: TOOLBAR (SEARCH, STATUS FILTER, CREATE SPRINT CTA)
          ------------------------------------------------------------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sprint name or goal..."
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Status Dropdown Filter */}
          <div className="relative" ref={statusMenuRef}>
            <button
              type="button"
              onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors cursor-pointer shadow-2xs"
            >
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {statusFilter === 'All'
                  ? 'All Sprints'
                  : statusFilter === 'ACTIVE'
                  ? 'Active Sprints'
                  : statusFilter === 'COMPLETED'
                  ? 'Completed Sprints'
                  : 'Planned Sprints'}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
            </button>
            {statusDropdownOpen && (
              <div className="absolute left-0 mt-1.5 w-44 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-30 animate-in fade-in zoom-in-95">
                {[
                  { id: 'All', label: 'All Sprints' },
                  { id: 'ACTIVE', label: 'Active Sprints' },
                  { id: 'PLANNED', label: 'Planned Sprints' },
                  { id: 'COMPLETED', label: 'Completed Sprints' },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      setStatusFilter(st.id);
                      setStatusDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center justify-between ${
                      statusFilter === st.id ? 'text-purple-700 font-bold bg-purple-50/50' : 'text-slate-700'
                    }`}
                  >
                    <span>{st.label}</span>
                    {statusFilter === st.id && <Check className="w-3.5 h-3.5 text-purple-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {/* Right CTA: Create Sprint */}
        {!readOnly && (
          <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
            <button
              type="button"
              onClick={() => setIsCreateSprintOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Sprint</span>
            </button>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------
          SECTION 3: CLEAN GANTT-STYLE SPRINT TIMELINE
          - Weekly headers across top
          - Violet horizontal bars directly for Sprint 1, Sprint 2, etc.
          - Positioned proportional to actual start_date & end_date
          - Today vertical marker line
          ------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
        <div className="overflow-x-auto" ref={timelineScrollRef}>
          <div className="min-w-[840px] w-full">
            {/* Weekly Timeline Header Grid */}
            <div className="border-b border-slate-200 bg-slate-50/90 text-xs font-bold text-slate-700">
              <div 
                className="grid divide-x divide-slate-100"
                style={{ gridTemplateColumns: `repeat(${weekColumns.length}, minmax(130px, 1fr))` }}
              >
                {weekColumns.map((col) => (
                  <div
                    key={col.id}
                    className={`py-3 px-2 text-center transition-colors ${
                      col.isActive ? 'bg-purple-50/80 border-t-2 border-t-purple-600' : 'bg-slate-50/40'
                    }`}
                  >
                    <span className={`text-xs font-bold block ${col.isActive ? 'text-purple-800 font-extrabold' : 'text-slate-800'}`}>
                      {col.title}
                    </span>
                    <div className="text-[10px] text-slate-400 mt-0.5 font-normal truncate px-1">
                      {col.subtitle}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Timeline Rows Container */}
            <div className="relative divide-y divide-slate-100 text-xs">
              {/* Vertical Today Indicator Marker */}
              {todayPositionPercent !== null && (
                <div
                  className="absolute top-0 bottom-0 z-20 pointer-events-none"
                  style={{ left: `${todayPositionPercent}%` }}
                >
                  <div className="w-0.5 h-full bg-purple-500/80 shadow-xs relative">
                    <div className="absolute -top-3 -left-3.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-600 text-white shadow-xs">
                      Today
                    </div>
                  </div>
                </div>
              )}

              {/* Background Grid Lines matching the weekly columns */}
              <div 
                className="absolute inset-0 grid divide-x divide-slate-100/80 pointer-events-none"
                style={{ gridTemplateColumns: `repeat(${weekColumns.length}, minmax(130px, 1fr))` }}
              >
                {weekColumns.map((col) => (
                  <div key={`bg-${col.id}`} className={col.isActive ? 'bg-purple-50/15' : ''} />
                ))}
              </div>

              {/* Scheduled Sprint Rows on Timeline */}
              {scheduledSprints.map((sprint) => {
                const sStart = new Date(sprint.start_date).getTime();
                const sEnd = new Date(sprint.end_date).getTime();
                const leftPercent = Math.max(0, Math.min(95, ((sStart - timelineStartMs) / totalDurationMs) * 100));
                const calculatedWidth = Math.max(8, ((Math.max(sEnd, sStart + 86400000) - sStart) / totalDurationMs) * 100);
                const widthPercent = Math.min(100 - leftPercent, calculatedWidth);

                const startFormatted = new Date(sprint.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const endFormatted = new Date(sprint.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const dateDisplay = `${startFormatted} – ${endFormatted}`;

                const isActive = sprint.status === 'ACTIVE';
                const isCompleted = sprint.status === 'COMPLETED';
                const overlaps = getSprintOverlaps(sprint);

                return (
                  <div 
                    key={sprint.id} 
                    className="relative py-4 px-2 hover:bg-slate-50/40 transition-colors group min-h-[64px] flex items-center"
                  >
                    {/* Horizontal Violet Sprint Bar */}
                    <div
                      onClick={() => setSelectedSprintDetails(sprint)}
                      title={`${sprint.name} (${dateDisplay}) • Click to view sprint details`}
                      style={{
                        marginLeft: `${Math.min(leftPercent, 75)}%`,
                        width: `${Math.max(widthPercent, 18)}%`,
                        minWidth: '260px',
                      }}
                      className={`relative z-10 cursor-pointer h-10 rounded-xl px-2.5 flex items-center justify-between shadow-xs transition-all duration-200 border border-purple-400/30 overflow-hidden group/bar select-none ${
                        isActive
                          ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-200/50 shadow-md ring-2 ring-purple-300'
                          : isCompleted
                          ? 'bg-purple-900/80 hover:bg-purple-900 text-purple-100'
                          : 'bg-purple-500 hover:bg-purple-600 text-white'
                      }`}
                    >
                      {/* Sprint Name directly inside bar - Guaranteed visible */}
                      <div className="flex items-center gap-1.5 shrink-0 min-w-0 pr-1 max-w-[130px]">
                        {isActive && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                        )}
                        <span className="font-bold text-xs truncate tracking-tight text-white">
                          {sprint.name}
                        </span>
                      </div>

                      {/* Right Date / Actions inside bar */}
                      <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                        {overlaps.length > 0 && (
                          <span
                            title={`Dates overlap with ${overlaps.map((o) => `"${o.name}"`).join(', ')}`}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-400/25 text-amber-100 font-semibold text-[9px] border border-amber-300/30 shrink-0"
                          >
                            <Clock className="w-2.5 h-2.5 shrink-0" />
                            {calculatedWidth >= 28 && <span>Overlaps</span>}
                          </span>
                        )}

                        <span className="font-medium text-white/90 truncate shrink-0 text-[10px]">
                          {dateDisplay}
                        </span>

                        <div className="flex items-center gap-1 shrink-0 ml-1">
                          {/* Edit Sprint Icon Button (Hidden when readOnly) */}
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingSprint(sprint);
                              }}
                              title={`Edit ${sprint.name}`}
                              className="p-1 rounded-md bg-black/15 hover:bg-black/30 active:bg-black/40 text-white transition-all cursor-pointer shrink-0"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Open Sprint Board Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenSprintBoard?.(sprint.id);
                            }}
                            title={`Open ${sprint.name} board`}
                            className="p-1 rounded-md bg-black/15 hover:bg-black/30 active:bg-black/40 text-white transition-all cursor-pointer shrink-0"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Timeline Empty State */}
              {scheduledSprints.length === 0 && (
                <div className="p-14 text-center text-slate-400">
                  <Calendar className="w-10 h-10 text-purple-300 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-800">
                    {sprints.length === 0
                      ? 'No Sprints Created Yet'
                      : filteredSprints.length === 0
                      ? 'No Sprints Match Current Selection'
                      : 'No Sprints Scheduled on Timeline'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    {sprints.length === 0
                      ? 'Plan and schedule iterations to establish your sprint-based timeline roadmap.'
                      : filteredSprints.length === 0
                      ? 'Adjust or clear your search and filters to view scheduled sprints.'
                      : 'Sprints exist in this project, but do not have dates configured. Use the Unscheduled Sprints section below to set sprint dates.'}
                  </p>
                  {sprints.length === 0 && (
                    <button
                      type="button"
                      onClick={() => setIsCreateSprintOpen(true)}
                      className="mt-4 px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Create Your First Sprint</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------
          SECTION 4: UNSCHEDULED SPRINTS TRAY / SECTION
          Displays all sprints from the database that do not have dates configured.
          Clicking "Set Dates" opens the Edit Sprint modal to persist dates to PostgreSQL.
          ------------------------------------------------------------- */}
      {unscheduledSprints.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Unscheduled Sprints
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200/80">
                {unscheduledSprints.length} {unscheduledSprints.length === 1 ? 'sprint' : 'sprints'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Dates not set. Configure start and end dates to place them on the timeline roadmap.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {unscheduledSprints.map((sprint) => {
              return (
                <div
                  key={sprint.id}
                  className="p-3.5 rounded-xl border border-dashed border-slate-300 hover:border-purple-400 bg-slate-50/60 hover:bg-purple-50/20 transition-all flex flex-col justify-between gap-3 group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900 truncate">
                          {sprint.name}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-200/70 text-slate-600">
                          {sprint.status || 'Planned'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-1">
                        {sprint.goal || 'No goal set'}
                      </p>
                    </div>

                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-md shrink-0">
                      <Calendar className="w-3 h-3 text-amber-600" />
                      <span>Dates not set</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                    <button
                      type="button"
                      onClick={() => onOpenSprintBoard?.(sprint.id)}
                      className="text-xs font-semibold text-slate-500 hover:text-purple-700 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span>Open Board</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>

                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => setEditingSprint(sprint)}
                        className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Set Dates</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          SECTION 4: CREATE SPRINT MODAL
          ------------------------------------------------------------- */}
      <CreateSprintModal
        isOpen={isCreateSprintOpen}
        onClose={() => setIsCreateSprintOpen(false)}
        projectId={projectId}
        projectName={project?.name || ''}
        existingSprints={sprints}
        onSuccess={(created) => {
          onToast?.(`Sprint "${created?.name || 'New Sprint'}" created successfully`);
          loadData();
        }}
      />

      {/* -------------------------------------------------------------
          SECTION 5: SPRINT DETAILS MODAL
          ------------------------------------------------------------- */}
      <SprintDetailsModal
        isOpen={Boolean(selectedSprintDetails)}
        onClose={() => setSelectedSprintDetails(null)}
        sprint={selectedSprintDetails}
        allSprints={sprints}
        onEdit={(sprintToEdit) => {
          setSelectedSprintDetails(null);
          setEditingSprint(sprintToEdit);
        }}
        onOpenSprintBoard={(sprintId) => {
          setSelectedSprintDetails(null);
          onOpenSprintBoard?.(sprintId);
        }}
      />

      {/* -------------------------------------------------------------
          SECTION 6: EDIT SPRINT MODAL
          ------------------------------------------------------------- */}
      <EditSprintModal
        isOpen={Boolean(editingSprint)}
        onClose={() => setEditingSprint(null)}
        projectId={projectId}
        projectName={project?.name || ''}
        sprint={editingSprint}
        allSprints={sprints}
        onSuccess={(updated) => {
          onToast?.(`Sprint "${updated?.name || 'Sprint'}" updated successfully`);
          loadData();
        }}
        onDelete={(deleted) => {
          onToast?.(`Sprint "${deleted?.name || 'Sprint'}" deleted successfully`);
          loadData();
        }}
      />
    </div>
  );
}
