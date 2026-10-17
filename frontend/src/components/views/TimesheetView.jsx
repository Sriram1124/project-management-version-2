import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Clock,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Play,
  Square,
  Trash2,
  X,
  AlertCircle,
  CheckCircle2,
  Timer,
  Layers,
  CheckSquare,
  FileText,
  User,
  Info
} from 'lucide-react';
import { timesheetService } from '../../services/timesheet.service';
import { useAuth } from '../../context/AuthContext';

const formatMinutes = (minutes = 0) => {
  const mins = Number(minutes) || 0;
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  if (hours === 0 && remainder === 0) return '0h 0m';
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
};

const formatElapsed = (startedAt) => {
  if (!startedAt) return '00:00:00';
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const diffSecs = Math.max(0, Math.floor((now - start) / 1000));
  const hrs = Math.floor(diffSecs / 3600);
  const mins = Math.floor((diffSecs % 3600) / 60);
  const secs = diffSecs % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export default function TimesheetView({
  onToast,
  targetUserId = null,
  readOnly = false,
  onBack = null,
  internInfo = null,
}) {
  const { user: authUser } = useAuth();

  // Week navigation state
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [showWeekends, setShowWeekends] = useState(false); // Mon-Fri default

  // Timesheet data
  const [timesheet, setTimesheet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Active timer tracking
  const [activeSession, setActiveSession] = useState(null);
  const [elapsedText, setElapsedText] = useState('00:00:00');

  // Cell Details Drawer / Modal
  const [cellModalData, setCellModalData] = useState(null); // { task, date, dayObj, entries }
  const [cellFormHours, setCellFormHours] = useState('');
  const [cellFormMinutes, setCellFormMinutes] = useState('');
  const [cellFormNotes, setCellFormNotes] = useState('');

  // General Manual Log Modal
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [manualTaskId, setManualTaskId] = useState('');
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [manualHours, setManualHours] = useState('');
  const [manualMinutes, setManualMinutes] = useState('30');
  const [manualNotes, setManualNotes] = useState('');

  // Effective intern metadata (from prop or backend response)
  const currentIntern = internInfo || timesheet?.user || null;

  // Load timesheet for the selected week
  const loadTimesheet = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await timesheetService.getWeekly(targetUserId, selectedDate.toISOString());
      const data = response?.timesheet || null;
      setTimesheet(data);
      if (readOnly) {
        setActiveSession(null);
      } else if (data?.active_session) {
        setActiveSession(data.active_session);
      } else {
        // Also check directly for any active session
        try {
          const activeRes = await timesheetService.getActiveTaskSession();
          setActiveSession(activeRes?.session || null);
        } catch {
          setActiveSession(null);
        }
      }
    } catch (err) {
      console.error('Failed to load weekly timesheet:', err);
      setError(err?.message || 'Unable to load timesheet data. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, targetUserId, readOnly]);

  useEffect(() => {
    loadTimesheet();
  }, [loadTimesheet]);

  // Live timer interval
  useEffect(() => {
    if (!activeSession?.started_at) {
      setElapsedText('00:00:00');
      return;
    }
    const updateElapsed = () => {
      setElapsedText(formatElapsed(activeSession.started_at));
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  // Navigate weeks
  const handlePrevWeek = () => {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() - 7);
      return next;
    });
  };

  const handleNextWeek = () => {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + 7);
      return next;
    });
  };

  const handleCurrentWeek = () => {
    setSelectedDate(new Date());
  };

  // Start / Stop timer
  const handleStartTimer = async (taskId) => {
    try {
      setActionLoading(true);
      const res = await timesheetService.startSession({ task_id: taskId });
      setActiveSession(res?.session || null);
      onToast?.('Timer started successfully');
      await loadTimesheet();
    } catch (err) {
      onToast?.(err.message || 'Unable to start timer');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopTimer = async () => {
    try {
      setActionLoading(true);
      const res = await timesheetService.endSession();
      setActiveSession(null);
      const duration = res?.session?.time_entry?.duration_minutes || 0;
      onToast?.(`Timer stopped: ${formatMinutes(duration)} logged!`);
      await loadTimesheet();
    } catch (err) {
      onToast?.(err.message || 'Unable to stop timer');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Cell Drawer / Modal
  const handleOpenCell = (task, dateStr, dayObj) => {
    const taskDayData = task.days[dateStr] || { minutes: 0, entries: [] };
    setCellModalData({
      task,
      date: dateStr,
      dayObj,
      entries: taskDayData.entries || [],
      minutes: taskDayData.minutes || 0,
    });
    setCellFormHours('');
    setCellFormMinutes('30');
    setCellFormNotes('');
  };

  // Submit time entry inside Cell Modal
  const handleAddCellEntry = async (e) => {
    e.preventDefault();
    if (!cellModalData) return;
    const hours = parseInt(cellFormHours, 10) || 0;
    const minutes = parseInt(cellFormMinutes, 10) || 0;
    const totalMins = hours * 60 + minutes;

    if (totalMins <= 0) {
      alert('Please enter a duration greater than 0 minutes.');
      return;
    }

    try {
      setActionLoading(true);
      await timesheetService.createEntry({
        task_id: cellModalData.task.id,
        date: cellModalData.date,
        duration_minutes: totalMins,
        notes: cellFormNotes.trim() || null,
      });
      onToast?.(`Logged ${formatMinutes(totalMins)} on ${cellModalData.task.title}`);
      setCellModalData(null);
      await loadTimesheet();
    } catch (err) {
      alert(err.message || 'Failed to save time entry');
    } finally {
      setActionLoading(false);
    }
  };

  // Delete an entry from cell modal
  const handleDeleteEntry = async (entryId) => {
    if (!window.confirm('Are you sure you want to delete this time entry?')) return;
    try {
      setActionLoading(true);
      await timesheetService.deleteEntry(entryId);
      onToast?.('Time entry deleted');
      setCellModalData(null);
      await loadTimesheet();
    } catch (err) {
      onToast?.(err.message || 'Failed to delete time entry');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit General Manual Time Log Modal
  const handleManualLogSubmit = async (e) => {
    e.preventDefault();
    if (!manualTaskId) {
      alert('Please select a task.');
      return;
    }
    const hours = parseInt(manualHours, 10) || 0;
    const minutes = parseInt(manualMinutes, 10) || 0;
    const totalMins = hours * 60 + minutes;

    if (totalMins <= 0) {
      alert('Please enter a duration greater than 0 minutes.');
      return;
    }

    try {
      setActionLoading(true);
      await timesheetService.createEntry({
        task_id: manualTaskId,
        date: manualDate,
        duration_minutes: totalMins,
        notes: manualNotes.trim() || null,
      });
      onToast?.(`Time logged successfully: ${formatMinutes(totalMins)}`);
      setIsLogModalOpen(false);
      setManualHours('');
      setManualMinutes('30');
      setManualNotes('');
      await loadTimesheet();
    } catch (err) {
      alert(err.message || 'Failed to record time entry');
    } finally {
      setActionLoading(false);
    }
  };

  // Columns to display: Monday through Friday (default), or all 7 days if showWeekends is true
  const displayedDays = useMemo(() => {
    if (!timesheet?.days) return [];
    if (showWeekends) return timesheet.days;
    return timesheet.days.filter((d) => !d.isWeekend);
  }, [timesheet?.days, showWeekends]);

  // Formatted week title
  const weekRangeTitle = useMemo(() => {
    if (!timesheet?.start_date || !timesheet?.end_date) return 'Weekly Timesheet';
    const s = new Date(timesheet.start_date);
    const e = new Date(timesheet.end_date);
    const sMonth = s.toLocaleDateString('en-US', { month: 'short' });
    const eMonth = e.toLocaleDateString('en-US', { month: 'short' });
    if (sMonth === eMonth) {
      return `${sMonth} ${s.getUTCDate()} – ${e.getUTCDate()}, ${s.getUTCFullYear()}`;
    }
    return `${sMonth} ${s.getUTCDate()} – ${eMonth} ${e.getUTCDate()}, ${s.getUTCFullYear()}`;
  }, [timesheet?.start_date, timesheet?.end_date]);

  // Summary statistics
  const summaryStats = useMemo(() => {
    const totalMins = timesheet?.total_minutes || 0;
    const taskRows = timesheet?.task_rows || [];
    const activeTasksCount = taskRows.filter((r) => r.total_minutes > 0).length;
    const activeDaysCount = (displayedDays || []).filter((d) => d.total_minutes > 0).length;
    const avgDailyMins = activeDaysCount > 0 ? Math.round(totalMins / activeDaysCount) : 0;
    return {
      totalFormatted: formatMinutes(totalMins),
      activeTasksCount,
      activeDaysCount,
      avgDailyFormatted: formatMinutes(avgDailyMins),
    };
  }, [timesheet, displayedDays]);

  const taskRows = timesheet?.task_rows || [];
  const availableTasks = timesheet?.available_tasks || [];

  return (
    <div className="space-y-5 text-xs text-slate-800">
      {/* 1. TOP HEADER & WEEK CONTROLS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-700 hover:text-purple-900 mb-2.5 transition-colors cursor-pointer group"
            >
              <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
              <span>Back to Intern Timesheets Directory</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-purple-100 text-purple-700">
              <Calendar className="w-4 h-4" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">
              Time Tracking & Attendance
            </span>
            {readOnly && (
              <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded-full uppercase tracking-wider">
                Review Mode (Read-Only)
              </span>
            )}
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-1">
            {currentIntern ? `${currentIntern.name}'s Timesheet` : 'Weekly Timesheet'}
          </h1>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 mt-0.5">
            {currentIntern ? (
              <>
                <span className="text-slate-700 font-medium">{currentIntern.email}</span>
                {currentIntern.cohort?.name && (
                  <>
                    <span>•</span>
                    <span className="font-semibold text-purple-700 bg-purple-50 px-2 py-0.2 rounded border border-purple-200/60">
                      {currentIntern.cohort.name}
                    </span>
                  </>
                )}
                {currentIntern.batch && (
                  <>
                    <span>•</span>
                    <span>{currentIntern.batch} {currentIntern.subbatch || ''}</span>
                  </>
                )}
              </>
            ) : (
              <span>Log, track, and review real task effort across work days</span>
            )}
          </div>
        </div>

        {/* Action Buttons & Nav */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Week Nav Buttons */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-slate-700">
            <button
              type="button"
              onClick={handlePrevWeek}
              className="p-1 rounded-lg hover:bg-white hover:text-slate-900 transition-colors cursor-pointer"
              title="Previous Week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleCurrentWeek}
              className="px-2.5 py-0.5 font-semibold text-xs rounded-lg hover:bg-white hover:text-purple-700 transition-colors cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={handleNextWeek}
              className="p-1 rounded-lg hover:bg-white hover:text-slate-900 transition-colors cursor-pointer"
              title="Next Week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* 5-Day vs 7-Day Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setShowWeekends(false)}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                !showWeekends
                  ? 'bg-white text-purple-700 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mon–Fri
            </button>
            <button
              type="button"
              onClick={() => setShowWeekends(true)}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                showWeekends
                  ? 'bg-white text-purple-700 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              7 Days
            </button>
          </div>

          {/* Refresh */}
          <button
            type="button"
            onClick={loadTimesheet}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh Timesheet"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Log Time Button (Intern Only) */}
          {!readOnly && (
            <button
              type="button"
              onClick={() => {
                if (availableTasks.length > 0 && !manualTaskId) {
                  setManualTaskId(availableTasks[0].id);
                }
                setIsLogModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Time</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. ACTIVE RUNNING TIMER BANNER (Intern Only) */}
      {!readOnly && activeSession && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:px-5 bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 text-white rounded-2xl shadow-md border border-purple-700/50 animate-in fade-in duration-200">
          <div className="flex items-center gap-3 min-w-0">
            <span className="relative flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300">
                  Timer Active
                </span>
                {activeSession.task?.id && (
                  <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-purple-800/80 text-purple-200 border border-purple-600/40">
                    {activeSession.task.id.slice(0, 8)}
                  </span>
                )}
              </div>
              <p className="font-semibold text-sm text-white truncate mt-0.5">
                {activeSession.task?.title || 'Active Work Session'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
            <div className="font-mono text-lg sm:text-xl font-bold tracking-wider text-emerald-300 bg-purple-950/60 px-3 py-1 rounded-xl border border-purple-800/60 shadow-inner">
              {elapsedText}
            </div>
            <button
              type="button"
              onClick={handleStopTimer}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition-colors cursor-pointer shadow-sm disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop Timer</span>
            </button>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadTimesheet}
            className="px-2.5 py-1 bg-white border border-rose-300 rounded-lg text-xs font-semibold hover:bg-rose-100"
          >
            Retry
          </button>
        </div>
      )}

      {/* 3. WEEKLY SUMMARY STAT CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Week Period
          </span>
          <div className="text-sm sm:text-base font-bold text-slate-900 mt-1 truncate">
            {weekRangeTitle}
          </div>
          <span className="text-[11px] text-purple-600 font-semibold block mt-0.5">
            {showWeekends ? '7 calendar days' : 'Monday – Friday'}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Total Logged
          </span>
          <div className="text-xl sm:text-2xl font-extrabold text-purple-700 mt-1">
            {loading ? '...' : summaryStats.totalFormatted}
          </div>
          <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
            Recorded task effort
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Active Tasks
          </span>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
            {loading ? '...' : summaryStats.activeTasksCount}
          </div>
          <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
            Of {taskRows.length} assigned tasks
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Daily Average
          </span>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
            {loading ? '...' : summaryStats.avgDailyFormatted}
          </div>
          <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
            Across {summaryStats.activeDaysCount} active work days
          </span>
        </div>
      </div>

      {/* 4. WEEKLY MATRIX GRID TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900 text-sm">
              Work Items & Day Breakdown
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              ({taskRows.length} {taskRows.length === 1 ? 'task' : 'tasks'})
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              <span>Click any cell to inspect or add day logs</span>
            </span>
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-purple-600 mb-2" />
            <p className="text-xs font-semibold">Loading weekly timesheet...</p>
          </div>
        ) : taskRows.length === 0 ? (
          /* Empty State */
          <div className="p-12 text-center text-slate-500 max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">No Task Rows Found</h3>
              <p className="text-xs text-slate-400 mt-1">
                You have no assigned tasks or time entries recorded for this week. Use the &quot;Log Time&quot; button to manually log work or assign tasks to yourself.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsLogModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Time Manually</span>
            </button>
          </div>
        ) : (
          /* Table Matrix */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold text-[11px]">
                  {/* Task Header */}
                  <th className="py-3 px-4 min-w-[240px] max-w-[320px]">
                    Task & Deliverable
                  </th>

                  {/* Day Columns */}
                  {displayedDays.map((d) => (
                    <th
                      key={d.date}
                      className={`py-3 px-3 text-center min-w-[90px] ${
                        d.isToday ? 'bg-purple-50/70 text-purple-900 border-x border-purple-200/60' : ''
                      }`}
                    >
                      <span className="block uppercase text-[10px] tracking-wider text-slate-400">
                        {d.dayName}
                      </span>
                      <span className={`text-xs font-extrabold ${d.isToday ? 'text-purple-700' : 'text-slate-700'}`}>
                        {new Date(d.date).getUTCDate()}
                      </span>
                    </th>
                  ))}

                  {/* Task Total Header */}
                  <th className="py-3 px-4 text-right min-w-[100px] bg-slate-100/60 font-extrabold text-slate-800">
                    Total
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {taskRows.map((task) => {
                  const isThisTaskRunning = activeSession?.task_id === task.id;
                  return (
                    <tr
                      key={task.id}
                      className={`hover:bg-purple-50/30 transition-colors group ${
                        isThisTaskRunning ? 'bg-purple-50/50' : ''
                      }`}
                    >
                      {/* Task Info Cell */}
                      <td className="py-3 px-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {task.type && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200 uppercase">
                                  {task.type}
                                </span>
                              )}
                              {task.project?.name && (
                                <span className="text-[10px] text-slate-400 font-medium truncate max-w-[120px]">
                                  {task.project.name}
                                </span>
                              )}
                              {task.story_points > 0 && (
                                <span className="text-[10px] font-mono font-bold text-slate-500">
                                  · {task.story_points} SP
                                </span>
                              )}
                            </div>
                            <div className="font-semibold text-slate-900 mt-1 truncate group-hover:text-purple-900">
                              {task.title}
                            </div>
                          </div>

                          {/* Quick Timer Start / Stop on Row */}
                          <div className="shrink-0 self-center opacity-80 group-hover:opacity-100">
                            {isThisTaskRunning ? (
                              <button
                                type="button"
                                onClick={handleStopTimer}
                                disabled={actionLoading}
                                title="Stop Timer"
                                className="p-1 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer"
                              >
                                <Square className="w-3.5 h-3.5 fill-current" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleStartTimer(task.id)}
                                disabled={actionLoading || Boolean(activeSession)}
                                title={activeSession ? 'Stop active timer first' : 'Start Timer for this task'}
                                className="p-1 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors cursor-pointer disabled:opacity-30"
                              >
                                <Play className="w-3.5 h-3.5 fill-current" />
                              </button>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Day Cells */}
                      {displayedDays.map((d) => {
                        const cellData = task.days[d.date] || { minutes: 0, entries: [] };
                        const mins = cellData.minutes || 0;
                        const hasEntries = cellData.entries?.length > 0;
                        const isToday = d.isToday;

                        return (
                          <td
                            key={d.date}
                            onClick={() => handleOpenCell(task, d.date, d)}
                            className={`py-2 px-2 text-center cursor-pointer transition-colors relative group/cell ${
                              isToday ? 'bg-purple-50/30 hover:bg-purple-100/50' : 'hover:bg-slate-100/70'
                            }`}
                            title={`Click to view or add entries for ${task.title} on ${d.date}`}
                          >
                            {mins > 0 ? (
                              <div className="inline-flex flex-col items-center justify-center px-2 py-1 rounded-lg bg-purple-100/80 text-purple-900 font-mono font-bold text-xs border border-purple-200/80 hover:scale-105 transition-transform shadow-2xs">
                                <span>{formatMinutes(mins)}</span>
                                {hasEntries && (
                                  <span className="text-[9px] font-sans font-normal text-purple-600">
                                    {cellData.entries.length} {cellData.entries.length === 1 ? 'log' : 'logs'}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-300 font-mono text-xs group-hover/cell:hidden">
                                —
                              </span>
                            )}

                            {/* Hover Plus Quick Action */}
                            <span className="hidden group-hover/cell:inline-flex items-center justify-center p-1 rounded-md text-purple-600 hover:bg-purple-200/60 transition-colors">
                              <Plus className="w-3 h-3" />
                            </span>
                          </td>
                        );
                      })}

                      {/* Row Total */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 bg-slate-50/50">
                        {task.total_minutes > 0 ? (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                            {formatMinutes(task.total_minutes)}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* TABLE FOOTER: DAILY TOTALS & GRAND TOTAL */}
              <tfoot>
                <tr className="bg-slate-50/90 border-t-2 border-slate-200 text-slate-800 font-bold">
                  <td className="py-3.5 px-4 font-bold text-slate-700">
                    Daily Total
                  </td>

                  {displayedDays.map((d) => {
                    const dayTotal = timesheet?.daily_totals?.[d.date] || 0;
                    return (
                      <td
                        key={d.date}
                        className={`py-3.5 px-2 text-center font-mono font-extrabold ${
                          d.isToday ? 'bg-purple-100/60 text-purple-900' : 'text-slate-800'
                        }`}
                      >
                        {dayTotal > 0 ? formatMinutes(dayTotal) : '—'}
                      </td>
                    );
                  })}

                  <td className="py-3.5 px-4 text-right font-mono font-extrabold text-sm text-purple-700 bg-purple-100/50">
                    {timesheet?.total_formatted || '0h 0m'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* 5. CELL DETAIL & MANAGEMENT DRAWER / MODAL */}
      {cellModalData && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden text-xs flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/70">
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-purple-700 uppercase tracking-wider">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Time Logs for {cellModalData.date}</span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 truncate mt-0.5">
                  {cellModalData.task.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCellModalData(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              {/* Existing Entries List */}
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Recorded Entries ({cellModalData.entries.length})
                </h4>
                {cellModalData.entries.length === 0 ? (
                  <p className="text-slate-400 italic py-2">
                    No time entries recorded for this task on {cellModalData.date}.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {cellModalData.entries.map((entry) => (
                      <div
                        key={entry.id}
                        className="p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/60 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-extrabold text-slate-900">
                              {formatMinutes(entry.duration_minutes)}
                            </span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase ${
                                entry.source === 'TIMER'
                                  ? 'bg-purple-100 text-purple-800 border-purple-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {entry.source || 'MANUAL'}
                            </span>
                          </div>
                          {entry.notes && (
                            <p className="text-slate-600 mt-1 italic text-[11px]">
                              &quot;{entry.notes}&quot;
                            </p>
                          )}
                        </div>

                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => handleDeleteEntry(entry.id)}
                            disabled={actionLoading}
                            title="Delete entry"
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add New Entry Form (Intern Only) */}
              {!readOnly ? (
                <form onSubmit={handleAddCellEntry} className="pt-3 border-t border-slate-100 space-y-3">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                    + Add Time Entry
                  </h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Hours
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="24"
                        placeholder="0"
                        value={cellFormHours}
                        onChange={(e) => setCellFormHours(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:border-purple-600 text-slate-900 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Minutes
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        step="5"
                        placeholder="30"
                        value={cellFormMinutes}
                        onChange={(e) => setCellFormMinutes(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:border-purple-600 text-slate-900 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Notes (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={cellFormNotes}
                      onChange={(e) => setCellFormNotes(e.target.value)}
                      placeholder="What did you work on?"
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:border-purple-600 text-slate-900 resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setCellModalData(null)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold text-slate-600"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold transition-colors disabled:opacity-50"
                    >
                      {actionLoading ? 'Saving...' : 'Save Log'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="pt-3 border-t border-slate-100 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setCellModalData(null)}
                    className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 font-semibold text-slate-700 cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. GENERAL MANUAL TIME LOG MODAL (Intern Only) */}
      {!readOnly && isLogModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden text-xs">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded bg-purple-100 text-purple-700">
                  <Clock className="w-3.5 h-3.5" />
                </span>
                <h3 className="text-sm font-bold text-slate-900">
                  Log Task Time
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsLogModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleManualLogSubmit} className="p-5 space-y-4">
              {/* Task Selection */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Select Task *
                </label>
                {availableTasks.length > 0 ? (
                  <select
                    value={manualTaskId}
                    onChange={(e) => setManualTaskId(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:border-purple-600"
                  >
                    <option value="">-- Choose a task --</option>
                    {availableTasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} {t.project?.name ? `(${t.project.name})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={manualTaskId}
                    onChange={(e) => setManualTaskId(e.target.value)}
                    placeholder="Task ID"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:border-purple-600 font-mono"
                  />
                )}
              </div>

              {/* Date */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:border-purple-600"
                />
              </div>

              {/* Duration Hours & Minutes */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Hours
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="24"
                    placeholder="0"
                    value={manualHours}
                    onChange={(e) => setManualHours(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 font-mono focus:outline-none focus:border-purple-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Minutes
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    step="5"
                    placeholder="30"
                    value={manualMinutes}
                    onChange={(e) => setManualMinutes(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 font-mono focus:outline-none focus:border-purple-600"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder="Summary of work completed..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 resize-none focus:outline-none focus:border-purple-600"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsLogModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold transition-colors disabled:opacity-50"
                >
                  {actionLoading ? 'Logging...' : 'Save Time Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
