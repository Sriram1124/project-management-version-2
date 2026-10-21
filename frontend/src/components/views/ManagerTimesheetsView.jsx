import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Clock,
  Search,
  Filter,
  Calendar,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  RefreshCw,
  Eye,
  Users,
  CheckCircle2,
  FolderKanban,
  AlertCircle,
  X,
  Check,
  MessageSquare,
  Sparkles
} from 'lucide-react';
import { timesheetService } from '../../services/timesheet.service';
import { projectsService } from '../../services/projects.service';
import { cohortsService } from '../../services/cohorts.service';
import TimesheetView from './TimesheetView';
import { getCalendarWeekRange, getCalendarMonthRange, toLocalDateString, formatMinutes } from '../../utils/dateUtils';

export default function ManagerTimesheetsView({
  onToast,
  cohorts: propCohorts = [],
  selectedCohortId: propCohortId = null,
  onSelectCohort = null,
}) {
  // Navigation / Selection State
  const [selectedIntern, setSelectedIntern] = useState(null);

  // Period / View Mode State: 'WEEK' | 'MONTH' | 'ALL_TIME'
  const [period, setPeriod] = useState('WEEK');

  // Filters State
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCohort, setSelectedCohort] = useState(() => propCohortId || 'ALL');
  const [selectedProject, setSelectedProject] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [page, setPage] = useState(1);
  const limit = 100;

  // Metadata Dropdowns
  const [cohorts, setCohorts] = useState(propCohorts);
  const [projects, setProjects] = useState([]);
  const [loadingMetadata, setLoadingMetadata] = useState(false);

  // Directory Data State
  const [reviewData, setReviewData] = useState(null);
  // Authoritative cohort summary state (independent of search filter)
  const [cohortSummary, setCohortSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Request sequence ref to prevent stale response overwrite
  const requestSeqRef = useRef(0);

  // Debounce search query so fast keystrokes don't spam requests or cause flickering
  useEffect(() => {
    if (!search.trim()) {
      setDebouncedSearch('');
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Sync propCohorts if passed
  useEffect(() => {
    if (propCohorts && propCohorts.length > 0) {
      setCohorts(propCohorts);
    }
  }, [propCohorts]);

  // Synchronize selectedCohort when propCohortId changes
  useEffect(() => {
    if (propCohortId && propCohortId !== selectedCohort) {
      setSelectedCohort(propCohortId);
      setPage(1);
      setSelectedIntern(null);
    }
  }, [propCohortId]);

  // Load cohorts and projects for filters
  useEffect(() => {
    let isMounted = true;
    setLoadingMetadata(true);

    Promise.all([
      cohortsService.getCohorts().catch(() => []),
      projectsService.getProjects().catch(() => []),
    ])
      .then(([cohortsRes, projectsRes]) => {
        if (!isMounted) return;
        if (Array.isArray(cohortsRes) && cohortsRes.length > 0) {
          setCohorts(cohortsRes);
        }
        const projs = Array.isArray(projectsRes) 
          ? projectsRes 
          : (projectsRes?.projects || projectsRes?.data || []);
        setProjects(projs);
      })
      .catch((err) => {
        console.error('Failed to load filter metadata:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingMetadata(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch Intern Timesheets Directory
  const loadReviewDirectory = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    try {
      setLoading(true);
      setError('');

      const response = await timesheetService.getManagerReview({
        period,
        date: selectedDate.toISOString(),
        search: debouncedSearch.trim() || undefined,
        cohort_id: selectedCohort !== 'ALL' ? selectedCohort : undefined,
        project_id: selectedProject !== 'ALL' ? selectedProject : undefined,
        page,
        limit,
      });

      if (seq !== requestSeqRef.current) return;
      if (response?.summary) {
        setCohortSummary(response.summary);
      }
      setReviewData(response || null);
    } catch (err) {
      if (seq !== requestSeqRef.current) return;

      console.warn('Timesheet review endpoint unavailable, attempting fallback via users directory:', err);

      // Fallback if /review route is not deployed on the backend yet
      if (err?.message?.includes('Route not found') || err?.message?.includes('404') || err?.status === 404) {
        try {
          const usersRes = await projectsService.getUsers({
            cohort_id: selectedCohort !== 'ALL' ? selectedCohort : undefined,
          });
          if (seq !== requestSeqRef.current) return;
          const rawUsers = Array.isArray(usersRes) ? usersRes : (usersRes?.users || []);
          const q = debouncedSearch.trim().toLowerCase();

          // Compute week date strings
          const startOfWeek = new Date(selectedDate);
          startOfWeek.setUTCHours(0, 0, 0, 0);
          const day = startOfWeek.getUTCDay();
          const diffToMonday = (day + 6) % 7;
          startOfWeek.setUTCDate(startOfWeek.getUTCDate() - diffToMonday);

          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
          endOfWeek.setUTCHours(23, 59, 59, 999);

          const dayDateStrings = [];
          const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
          for (let i = 0; i < 7; i++) {
            const cur = new Date(startOfWeek);
            cur.setUTCDate(startOfWeek.getUTCDate() + i);
            dayDateStrings.push(cur.toISOString().slice(0, 10));
          }

          // Authoritative cohort users (independent of search query)
          const cohortUsers = rawUsers
            .filter((u) => u.type === 'INTERN' || !u.type || u.type === 'EMPLOYEE')
            .filter((u) => {
              if (selectedCohort !== 'ALL') {
                const matchCohort =
                  u.cohort_id === selectedCohort ||
                  u.cohort?.id === selectedCohort ||
                  u.cohort?.code === selectedCohort ||
                  u.cohort?.name === selectedCohort;
                if (!matchCohort) return false;
              }
              return true;
            });

          // Table filtered by search query
          const filtered = cohortUsers
            .filter((u) => {
              if (!q) return true;
              return (
                u.name?.toLowerCase().includes(q) ||
                u.email?.toLowerCase().includes(q) ||
                u.user_code?.toLowerCase().includes(q)
              );
            })
            .map((u) => ({
              id: u.id,
              name: u.name,
              email: u.email,
              user_code: u.user_code,
              batch: u.batch,
              subbatch: u.subbatch,
              cohort: u.cohort,
              total_minutes: 0,
              total_hours: 0,
              total_formatted: '0h 0m',
              task_count: 0,
              daily_breakdown: dayDateStrings.map((d, idx) => ({
                date: d,
                dayName: dayNames[idx],
                minutes: 0,
                hours: 0,
                formatted: '—',
              })),
              weekly_breakdown: (monthInfo.weeks || []).map((w, idx) => ({
                weekNumber: idx + 1,
                label: `W${idx + 1}`,
                fullLabel: w.periodTitle || `Week ${idx + 1}`,
                minutes: 0,
                hours: 0,
                formatted: '—',
              })),
            }));

          const fallbackSummary = {
            total_interns: cohortUsers.length,
            active_interns: 0,
            total_logged_minutes: 0,
            total_logged_hours: 0,
            avg_logged_minutes_per_active: 0,
          };

          setCohortSummary(fallbackSummary);
          setReviewData({
            period: {
              start_date: startOfWeek.toISOString().slice(0, 10),
              end_date: endOfWeek.toISOString().slice(0, 10),
              day_dates: dayDateStrings,
            },
            summary: fallbackSummary,
            pagination: {
              total: filtered.length,
              page: 1,
              limit,
              totalPages: Math.ceil(filtered.length / limit) || 1,
            },
            interns: filtered,
          });
          setError('');
          return;
        } catch (fallbackErr) {
          console.error('Fallback users fetch also failed:', fallbackErr);
        }
      }

      setError(err?.message || 'Unable to load intern timesheets directory. Please check your permissions.');
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [period, selectedDate, debouncedSearch, selectedCohort, selectedProject, page, limit]);

  useEffect(() => {
    loadReviewDirectory();
  }, [loadReviewDirectory]);

  // Week Navigation handlers
  const handlePrevWeek = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() - 7);
    setSelectedDate(next);
    setPage(1);
  };

  const handleNextWeek = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 7);
    setSelectedDate(next);
    setPage(1);
  };

  const handleCurrentWeek = () => {
    setSelectedDate(new Date());
    setPage(1);
  };

  // Month Navigation handlers
  const handlePrevMonth = () => {
    const next = new Date(selectedDate);
    next.setDate(1);
    next.setMonth(next.getMonth() - 1);
    setSelectedDate(next);
    setPage(1);
  };

  const handleNextMonth = () => {
    const next = new Date(selectedDate);
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    setSelectedDate(next);
    setPage(1);
  };

  const handleCurrentMonth = () => {
    setSelectedDate(new Date());
    setPage(1);
  };

  // Reset all filters (restores active cohort)
  const handleClearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setSelectedCohort(propCohortId || 'ALL');
    setSelectedProject('ALL');
    setSelectedDate(new Date());
    setPeriod('WEEK');
    setPage(1);
    onToast?.('Timesheet filters reset to defaults');
  };

  const isFiltered = Boolean(
    search.trim() || 
    (propCohortId ? selectedCohort !== propCohortId : selectedCohort !== 'ALL') || 
    selectedProject !== 'ALL' ||
    period !== 'WEEK'
  );

  // Authoritative date period calculations
  const weekInfo = useMemo(() => getCalendarWeekRange(selectedDate), [selectedDate]);
  const monthInfo = useMemo(() => getCalendarMonthRange(selectedDate), [selectedDate]);

  // Immediate client-side filtering on current intern list for responsive searching
  const filteredInterns = useMemo(() => {
    const list = reviewData?.interns || [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((intern) => {
      return (
        intern.name?.toLowerCase().includes(q) ||
        intern.email?.toLowerCase().includes(q) ||
        intern.user_code?.toLowerCase().includes(q)
      );
    });
  }, [reviewData?.interns, search]);

  const summary = cohortSummary || reviewData?.summary || {
    total_interns: 0,
    active_interns: 0,
    total_logged_hours: 0,
    avg_logged_minutes_per_active: 0,
  };

  // If an intern is selected, render their full read-only timesheet
  if (selectedIntern) {
    return (
      <TimesheetView
        targetUserId={selectedIntern.id}
        readOnly={true}
        internInfo={selectedIntern}
        initialDate={selectedDate}
        initialViewMode={period === 'MONTH' ? 'MONTH' : 'WEEK'}
        onDateChange={(d) => setSelectedDate(d)}
        onBack={() => setSelectedIntern(null)}
        onToast={onToast}
      />
    );
  }

  return (
    <div className="space-y-6 text-xs text-slate-800">
      {/* 1. TOP HEADER & METRICS */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-purple-100 text-purple-700">
              <Clock className="w-4 h-4" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">
              Management & Oversight
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-1.5">
            Intern Timesheets Review
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Search, filter, and review {period === 'WEEK' ? 'weekly' : period === 'MONTH' ? 'monthly' : 'all-time'} timesheets and work distribution across your cohorts
          </p>
        </div>

        {/* Period Selector & Navigation Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 self-start md:self-auto">
          {/* Period Mode Selector Tabs */}
          <div className="flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setPeriod('WEEK');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                period === 'WEEK'
                  ? 'bg-white text-purple-700 font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              This Week
            </button>
            <button
              type="button"
              onClick={() => {
                setPeriod('MONTH');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                period === 'MONTH'
                  ? 'bg-white text-purple-700 font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => {
                setPeriod('ALL_TIME');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                period === 'ALL_TIME'
                  ? 'bg-white text-purple-700 font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Time
            </button>
          </div>

          {/* Stepper & Date Controls */}
          <div className="flex items-center gap-2">
            {period === 'WEEK' && (
              <>
                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-slate-700">
                  <button
                    type="button"
                    onClick={handlePrevWeek}
                    className="p-1.5 rounded-lg hover:bg-white hover:text-slate-900 transition-colors cursor-pointer"
                    title="Previous Week"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="px-3 py-1 text-xs font-bold text-slate-800 whitespace-nowrap min-w-[130px] text-center">
                    {weekInfo.formattedRange}
                  </div>
                  <button
                    type="button"
                    onClick={handleNextWeek}
                    className="p-1.5 rounded-lg hover:bg-white hover:text-slate-900 transition-colors cursor-pointer"
                    title="Next Week"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleCurrentWeek}
                  className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-colors cursor-pointer whitespace-nowrap ${
                    weekInfo.isCurrentWeek
                      ? 'bg-purple-100 text-purple-800 border-purple-300 font-bold'
                      : 'bg-slate-100 hover:bg-purple-50 hover:text-purple-700 border-slate-200 text-slate-700'
                  }`}
                >
                  This Week
                </button>
              </>
            )}

            {period === 'MONTH' && (
              <>
                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-slate-700">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="p-1.5 rounded-lg hover:bg-white hover:text-slate-900 transition-colors cursor-pointer"
                    title="Previous Month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="px-3 py-1 text-xs font-bold text-slate-800 whitespace-nowrap min-w-[130px] text-center">
                    {monthInfo.monthName}
                  </div>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="p-1.5 rounded-lg hover:bg-white hover:text-slate-900 transition-colors cursor-pointer"
                    title="Next Month"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleCurrentMonth}
                  className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-colors cursor-pointer whitespace-nowrap ${
                    monthInfo.isCurrentMonth
                      ? 'bg-purple-100 text-purple-800 border-purple-300 font-bold'
                      : 'bg-slate-100 hover:bg-purple-50 hover:text-purple-700 border-slate-200 text-slate-700'
                  }`}
                >
                  This Month
                </button>
              </>
            )}

            {period === 'ALL_TIME' && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-50 border border-purple-200 text-purple-800 text-xs font-bold whitespace-nowrap">
                <Calendar className="w-3.5 h-3.5 text-purple-600" />
                <span>All-Time Records</span>
              </div>
            )}

            <button
              type="button"
              onClick={loadReviewDirectory}
              disabled={loading}
              className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>



      {/* 2. KPI SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between min-h-[115px]">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Total Interns</span>
            <span className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {summary.total_interns}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">In selected cohort</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between min-h-[115px]">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Active Contributors</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-extrabold text-emerald-600 tracking-tight">
              {summary.active_interns}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {period === 'WEEK'
                ? 'Logged hours this week'
                : period === 'MONTH'
                ? 'Logged hours this month'
                : 'Logged hours all time'}
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between min-h-[115px]">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Total Logged Time</span>
            <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-extrabold text-indigo-900 tracking-tight">
              {summary.total_logged_hours}h
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Team combined effort</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between min-h-[115px]">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Avg Active Hours</span>
            <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
              <Calendar className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {formatMinutes(summary.avg_logged_minutes_per_active)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Per active intern</div>
          </div>
        </div>
      </div>

      {/* 3. SEARCH & FILTERS BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by intern name, email, or code..."
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600 transition-all placeholder:text-slate-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setDebouncedSearch('');
                  setPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Cohort Dropdown */}
          <div className="w-full md:w-64">
            <select
              value={selectedCohort}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedCohort(val);
                setPage(1);
                if (val !== 'ALL' && onSelectCohort) {
                  onSelectCohort(val);
                }
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:border-purple-600 cursor-pointer"
            >
              <option value="ALL">All Cohorts</option>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>

          {/* Clear Filters Button */}
          {isFiltered && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 font-semibold transition-colors cursor-pointer shrink-0"
              title="Reset search and filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. ERROR STATE */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="font-medium">{error}</span>
          </div>
          <button
            type="button"
            onClick={loadReviewDirectory}
            className="px-3 py-1 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* 5. INTERN DIRECTORY TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/90 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                <th className="py-3.5 px-4">Intern</th>
                <th className="py-3.5 px-3">Cohort</th>
                <th className="py-3.5 px-3">
                  {period === 'WEEK'
                    ? 'Weekly Total'
                    : period === 'MONTH'
                    ? 'Monthly Total'
                    : 'All-Time Total'}
                </th>
                <th className="py-3.5 px-3">Tasks</th>
                <th className="py-3.5 px-3">
                  {period === 'WEEK'
                    ? 'Daily Breakdown (Mon–Sun)'
                    : period === 'MONTH'
                    ? 'Weekly Breakdown'
                    : 'Activity Overview'}
                </th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                // Loading Skeleton
                Array.from({ length: 6 }).map((_, idx) => (
                  <tr key={`skel-${idx}`} className="animate-pulse">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-200 shrink-0" />
                        <div className="space-y-1.5">
                          <div className="h-3 w-32 bg-slate-200 rounded" />
                          <div className="h-2.5 w-44 bg-slate-100 rounded" />
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="h-4 w-16 bg-slate-200 rounded-full" />
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="h-4 w-14 bg-slate-200 rounded" />
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="h-3 w-10 bg-slate-200 rounded" />
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="h-5 w-48 bg-slate-200 rounded" />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="h-7 w-24 bg-slate-200 rounded-lg ml-auto" />
                    </td>
                  </tr>
                ))
              ) : filteredInterns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <div className="max-w-sm mx-auto space-y-2">
                      <Clock className="w-10 h-10 mx-auto text-slate-300 stroke-[1.5]" />
                      <p className="font-semibold text-slate-700">
                        No interns found matching the criteria
                      </p>
                      <p className="text-slate-400 text-xs">
                        {isFiltered
                          ? 'Try adjusting your search query, cohort, or project filters.'
                          : 'No active interns registered for this organization.'}
                      </p>
                      {isFiltered && (
                        <button
                          type="button"
                          onClick={handleClearFilters}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 font-semibold hover:bg-purple-100 transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Clear Filters</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredInterns.map((intern) => {
                  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                    intern.name
                  )}&background=7C3AED&color=fff&size=64`;
                  const hasHours = intern.total_minutes > 0;

                  return (
                    <tr
                      key={intern.id}
                      role="button"
                      tabIndex={0}
                      className="hover:bg-purple-50/30 transition-colors group cursor-pointer"
                      onClick={() => setSelectedIntern(intern)}
                      onKeyDown={(e) => {
                        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          setSelectedIntern(intern);
                        }
                      }}
                    >
                      {/* Intern Info */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={avatarUrl}
                            alt={intern.name}
                            className="w-8 h-8 rounded-full object-cover border border-purple-200/80 shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 group-hover:text-purple-700 transition-colors truncate">
                                {intern.name}
                              </span>
                              {intern.user_code && (
                                <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200/80">
                                  {intern.user_code}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {intern.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Cohort */}
                      <td className="py-3.5 px-3">
                        {intern.cohort ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200/70">
                            {intern.cohort.name}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                        {intern.batch && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {intern.batch} {intern.subbatch || ''}
                          </div>
                        )}
                      </td>

                      {/* Logged Hours */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-mono text-xs font-extrabold ${
                              hasHours ? 'text-purple-700' : 'text-slate-400 font-normal'
                            }`}
                          >
                            {intern.total_formatted}
                          </span>
                          {hasHours && (
                            <span className="text-[10px] text-slate-400 font-normal">
                              ({intern.total_hours}h)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Tasks Worked */}
                      <td className="py-3.5 px-3">
                        <span
                          className={`text-xs ${
                            intern.task_count > 0
                              ? 'font-bold text-slate-800'
                              : 'text-slate-400'
                          }`}
                        >
                          {intern.task_count}{' '}
                          <span className="font-normal text-slate-500 text-[10px]">
                            {intern.task_count === 1 ? 'task' : 'tasks'}
                          </span>
                        </span>
                      </td>

                      {/* Period Breakdown Pills / Activity */}
                      <td className="py-3.5 px-3">
                        {period === 'WEEK' ? (
                          <div className="flex items-center gap-1">
                            {intern.daily_breakdown?.map((day) => {
                              const dayHasTime = day.minutes > 0;
                              return (
                                <div
                                  key={day.date}
                                  title={`${day.dayName} (${day.date}): ${day.formatted}`}
                                  className={`flex flex-col items-center justify-center px-1.5 py-0.5 rounded text-[10px] min-w-[28px] border ${
                                    dayHasTime
                                      ? 'bg-purple-100 text-purple-900 border-purple-300 font-bold'
                                      : 'bg-slate-50 text-slate-400 border-slate-200/60 font-normal'
                                  }`}
                                >
                                  <span className="text-[9px] uppercase tracking-tighter opacity-80">
                                    {day.dayName.slice(0, 1)}
                                  </span>
                                  <span className="font-mono text-[9px] leading-tight">
                                    {dayHasTime ? `${day.hours}h` : '0'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : period === 'MONTH' ? (
                          <div className="flex items-center gap-1">
                            {intern.weekly_breakdown?.map((wk) => {
                              const wkHasTime = wk.minutes > 0;
                              return (
                                <div
                                  key={wk.weekNumber}
                                  title={`${wk.fullLabel}: ${wk.formatted}`}
                                  className={`flex flex-col items-center justify-center px-2 py-0.5 rounded text-[10px] min-w-[32px] border ${
                                    wkHasTime
                                      ? 'bg-purple-100 text-purple-900 border-purple-300 font-bold'
                                      : 'bg-slate-50 text-slate-400 border-slate-200/60 font-normal'
                                  }`}
                                >
                                  <span className="text-[9px] font-semibold opacity-90">{wk.label}</span>
                                  <span className="font-mono text-[9px] leading-tight">
                                    {wkHasTime ? `${wk.hours}h` : '0'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              <Calendar className="w-3 h-3 text-slate-500" />
                              <span>{intern.active_days_count || 0} active days</span>
                            </span>
                            {intern.task_count > 0 && (
                              <span className="text-[10px] text-slate-400 font-medium">
                                across {intern.task_count} tasks
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* View Action */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedIntern(intern);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-purple-600 text-slate-700 hover:text-white font-semibold transition-all cursor-pointer shadow-2xs group-hover:bg-purple-600 group-hover:text-white"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Timesheet</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {reviewData?.pagination?.totalPages > 1 && (
          <div className="px-4 py-3 bg-slate-50/70 border-t border-slate-200 flex items-center justify-between text-slate-600 text-xs">
            <span>
              Showing Page {reviewData.pagination.page} of {reviewData.pagination.totalPages} (
              {search.trim() ? `${filteredInterns.length} matching` : `${reviewData.pagination.total} total`} interns)
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(reviewData.pagination.totalPages, p + 1))}
                disabled={page >= reviewData.pagination.totalPages}
                className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

