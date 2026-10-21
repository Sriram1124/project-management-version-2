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
  Info,
  Search,
  Filter,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Pencil,
  Eye,
} from 'lucide-react';
import { timesheetService } from '../../services/timesheet.service';
import { useAuth } from '../../context/AuthContext';
import { COLUMNS_CONFIG } from '../../constants/kanban';
import {
  getCalendarWeekRange,
  getCalendarMonthRange,
  toLocalDateString,
  parseLocalDate,
  formatMinutes,
} from '../../utils/dateUtils';

const STATUS_OPTIONS = [
  { id: 'ALL', label: 'All Statuses' },
  ...COLUMNS_CONFIG.map((c) => ({
    id: c.id,
    label: c.title,
    dotColor: c.dotColor,
  })),
];

const PRIORITY_OPTIONS = [
  { id: 'ALL', label: 'All Priorities' },
  { id: 'URGENT', label: 'Urgent', bg: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-600' },
  { id: 'HIGH', label: 'High', bg: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  { id: 'MEDIUM', label: 'Medium', bg: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  { id: 'LOW', label: 'Low', bg: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
];

const TIME_FILTER_OPTIONS = [
  { id: 'ALL', label: 'All Tasks' },
  { id: 'LOGGED', label: 'Time Logged' },
  { id: 'NO_LOGGED', label: 'No Time Logged' },
];

const getStatusBadge = (status) => {
  const norm = (status || 'TODO').toUpperCase();
  switch (norm) {
    case 'IN_PROGRESS':
      return { label: 'In Progress', bg: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-600' };
    case 'IN_REVIEW':
      return { label: 'In Review', bg: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' };
    case 'BLOCKED':
      return { label: 'Blocked', bg: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' };
    case 'COMPLETED':
      return { label: 'Completed', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-600' };
    case 'TODO':
    default:
      return { label: 'To Do', bg: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-400' };
  }
};

const getPriorityBadge = (priority) => {
  const norm = (priority || 'MEDIUM').toUpperCase();
  switch (norm) {
    case 'URGENT':
      return { label: 'Urgent', bg: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-600' };
    case 'HIGH':
      return { label: 'High', bg: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' };
    case 'LOW':
      return { label: 'Low', bg: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' };
    case 'MEDIUM':
    default:
      return { label: 'Medium', bg: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' };
  }
};

import { getSessionCutoffMs, formatElapsed } from '../../utils/time';
export { getSessionCutoffMs, formatElapsed };

export default function TimesheetView({
  onToast,
  targetUserId = null,
  readOnly = false,
  onBack = null,
  internInfo = null,
  initialDate = null,
  onDateChange = null,
  initialViewMode = null,
}) {
  const { user: authUser } = useAuth();
  const authRole = String(
    authUser?.role?.name || authUser?.role || authUser?.type || authUser?.user_type || ''
  ).toUpperCase();
  const isManager = authRole === 'MANAGER';

  // View Mode: 'WEEK' | 'MONTH'
  const [viewMode, setViewMode] = useState(() => {
    if (initialViewMode) return initialViewMode;
    try {
      return sessionStorage.getItem('internhub_timesheet_view_mode') || 'WEEK';
    } catch {
      return 'WEEK';
    }
  });

  // Authoritative date state (Week / Month)
  const [selectedDate, setSelectedDate] = useState(() => {
    if (initialDate) return parseLocalDate(initialDate);
    try {
      const stored = sessionStorage.getItem('internhub_timesheet_selected_date');
      if (stored) return parseLocalDate(stored);
    } catch {}
    return new Date();
  });

  const [showWeekends, setShowWeekends] = useState(false); // Mon-Fri default

  // Month view week-group expansion state (all expanded by default)
  const [expandedWeeks, setExpandedWeeks] = useState({});

  // Timesheet data
  const [timesheet, setTimesheet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [timerActionTaskId, setTimerActionTaskId] = useState(null);

  // Active timer tracking
  const [activeSession, setActiveSession] = useState(null);
  const [elapsedText, setElapsedText] = useState('00:00:00');

  // Start Timer Modal (Intern Only)
  const [isStartTimerModalOpen, setIsStartTimerModalOpen] = useState(false);
  const [startTimerTaskId, setStartTimerTaskId] = useState('');

  // Cell Details Drawer / Modal
  const [cellModalData, setCellModalData] = useState(null); // { task, date, dayObj, entries }
  const [cellFormHours, setCellFormHours] = useState('');
  const [cellFormMinutes, setCellFormMinutes] = useState('');
  const [cellFormNotes, setCellFormNotes] = useState('');

  // General Manual Log Modal
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [manualTaskId, setManualTaskId] = useState('');
  const [manualDate, setManualDate] = useState(() => toLocalDateString(new Date()));
  const [manualHours, setManualHours] = useState('');
  const [manualMinutes, setManualMinutes] = useState('30');
  const [manualNotes, setManualNotes] = useState('');

  // Task Filters & Search State
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [timeFilter, setTimeFilter] = useState('ALL'); // 'ALL' | 'LOGGED' | 'NO_LOGGED'
  const [taskSearchQuery, setTaskSearchQuery] = useState('');

  // Time correction state
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [correctionEntry, setCorrectionEntry] = useState(null); // { id, task_id, task_title, date_str, duration_minutes, notes }
  const [correctionExcessMinutes, setCorrectionExcessMinutes] = useState(30);
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);
  const [correctionError, setCorrectionError] = useState('');

  // Edit Logged Time Entry Modal State
  const [editingEntry, setEditingEntry] = useState(null);
  const [editTaskId, setEditTaskId] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editHours, setEditHours] = useState('0');
  const [editMinutes, setEditMinutes] = useState('0');
  const [editNotes, setEditNotes] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');

  // Week Details Modal in Month View
  const [weekModalData, setWeekModalData] = useState(null); // { task, weekGroup, weekMins }
  const [weekFormDate, setWeekFormDate] = useState('');
  const [weekFormHours, setWeekFormHours] = useState('');
  const [weekFormMinutes, setWeekFormMinutes] = useState('30');
  const [weekFormNotes, setWeekFormNotes] = useState('');

  // Pagination & Compact Layout
  const [pageSize, setPageSize] = useState(() => {
    try {
      const stored = sessionStorage.getItem('internhub_timesheet_page_size');
      if (stored === 'ALL') return 'ALL';
      const num = Number.parseInt(stored, 10);
      if (!Number.isNaN(num) && num > 0) return num;
    } catch {}
    return 15;
  });
  const [isCustomPageSize, setIsCustomPageSize] = useState(() => {
    try {
      const stored = sessionStorage.getItem('internhub_timesheet_page_size');
      if (stored && stored !== 'ALL' && ![15, 30, 50].includes(Number(stored))) return true;
    } catch {}
    return false;
  });
  const [customPageSizeInput, setCustomPageSizeInput] = useState(() => {
    try {
      const stored = sessionStorage.getItem('internhub_timesheet_page_size');
      if (stored && stored !== 'ALL' && ![15, 30, 50].includes(Number(stored))) return String(stored);
    } catch {}
    return '20';
  });
  const [pageSizeError, setPageSizeError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Authoritative date range objects
  const weekInfo = useMemo(() => getCalendarWeekRange(selectedDate), [selectedDate]);
  const monthInfo = useMemo(() => getCalendarMonthRange(selectedDate), [selectedDate]);

  // Persist selected date, view mode, and page size
  useEffect(() => {
    try {
      sessionStorage.setItem('internhub_timesheet_selected_date', toLocalDateString(selectedDate));
      sessionStorage.setItem('internhub_timesheet_view_mode', viewMode);
      sessionStorage.setItem('internhub_timesheet_page_size', String(pageSize));
    } catch {}
    onDateChange?.(selectedDate);
  }, [selectedDate, viewMode, pageSize, onDateChange]);

  // Reset pagination on filter or page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, priorityFilter, timeFilter, taskSearchQuery, pageSize]);

  const handleCustomPageSizeChange = (val) => {
    setCustomPageSizeInput(val);
    const trimmed = val.trim();
    if (!trimmed) {
      setPageSizeError('Enter rows');
      return;
    }
    if (!/^\d+$/.test(trimmed)) {
      setPageSizeError('Positive integer only');
      return;
    }
    const num = Number.parseInt(trimmed, 10);
    if (num <= 0) {
      setPageSizeError('Must be > 0');
      return;
    }
    if (num > 200) {
      setPageSizeError('Max 200 rows');
      return;
    }
    setPageSizeError('');
    setPageSize(num);
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setStatusFilter('ALL');
    setPriorityFilter('ALL');
    setTimeFilter('ALL');
    setTaskSearchQuery('');
    setCurrentPage(1);
  };

  // Effective intern metadata (from prop or backend response)
  const currentIntern = internInfo || timesheet?.user || null;

  // Flattened entries for the selected week to allow quick correction requests
  const allWeekEntries = useMemo(() => {
    if (!timesheet?.tasks) return [];
    const list = [];
    for (const t of timesheet.tasks) {
      if (!t.days) continue;
      for (const [dateStr, dData] of Object.entries(t.days)) {
        if (dData.entries && Array.isArray(dData.entries)) {
          for (const ent of dData.entries) {
            list.push({
              ...ent,
              task_id: t.id,
              task_title: t.title,
              date_str: dateStr,
            });
          }
        }
      }
    }
    return list;
  }, [timesheet]);

  // Week/Month expansion handlers
  const toggleWeekExpanded = (weekNum) => {
    setExpandedWeeks((prev) => ({
      ...prev,
      [weekNum]: prev[weekNum] === false ? true : false,
    }));
  };

  const toggleAllWeeks = (expand) => {
    if (!timesheet?.weeks) return;
    const next = {};
    timesheet.weeks.forEach((w) => {
      next[w.week_number] = expand;
    });
    setExpandedWeeks(next);
  };

  // Load timesheet for the selected week or month
  const loadTimesheet = useCallback(async (options = {}) => {
    const isBackground = options?.isBackground ?? false;
    try {
      if (!isBackground) {
        setLoading(true);
        setError('');
      }
      const dateStr = toLocalDateString(selectedDate);
      const filters = {
        status: statusFilter,
        priority: priorityFilter,
        time_filter: timeFilter,
        search: taskSearchQuery,
      };
      let response;
      if (viewMode === 'MONTH') {
        response = await timesheetService.getMonthly(targetUserId, dateStr, filters);
      } else {
        response = await timesheetService.getWeekly(targetUserId, dateStr, filters);
      }
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
      console.error(`Failed to load ${viewMode.toLowerCase()} timesheet:`, err);
      if (!isBackground) {
        setError(err?.message || 'Unable to load timesheet data. Please check your connection.');
      }
    } finally {
      if (!isBackground) {
        setLoading(false);
      }
    }
  }, [viewMode, selectedDate, targetUserId, statusFilter, priorityFilter, timeFilter, taskSearchQuery, readOnly]);

  useEffect(() => {
    void loadTimesheet();
  }, [loadTimesheet]);

  // Multi-tab and timer event synchronization
  useEffect(() => {
    const handleSync = () => {
      void loadTimesheet({ isBackground: true });
    };

    window.addEventListener('timer-session-updated', handleSync);
    window.addEventListener('focus', handleSync);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleSync();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('timer-session-updated', handleSync);
      window.removeEventListener('focus', handleSync);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadTimesheet]);

  // Live timer interval
  useEffect(() => {
    if (!activeSession?.started_at) {
      setElapsedText('00:00:00');
      return;
    }
    const updateElapsed = () => {
      const cutoff = getSessionCutoffMs(activeSession.started_at);
      if (cutoff && Date.now() >= cutoff) {
        void loadTimesheet({ isBackground: true });
        return;
      }
      setElapsedText(formatElapsed(activeSession.started_at));
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [activeSession, loadTimesheet]);

  // Navigate periods (Week or Month)
  const handlePrevPeriod = () => {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      if (viewMode === 'MONTH') {
        next.setMonth(next.getMonth() - 1);
      } else {
        next.setDate(next.getDate() - 7);
      }
      return next;
    });
  };

  const handleNextPeriod = () => {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      if (viewMode === 'MONTH') {
        next.setMonth(next.getMonth() + 1);
      } else {
        next.setDate(next.getDate() + 7);
      }
      return next;
    });
  };

  const handleCurrentPeriod = () => {
    setSelectedDate(new Date());
  };

  // Start / Stop timer
  const handleStartTimer = async (taskId) => {
    if (isManager) {
      onToast?.('Managers do not have permission to start timers on tasks');
      return;
    }
    try {
      setTimerActionTaskId(taskId);
      const res = await timesheetService.startSession({ task_id: taskId });
      setActiveSession(res?.session || null);
      onToast?.('Timer started successfully');
      await loadTimesheet({ isBackground: true });
    } catch (err) {
      onToast?.(err.message || 'Unable to start timer');
    } finally {
      setTimerActionTaskId(null);
    }
  };

  const handleStopTimer = async () => {
    try {
      setTimerActionTaskId(activeSession?.task_id || 'STOPPING');
      const res = await timesheetService.endSession();
      setActiveSession(null);
      const duration = res?.session?.time_entry?.duration_minutes || 0;
      onToast?.(`Timer stopped: ${formatMinutes(duration)} logged!`);
      await loadTimesheet({ isBackground: true });
    } catch (err) {
      onToast?.(err.message || 'Unable to stop timer');
    } finally {
      setTimerActionTaskId(null);
    }
  };

  const handleOpenCorrectionModal = (entry, task = null) => {
    const origMins = Number(entry?.duration_minutes) || 0;
    setCorrectionEntry({
      ...entry,
      task_id: task?.id || entry?.task_id,
      task_title: task?.title || entry?.task_title || 'Work Task',
      date_str: entry?.date_str || (entry?.date ? new Date(entry.date).toISOString().slice(0, 10) : ''),
      duration_minutes: origMins,
    });
    setCorrectionExcessMinutes(Math.min(30, Math.max(5, Math.floor(origMins / 2))));
    setCorrectionReason('');
    setCorrectionError('');
    setIsCorrectionModalOpen(true);
  };

  const handleCorrectionSubmit = async (e) => {
    e.preventDefault();
    if (!correctionEntry) {
      setCorrectionError('Please select a recorded time entry to correct.');
      return;
    }
    const excess = Number(correctionExcessMinutes);
    if (!excess || excess <= 0) {
      setCorrectionError('Excess minutes to deduct must be greater than 0.');
      return;
    }
    const orig = Number(correctionEntry.duration_minutes || 0);
    if (excess >= orig) {
      setCorrectionError(`Excess minutes must be less than original duration (${orig}m).`);
      return;
    }
    if (!correctionReason.trim()) {
      setCorrectionError('Please provide a mandatory reason for this time correction.');
      return;
    }

    try {
      setCorrectionSubmitting(true);
      setCorrectionError('');
      await timesheetService.requestTimeCorrection({
        time_entry_id: correctionEntry.id,
        excess_minutes: excess,
        reason: correctionReason.trim(),
      });
      onToast?.('Time correction request submitted for manager review');
      setIsCorrectionModalOpen(false);
      setCorrectionEntry(null);
      setCorrectionReason('');
      await loadTimesheet();
    } catch (err) {
      setCorrectionError(err.message || 'Unable to submit correction request');
    } finally {
      setCorrectionSubmitting(false);
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

  // Open Week Cell Drawer / Modal (Month View)
  const handleOpenWeekCell = (task, wg) => {
    const weekNum = wg.week_number ?? wg.weekNumber;
    const weekMins = task.weeks?.[weekNum]?.minutes || 0;
    setWeekModalData({
      task,
      weekGroup: wg,
      weekMins,
    });
    setWeekFormDate(wg.days?.[0] || wg.start_date || '');
    setWeekFormHours('');
    setWeekFormMinutes('30');
    setWeekFormNotes('');
  };

  // Submit time entry inside Week Modal
  const handleAddWeekEntry = async (e) => {
    e.preventDefault();
    if (!weekModalData || !weekFormDate) return;
    const hours = Number.parseInt(weekFormHours, 10) || 0;
    const minutes = Number.parseInt(weekFormMinutes, 10) || 0;
    const totalMins = hours * 60 + minutes;

    if (totalMins <= 0) {
      alert('Please enter a duration greater than 0 minutes.');
      return;
    }

    try {
      setActionLoading(true);
      await timesheetService.createEntry({
        task_id: weekModalData.task.id,
        date: weekFormDate,
        duration_minutes: totalMins,
        notes: weekFormNotes.trim() || null,
      });
      onToast?.(`Logged ${formatMinutes(totalMins)} on ${weekModalData.task.title}`);
      setWeekModalData(null);
      await loadTimesheet();
    } catch (err) {
      alert(err.message || 'Failed to save time entry');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit time entry inside Cell Modal
  const handleAddCellEntry = async (e) => {
    e.preventDefault();
    if (!cellModalData) return;
    const hours = Number.parseInt(cellFormHours, 10) || 0;
    const minutes = Number.parseInt(cellFormMinutes, 10) || 0;
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

  // Delete an entry from cell modal or week modal
  const handleDeleteEntry = async (entryId) => {
    if (!window.confirm('Are you sure you want to delete this time entry?')) return;
    try {
      setActionLoading(true);
      await timesheetService.deleteEntry(entryId);
      onToast?.('Time entry deleted');
      setCellModalData(null);
      setWeekModalData(null);
      await loadTimesheet();
    } catch (err) {
      onToast?.(err.message || 'Failed to delete time entry');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Edit Modal for an existing time entry
  const handleOpenEditModal = (entry, task = null) => {
    const totalMins = Number(entry.duration_minutes) || 0;
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    let entryDateStr = '';
    if (entry.date) {
      entryDateStr = toLocalDateString(new Date(entry.date));
    } else if (cellModalData?.date) {
      entryDateStr = cellModalData.date;
    } else {
      entryDateStr = toLocalDateString(new Date());
    }

    setEditingEntry({
      ...entry,
      task_id: entry.task_id || task?.id,
      task_title: task?.title || entry.task?.title || 'Selected Task',
    });
    setEditTaskId(entry.task_id || task?.id || (availableTasks[0]?.id || ''));
    setEditDate(entryDateStr);
    setEditHours(String(hrs));
    setEditMinutes(String(mins));
    setEditNotes(entry.notes || '');
    setEditError('');
  };

  // Submit update for an existing time entry
  const handleSaveEditEntry = async (e) => {
    e?.preventDefault();
    if (!editingEntry) return;

    const hrs = Number.parseInt(editHours, 10) || 0;
    const mins = Number.parseInt(editMinutes, 10) || 0;
    const totalMinutes = hrs * 60 + mins;

    if (totalMinutes <= 0) {
      setEditError('Duration must be greater than 0 minutes. Please enter a positive time value.');
      return;
    }
    if (!editDate) {
      setEditError('Please select a valid date for this time entry.');
      return;
    }

    try {
      setEditSubmitting(true);
      setEditError('');

      await timesheetService.updateEntry(editingEntry.id, {
        task_id: editTaskId || editingEntry.task_id,
        date: editDate,
        duration_minutes: totalMinutes,
        notes: editNotes.trim() || null,
      });

      onToast?.('Time entry updated successfully.');
      setEditingEntry(null);
      setCellModalData(null);
      setWeekModalData(null);
      await loadTimesheet();
    } catch (err) {
      console.error('Failed to update time entry:', err);
      setEditError(err.message || 'Failed to update time entry');
    } finally {
      setEditSubmitting(false);
    }
  };

  // Submit General Manual Time Log Modal
  const handleManualLogSubmit = async (e) => {
    e.preventDefault();
    if (!manualTaskId) {
      alert('Please select a task.');
      return;
    }
    const hours = Number.parseInt(manualHours, 10) || 0;
    const minutes = Number.parseInt(manualMinutes, 10) || 0;
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
    const activeTasksCount = timesheet?.active_tasks_count ?? taskRows.filter((r) => r.total_minutes > 0).length;
    let activeDaysCount = 0;
    if (viewMode === 'MONTH') {
      activeDaysCount = timesheet?.active_days_count ?? 0;
    } else {
      activeDaysCount = (displayedDays || []).filter((d) => d.total_minutes > 0).length;
    }
    const avgDailyMins = activeDaysCount > 0 ? Math.round(totalMins / activeDaysCount) : 0;
    return {
      totalFormatted: timesheet?.total_formatted || formatMinutes(totalMins),
      activeTasksCount,
      activeDaysCount,
      avgDailyFormatted: timesheet?.avg_daily_formatted || formatMinutes(avgDailyMins),
    };
  }, [timesheet, displayedDays, viewMode]);

  const taskRows = timesheet?.task_rows || [];
  const availableTasks = timesheet?.available_tasks || [];

  const isFiltered =
    statusFilter !== 'ALL' ||
    priorityFilter !== 'ALL' ||
    timeFilter !== 'ALL' ||
    Boolean(taskSearchQuery.trim());

  const filteredTaskRows = useMemo(() => {
    if (!taskRows) return [];
    return taskRows.filter((task) => {
      // 1. Status Filter
      if (statusFilter !== 'ALL') {
        const s = (task.status || 'TODO').toUpperCase();
        if (s !== statusFilter) return false;
      }

      // 2. Priority Filter
      if (priorityFilter !== 'ALL') {
        const p = (task.priority || 'MEDIUM').toUpperCase();
        if (p !== priorityFilter) return false;
      }

      // 3. Time Logged Filter
      const totalMins = Number(task.total_minutes) || 0;
      if (timeFilter === 'LOGGED' && totalMins <= 0) return false;
      if (timeFilter === 'NO_LOGGED' && totalMins > 0) return false;

      // 4. Search Query (title, ID/key, project name)
      if (taskSearchQuery.trim()) {
        const q = taskSearchQuery.trim().toLowerCase();
        const titleMatch = (task.title || '').toLowerCase().includes(q);
        const keyMatch = (task.key || task.id || '').toLowerCase().includes(q);
        const projMatch = (task.project?.name || '').toLowerCase().includes(q);
        if (!titleMatch && !keyMatch && !projMatch) return false;
      }

      return true;
    });
  }, [taskRows, statusFilter, priorityFilter, timeFilter, taskSearchQuery]);

  // Totals for filtered task rows
  const filteredTotals = useMemo(() => {
    let totalMinutes = 0;
    const dailyTotals = {};
    (displayedDays || []).forEach((d) => {
      dailyTotals[d.date] = 0;
    });

    filteredTaskRows.forEach((task) => {
      totalMinutes += Number(task.total_minutes) || 0;
      (displayedDays || []).forEach((d) => {
        const mins = Number(task.days?.[d.date]?.minutes) || 0;
        dailyTotals[d.date] = (dailyTotals[d.date] || 0) + mins;
      });
    });

    return {
      totalMinutes,
      totalFormatted: formatMinutes(totalMinutes),
      dailyTotals,
      activeTasksCount: filteredTaskRows.filter((r) => (Number(r.total_minutes) || 0) > 0).length,
    };
  }, [filteredTaskRows, displayedDays]);

  // Pagination calculation
  const totalPages = pageSize === 'ALL' ? 1 : Math.max(1, Math.ceil(filteredTaskRows.length / Number(pageSize)));
  const paginatedTaskRows = useMemo(() => {
    if (pageSize === 'ALL') return filteredTaskRows;
    const limit = Number(pageSize);
    const startIndex = (currentPage - 1) * limit;
    return filteredTaskRows.slice(startIndex, startIndex + limit);
  }, [filteredTaskRows, currentPage, pageSize]);

  return (
    <div className="space-y-6 text-xs text-slate-800">
      {/* 1. TOP HEADER & NAVIGATION CONTROLS */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        {onBack && (
          <div className="pb-3.5 border-b border-slate-100">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-700 hover:text-purple-900 transition-colors cursor-pointer group"
            >
              <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
              <span>Back to Intern Timesheets Directory</span>
            </button>
          </div>
        )}

        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
          {/* Left: Title & Intern Metadata */}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
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

            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-1.5">
              {readOnly && currentIntern
                ? `${currentIntern.name}'s ${viewMode === 'MONTH' ? 'Monthly' : 'Weekly'} Timesheet`
                : 'Timesheet'}
            </h1>

            {readOnly && currentIntern && (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 mt-1.5">
                <span className="text-slate-700 font-medium">{currentIntern.email}</span>
                {currentIntern.cohort?.name && (
                  <>
                    <span>•</span>
                    <span className="font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200/60">
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
              </div>
            )}
          </div>

          {/* Right: Action Buttons & Nav */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 self-start xl:self-auto">
            {/* View Mode Selector: Week vs Month */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('WEEK')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'WEEK'
                    ? 'bg-white text-purple-700 font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Week</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('MONTH')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'MONTH'
                    ? 'bg-white text-purple-700 font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Month</span>
              </button>
            </div>

            {/* Period Nav Buttons */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-slate-700">
              <button
                type="button"
                onClick={handlePrevPeriod}
                className="p-1.5 rounded-lg hover:bg-white hover:text-slate-900 transition-colors cursor-pointer"
                title={viewMode === 'MONTH' ? 'Previous Month' : 'Previous Week'}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="px-3 py-1 font-bold text-xs text-slate-800 whitespace-nowrap min-w-[125px] text-center">
                {viewMode === 'MONTH' ? monthInfo.monthName : weekInfo.formattedRange}
              </div>
              <button
                type="button"
                onClick={handleNextPeriod}
                className="p-1.5 rounded-lg hover:bg-white hover:text-slate-900 transition-colors cursor-pointer"
                title={viewMode === 'MONTH' ? 'Next Month' : 'Next Week'}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Jump to Current Period Button */}
            <button
              type="button"
              onClick={handleCurrentPeriod}
              className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-colors cursor-pointer whitespace-nowrap ${
                (viewMode === 'MONTH' ? monthInfo.isCurrentMonth : weekInfo.isCurrentWeek)
                  ? 'bg-purple-100 text-purple-800 border-purple-300 font-bold'
                  : 'bg-slate-100 hover:bg-purple-50 hover:text-purple-700 border-slate-200 text-slate-700'
              }`}
              title={viewMode === 'MONTH' ? 'Jump to Current Month' : 'Jump to Current Calendar Week'}
            >
              {viewMode === 'MONTH' ? 'This Month' : 'This Week'}
            </button>

            {/* 5-Day vs 7-Day Toggle (Week view only) */}
            {viewMode === 'WEEK' && (
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
            )}

            {/* Refresh */}
            <button
              type="button"
              onClick={() => { void loadTimesheet(); }}
              disabled={loading}
              className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh Timesheet"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {/* Active Running Timer Banner / Stop Button */}
            {!readOnly && !isManager && activeSession && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold shadow-xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="font-mono font-bold text-emerald-700">{elapsedText || '00:00:00'}</span>
                <span className="truncate max-w-[120px] text-slate-600 hidden sm:inline" title={activeSession.task?.title || 'Active Task'}>
                  {activeSession.task?.title || 'Active Task'}
                </span>
                <button
                  type="button"
                  disabled={Boolean(timerActionTaskId)}
                  onClick={() => { void handleStopTimer(); }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                  title="Stop and save logged time"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                  <span>Stop Timer</span>
                </button>
              </div>
            )}

            {/* Start Timer Button (when no timer is active) */}
            {!readOnly && !isManager && !activeSession && (
              <button
                type="button"
                disabled={Boolean(timerActionTaskId)}
                onClick={() => {
                  if (availableTasks.length > 0 && !startTimerTaskId) {
                    setStartTimerTaskId(availableTasks[0].id);
                  }
                  setIsStartTimerModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                title="Start a task timer"
              >
                {timerActionTaskId ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>Start Timer</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => { void loadTimesheet(); }}
            className="px-2.5 py-1 bg-white border border-rose-300 rounded-lg text-xs font-semibold hover:bg-rose-100"
          >
            Retry
          </button>
        </div>
      )}

      {/* 2. SUMMARY STAT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between min-h-[115px]">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>{viewMode === 'MONTH' ? 'Month Period' : 'Week Period'}</span>
            <span className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
              <Calendar className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight truncate">
              {viewMode === 'MONTH' ? monthInfo.monthName : weekInfo.formattedRange}
            </div>
            <div className="text-[11px] text-purple-600 font-semibold mt-0.5 truncate">
              {viewMode === 'MONTH'
                ? `${timesheet?.weeks?.length || monthInfo.weeks.length} calendar weeks · ${monthInfo.daysInMonth} days`
                : showWeekends ? '7 calendar days' : 'Monday – Friday'}
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between min-h-[115px]">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>{isFiltered ? 'Total Logged (Filtered)' : 'Total Logged'}</span>
            <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-extrabold text-purple-700 tracking-tight">
              {(loading && !timesheet) ? '...' : (isFiltered ? filteredTotals.totalFormatted : summaryStats.totalFormatted)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 truncate">
              {viewMode === 'MONTH'
                ? 'Recorded task effort in month'
                : isFiltered
                ? `Filtered total (${summaryStats.totalFormatted} overall)`
                : 'Recorded task effort'}
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between min-h-[115px]">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>{isFiltered ? 'Active Tasks (Filtered)' : 'Active Tasks'}</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <CheckSquare className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              {(loading && !timesheet) ? '...' : (isFiltered ? filteredTotals.activeTasksCount : summaryStats.activeTasksCount)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 truncate">
              {isFiltered
                ? `Of ${filteredTaskRows.length} filtered (${taskRows.length} overall)`
                : `Of ${taskRows.length} assigned tasks`}
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between min-h-[115px]">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Daily Average</span>
            <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
              <Timer className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              {(loading && !timesheet) ? '...' : summaryStats.avgDailyFormatted}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 truncate">
              Across {summaryStats.activeDaysCount} active work {summaryStats.activeDaysCount === 1 ? 'day' : 'days'}
            </div>
          </div>
        </div>
      </div>

      {/* 4. WEEKLY MATRIX GRID TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Header Title Bar */}
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

        {/* TASK FILTER BAR */}
        <div className="p-3.5 sm:p-4 border-b border-slate-200/80 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
            {/* Search Input */}
            <div className="relative min-w-[180px] sm:min-w-[220px] flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search tasks, keys, projects..."
                value={taskSearchQuery}
                onChange={(e) => setTaskSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600/20"
              />
              {taskSearchQuery && (
                <button
                  type="button"
                  onClick={() => setTaskSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Task Status Dropdown */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="task-status-filter" className="text-[11px] font-semibold text-slate-500 shrink-0 flex items-center gap-1">
                <Filter className="w-3 h-3 text-purple-600" />
                <span>Status:</span>
              </label>
              <select
                id="task-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:border-purple-600 cursor-pointer shadow-2xs"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Task Priority Dropdown */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="task-priority-filter" className="text-[11px] font-semibold text-slate-500 shrink-0 flex items-center gap-1">
                <SlidersHorizontal className="w-3 h-3 text-purple-600" />
                <span>Priority:</span>
              </label>
              <select
                id="task-priority-filter"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:border-purple-600 cursor-pointer shadow-2xs"
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Time Logged Filter Dropdown */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="time-entry-filter" className="text-[11px] font-semibold text-slate-500 shrink-0 flex items-center gap-1">
                <Clock className="w-3 h-3 text-purple-600" />
                <span>Time:</span>
              </label>
              <select
                id="time-entry-filter"
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:border-purple-600 cursor-pointer shadow-2xs"
              >
                {TIME_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Clear Filters Button */}
            {isFiltered && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-purple-700 bg-white hover:bg-purple-50 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                title="Reset all filters"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>

          {/* Counts & Status Summary */}
          <div className="flex items-center gap-2 text-[11px] text-slate-500 shrink-0">
            <span className="font-medium">
              Showing <span className="font-bold text-slate-800">{filteredTaskRows.length}</span> of <span className="font-bold text-slate-800">{taskRows.length}</span> tasks
            </span>
            {isFiltered && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                Filtered: {filteredTotals.totalFormatted}
              </span>
            )}
          </div>
        </div>

        {/* Loading State */}
        {(loading && !timesheet) ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-purple-600 mb-2" />
            <p className="text-xs font-semibold">Loading weekly timesheet...</p>
          </div>
        ) : taskRows.length === 0 ? (
          /* Empty State: No assigned tasks at all */
          <div className="p-12 text-center text-slate-500 max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">No Task Rows Found</h3>
              <p className="text-xs text-slate-400 mt-1">
                You have no assigned tasks or time entries recorded for this period.
              </p>
            </div>
          </div>
        ) : filteredTaskRows.length === 0 ? (
          /* Empty State: Filter yielded no matches */
          <div className="p-12 text-center text-slate-500 max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
              <Filter className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">No Matching Tasks Found</h3>
              <div className="text-xs text-slate-400 mt-1 space-y-0.5">
                <p>No tasks match the active filters:</p>
                {statusFilter !== 'ALL' && (
                  <p className="font-semibold text-slate-600">
                    • Status: {STATUS_OPTIONS.find((o) => o.id === statusFilter)?.label || statusFilter}
                  </p>
                )}
                {timeFilter !== 'ALL' && (
                  <p className="font-semibold text-slate-600">
                    • Time Filter: {TIME_FILTER_OPTIONS.find((o) => o.id === timeFilter)?.label || timeFilter}
                  </p>
                )}
                {taskSearchQuery.trim() && (
                  <p className="font-semibold text-slate-600">
                    • Search Query: &quot;{taskSearchQuery}&quot;
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset All Filters</span>
            </button>
          </div>
        ) : (
          /* Main Table Matrix (Handles both Week and Month Views) */
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200 text-slate-600 font-bold text-[11px] shadow-2xs">
                <tr>
                  {/* Task Header */}
                  <th className="py-3 px-4 min-w-[260px] max-w-xl">
                    Task & Deliverable
                  </th>

                  {viewMode === 'MONTH' ? (
                    /* Month View: Month-relative Week Columns */
                    <>
                      {(timesheet?.weeks || monthInfo.weeks).map((wg) => {
                        const weekNum = wg.week_number ?? wg.weekNumber;
                        const label = wg.label || `Week ${weekNum}`;
                        const sub = label.includes('(')
                          ? label.slice(label.indexOf('(') + 1, label.lastIndexOf(')'))
                          : `${wg.start_date} – ${wg.end_date}`;

                        return (
                          <th key={weekNum} className="py-3 px-3 text-center min-w-[105px]">
                            <span className="block text-slate-800 font-bold">Week {weekNum}</span>
                            <span className="block text-[10px] text-slate-400 font-normal mt-0.5 whitespace-nowrap">
                              ({sub})
                            </span>
                          </th>
                        );
                      })}
                      <th className="py-3 px-4 text-right min-w-[100px] bg-slate-100/80 font-extrabold text-slate-800">
                        Total
                      </th>
                    </>
                  ) : (
                    /* Week View: Weekday Columns */
                    <>
                      {displayedDays.map((d) => (
                        <th
                          key={d.date}
                          className={`py-3 px-3 text-center min-w-[90px] ${
                            d.isToday ? 'bg-purple-50/90 text-purple-900 border-x border-purple-200/60' : ''
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
                      <th className="py-3 px-4 text-right min-w-[100px] bg-slate-100/80 font-extrabold text-slate-800">
                        Total
                      </th>
                    </>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {paginatedTaskRows.map((task) => {
                  const isThisTaskRunning = activeSession?.task_id === task.id;
                  const statusBadge = getStatusBadge(task.status);

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
                              {/* Status Badge */}
                              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase inline-flex items-center gap-1 ${statusBadge.bg}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dot}`}></span>
                                <span>{statusBadge.label}</span>
                              </span>

                              {/* Priority Badge */}
                              {task.priority && (() => {
                                const pBadge = getPriorityBadge(task.priority);
                                return (
                                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase inline-flex items-center gap-1 ${pBadge.bg}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${pBadge.dot}`}></span>
                                    <span>{pBadge.label}</span>
                                  </span>
                                );
                              })()}

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
                            <div className="font-semibold text-slate-900 mt-1 truncate group-hover:text-purple-900" title={task.title}>
                              {task.title}
                            </div>
                          </div>

                          {/* Quick Timer Start / Stop on Row */}
                          <div className="shrink-0 self-center">
                            {isThisTaskRunning ? (
                              <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200/80 rounded-lg px-2 py-1 shadow-xs">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                                <span className="font-mono text-[11px] font-bold text-emerald-700 tracking-wider">
                                  {elapsedText}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => { void handleStopTimer(); }}
                                  disabled={actionLoading || Boolean(timerActionTaskId)}
                                  title="Stop Timer"
                                  className="p-1 rounded-md bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer disabled:opacity-50"
                                >
                                  {timerActionTaskId === task.id || timerActionTaskId === 'STOPPING' ? (
                                    <RefreshCw className="w-3 h-3 animate-spin text-rose-600" />
                                  ) : (
                                    <Square className="w-3 h-3 fill-current" />
                                  )}
                                </button>
                              </div>
                            ) : (!readOnly && !isManager) ? (
                              <button
                                type="button"
                                disabled={actionLoading || Boolean(timerActionTaskId)}
                                onClick={() => { void handleStartTimer(task.id); }}
                                title={activeSession ? `Switch timer to "${task.title}" (will stop current timer)` : `Start timer for "${task.title}"`}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer opacity-70 group-hover:opacity-100 disabled:opacity-50"
                              >
                                {timerActionTaskId === task.id ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                )}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      {viewMode === 'MONTH' ? (
                        /* Month View: Week cells */
                        <>
                          {(timesheet?.weeks || monthInfo.weeks).map((wg) => {
                            const weekNum = wg.week_number ?? wg.weekNumber;
                            const weekMins = task.weeks?.[weekNum]?.minutes || 0;
                            return (
                              <td
                                key={weekNum}
                                role="button"
                                tabIndex={0}
                                onClick={() => handleOpenWeekCell(task, wg)}
                                onKeyDown={(e) => {
                                  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                                    e.preventDefault();
                                    handleOpenWeekCell(task, wg);
                                  }
                                }}
                                className={`py-2 px-3 text-center cursor-pointer transition-colors relative group/cell ${
                                  weekMins > 0 ? 'bg-purple-50/40 hover:bg-purple-100/70 font-mono font-bold text-purple-900' : 'hover:bg-slate-50 text-slate-300'
                                }`}
                                title={`Click to view or manage entries for ${task.title} during ${wg.label || `Week ${weekNum}`}`}
                              >
                                {weekMins > 0 ? (
                                  <span className="inline-block px-2 py-0.5 rounded-lg bg-purple-100 text-purple-900 font-bold border border-purple-200/80 text-xs">
                                    {formatMinutes(weekMins)}
                                  </span>
                                ) : (
                                  <span className="text-slate-300 font-mono text-xs group-hover/cell:hidden">—</span>
                                )}
                                <span className="hidden group-hover/cell:inline-flex items-center justify-center p-1 rounded-md text-purple-600 hover:bg-purple-200/60 transition-colors">
                                  <Eye className="w-3 h-3" />
                                </span>
                              </td>
                            );
                          })}

                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 bg-slate-50/50">
                            {task.total_minutes > 0 ? (
                              <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-800 border border-slate-200 font-extrabold">
                                {formatMinutes(task.total_minutes)}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        </>
                      ) : (
                        /* Week View: Day Cells */
                        <>
                          {displayedDays.map((d) => {
                            const cellData = task.days?.[d.date] || { minutes: 0, entries: [] };
                            const mins = cellData.minutes || 0;
                            const hasEntries = cellData.entries?.length > 0;
                            const isToday = d.isToday;

                            return (
                              <td
                                key={d.date}
                                role="button"
                                tabIndex={0}
                                onClick={() => handleOpenCell(task, d.date, d)}
                                onKeyDown={(e) => {
                                  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                                    e.preventDefault();
                                    handleOpenCell(task, d.date, d);
                                  }
                                }}
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

                                <span className="hidden group-hover/cell:inline-flex items-center justify-center p-1 rounded-md text-purple-600 hover:bg-purple-200/60 transition-colors">
                                  {mins > 0 ? <Pencil className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                </span>
                              </td>
                            );
                          })}

                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 bg-slate-50/50">
                            {task.total_minutes > 0 ? (
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                                {formatMinutes(task.total_minutes)}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>

              {/* TABLE FOOTER */}
              <tfoot>
                {viewMode === 'MONTH' ? (
                  <tr className="bg-slate-50/90 border-t-2 border-slate-200 text-slate-800 font-bold">
                    <td className="py-3.5 px-4 font-bold text-slate-700">
                      Weekly Total
                    </td>
                    {(timesheet?.weeks || monthInfo.weeks).map((wg) => {
                      const weekNum = wg.week_number ?? wg.weekNumber;
                      let weekTotal = 0;
                      if (isFiltered) {
                        filteredTaskRows.forEach((t) => {
                          weekTotal += (t.weeks?.[weekNum]?.minutes || 0);
                        });
                      } else {
                        weekTotal = wg.total_minutes || 0;
                      }
                      return (
                        <td key={weekNum} className="py-3.5 px-3 text-center font-mono font-extrabold text-purple-900">
                          {weekTotal > 0 ? formatMinutes(weekTotal) : '—'}
                        </td>
                      );
                    })}
                    <td className="py-3.5 px-4 text-right font-mono font-extrabold text-sm text-purple-700 bg-purple-100/50">
                      {isFiltered ? filteredTotals.totalFormatted : (timesheet?.total_formatted || '0h 0m')}
                    </td>
                  </tr>
                ) : isFiltered ? (
                  <>
                    {/* Filtered Tasks Total */}
                    <tr className="bg-purple-50/70 border-t-2 border-purple-200 text-slate-800 font-bold">
                      <td className="py-3 px-4 font-bold text-purple-900">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>Filtered Tasks Total</span>
                          <span className="text-[10px] font-normal text-purple-600 font-mono">
                            ({filteredTaskRows.length} {filteredTaskRows.length === 1 ? 'task' : 'tasks'})
                          </span>
                        </div>
                      </td>
                      {displayedDays.map((d) => {
                        const dayTotal = filteredTotals.dailyTotals[d.date] || 0;
                        return (
                          <td
                            key={d.date}
                            className={`py-3 px-2 text-center font-mono font-extrabold ${
                              d.isToday ? 'bg-purple-200/60 text-purple-950' : 'text-purple-900'
                            }`}
                          >
                            {dayTotal > 0 ? formatMinutes(dayTotal) : '—'}
                          </td>
                        );
                      })}
                      <td className="py-3 px-4 text-right font-mono font-extrabold text-sm text-purple-800 bg-purple-200/60">
                        {filteredTotals.totalFormatted}
                      </td>
                    </tr>
                    {/* Overall Weekly Total */}
                    <tr className="bg-slate-100/90 border-t border-slate-200 text-slate-700 font-semibold text-[11px]">
                      <td className="py-2.5 px-4 font-semibold text-slate-600">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>Overall Intern Weekly Total</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            (All {taskRows.length} tasks)
                          </span>
                        </div>
                      </td>
                      {displayedDays.map((d) => {
                        const dayTotal = timesheet?.daily_totals?.[d.date] || 0;
                        return (
                          <td key={d.date} className="py-2.5 px-2 text-center font-mono font-bold text-slate-700">
                            {dayTotal > 0 ? formatMinutes(dayTotal) : '—'}
                          </td>
                        );
                      })}
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900 bg-slate-200/60">
                        {timesheet?.total_formatted || '0h 0m'}
                      </td>
                    </tr>
                  </>
                ) : (
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
                )}
              </tfoot>
            </table>
          </div>
        )}

        {/* PAGINATION / EDITABLE ROWS PER PAGE CONTROLS */}
        {!loading && taskRows.length > 0 && filteredTaskRows.length > 0 && (
          <div className="p-3 sm:px-4 border-t border-slate-200/80 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-600">
            <div className="flex items-center gap-2 flex-wrap">
              <span>Rows per page:</span>
              <select
                value={isCustomPageSize || (![15, 30, 50, 'ALL'].includes(pageSize)) ? 'CUSTOM' : pageSize}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'CUSTOM') {
                    setIsCustomPageSize(true);
                    const fallback = typeof pageSize === 'number' && pageSize > 0 ? pageSize : 20;
                    setCustomPageSizeInput(String(fallback));
                    setPageSize(fallback);
                    setPageSizeError('');
                    setCurrentPage(1);
                  } else {
                    setIsCustomPageSize(false);
                    setPageSizeError('');
                    const numVal = val === 'ALL' ? 'ALL' : Number(val);
                    setPageSize(numVal);
                    setCurrentPage(1);
                  }
                }}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:border-purple-600 cursor-pointer shadow-2xs"
              >
                <option value={15}>15</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
                <option value="ALL">All ({filteredTaskRows.length})</option>
                <option value="CUSTOM">Custom...</option>
              </select>

              {isCustomPageSize && (
                <div className="inline-flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    max="200"
                    value={customPageSizeInput}
                    onChange={(e) => handleCustomPageSizeChange(e.target.value)}
                    className={`w-16 px-2 py-1 rounded-lg border text-xs font-semibold text-slate-800 focus:outline-none shadow-2xs ${
                      pageSizeError ? 'border-rose-400 bg-rose-50/50 ring-1 ring-rose-400/30' : 'border-purple-300 bg-white ring-1 ring-purple-600/20'
                    }`}
                    placeholder="1–200"
                    title="Custom rows per page (1–200)"
                  />
                  {pageSizeError && (
                    <span className="text-[10px] text-rose-600 font-semibold">{pageSizeError}</span>
                  )}
                </div>
              )}

              <span className="text-slate-300">|</span>
              <span>
                Showing{' '}
                <span className="font-bold text-slate-800">
                  {filteredTaskRows.length === 0
                    ? 0
                    : pageSize === 'ALL'
                    ? `1 – ${filteredTaskRows.length}`
                    : `${(currentPage - 1) * Number(pageSize) + 1} – ${Math.min(currentPage * Number(pageSize), filteredTaskRows.length)}`}
                </span>{' '}
                of <span className="font-bold text-slate-800">{filteredTaskRows.length}</span>
              </span>
            </div>

            {pageSize !== 'ALL' && totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 font-medium">
                  Page <span className="font-bold text-slate-800">{currentPage}</span> of{' '}
                  <span className="font-bold text-slate-800">{totalPages}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Next Page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4B. EXPANDABLE CALENDAR-WEEK BREAKDOWN (Month View Only) */}
      {viewMode === 'MONTH' && !loading && taskRows.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-600" />
                <span>Calendar-Week Breakdown</span>
                <span className="text-[11px] font-normal text-slate-500 font-mono">
                  ({timesheet?.weeks?.length || monthInfo.weeks.length} calendar weeks)
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Click any day cell to add or review task time entries. Out-of-month days are shaded and excluded from monthly totals.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleAllWeeks(true)}
                className="px-2.5 py-1 text-[11px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors cursor-pointer"
              >
                Expand All
              </button>
              <button
                type="button"
                onClick={() => toggleAllWeeks(false)}
                className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Collapse All
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {(timesheet?.weeks || []).map((wg) => {
              const isExpanded = expandedWeeks[wg.week_number] !== false;
              const weekFilteredTasks = (wg.task_rows || []).filter((task) => {
                if (statusFilter !== 'ALL' && (task.status || 'TODO').toUpperCase() !== statusFilter) return false;
                if (priorityFilter !== 'ALL' && (task.priority || 'MEDIUM').toUpperCase() !== priorityFilter) return false;
                if (timeFilter === 'LOGGED' && (task.week_minutes || 0) <= 0) return false;
                if (timeFilter === 'NO_LOGGED' && (task.week_minutes || 0) > 0) return false;
                if (taskSearchQuery.trim()) {
                  const q = taskSearchQuery.trim().toLowerCase();
                  const titleMatch = (task.title || '').toLowerCase().includes(q);
                  const keyMatch = (task.key || task.id || '').toLowerCase().includes(q);
                  const projMatch = (task.project?.name || '').toLowerCase().includes(q);
                  if (!titleMatch && !keyMatch && !projMatch) return false;
                }
                return true;
              });

              return (
                <div
                  key={wg.week_number}
                  className="border border-slate-200/90 rounded-xl overflow-hidden bg-white shadow-2xs"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleWeekExpanded(wg.week_number)}
                    onKeyDown={(e) => {
                      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        toggleWeekExpanded(wg.week_number);
                      }
                    }}
                    className="px-4 py-3 bg-slate-50/90 hover:bg-slate-100/80 transition-colors flex items-center justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3">
                      <span className="p-1.5 rounded-lg bg-purple-100 text-purple-700">
                        <Clock className="w-3.5 h-3.5" />
                      </span>
                      <div>
                        <div className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-2 flex-wrap">
                          <span>{wg.label}</span>
                          <span className="text-[10px] font-mono text-slate-400 font-normal">
                            ({wg.start_date} – {wg.end_date})
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {weekFilteredTasks.length} {weekFilteredTasks.length === 1 ? 'task' : 'tasks'} worked · {wg.total_formatted} logged
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono font-extrabold text-xs sm:text-sm text-purple-700 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200">
                        {wg.total_formatted}
                      </span>
                      <button
                        type="button"
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                        aria-label={isExpanded ? 'Collapse week' : 'Expand week'}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-slate-200/80 overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-slate-50/80 text-slate-600 font-bold text-[11px] border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-4 min-w-[240px]">Task & Deliverable</th>
                            {wg.days.map((d) => (
                              <th
                                key={d.date}
                                className={`py-2 px-2 text-center min-w-[75px] ${
                                  !d.in_month
                                    ? 'bg-slate-100/70 text-slate-400'
                                    : d.isToday
                                    ? 'bg-purple-100/60 text-purple-900 font-extrabold'
                                    : ''
                                }`}
                              >
                                <span className="block text-[10px] uppercase">{d.dayName}</span>
                                <span className="text-xs font-bold">{d.dayNumber}</span>
                                {!d.in_month && (
                                  <span className="block text-[9px] font-medium text-slate-400 uppercase tracking-tighter">
                                    Excl.
                                  </span>
                                )}
                              </th>
                            ))}
                            <th className="py-2.5 px-4 text-right min-w-[90px] bg-slate-100/80 font-bold">
                              Week Total
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {weekFilteredTasks.length === 0 ? (
                            <tr>
                              <td colSpan={wg.days.length + 2} className="py-6 text-center text-slate-400 italic">
                                No time logged for this week matching current filters.
                              </td>
                            </tr>
                          ) : (
                            weekFilteredTasks.map((task) => {
                              const statusBadge = getStatusBadge(task.status);
                              const priorityBadge = getPriorityBadge(task.priority);
                              return (
                                <tr key={task.id} className="hover:bg-purple-50/20">
                                  <td className="py-2.5 px-4">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase inline-flex items-center gap-1 ${statusBadge.bg}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dot}`}></span>
                                        <span>{statusBadge.label}</span>
                                      </span>
                                      <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase inline-flex items-center gap-1 ${priorityBadge.bg}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${priorityBadge.dot}`}></span>
                                        <span>{priorityBadge.label}</span>
                                      </span>
                                      {task.project?.name && (
                                        <span className="text-[10px] text-slate-400 font-medium">
                                          {task.project.name}
                                        </span>
                                      )}
                                    </div>
                                    <div className="font-semibold text-slate-900 mt-1 truncate max-w-sm">
                                      {task.title}
                                    </div>
                                  </td>
                                  {wg.days.map((d) => {
                                    const cellMins = task.days?.[d.date]?.minutes || 0;
                                    return (
                                      <td
                                        key={d.date}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => handleOpenCell(task, d.date, d)}
                                        onKeyDown={(e) => {
                                          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                                            e.preventDefault();
                                            handleOpenCell(task, d.date, d);
                                          }
                                        }}
                                        className={`py-2 px-2 text-center cursor-pointer transition-colors ${
                                          !d.in_month
                                            ? 'bg-slate-50/50 text-slate-300 opacity-60'
                                            : cellMins > 0
                                            ? 'bg-purple-50/60 hover:bg-purple-100 font-mono font-bold text-purple-900'
                                            : 'hover:bg-slate-50 text-slate-300'
                                        }`}
                                        title={
                                          !d.in_month
                                            ? `${d.date} is outside ${monthInfo.monthName}`
                                            : `Click to log or inspect entries for ${task.title} on ${d.date}`
                                        }
                                      >
                                        {cellMins > 0 ? (
                                          <span className="inline-block px-1.5 py-0.5 rounded bg-purple-100/80 text-purple-900 border border-purple-200/80 font-mono text-xs">
                                            {formatMinutes(cellMins)}
                                          </span>
                                        ) : (
                                          '—'
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900 bg-slate-50/50">
                                    {formatMinutes(task.week_minutes || 0)}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-50/90 font-bold border-t border-slate-200 text-slate-800">
                            <td className="py-2.5 px-4 font-bold text-slate-700">Daily Total</td>
                            {wg.days.map((d) => (
                              <td
                                key={d.date}
                                className={`py-2 px-2 text-center font-mono font-extrabold ${
                                  !d.in_month ? 'text-slate-400 bg-slate-100/50' : 'text-purple-900'
                                }`}
                              >
                                {d.total_minutes > 0 ? formatMinutes(d.total_minutes) : '—'}
                              </td>
                            ))}
                            <td className="py-2.5 px-4 text-right font-mono font-extrabold text-purple-900 bg-purple-100/60">
                              {wg.total_formatted}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

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
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(entry, cellModalData.task)}
                              title="Edit this time entry"
                              className="px-2.5 py-1 rounded-lg text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200/80 transition-colors flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                            >
                              <Pencil className="w-3 h-3 text-purple-600" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                handleOpenCorrectionModal(entry, cellModalData.task);
                              }}
                              title="Request correction for this entry"
                              className="px-2 py-1 rounded-lg text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 transition-colors flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3 text-amber-600" />
                              <span>Correct</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => { void handleDeleteEntry(entry.id); }}
                              disabled={actionLoading}
                              title="Delete entry"
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setCellModalData(null)}
                  className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 font-semibold text-slate-700 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5B. MONTH VIEW: WEEK DETAIL MODAL */}
      {weekModalData && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden text-xs flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/70">
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-purple-700 uppercase tracking-wider">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>
                    {weekModalData.weekGroup.label || `Week ${weekModalData.weekGroup.week_number ?? weekModalData.weekGroup.weekNumber}`}
                    {' • '}
                    {weekModalData.weekGroup.start_date} to {weekModalData.weekGroup.end_date}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <h3 className="text-sm font-bold text-slate-900 truncate">
                    {weekModalData.task.title}
                  </h3>
                  {weekModalData.task.project?.name && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold text-[10px]">
                      {weekModalData.task.project.name}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-xl bg-purple-100 text-purple-900 font-extrabold font-mono text-xs border border-purple-200">
                  {formatMinutes(weekModalData.weekMins)}
                </span>
                <button
                  type="button"
                  onClick={() => setWeekModalData(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content Body */}
            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Daily Breakdown & Logged Entries
                </h4>

                {weekModalData.weekMins === 0 ? (
                  <p className="text-slate-400 italic py-3 text-center bg-slate-50 rounded-xl border border-slate-100">
                    No effort logged for this task during this week.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {(weekModalData.weekGroup?.days || []).map((dStr) => {
                      const dayData = weekModalData.task.days?.[dStr] || { minutes: 0, entries: [] };
                      if (dayData.minutes === 0 && (!dayData.entries || dayData.entries.length === 0)) {
                        return null;
                      }
                      const dObj = new Date(dStr + 'T00:00:00');
                      const dayLabel = dObj.toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      });

                      return (
                        <div
                          key={dStr}
                          className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-2.5 space-y-2"
                        >
                          <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                            <span>{dayLabel}</span>
                            <span className="font-mono font-bold text-purple-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                              {formatMinutes(dayData.minutes)}
                            </span>
                          </div>

                          {dayData.entries && dayData.entries.length > 0 ? (
                            <div className="space-y-1.5 pt-1">
                              {dayData.entries.map((entry) => (
                                <div
                                  key={entry.id}
                                  className="p-2 rounded-lg bg-white border border-slate-200/60 flex items-center justify-between gap-2"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono font-bold text-slate-900 text-xs">
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
                                      <p className="text-slate-600 mt-0.5 italic text-[11px] truncate">
                                        &quot;{entry.notes}&quot;
                                      </p>
                                    )}
                                  </div>

                                  {!readOnly && (
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditModal(entry, weekModalData.task)}
                                        title="Edit this time entry"
                                        className="px-2 py-0.5 rounded text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200/80 transition-colors flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                                      >
                                        <Pencil className="w-2.5 h-2.5 text-purple-600" />
                                        <span>Edit</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenCorrectionModal(entry, weekModalData.task)}
                                        title="Request correction for this entry"
                                        className="px-2 py-0.5 rounded text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 transition-colors flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                                      >
                                        <RotateCcw className="w-2.5 h-2.5 text-amber-600" />
                                        <span>Correct</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => { void handleDeleteEntry(entry.id); }}
                                        disabled={actionLoading}
                                        title="Delete entry"
                                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-400 italic">No entry details recorded.</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

               <div className="pt-3 border-t border-slate-100 flex justify-end">
                 <button
                   type="button"
                   onClick={() => setWeekModalData(null)}
                   className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 font-semibold text-slate-700 cursor-pointer"
                 >
                   Close
                 </button>
               </div>
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
                <label htmlFor="manual-log-task" className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Select Task *
                </label>
                {availableTasks.length > 0 ? (
                  <select
                    id="manual-log-task"
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
                    id="manual-log-task"
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
                <label htmlFor="manual-log-date" className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Date *
                </label>
                <input
                  id="manual-log-date"
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
                  <label htmlFor="manual-log-hours" className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Hours
                  </label>
                  <input
                    id="manual-log-hours"
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
                  <label htmlFor="manual-log-minutes" className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Minutes
                  </label>
                  <input
                    id="manual-log-minutes"
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
                <label htmlFor="manual-log-notes" className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  id="manual-log-notes"
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

      {/* 7. START TASK TIMER MODAL (Intern Only) */}
      {!readOnly && isStartTimerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden text-xs">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded bg-emerald-100 text-emerald-700">
                  <Play className="w-3.5 h-3.5 fill-current" />
                </span>
                <h3 className="text-sm font-bold text-slate-900">
                  Start Task Timer
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsStartTimerModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!startTimerTaskId) {
                  alert('Please select a task.');
                  return;
                }
                setIsStartTimerModalOpen(false);
                await handleStartTimer(startTimerTaskId);
              }}
              className="p-5 space-y-4"
            >
              <div>
                <label htmlFor="start-timer-task-select" className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Select Task to Track *
                </label>
                {availableTasks.length > 0 ? (
                  <select
                    id="start-timer-task-select"
                    value={startTimerTaskId}
                    onChange={(e) => setStartTimerTaskId(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:border-purple-600"
                  >
                    <option value="">-- Choose an assigned task --</option>
                    {availableTasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} {t.project?.name ? `(${t.project.name})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={startTimerTaskId}
                    onChange={(e) => setStartTimerTaskId(e.target.value)}
                    placeholder="Task ID"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:border-purple-600 font-mono"
                  />
                )}
                <p className="text-[10px] text-slate-400 mt-1.5">
                  You can manually start a timer anytime. Daytime sessions will automatically clock at 18:15 if left unattended so unworked time isn't recorded.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsStartTimerModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || Boolean(timerActionTaskId) || !startTimerTaskId}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Start Working</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. TIME CORRECTION REQUEST MODAL (Intern Only) */}
      {!readOnly && isCorrectionModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden text-xs">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-amber-50/70">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-amber-100 text-amber-700">
                  <RotateCcw className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Request Time Correction
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Request removal of accidental or extra recorded time
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCorrectionModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCorrectionSubmit} className="p-5 space-y-4">
              {correctionError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{correctionError}</span>
                </div>
              )}

              {/* Entry selector if choosing from multiple */}
              <div>
                <label htmlFor="correction-entry-select" className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Recorded Work Session / Entry *
                </label>
                {allWeekEntries.length > 0 ? (
                  <select
                    id="correction-entry-select"
                    value={correctionEntry?.id || ''}
                    onChange={(e) => {
                      const found = allWeekEntries.find((ent) => ent.id === e.target.value);
                      if (found) {
                        setCorrectionEntry(found);
                        setCorrectionExcessMinutes(Math.min(30, Math.max(5, Math.floor((found.duration_minutes || 30) / 2))));
                      } else {
                        setCorrectionEntry(null);
                      }
                    }}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:border-amber-500"
                  >
                    <option value="">-- Choose a recorded entry to correct --</option>
                    {allWeekEntries.map((ent) => (
                      <option key={ent.id} value={ent.id}>
                        {ent.date_str} · {ent.task_title} ({formatMinutes(ent.duration_minutes)})
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-slate-500 italic py-1">No recorded time entries in this week to correct.</p>
                )}
              </div>

              {correctionEntry && (
                <>
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Original Recorded Time:</span>
                      <span className="font-bold text-slate-900 font-mono text-xs">
                        {formatMinutes(correctionEntry.duration_minutes || 0)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span>Requested Excess to Deduct:</span>
                      <span className="font-bold text-rose-600 font-mono text-xs">
                        -{formatMinutes(correctionExcessMinutes)}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between font-bold">
                      <span className="text-slate-800">New Corrected Time:</span>
                      <span className="text-emerald-700 font-mono text-sm">
                        {formatMinutes(Math.max(0, (correctionEntry.duration_minutes || 0) - correctionExcessMinutes))}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="correction-excess-minutes-input" className="text-[11px] font-semibold text-slate-700">
                        Excess Minutes to Remove (Deduct) *
                      </label>
                      <span className="text-[10px] text-slate-400">
                        Max: {(correctionEntry.duration_minutes || 1) - 1}m
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        id="correction-excess-minutes-input"
                        type="number"
                        min="1"
                        max={(correctionEntry.duration_minutes || 1) - 1}
                        value={correctionExcessMinutes}
                        onChange={(e) => setCorrectionExcessMinutes(Number(e.target.value) || 0)}
                        required
                        className="w-28 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:border-amber-500 font-mono text-xs"
                      />
                      <span className="text-slate-500 text-xs">mins</span>
                      <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                        {[15, 30, 45, 60].map((mins) => (
                          (correctionEntry.duration_minutes || 0) > mins && (
                            <button
                              key={mins}
                              type="button"
                              onClick={() => setCorrectionExcessMinutes(mins)}
                              className={`px-2 py-0.5 rounded-lg border text-[10px] font-medium transition-colors cursor-pointer ${
                                correctionExcessMinutes === mins
                                  ? 'bg-amber-100 border-amber-300 text-amber-800 font-bold'
                                  : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-600'
                              }`}
                            >
                              {mins}m
                            </button>
                          )
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="correction-reason-input" className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Reason for Correction *
                    </label>
                    <textarea
                      id="correction-reason-input"
                      rows={3}
                      value={correctionReason}
                      onChange={(e) => setCorrectionReason(e.target.value)}
                      placeholder="e.g., Accidentally left timer running while stepped away from workstation"
                      required
                      minLength={5}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:border-amber-500 text-xs placeholder:text-slate-400"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Your manager will receive a notification to review and approve this correction.
                    </p>
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCorrectionModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={correctionSubmitting || !correctionEntry || correctionExcessMinutes <= 0 || !correctionReason.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{correctionSubmitting ? 'Submitting...' : 'Submit Request'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. EDIT LOGGED TIME ENTRY MODAL */}
      {!readOnly && Boolean(editingEntry) && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden text-xs">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-purple-100 text-purple-700">
                  <Pencil className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Edit Time Entry</h3>
                  <p className="text-[11px] text-slate-500">Modify logged effort duration, date, or task</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditEntry} className="p-4 space-y-3.5">
              {editError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{editError}</span>
                </div>
              )}

              {/* Task Select */}
              <div>
                <label htmlFor="edit-entry-task" className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Task
                </label>
                {availableTasks.length > 0 ? (
                  <select
                    id="edit-entry-task"
                    value={editTaskId}
                    onChange={(e) => setEditTaskId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:border-purple-500"
                  >
                    {availableTasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} {t.project?.name ? `(${t.project.name})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 font-medium">
                    {editingEntry?.task_title || 'Current Task'}
                  </div>
                )}
              </div>

              {/* Date Input */}
              <div>
                <label htmlFor="edit-entry-date" className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Date *
                </label>
                <input
                  id="edit-entry-date"
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Duration Inputs: Hours and Minutes */}
              <div>
                <span className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Duration *
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max="24"
                        value={editHours}
                        onChange={(e) => setEditHours(e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:border-purple-500 font-mono"
                      />
                      <span className="text-slate-500 text-xs font-medium">hrs</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={editMinutes}
                        onChange={(e) => setEditMinutes(e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:border-purple-500 font-mono"
                      />
                      <span className="text-slate-500 text-xs font-medium">mins</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className="text-[10px] text-slate-400 mr-1">Quick presets:</span>
                  {[
                    { label: '30m', h: '0', m: '30' },
                    { label: '1h', h: '1', m: '0' },
                    { label: '1.5h', h: '1', m: '30' },
                    { label: '2h', h: '2', m: '0' },
                    { label: '4h', h: '4', m: '0' },
                    { label: '8h', h: '8', m: '0' },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setEditHours(preset.h);
                        setEditMinutes(preset.m);
                      }}
                      className="px-2 py-0.5 rounded-lg border border-slate-200 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700 text-slate-600 text-[10px] font-medium transition-colors cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Duration must be greater than 0 minutes.
                </p>
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="edit-entry-notes" className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Notes / Description
                </label>
                <textarea
                  id="edit-entry-notes"
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Optional description of work done..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:border-purple-500 text-xs placeholder:text-slate-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  disabled={editSubmitting}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {editSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
