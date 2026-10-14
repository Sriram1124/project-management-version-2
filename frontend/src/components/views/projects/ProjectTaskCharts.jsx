import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  BarChart3, 
  PieChart, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Layers, 
  Users, 
  Loader2, 
  RefreshCw, 
  ChevronDown, 
  Award, 
  CalendarCheck, 
  AlertTriangle, 
  UserCheck, 
  Search, 
  X,
  User,
  Filter,
  Calendar,
  ArrowRight,
  Timer,
  Sparkles
} from 'lucide-react';
import { workItemsService } from '../../../services/workItems.service';
import { PROJECT_ROLE_LABELS } from '../../modals/AssignProjectRolesModal';
import { useAuth } from '../../../context/AuthContext';

const STATUS_CONFIG = {
  TODO: { label: 'To Do', color: '#94A3B8', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300' },
  IN_PROGRESS: { label: 'In Progress', color: '#8B5CF6', bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
  IN_REVIEW: { label: 'In Review', color: '#3B82F6', bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  COMPLETED: { label: 'Completed', color: '#10B981', bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300' },
  BLOCKED: { label: 'Blocked', color: '#F43F5E', bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-300' },
};

const PRIORITY_CONFIG = {
  URGENT: { label: 'Urgent', color: '#E11D48', barClass: 'bg-rose-500', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' },
  HIGH: { label: 'High', color: '#F97316', barClass: 'bg-orange-500', badgeClass: 'bg-orange-50 text-orange-700 border-orange-200' },
  MEDIUM: { label: 'Medium', color: '#EAB308', barClass: 'bg-amber-500', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  LOW: { label: 'Low', color: '#10B981', barClass: 'bg-emerald-500', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const TYPE_CONFIG = {
  EPIC: { label: 'Epics', color: '#7C3AED', badgeClass: 'bg-purple-100 text-purple-800 border-purple-200' },
  STORY: { label: 'Stories', color: '#059669', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  TASK: { label: 'Tasks', color: '#2563EB', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200' },
  SUBTASK: { label: 'Subtasks', color: '#64748B', badgeClass: 'bg-slate-100 text-slate-800 border-slate-200' },
  BUG: { label: 'Bugs', color: '#DC2626', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200' },
};

export default function ProjectTaskCharts({ projectId = null, members = [], readOnly = false }) {
  const { user: authUser } = useAuth();
  const authRole = String(authUser?.role?.name || authUser?.role || authUser?.type || authUser?.user_type || '').toUpperCase();
  const currentUserId = authUser?.id || authUser?.user_id;

  // Filters State
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || '');
  const [selectedSprintId, setSelectedSprintId] = useState('ALL');
  const [dateRangeFilter, setDateRangeFilter] = useState('ALL'); // 'ALL' | '7D' | '14D' | '30D' | 'THIS_MONTH'

  // Server Analytics & Raw Items
  const [analyticsData, setAnalyticsData] = useState(null);
  const [workItems, setWorkItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Effective project members (from props or from backend analytics response)
  const effectiveMembers = useMemo(() => {
    if (Array.isArray(members) && members.length > 0) return members;
    if (Array.isArray(analyticsData?.members) && analyticsData.members.length > 0) return analyticsData.members;
    return [];
  }, [members, analyticsData]);

  const isManager = authRole === 'MANAGER' || authRole === 'ADMIN' || authRole === 'SUPER_ADMIN';
  const isTechLead = 
    authRole === 'TECH_LEAD' || 
    Boolean(authUser?.is_tech_lead) || 
    Boolean(analyticsData?.is_tech_lead) || 
    effectiveMembers.some((m) => 
      (m.user_id === currentUserId || m.id === currentUserId) && 
      (m.project_role === 'TECH_LEAD' || m.role === 'TECH_LEAD')
    );

  const hasFullTeamAccess = isManager || isTechLead;
  const isInternUser = !hasFullTeamAccess;

  // Tab View Mode:
  // Intern: 'TASKS' (Tab A: Tasks & Graphs) | 'PERFORMANCE' (Tab B: Individual Performance)
  // Manager / Tech Lead: 'TASKS' | 'PERFORMANCE' (Team Performance) | 'BOTH'
  const [viewMode, setViewMode] = useState('TASKS');

  // Manager / Tech Lead Scope Dropdown
  const [selectedPerformanceFilter, setSelectedPerformanceFilter] = useState('ALL'); // 'ALL' | 'TECH_LEADS' | userId
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const dropdownRef = useRef(null);

  // Intern Personal Table Search & Filter (Tab B)
  const [personalSearchQuery, setPersonalSearchQuery] = useState('');
  const [personalStatusFilter, setPersonalStatusFilter] = useState('ALL');

  useEffect(() => {
    if (projectId) {
      setSelectedProjectId(projectId);
    }
  }, [projectId]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const computeDateRange = (rangeKey) => {
    const end = new Date();
    const start = new Date();
    if (rangeKey === '7D') {
      start.setDate(start.getDate() - 7);
    } else if (rangeKey === '14D') {
      start.setDate(start.getDate() - 14);
    } else if (rangeKey === '30D') {
      start.setDate(start.getDate() - 30);
    } else if (rangeKey === 'THIS_MONTH') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    }
    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  };

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const filterPayload = {};
      const activeProjId = selectedProjectId || projectId;
      if (activeProjId) filterPayload.project_id = activeProjId;
      if (selectedSprintId && selectedSprintId !== 'ALL') filterPayload.sprint_id = selectedSprintId;
      if (dateRangeFilter !== 'ALL') {
        const { start, end } = computeDateRange(dateRangeFilter);
        filterPayload.start_date = start;
        filterPayload.end_date = end;
      }

      // Fetch analytics via server-scoped endpoint and list items for team breakdown
      const [analyticsRes, itemsRes] = await Promise.all([
        workItemsService.getAnalytics(filterPayload).catch((err) => {
          console.warn('Backend analytics endpoint notice:', err);
          return null;
        }),
        activeProjId 
          ? workItemsService.listWorkItems({ project_id: activeProjId }).catch(() => []) 
          : isInternUser 
          ? workItemsService.listWorkItems({ assigned_to_me: true }).catch(() => [])
          : workItemsService.listWorkItems().catch(() => []),
      ]);

      let sanitizedItems = itemsRes || [];
      if (analyticsRes?.lead_project_ids?.length > 0 && !isManager && !activeProjId) {
        const leadSet = new Set(analyticsRes.lead_project_ids);
        sanitizedItems = sanitizedItems.filter((it) => leadSet.has(it.project_id));
      }

      setAnalyticsData(analyticsRes);
      setWorkItems(sanitizedItems);
    } catch (err) {
      console.error('Failed to fetch task analytics:', err);
      setError(err.message || 'Failed to load task analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [selectedProjectId, selectedSprintId, dateRangeFilter, projectId]);

  // Accessible filter options returned from server
  const accessibleProjects = useMemo(() => {
    if (analyticsData?.filters?.projects?.length > 0) {
      return analyticsData.filters.projects;
    }
    return projectId ? [{ id: projectId, name: 'Current Project' }] : [];
  }, [analyticsData, projectId]);

  // Auto-select project if user has exactly 1 accessible project
  useEffect(() => {
    if (!selectedProjectId && accessibleProjects.length === 1) {
      setSelectedProjectId(accessibleProjects[0].id);
    }
  }, [accessibleProjects, selectedProjectId]);

  const accessibleSprints = useMemo(() => {
    return analyticsData?.filters?.sprints || [];
  }, [analyticsData]);

  // Tech leads set for Manager / Tech Lead team table
  const techLeadUserIds = useMemo(() => {
    const set = new Set();
    effectiveMembers.forEach((m) => {
      if (m.project_role === 'TECH_LEAD' || m.role === 'TECH_LEAD') {
        set.add(m.user_id || m.id);
      }
    });
    return set;
  }, [effectiveMembers]);

  // Member Performance Map for Manager / Tech Lead view
  const memberPerformanceMap = useMemo(() => {
    const map = new Map();

    effectiveMembers.forEach((m) => {
      const uid = m.user_id || m.id;
      const role = m.project_role || (m.role === 'TECH_LEAD' ? 'TECH_LEAD' : 'UNASSIGNED');
      map.set(uid, {
        userId: uid,
        name: m.name || m.user?.name || m.email || 'Member',
        email: m.email || m.user?.email || '',
        role,
        roleLabel: role === 'UNASSIGNED' ? 'Member' : (PROJECT_ROLE_LABELS[role] || role),
        isTechLead: role === 'TECH_LEAD' || m.role === 'TECH_LEAD',
        totalAssigned: 0,
        completed: 0,
        inProgress: 0,
        inReview: 0,
        blocked: 0,
        todo: 0,
        pastDue: 0,
        completedOnTime: 0,
        completionRate: 0,
        onTimeRate: 0,
      });
    });

    const now = new Date();
    workItems.forEach((w) => {
      const isPastDue = Boolean(
        w.due_date && 
        new Date(w.due_date) < now && 
        w.status !== 'COMPLETED'
      );

      const wasCompletedOnTime = Boolean(
        w.status === 'COMPLETED' &&
        (!w.due_date || new Date(w.completed_at || w.updated_at || w.due_date) <= new Date(w.due_date))
      );

      const assignees = Array.isArray(w.assignees) && w.assignees.length > 0 ? w.assignees : [];
      assignees.forEach((a) => {
        const uid = a.user_id || a.id;
        if (!uid) return;

        let entry = map.get(uid);
        if (!entry) {
          const isLead = techLeadUserIds.has(uid);
          entry = {
            userId: uid,
            name: a.name || a.email || 'Member',
            email: a.email || '',
            role: isLead ? 'TECH_LEAD' : 'MEMBER',
            roleLabel: isLead ? 'Tech Lead' : 'Member',
            isTechLead: isLead,
            totalAssigned: 0,
            completed: 0,
            inProgress: 0,
            inReview: 0,
            blocked: 0,
            todo: 0,
            pastDue: 0,
            completedOnTime: 0,
            completionRate: 0,
            onTimeRate: 0,
          };
          map.set(uid, entry);
        }

        entry.totalAssigned += 1;
        if (w.status === 'COMPLETED') {
          entry.completed += 1;
          if (wasCompletedOnTime) entry.completedOnTime += 1;
        } else if (w.status === 'IN_PROGRESS') {
          entry.inProgress += 1;
        } else if (w.status === 'IN_REVIEW') {
          entry.inReview += 1;
        } else if (w.status === 'BLOCKED') {
          entry.blocked += 1;
        } else if (w.status === 'TODO') {
          entry.todo += 1;
        }

        if (isPastDue) entry.pastDue += 1;
      });
    });

    map.forEach((entry) => {
      entry.completionRate = entry.totalAssigned > 0 
        ? Math.round((entry.completed / entry.totalAssigned) * 100) 
        : 0;
      entry.onTimeRate = entry.completed > 0 
        ? Math.round((entry.completedOnTime / entry.completed) * 100) 
        : (entry.totalAssigned > 0 && entry.pastDue === 0 ? 100 : 0);
    });

    return map;
  }, [effectiveMembers, workItems, techLeadUserIds]);

  const performanceRows = useMemo(() => {
    const list = Array.from(memberPerformanceMap.values());
    if (selectedPerformanceFilter === 'ALL') {
      return list.sort((a, b) => {
        if (a.isTechLead && !b.isTechLead) return -1;
        if (!a.isTechLead && b.isTechLead) return 1;
        const nameA = a.name || a.email || '';
        const nameB = b.name || b.email || '';
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      });
    }
    if (selectedPerformanceFilter === 'TECH_LEADS') {
      return list.filter((m) => m.isTechLead).sort((a, b) => {
        const nameA = a.name || a.email || '';
        const nameB = b.name || b.email || '';
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      });
    }
    return list.filter((m) => m.userId === selectedPerformanceFilter);
  }, [memberPerformanceMap, selectedPerformanceFilter]);

  // Primary Analytics Data Source
  // If server analytics exists, use it directly (already scoped server-side to the user/filters)
  // Otherwise, fallback to calculated stats from workItems
  const analytics = useMemo(() => {
    if (analyticsData && (isInternUser || selectedPerformanceFilter === 'ALL')) {
      return {
        total: analyticsData.total || 0,
        completed: analyticsData.completed || 0,
        inProgress: analyticsData.in_progress || 0,
        inReview: analyticsData.in_review || 0,
        todo: analyticsData.todo || 0,
        blocked: analyticsData.blocked || 0,
        pastDue: analyticsData.past_due || 0,
        completedOnTime: analyticsData.completed_on_time || 0,
        completionRate: analyticsData.completion_rate || 0,
        onTimeRate: analyticsData.on_time_rate || 0,
        statusCounts: analyticsData.status_counts || {},
        priorityCounts: analyticsData.priority_counts || {},
        typeCounts: analyticsData.type_counts || {},
        storyPointsTotal: analyticsData.story_points_total || 0,
        storyPointsCompleted: analyticsData.story_points_completed || 0,
        totalLoggedHours: analyticsData.total_logged_hours || 0,
        totalLoggedMinutes: analyticsData.total_logged_minutes || 0,
        trends: analyticsData.trends || [],
        taskBreakdown: analyticsData.task_breakdown || [],
      };
    }

    // Local calculation fallback
    let items = workItems;
    if (isInternUser && currentUserId) {
      items = workItems.filter((w) => {
        const assignees = w.assignees || w.work_item_assignees || [];
        const assignedIds = [
          ...assignees.map((a) => a.user_id || a.userId || a.assignee_id || a.user?.id || a.id),
          ...(w.assignee_ids || w.assigneeIds || []),
        ].filter(Boolean).map(String);
        return assignedIds.includes(String(currentUserId));
      });
    } else if (!isInternUser && selectedPerformanceFilter !== 'ALL') {
      if (selectedPerformanceFilter === 'TECH_LEADS') {
        items = workItems.filter((w) => w.assignees?.some((a) => techLeadUserIds.has(a.user_id || a.id)));
      } else {
        items = workItems.filter((w) => w.assignees?.some((a) => (a.user_id || a.id) === selectedPerformanceFilter));
      }
    }

    const total = items.length;
    const completed = items.filter(w => w.status === 'COMPLETED').length;
    const inProgress = items.filter(w => w.status === 'IN_PROGRESS').length;
    const inReview = items.filter(w => w.status === 'IN_REVIEW').length;
    const blocked = items.filter(w => w.status === 'BLOCKED').length;
    const todo = items.filter(w => w.status === 'TODO').length;
    
    const pastDue = items.filter(w => {
      if (w.status === 'COMPLETED') return false;
      if (!w.due_date) return false;
      return new Date(w.due_date) < new Date();
    }).length;

    const completedOnTime = items.filter(w => {
      if (w.status !== 'COMPLETED') return false;
      if (!w.due_date) return true;
      return new Date(w.completed_at || w.updated_at || w.due_date) <= new Date(w.due_date);
    }).length;

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const onTimeRate = completed > 0 
      ? Math.round((completedOnTime / completed) * 100) 
      : (total > 0 && pastDue === 0 ? 100 : 0);

    return {
      total,
      completed,
      inProgress,
      inReview,
      todo,
      blocked,
      pastDue,
      completedOnTime,
      onTimeRate,
      completionRate,
      statusCounts: { COMPLETED: completed, IN_PROGRESS: inProgress, IN_REVIEW: inReview, TODO: todo, BLOCKED: blocked },
      priorityCounts: {
        URGENT: items.filter(w => w.priority === 'URGENT').length,
        HIGH: items.filter(w => w.priority === 'HIGH').length,
        MEDIUM: items.filter(w => w.priority === 'MEDIUM').length,
        LOW: items.filter(w => w.priority === 'LOW').length,
      },
      typeCounts: {
        EPIC: items.filter(w => w.type === 'EPIC').length,
        STORY: items.filter(w => w.type === 'STORY').length,
        TASK: items.filter(w => w.type === 'TASK').length,
        SUBTASK: items.filter(w => w.type === 'SUBTASK').length,
        BUG: items.filter(w => w.type === 'BUG').length,
      },
      storyPointsTotal: items.reduce((sum, w) => sum + (Number(w.story_points) || 0), 0),
      storyPointsCompleted: items.filter(w => w.status === 'COMPLETED').reduce((sum, w) => sum + (Number(w.story_points) || 0), 0),
      totalLoggedHours: 0,
      totalLoggedMinutes: 0,
      trends: [],
      taskBreakdown: items.map(w => ({
        id: w.id,
        title: w.title,
        type: w.type,
        status: w.status,
        priority: w.priority,
        due_date: w.due_date,
        completed_at: w.completed_at,
        story_points: w.story_points || 0,
        logged_hours: 0,
        logged_minutes: 0,
        is_past_due: Boolean(w.due_date && new Date(w.due_date) < new Date() && w.status !== 'COMPLETED'),
        was_completed_on_time: Boolean(w.status === 'COMPLETED' && (!w.due_date || new Date(w.completed_at || w.updated_at || w.due_date) <= new Date(w.due_date))),
        project_name: w.project?.name || null,
      })),
    };
  }, [analyticsData, isInternUser, workItems, currentUserId, selectedPerformanceFilter, techLeadUserIds]);

  // Donut chart calculations
  const donutSize = 160;
  const strokeWidth = 22;
  const radius = (donutSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const donutSegments = useMemo(() => {
    if (analytics.total === 0) return [];
    let accumulatedAngle = 0;
    return Object.entries(STATUS_CONFIG).map(([statusKey, config]) => {
      const count = analytics.statusCounts[statusKey] || 0;
      const percentage = (count / analytics.total) * 100;
      const dash = (percentage / 100) * circumference;
      const offset = -((accumulatedAngle / 100) * circumference);
      accumulatedAngle += percentage;
      return {
        statusKey,
        config,
        count,
        percentage,
        strokeDasharray: `${dash} ${circumference}`,
        strokeDashoffset: offset,
      };
    }).filter(seg => seg.count > 0);
  }, [analytics, circumference]);

  // Filtered Personal Tasks for Tab B (Individual Performance Table)
  const personalTasks = useMemo(() => {
    const list = analytics.taskBreakdown || [];
    return list.filter((t) => {
      if (personalStatusFilter !== 'ALL' && t.status !== personalStatusFilter) {
        return false;
      }
      if (personalSearchQuery.trim()) {
        const q = personalSearchQuery.toLowerCase();
        const matchTitle = t.title?.toLowerCase().includes(q);
        const matchType = t.type?.toLowerCase().includes(q);
        const matchProj = t.project_name?.toLowerCase().includes(q);
        return matchTitle || matchType || matchProj;
      }
      return true;
    });
  }, [analytics.taskBreakdown, personalStatusFilter, personalSearchQuery]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-10 border border-slate-200/80 shadow-card flex flex-col items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-3" />
        <p className="text-xs font-semibold text-slate-700">Loading task analytics & performance...</p>
        <p className="text-[11px] text-slate-400 mt-0.5">Fetching verified workload distributions</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl p-8 border border-rose-200 shadow-card text-center">
        <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
        <h4 className="text-sm font-bold text-slate-800">Failed to load task analytics</h4>
        <p className="text-xs text-rose-600 mt-1">{error}</p>
        <button
          onClick={fetchAnalytics}
          className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      {/* 1. HEADER BAR: Title, Subtitle, Tab Mode Switcher, Scope, Refresh */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Award className="w-4 h-4 text-purple-600" />
            <span>
              {isInternUser
                ? 'Task Analytics & Performance'
                : viewMode === 'PERFORMANCE'
                ? 'Team Members & Tech Leads Performance'
                : viewMode === 'BOTH'
                ? 'Project Analytics & Team Performance'
                : 'Task Analytics & Work Distribution'}
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isInternUser
              ? 'Real-time task status, workload, and individual performance metrics'
              : viewMode === 'PERFORMANCE'
              ? 'Individual completion rates, active work, and on-time delivery across team members'
              : 'Real-time status breakdowns, priority distribution, and velocity metrics from Supabase database'}
          </p>
        </div>

        {/* Header Actions / Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Intern Two-Tab Switcher: Tab A (Tasks & Graphs) vs Tab B (Individual Performance) */}
          {isInternUser ? (
            <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200/70 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('TASKS')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'TASKS'
                    ? 'bg-white text-purple-700 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Tasks & Graphs</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('PERFORMANCE')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'PERFORMANCE'
                    ? 'bg-white text-purple-700 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Individual Performance</span>
              </button>
            </div>
          ) : (
            /* Manager Three-Way Segmented Switcher */
            <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200/70 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('TASKS')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'TASKS'
                    ? 'bg-white text-purple-700 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Tasks & Graphs</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('PERFORMANCE')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'PERFORMANCE'
                    ? 'bg-white text-purple-700 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Award className="w-3.5 h-3.5" />
                <span>Team Performance</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('BOTH')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer hidden lg:inline-flex ${
                  viewMode === 'BOTH'
                    ? 'bg-white text-purple-700 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Both</span>
              </button>
            </div>
          )}

          {/* Manager Scope Dropdown Filter */}
          {!isInternUser && (
            <div className="relative" ref={dropdownRef}>
              <div className="inline-flex items-center rounded-xl border shadow-2xs overflow-hidden transition-all bg-white border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                    selectedPerformanceFilter !== 'ALL'
                      ? 'bg-purple-50 text-purple-900'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5 text-purple-600" />
                  <span>
                    {selectedPerformanceFilter === 'ALL'
                      ? 'All Scope'
                      : selectedPerformanceFilter === 'TECH_LEADS'
                      ? 'Scope: Tech Leads'
                      : `Scope: ${memberPerformanceMap.get(selectedPerformanceFilter)?.name || 'Selected Member'}`}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
                </button>

                {selectedPerformanceFilter !== 'ALL' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPerformanceFilter('ALL');
                      setIsDropdownOpen(false);
                    }}
                    title="Reset to All Project Tasks"
                    className="px-2 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-700 border-l border-purple-200 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {isDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-72 rounded-xl bg-white border border-slate-200 shadow-xl p-2 z-30 text-slate-800 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    Select View & Analytics Scope
                  </div>

                  <div className="py-1 space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPerformanceFilter('ALL');
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        selectedPerformanceFilter === 'ALL'
                          ? 'bg-purple-100 text-purple-900 font-bold'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-purple-600" />
                        <div className="text-left">
                          <span className="block leading-none">All Project Tasks (Default)</span>
                          <span className="text-[10px] text-slate-400 font-normal">Full project tasks graph & mix</span>
                        </div>
                      </div>
                    </button>
                  </div>

                  <div className="p-1 border-t border-slate-100">
                    <div className="relative">
                      <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={memberSearchQuery}
                        onChange={(e) => setMemberSearchQuery(e.target.value)}
                        placeholder="Filter members..."
                        className="w-full pl-7 pr-7 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-purple-500"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>

                  <div className="max-h-52 overflow-y-auto space-y-0.5 pr-0.5">
                    {Array.from(memberPerformanceMap.values())
                      .filter((mem) => {
                        if (!memberSearchQuery.trim()) return true;
                        const q = memberSearchQuery.toLowerCase();
                        return (
                          mem.name.toLowerCase().includes(q) ||
                          mem.email.toLowerCase().includes(q) ||
                          (mem.roleLabel && mem.roleLabel.toLowerCase().includes(q))
                        );
                      })
                      .map((mem) => (
                        <button
                          key={mem.userId}
                          type="button"
                          onClick={() => {
                            setSelectedPerformanceFilter(mem.userId);
                            setIsDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                            selectedPerformanceFilter === mem.userId
                              ? 'bg-purple-50 text-purple-900 font-bold'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            <span className="truncate">{mem.name}</span>
                            {mem.isTechLead && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100 text-purple-700 shrink-0">
                                Lead
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {mem.completed}/{mem.totalAssigned} done
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Refresh Button */}
          <button
            type="button"
            onClick={fetchAnalytics}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
            title="Refresh current data"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 2. FILTERS & SCOPE BAR: Project, Sprint, Date Range Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Project Filter */}
          {accessibleProjects.length > 1 && (
            <div className="inline-flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Project:</span>
              <select
                value={selectedProjectId || ''}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700 focus:outline-purple-500 cursor-pointer"
              >
                <option value="">All Projects</option>
                {accessibleProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Sprint Filter */}
          {accessibleSprints.length > 0 && (
            <div className="inline-flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sprint:</span>
              <select
                value={selectedSprintId || 'ALL'}
                onChange={(e) => setSelectedSprintId(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700 focus:outline-purple-500 cursor-pointer"
              >
                <option value="ALL">All Sprints</option>
                {accessibleSprints.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Date Range Filter */}
          <div className="inline-flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date Range:</span>
            <select
              value={dateRangeFilter}
              onChange={(e) => setDateRangeFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700 focus:outline-purple-500 cursor-pointer"
            >
              <option value="ALL">All Time</option>
              <option value="7D">Last 7 Days</option>
              <option value="14D">Last 14 Days</option>
              <option value="30D">Last 30 Days</option>
              <option value="THIS_MONTH">This Month</option>
            </select>
          </div>

          {/* Clear Filters Button if any active */}
          {(selectedSprintId !== 'ALL' || dateRangeFilter !== 'ALL' || (accessibleProjects.length > 1 && selectedProjectId)) && (
            <button
              type="button"
              onClick={() => {
                setSelectedProjectId(projectId || '');
                setSelectedSprintId('ALL');
                setDateRangeFilter('ALL');
              }}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-600 hover:text-purple-800 transition-colors cursor-pointer ml-1"
            >
              <X className="w-3 h-3" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        {/* Current Scope Badge */}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
          <span>
            {isInternUser ? 'Your Verified Personal Workload' : 'Project Scope'} (
            <strong className="text-slate-800">{analytics.total}</strong> {analytics.total === 1 ? 'task' : 'tasks'})
          </span>
        </div>
      </div>

      {/* 3. TAB A: TASKS & GRAPHS VIEW (Visible in TASKS mode or manager BOTH mode) */}
      {(viewMode === 'TASKS' || (!isInternUser && viewMode === 'BOTH')) && (
        <div className="space-y-4">
          {/* KPI Highlight Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* 1. Tasks Assigned */}
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tasks Assigned</span>
                <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Layers className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-2">{analytics.total}</div>
              <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                {isInternUser 
                  ? 'Assigned to you in this project' 
                  : selectedPerformanceFilter === 'ALL'
                  ? 'Across entire project'
                  : selectedPerformanceFilter === 'TECH_LEADS'
                  ? 'Assigned to Tech Leads'
                  : 'Assigned to selected member'}
              </div>
            </div>

            {/* 2. Completed */}
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Completed</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-bold text-emerald-600 mt-2">{analytics.completed}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {analytics.completionRate}% completion rate ({analytics.inProgress} active)
              </div>
            </div>

            {/* 3. On-Time Delivery */}
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">On-Time Delivery</span>
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <CalendarCheck className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-bold text-blue-600 mt-2">{analytics.onTimeRate}%</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {analytics.completedOnTime} completed on time
              </div>
            </div>

            {/* 4. Past Due */}
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Past Due</span>
                <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                  <AlertTriangle className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-bold text-rose-600 mt-2">{analytics.pastDue}</div>
              <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                {analytics.pastDue > 0 ? `${analytics.pastDue} overdue deadlines` : 'All tasks on schedule'}
              </div>
            </div>
          </div>

          {/* Main Visual Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Chart 1: Status Distribution (Donut) - 5 Columns */}
            <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-purple-600" />
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Status Distribution</h3>
                  </div>
                  <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200/60">
                    Live Data
                  </span>
                </div>

                {/* Donut Chart Visual */}
                <div className="my-5 flex flex-col sm:flex-row items-center justify-center gap-6">
                  <div className="relative flex items-center justify-center shrink-0">
                    <svg width={donutSize} height={donutSize} className="transform -rotate-90">
                      <circle
                        cx={donutSize / 2}
                        cy={donutSize / 2}
                        r={radius}
                        stroke="#F1F5F9"
                        strokeWidth={strokeWidth}
                        fill="transparent"
                      />
                      {donutSegments.map((seg) => (
                        <circle
                          key={seg.statusKey}
                          cx={donutSize / 2}
                          cy={donutSize / 2}
                          r={radius}
                          stroke={seg.config.color}
                          strokeWidth={strokeWidth}
                          strokeDasharray={seg.strokeDasharray}
                          strokeDashoffset={seg.strokeDashoffset}
                          fill="transparent"
                          strokeLinecap="round"
                          className="transition-all duration-500 hover:opacity-85"
                        />
                      ))}
                    </svg>

                    {/* Center metric */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-2xl font-extrabold text-slate-900 leading-none">
                        {analytics.total}
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">
                        Items
                      </span>
                    </div>
                  </div>

                  {/* Status Legend */}
                  <div className="space-y-2 w-full max-w-[180px]">
                    {Object.entries(STATUS_CONFIG).map(([key, config]) => {
                      const count = analytics.statusCounts[key] || 0;
                      const pct = analytics.total > 0 ? Math.round((count / analytics.total) * 100) : 0;
                      return (
                        <div key={key} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span 
                              className="w-2.5 h-2.5 rounded-full shrink-0" 
                              style={{ backgroundColor: config.color }} 
                            />
                            <span className="text-slate-600 truncate">{config.label}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 font-medium">
                            <span className="text-slate-800 font-bold">{count}</span>
                            <span className="text-slate-400 text-[10px]">({pct}%)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Bottom Progress Bar */}
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
                  <span className="text-slate-500">Overall Progress</span>
                  <span className="text-purple-700 font-bold">{analytics.completionRate}% Done</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden flex">
                  {donutSegments.map(seg => (
                    <div
                      key={seg.statusKey}
                      style={{ 
                        width: `${seg.percentage}%`, 
                        backgroundColor: seg.config.color 
                      }}
                      className="h-full transition-all duration-300"
                      title={`${seg.config.label}: ${seg.count} (${Math.round(seg.percentage)}%)`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Chart 2: Priority Volume & Work-Item Types - 7 Columns */}
            <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-purple-600" />
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Priority & Deliverable Mix</h3>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">Categorized</span>
                </div>

                {/* Priority Breakdown Bars */}
                <div className="mt-4 space-y-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Priority Volume
                  </span>
                  {Object.entries(PRIORITY_CONFIG).map(([key, config]) => {
                    const count = analytics.priorityCounts[key] || 0;
                    const pct = analytics.total > 0 ? (count / analytics.total) * 100 : 0;
                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700">{config.label}</span>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="font-bold text-slate-900">{count}</span>
                            <span className="text-slate-400 text-[10px]">({Math.round(pct)}%)</span>
                          </div>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${config.barClass}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Work-Item Types Grid */}
                <div className="mt-5 pt-4 border-t border-slate-100">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2.5">
                    Work-Item Types
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {Object.entries(TYPE_CONFIG).map(([typeKey, config]) => {
                      const count = analytics.typeCounts[typeKey] || 0;
                      return (
                        <div key={typeKey} className="p-2.5 rounded-xl bg-slate-50/70 border border-slate-200/60 text-center">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{config.label}</div>
                          <div className="text-base font-extrabold text-slate-900 mt-1" style={{ color: config.color }}>
                            {count}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Scope & Database Sync Footer */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-purple-600" />
                  <span>
                    Scope: <strong>{isInternUser ? 'Your Personal Workload (Private)' : selectedPerformanceFilter === 'ALL' ? `All Members (${members.length})` : selectedPerformanceFilter === 'TECH_LEADS' ? `Tech Leads (${techLeadUserIds.size})` : (memberPerformanceMap.get(selectedPerformanceFilter)?.name || 'Selected User')}</strong>
                  </span>
                </span>
                <span className="text-purple-600 font-semibold flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  <span>Live Supabase Database Sync</span>
                </span>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* 4. TAB B: INDIVIDUAL PERFORMANCE VIEW (For Intern) OR TEAM PERFORMANCE VIEW (For Manager) */}
      {(viewMode === 'PERFORMANCE' || (!isInternUser && viewMode === 'BOTH')) && (
        <div className="space-y-4">
          {/* INTERN INDIVIDUAL PERFORMANCE DASHBOARD */}
          {isInternUser ? (
            <div className="space-y-4">
              {/* Performance Metrics Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* 1. Assigned Work Items & Points */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Your Assigned Work</div>
                  <div className="text-xl font-bold text-slate-900 mt-1">{analytics.total}</div>
                  <div className="text-[10px] text-purple-700 font-semibold mt-0.5">
                    {analytics.storyPointsTotal} story points assigned
                  </div>
                </div>

                {/* 2. Completion Progress */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Completion Progress</div>
                  <div className="text-xl font-bold text-purple-700 mt-1">{analytics.completionRate}%</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {analytics.completed} delivered ({analytics.inProgress} in progress)
                  </div>
                </div>

                {/* 3. Actual Work Time Logged */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3 h-3 text-emerald-600" />
                    <span>Time Logged</span>
                  </div>
                  <div className="text-xl font-bold text-emerald-600 mt-1">
                    {analytics.totalLoggedHours > 0 ? `${analytics.totalLoggedHours}h` : `${analytics.totalLoggedMinutes}m`}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {analytics.completed > 0 && analytics.totalLoggedHours > 0 
                      ? `~${(analytics.totalLoggedHours / analytics.completed).toFixed(1)}h avg per task` 
                      : 'Recorded work entries'}
                  </div>
                </div>

                {/* 4. Delivery Accuracy */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Delivery Accuracy</div>
                  <div className="text-xl font-bold text-blue-600 mt-1">{analytics.onTimeRate}%</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {analytics.pastDue > 0 ? `${analytics.pastDue} overdue deadlines` : '100% on schedule'}
                  </div>
                </div>
              </div>

              {/* Status Breakdown & Workload Consistency Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Left Card: Workflow Pipeline State */}
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Workflow Pipeline State
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">Real-time Tasks</span>
                  </div>

                  <div className="space-y-2.5">
                    {[
                      { label: 'Completed', count: analytics.completed, color: 'bg-emerald-500', text: 'text-emerald-700' },
                      { label: 'In Progress', count: analytics.inProgress, color: 'bg-purple-600', text: 'text-purple-700' },
                      { label: 'In Review', count: analytics.inReview, color: 'bg-blue-500', text: 'text-blue-700' },
                      { label: 'To Do', count: analytics.todo, color: 'bg-slate-400', text: 'text-slate-600' },
                      { label: 'Blocked', count: analytics.blocked, color: 'bg-rose-500', text: 'text-rose-700' },
                    ].map((item) => {
                      const pct = analytics.total > 0 ? Math.round((item.count / analytics.total) * 100) : 0;
                      return (
                        <div key={item.label} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-700">{item.label}</span>
                            <span className="font-bold text-slate-900">{item.count} <span className="text-slate-400 font-normal">({pct}%)</span></span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-300 ${item.color}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right Card: Effort & Delivery Consistency */}
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Effort & Consistency
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        analytics.total === 0 
                          ? 'bg-slate-100 text-slate-600 border-slate-200' 
                          : analytics.onTimeRate >= 80 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {analytics.total === 0 ? 'No Work' : analytics.onTimeRate >= 80 ? 'On Track' : 'Needs Follow-Up'}
                      </span>
                    </div>

                    <div className="mt-3 space-y-3 text-xs">
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                        <span className="text-slate-600">Story Points Delivered</span>
                        <span className="font-bold text-purple-700">
                          {analytics.storyPointsCompleted} / {analytics.storyPointsTotal} pts
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                        <span className="text-slate-600">Recorded Work Time</span>
                        <span className="font-bold text-emerald-700">
                          {analytics.totalLoggedHours} hours ({analytics.totalLoggedMinutes}m)
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                        <span className="text-slate-600">Overdue Deliverables</span>
                        <span className={`font-bold ${analytics.pastDue > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                          {analytics.pastDue} {analytics.pastDue === 1 ? 'task' : 'tasks'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 italic pt-2 border-t border-slate-100">
                    Metrics reflect your individual contributions and recorded time entries.
                  </p>
                </div>
              </div>

              {/* Personal Task Delivery Record Table */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-purple-600" />
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Personal Task Delivery Record
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                      {personalTasks.length} {personalTasks.length === 1 ? 'Deliverable' : 'Deliverables'}
                    </span>
                  </div>

                  {/* Search and Status Filter for Personal Tasks */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={personalSearchQuery}
                        onChange={(e) => setPersonalSearchQuery(e.target.value)}
                        placeholder="Search your tasks..."
                        className="pl-7 pr-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-purple-500 w-44"
                      />
                    </div>

                    <select
                      value={personalStatusFilter}
                      onChange={(e) => setPersonalStatusFilter(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-700 focus:outline-purple-500 cursor-pointer"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="IN_REVIEW">In Review</option>
                      <option value="TODO">To Do</option>
                      <option value="BLOCKED">Blocked</option>
                    </select>
                  </div>
                </div>

                {personalTasks.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">
                    <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-700">No assigned tasks match criteria</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Adjust your search or filter above to inspect your deliverables.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                        <tr>
                          <th className="py-3 px-4">Work Item</th>
                          <th className="py-3 px-3">Type</th>
                          <th className="py-3 px-3">Priority</th>
                          <th className="py-3 px-3">Status</th>
                          <th className="py-3 px-3">Due Date</th>
                          <th className="py-3 px-3 text-center">Points</th>
                          <th className="py-3 px-3 text-center">Time Logged</th>
                          <th className="py-3 px-4 text-right">Delivery</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                        {personalTasks.map((task) => {
                          const typeStyle = TYPE_CONFIG[task.type] || TYPE_CONFIG.TASK;
                          const priorityStyle = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.MEDIUM;
                          const statusStyle = STATUS_CONFIG[task.status] || STATUS_CONFIG.TODO;

                          return (
                            <tr key={task.id} className="hover:bg-slate-50/60 transition-colors">
                              {/* Title & Project */}
                              <td className="py-3 px-4 max-w-xs">
                                <div className="font-bold text-slate-900 truncate" title={task.title}>
                                  {task.title}
                                </div>
                                {task.project_name && (
                                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                    {task.project_name}
                                  </div>
                                )}
                              </td>

                              {/* Type Badge */}
                              <td className="py-3 px-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border inline-block ${typeStyle.badgeClass}`}>
                                  {typeStyle.label}
                                </span>
                              </td>

                              {/* Priority Badge */}
                              <td className="py-3 px-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border inline-block ${priorityStyle.badgeClass}`}>
                                  {priorityStyle.label}
                                </span>
                              </td>

                              {/* Status Badge */}
                              <td className="py-3 px-3">
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border inline-block ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                                  {statusStyle.label}
                                </span>
                              </td>

                              {/* Due Date & On-Time Status */}
                              <td className="py-3 px-3 whitespace-nowrap">
                                {task.due_date ? (
                                  <div className="space-y-0.5">
                                    <div className="text-xs text-slate-800">
                                      {new Date(task.due_date).toLocaleDateString()}
                                    </div>
                                    {task.is_past_due ? (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                        Overdue
                                      </span>
                                    ) : task.status === 'COMPLETED' ? (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        On-Time
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-slate-400">Scheduled</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-300 text-xs">—</span>
                                )}
                              </td>

                              {/* Story Points */}
                              <td className="py-3 px-3 text-center font-bold text-slate-900">
                                {task.story_points || '—'}
                              </td>

                              {/* Time Logged */}
                              <td className="py-3 px-3 text-center">
                                {task.logged_hours > 0 ? (
                                  <span className="font-bold text-emerald-700">
                                    {task.logged_hours}h
                                  </span>
                                ) : task.logged_minutes > 0 ? (
                                  <span className="font-semibold text-emerald-700">
                                    {task.logged_minutes}m
                                  </span>
                                ) : (
                                  <span className="text-slate-300">0h</span>
                                )}
                              </td>

                              {/* Delivery Progress Bar */}
                              <td className="py-3 px-4 text-right">
                                {task.status === 'COMPLETED' ? (
                                  <span className="text-emerald-600 font-bold text-xs inline-flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Done</span>
                                  </span>
                                ) : (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <span className="text-[10px] text-slate-400 font-medium">In Flow</span>
                                    <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                      <div 
                                        className={`h-full ${task.status === 'IN_PROGRESS' ? 'bg-purple-600 w-1/2' : task.status === 'IN_REVIEW' ? 'bg-blue-600 w-3/4' : 'bg-slate-300 w-1/6'}`} 
                                      />
                                    </div>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* MANAGER TEAM PERFORMANCE TABLE (Unchanged for Manager view) */
            <div className="space-y-3">
              {/* Performance Summary Metrics Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Members Tracked</div>
                  <div className="text-xl font-bold text-slate-900 mt-1">{performanceRows.length}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{techLeadUserIds.size} tech leads</div>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Completion Rate</div>
                  <div className="text-xl font-bold text-purple-700 mt-1">
                    {performanceRows.length > 0 
                      ? Math.round(performanceRows.reduce((acc, r) => acc + r.completionRate, 0) / performanceRows.length)
                      : 0}%
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Across active assignees</div>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Completed</div>
                  <div className="text-xl font-bold text-emerald-600 mt-1">
                    {performanceRows.reduce((acc, r) => acc + r.completed, 0)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Tasks delivered</div>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Past Due Items</div>
                  <div className="text-xl font-bold text-rose-600 mt-1">
                    {performanceRows.reduce((acc, r) => acc + r.pastDue, 0)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Requires follow-up</div>
                </div>
              </div>

              {/* Members Table */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-purple-600" />
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      {selectedPerformanceFilter === 'TECH_LEADS'
                        ? 'Tech Leads Performance & Task Delivery'
                        : selectedPerformanceFilter !== 'ALL'
                        ? `${memberPerformanceMap.get(selectedPerformanceFilter)?.name || 'Member'} — Task Performance Record`
                        : 'Team Members & Tech Leads Performance Directory'}
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                      {performanceRows.length} Tracked
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Tasks Completed · Assigned · Past Due · On-Time Delivery
                  </div>
                </div>

                {performanceRows.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">
                    <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-700">No members matching current scope</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Switch dropdown filter above to view performance</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                        <tr>
                          <th className="py-3 px-4">Member / Tech Lead</th>
                          <th className="py-3 px-3">Role</th>
                          <th className="py-3 px-3 text-center">Assigned</th>
                          <th className="py-3 px-3 text-center">Completed</th>
                          <th className="py-3 px-3 text-center">Active Work</th>
                          <th className="py-3 px-3 text-center">Past Due</th>
                          <th className="py-3 px-3 text-center">On-Time</th>
                          <th className="py-3 px-4 text-right">Completion Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                        {performanceRows.map((mem) => {
                          const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(mem.name)}&background=random`;
                          const activeCount = mem.inProgress + mem.inReview;
                          return (
                            <tr 
                              key={mem.userId}
                              onClick={() => setSelectedPerformanceFilter(mem.userId === selectedPerformanceFilter ? 'ALL' : mem.userId)}
                              className={`hover:bg-purple-50/40 transition-colors cursor-pointer ${
                                selectedPerformanceFilter === mem.userId ? 'bg-purple-50/60 font-semibold' : ''
                              }`}
                              title="Click to filter charts by this member"
                            >
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2.5">
                                  <img 
                                    src={avatar} 
                                    alt={mem.name} 
                                    className="w-7 h-7 rounded-full object-cover ring-1 ring-slate-200 shrink-0" 
                                  />
                                  <div className="min-w-0">
                                    <div className="font-bold text-slate-900 truncate">{mem.name}</div>
                                    {mem.email && <div className="text-[10px] text-slate-400 truncate">{mem.email}</div>}
                                  </div>
                                </div>
                              </td>

                              <td className="py-3 px-3">
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border inline-block whitespace-nowrap ${
                                  mem.isTechLead
                                    ? 'bg-purple-100 text-purple-800 border-purple-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}>
                                  {mem.roleLabel}
                                </span>
                              </td>

                              <td className="py-3 px-3 text-center font-bold text-slate-900">
                                {mem.totalAssigned}
                              </td>

                              <td className="py-3 px-3 text-center">
                                <span className="font-bold text-emerald-600">{mem.completed}</span>
                              </td>

                              <td className="py-3 px-3 text-center">
                                {activeCount > 0 ? (
                                  <span className="font-semibold text-blue-600">{activeCount}</span>
                                ) : (
                                  <span className="text-slate-300">0</span>
                                )}
                              </td>

                              <td className="py-3 px-3 text-center">
                                {mem.pastDue > 0 ? (
                                  <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-bold border border-rose-200">
                                    {mem.pastDue}
                                  </span>
                                ) : (
                                  <span className="text-slate-300">0</span>
                                )}
                              </td>

                              <td className="py-3 px-3 text-center font-semibold">
                                {mem.completed > 0 ? (
                                  <span className={mem.onTimeRate >= 80 ? 'text-emerald-600' : 'text-amber-600'}>
                                    {mem.onTimeRate}%
                                  </span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>

                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-purple-600 rounded-full transition-all duration-300"
                                      style={{ width: `${mem.completionRate}%` }}
                                    />
                                  </div>
                                  <span className="font-bold text-purple-700 text-xs w-9 text-right">
                                    {mem.completionRate}%
                                  </span>
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
