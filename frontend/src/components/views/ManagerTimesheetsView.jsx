import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  X
} from 'lucide-react';
import { timesheetService } from '../../services/timesheet.service';
import { projectsService } from '../../services/projects.service';
import { cohortsService } from '../../services/cohorts.service';
import TimesheetView from './TimesheetView';

const formatMinutes = (minutes = 0) => {
  const mins = Number(minutes) || 0;
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  if (hours === 0 && remainder === 0) return '0h 0m';
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
};

export default function ManagerTimesheetsView({ onToast, cohorts: propCohorts = [], selectedCohortId: propCohortId = null }) {
  // Navigation / Selection State
  const [selectedIntern, setSelectedIntern] = useState(null);

  // Filters State
  const [search, setSearch] = useState('');
  const [selectedCohort, setSelectedCohort] = useState('ALL');
  const [selectedProject, setSelectedProject] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [page, setPage] = useState(1);
  const limit = 50;

  // Metadata Dropdowns
  const [cohorts, setCohorts] = useState(propCohorts);
  const [projects, setProjects] = useState([]);
  const [loadingMetadata, setLoadingMetadata] = useState(false);

  // Directory Data State
  const [reviewData, setReviewData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Sync propCohorts if passed
  useEffect(() => {
    if (propCohorts && propCohorts.length > 0) {
      setCohorts(propCohorts);
    }
  }, [propCohorts]);

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
    try {
      setLoading(true);
      setError('');

      const response = await timesheetService.getManagerReview({
        date: selectedDate.toISOString(),
        search: search.trim() || undefined,
        cohort_id: selectedCohort !== 'ALL' ? selectedCohort : undefined,
        project_id: selectedProject !== 'ALL' ? selectedProject : undefined,
        page,
        limit,
      });

      setReviewData(response || null);
    } catch (err) {
      console.error('Failed to load timesheet review:', err);
      setError(err?.message || 'Unable to load intern timesheets directory. Please check your permissions.');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, search, selectedCohort, selectedProject, page]);

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

  // Reset all filters
  const handleClearFilters = () => {
    setSearch('');
    setSelectedCohort('ALL');
    setSelectedProject('ALL');
    setSelectedDate(new Date());
    setPage(1);
    onToast?.('Timesheet filters reset to defaults');
  };

  const isFiltered = Boolean(
    search.trim() || 
    selectedCohort !== 'ALL' || 
    selectedProject !== 'ALL'
  );

  // Formatted date period title
  const weekRangeTitle = useMemo(() => {
    if (!reviewData?.period?.start_date || !reviewData?.period?.end_date) {
      return 'Selected Week';
    }
    const s = new Date(reviewData.period.start_date);
    const e = new Date(reviewData.period.end_date);
    const sMonth = s.toLocaleDateString('en-US', { month: 'short' });
    const eMonth = e.toLocaleDateString('en-US', { month: 'short' });
    if (sMonth === eMonth) {
      return `${sMonth} ${s.getUTCDate()} – ${e.getUTCDate()}, ${s.getUTCFullYear()}`;
    }
    return `${sMonth} ${s.getUTCDate()} – ${eMonth} ${e.getUTCDate()}, ${s.getUTCFullYear()}`;
  }, [reviewData?.period?.start_date, reviewData?.period?.end_date]);

  // If an intern is selected, render their full read-only timesheet
  if (selectedIntern) {
    return (
      <TimesheetView
        targetUserId={selectedIntern.id}
        readOnly={true}
        internInfo={selectedIntern}
        onBack={() => setSelectedIntern(null)}
        onToast={onToast}
      />
    );
  }

  const internsList = reviewData?.interns || [];
  const summary = reviewData?.summary || {
    total_interns: 0,
    active_interns: 0,
    total_logged_hours: 0,
    avg_logged_minutes_per_active: 0,
  };

  return (
    <div className="space-y-5 text-xs text-slate-800">
      {/* 1. TOP HEADER & METRICS */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-purple-100 text-purple-700">
              <Clock className="w-4 h-4" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">
              Management & Oversight
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Intern Timesheets Review
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Search, filter, and review weekly timesheets and work distribution across your cohorts
          </p>
        </div>

        {/* Week Selector */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-slate-700">
            <button
              type="button"
              onClick={handlePrevWeek}
              className="p-1.5 rounded-lg hover:bg-white hover:text-slate-900 transition-colors cursor-pointer"
              title="Previous Week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-3 py-1 text-xs font-bold text-slate-800 whitespace-nowrap">
              {weekRangeTitle}
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
            className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-purple-50 hover:text-purple-700 border border-slate-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            This Week
          </button>

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

      {/* 2. KPI SUMMARY CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold">
            <span>Total Interns</span>
            <Users className="w-4 h-4 text-purple-600" />
          </div>
          <div className="mt-1 text-2xl font-extrabold text-slate-900">
            {summary.total_interns}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">In current filter scope</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold">
            <span>Active Contributors</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-1 text-2xl font-extrabold text-emerald-600">
            {summary.active_interns}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Logged hours this week</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold">
            <span>Total Logged Time</span>
            <Clock className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-1 text-2xl font-extrabold text-indigo-900">
            {summary.total_logged_hours}h
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Team combined effort</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold">
            <span>Avg Active Hours</span>
            <Calendar className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-1 text-2xl font-extrabold text-slate-900">
            {formatMinutes(summary.avg_logged_minutes_per_active)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Per active intern</div>
        </div>
      </div>

      {/* 3. SEARCH & FILTERS BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
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
                  setPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Cohort Dropdown */}
          <div className="w-full md:w-56">
            <select
              value={selectedCohort}
              onChange={(e) => {
                setSelectedCohort(e.target.value);
                setPage(1);
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

          {/* Project Dropdown */}
          <div className="w-full md:w-56">
            <select
              value={selectedProject}
              onChange={(e) => {
                setSelectedProject(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:border-purple-600 cursor-pointer"
            >
              <option value="ALL">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
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
                <th className="py-3.5 px-3">Weekly Total</th>
                <th className="py-3.5 px-3">Tasks</th>
                <th className="py-3.5 px-3">Daily Breakdown (Mon–Sun)</th>
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
              ) : internsList.length === 0 ? (
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
                internsList.map((intern) => {
                  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                    intern.name
                  )}&background=7C3AED&color=fff&size=64`;
                  const hasHours = intern.total_minutes > 0;

                  return (
                    <tr
                      key={intern.id}
                      className="hover:bg-purple-50/30 transition-colors group cursor-pointer"
                      onClick={() => setSelectedIntern(intern)}
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

                      {/* Daily Breakdown Pills */}
                      <td className="py-3.5 px-3">
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
                      </td>

                      {/* View Action */}
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setSelectedIntern(intern)}
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
              {reviewData.pagination.total} total interns)
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

