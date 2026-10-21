import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Award,
  UserCheck,
  RefreshCw,
  Search,
  FolderKanban,
  User,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertOctagon,
  HelpCircle,
  TrendingUp,
  ChevronDown,
  Check,
  X,
  Layers,
  CheckSquare,
  Info,
  FileText,
  AlertCircle,
  Activity,
  ArrowUpRight,
  Shield,
} from 'lucide-react';
import { projectsService } from '../../services/projects.service';
import { workItemsService } from '../../services/workItems.service';

const formatHealthLabel = (val) => {
  if (!val) return '';
  const str = String(val).replace(/_/g, ' ').toLowerCase();
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
};

export default function ReportsView({ onToast, selectedCohort, selectedCohortId }) {
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const queryUserId = searchParams.get('userId') || searchParams.get('user_id') || location?.state?.userId || location?.state?.user_id;

  // View mode switcher: 'TASKS' | 'PERFORMANCE' | 'BOTH'
  const [viewMode, setViewMode] = useState('BOTH');

  // Scope filter: 'ALL' | 'TECH_LEADS' | userId
  const [selectedScope, setSelectedScope] = useState(() => queryUserId || 'ALL');

  // Keep scope in sync when navigation changes with query parameters or location state
  useEffect(() => {
    if (queryUserId && queryUserId !== selectedScope) {
      setSelectedScope(queryUserId);
      const filters = {};
      if (selectedProjectId !== 'ALL') filters.project_id = selectedProjectId;
      filters.user_id = queryUserId;
      void loadAnalytics(filters);
    }
  }, [queryUserId]);
  const [isScopeDropdownOpen, setIsScopeDropdownOpen] = useState(false);
  const [scopeSearchQuery, setScopeSearchQuery] = useState('');
  const scopeDropdownRef = useRef(null);

  // Project filter: 'ALL' | projectId
  const [selectedProjectId, setSelectedProjectId] = useState('ALL');
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState('');
  const projectDropdownRef = useRef(null);

  // Entities state
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState(null);
  const [syncErrorMessage, setSyncErrorMessage] = useState(null);

  // Analytics section tabs: 'WORK_ITEMS' (default) | 'PROJECT_HEALTH'
  const [analyticsTab, setAnalyticsTab] = useState('WORK_ITEMS');
  const [projectHealthData, setProjectHealthData] = useState(null);
  const [isLoadingHealth, setIsLoadingHealth] = useState(false);
  const [healthError, setHealthError] = useState(null);

  // Analytics report data & state
  const [analytics, setAnalytics] = useState(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true);
  const [analyticsError, setAnalyticsError] = useState(null);

  // Task filter tab in breakdown table: 'ALL' | 'COMPLETED' | 'IN_PROGRESS' | 'BLOCKED' | 'PAST_DUE'
  const [taskFilter, setTaskFilter] = useState('ALL');
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('ALL'); // 'ALL' | 'TECH_LEAD' | 'INTERN'

  // Load analytics scoped to current filters
  const loadAnalytics = useCallback(async (filters = {}) => {
    setIsLoadingAnalytics(true);
    setAnalyticsError(null);
    try {
      const params = {};
      if (filters.project_id && filters.project_id !== 'ALL') {
        params.project_id = filters.project_id;
      }
      if (filters.user_id && filters.user_id !== 'ALL' && filters.user_id !== 'TECH_LEADS' && filters.user_id !== 'INTERNS') {
        params.user_id = filters.user_id;
      }

      const data = await workItemsService.getAnalytics(params);
      setAnalytics(data);
    } catch (err) {
      console.error('Failed to load performance analytics:', err);
      setAnalyticsError('Could not load performance metrics for the selected scope.');
      setAnalytics(null);
    } finally {
      setIsLoadingAnalytics(false);
    }
  }, []);

  // On-demand fetch & cache for Project Health Overview
  const fetchProjectHealth = useCallback(async (force = false) => {
    if (!force && projectHealthData) return;
    if (isLoadingHealth) return;

    setIsLoadingHealth(true);
    setHealthError(null);
    try {
      const params = selectedCohortId ? { cohort_id: selectedCohortId } : {};
      const res = await projectsService.getHealthOverview(params);
      setProjectHealthData(res);
    } catch (err) {
      console.error('Failed to load project health overview:', err);
      setHealthError('Failed to load project health overview. Please check connection and try again.');
    } finally {
      setIsLoadingHealth(false);
    }
  }, [selectedCohortId, projectHealthData, isLoadingHealth]);

  // Tab switch handler: on-demand fetch on first selection
  const handleTabSwitch = (tab) => {
    setAnalyticsTab(tab);
    if (tab === 'PROJECT_HEALTH' && !projectHealthData) {
      fetchProjectHealth();
    }
  };

  // Fetch initial entities and report
  const fetchEntitiesAndReport = useCallback(async () => {
    try {
      const userParams = {
        ...(selectedCohortId ? { cohort_id: selectedCohortId } : {}),
        type: 'INTERN',
      };
      const [projData, userData] = await Promise.all([
        projectsService.getProjects().catch(() => []),
        projectsService.getUsers(userParams).catch(() => []),
      ]);

      const fetchedProjects = Array.isArray(projData) ? projData : (projData?.projects || []);
      const fetchedMembers = Array.isArray(userData) ? userData : (userData?.users || []);

      setProjects(fetchedProjects);
      setMembers(fetchedMembers);

      // Trigger initial analytics fetch
      const initialFilters = {};
      if (selectedProjectId !== 'ALL') initialFilters.project_id = selectedProjectId;
      const targetScope = queryUserId || selectedScope;
      if (targetScope !== 'ALL' && targetScope !== 'TECH_LEADS' && targetScope !== 'INTERNS') initialFilters.user_id = targetScope;
      await loadAnalytics(initialFilters);

      // Reset cached project health when cohort context initializes
      setProjectHealthData(null);
    } catch (err) {
      console.error('Failed to load initial report entities:', err);
    }
  }, [selectedCohortId, selectedProjectId, selectedScope, loadAnalytics]);

  useEffect(() => {
    setProjectHealthData(null);
    fetchEntitiesAndReport();
  }, [fetchEntitiesAndReport]);

  // Click outside listener for dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (scopeDropdownRef.current && !scopeDropdownRef.current.contains(event.target)) {
        setIsScopeDropdownOpen(false);
      }
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(event.target)) {
        setIsProjectDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync Projects & Members Handler
  const handleSyncProjects = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncErrorMessage(null);
    setSyncSuccessMessage(null);

    try {
      const userParams = selectedCohortId ? { cohort_id: selectedCohortId } : {};
      const [projData, userData] = await Promise.all([
        projectsService.getProjects(),
        projectsService.getUsers(userParams),
      ]);

      const fetchedProjects = Array.isArray(projData) ? projData : (projData?.projects || []);
      const fetchedMembers = Array.isArray(userData) ? userData : (userData?.users || []);

      setProjects(fetchedProjects);
      setMembers(fetchedMembers);

      // Refresh active analytics
      const activeFilters = {};
      if (selectedProjectId !== 'ALL') activeFilters.project_id = selectedProjectId;
      if (selectedScope !== 'ALL' && selectedScope !== 'TECH_LEADS' && selectedScope !== 'INTERNS') activeFilters.user_id = selectedScope;
      await loadAnalytics(activeFilters);

      // If project health was already fetched or is currently active, refresh it as well
      if (projectHealthData || analyticsTab === 'PROJECT_HEALTH') {
        await fetchProjectHealth(true);
      }

      const countMsg = `Synchronized ${fetchedProjects.length} project${fetchedProjects.length === 1 ? '' : 's'} and ${fetchedMembers.length} team member${fetchedMembers.length === 1 ? '' : 's'}`;
      setSyncSuccessMessage(countMsg);
      if (onToast) onToast(countMsg);
      setTimeout(() => setSyncSuccessMessage(null), 4000);
    } catch (err) {
      console.error('Failed to sync projects:', err);
      const errMsg = 'Failed to synchronize projects. Please check connection and try again.';
      setSyncErrorMessage(errMsg);
      if (onToast) onToast(errMsg);
      setTimeout(() => setSyncErrorMessage(null), 4000);
    } finally {
      setIsSyncing(false);
    }
  };

  // Scope selection change
  const handleSelectScope = (scopeId) => {
    setSelectedScope(scopeId);
    setIsScopeDropdownOpen(false);
    setScopeSearchQuery('');
    if (scopeId !== 'ALL' && scopeId !== 'TECH_LEADS' && scopeId !== 'INTERNS') {
      setAnalyticsTab('WORK_ITEMS');
    }

    const filters = {};
    if (selectedProjectId !== 'ALL') filters.project_id = selectedProjectId;
    if (scopeId !== 'ALL' && scopeId !== 'TECH_LEADS' && scopeId !== 'INTERNS') filters.user_id = scopeId;
    void loadAnalytics(filters);
  };

  // Project selection change
  const handleSelectProject = (projId) => {
    setSelectedProjectId(projId);
    setIsProjectDropdownOpen(false);
    setProjectSearchQuery('');

    const filters = {};
    if (projId !== 'ALL') filters.project_id = projId;
    if (selectedScope !== 'ALL' && selectedScope !== 'TECH_LEADS' && selectedScope !== 'INTERNS') filters.user_id = selectedScope;
    void loadAnalytics(filters);
  };

  // Build member performance map
  const memberPerformanceMap = useMemo(() => {
    const map = new Map();

    // Build quick lookup of user extensions from backend analytics and members
    const userExtensionsLookup = new Map();
    if (analytics?.user_extensions) {
      Object.entries(analytics.user_extensions).forEach(([uid, stats]) => {
        userExtensionsLookup.set(uid, stats);
      });
    }
    members.forEach((m) => {
      const uid = m.id || m.userId || m.user_id;
      if (!uid) return;
      if (m.extensions_count !== undefined || m.extension_stats) {
        userExtensionsLookup.set(uid, {
          total: m.extensions_count ?? m.extension_stats?.total ?? 0,
          pending: m.extension_stats?.pending ?? 0,
          approved: m.extension_stats?.approved ?? 0,
          rejected: m.extension_stats?.rejected ?? 0,
        });
      }
    });

    // 1. Seed from organization/cohort members
    members.forEach((m) => {
      const uid = m.id || m.userId || m.user_id;
      if (!uid) return;
      const isIntern = m.role === 'INTERN' || m.type === 'INTERN' || Boolean(m.isIntern) || (Array.isArray(m.roles) && m.roles.some((r) => (typeof r === 'string' ? r === 'INTERN' : r?.name === 'INTERN')));
      // Exclude manager and dedicated non-intern tech lead from inflating the intern cohort performance directory
      if (!isIntern || m.email === 'manager@dailoqa.com' || m.email === 'lead@dailoqa.com' || m.role === 'MANAGER' || m.type === 'MANAGER') return;

      const isLead = m.role === 'TECH_LEAD' || m.type === 'TECH_LEAD' || m.project_role === 'TECH_LEAD' || Boolean(m.is_tech_lead);
      const extStats = userExtensionsLookup.get(uid) || m.extension_stats || { total: m.extensions_count || 0, pending: 0, approved: 0, rejected: 0 };
      map.set(uid, {
        userId: uid,
        name: m.name || m.email || 'Member',
        email: m.email || '',
        role: isLead ? 'TECH_LEAD' : (m.role || m.type || 'INTERN'),
        roleLabel: isLead ? 'Tech Lead' : (m.role || m.type || 'Intern'),
        isIntern: true,
        isTechLead: isLead,
        extensionsCount: extStats.total || 0,
        extensionStats: extStats,
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

    // 2. Incorporate members and tech leads returned in live analytics
    if (Array.isArray(analytics?.members)) {
      analytics.members.forEach((m) => {
        const uid = m.id || m.userId || m.user_id;
        if (!uid) return;
        const isIntern = m.role === 'INTERN' || m.type === 'INTERN' || Boolean(m.isIntern) || (Array.isArray(m.roles) && m.roles.some((r) => (typeof r === 'string' ? r === 'INTERN' : r?.name === 'INTERN')));
        if (!isIntern || m.email === 'manager@dailoqa.com' || m.email === 'lead@dailoqa.com' || m.role === 'MANAGER' || m.type === 'MANAGER') return;

        const isLead = m.role === 'TECH_LEAD' || m.type === 'TECH_LEAD' || m.project_role === 'TECH_LEAD' || Boolean(m.is_tech_lead);
        const extStats = userExtensionsLookup.get(uid) || m.extension_stats || { total: m.extensions_count || 0, pending: 0, approved: 0, rejected: 0 };
        if (!map.has(uid)) {
          map.set(uid, {
            userId: uid,
            name: m.name || m.email || 'Member',
            email: m.email || '',
            role: isLead ? 'TECH_LEAD' : (m.role || m.type || 'INTERN'),
            roleLabel: isLead ? 'Tech Lead' : (m.role || m.type || 'Intern'),
            isIntern: true,
            isTechLead: isLead,
            extensionsCount: extStats.total || 0,
            extensionStats: extStats,
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
        } else if (isLead) {
          const entry = map.get(uid);
          entry.isTechLead = true;
          entry.role = 'TECH_LEAD';
          entry.roleLabel = 'Tech Lead';
        }
      });
    }

    // 3. Ensure target scoped user is present
    if (analytics?.target_user) {
      const tu = analytics.target_user;
      const uid = tu.id || tu.userId || tu.user_id;
      const isIntern = tu.role === 'INTERN' || tu.type === 'INTERN' || Boolean(tu.isIntern) || (Array.isArray(tu.roles) && tu.roles.some((r) => (typeof r === 'string' ? r === 'INTERN' : r?.name === 'INTERN')));
      if (uid && isIntern && tu.email !== 'manager@dailoqa.com' && tu.email !== 'lead@dailoqa.com' && !map.has(uid)) {
        const isLead = tu.role === 'TECH_LEAD' || tu.type === 'TECH_LEAD' || tu.project_role === 'TECH_LEAD' || Boolean(tu.is_tech_lead);
        const tuExtStats = userExtensionsLookup.get(uid) || tu.extension_stats || (analytics.extension_metrics?.total_requests ? {
          total: analytics.extension_metrics.total_requests,
          pending: analytics.extension_metrics.pending_requests || 0,
          approved: analytics.extension_metrics.approved_requests || 0,
          rejected: analytics.extension_metrics.rejected_requests || 0,
        } : { total: 0, pending: 0, approved: 0, rejected: 0 });
        map.set(uid, {
          userId: uid,
          name: tu.name || tu.email || 'Member',
          email: tu.email || '',
          role: isLead ? 'TECH_LEAD' : 'INTERN',
          roleLabel: isLead ? 'Tech Lead' : 'Intern',
          isIntern: true,
          isTechLead: isLead,
          extensionsCount: tuExtStats.total || 0,
          extensionStats: tuExtStats,
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
      }
    }

    const tasks = analytics?.task_breakdown || [];
    tasks.forEach((t) => {
      const isPastDue = Boolean(t.is_past_due);
      const wasCompletedOnTime = Boolean(t.was_completed_on_time);

      const assignees = Array.isArray(t.assignees) && t.assignees.length > 0 ? t.assignees : [];
      assignees.forEach((a) => {
        const uid = a.user_id || a.id;
        if (!uid || a.email === 'manager@dailoqa.com' || a.email === 'lead@dailoqa.com') return;

        let entry = map.get(uid);
        if (!entry) {
          entry = {
            userId: uid,
            name: a.name || a.email || 'Member',
            email: a.email || '',
            role: 'INTERN',
            roleLabel: 'Intern',
            isIntern: true,
            isTechLead: false,
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
        if (t.status === 'COMPLETED') {
          entry.completed += 1;
          if (wasCompletedOnTime) entry.completedOnTime += 1;
        } else if (t.status === 'IN_PROGRESS') {
          entry.inProgress += 1;
        } else if (t.status === 'IN_REVIEW') {
          entry.inReview += 1;
        } else if (t.status === 'BLOCKED') {
          entry.blocked += 1;
        } else if (t.status === 'TODO') {
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
  }, [members, analytics?.members, analytics?.target_user, analytics?.task_breakdown]);

  // Performance rows filtered by selected scope
  const performanceRows = useMemo(() => {
    const list = Array.from(memberPerformanceMap.values()).filter((m) => m.isIntern !== false);
    if (selectedScope === 'ALL') {
      return list.sort((a, b) => {
        if (a.isTechLead && !b.isTechLead) return -1;
        if (!a.isTechLead && b.isTechLead) return 1;
        const nameA = a.name || a.email || '';
        const nameB = b.name || b.email || '';
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      });
    }
    if (selectedScope === 'TECH_LEADS') {
      return list.filter((m) => m.isTechLead).sort((a, b) => {
        const nameA = a.name || a.email || '';
        const nameB = b.name || b.email || '';
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      });
    }
    if (selectedScope === 'INTERNS') {
      return list.filter((m) => !m.isTechLead && m.role !== 'TECH_LEAD').sort((a, b) => {
        const nameA = a.name || a.email || '';
        const nameB = b.name || b.email || '';
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      });
    }
    return list.filter((m) => m.userId === selectedScope);
  }, [memberPerformanceMap, selectedScope]);

  // Filter performance rows by directory role pill filter
  const displayedPerformanceRows = useMemo(() => {
    if (selectedRoleFilter === 'ALL') return performanceRows;
    if (selectedRoleFilter === 'TECH_LEAD') {
      return performanceRows.filter((r) => r.isTechLead || r.role === 'TECH_LEAD');
    }
    if (selectedRoleFilter === 'INTERN') {
      return performanceRows.filter((r) => !r.isTechLead && r.role !== 'TECH_LEAD');
    }
    return performanceRows.filter((r) => r.role === selectedRoleFilter);
  }, [performanceRows, selectedRoleFilter]);

  const techLeadCount = useMemo(() => {
    return performanceRows.filter((r) => r.isTechLead || r.role === 'TECH_LEAD').length;
  }, [performanceRows]);

  const internCount = useMemo(() => {
    return performanceRows.filter((r) => !r.isTechLead && r.role !== 'TECH_LEAD').length;
  }, [performanceRows]);

  // Current scope member object
  const selectedScopeMember = useMemo(() => {
    if (selectedScope === 'ALL' || selectedScope === 'TECH_LEADS' || selectedScope === 'INTERNS') return null;
    return memberPerformanceMap.get(selectedScope) || members.find((m) => (m.id || m.userId || m.user_id) === selectedScope) || analytics?.target_user || null;
  }, [selectedScope, memberPerformanceMap, members, analytics?.target_user]);

  // Whether the report is focused on an individual intern/lead
  const isIndividualScope = selectedScope !== 'ALL' && selectedScope !== 'TECH_LEADS' && selectedScope !== 'INTERNS';

  // Current selected project object
  const selectedProjectObj = useMemo(() => {
    if (selectedProjectId === 'ALL') return null;
    return projects.find((p) => p.id === selectedProjectId);
  }, [selectedProjectId, projects]);

  // Filtered members in scope dropdown search
  const filteredScopeMembers = useMemo(() => {
    const q = scopeSearchQuery.trim().toLowerCase();
    const list = Array.from(memberPerformanceMap.values()).filter((m) => m.isIntern !== false);
    if (!q) return list;
    return list.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.roleLabel && m.roleLabel.toLowerCase().includes(q))
    );
  }, [memberPerformanceMap, scopeSearchQuery]);

  // Filtered projects in project dropdown search
  const filteredProjects = useMemo(() => {
    const q = projectSearchQuery.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name?.toLowerCase().includes(q) || p.key?.toLowerCase().includes(q));
  }, [projects, projectSearchQuery]);

  // Count of work items with extension activity (approved, pending, or requested)
  const extensionTasksCount = useMemo(() => {
    if (!analytics?.task_breakdown) return 0;
    return analytics.task_breakdown.filter(
      (t) =>
        t.has_extension ||
        t.has_pending_extension ||
        (t.extension_requests_count && t.extension_requests_count > 0) ||
        t.extension_status === 'APPROVED' ||
        t.extension_status === 'PENDING'
    ).length;
  }, [analytics?.task_breakdown]);

  // Filtered tasks in breakdown table
  const displayedTasks = useMemo(() => {
    if (!analytics?.task_breakdown) return [];
    let list = analytics.task_breakdown;

    if (selectedScope === 'TECH_LEADS') {
      const leadIds = new Set(Array.from(memberPerformanceMap.values()).filter((m) => m.isTechLead).map((m) => m.userId));
      list = list.filter((t) => t.assignees?.some((a) => leadIds.has(a.user_id || a.id)));
    } else if (selectedScope === 'INTERNS') {
      const internIds = new Set(Array.from(memberPerformanceMap.values()).filter((m) => !m.isTechLead && m.role !== 'TECH_LEAD').map((m) => m.userId));
      list = list.filter((t) => t.assignees?.some((a) => internIds.has(a.user_id || a.id)));
    }

    if (taskFilter === 'COMPLETED') list = list.filter((t) => t.status === 'COMPLETED');
    else if (taskFilter === 'IN_PROGRESS') list = list.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'IN_REVIEW');
    else if (taskFilter === 'BLOCKED') list = list.filter((t) => t.status === 'BLOCKED');
    else if (taskFilter === 'PAST_DUE') list = list.filter((t) => t.is_past_due);
    else if (taskFilter === 'EXTENSIONS') {
      list = list.filter(
        (t) =>
          t.has_extension ||
          t.has_pending_extension ||
          (t.extension_requests_count && t.extension_requests_count > 0) ||
          t.extension_status === 'APPROVED' ||
          t.extension_status === 'PENDING'
      );
    }

    const q = taskSearchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((t) => {
        const matchTitle = t.title?.toLowerCase().includes(q);
        const matchType = t.type?.toLowerCase().includes(q);
        const matchProject = t.project_name?.toLowerCase().includes(q);
        const matchSprint = t.sprint_name?.toLowerCase().includes(q);
        const matchPriority = t.priority?.toLowerCase().includes(q);
        const matchStatus = t.status?.toLowerCase().includes(q);
        const matchExtension =
          (t.has_extension && ('extended'.includes(q) || 'extension'.includes(q))) ||
          (t.extension_status && t.extension_status.toLowerCase().includes(q)) ||
          (t.has_pending_extension && ('pending'.includes(q) || 'extension'.includes(q))) ||
          (Boolean(t.extension_requests_count) && 'extension'.includes(q));
        const matchAssignees = t.assignees?.some(
          (a) => a.name?.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q)
        );
        return matchTitle || matchType || matchProject || matchSprint || matchPriority || matchStatus || matchExtension || matchAssignees;
      });
    }

    return list;
  }, [analytics, selectedScope, memberPerformanceMap, taskFilter, taskSearchQuery]);

  // Project Health metrics computation
  const projectHealthMetrics = useMemo(() => {
    const list = projectHealthData?.projects || [];
    const isSingleProject = selectedProjectId && selectedProjectId !== 'ALL';
    const currentList = isSingleProject
      ? list.filter((p) => p.id === selectedProjectId)
      : list;

    const totalProjects = isSingleProject ? currentList.length : (projectHealthData?.summary?.total ?? currentList.length ?? 0);
    const assessedProjects = isSingleProject
      ? currentList.filter((p) => p.health !== 'NOT_ASSESSED' && p.health !== 'INSUFFICIENT_DATA').length
      : (projectHealthData?.summary?.assessed ?? 0);

    const healthyCount = currentList.filter((p) => p.health === 'HEALTHY').length;
    const needsAttentionCount = currentList.filter((p) => p.health === 'NEEDS_ATTENTION').length;
    const atRiskCount = currentList.filter((p) => p.health === 'AT_RISK').length;
    const criticalCount = currentList.filter((p) => p.health === 'CRITICAL').length;
    const notAssessedCount = currentList.filter((p) => p.health === 'NOT_ASSESSED' || p.health === 'INSUFFICIENT_DATA').length;

    const healthyPct = assessedProjects > 0 ? Math.round((healthyCount / assessedProjects) * 100) : 0;
    const needsAttentionPct = assessedProjects > 0 ? Math.round((needsAttentionCount / assessedProjects) * 100) : 0;
    const atRiskPct = assessedProjects > 0 ? Math.round((atRiskCount / assessedProjects) * 100) : 0;
    const criticalPct = assessedProjects > 0 ? Math.round((criticalCount / assessedProjects) * 100) : 0;

    const attentionProjects = currentList.filter((p) => p.health === 'AT_RISK' || p.health === 'CRITICAL' || p.health === 'NEEDS_ATTENTION');
    const attentionRate = assessedProjects > 0 ? Math.round((attentionProjects.length / assessedProjects) * 100) : 0;

    return {
      totalProjects,
      assessedProjects,
      healthyCount,
      needsAttentionCount,
      atRiskCount,
      criticalCount,
      notAssessedCount,
      healthyPct,
      needsAttentionPct,
      atRiskPct,
      criticalPct,
      attentionProjects,
      attentionRate,
      projectsList: currentList,
    };
  }, [projectHealthData, selectedProjectId]);

  return (
    <div className="space-y-6">
      {/* Header with Title and Uniform Control Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0 max-w-xl">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Intern Performance Reports</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Velocity analytics, work item completion, delivery turnaround, and team performance
          </p>
        </div>

        {/* Uniform Toolbar: Mode Switcher, All Scope, Project Filter, Sync Projects */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* 1. Tasks & Graphs / Team Performance / Both Segmented Switcher */}
          <div className="h-9 inline-flex items-center p-0.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('TASKS')}
              className={`h-full inline-flex items-center gap-1.5 px-3 rounded-lg transition-all cursor-pointer ${
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
              className={`h-full inline-flex items-center gap-1.5 px-3 rounded-lg transition-all cursor-pointer ${
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
              className={`h-full inline-flex items-center gap-1.5 px-2.5 rounded-lg transition-all cursor-pointer hidden sm:inline-flex ${
                viewMode === 'BOTH'
                  ? 'bg-white text-purple-700 font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Both</span>
            </button>
          </div>

          {/* Group: Scope, Project & Sync Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* 2. All Scope Dropdown Filter */}
            <div className="relative shrink-0" ref={scopeDropdownRef}>
              <div
                className={`h-9 inline-flex items-center gap-1.5 px-3 rounded-xl border text-xs font-semibold transition-all shadow-2xs ${
                  selectedScope !== 'ALL'
                    ? 'bg-purple-50 border-purple-300 text-purple-900'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setIsScopeDropdownOpen(!isScopeDropdownOpen)}
                  className="inline-flex items-center gap-1.5 cursor-pointer bg-transparent border-0 p-0 text-inherit font-inherit"
                >
                  <UserCheck className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                  <span className="truncate max-w-[110px]">
                    {selectedScope === 'ALL'
                      ? 'All Scope'
                      : selectedScope === 'TECH_LEADS'
                      ? 'Tech Leads'
                      : selectedScope === 'INTERNS'
                      ? 'Interns'
                      : selectedScopeMember?.name || 'Member'}
                  </span>
                </button>
                {selectedScope !== 'ALL' ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectScope('ALL');
                    }}
                    className="p-0.5 rounded hover:bg-purple-200/80 text-purple-700 ml-0.5 cursor-pointer"
                    title="Reset to All Scope"
                  >
                    <X className="w-3 h-3" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsScopeDropdownOpen(!isScopeDropdownOpen)}
                    className="cursor-pointer bg-transparent border-0 p-0 text-inherit"
                  >
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 ml-0.5 transition-transform ${isScopeDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </div>

            {isScopeDropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-72 rounded-xl bg-white border border-slate-200 shadow-xl p-2 z-30 text-slate-800 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  Select View & Analytics Scope
                </div>

                <div className="py-1 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => handleSelectScope('ALL')}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      selectedScope === 'ALL'
                        ? 'bg-purple-100 text-purple-900 font-bold'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-purple-600" />
                      <div className="text-left">
                        <span className="block leading-none">All Scope (Default)</span>
                        <span className="text-[10px] text-slate-400 font-normal">Full cohort & project analytics</span>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectScope('TECH_LEADS')}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      selectedScope === 'TECH_LEADS'
                        ? 'bg-purple-100 text-purple-900 font-bold'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-purple-600" />
                      <div className="text-left">
                        <span className="block leading-none">Tech Leads Only</span>
                        <span className="text-[10px] text-slate-400 font-normal">Filter by tech lead contributors</span>
                      </div>
                    </div>
                  </button>
                </div>

                <div className="p-1 border-t border-slate-100">
                  <div className="relative">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={scopeSearchQuery}
                      onChange={(e) => setScopeSearchQuery(e.target.value)}
                      placeholder="Filter members..."
                      className="w-full pl-7 pr-7 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-purple-500"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>

                <div className="max-h-52 overflow-y-auto space-y-0.5 pr-0.5">
                  {filteredScopeMembers.map((mem) => (
                    <button
                      key={mem.userId}
                      type="button"
                      onClick={() => handleSelectScope(mem.userId)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        selectedScope === mem.userId
                          ? 'bg-purple-100 text-purple-900 font-bold'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                          {mem.name ? mem.name.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div className="min-w-0 text-left">
                          <span className="block truncate font-semibold leading-tight">{mem.name}</span>
                          <span className="block text-[10px] text-slate-400 truncate">
                            {mem.email || (mem.isTechLead ? 'Tech Lead' : 'Intern')}
                          </span>
                        </div>
                      </div>
                      {selectedScope === mem.userId && (
                        <Check className="w-3.5 h-3.5 text-purple-600 shrink-0 ml-1.5" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 3. Project Selector Filter */}
          <div className="relative shrink-0" ref={projectDropdownRef}>
              <div
                className={`h-9 inline-flex items-center gap-1.5 px-3 rounded-xl border text-xs font-semibold transition-all shadow-2xs ${
                  selectedProjectId !== 'ALL'
                    ? 'bg-purple-50 border-purple-300 text-purple-900'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
                  className="inline-flex items-center gap-1.5 cursor-pointer bg-transparent border-0 p-0 text-inherit font-inherit"
                >
                  <FolderKanban className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                  <span className="truncate max-w-[110px]">
                    {selectedProjectId === 'ALL'
                      ? 'All Projects'
                      : selectedProjectObj?.name || 'Project'}
                  </span>
                </button>
                {selectedProjectId !== 'ALL' ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectProject('ALL');
                    }}
                    className="p-0.5 rounded hover:bg-purple-200/80 text-purple-700 ml-0.5 cursor-pointer"
                    title="Reset to All Projects"
                  >
                    <X className="w-3 h-3" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
                    className="cursor-pointer bg-transparent border-0 p-0 text-inherit"
                  >
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 ml-0.5 transition-transform ${isProjectDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </div>

            {isProjectDropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-72 rounded-xl bg-white border border-slate-200 shadow-xl p-2 z-30 text-slate-800 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  Select Project
                </div>

                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => handleSelectProject('ALL')}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      selectedProjectId === 'ALL'
                        ? 'bg-purple-100 text-purple-900 font-bold'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <FolderKanban className="w-3.5 h-3.5 text-purple-600" />
                      <span>All Projects (Portfolio)</span>
                    </div>
                    {selectedProjectId === 'ALL' && <Check className="w-3.5 h-3.5 text-purple-600 shrink-0" />}
                  </button>
                </div>

                <div className="p-1 border-t border-slate-100">
                  <div className="relative">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={projectSearchQuery}
                      onChange={(e) => setProjectSearchQuery(e.target.value)}
                      placeholder="Search projects..."
                      className="w-full pl-7 pr-3 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-purple-500"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-0.5 pr-0.5">
                  {filteredProjects.map((proj) => (
                    <button
                      key={proj.id}
                      type="button"
                      onClick={() => handleSelectProject(proj.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        selectedProjectId === proj.id
                          ? 'bg-purple-100 text-purple-900 font-bold'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FolderKanban className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                        <span className="truncate">{proj.name}</span>
                      </div>
                      {selectedProjectId === proj.id && <Check className="w-3.5 h-3.5 text-purple-600 shrink-0 ml-1.5" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

            {/* 4. Sync Projects Button */}
            <button
              type="button"
              onClick={handleSyncProjects}
              disabled={isSyncing}
              className={`h-9 inline-flex items-center gap-1.5 px-3 rounded-xl border text-xs font-semibold transition-all shadow-2xs shrink-0 ${
                isSyncing
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  : 'bg-white text-slate-700 hover:text-purple-700 hover:bg-purple-50/50 border-slate-200 hover:border-purple-300 active:scale-[0.98]'
              }`}
              title="Fetch and synchronize projects and team members from the organization scope"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-purple-600' : 'text-slate-500'}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Projects'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sync Status Feedback Banners */}
      {syncSuccessMessage && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium animate-in fade-in slide-in-from-top-1">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{syncSuccessMessage}</span>
        </div>
      )}
      {syncErrorMessage && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium animate-in fade-in slide-in-from-top-1">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{syncErrorMessage}</span>
        </div>
      )}

      {/* Main Content Area */}
      {isLoadingAnalytics ? (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-card animate-pulse">
            <div className="h-6 bg-slate-200 rounded w-1/3 mb-4" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="h-20 bg-slate-100 rounded-xl" />
              <div className="h-20 bg-slate-100 rounded-xl" />
              <div className="h-20 bg-slate-100 rounded-xl" />
              <div className="h-20 bg-slate-100 rounded-xl" />
            </div>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-card animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-1/4 mb-3" />
            <div className="h-32 bg-slate-100 rounded-xl" />
          </div>
        </div>
      ) : analyticsError ? (
        <div className="bg-white rounded-2xl p-10 border border-slate-200/80 shadow-card text-center">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800">Unable to Load Report</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">{analyticsError}</p>
          <button
            type="button"
            onClick={() => { void loadAnalytics({ project_id: selectedProjectId, user_id: selectedScope }); }}
            className="mt-4 px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700"
          >
            Retry Loading
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* TAB A: TASKS & GRAPHS VIEW (Visible in 'TASKS' or 'BOTH' modes) */}
          {(viewMode === 'TASKS' || viewMode === 'BOTH') && (
            <div className="space-y-6">
              {/* Context Summary Strip */}
              <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-card">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border bg-purple-50 text-purple-600 border-purple-100">
                      {selectedScopeMember ? (
                        <User className="w-6 h-6" />
                      ) : selectedProjectObj ? (
                        <FolderKanban className="w-6 h-6" />
                      ) : (
                        <BarChart3 className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-purple-100 text-purple-800">
                          {selectedScopeMember
                            ? 'Individual Scope Report'
                            : selectedProjectObj
                            ? 'Project Scope Report'
                            : 'Cohort Portfolio Report'}
                        </span>
                        <span className="text-xs text-slate-400 font-medium">
                          {selectedProjectObj ? selectedProjectObj.name : 'All Projects'}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 mt-1">
                        {selectedScopeMember
                          ? selectedScopeMember.name
                          : selectedProjectObj
                          ? selectedProjectObj.name
                          : `${selectedCohort?.name || 'Cohort 1'} Analytics & Deliverables`}
                      </h3>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:self-center">
                    <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-medium text-slate-700">
                      <span className="text-slate-400 mr-1.5">Scope:</span>
                      <span className="font-semibold text-slate-900">
                        {selectedScope === 'ALL'
                          ? 'All Members'
                          : selectedScope === 'TECH_LEADS'
                          ? 'Tech Leads'
                          : selectedScopeMember?.name || 'Individual'}
                      </span>
                    </div>

                    {/* Completion Rate Pill - hidden when All Projects is selected */}
                    {selectedProjectId !== 'ALL' && (
                      <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{analytics?.completion_rate || 0}% Completion</span>
                      </div>
                    )}

                    {/* Project Health / Schedule Risk Pill - hidden when All Projects is selected */}
                    {!isIndividualScope && (analytics?.project_health || analytics?.delivery_risk) && (
                      <div
                        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 ${
                          (analytics.project_health === 'CRITICAL' || analytics.delivery_risk === 'CRITICAL' || analytics.delivery_risk === 'HIGH')
                            ? 'bg-rose-50 border-rose-200 text-rose-800'
                            : (analytics.project_health === 'AT_RISK' || analytics.delivery_risk === 'AT_RISK' || analytics.delivery_risk === 'MEDIUM')
                            ? 'bg-amber-50 border-amber-200 text-amber-800'
                            : analytics.project_health === 'NOT_ASSESSED'
                            ? 'bg-slate-100 border-slate-200 text-slate-700'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        }`}
                        title={
                          (analytics.project_health_reasons?.length ? analytics.project_health_reasons.join(' · ') : null) ||
                          (analytics.delivery_risk_reasons?.join(' · ')) ||
                          'Project health classification based on story points, blockers, and sprint/cycle context'
                        }
                      >
                        <Shield className="w-3.5 h-3.5" />
                        <span>Project Health: {formatHealthLabel(analytics.project_health || analytics.delivery_risk)}</span>
                      </div>
                    )}

                    {/* Blocked Deliverables Pill (Separated from Logged Effort) */}
                    {analytics?.blocked > 0 ? (
                      <div className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                        <span>{analytics.blocked} Blocked</span>
                      </div>
                    ) : (
                      <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-medium text-slate-600 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>0 Blocked</span>
                      </div>
                    )}

                    {/* Deadline Extensions Pill */}
                    {(extensionTasksCount > 0 || (analytics?.extension_metrics && (analytics.extension_metrics.total_requests > 0 || analytics.extension_metrics.tasks_affected_count > 0))) && (
                      <button
                        type="button"
                        onClick={() => {
                          setTaskFilter('EXTENSIONS');
                          const el = document.getElementById('work-item-breakdown-section');
                          if (el) el.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100/80 border border-amber-200 text-xs font-semibold text-amber-800 flex items-center gap-1.5 transition-colors cursor-pointer"
                        title={`${analytics?.extension_metrics?.approved_requests ?? (analytics?.task_breakdown?.filter((t) => t.has_extension).length || 0)} approved, ${analytics?.extension_metrics?.pending_requests ?? 0} pending review`}
                      >
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>
                          {analytics?.extension_metrics?.approved_requests ?? (analytics?.task_breakdown?.filter((t) => t.has_extension).length || 0)} Ext. Approved
                          {(analytics?.extension_metrics?.pending_requests || 0) > 0 ? ` (${analytics.extension_metrics.pending_requests} Pending)` : ''}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 5 Distinct KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 pt-5">
                  {/* Card 1: Assigned Work Items */}
                  <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/70">
                    <div className="flex items-center justify-between text-slate-500 mb-2">
                      <span className="text-xs font-medium">Assigned Items</span>
                      <Layers className="w-4 h-4 text-purple-500" />
                    </div>
                    <div className="text-2xl font-bold text-slate-900">{analytics?.total || 0}</div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {analytics?.completed || 0} completed · {(analytics?.in_progress || 0) + (analytics?.in_review || 0)} in progress · {analytics?.todo || 0} todo
                    </div>
                  </div>

                  {/* Card 2: Completed On-Time Rate (Requirement 1) */}
                  <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/70">
                    <div className="flex items-center justify-between text-slate-500 mb-2">
                      <span className="text-xs font-medium">Completed On-Time Rate</span>
                      <TrendingUp className={`w-4 h-4 ${analytics?.completed_on_time_rate !== null && analytics?.completed_on_time_rate !== undefined ? (analytics.completed_on_time_rate >= 80 ? 'text-emerald-500' : 'text-amber-500') : 'text-slate-400'}`} />
                    </div>
                    <div className="text-2xl font-bold text-slate-900">
                      {analytics?.completed_on_time_rate !== null && analytics?.completed_on_time_rate !== undefined
                        ? `${analytics.completed_on_time_rate}%`
                        : 'N/A'}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {analytics?.completed_with_due_date_count > 0 ? (
                        <span>
                          {analytics.completed_on_time_count} of {analytics.completed_with_due_date_count} eligible completed items delivered on time
                        </span>
                      ) : (
                        <span className="text-slate-400">No completed items with due dates</span>
                      )}
                    </div>
                  </div>

                  {/* Card 3: Current Overdue Work (Requirement 2) */}
                  <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/70">
                    <div className="flex items-center justify-between text-slate-500 mb-2">
                      <span className="text-xs font-medium">Overdue Items</span>
                      <Clock className={`w-4 h-4 ${analytics?.past_due > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
                    </div>
                    <div className={`text-2xl font-bold ${analytics?.past_due > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
                      {analytics?.past_due || 0}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {analytics?.past_due > 0 ? (
                        <span className="text-amber-800 font-medium">
                          {analytics.past_due} overdue of {analytics.scheduled_items_count || 0} with deadlines ({analytics.overdue_rate || 0}%)
                        </span>
                      ) : (
                        <span>
                          {analytics?.scheduled_items_count > 0
                            ? `0 overdue of ${analytics.scheduled_items_count} with deadlines (0%)`
                            : '0 overdue · No items with deadlines'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card 4: Story Points Velocity */}
                  <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/70">
                    <div className="flex items-center justify-between text-slate-500 mb-2">
                      <span className="text-xs font-medium">Story Points</span>
                      <CheckSquare className="w-4 h-4 text-blue-500" />
                    </div>
                    {analytics?.story_points_total > 0 ? (
                      <>
                        <div className="text-2xl font-bold text-slate-900">
                          {analytics.story_points_completed}
                          <span className="text-sm font-normal text-slate-400"> / {analytics.story_points_total} pts</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          {analytics.story_points_progress !== null ? `${analytics.story_points_progress}% completed · ${analytics.story_points_remaining || 0} pts remaining` : 'Points estimated'}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-2xl font-bold text-slate-400">
                          Not estimated
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          No story points assigned
                        </div>
                      </>
                    )}
                  </div>

                  {/* Card 5: Logged Effort (Clean separation from blockers) */}
                  <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/70">
                    <div className="flex items-center justify-between text-slate-500 mb-2">
                      <span className="text-xs font-medium">Logged Effort</span>
                      <Clock className="w-4 h-4 text-indigo-500" />
                    </div>
                    <div className="text-2xl font-bold text-slate-900">
                      {analytics?.total_logged_hours || 0}
                      <span className="text-sm font-normal text-slate-400"> hrs</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {analytics?.has_time_entries ? (
                        <span>{analytics.time_entries_count} time {analytics.time_entries_count === 1 ? 'entry' : 'entries'} logged</span>
                      ) : (
                        <span className="text-slate-400">No time entries recorded</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Analytics Section: Work Item Performance & Project Health */}
              <div className="space-y-4">
                {/* Two-Tab Selector: Hidden when viewing an individual intern */}
                {!isIndividualScope && (
                  <div className="w-full grid grid-cols-2 p-1 rounded-xl bg-slate-100 border border-slate-200/80 text-xs font-semibold shadow-2xs">
                    <button
                      type="button"
                      onClick={() => handleTabSwitch('WORK_ITEMS')}
                      className={`w-full py-2.5 flex items-center justify-center gap-2 rounded-lg transition-all cursor-pointer ${
                        analyticsTab === 'WORK_ITEMS'
                          ? 'bg-white text-purple-700 font-bold shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <BarChart3 className="w-4 h-4 text-purple-600 shrink-0" />
                      <span>Work Item Performance</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTabSwitch('PROJECT_HEALTH')}
                      className={`w-full py-2.5 flex items-center justify-center gap-2 rounded-lg transition-all cursor-pointer ${
                        analyticsTab === 'PROJECT_HEALTH'
                          ? 'bg-white text-purple-700 font-bold shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Activity className="w-4 h-4 text-purple-600 shrink-0" />
                      <span>Project Health</span>
                    </button>
                  </div>
                )}

                {/* TAB 1: Work Item Performance Content */}
                {(isIndividualScope || analyticsTab === 'WORK_ITEMS') && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-150">
                    {/* Status Distribution Doughnut Chart */}
                    <div className="lg:col-span-2 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-card flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">Work Item Status Distribution</h4>
                          <p className="text-xs text-slate-500 mt-0.5">Workflow stages across assigned deliverables</p>
                        </div>
                        <span className="text-xs font-semibold text-slate-600">
                          {analytics?.total || 0} total items
                        </span>
                      </div>

                      {(() => {
                        const donutSize = 160;
                        const strokeWidth = 22;
                        const radius = (donutSize - strokeWidth) / 2;
                        const circumference = 2 * Math.PI * radius;
                        const totalItems = analytics?.total || 0;

                        const statuses = [
                          { key: 'TODO', label: 'To Do', count: analytics?.todo || 0, color: '#94A3B8' },
                          { key: 'IN_PROGRESS', label: 'In Progress', count: analytics?.in_progress || 0, color: '#8B5CF6' },
                          { key: 'IN_REVIEW', label: 'In Review', count: analytics?.in_review || 0, color: '#3B82F6' },
                          { key: 'COMPLETED', label: 'Completed', count: analytics?.completed || 0, color: '#10B981' },
                          { key: 'BLOCKED', label: 'Blocked', count: analytics?.blocked || 0, color: '#F43F5E' },
                        ];

                        let accumulatedAngle = 0;
                        const segments = totalItems > 0 ? statuses.map((st) => {
                          const percentage = (st.count / totalItems) * 100;
                          const dash = (percentage / 100) * circumference;
                          const offset = -((accumulatedAngle / 100) * circumference);
                          accumulatedAngle += percentage;
                          return {
                            ...st,
                            percentage: Math.round(percentage),
                            strokeDasharray: `${dash} ${circumference}`,
                            strokeDashoffset: offset,
                          };
                        }).filter(seg => seg.count > 0) : [];

                        return (
                          <div className="my-auto py-3 flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10">
                            {/* Circular Donut Ring */}
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
                                {segments.map((seg) => (
                                  <circle
                                    key={seg.key}
                                    cx={donutSize / 2}
                                    cy={donutSize / 2}
                                    r={radius}
                                    stroke={seg.color}
                                    strokeWidth={strokeWidth}
                                    strokeDasharray={seg.strokeDasharray}
                                    strokeDashoffset={seg.strokeDashoffset}
                                    strokeLinecap="round"
                                    fill="transparent"
                                    className="transition-all duration-500 hover:opacity-85"
                                  />
                                ))}
                              </svg>

                              {/* Center metric displaying total items and ITEMS label */}
                              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                                <span className="text-2xl font-extrabold text-slate-900 leading-none">
                                  {totalItems}
                                </span>
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                                  ITEMS
                                </span>
                              </div>
                            </div>

                            {/* Status Legend beside chart */}
                            <div className="space-y-2.5 w-full max-w-[200px]">
                              {statuses.map((st) => {
                                const pct = totalItems > 0 ? Math.round((st.count / totalItems) * 100) : 0;
                                return (
                                  <div key={st.key} className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span
                                        className="w-2.5 h-2.5 rounded-full shrink-0"
                                        style={{ backgroundColor: st.color }}
                                      />
                                      <span className="text-slate-600 truncate">{st.label}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0 font-medium">
                                      <span className="text-slate-800 font-bold">{st.count}</span>
                                      <span className="text-slate-400 text-[10px]">({pct}%)</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Priority Breakdown */}
                    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-card flex flex-col justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 mb-1">Priority Volume</h4>
                        <p className="text-xs text-slate-500 mb-4">Urgency levels of active work</p>

                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                              <span className="font-medium text-slate-700">Urgent</span>
                            </div>
                            <span className="font-bold text-slate-900">{analytics?.priority_counts?.URGENT || 0}</span>
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                              <span className="font-medium text-slate-700">High</span>
                            </div>
                            <span className="font-bold text-slate-900">{analytics?.priority_counts?.HIGH || 0}</span>
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                              <span className="font-medium text-slate-700">Medium</span>
                            </div>
                            <span className="font-bold text-slate-900">{analytics?.priority_counts?.MEDIUM || 0}</span>
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                              <span className="font-medium text-slate-700">Low</span>
                            </div>
                            <span className="font-bold text-slate-900">{analytics?.priority_counts?.LOW || 0}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                        <div className="text-xs">
                          <div className="font-semibold text-slate-800">Past Due Work</div>
                          <div className="text-[11px] text-slate-500">
                            {analytics?.scheduled_items_count > 0
                              ? `${analytics.scheduled_items_count} with deadline`
                              : 'Unresolved past deadline'}
                          </div>
                        </div>
                        <div className={`text-right ${analytics?.past_due > 0 ? 'text-amber-700' : 'text-emerald-600'}`}>
                          <div className="text-base font-bold">
                            {analytics?.past_due > 0
                              ? `${analytics.past_due} of ${analytics.total || 0} items`
                              : '0 overdue'}
                          </div>
                          {analytics?.past_due > 0 && (
                            <div className="text-[10px] text-slate-400 font-medium">
                              {analytics.overdue_rate}% of scheduled
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: Project Health Content - only when not viewing individual member */}
                {!isIndividualScope && analyticsTab === 'PROJECT_HEALTH' && (
                  isLoadingHealth ? (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
                      <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-card h-72 flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="h-5 bg-slate-200 rounded w-1/3" />
                          <div className="h-3 bg-slate-100 rounded w-1/2" />
                        </div>
                        <div className="h-4 bg-slate-100 rounded w-full" />
                        <div className="grid grid-cols-4 gap-2">
                          <div className="h-16 bg-slate-100 rounded-xl" />
                          <div className="h-16 bg-slate-100 rounded-xl" />
                          <div className="h-16 bg-slate-100 rounded-xl" />
                          <div className="h-16 bg-slate-100 rounded-xl" />
                        </div>
                      </div>
                      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-card h-72 flex flex-col justify-between">
                        <div className="h-5 bg-slate-200 rounded w-1/2" />
                        <div className="space-y-2">
                          <div className="h-12 bg-slate-100 rounded-xl" />
                          <div className="h-12 bg-slate-100 rounded-xl" />
                        </div>
                        <div className="h-4 bg-slate-100 rounded w-1/3" />
                      </div>
                    </div>
                  ) : healthError ? (
                    <div className="bg-white rounded-2xl p-8 border border-slate-200/80 shadow-card text-center">
                      <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
                      <h4 className="text-sm font-bold text-slate-800">Unable to Load Project Health</h4>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">{healthError}</p>
                      <button
                        type="button"
                        onClick={() => fetchProjectHealth(true)}
                        className="mt-3 px-3.5 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700"
                      >
                        Retry
                      </button>
                    </div>
                  ) : projectHealthMetrics.totalProjects === 0 ? (
                    <div className="bg-white rounded-2xl p-10 border border-slate-200/80 shadow-card text-center">
                      <FolderKanban className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <h4 className="text-sm font-bold text-slate-800">No Projects Found</h4>
                      <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                        No projects are currently accessible within the selected organization or cohort scope.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-150">
                      {/* Project Health Overview Card */}
                      <div className="lg:col-span-2 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-card flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <Activity className="w-4 h-4 text-purple-600" />
                                <h4 className="text-sm font-bold text-slate-900">Portfolio Health Distribution</h4>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Delivery health, active blockers, and story-point schedule status across assessed projects
                              </p>
                            </div>
                            <span className="text-xs font-semibold text-slate-600">
                              {projectHealthMetrics.assessedProjects} of {projectHealthMetrics.totalProjects} assessed
                            </span>
                          </div>

                          {/* Primary Assessed Metric + Exclusion note */}
                          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 mb-3.5">
                            <div className="flex items-baseline gap-2">
                              <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
                                {projectHealthMetrics.assessedProjects}
                              </span>
                              <span className="text-xs font-bold text-slate-700">
                                {projectHealthMetrics.assessedProjects === 1 ? 'Project Assessed' : 'Projects Assessed'}
                              </span>
                              {projectHealthMetrics.totalProjects > projectHealthMetrics.assessedProjects && (
                                <span className="text-[11px] text-slate-400 font-medium">
                                  ({projectHealthMetrics.totalProjects} total in portfolio)
                                </span>
                              )}
                            </div>

                            {projectHealthMetrics.notAssessedCount > 0 ? (
                              <div className="text-[11px] text-slate-500 flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                                <span>
                                  {projectHealthMetrics.notAssessedCount} unassessed {projectHealthMetrics.notAssessedCount === 1 ? 'project' : 'projects'} excluded from ratio
                                </span>
                              </div>
                            ) : projectHealthMetrics.assessedProjects > 0 ? (
                              <div className="text-[11px] text-emerald-700 flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>All portfolio projects assessed</span>
                              </div>
                            ) : null}
                          </div>

                          {/* Segmented Horizontal Distribution Bar */}
                          <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex mb-4 shadow-2xs">
                            {projectHealthMetrics.assessedProjects > 0 ? (
                              <>
                                {projectHealthMetrics.healthyPct > 0 && (
                                  <div
                                    style={{ width: `${projectHealthMetrics.healthyPct}%` }}
                                    className="bg-emerald-500 h-full transition-all duration-300"
                                    title={`Healthy: ${projectHealthMetrics.healthyCount} (${projectHealthMetrics.healthyPct}%)`}
                                  />
                                )}
                                {projectHealthMetrics.needsAttentionPct > 0 && (
                                  <div
                                    style={{ width: `${projectHealthMetrics.needsAttentionPct}%` }}
                                    className="bg-amber-500 h-full transition-all duration-300"
                                    title={`Needs Attention: ${projectHealthMetrics.needsAttentionCount} (${projectHealthMetrics.needsAttentionPct}%)`}
                                  />
                                )}
                                {projectHealthMetrics.atRiskPct > 0 && (
                                  <div
                                    style={{ width: `${projectHealthMetrics.atRiskPct}%` }}
                                    className="bg-orange-500 h-full transition-all duration-300"
                                    title={`At Risk: ${projectHealthMetrics.atRiskCount} (${projectHealthMetrics.atRiskPct}%)`}
                                  />
                                )}
                                {projectHealthMetrics.criticalPct > 0 && (
                                  <div
                                    style={{ width: `${projectHealthMetrics.criticalPct}%` }}
                                    className="bg-rose-500 h-full transition-all duration-300"
                                    title={`Critical: ${projectHealthMetrics.criticalCount} (${projectHealthMetrics.criticalPct}%)`}
                                  />
                                )}
                              </>
                            ) : (
                              <div className="w-full bg-slate-200 h-full" title="No assessed projects" />
                            )}
                          </div>
                        </div>

                        {/* Status Breakdown Pills (Healthy, Needs Attention, At Risk, Critical, Not Assessed) */}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs pt-2">
                          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-900">
                            <div className="text-[11px] font-medium text-emerald-700 flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              <span>Healthy</span>
                            </div>
                            <div className="text-base font-bold mt-0.5">{projectHealthMetrics.healthyCount}</div>
                            <div className="text-[10px] text-emerald-600 font-semibold">{projectHealthMetrics.healthyPct}% of assessed</div>
                          </div>

                          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-100 text-amber-900">
                            <div className="text-[11px] font-medium text-amber-700 flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-amber-500" />
                              <span>Needs Attention</span>
                            </div>
                            <div className="text-base font-bold mt-0.5">{projectHealthMetrics.needsAttentionCount}</div>
                            <div className="text-[10px] text-amber-600 font-semibold">{projectHealthMetrics.needsAttentionPct}% of assessed</div>
                          </div>

                          <div className="p-2.5 rounded-xl bg-orange-50 border border-orange-100 text-orange-900">
                            <div className="text-[11px] font-medium text-orange-700 flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-orange-500" />
                              <span>At Risk</span>
                            </div>
                            <div className="text-base font-bold mt-0.5">{projectHealthMetrics.atRiskCount}</div>
                            <div className="text-[10px] text-orange-600 font-semibold">{projectHealthMetrics.atRiskPct}% of assessed</div>
                          </div>

                          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-900">
                            <div className="text-[11px] font-medium text-rose-700 flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-rose-500" />
                              <span>Critical</span>
                            </div>
                            <div className="text-base font-bold mt-0.5">{projectHealthMetrics.criticalCount}</div>
                            <div className="text-[10px] text-rose-600 font-semibold">{projectHealthMetrics.criticalPct}% of assessed</div>
                          </div>

                          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800">
                            <div className="text-[11px] font-medium text-slate-600 flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-slate-400" />
                              <span>Not Assessed</span>
                            </div>
                            <div className="text-base font-bold mt-0.5">{projectHealthMetrics.notAssessedCount}</div>
                            <div className="text-[10px] text-slate-500 font-medium">Excluded from ratio</div>
                          </div>
                        </div>
                      </div>

                      {/* Projects Requiring Attention Card */}
                      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-card flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="text-sm font-bold text-slate-900">Projects Requiring Attention</h4>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                projectHealthMetrics.attentionProjects.length > 0
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {projectHealthMetrics.attentionProjects.length} {projectHealthMetrics.attentionProjects.length === 1 ? 'Project' : 'Projects'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mb-3">Portfolio deliverables at risk, critical, or needing attention</p>

                          {projectHealthMetrics.attentionProjects.length === 0 ? (
                            <div className="p-6 text-center bg-emerald-50/40 rounded-xl border border-emerald-100 my-auto">
                              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                              <div className="text-xs font-bold text-slate-800">All Assessed Projects Healthy</div>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Zero active delivery blockers or overdue risks detected across assessed portfolio projects.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                              {projectHealthMetrics.attentionProjects.map((proj) => (
                                <div
                                  key={proj.id}
                                  className="p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-slate-50 transition-colors"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold text-xs text-slate-900 truncate">{proj.name}</span>
                                    <span
                                      className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border uppercase shrink-0 ${
                                        proj.health === 'CRITICAL'
                                          ? 'bg-rose-100 text-rose-800 border-rose-200'
                                          : proj.health === 'NEEDS_ATTENTION'
                                          ? 'bg-amber-100 text-amber-800 border-amber-200'
                                          : 'bg-orange-100 text-orange-800 border-orange-200'
                                      }`}
                                    >
                                      {proj.health === 'CRITICAL' ? 'Critical' : proj.health === 'NEEDS_ATTENTION' ? 'Needs Attention' : 'At Risk'}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-600 font-medium mt-1 line-clamp-2">
                                    {proj.reasons?.[0] || 'Schedule risk detected'}
                                  </div>
                                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1.5 pt-1 border-t border-slate-200/60 flex-wrap gap-1">
                                    <span>
                                      {proj.completed_sp || 0}/{proj.total_sp || 0} SP ({proj.delivery_progress_percentage ?? proj.progress_percentage ?? 0}%)
                                    </span>
                                    {proj.remaining_sp !== undefined && (
                                      <span>{proj.remaining_sp} SP remaining</span>
                                    )}
                                    {proj.overdue_sp > 0 && (
                                      <span className="text-rose-600 font-semibold">{proj.overdue_sp} SP overdue</span>
                                    )}
                                    {proj.blocked_sp > 0 && (
                                      <span className="text-amber-600 font-semibold">{proj.blocked_sp} SP blocked</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                          <span className="text-slate-500 font-medium">Attention Rate</span>
                          <span
                            className={`font-bold ${
                              projectHealthMetrics.attentionRate > 0 ? 'text-amber-600' : 'text-emerald-600'
                            }`}
                          >
                            {projectHealthMetrics.attentionRate}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>

              {/* Work Items Table */}
              <div id="work-item-breakdown-section" className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Detailed Work Item Breakdown</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Itemized deliverables, sprint allocations, story points, recorded hours, and deadline extensions
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Work Item Search Bar */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={taskSearchQuery}
                        onChange={(e) => setTaskSearchQuery(e.target.value)}
                        placeholder="Search work items..."
                        className="w-44 sm:w-56 pl-8 pr-7 py-1.5 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-400 transition-all shadow-2xs"
                      />
                      {taskSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setTaskSearchQuery('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                          title="Clear search"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100/80 text-xs">
                      <button
                        type="button"
                        onClick={() => setTaskFilter('ALL')}
                        className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                          taskFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        All ({analytics?.task_breakdown?.length || 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setTaskFilter('COMPLETED')}
                        className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                          taskFilter === 'COMPLETED' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Completed ({analytics?.completed || 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setTaskFilter('IN_PROGRESS')}
                        className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                          taskFilter === 'IN_PROGRESS' ? 'bg-white text-blue-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        In Progress ({(analytics?.in_progress || 0) + (analytics?.in_review || 0)})
                      </button>
                      {(extensionTasksCount > 0 || (analytics?.extension_metrics?.total_requests && analytics.extension_metrics.total_requests > 0)) && (
                        <button
                          type="button"
                          onClick={() => setTaskFilter('EXTENSIONS')}
                          className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                            taskFilter === 'EXTENSIONS' ? 'bg-white text-amber-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <Clock className="w-3 h-3 text-amber-600" />
                          <span>
                            Extensions ({extensionTasksCount || analytics?.extension_metrics?.total_requests || 0})
                          </span>
                        </button>
                      )}
                      {analytics?.blocked > 0 && (
                        <button
                          type="button"
                          onClick={() => setTaskFilter('BLOCKED')}
                          className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                            taskFilter === 'BLOCKED' ? 'bg-white text-rose-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Blocked ({analytics.blocked})
                        </button>
                      )}
                      {analytics?.past_due > 0 && (
                        <button
                          type="button"
                          onClick={() => setTaskFilter('PAST_DUE')}
                          className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                            taskFilter === 'PAST_DUE' ? 'bg-white text-rose-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Past Due ({analytics.past_due})
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {displayedTasks.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    {taskSearchQuery ? (
                      <div className="space-y-2">
                        <p>No work items found matching "{taskSearchQuery}".</p>
                        <button
                          type="button"
                          onClick={() => setTaskSearchQuery('')}
                          className="text-purple-600 hover:text-purple-700 font-semibold underline cursor-pointer"
                        >
                          Clear search
                        </button>
                      </div>
                    ) : (
                      'No work items found matching the selected filter.'
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-semibold text-[11px]">
                          <th className="py-2.5 px-4">Title & Type</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Priority</th>
                          <th className="py-2.5 px-3">Points</th>
                          <th className="py-2.5 px-3">Due Date</th>
                          <th className="py-2.5 px-3">Extension</th>
                          <th className="py-2.5 px-3">Logged</th>
                          <th className="py-2.5 px-4 text-right">Delivery</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {displayedTasks.map((task) => (
                          <tr key={task.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-3 px-4 max-w-xs sm:max-w-md">
                              <div className="font-semibold text-slate-900 truncate">{task.title}</div>
                              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                                <span className="font-medium text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-100 text-[10px]">
                                  {task.type}
                                </span>
                                {task.project_name && <span>{task.project_name}</span>}
                                {task.sprint_name && <span>• {task.sprint_name}</span>}
                              </div>
                            </td>

                            <td className="py-3 px-3">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  task.status === 'COMPLETED'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : task.status === 'IN_PROGRESS'
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                    : task.status === 'IN_REVIEW'
                                    ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                    : task.status === 'BLOCKED'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                                }`}
                              >
                                {task.status.replace('_', ' ')}
                              </span>
                            </td>

                            <td className="py-3 px-3">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  task.priority === 'URGENT'
                                    ? 'bg-rose-100 text-rose-800'
                                    : task.priority === 'HIGH'
                                    ? 'bg-amber-100 text-amber-800'
                                    : task.priority === 'MEDIUM'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {task.priority}
                              </span>
                            </td>

                            <td className="py-3 px-3 font-medium text-slate-700">
                              {task.story_points ? `${task.story_points} pts` : '—'}
                            </td>

                            <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                              <div className="flex flex-col">
                                <span className={task.has_extension ? 'text-amber-900 font-medium' : ''}>
                                  {task.due_date ? new Date(task.due_date).toLocaleDateString() : '—'}
                                </span>
                                {task.has_extension && task.original_due_date && new Date(task.original_due_date).toLocaleDateString() !== (task.due_date ? new Date(task.due_date).toLocaleDateString() : '') && (
                                  <span className="text-[10px] text-slate-400 line-through" title="Original due date before approved extension">
                                    orig. {new Date(task.original_due_date).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="py-3 px-3 whitespace-nowrap">
                              {task.has_pending_extension || task.extension_status === 'PENDING' ? (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 animate-pulse"
                                  title="A deadline extension request is pending manager review"
                                >
                                  <Clock className="w-3 h-3 text-purple-600 shrink-0" />
                                  <span>Pending Request</span>
                                </span>
                              ) : task.has_extension || task.extension_status === 'APPROVED' ? (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200"
                                  title={`Approved Extension: +${task.additional_days_granted || 0} days${task.original_due_date ? ` (Original: ${new Date(task.original_due_date).toLocaleDateString()} → Extended: ${task.due_date ? new Date(task.due_date).toLocaleDateString() : 'N/A'})` : ''}`}
                                >
                                  <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                                  <span>Extended{task.additional_days_granted > 0 ? ` (+${task.additional_days_granted}d)` : ''}</span>
                                </span>
                              ) : task.extension_status === 'REJECTED' ? (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200"
                                  title="Extension request was rejected"
                                >
                                  <X className="w-3 h-3 text-rose-600 shrink-0" />
                                  <span>Rejected</span>
                                </span>
                              ) : (
                                <span className="text-slate-400 font-mono text-[11px]">—</span>
                              )}
                            </td>

                            <td className="py-3 px-3 font-medium text-slate-700 whitespace-nowrap">
                              {task.logged_hours > 0 ? `${task.logged_hours} hrs` : '—'}
                            </td>

                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              {task.status === 'COMPLETED' ? (
                                task.was_completed_on_time ? (
                                  task.has_extension ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-medium" title="Delivered on time according to approved deadline extension">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" /> Extended On-Time
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                                      <CheckCircle2 className="w-3.5 h-3.5" /> On Time
                                    </span>
                                  )
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                                    <Clock className="w-3.5 h-3.5" /> Late
                                  </span>
                                )
                              ) : task.has_pending_extension ? (
                                <span className="inline-flex items-center gap-1 text-[11px] text-purple-600 font-medium" title="Extension pending review">
                                  <Clock className="w-3.5 h-3.5 text-purple-600" /> Ext. Pending
                                </span>
                              ) : task.is_past_due ? (
                                <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 font-medium">
                                  <AlertTriangle className="w-3.5 h-3.5" /> Past Due
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-400">On Track</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB B: TEAM PERFORMANCE DIRECTORY (Visible in 'PERFORMANCE' or 'BOTH' modes) */}
          {(viewMode === 'PERFORMANCE' || viewMode === 'BOTH') && (
            <div className="space-y-4">
              {/* Performance Summary Metrics Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Members Tracked</div>
                  <div className="text-xl font-bold text-slate-900 mt-1">{performanceRows.length}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {performanceRows.filter((r) => r.isTechLead).length} tech leads
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Completion Rate</div>
                  <div className="text-xl font-bold text-purple-700 mt-1">
                    {performanceRows.length > 0
                      ? Math.round(performanceRows.reduce((acc, r) => acc + r.completionRate, 0) / performanceRows.length)
                      : 0}%
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Average across team</div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Delivered</div>
                  <div className="text-xl font-bold text-emerald-600 mt-1">
                    {performanceRows.reduce((acc, r) => acc + r.completed, 0)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Completed deliverables</div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Past Due Items</div>
                  <div className="text-xl font-bold text-rose-600 mt-1">
                    {performanceRows.reduce((acc, r) => acc + r.pastDue, 0)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Requires follow-up</div>
                </div>
              </div>

              {/* Members Performance Directory Table */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-purple-600" />
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      {selectedScope === 'TECH_LEADS'
                        ? 'Tech Leads Performance & Delivery'
                        : selectedScope !== 'ALL'
                        ? `${selectedScopeMember?.name || 'Member'} — Individual Performance Record`
                        : 'Team Members & Tech Leads Performance Directory'}
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                      {performanceRows.length} Tracked
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Click any member row to focus the scope
                  </div>
                </div>

                {performanceRows.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">
                    <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-700">No members matching current scope</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Adjust the scope filter above to view members</p>
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
                          const isSelected = selectedScope === mem.userId;

                          return (
                            <tr
                              key={mem.userId}
                              role="button"
                              tabIndex={0}
                              onClick={() => handleSelectScope(isSelected ? 'ALL' : mem.userId)}
                              onKeyDown={(e) => {
                                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                                  e.preventDefault();
                                  handleSelectScope(isSelected ? 'ALL' : mem.userId);
                                }
                              }}
                              className={`hover:bg-purple-50/40 transition-colors cursor-pointer ${
                                isSelected ? 'bg-purple-50/70 font-semibold' : ''
                              }`}
                              title="Click to focus report on this member"
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
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border inline-block whitespace-nowrap ${
                                    mem.isTechLead
                                      ? 'bg-purple-100 text-purple-800 border-purple-200'
                                      : 'bg-slate-100 text-slate-600 border-slate-200'
                                  }`}
                                >
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
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>

                              <td className="py-3 px-4 text-right">
                                <span className="font-bold text-purple-700">{mem.completionRate}%</span>
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

          {/* Module V2 Scope & Live Analytics Disclosure */}
          <div className="bg-purple-50/50 border border-purple-100 rounded-2xl p-4 flex items-start gap-3 text-xs text-purple-900">
            <Info className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5 leading-relaxed">
              <span className="font-semibold">Live Analytics Mode Active: </span>
              <span className="text-purple-800/90">
                Work item completion, velocity, story points, and timesheet logged hours are synchronized live from the task tracking engine. Formal cohort rubric evaluations, 360-degree feedback reviews, and exportable PDF report packages are scheduled for the V2 module.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
