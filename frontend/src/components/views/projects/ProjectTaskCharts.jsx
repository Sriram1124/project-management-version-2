import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  BarChart3, 
  PieChart, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  TrendingUp, 
  Layers, 
  Users, 
  Loader2, 
  RefreshCw,
  Flame,
  ArrowUpRight,
  ChevronDown,
  ShieldCheck,
  Award,
  CalendarCheck,
  AlertTriangle,
  UserCheck,
  Search,
  X
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
  URGENT: { label: 'Urgent', color: '#E11D48', barClass: 'bg-rose-500' },
  HIGH: { label: 'High', color: '#F97316', barClass: 'bg-orange-500' },
  MEDIUM: { label: 'Medium', color: '#EAB308', barClass: 'bg-amber-500' },
  LOW: { label: 'Low', color: '#10B981', barClass: 'bg-emerald-500' },
};

const TYPE_CONFIG = {
  EPIC: { label: 'Epics', color: '#7C3AED' },
  STORY: { label: 'Stories', color: '#059669' },
  TASK: { label: 'Tasks', color: '#2563EB' },
  SUBTASK: { label: 'Subtasks', color: '#64748B' },
  BUG: { label: 'Bugs', color: '#DC2626' },
};

export default function ProjectTaskCharts({ projectId, members = [], readOnly = false }) {
  const { user: authUser } = useAuth();
  const isInternUser = readOnly || authUser?.role === 'INTERN';
  const currentUserId = authUser?.id || authUser?.user_id;

  const [workItems, setWorkItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState(isInternUser ? 'PERFORMANCE' : 'TASKS'); // 'TASKS' | 'PERFORMANCE' | 'BOTH'
  const [selectedPerformanceFilter, setSelectedPerformanceFilter] = useState(
    isInternUser && currentUserId ? currentUserId : 'ALL'
  ); // 'ALL' | 'TECH_LEADS' | userId
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const dropdownRef = useRef(null);

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

  const fetchWorkItems = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const items = await workItemsService.listWorkItems({ project_id: projectId });
      setWorkItems(items || []);
    } catch (err) {
      console.error('Failed to fetch tasks for analytics graphs:', err);
      setError(err.message || 'Failed to load task analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkItems();
  }, [projectId]);

  useEffect(() => {
    if (isInternUser && currentUserId) {
      setSelectedPerformanceFilter(currentUserId);
      setViewMode('PERFORMANCE');
    }
  }, [isInternUser, currentUserId]);

  // Tech leads set
  const techLeadUserIds = useMemo(() => {
    const set = new Set();
    members.forEach((m) => {
      if (m.project_role === 'TECH_LEAD' || m.role === 'TECH_LEAD') {
        set.add(m.user_id || m.id);
      }
    });
    return set;
  }, [members]);

  // Detailed per-user performance calculation across all project work items
  const memberPerformanceMap = useMemo(() => {
    const map = new Map();

    // Initialize with all registered project members
    members.forEach((m) => {
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

    // Populate from work items
    workItems.forEach((w) => {
      const isPastDue = Boolean(
        w.due_date && 
        new Date(w.due_date) < now && 
        w.status !== 'COMPLETED'
      );

      const wasCompletedOnTime = Boolean(
        w.status === 'COMPLETED' &&
        (!w.due_date || new Date(w.updated_at || w.due_date) <= new Date(w.due_date))
      );

      const assignees = Array.isArray(w.assignees) && w.assignees.length > 0 
        ? w.assignees 
        : [];

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

        if (isPastDue) {
          entry.pastDue += 1;
        }
      });
    });

    // Compute derived rates
    map.forEach((entry) => {
      entry.completionRate = entry.totalAssigned > 0 
        ? Math.round((entry.completed / entry.totalAssigned) * 100) 
        : 0;
      entry.onTimeRate = entry.completed > 0 
        ? Math.round((entry.completedOnTime / entry.completed) * 100) 
        : (entry.totalAssigned > 0 && entry.pastDue === 0 ? 100 : 0);
    });

    return map;
  }, [members, workItems, techLeadUserIds]);

  // Filtered members performance array
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

  // Aggregate stats based on active filter selection
  const filteredWorkItems = useMemo(() => {
    if (selectedPerformanceFilter === 'ALL') return workItems;
    if (selectedPerformanceFilter === 'TECH_LEADS') {
      return workItems.filter((w) => 
        w.assignees?.some((a) => techLeadUserIds.has(a.user_id || a.id))
      );
    }
    return workItems.filter((w) => 
      w.assignees?.some((a) => (a.user_id || a.id) === selectedPerformanceFilter)
    );
  }, [workItems, selectedPerformanceFilter, techLeadUserIds]);

  // Aggregate stats from database items
  const analytics = useMemo(() => {
    const total = filteredWorkItems.length;
    const completed = filteredWorkItems.filter(w => w.status === 'COMPLETED').length;
    const inProgress = filteredWorkItems.filter(w => w.status === 'IN_PROGRESS').length;
    const inReview = filteredWorkItems.filter(w => w.status === 'IN_REVIEW').length;
    const blocked = filteredWorkItems.filter(w => w.status === 'BLOCKED').length;
    const todo = filteredWorkItems.filter(w => w.status === 'TODO').length;
    
    const pastDue = filteredWorkItems.filter(w => {
      if (w.status === 'COMPLETED') return false;
      if (!w.due_date) return false;
      return new Date(w.due_date) < new Date();
    }).length;

    const completedOnTime = filteredWorkItems.filter(w => {
      if (w.status !== 'COMPLETED') return false;
      if (!w.due_date) return true;
      return new Date(w.updated_at || w.due_date) <= new Date(w.due_date);
    }).length;

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const onTimeRate = completed > 0 
      ? Math.round((completedOnTime / completed) * 100) 
      : (total > 0 && pastDue === 0 ? 100 : 0);

    // Status breakdown
    const statusCounts = {
      COMPLETED: completed,
      IN_PROGRESS: inProgress,
      IN_REVIEW: inReview,
      TODO: todo,
      BLOCKED: blocked,
    };

    // Priority breakdown
    const priorityCounts = {
      URGENT: filteredWorkItems.filter(w => w.priority === 'URGENT').length,
      HIGH: filteredWorkItems.filter(w => w.priority === 'HIGH').length,
      MEDIUM: filteredWorkItems.filter(w => w.priority === 'MEDIUM').length,
      LOW: filteredWorkItems.filter(w => w.priority === 'LOW').length,
    };

    // Type breakdown
    const typeCounts = {
      EPIC: filteredWorkItems.filter(w => w.type === 'EPIC').length,
      STORY: filteredWorkItems.filter(w => w.type === 'STORY').length,
      TASK: filteredWorkItems.filter(w => w.type === 'TASK').length,
      SUBTASK: filteredWorkItems.filter(w => w.type === 'SUBTASK').length,
      BUG: filteredWorkItems.filter(w => w.type === 'BUG').length,
    };

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
      statusCounts,
      priorityCounts,
      typeCounts,
    };
  }, [filteredWorkItems]);

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

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-10 border border-slate-200/80 shadow-card flex flex-col items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-3" />
        <p className="text-xs font-semibold text-slate-700">Loading live tasks database graphs...</p>
        <p className="text-[11px] text-slate-400 mt-0.5">Fetching live work-item distributions</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl p-8 border border-rose-200 shadow-card text-center">
        <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
        <h4 className="text-sm font-bold text-slate-800">Failed to load task graphs</h4>
        <p className="text-xs text-rose-600 mt-1">{error}</p>
        <button
          onClick={fetchWorkItems}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      {/* Header Bar with View Mode Toggle and Scope Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Award className="w-4 h-4 text-purple-600" />
            <span>
              {isInternUser
                ? 'Your Performance & Deliverables'
                : viewMode === 'PERFORMANCE'
                ? 'Team Members & Tech Leads Performance'
                : viewMode === 'BOTH'
                ? 'Project Analytics & Team Performance'
                : 'Task Analytics & Work Distribution'}
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isInternUser
              ? 'Your completion rate, active tasks, on-time delivery, and story points within this project'
              : viewMode === 'PERFORMANCE'
              ? 'Individual completion rates, active work, and on-time delivery across team members'
              : 'Real-time status breakdowns, priority distribution, and velocity metrics from Supabase database'}
          </p>
        </div>

        {!isInternUser && (
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Segmented View Mode Toggle: Tasks & Graphs vs Team Performance vs Both */}
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

            {/* Members Performance Dropdown */}
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

                {/* Reset to All Project Tasks button if filter is active */}
                {selectedPerformanceFilter !== 'ALL' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPerformanceFilter('ALL');
                      setIsDropdownOpen(false);
                    }}
                    title="Reset to All Project Tasks & Graphs"
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
                  {/* Default All Project Tasks option */}
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

                  <div className="my-1 border-t border-slate-100" />

                  {/* Tech Leads scope */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPerformanceFilter('TECH_LEADS');
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      selectedPerformanceFilter === 'TECH_LEADS'
                        ? 'bg-purple-50 text-purple-900 font-bold'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                      <span>Tech Leads Performance</span>
                    </div>
                    <span className="text-[10px] text-purple-700 font-bold">
                      ({techLeadUserIds.size})
                    </span>
                  </button>
                </div>

                <div className="px-2 pt-2 pb-1.5 border-t border-slate-100 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <span>Individual Member / Lead</span>
                    <span className="font-semibold text-slate-400">
                      {Array.from(memberPerformanceMap.values()).length} total
                    </span>
                  </div>

                  {/* Search bar inside dropdown */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search member or lead..."
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full pl-8 pr-7 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-purple-400 focus:bg-white placeholder-slate-400 transition-colors"
                    />
                    {memberSearchQuery && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMemberSearchQuery('');
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
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
                    .sort((a, b) => {
                      if (a.isTechLead && !b.isTechLead) return -1;
                      if (!a.isTechLead && b.isTechLead) return 1;
                      const nameA = a.name || a.email || '';
                      const nameB = b.name || b.email || '';
                      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
                    })
                    .map((mem) => {
                      const isSelected = selectedPerformanceFilter === mem.userId;
                      return (
                        <button
                          key={mem.userId}
                          type="button"
                          onClick={() => {
                            setSelectedPerformanceFilter(mem.userId);
                            setIsDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                            isSelected
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
                      );
                    })}

                  {Array.from(memberPerformanceMap.values()).filter((mem) => {
                    if (!memberSearchQuery.trim()) return true;
                    const q = memberSearchQuery.toLowerCase();
                    return (
                      mem.name.toLowerCase().includes(q) ||
                      mem.email.toLowerCase().includes(q) ||
                      (mem.roleLabel && mem.roleLabel.toLowerCase().includes(q))
                    );
                  }).length === 0 && (
                    <div className="px-3 py-4 text-center text-xs text-slate-400">
                      No members match "{memberSearchQuery}"
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Refresh button */}
          <button
            type="button"
            onClick={fetchWorkItems}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
            title="Refresh analytics from database"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            <span>Refresh</span>
          </button>
        </div>
      )}
    </div>

      {/* KPI Highlight Cards & Main Charts (Visible in Tasks & Graphs or Both view) */}
      {(viewMode === 'TASKS' || viewMode === 'BOTH') && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Total Tasks Assigned */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tasks Assigned</span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Layers className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">{analytics.total}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {selectedPerformanceFilter === 'ALL' 
              ? 'Across entire project' 
              : selectedPerformanceFilter === 'TECH_LEADS'
              ? 'Assigned to Tech Leads'
              : 'Assigned to selected member'}
          </div>
        </div>

        {/* Completed & Rate */}
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

        {/* On Time Rate */}
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

        {/* Past Due / Attention */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Past Due</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-600 mt-2">{analytics.pastDue}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {analytics.pastDue > 0 ? `${analytics.pastDue} overdue deadlines` : 'All tasks on schedule'}
          </div>
        </div>
      </div>

      {/* Main Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* GRAPH 1: Status Distribution (SVG Donut Chart) - 5 Cols */}
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

            {/* Donut Visual */}
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

        {/* GRAPH 2: Priority & Issue Types Breakdown - 7 Cols */}
        <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Priority & Deliverable Mix</h3>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">Categorized</span>
            </div>

            {/* Horizontal Bar Chart: Priority Breakdown */}
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

            {/* Issue Types Distribution Grid */}
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

          {/* Active Scope Summary Snippet */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-purple-600" />
              <span>Scope: <strong>{selectedPerformanceFilter === 'ALL' ? `All Members (${members.length})` : selectedPerformanceFilter === 'TECH_LEADS' ? `Tech Leads (${techLeadUserIds.size})` : (memberPerformanceMap.get(selectedPerformanceFilter)?.name || 'Selected User')}</strong></span>
            </span>
            <span className="text-purple-600 font-semibold">
              Live Supabase Database Sync
            </span>
          </div>
        </div>
      </div>
      </>
      )}

      {/* MEMBER & TECH LEAD PERFORMANCE BREAKDOWN TABLE & METRICS (Visible in Team Performance or Both view) */}
      {(viewMode === 'PERFORMANCE' || viewMode === 'BOTH') && (
        <div className="space-y-3">
          {/* Performance Summary Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {isInternUser ? 'Your Assigned Tasks' : 'Members Tracked'}
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">
                {isInternUser
                  ? performanceRows.reduce((acc, r) => acc + r.totalAssigned, 0)
                  : performanceRows.length}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {isInternUser ? 'In this project' : `${techLeadUserIds.size} tech leads`}
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Completion Rate</div>
              <div className="text-xl font-bold text-purple-700 mt-1">
                {performanceRows.length > 0 
                  ? Math.round(performanceRows.reduce((acc, r) => acc + r.completionRate, 0) / performanceRows.length)
                  : 0}%
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {isInternUser ? 'Your progress' : 'Across active assignees'}
              </div>
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
              <div className="text-[10px] text-slate-400 mt-0.5">
                {isInternUser ? 'Needs attention' : 'Requires follow-up'}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-purple-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  {isInternUser
                    ? 'Your Personal Performance Breakdown'
                    : selectedPerformanceFilter === 'TECH_LEADS'
                    ? 'Tech Leads Performance & Task Delivery'
                    : selectedPerformanceFilter !== 'ALL'
                    ? `${memberPerformanceMap.get(selectedPerformanceFilter)?.name || 'Member'} — Task Performance Record`
                    : 'Team Members & Tech Leads Performance Directory'}
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                  {isInternUser ? 'You' : `${performanceRows.length} Tracked`}
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
                      {/* Name & Avatar */}
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

                      {/* Role Badge */}
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border inline-block whitespace-nowrap ${
                          mem.isTechLead
                            ? 'bg-purple-100 text-purple-800 border-purple-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {mem.roleLabel}
                        </span>
                      </td>

                      {/* Total Assigned */}
                      <td className="py-3 px-3 text-center font-bold text-slate-900">
                        {mem.totalAssigned}
                      </td>

                      {/* Completed */}
                      <td className="py-3 px-3 text-center">
                        <span className="font-bold text-emerald-600">
                          {mem.completed}
                        </span>
                      </td>

                      {/* Active (In Progress + Review) */}
                      <td className="py-3 px-3 text-center">
                        {activeCount > 0 ? (
                          <span className="font-semibold text-blue-600">
                            {activeCount}
                          </span>
                        ) : (
                          <span className="text-slate-300">0</span>
                        )}
                      </td>

                      {/* Past Due */}
                      <td className="py-3 px-3 text-center">
                        {mem.pastDue > 0 ? (
                          <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-bold border border-rose-200">
                            {mem.pastDue}
                          </span>
                        ) : (
                          <span className="text-slate-300">0</span>
                        )}
                      </td>

                      {/* On-Time Delivery */}
                      <td className="py-3 px-3 text-center font-semibold">
                        {mem.completed > 0 ? (
                          <span className={mem.onTimeRate >= 80 ? 'text-emerald-600' : 'text-amber-600'}>
                            {mem.onTimeRate}%
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Progress Bar & Rate */}
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
);
}

