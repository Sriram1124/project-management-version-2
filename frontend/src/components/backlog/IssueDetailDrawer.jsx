import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  X, 
  Check, 
  Trash2, 
  Plus, 
  CornerDownRight, 
  Clock, 
  User, 
  Bookmark, 
  CheckSquare, 
  AlertCircle,
  MessageSquare,
  History,
  Activity,
  Calendar,
  GitFork,
  Play,
  Square,
  Timer,
  Loader2
} from 'lucide-react';
import { getEpicSprintSummary } from './HierarchicalIssueTable';
import { useAuth } from '../../context/AuthContext';
import { timesheetService } from '../../services/timesheet.service';
import { workItemsService } from '../../services/workItems.service';
import WorkItemComments from '../common/WorkItemComments';
import { getSessionCutoffMs } from '../views/TimesheetView';
import { formatHoursMinutes } from '../../utils/time';

export default function IssueDetailDrawer({
  issue,
  epics = [],
  sprints = [],
  members = [],
  workItems = [],
  isKanban = false,
  isOpen,
  onClose,
  onUpdateIssue,
  onDeleteIssue,
  onToggleSubtask,
  onAddSubtask,
}) {
  const Term = isKanban ? 'Cycle' : 'Sprint';
  const { user: authUser } = useAuth();
  const authRole = String(
    authUser?.role?.name || authUser?.role || authUser?.type || authUser?.user_type || ''
  ).toUpperCase();
  const currentUserId = authUser?.id || authUser?.user_id;

  // Resolve project membership and lead/management permissions
  const currentMember = useMemo(() => {
    if (!currentUserId || !Array.isArray(members)) return null;
    return members.find((m) => (m.user_id || m.id) === currentUserId);
  }, [members, currentUserId]);

  const memberRole = String(
    currentMember?.project_role || currentMember?.role || ''
  ).toUpperCase();

  const isTechLead =
    authRole === 'TECH_LEAD' ||
    Boolean(authUser?.is_tech_lead) ||
    memberRole === 'TECH_LEAD' ||
    Boolean(currentMember?.is_tech_lead);

  const isStory = String(issue?.type || '').toUpperCase() === 'STORY';
  const isManagerUser = authRole === 'MANAGER' || memberRole === 'MANAGER';
  const isWorklogHidden = isStory && isManagerUser;
  const isManagerOrAdmin =
    authRole === 'MANAGER' ||
    authRole === 'ADMIN' ||
    authRole === 'SUPER_ADMIN' ||
    Boolean(authUser?.is_admin) ||
    Boolean(authUser?.is_super_admin);

  const canManageProject = isManagerOrAdmin || isTechLead;

  const memberPerms = useMemo(() => {
    const list = currentMember?.role_details?.permissions || currentMember?.permissions || [];
    return new Set(list.map((p) => String(p).toUpperCase()));
  }, [currentMember]);

  const hasTaskCreate = canManageProject || memberPerms.has('TASK_CREATE');
  const hasTaskUpdate = canManageProject || memberPerms.has('TASK_UPDATE');
  const hasTaskDelete = canManageProject || memberPerms.has('TASK_DELETE') || memberPerms.has('TASK_UPDATE');

  const isManager = authRole === 'MANAGER' || isManagerUser || isManagerOrAdmin;
  // User is a restricted intern only if they have INTERN role and cannot manage the project
  const isIntern = authRole === 'INTERN' && !canManageProject;

  const isAssignedToMe = useMemo(() => {
    if (!issue || !currentUserId) return false;
    if (issue.assignee && (issue.assignee.id === currentUserId || issue.assignee.user_id === currentUserId)) return true;
    if (issue.assigneeId === currentUserId || issue.assignee_id === currentUserId) return true;
    if (Array.isArray(issue.assignees)) {
      return issue.assignees.some((a) => (a.id === currentUserId || a.user_id === currentUserId));
    }
    return false;
  }, [issue, currentUserId]);

  const currentAssigneeId = useMemo(() => {
    if (!issue) return '';
    if (issue.assignee?.user_id) return String(issue.assignee.user_id);
    if (issue.assignee?.id) return String(issue.assignee.id);
    if (Array.isArray(issue.assignees) && issue.assignees.length > 0) {
      const first = issue.assignees[0];
      return String(first.user_id || first.id || '');
    }
    if (issue.assignee_id) return String(issue.assignee_id);
    if (issue.assigneeId) return String(issue.assigneeId);
    return '';
  }, [issue]);

  const currentAssignee = useMemo(() => {
    if (!issue) return null;
    if (issue.assignee && (issue.assignee.name || issue.assignee.user?.name)) {
      return issue.assignee;
    }
    if (Array.isArray(issue.assignees) && issue.assignees.length > 0) {
      return issue.assignees[0];
    }
    if (currentAssigneeId) {
      const match = members.find((m) => (m.user_id || m.id) === currentAssigneeId);
      if (match) return match;
    }
    return null;
  }, [issue, currentAssigneeId, members]);

  const isCreator = Boolean(
    currentUserId &&
    (issue?.created_by === currentUserId || issue?.creator_id === currentUserId || issue?.creator?.id === currentUserId)
  );

  const canDelete = !isIntern && (canManageProject || hasTaskDelete || isCreator);
  const canEditTitleAndDesc = !isIntern && (canManageProject || hasTaskUpdate);
  const canChangeStatus = !isIntern ? (canManageProject || hasTaskUpdate) : isAssignedToMe;
  const canCompleteStatus = canManageProject;
  const canChangePriority = !isIntern && (canManageProject || hasTaskUpdate);
  const canChangeAssignee = !isIntern && (canManageProject || hasTaskUpdate || memberPerms.has('ROLE_ASSIGN'));
  const canChangeSprint = !isIntern && (canManageProject || hasTaskUpdate);
  const canChangeEpic = !isIntern && (canManageProject || hasTaskUpdate);
  const canChangeStoryPoints = !isIntern && (canManageProject || hasTaskUpdate);
  const canChangeDueDate = !isIntern && (canManageProject || hasTaskUpdate);
  const canAddChildItems = !isIntern && (canManageProject || hasTaskCreate);

  const [actionError, setActionError] = useState(null);
  useEffect(() => {
    setActionError(null);
  }, [isOpen, issue?.id]);

  const [updatingField, setUpdatingField] = useState(null); // 'assignee' | 'status' | 'priority' | 'sprint' | 'epic' | 'storyPoints' | 'dueDate' | 'title' | 'description'
  const [activeTab, setActiveTab] = useState('comments');
  useEffect(() => {
    if (isWorklogHidden && activeTab === 'worklog') {
      setActiveTab('comments');
    }
  }, [isWorklogHidden, activeTab]);
 // 'comments' | 'worklog' | 'history'
  const [editedTitle, setEditedTitle] = useState(issue?.title || '');
  const [editedDesc, setEditedDesc] = useState(issue?.description || '');
  const [editedStoryPoints, setEditedStoryPoints] = useState(
    issue?.story_points ?? issue?.storyPoints ?? ''
  );
  const [childPoints, setChildPoints] = useState(3);
  const [newComment, setNewComment] = useState('');
  const [comments, setComments] = useState([
    { id: 'c1', author: 'Priya Sharma', time: 'Yesterday at 3:45 PM', text: 'Please ensure migration handles foreign key cascade deletes properly.' }
  ]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [childType, setChildType] = useState('SUBTASK');

  // Extension request management
  const [extensionRequests, setExtensionRequests] = useState([]);
  const [loadingExtensions, setLoadingExtensions] = useState(false);
  const [decisionNote, setDecisionNote] = useState('');
  const [decidingId, setDecidingId] = useState(null);
  const [isExtensionModalOpen, setIsExtensionModalOpen] = useState(false);
  const [requestedDueDate, setRequestedDueDate] = useState('');
  const [extensionReason, setExtensionReason] = useState('');
  const [extensionSubmitting, setExtensionSubmitting] = useState(false);
  const [extensionError, setExtensionError] = useState('');

  const loadIssueExtensions = useCallback(async () => {
    if (!issue?.id) return;
    try {
      setLoadingExtensions(true);
      const res = await workItemsService.getExtensionRequests(issue.id);
      setExtensionRequests(Array.isArray(res) ? res : []);
    } catch {
      setExtensionRequests([]);
    } finally {
      setLoadingExtensions(false);
    }
  }, [issue?.id]);

  useEffect(() => {
    if (isOpen && issue?.id) {
      loadIssueExtensions();
      setDecisionNote('');
    }
  }, [isOpen, issue?.id, loadIssueExtensions]);

  const pendingExtension = extensionRequests.find((r) => r.status === 'PENDING') || issue?.pending_extension || null;
  const latestReviewedExtension = extensionRequests.find((r) => r.status !== 'PENDING') || null;
  const isManagerOrLead = authUser?.role === 'MANAGER' || authUser?.role === 'ADMIN' || authUser?.role === 'TECH_LEAD';

  const handleDecideExtension = async (decision) => {
    const pendingReq = extensionRequests.find((r) => r.status === 'PENDING') || issue?.pending_extension;
    if (!pendingReq || !issue?.id) return;
    try {
      setDecidingId(pendingReq.id);
      const res = await workItemsService.decideExtension(issue.id, pendingReq.id, {
        decision,
        decision_note: decisionNote.trim() || undefined,
      });
      await loadIssueExtensions();
      setDecisionNote('');
      if (res.work_item) {
        onUpdateIssue?.(res.work_item);
      } else {
        const nextDate = decision === 'APPROVE' && pendingReq.requested_due_date ? pendingReq.requested_due_date : issue.due_date;
        onUpdateIssue?.({
          ...issue,
          due_date: nextDate,
          dueDate: nextDate,
          has_pending_extension: false,
          pending_extension: null,
        });
      }
    } catch (err) {
      setActionError(err?.response?.data?.message || err?.message || 'Failed to update extension request');
    } finally {
      setDecidingId(null);
    }
  };

  const handleInternRequestExtension = async (e) => {
    e?.preventDefault();
    setExtensionError('');
    if (!requestedDueDate) {
      setExtensionError('Please select a new requested due date.');
      return;
    }
    const currentDue = issue.due_date ? new Date(issue.due_date).getTime() : 0;
    const chosen = new Date(requestedDueDate).getTime();
    if (issue.due_date && chosen <= currentDue) {
      setExtensionError('Requested due date must be later than the current due date.');
      return;
    }
    if (!issue.due_date && chosen <= Date.now()) {
      setExtensionError('Requested due date must be in the future.');
      return;
    }
    if (!extensionReason || !extensionReason.trim()) {
      setExtensionError('Reason is mandatory.');
      return;
    }
    try {
      setExtensionSubmitting(true);
      const res = await workItemsService.requestExtension(issue.id, {
        requested_due_date: new Date(requestedDueDate).toISOString(),
        reason: extensionReason.trim(),
      });
      setIsExtensionModalOpen(false);
      setRequestedDueDate('');
      setExtensionReason('');
      await loadIssueExtensions();
      onUpdateIssue?.({
        ...issue,
        has_pending_extension: true,
        pending_extension: res,
      });
    } catch (err) {
      setExtensionError(err.message || 'Failed to submit extension request');
    } finally {
      setExtensionSubmitting(false);
    }
  };

  const allowedChildTypes = React.useMemo(() => {
    const t = String(issue?.type || '').toUpperCase();
    if (t === 'EPIC') {
      return ['STORY', 'BUG'];
    }
    if (t === 'STORY') {
      return ['TASK'];
    }
    if (t === 'TASK') {
      return ['SUBTASK'];
    }
    return [];
  }, [issue?.type]);

  useEffect(() => {
    if (allowedChildTypes.length > 0) {
      setChildType(allowedChildTypes[0]);
    }
  }, [allowedChildTypes]);

  useEffect(() => {
    if (issue) {
      setEditedTitle(issue.title || '');
      setEditedDesc(issue.description || '');
      setEditedStoryPoints(issue.story_points ?? issue.storyPoints ?? '');
    }
  }, [issue]);

  // Time tracking states
  const [activeSession, setActiveSession] = useState(null);
  const [elapsedText, setElapsedText] = useState('00:00:00');
  const [timeEntries, setTimeEntries] = useState([]);
  const [totalLoggedMinutes, setTotalLoggedMinutes] = useState(0);
  const [loadingTime, setLoadingTime] = useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [logHours, setLogHours] = useState('');
  const [logMinutes, setLogMinutes] = useState('30');
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [logNotes, setLogNotes] = useState('');
  const [timeActionLoading, setTimeActionLoading] = useState(false);

  const loadTaskTimeData = useCallback(async () => {
    if (!issue?.id) return;
    try {
      setLoadingTime(true);
      const [sessionRes, entriesRes] = await Promise.all([
        timesheetService.getActiveTaskSession(issue.id).catch(() => null),
        timesheetService.getTaskEntries(issue.id).catch(() => null),
      ]);
      setActiveSession(sessionRes?.session || null);
      setTimeEntries(entriesRes?.entries || []);
      setTotalLoggedMinutes(entriesRes?.total_minutes || 0);
    } catch (err) {
      console.error('Failed to load task time data:', err);
    } finally {
      setLoadingTime(false);
    }
  }, [issue?.id]);

  useEffect(() => {
    if (isOpen && issue?.id) {
      loadTaskTimeData();
    }
  }, [isOpen, issue?.id, loadTaskTimeData]);

  useEffect(() => {
    if (!isOpen || !issue?.id) return;
    const handleSync = () => {
      loadTaskTimeData();
    };

    window.addEventListener('timer-session-updated', handleSync);
    window.addEventListener('focus', handleSync);
    const handleVis = () => {
      if (document.visibilityState === 'visible') {
        handleSync();
      }
    };
    document.addEventListener('visibilitychange', handleVis);

    return () => {
      window.removeEventListener('timer-session-updated', handleSync);
      window.removeEventListener('focus', handleSync);
      document.removeEventListener('visibilitychange', handleVis);
    };
  }, [isOpen, issue?.id, loadTaskTimeData]);

  useEffect(() => {
    if (!activeSession?.started_at) {
      setElapsedText('00:00:00');
      return;
    }
    const updateElapsed = () => {
      const start = new Date(activeSession.started_at).getTime();
      const cutoff = getSessionCutoffMs(activeSession.started_at);
      const effectiveEnd = cutoff && Date.now() > cutoff ? cutoff : Date.now();
      const diffSecs = Math.max(0, Math.floor((effectiveEnd - start) / 1000));
      const hrs = Math.floor(diffSecs / 3600);
      const mins = Math.floor((diffSecs % 3600) / 60);
      const secs = diffSecs % 60;
      setElapsedText(`${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
      if (cutoff && Date.now() >= cutoff) {
        loadTaskTimeData();
      }
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [activeSession, loadTaskTimeData]);

  const handleStartTaskTimer = async () => {
    if (isManager) {
      alert('Managers do not have permission to start timers on tasks');
      return;
    }
    try {
      setTimeActionLoading(true);
      const res = await timesheetService.startSession({ task_id: issue.id });
      setActiveSession(res?.session || null);
      await loadTaskTimeData();
    } catch (err) {
      alert(err.message || 'Unable to start timer');
    } finally {
      setTimeActionLoading(false);
    }
  };

  const handleStopTaskTimer = async () => {
    try {
      setTimeActionLoading(true);
      await timesheetService.endSession({ task_id: issue.id });
      setActiveSession(null);
      await loadTaskTimeData();
    } catch (err) {
      alert(err.message || 'Unable to stop timer');
    } finally {
      setTimeActionLoading(false);
    }
  };

  const handleSaveWorklog = async (e) => {
    e.preventDefault();
    if (isManager) {
      alert('Managers do not have permission to log time on tasks');
      return;
    }
    const hours = Number.parseInt(logHours, 10) || 0;
    const minutes = Number.parseInt(logMinutes, 10) || 0;
    const totalMins = hours * 60 + minutes;

    if (totalMins <= 0) {
      alert('Please enter a duration greater than 0 minutes.');
      return;
    }

    try {
      setTimeActionLoading(true);
      await timesheetService.createEntry({
        task_id: issue.id,
        date: logDate,
        duration_minutes: totalMins,
        notes: logNotes.trim() || null,
      });
      setIsLogModalOpen(false);
      setLogHours('');
      setLogMinutes('30');
      setLogNotes('');
      await loadTaskTimeData();
    } catch (err) {
      alert(err.message || 'Failed to save worklog entry');
    } finally {
      setTimeActionLoading(false);
    }
  };

  const handleDeleteWorklog = async (entryId) => {
    if (!window.confirm('Are you sure you want to delete this time entry?')) return;
    try {
      setTimeActionLoading(true);
      await timesheetService.deleteEntry(entryId);
      await loadTaskTimeData();
    } catch (err) {
      alert(err.message || 'Failed to delete time entry');
    } finally {
      setTimeActionLoading(false);
    }
  };

  // Recursively or directly resolve ancestor Epic for this issue
  const currentEpic = React.useMemo(() => {
    if (!issue) return null;

    // 1. If this issue itself is an Epic
    if (String(issue.type).toUpperCase() === 'EPIC') {
      return { id: issue.id, name: issue.title || issue.name };
    }

    // 2. Direct epicId or explicit parent is an Epic
    if (issue.epicId) {
      const match = epics.find((e) => e.id === issue.epicId);
      if (match) return match;
    }

    if (issue.parent_id) {
      const directParent = (workItems || []).find((w) => w.id === issue.parent_id);
      if (directParent) {
        if (String(directParent.type).toUpperCase() === 'EPIC') {
          return { id: directParent.id, name: directParent.title };
        }
        // If parent is a Story or Task, look up its parent (the Epic)
        if (directParent.parent_id) {
          const grandParent = (workItems || []).find((w) => w.id === directParent.parent_id);
          if (grandParent && String(grandParent.type).toUpperCase() === 'EPIC') {
            return { id: grandParent.id, name: grandParent.title };
          }
        }
      }
    }

    // 3. Fallback to direct parent if parent is in epics list
    const parentInEpics = epics.find((e) => e.id === issue.parent_id);
    if (parentInEpics) return parentInEpics;

    return null;
  }, [issue, epics, workItems]);

  const currentSprint = sprints.find(s => s.id === (issue?.sprint_id || issue?.sprintId));
  const isEpic = String(issue?.type || '').toUpperCase() === 'EPIC';
  const isTaskLike = ['TASK', 'SUBTASK', 'BUG'].includes(String(issue?.type || '').toUpperCase());
  const isApplicableType = ['TASK', 'SUBTASK', 'BUG', 'STORY'].includes(String(issue?.type || '').toUpperCase());
  const epicSprintSummary = useMemo(() => {
    if (!isEpic || !issue) return null;
    return getEpicSprintSummary(issue, workItems, sprints);
  }, [isEpic, issue, workItems, sprints]);

  const handleTitleBlur = async () => {
    if (updatingField) return;
    if (editedTitle.trim() && editedTitle !== issue?.title) {
      setUpdatingField('title');
      try {
        await onUpdateIssue?.({ ...issue, title: editedTitle.trim() }, { title: editedTitle.trim() });
      } catch (err) {
        console.error('Failed to update title:', err);
        setEditedTitle(issue?.title || '');
      } finally {
        setUpdatingField(null);
      }
    }
  };

  const handleDescBlur = async () => {
    if (updatingField) return;
    if (editedDesc !== issue?.description) {
      setUpdatingField('description');
      try {
        await onUpdateIssue?.({ ...issue, description: editedDesc }, { description: editedDesc });
      } catch (err) {
        console.error('Failed to update description:', err);
        setEditedDesc(issue?.description || '');
      } finally {
        setUpdatingField(null);
      }
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (updatingField) return;
    if (newStatus === issue?.status) return;
    if (newStatus === 'COMPLETED' && !canCompleteStatus) {
      setActionError('Only managers and tech leads can mark tasks as completed');
      return;
    }
    setUpdatingField('status');
    setActionError(null);
    try {
      await onUpdateIssue?.({ ...issue, status: newStatus }, { status: newStatus });
    } catch (err) {
      console.error('Failed to update status:', err);
      setActionError(err?.response?.data?.message || err?.message || 'Failed to update status');
    } finally {
      setUpdatingField(null);
    }
  };

  const handlePriorityChange = async (newPriority) => {
    if (updatingField) return;
    if (newPriority === issue?.priority) return;
    setUpdatingField('priority');
    try {
      await onUpdateIssue?.({ ...issue, priority: newPriority }, { priority: newPriority });
    } catch (err) {
      console.error('Failed to update priority:', err);
    } finally {
      setUpdatingField(null);
    }
  };

  const handleAssigneeChange = async (assigneeId) => {
    if (updatingField) return;
    const targetUserId = assigneeId || null;
    const previousAssigneeId = currentAssigneeId;
    if (targetUserId === previousAssigneeId) return;

    setUpdatingField('assignee');
    try {
      const user = members.find((u) => (u.user_id || u.id) === assigneeId) || null;
      const newAssignees = user
        ? [
            {
              id: user.user_id || user.id,
              user_id: user.user_id || user.id,
              name: user.name || user.user?.name || user.email || 'Member',
              email: user.email || user.user?.email || '',
            },
          ]
        : [];

      await onUpdateIssue?.({
        ...issue,
        assignee: user,
        assigneeId: targetUserId,
        assignee_id: targetUserId,
        assignees: newAssignees,
        assignee_ids: targetUserId ? [targetUserId] : [],
      });
    } catch (err) {
      console.error('Failed to update assignee:', err);
    } finally {
      setUpdatingField(null);
    }
  };

  const handleSprintChange = async (sprintVal) => {
    if (updatingField) return;
    const targetSprint = sprintVal === 'backlog' || !sprintVal ? null : sprintVal;
    const currentSprintVal = issue?.sprint_id || issue?.sprintId || null;
    if (targetSprint === currentSprintVal) return;
    setUpdatingField('sprint');
    try {
      await onUpdateIssue?.({
        ...issue,
        sprintId: targetSprint,
        sprint_id: targetSprint,
      });
    } catch (err) {
      console.error('Failed to update sprint:', err);
    } finally {
      setUpdatingField(null);
    }
  };

  const handleEpicChange = async (epicVal) => {
    if (updatingField) return;
    const targetEpic = epicVal === '' || !epicVal ? null : epicVal;
    if (targetEpic === (issue?.parent_id || issue?.epicId || null)) return;
    setUpdatingField('epic');
    try {
      await onUpdateIssue?.({
        ...issue,
        epicId: targetEpic,
        parent_id: targetEpic,
      });
    } catch (err) {
      console.error('Failed to update epic:', err);
    } finally {
      setUpdatingField(null);
    }
  };

  const handleSPBlur = async () => {
    if (updatingField) return;
    const raw = editedStoryPoints;
    if (raw === '' || raw === null || raw === undefined) {
      setEditedStoryPoints(issue?.story_points ?? issue?.storyPoints ?? (isStory ? 1 : 0));
      return;
    }
    const val = Number.parseInt(raw, 10);
    if (isStory) {
      if (Number.isNaN(val) || val <= 0) {
        alert('Story points are mandatory for stories and must be a positive integer (1 or greater).');
        setEditedStoryPoints(issue?.story_points ?? issue?.storyPoints ?? 1);
        return;
      }
      if (val !== (issue?.story_points ?? issue?.storyPoints)) {
        setUpdatingField('storyPoints');
        try {
          await onUpdateIssue?.({
            ...issue,
            story_points: val,
            storyPoints: val,
          });
        } catch (err) {
          console.error('Failed to update story points:', err);
          setEditedStoryPoints(issue?.story_points ?? issue?.storyPoints ?? 1);
        } finally {
          setUpdatingField(null);
        }
      }
    } else if (isApplicableType) {
      if (Number.isNaN(val) || val < 0) {
        alert('Story points are mandatory for tasks, subtasks, and bugs and must be a non-negative integer (0 or greater).');
        setEditedStoryPoints(issue?.story_points ?? issue?.storyPoints ?? 0);
        return;
      }
      if (val !== (issue?.story_points ?? issue?.storyPoints)) {
        setUpdatingField('storyPoints');
        try {
          await onUpdateIssue?.({
            ...issue,
            story_points: val,
            storyPoints: val,
          });
        } catch (err) {
          console.error('Failed to update story points:', err);
          setEditedStoryPoints(issue?.story_points ?? issue?.storyPoints ?? 0);
        } finally {
          setUpdatingField(null);
        }
      }
    } else {
      const finalVal = Number.isNaN(val) ? 0 : Math.max(0, val);
      if (finalVal !== (issue?.story_points ?? issue?.storyPoints)) {
        setUpdatingField('storyPoints');
        try {
          await onUpdateIssue?.({
            ...issue,
            story_points: finalVal,
            storyPoints: finalVal,
          });
        } catch (err) {
          console.error('Failed to update story points:', err);
          setEditedStoryPoints(issue?.story_points ?? issue?.storyPoints ?? 0);
        } finally {
          setUpdatingField(null);
        }
      }
    }
  };

  const handleSPKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleSPBlur();
    }
  };

  const handleDueDateChange = async (dueDate) => {
    if (updatingField) return;
    setUpdatingField('dueDate');
    try {
      await onUpdateIssue?.({ ...issue, dueDate, due_date: dueDate }, { due_date: dueDate });
    } catch (err) {
      console.error('Failed to update due date:', err);
    } finally {
      setUpdatingField(null);
    }
  };

  const rawDueDate = issue?.due_date || issue?.dueDate;
  let formattedDueDateForInput = '';
  if (rawDueDate) {
    try {
      const d = new Date(rawDueDate);
      if (!Number.isNaN(d.getTime())) {
        formattedDueDateForInput = d.toISOString().split('T')[0];
      }
    } catch (_) {}
  }

  const handleAddComment = (e) => {
    e.preventDefault();
    if (newComment.trim()) {
      setComments(prev => [
        ...prev,
        { id: `c-${Date.now()}`, author: 'Sarah Mitchell', time: 'Just now', text: newComment.trim() }
      ]);
      setNewComment('');
    }
  };

  const [childSprintId, setChildSprintId] = useState('');

  // Child items from workItems or issue.subtasks
  const childItems = React.useMemo(() => {
    if (!issue) return [];
    const fromWorkItems = (workItems || []).filter((w) => w.parent_id === issue.id);
    if (fromWorkItems.length > 0) {
      return fromWorkItems.map((item) => {
        const sp = sprints.find((s) => s.id === item.sprint_id);
        return {
          id: item.id,
          title: item.title,
          type: item.type,
          status: item.status,
          done: item.status === 'COMPLETED',
          sprint_id: item.sprint_id,
          sprintName: sp ? sp.name : 'Backlog',
          priority: item.priority,
          story_points: item.story_points ?? item.storyPoints ?? 0,
        };
      });
    }
    return (issue.subtasks || []).map((st) => ({
      ...st,
      sprintName: sprints.find((s) => s.id === st.sprint_id)?.name || 'Backlog',
      story_points: st.story_points ?? st.storyPoints ?? 0,
    }));
  }, [issue, workItems, sprints]);

  const hasChildTasks = isStory && childItems.length > 0;
  const childTotalSp = useMemo(() => {
    return childItems.reduce((acc, c) => acc + (Number(c.story_points) || 0), 0);
  }, [childItems]);

  const handleAddChildSubmit = (e) => {
    e.preventDefault();
    if (newSubtaskTitle.trim() && allowedChildTypes.length > 0) {
      const isChildApplicable = ['TASK', 'SUBTASK', 'BUG', 'STORY'].includes(childType);
      const pointsVal = Number.parseInt(childPoints, 10);
      if (isChildApplicable && (Number.isNaN(pointsVal) || pointsVal <= 0)) {
        alert('Story points are mandatory for tasks, stories, subtasks, and bugs and must be a positive integer greater than 0.');
        return;
      }
      onAddSubtask?.(
        issue.id,
        newSubtaskTitle.trim(),
        childType,
        isKanban ? null : (childSprintId || null),
        isChildApplicable ? pointsVal : Math.max(0, pointsVal || 0)
      );
      setNewSubtaskTitle('');
      setChildPoints(3);
    }
  };

  if (!isOpen || !issue) return null;

  const completedSubtasks = childItems.filter((s) => s.done).length;
  const totalSubtasks = childItems.length;
  const subtaskProgress = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : null;

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[460px] bg-white border-l border-slate-200 shadow-xl z-50 flex flex-col text-xs select-none animate-in slide-in-from-right duration-200">
      {/* Top Drawer Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-slate-50/70 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-slate-700 text-xs">
            {issue.id}
          </span>
          <span className="text-slate-300">/</span>
          <span className="text-[11px] text-slate-500 font-medium">
            {isEpic ? 'Top-level Epic' : (currentEpic?.name || 'No Epic')}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {canDelete && (
            <button
              onClick={() => {
                const itemTypeName = issue.type ? issue.type.toLowerCase() : 'item';
                const itemTitle = issue.title ? `"${issue.title}"` : '';
                if (window.confirm(`Are you sure you want to delete this ${itemTypeName} ${itemTitle}? This action cannot be undone.`)) {
                  onDeleteIssue?.(issue.id);
                }
              }}
              title={`Delete ${issue.type || 'Issue'}`}
              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {actionError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{actionError}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="p-1 rounded hover:bg-rose-100 text-rose-400 hover:text-rose-600 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {/* Pending Extension Review Banner */}
        {pendingExtension && (
          <div className="p-3.5 rounded-xl border border-amber-300 bg-amber-50/90 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                  Due Date Extension Requested
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-800">
                PENDING REVIEW
              </span>
            </div>

            <div className="text-xs text-amber-950 space-y-1">
              <div>
                <span className="text-slate-500">Requested by: </span>
                <span className="font-semibold text-slate-800">
                  {pendingExtension.requester?.name || pendingExtension.requester?.email || 'Intern'}
                </span>
                <span className="text-slate-400 text-[10px] ml-1.5">
                  ({new Date(pendingExtension.created_at).toLocaleString()})
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div>
                  <span className="text-slate-500">Current Due Date: </span>
                  <span className="font-medium line-through text-slate-600">
                    {pendingExtension.original_due_date ? new Date(pendingExtension.original_due_date).toLocaleDateString() : 'None'}
                  </span>
                </div>
                <div>
                  <span className="text-amber-800 font-semibold">Requested: </span>
                  <span className="font-bold text-amber-900">
                    {new Date(pendingExtension.requested_due_date).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="mt-1 pt-1 border-t border-amber-200/60">
                <span className="font-semibold text-amber-900">Reason: </span>
                <span className="italic text-amber-900">"{pendingExtension.reason}"</span>
              </div>
            </div>

            {/* Decision note & Action buttons for Manager */}
            {isManagerOrLead && (
              <div className="pt-2 border-t border-amber-200 space-y-2">
                <input
                  type="text"
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  placeholder="Optional decision note for intern..."
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-amber-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={decidingId === pendingExtension.id}
                    onClick={() => void handleDecideExtension('REJECT')}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={decidingId === pendingExtension.id}
                    onClick={() => void handleDecideExtension('APPROVE')}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    {decidingId === pendingExtension.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Approve Extension
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Title Input */}
        <div>
          {canEditTitleAndDesc ? (
            <textarea
              rows={2}
              value={editedTitle}
              disabled={updatingField === 'title'}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleTitleBlur}
              placeholder="Issue summary..."
              className="w-full text-sm font-bold text-slate-900 border border-transparent hover:border-slate-200 focus:border-purple-500 focus:bg-white p-1.5 rounded-md resize-none transition-colors outline-none disabled:opacity-60"
            />
          ) : (
            <div className="w-full text-sm font-bold text-slate-900 p-1.5 select-text">
              {issue.title || 'Untitled'}
            </div>
          )}
        </div>

        {/* Status / Priority / Assignee Attributes Grid */}
        <div className="rounded-md border border-slate-200 p-3 bg-slate-50/40 space-y-2.5">
          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <span>Status</span>
              {updatingField === 'status' && (
                <Loader2 className="w-3 h-3 text-purple-600 animate-spin shrink-0" />
              )}
            </span>
            {canChangeStatus ? (
              <select
                value={issue.status || 'TODO'}
                disabled={updatingField === 'status'}
                onChange={(e) => void handleStatusChange(e.target.value)}
                className="px-2 py-1 rounded border border-slate-200 text-xs font-semibold bg-white text-slate-800 focus:outline-none focus:border-purple-600 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="IN_REVIEW">In Review</option>
                <option value="BLOCKED">Blocked</option>
                {canCompleteStatus ? (
                  <option value="COMPLETED">Completed</option>
                ) : issue.status === 'COMPLETED' ? (
                  <option value="COMPLETED" disabled>Completed</option>
                ) : null}
              </select>
            ) : (
              <span className="px-2 py-1 rounded border border-slate-200 text-xs font-semibold bg-slate-50 text-slate-700 select-none">
                {issue.status === 'IN_PROGRESS' ? 'In Progress' : issue.status === 'IN_REVIEW' ? 'In Review' : issue.status === 'COMPLETED' ? 'Completed' : issue.status === 'BLOCKED' ? 'Blocked' : 'To Do'}
              </span>
            )}
          </div>

          {/* Priority */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <span>Priority</span>
              {updatingField === 'priority' && (
                <Loader2 className="w-3 h-3 text-purple-600 animate-spin shrink-0" />
              )}
            </span>
            {canChangePriority ? (
              <select
                value={issue.priority || 'MEDIUM'}
                disabled={updatingField === 'priority'}
                onChange={(e) => void handlePriorityChange(e.target.value)}
                className="px-2 py-1 rounded border border-slate-200 text-xs font-medium bg-white text-slate-800 focus:outline-none focus:border-purple-600 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="URGENT">Urgent</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            ) : (
              <span className="px-2 py-1 rounded border border-slate-200 text-xs font-medium bg-slate-50 text-slate-700 select-none">
                {issue.priority || 'Medium'}
              </span>
            )}
          </div>

          {/* Assignee */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <span>Assignee</span>
              {updatingField === 'assignee' && (
                <Loader2 className="w-3 h-3 text-purple-600 animate-spin shrink-0" />
              )}
            </span>
            <div className="flex items-center gap-1.5 min-w-0">
              {currentAssignee ? (
                <img
                  src={`https://ui-avatars.com/api/?name=${encodeURIComponent(currentAssignee.name || currentAssignee.user?.name || currentAssignee.email || 'User')}&background=7C3AED&color=fff`}
                  alt={currentAssignee.name || 'User'}
                  className="w-4 h-4 rounded-full object-cover shrink-0 border border-purple-200"
                />
              ) : (
                <div className="w-4 h-4 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[8px] shrink-0">
                  <User className="w-2.5 h-2.5 text-slate-400" />
                </div>
              )}
              {canChangeAssignee ? (
                <select
                  value={currentAssigneeId}
                  disabled={updatingField === 'assignee'}
                  onChange={(e) => void handleAssigneeChange(e.target.value)}
                  className="px-2 py-1 rounded border border-slate-200 text-xs font-medium bg-white text-slate-800 focus:outline-none focus:border-purple-600 min-w-[120px] max-w-full truncate cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="">Unassigned</option>
                  {members.map((u) => {
                    const uid = u.user_id || u.id;
                    const uName = u.name || u.user?.name || u.email || u.user?.email || 'Member';
                    return (
                      <option key={uid} value={uid}>
                        {uName}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <span className="px-2 py-1 rounded border border-slate-200 text-xs font-medium bg-slate-50 text-slate-700 select-none truncate max-w-[150px]">
                  {currentAssignee?.name || currentAssignee?.user?.name || currentAssignee?.email || 'Unassigned'}
                </span>
              )}
            </div>
          </div>

          {/* Cycle / Sprint (Scrum only) */}
          {!isKanban && (
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <span>{Term}</span>
                {updatingField === 'sprint' && (
                  <Loader2 className="w-3 h-3 text-purple-600 animate-spin shrink-0" />
                )}
              </span>
              {isEpic ? (
                <span
                  className={`px-2 py-1 rounded border text-xs font-medium max-w-[180px] truncate select-none ${
                    epicSprintSummary?.badgeClass || 'bg-slate-50 text-slate-600 border-slate-200'
                  }`}
                  title={epicSprintSummary?.title || 'Derived from child items'}
                >
                  {epicSprintSummary?.label 
                    ? (isKanban ? epicSprintSummary.label.replace(/Sprint/g, 'Cycle') : epicSprintSummary.label.replace(/Cycle/g, 'Sprint')) 
                    : `Backlog (No ${Term})`}
                </span>
              ) : canChangeSprint ? (
                <select
                  value={issue.sprint_id || issue.sprintId || 'backlog'}
                  disabled={updatingField === 'sprint'}
                  onChange={(e) => void handleSprintChange(e.target.value)}
                  className="px-2 py-1 rounded border border-slate-200 text-xs font-medium bg-white text-slate-800 focus:outline-none focus:border-purple-600 max-w-[180px] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="backlog">Backlog (No {Term})</option>
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.status})
                    </option>
                  ))}
                </select>
              ) : (
                <span className="px-2 py-1 rounded border text-xs font-medium bg-slate-50 text-slate-600 border-slate-200 select-none truncate max-w-[180px]">
                  {currentSprint ? currentSprint.name : `Backlog (No ${Term})`}
                </span>
              )}
            </div>
          )}

          {/* Parent Epic Hierarchy Display */}
          {!isEpic && currentEpic?.name && (
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <span>Epic</span>
                {updatingField === 'epic' && (
                  <Loader2 className="w-3 h-3 text-purple-600 animate-spin shrink-0" />
                )}
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 select-none truncate max-w-[180px]">
                {currentEpic.name}
              </span>
            </div>
          )}

          {/* Story Points */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <span>Story Points {isApplicableType ? '*' : ''}</span>
              {updatingField === 'storyPoints' && (
                <Loader2 className="w-3 h-3 text-purple-600 animate-spin shrink-0" />
              )}
            </span>
            {isEpic ? (
              <span className="text-[11px] text-slate-400 italic">Aggregated from stories</span>
            ) : hasChildTasks ? (
              <div className="flex items-center gap-1.5" title="Story points are aggregated from child tasks">
                <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-mono font-bold text-xs border border-purple-200">
                  {childTotalSp} SP
                </span>
                <span className="text-[10px] text-slate-400">({childItems.length} tasks)</span>
              </div>
            ) : canChangeStoryPoints ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={isStory ? 1 : 0}
                  max={999}
                  disabled={updatingField === 'storyPoints'}
                  value={editedStoryPoints}
                  onChange={(e) => setEditedStoryPoints(e.target.value)}
                  onBlur={handleSPBlur}
                  onKeyDown={handleSPKeyDown}
                  className="w-16 px-2 py-0.5 rounded border border-slate-200 text-xs font-mono font-semibold bg-white text-slate-800 text-right focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-500 shadow-2xs disabled:opacity-60"
                />
                <span className="text-xs text-slate-400 font-mono">pts</span>
              </div>
            ) : (
              <span className="px-2 py-0.5 text-xs font-mono font-semibold text-slate-700 select-none">
                {issue.story_points ?? issue.storyPoints ?? 0} pts
              </span>
            )}
          </div>

          {/* Due Date & Extension Workflow */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Due Date</span>
                {updatingField === 'dueDate' && (
                  <Loader2 className="w-3 h-3 text-purple-600 animate-spin shrink-0" />
                )}
              </span>
              {canChangeDueDate ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    disabled={updatingField === 'dueDate'}
                    value={formattedDueDateForInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      const isoDate = val ? new Date(val).toISOString() : null;
                      handleDueDateChange(isoDate);
                    }}
                    className="px-2 py-0.5 rounded border border-slate-200 text-xs font-medium bg-white text-slate-800 focus:outline-none focus:border-purple-600 cursor-pointer shadow-2xs disabled:opacity-60"
                  />
                  {formattedDueDateForInput && (
                    <button
                      type="button"
                      disabled={updatingField === 'dueDate'}
                      onClick={() => handleDueDateChange(null)}
                      title="Clear due date"
                      className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors disabled:opacity-60"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ) : (
                <span className="px-2 py-0.5 text-xs font-medium text-slate-700 select-none">
                  {formattedDueDateForInput
                    ? new Date(formattedDueDateForInput).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : 'No due date'}
                </span>
              )}
            </div>

            {/* If user cannot directly change due date (e.g. Intern) */}
            {!canChangeDueDate && (
              <div className="pt-0.5 space-y-2">
                {pendingExtension ? (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex flex-col gap-1 text-xs text-amber-900 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-bold text-amber-800">
                        <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                        Extension Pending Approval
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-800">
                        IN REVIEW
                      </span>
                    </div>
                    <div className="text-[11px] text-amber-800">
                      Requested new date: <span className="font-semibold">{new Date(pendingExtension.requested_due_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                    {pendingExtension.reason && (
                      <div className="text-[11px] text-amber-700 italic">
                        "{pendingExtension.reason}"
                      </div>
                    )}
                  </div>
                ) : String(issue?.project?.status || issue?.project_status || '').toUpperCase() === 'ARCHIVED' ? (
                  <span className="text-[11px] text-slate-400 italic">Project is archived</span>
                ) : isIntern ? (
                  <button
                    type="button"
                    onClick={() => {
                      setExtensionError('');
                      setRequestedDueDate('');
                      setExtensionReason('');
                      setIsExtensionModalOpen(true);
                    }}
                    className="w-full py-2 px-3 rounded-xl text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <Calendar className="w-3.5 h-3.5 text-purple-600" />
                    Apply for Extension
                  </button>
                ) : null}

                {/* Compact Extension History */}
                {extensionRequests && extensionRequests.length > 0 && (
                  <div className="pt-2 border-t border-slate-100">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Extension History
                    </div>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {extensionRequests.map((req) => (
                        <div
                          key={req.id}
                          className="p-2 rounded-lg border border-slate-100 bg-slate-50/60 text-[11px] space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              req.status === 'APPROVED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : req.status === 'REJECTED'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {req.status}
                            </span>
                            <span className="text-slate-400 text-[10px]">
                              {new Date(req.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="text-slate-700">
                            Requested: <span className="font-semibold">{new Date(req.requested_due_date).toLocaleDateString()}</span>
                          </div>
                          {req.reason && (
                            <div className="text-slate-500 italic">
                              "{req.reason}"
                            </div>
                          )}
                          {req.decision_note && (
                            <div className="text-slate-600 font-medium">
                              Note: {req.decision_note}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Time Tracking & Logged Hours */}
          <div className="pt-2 border-t border-slate-200/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Time Logged</span>
              </span>
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-mono font-bold text-xs border border-purple-200">
                  {formatHoursMinutes(totalLoggedMinutes)}
                </span>
                {!isManager && (
                  activeSession ? (
                    <button
                      type="button"
                      onClick={handleStopTaskTimer}
                      disabled={timeActionLoading}
                      className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-mono font-bold text-xs transition-colors cursor-pointer shadow-2xs"
                      title="Stop active timer"
                    >
                      <Square className="w-2.5 h-2.5 fill-current" />
                      <span>{elapsedText}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartTaskTimer}
                      disabled={timeActionLoading}
                      className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-2xs"
                      title="Start timer for this task"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                      <span>Timer</span>
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Hours Logged */}
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <Timer className="w-3.5 h-3.5 text-slate-400" />
                <span>Hours Logged</span>
              </span>
              <span className="font-semibold text-slate-800 font-mono text-xs" data-testid="hours-logged-value">
                {formatHoursMinutes(totalLoggedMinutes)}
              </span>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1">
          <label htmlFor="drawer-issue-description" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <span>Description</span>
            {updatingField === 'description' && (
              <Loader2 className="w-3 h-3 text-purple-600 animate-spin shrink-0" />
            )}
          </label>
          {canEditTitleAndDesc ? (
            <textarea
              id="drawer-issue-description"
              rows={3}
              value={editedDesc}
              disabled={updatingField === 'description'}
              onChange={(e) => setEditedDesc(e.target.value)}
              onBlur={handleDescBlur}
              placeholder="Add a detailed description..."
              className="w-full text-xs text-slate-800 p-2.5 rounded-md border border-slate-200 focus:border-purple-500 focus:outline-none resize-y disabled:opacity-60"
            />
          ) : (
            <div className="w-full text-xs text-slate-800 p-2.5 rounded-md border border-slate-200 bg-slate-50/50 whitespace-pre-wrap min-h-[50px] select-text">
              {issue.description || <span className="text-slate-400 italic">No description provided.</span>}
            </div>
          )}
        </div>

        {/* Child Items Section */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
              <span>Child Items</span>
              <span className="text-slate-400 font-mono text-[11px]">
                ({completedSubtasks}/{totalSubtasks})
              </span>
            </div>
            {subtaskProgress !== null ? (
              <span className="text-[10px] text-purple-700 font-bold">{subtaskProgress}%</span>
            ) : (
              <span className="text-[10px] text-slate-400 font-medium">No child items</span>
            )}
          </div>

          {totalSubtasks > 0 && subtaskProgress !== null && (
            <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all"
                style={{ width: `${subtaskProgress}%` }}
              />
            </div>
          )}

          {/* Child Items List */}
          <div className="space-y-1">
            {childItems.map((st) => (
              <div
                key={st.id}
                className="flex items-center justify-between gap-2 p-1.5 rounded hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isIntern && canManageProject) {
                        onToggleSubtask?.(issue.id, st.id);
                      }
                    }}
                    disabled={isIntern || !canManageProject}
                    className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors shrink-0 ${
                      st.done ? 'bg-purple-600 border-purple-600 text-white' : 'border-slate-300 bg-white'
                    } ${isIntern || !canManageProject ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                  >
                    {st.done && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </button>
                  <span className="font-mono text-[10px] text-slate-400 shrink-0">{st.id}</span>
                  {st.type && (
                    <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-slate-100 text-slate-600 uppercase shrink-0">
                      {st.type}
                    </span>
                  )}
                  <span className={`text-xs truncate ${st.done ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                    {st.title}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {st.story_points > 0 && (
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                      {st.story_points} SP
                    </span>
                  )}
                  {/* Sprint Badge (Scrum only) */}
                  {!isKanban && st.sprintName && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                      {st.sprintName}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* Context-Sensitive Add Child Item */}
            {allowedChildTypes.length > 0 ? (
              canAddChildItems ? (
                <form onSubmit={handleAddChildSubmit} className="flex flex-col gap-1.5 pt-1">
                  <div className="flex items-center gap-1.5">
                    {allowedChildTypes.length > 1 && (
                      <select
                        value={childType}
                        onChange={(e) => setChildType(e.target.value)}
                        className="px-1.5 py-1 text-[11px] font-bold rounded border border-purple-200 bg-purple-50 text-purple-800"
                      >
                        {allowedChildTypes.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    )}
                    <input
                      type="text"
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      placeholder={`+ Add new ${childType.toLowerCase()}...`}
                      className="flex-1 px-2 py-1 text-xs rounded border border-slate-200 focus:outline-none focus:border-purple-600"
                    />
                    {['TASK', 'SUBTASK', 'BUG', 'STORY'].includes(childType) && (
                      <div className="flex items-center gap-1 shrink-0" title="Story Points (mandatory for work items)">
                        <input
                          type="number"
                          min={1}
                          max={999}
                          value={childPoints}
                          onChange={(e) => setChildPoints(e.target.value)}
                          className="w-12 px-1 py-1 text-center text-xs font-mono font-semibold rounded border border-purple-200 bg-purple-50 text-purple-800 focus:outline-none focus:border-purple-600"
                          placeholder="SP"
                          required
                        />
                        <span className="text-[10px] text-purple-700 font-bold">SP</span>
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={!newSubtaskTitle.trim()}
                      className="px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-xs font-medium transition-colors cursor-pointer"
                    >
                      Add
                    </button>
                  </div>

                  {/* Sprint Selection (Scrum only) */}
                  {!isKanban && sprints.length > 0 && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pl-1">
                      <span>Assign to:</span>
                      <select
                        value={childSprintId}
                        onChange={(e) => setChildSprintId(e.target.value)}
                        className="px-1.5 py-0.5 text-[11px] rounded border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-purple-600"
                      >
                        <option value="">Backlog (No Sprint)</option>
                        {sprints.map((s) => (
                          <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </form>
              ) : (
                <div className="text-[11px] text-slate-400 italic py-1">
                  You do not have permission to add child items to this {issue?.type ? issue.type.toLowerCase() : 'item'}
                </div>
              )
            ) : (
              <div className="text-[11px] text-slate-400 italic py-1">
                Leaf item · Cannot have child items
              </div>
            )}
          </div>
        </div>

        {/* Activity & Comments Section */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between border-b border-slate-200">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('comments')}
                className={`pb-1.5 font-semibold text-xs border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'comments'
                    ? 'border-purple-600 text-purple-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Comments
              </button>
              {!isWorklogHidden && (
              <button
                type="button"
                onClick={() => setActiveTab('worklog')}
                className={`pb-1.5 font-semibold text-xs border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'worklog'
                    ? 'border-purple-600 text-purple-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Worklog ({timeEntries.length})
              </button>
            )}
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`pb-1.5 font-semibold text-xs border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'history'
                    ? 'border-purple-600 text-purple-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                History
              </button>
            </div>
          </div>

          {activeTab === 'comments' || (activeTab === 'worklog' && isWorklogHidden) ? (
            <div className="pt-1">
              <WorkItemComments workItemId={issue.id} />
            </div>
          ) : activeTab === 'worklog' ? (
            <div className="pt-2 space-y-3">
              {/* Worklog Header */}
              <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Actual Time Spent
                  </span>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">
                    {Math.floor(totalLoggedMinutes / 60)}h {totalLoggedMinutes % 60}m
                  </div>
                </div>

                {!isManager && (
                  <button
                    type="button"
                    onClick={() => setIsLogModalOpen(!isLogModalOpen)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs transition-colors cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Log Time</span>
                  </button>
                )}
              </div>

              {/* Inline Add Worklog Form */}
              {!isManager && isLogModalOpen && (
                <form
                  onSubmit={handleSaveWorklog}
                  className="p-3 bg-purple-50/50 border border-purple-200 rounded-xl space-y-2.5 animate-in fade-in duration-150"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-[11px]">
                      Manual Time Entry
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsLogModalOpen(false)}
                      className="text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label htmlFor="log-work-date" className="block text-[10px] font-semibold text-slate-600 mb-0.5">Date</label>
                      <input
                        id="log-work-date"
                        type="date"
                        value={logDate}
                        onChange={(e) => setLogDate(e.target.value)}
                        required
                        className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 focus:outline-none focus:border-purple-600"
                      />
                    </div>
                    <div>
                      <label htmlFor="log-work-hours" className="block text-[10px] font-semibold text-slate-600 mb-0.5">Hours</label>
                      <input
                        id="log-work-hours"
                        type="number"
                        min="0"
                        max="24"
                        placeholder="0"
                        value={logHours}
                        onChange={(e) => setLogHours(e.target.value)}
                        className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 font-mono focus:outline-none focus:border-purple-600"
                      />
                    </div>
                    <div>
                      <label htmlFor="log-work-minutes" className="block text-[10px] font-semibold text-slate-600 mb-0.5">Minutes</label>
                      <input
                        id="log-work-minutes"
                        type="number"
                        min="0"
                        max="59"
                        step="5"
                        placeholder="30"
                        value={logMinutes}
                        onChange={(e) => setLogMinutes(e.target.value)}
                        className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 font-mono focus:outline-none focus:border-purple-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="log-work-notes" className="block text-[10px] font-semibold text-slate-600 mb-0.5">Work Notes</label>
                    <textarea
                      id="log-work-notes"
                      rows={2}
                      value={logNotes}
                      onChange={(e) => setLogNotes(e.target.value)}
                      placeholder="What was completed?"
                      className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 resize-none focus:outline-none focus:border-purple-600"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsLogModalOpen(false)}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-white text-slate-600 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={timeActionLoading}
                      className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      {timeActionLoading ? 'Saving...' : 'Save Log'}
                    </button>
                  </div>
                </form>
              )}

              {/* Time Entries List */}
              {loadingTime ? (
                <div className="p-4 text-center text-slate-400">Loading worklogs...</div>
              ) : timeEntries.length === 0 ? (
                <div className="p-5 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-slate-100">
                  <p>No worklog entries recorded yet.</p>
                  {!isManager && (
                    <p className="text-[11px] mt-1 text-slate-400">
                      Use the Timer or click &quot;Log Time&quot; above to record effort.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {timeEntries.map((entry) => {
                    const isOwner = entry.user_id === currentUserId;
                    const canDeleteEntry = isOwner || !isIntern;
                    return (
                      <div
                        key={entry.id}
                        className="p-2.5 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50/50 transition-colors flex items-start justify-between gap-2 shadow-2xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900">
                              {entry.duration_formatted}
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
                            <span className="text-slate-400 text-[10px]">
                              {entry.date ? new Date(entry.date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-600">
                            <span className="font-semibold text-slate-800">{entry.user_name}</span>
                            {entry.notes && (
                              <span>— &quot;{entry.notes}&quot;</span>
                            )}
                          </div>
                        </div>

                        {canDeleteEntry && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteWorklog(entry.id)}
                            disabled={timeActionLoading}
                            title="Delete entry"
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 text-center text-xs text-slate-400">
              Activity log is available in project audit views.
            </div>
          )}
        </div>
      </div>

      {/* Request Extension Modal for Intern */}
      {isExtensionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Request Due Date Extension</h3>
                  <p className="text-[11px] text-slate-500">Submit an extension request to the project manager</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsExtensionModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {extensionError && (
              <div className="mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{extensionError}</span>
              </div>
            )}

            <form onSubmit={handleInternRequestExtension} className="mt-4 space-y-4">
              <div>
                <div className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Task
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800">
                  {issue.title}
                </div>
              </div>

              <div>
                <div className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Current Due Date
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {issue.due_date ? new Date(issue.due_date).toLocaleDateString() : 'No current due date'}
                  </span>
                </div>
              </div>

              <div>
                <label htmlFor="extension-due-date" className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Requested New Due Date <span className="text-rose-500">*</span>
                </label>
                <input
                  id="extension-due-date"
                  type="date"
                  required
                  min={
                    issue.due_date
                      ? new Date(new Date(issue.due_date).getTime() + 86400000).toISOString().split('T')[0]
                      : new Date().toISOString().split('T')[0]
                  }
                  value={requestedDueDate}
                  onChange={(e) => setRequestedDueDate(e.target.value)}
                  className="w-full p-2.5 bg-white rounded-xl border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                />
              </div>

              <div>
                <label htmlFor="extension-reason" className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Reason for Extension <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="extension-reason"
                  required
                  rows={3}
                  maxLength={2000}
                  value={extensionReason}
                  onChange={(e) => setExtensionReason(e.target.value)}
                  placeholder="Explain why you need additional time to complete this deliverable..."
                  className="w-full p-2.5 bg-white rounded-xl border border-slate-200 text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600 resize-none"
                />
                <div className="text-[10px] text-right text-slate-400 mt-0.5">
                  {extensionReason.length} / 2000
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsExtensionModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={extensionSubmitting}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-purple-600 hover:bg-purple-700 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  {extensionSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

