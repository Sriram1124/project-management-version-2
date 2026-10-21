import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  Play, 
  Search, 
  ChevronDown, 
  ChevronRight,
  Calendar,
  Layers, 
  Loader2, 
  Check, 
  Clock, 
  AlertTriangle, 
  AlertCircle,
  Filter, 
  ArrowRight, 
  X,
  ExternalLink,
  Plus,
  Edit3,
  Bookmark,
  CheckSquare,
  Flag,
  User,
  RefreshCw,
  BarChart3,
  SlidersHorizontal,
  FolderKanban,
  ListTree
} from 'lucide-react';
import { workItemsService } from '../../../services/workItems.service';
import { sprintsService } from '../../../services/sprints.service';
import { projectsService } from '../../../services/projects.service';
import TaskDetailModal from '../../kanban/TaskDetailModal';
import CreateIssueModal from '../../backlog/CreateIssueModal';
import CreateSprintModal from '../../modals/CreateSprintModal';
import EditSprintModal from '../../modals/EditSprintModal';
import SprintDetailsModal from '../../modals/SprintDetailsModal';

// Work item type styling
const TYPE_CONFIG = {
  EPIC: {
    label: 'Epic',
    icon: Layers,
    color: 'text-purple-700 bg-purple-50 border-purple-200',
    barClass: 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-purple-200/50',
    dotClass: 'bg-purple-600',
  },
  STORY: {
    label: 'Story',
    icon: Bookmark,
    color: 'text-blue-700 bg-blue-50 border-blue-200',
    barClass: 'bg-blue-600 text-white shadow-blue-200/50',
    dotClass: 'bg-blue-500',
  },
  BUG: {
    label: 'Bug',
    icon: AlertCircle,
    color: 'text-rose-700 bg-rose-50 border-rose-200',
    barClass: 'bg-rose-600 text-white shadow-rose-200/50',
    dotClass: 'bg-rose-500',
  },
  TASK: {
    label: 'Task',
    icon: CheckSquare,
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    barClass: 'bg-emerald-600 text-white shadow-emerald-200/50',
    dotClass: 'bg-emerald-500',
  },
  SUBTASK: {
    label: 'Subtask',
    icon: CheckSquare,
    color: 'text-slate-700 bg-slate-100 border-slate-200',
    barClass: 'bg-slate-600 text-white shadow-slate-200/50',
    dotClass: 'bg-slate-400',
  },
};

// Status styling for bars and badges
const STATUS_CONFIG = {
  TODO: {
    label: 'To Do',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    barClass: 'bg-slate-400 hover:bg-slate-500 text-white',
    dotClass: 'bg-slate-400',
  },
  IN_PROGRESS: {
    label: 'In Progress',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    barClass: 'bg-blue-500 hover:bg-blue-600 text-white',
    dotClass: 'bg-blue-500',
  },
  IN_REVIEW: {
    label: 'In Review',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    barClass: 'bg-amber-500 hover:bg-amber-600 text-white',
    dotClass: 'bg-amber-500',
  },
  COMPLETED: {
    label: 'Completed',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    barClass: 'bg-emerald-500 hover:bg-emerald-600 text-white',
    dotClass: 'bg-emerald-500',
  },
  BLOCKED: {
    label: 'Blocked',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    barClass: 'bg-rose-500 hover:bg-rose-600 text-white',
    dotClass: 'bg-rose-500',
  },
};

const PRIORITY_BADGES = {
  LOW: 'text-slate-600 bg-slate-100 border-slate-200',
  MEDIUM: 'text-blue-700 bg-blue-50 border-blue-200',
  HIGH: 'text-amber-700 bg-amber-50 border-amber-200',
  URGENT: 'text-rose-700 bg-rose-50 border-rose-200 font-bold',
};

export default function ProjectRoadmapTab({ 
  projectId, 
  project, 
  onOpenSprintBoard, 
  onToast,
  readOnly = false,
}) {
  const isKanban = project?.methodology === 'KANBAN';

  // Core Data States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workItems, setWorkItems] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [members, setMembers] = useState([]);

  // View Controls
  const [viewMode, setViewMode] = useState('deliverables'); // 'deliverables' | 'cycles'
  const [zoomLevel, setZoomLevel] = useState('weeks'); // 'weeks' | 'months'
  const [expandedEpics, setExpandedEpics] = useState(new Set());
  const [showUnscheduled, setShowUnscheduled] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState('ALL');

  // Modals & Selection
  const [selectedTask, setSelectedTask] = useState(null);
  const [isCreateIssueOpen, setIsCreateIssueOpen] = useState(false);
  const [createParentItem, setCreateParentItem] = useState(null);
  const [createInitialType, setCreateInitialType] = useState('Story');
  const [isCreateSprintOpen, setIsCreateSprintOpen] = useState(false);
  const [editingSprint, setEditingSprint] = useState(null);
  const [selectedSprintDetails, setSelectedSprintDetails] = useState(null);

  // Layout references for synchronized horizontal scrolling
  const timelineScrollRef = useRef(null);

  // Load project deliverables, sprints/cycles, and members
  const loadData = useCallback(async (isRefresh = false) => {
    if (!projectId) return;
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const [itemsRes, sprintsRes, membersRes] = await Promise.all([
        workItemsService.listWorkItems({ project_id: projectId }).catch((err) => {
          console.error('Failed to load work items:', err);
          return [];
        }),
        isKanban
          ? Promise.resolve([])
          : sprintsService.getSprints(projectId).catch((err) => {
              console.error('Failed to load sprints:', err);
              return [];
            }),
        projectsService.getMembers(projectId).catch((err) => {
          console.error('Failed to load members:', err);
          return [];
        }),
      ]);

      setWorkItems(itemsRes || []);
      setSprints(sprintsRes || []);
      setMembers(membersRes || []);

      // Auto-expand all Epics by default on initial load so hierarchy is visible
      const epicIds = (itemsRes || []).filter((i) => i.type === 'EPIC').map((e) => e.id);
      setExpandedEpics((prev) => (prev.size === 0 ? new Set(epicIds) : prev));
    } catch (err) {
      console.error('Failed to load roadmap data:', err);
      onToast?.('Failed to load project roadmap data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId, onToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Listen to external work item update events
  useEffect(() => {
    const handleUpdate = (e) => {
      const detail = e?.detail;
      if (detail?.action === 'update' && detail?.item?.id) {
        setWorkItems((prev) => prev.map((item) => (item.id === detail.item.id ? { ...item, ...detail.item } : item)));
        setSelectedTask((prev) => (prev && prev.id === detail.item.id ? { ...prev, ...detail.item } : prev));
        return;
      }
      if (detail?.action === 'delete' && detail?.id) {
        setWorkItems((prev) => prev.filter((item) => item.id !== detail.id));
        setSelectedTask((prev) => (prev && prev.id === detail.id ? null : prev));
        return;
      }
      loadData(true);
    };
    window.addEventListener('work-items-updated', handleUpdate);
    return () => window.removeEventListener('work-items-updated', handleUpdate);
  }, [loadData]);

  // Toggle Epic expand / collapse
  const toggleEpicExpand = (epicId) => {
    setExpandedEpics((prev) => {
      const next = new Set(prev);
      if (next.has(epicId)) {
        next.delete(epicId);
      } else {
        next.add(epicId);
      }
      return next;
    });
  };

  // Expand / collapse all
  const expandAllEpics = () => {
    const epicIds = workItems.filter((i) => i.type === 'EPIC').map((e) => e.id);
    setExpandedEpics(new Set(epicIds));
  };
  const collapseAllEpics = () => {
    setExpandedEpics(new Set());
  };

  // Handle Deliverable Creation (Story, Task, Bug)
  const handleCreateIssue = async (payload) => {
    try {
      const created = await workItemsService.createWorkItem({
        ...payload,
        project_id: projectId,
      });

      // Expand parent Epic if present so the new child item is immediately visible
      if (payload.parent_id) {
        setExpandedEpics((prev) => new Set([...prev, payload.parent_id]));
      }

      // If active filters would hide the newly created deliverable, reset conflicting filters
      let filterReset = false;
      if (typeFilter !== 'ALL' && typeFilter !== payload.type) {
        setTypeFilter('ALL');
        filterReset = true;
      }
      if (statusFilter !== 'ALL' && statusFilter !== (payload.status || 'TODO')) {
        setStatusFilter('ALL');
        filterReset = true;
      }
      if (priorityFilter !== 'ALL' && priorityFilter !== payload.priority) {
        setPriorityFilter('ALL');
        filterReset = true;
      }
      if (assigneeFilter !== 'ALL') {
        const hasAssigned = (payload.assignee_ids || []).includes(assigneeFilter);
        if (!hasAssigned) {
          setAssigneeFilter('ALL');
          filterReset = true;
        }
      }
      if (search.trim()) {
        const matchTitle = (payload.title || '').toLowerCase().includes(search.toLowerCase().trim());
        if (!matchTitle) {
          setSearch('');
          filterReset = true;
        }
      }

      // If deliverable is undated, ensure unscheduled tray is open
      if (!payload.start_date && !payload.due_date) {
        setShowUnscheduled(true);
      }

      onToast?.(
        filterReset
          ? `Created ${payload.type}: "${payload.title}" (filters reset to show deliverable)`
          : `Created ${payload.type}: "${payload.title}"`
      );

      await loadData(true);
      return created;
    } catch (err) {
      console.error('Failed to create deliverable:', err);
      const msg = err?.response?.data?.error || err?.message || 'Failed to create deliverable';
      onToast?.(msg);
      throw err;
    }
  };

  // Handle Epic Creation
  const handleCreateEpic = async (payload) => {
    try {
      const created = await workItemsService.createWorkItem({
        ...payload,
        project_id: projectId,
        type: 'EPIC',
      });

      // Automatically expand new Epic
      if (created?.id) {
        setExpandedEpics((prev) => new Set([...prev, created.id]));
      }

      let filterReset = false;
      if (typeFilter !== 'ALL' && typeFilter !== 'EPIC') {
        setTypeFilter('ALL');
        filterReset = true;
      }
      if (statusFilter !== 'ALL' && statusFilter !== (payload.status || 'TODO')) {
        setStatusFilter('ALL');
        filterReset = true;
      }
      if (priorityFilter !== 'ALL' && priorityFilter !== payload.priority) {
        setPriorityFilter('ALL');
        filterReset = true;
      }
      if (search.trim()) {
        const matchTitle = (payload.title || '').toLowerCase().includes(search.toLowerCase().trim());
        if (!matchTitle) {
          setSearch('');
          filterReset = true;
        }
      }

      // If epic is undated, ensure unscheduled tray is open
      if (!payload.start_date && !payload.due_date) {
        setShowUnscheduled(true);
      }

      onToast?.(
        filterReset
          ? `Created Epic: "${payload.title}" (filters reset to show deliverable)`
          : `Created Epic: "${payload.title}"`
      );

      await loadData(true);
      return created;
    } catch (err) {
      console.error('Failed to create epic:', err);
      const msg = err?.response?.data?.error || err?.message || 'Failed to create epic';
      onToast?.(msg);
      throw err;
    }
  };

  // -------------------------------------------------------------
  // CHRONOLOGICAL SPRINT & TIMELINE ORDERING MAP
  // Determines chronological sequence based on sprint start dates and creation order
  // -------------------------------------------------------------
  const sprintOrderMap = useMemo(() => {
    const map = new Map();
    const sorted = [...sprints].sort((a, b) => {
      if (a.start_date && b.start_date) {
        return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
      }
      if (a.start_date) return -1;
      if (b.start_date) return 1;
      return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    });

    sorted.forEach((s, idx) => {
      map.set(s.id, {
        orderIndex: idx,
        startTime: s.start_date ? new Date(s.start_date).getTime() : null,
      });
    });
    return map;
  }, [sprints]);

  // Helper to determine the effective start/sort timestamp for any deliverable
  // Prioritizes: item start_date -> sprint start_date -> item due_date -> created_at
  const getItemSortTime = useCallback((item, derivedStart = null) => {
    if (item.start_date) {
      const t = new Date(item.start_date).getTime();
      if (!Number.isNaN(t)) return t;
    }
    if (derivedStart) {
      const t = derivedStart.getTime();
      if (!Number.isNaN(t)) return t;
    }
    if (item.sprint_id && sprintOrderMap.has(item.sprint_id)) {
      const s = sprintOrderMap.get(item.sprint_id);
      if (s.startTime) return s.startTime;
      return 1500000000000 + (s.orderIndex * 86400000);
    }
    if (item.due_date) {
      const t = new Date(item.due_date).getTime();
      if (!Number.isNaN(t)) return t;
    }
    if (item.created_at) {
      const t = new Date(item.created_at).getTime();
      if (!Number.isNaN(t)) return t;
    }
    return Number.MAX_SAFE_INTEGER;
  }, [sprintOrderMap]);

  // -------------------------------------------------------------
  // HIERARCHY & DELIVERABLE DERIVATION
  // -------------------------------------------------------------
  // Map deliverables into:
  // 1. Epics (with direct child Stories & Bugs, and their child Tasks)
  // 2. Standalone Stories & Bugs (parent_id == null)
  // 3. Standalone Tasks (parent_id == null)
  const hierarchicalTree = useMemo(() => {
    const epics = [];
    const standaloneStories = [];
    const standaloneTasks = [];

    // Group items by parent_id
    const childrenMap = new Map();
    workItems.forEach((item) => {
      if (item.parent_id) {
        if (!childrenMap.has(item.parent_id)) {
          childrenMap.set(item.parent_id, []);
        }
        childrenMap.get(item.parent_id).push(item);
      }
    });

    workItems.forEach((item) => {
      if (item.type === 'EPIC') {
        const directChildren = childrenMap.get(item.id) || [];
        // For each direct child (Story/Bug), attach its children (Tasks/Subtasks)
        const enrichedChildren = directChildren.map((child) => {
          const grandChildren = childrenMap.get(child.id) || [];
          grandChildren.sort((a, b) => getItemSortTime(a) - getItemSortTime(b));
          return {
            ...child,
            children: grandChildren,
            sortTime: getItemSortTime(child),
          };
        });

        // Sort children chronologically by sprint and start date
        enrichedChildren.sort((a, b) => a.sortTime - b.sortTime);

        // Derive dates for Epic if not set or if children span wider
        let derivedStart = item.start_date ? new Date(item.start_date) : null;
        let derivedDue = item.due_date ? new Date(item.due_date) : null;
        let isDerivedStart = !item.start_date;
        let isDerivedDue = !item.due_date;

        // Collect all descendant items for metrics and date derivation
        const allDescendants = [];
        enrichedChildren.forEach((child) => {
          allDescendants.push(child);
          if (child.children) allDescendants.push(...child.children);
        });

        allDescendants.forEach((d) => {
          if (d.start_date) {
            const dStart = new Date(d.start_date);
            if (!derivedStart || dStart < derivedStart) {
              derivedStart = dStart;
              isDerivedStart = true;
            }
          }
          if (d.due_date) {
            const dDue = new Date(d.due_date);
            if (!derivedDue || dDue > derivedDue) {
              derivedDue = dDue;
              isDerivedDue = true;
            }
          }
        });

        // Calculate progress without double counting story points
        // Eligible leaf deliverables: items with story points
        const leafItems = allDescendants.filter((d) => !d.children || d.children.length === 0);
        const totalStoryPoints = leafItems.reduce((acc, curr) => acc + (Number(curr.story_points) || 0), 0);
        const completedStoryPoints = leafItems
          .filter((d) => d.status === 'COMPLETED')
          .reduce((acc, curr) => acc + (Number(curr.story_points) || 0), 0);

        let progressPercent = 0;
        if (totalStoryPoints > 0) {
          progressPercent = Math.round((completedStoryPoints / totalStoryPoints) * 100);
        } else if (allDescendants.length > 0) {
          const completedCount = allDescendants.filter((d) => d.status === 'COMPLETED').length;
          progressPercent = Math.round((completedCount / allDescendants.length) * 100);
        } else if (item.status === 'COMPLETED') {
          progressPercent = 100;
        }

        const epicSortTime = derivedStart
          ? derivedStart.getTime()
          : enrichedChildren.length > 0
          ? Math.min(...enrichedChildren.map((c) => c.sortTime))
          : getItemSortTime(item);

        epics.push({
          ...item,
          children: enrichedChildren,
          allDescendants,
          derivedStart,
          derivedDue,
          isDerivedStart,
          isDerivedDue,
          totalStoryPoints,
          completedStoryPoints,
          progressPercent,
          sortTime: epicSortTime,
        });
      } else if (!item.parent_id) {
        if (item.type === 'STORY' || item.type === 'BUG') {
          const subChildren = childrenMap.get(item.id) || [];
          subChildren.sort((a, b) => getItemSortTime(a) - getItemSortTime(b));
          standaloneStories.push({
            ...item,
            children: subChildren,
            progressPercent: item.status === 'COMPLETED' ? 100 : (item.status === 'IN_PROGRESS' || item.status === 'IN_REVIEW' ? 50 : 0),
            sortTime: getItemSortTime(item),
          });
        } else if (item.type === 'TASK') {
          const subChildren = childrenMap.get(item.id) || [];
          subChildren.sort((a, b) => getItemSortTime(a) - getItemSortTime(b));
          standaloneTasks.push({
            ...item,
            children: subChildren,
            progressPercent: item.status === 'COMPLETED' ? 100 : (item.status === 'IN_PROGRESS' || item.status === 'IN_REVIEW' ? 50 : 0),
            sortTime: getItemSortTime(item),
          });
        }
      }
    });

    // Sort root categories chronologically
    epics.sort((a, b) => a.sortTime - b.sortTime);
    standaloneStories.sort((a, b) => a.sortTime - b.sortTime);
    standaloneTasks.sort((a, b) => a.sortTime - b.sortTime);

    return { epics, standaloneStories, standaloneTasks };
  }, [workItems, getItemSortTime]);

  // -------------------------------------------------------------
  // FLATTENED DELIVERABLE ROWS FOR ROADMAP TABLE & GANTT
  // -------------------------------------------------------------
  const visibleDeliverableRows = useMemo(() => {
    const rows = [];

    // Helper to test if item matches active filters
    const matchesFilters = (item) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = (item.title || '').toLowerCase().includes(q);
        const matchDesc = (item.description || '').toLowerCase().includes(q);
        if (!matchTitle && !matchDesc) return false;
      }
      if (typeFilter !== 'ALL' && item.type !== typeFilter) return false;
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (priorityFilter !== 'ALL' && item.priority !== priorityFilter) return false;
      if (assigneeFilter !== 'ALL') {
        if (assigneeFilter === 'UNASSIGNED') {
          if (item.assignees && item.assignees.length > 0) return false;
        } else {
          const hasAssignee = (item.assignees || []).some(
            (a) => (a.user_id || a.id) === assigneeFilter
          );
          if (!hasAssignee) return false;
        }
      }
      return true;
    };

    // Combine all top-level deliverables and sort them chronologically by sprint & start dates
    const rootItems = [
      ...hierarchicalTree.epics.map((e) => ({ ...e, isEpicRoot: true })),
      ...hierarchicalTree.standaloneStories.map((s) => ({ ...s, isStoryRoot: true })),
      ...hierarchicalTree.standaloneTasks.map((t) => ({ ...t, isTaskRoot: true })),
    ];
    rootItems.sort((a, b) => (a.sortTime || 0) - (b.sortTime || 0));

    rootItems.forEach((root) => {
      if (root.isEpicRoot) {
        const epic = root;
        const epicMatches = matchesFilters(epic);
        const isExpanded = expandedEpics.has(epic.id);

        const matchingChildren = (epic.children || []).filter((child) => {
          if (matchesFilters(child)) return true;
          if ((child.children || []).some(matchesFilters)) return true;
          return false;
        });

        if (epicMatches || matchingChildren.length > 0) {
          rows.push({
            item: epic,
            level: 0,
            isEpic: true,
            isExpanded,
            hasChildren: (epic.children || []).length > 0,
            childCount: (epic.children || []).length,
            startDate: epic.derivedStart,
            dueDate: epic.derivedDue,
            isDerivedStart: epic.isDerivedStart,
            isDerivedDue: epic.isDerivedDue,
            progress: epic.progressPercent,
          });

          // Child deliverables in chronological sprint & date order
          if (isExpanded) {
            (epic.children || []).forEach((child) => {
              if (matchesFilters(child) || epicMatches) {
                const childStart = child.start_date ? new Date(child.start_date) : null;
                const childDue = child.due_date ? new Date(child.due_date) : null;
                const childProgress = child.status === 'COMPLETED' ? 100 : (child.status === 'IN_PROGRESS' || child.status === 'IN_REVIEW' ? 50 : 0);

                rows.push({
                  item: child,
                  level: 1,
                  parentEpicId: epic.id,
                  hasChildren: (child.children || []).length > 0,
                  childCount: (child.children || []).length,
                  startDate: childStart,
                  dueDate: childDue,
                  isDerivedStart: false,
                  isDerivedDue: false,
                  progress: childProgress,
                });

                (child.children || []).forEach((grandChild) => {
                  if (matchesFilters(grandChild) || matchesFilters(child)) {
                    rows.push({
                      item: grandChild,
                      level: 2,
                      parentStoryId: child.id,
                      hasChildren: false,
                      startDate: grandChild.start_date ? new Date(grandChild.start_date) : null,
                      dueDate: grandChild.due_date ? new Date(grandChild.due_date) : null,
                      isDerivedStart: false,
                      isDerivedDue: false,
                      progress: grandChild.status === 'COMPLETED' ? 100 : 0,
                    });
                  }
                });
              }
            });
          }
        }
      } else if (root.isStoryRoot) {
        const item = root;
        if (matchesFilters(item) || (item.children || []).some(matchesFilters)) {
          const itemStart = item.start_date ? new Date(item.start_date) : null;
          const itemDue = item.due_date ? new Date(item.due_date) : null;

          rows.push({
            item,
            level: 0,
            isStandalone: true,
            hasChildren: (item.children || []).length > 0,
            childCount: (item.children || []).length,
            startDate: itemStart,
            dueDate: itemDue,
            isDerivedStart: false,
            isDerivedDue: false,
            progress: item.progressPercent,
          });

          (item.children || []).forEach((child) => {
            if (matchesFilters(child) || matchesFilters(item)) {
              rows.push({
                item: child,
                level: 1,
                parentStoryId: item.id,
                hasChildren: false,
                startDate: child.start_date ? new Date(child.start_date) : null,
                dueDate: child.due_date ? new Date(child.due_date) : null,
                isDerivedStart: false,
                isDerivedDue: false,
                progress: child.status === 'COMPLETED' ? 100 : 0,
              });
            }
          });
        }
      } else if (root.isTaskRoot) {
        const item = root;
        if (matchesFilters(item)) {
          rows.push({
            item,
            level: 0,
            isStandalone: true,
            hasChildren: (item.children || []).length > 0,
            childCount: (item.children || []).length,
            startDate: item.start_date ? new Date(item.start_date) : null,
            dueDate: item.due_date ? new Date(item.due_date) : null,
            isDerivedStart: false,
            isDerivedDue: false,
            progress: item.progressPercent,
          });
        }
      }
    });

    return rows;
  }, [hierarchicalTree, search, typeFilter, statusFilter, priorityFilter, assigneeFilter, expandedEpics]);

  // Separate scheduled rows (have at least a start or due date) from unscheduled rows
  const scheduledRows = useMemo(() => {
    return visibleDeliverableRows.filter((r) => r.startDate || r.dueDate);
  }, [visibleDeliverableRows]);

  const unscheduledRows = useMemo(() => {
    return visibleDeliverableRows.filter((r) => !r.startDate && !r.dueDate);
  }, [visibleDeliverableRows]);

  // -------------------------------------------------------------
  // DYNAMIC GANTT TIMELINE RANGE (WEEKS OR MONTHS)
  // -------------------------------------------------------------
  const { timeColumns, timelineStartMs, timelineEndMs, totalDurationMs } = useMemo(() => {
    const dates = [new Date()]; // Always include today

    // Add dates from all visible scheduled items
    scheduledRows.forEach((r) => {
      if (r.startDate) dates.push(r.startDate);
      if (r.dueDate) dates.push(r.dueDate);
    });

    // Include sprint dates for context
    sprints.forEach((s) => {
      if (s.start_date) dates.push(new Date(s.start_date));
      if (s.end_date) dates.push(new Date(s.end_date));
    });

    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (zoomLevel === 'months') {
      // Month-based columns
      const timelineStart = new Date(minDate.getFullYear(), minDate.getMonth(), 1, 0, 0, 0, 0);
      const timelineEnd = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0, 23, 59, 59, 999);

      // Ensure at least 3 months visible
      const monthDiff = (timelineEnd.getFullYear() - timelineStart.getFullYear()) * 12 + (timelineEnd.getMonth() - timelineStart.getMonth());
      if (monthDiff < 2) {
        timelineEnd.setMonth(timelineEnd.getMonth() + (3 - monthDiff));
      }

      const columns = [];
      let cur = new Date(timelineStart);
      const endMonthMs = timelineEnd.getTime();
      const MAX_MONTHS = 120;
      while (cur.getTime() <= endMonthMs && columns.length < MAX_MONTHS) {
        const colStart = new Date(cur);
        const colEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0, 23, 59, 59, 999);
        const isActive = today >= colStart && today <= colEnd;

        columns.push({
          id: `month-${cur.getFullYear()}-${cur.getMonth()}`,
          title: cur.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          subtitle: `${cur.toLocaleDateString('en-US', { month: 'long' })}`,
          startDate: colStart,
          endDate: colEnd,
          isActive,
        });

        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      }

      const tStartMs = timelineStart.getTime();
      const tEndMs = timelineEnd.getTime();
      return {
        timeColumns: columns,
        timelineStartMs: tStartMs,
        timelineEndMs: tEndMs,
        totalDurationMs: Math.max(1, tEndMs - tStartMs),
      };
    } else {
      // Week-based columns (default)
      // Align start to the Monday of minDate's week
      const startDay = minDate.getDay();
      const startDiff = minDate.getDate() - startDay + (startDay === 0 ? -6 : 1);
      const timelineStart = new Date(minDate);
      timelineStart.setDate(startDiff);
      timelineStart.setHours(0, 0, 0, 0);

      // Align end to Sunday of maxDate's week
      const endDay = maxDate.getDay();
      const endDiff = maxDate.getDate() + (endDay === 0 ? 0 : 7 - endDay);
      const timelineEnd = new Date(maxDate);
      timelineEnd.setDate(endDiff);
      timelineEnd.setHours(23, 59, 59, 999);

      // Ensure at least 4 weeks span
      const diffWeeks = Math.ceil((timelineEnd.getTime() - timelineStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
      if (diffWeeks < 4) {
        timelineEnd.setDate(timelineEnd.getDate() + (4 - diffWeeks) * 7);
      }

      const columns = [];
      let currentWeekStart = new Date(timelineStart);
      let weekIndex = 1;
      const endWeekMs = timelineEnd.getTime();
      const MAX_WEEKS = 260;

      while (currentWeekStart.getTime() <= endWeekMs && weekIndex <= MAX_WEEKS) {
        const currentWeekEnd = new Date(currentWeekStart);
        currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);
        currentWeekEnd.setHours(23, 59, 59, 999);

        const isActive = today >= currentWeekStart && today <= currentWeekEnd;

        columns.push({
          id: `week-${weekIndex}`,
          title: `Week ${weekIndex}`,
          subtitle: `${currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${currentWeekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
          startDate: new Date(currentWeekStart),
          endDate: new Date(currentWeekEnd),
          isActive,
        });

        const nextWeekStart = new Date(currentWeekStart);
        nextWeekStart.setDate(nextWeekStart.getDate() + 7);
        currentWeekStart = nextWeekStart;
        weekIndex++;
      }

      const tStartMs = timelineStart.getTime();
      const tEndMs = timelineEnd.getTime();
      return {
        timeColumns: columns,
        timelineStartMs: tStartMs,
        timelineEndMs: tEndMs,
        totalDurationMs: Math.max(1, tEndMs - tStartMs),
      };
    }
  }, [scheduledRows, sprints, zoomLevel]);

  // Today marker percentage position
  const todayPositionPercent = useMemo(() => {
    const nowMs = new Date().getTime();
    if (nowMs < timelineStartMs || nowMs > timelineEndMs) return null;
    return Math.max(0, Math.min(100, ((nowMs - timelineStartMs) / totalDurationMs) * 100));
  }, [timelineStartMs, timelineEndMs, totalDurationMs]);

  // -------------------------------------------------------------
  // TOP KPI SUMMARY CARDS
  // -------------------------------------------------------------
  const metrics = useMemo(() => {
    const total = workItems.length;
    const completed = workItems.filter((i) => i.status === 'COMPLETED').length;
    const inProgress = workItems.filter((i) => i.status === 'IN_PROGRESS' || i.status === 'IN_REVIEW').length;
    
    const now = new Date();
    const overdueOrAtRisk = workItems.filter((i) => {
      const isOverdue = i.due_date && new Date(i.due_date) < now && i.status !== 'COMPLETED';
      const isBlocked = i.status === 'BLOCKED';
      return isOverdue || isBlocked;
    }).length;

    // Story points aggregation
    const totalPoints = workItems.reduce((acc, curr) => acc + (Number(curr.story_points) || 0), 0);
    const completedPoints = workItems
      .filter((i) => i.status === 'COMPLETED')
      .reduce((acc, curr) => acc + (Number(curr.story_points) || 0), 0);

    return {
      total,
      completed,
      inProgress,
      overdueOrAtRisk,
      totalPoints,
      completedPoints,
      deliveryRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }, [workItems]);

  // Active filters check & clear
  const hasActiveFilters = Boolean(
    search.trim() ||
    typeFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    priorityFilter !== 'ALL' ||
    assigneeFilter !== 'ALL'
  );

  const handleClearFilters = () => {
    setSearch('');
    setTypeFilter('ALL');
    setStatusFilter('ALL');
    setPriorityFilter('ALL');
    setAssigneeFilter('ALL');
  };


  if (loading && workItems.length === 0 && sprints.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-16 flex flex-col items-center justify-center min-h-[420px]">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-3" />
        <p className="text-xs font-semibold text-slate-700">Loading Deliverable Roadmap...</p>
        <p className="text-[11px] text-slate-400 mt-1">Retrieving project deliverables, Epics, and timeline schedules</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* -------------------------------------------------------------
          SECTION 1: PAGE HEADER & KEY PERFORMANCE METRICS
          ------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left: Project Context */}
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                isKanban
                  ? 'text-indigo-700 bg-indigo-50 border-indigo-200/80'
                  : 'text-purple-700 bg-purple-50 border-purple-200/80'
              }`}>
                {isKanban ? 'Kanban Deliverables Roadmap' : 'Scrum Deliverables Roadmap'}
              </span>

              <span className="text-slate-300">•</span>
              <span className="text-xs text-slate-500 font-medium">
                Methodology: <strong className={isKanban ? 'text-indigo-700 font-semibold' : 'text-purple-700 font-semibold'}>{isKanban ? 'Kanban (Flow)' : 'Scrum (Sprints)'}</strong>
              </span>
            </div>

            <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>{project?.name || 'Project Roadmap'}</span>
              {refreshing && (
                <RefreshCw className="w-3.5 h-3.5 text-purple-600 animate-spin" />
              )}
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
              Deliverable-based Gantt roadmap. Visualize project deliverables, Epics, Stories, and Bugs mapped across calendar milestones with synchronized progress and duration bars.
            </p>
          </div>

          {/* Right: Data-Driven Summary KPI Blocks */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
            {/* Total Deliverables */}
            <div className="px-3.5 py-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80 text-center min-w-[105px]">
              <span className="text-lg font-extrabold text-slate-800">
                {metrics.total}
              </span>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                Deliverables
              </div>
              {metrics.totalPoints > 0 && (
                <div className="text-[9px] font-medium text-slate-500 mt-0.5">
                  {metrics.totalPoints} Story Pts
                </div>
              )}
            </div>

            {/* Completed */}
            <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/70 text-center min-w-[105px]">
              <span className="text-lg font-extrabold text-emerald-700">
                {metrics.completed}
              </span>
              <div className="text-[10px] font-bold text-emerald-900/60 uppercase tracking-wider mt-0.5">
                Completed
              </div>
              <div className="text-[9px] font-semibold text-emerald-600 mt-0.5">
                {metrics.deliveryRate}% done
              </div>
            </div>

            {/* In Progress */}
            <div className={`px-3.5 py-2.5 rounded-xl border text-center min-w-[105px] ${
              isKanban
                ? 'bg-indigo-50/70 border-indigo-200/70 text-indigo-700'
                : 'bg-purple-50/70 border-purple-200/70 text-purple-700'
            }`}>
              <span className="text-lg font-extrabold">
                {metrics.inProgress}
              </span>
              <div className="text-[10px] font-bold opacity-75 uppercase tracking-wider mt-0.5">
                In Progress
              </div>
              <div className="text-[9px] font-semibold opacity-75 mt-0.5">
                Active flow
              </div>
            </div>

            {/* Overdue / At Risk */}
            <div className={`px-3.5 py-2.5 rounded-xl border text-center min-w-[105px] ${
              metrics.overdueOrAtRisk > 0 
                ? 'bg-rose-50/80 border-rose-200 text-rose-700'
                : 'bg-slate-50/90 border-slate-200/80 text-slate-600'
            }`}>
              <span className="text-lg font-extrabold">
                {metrics.overdueOrAtRisk}
              </span>
              <div className="text-[10px] font-bold opacity-75 uppercase tracking-wider mt-0.5">
                Overdue / At Risk
              </div>
              <div className="text-[9px] font-medium opacity-75 mt-0.5">
                {metrics.overdueOrAtRisk > 0 ? 'Requires attention' : 'On schedule'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------
          SECTION 2: TOOLBAR WITH FILTERS, SEARCH, ZOOM & VIEWS
          ------------------------------------------------------------- */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
        {/* ROW 1: Search Box & View Mode / Zoom / Primary CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deliverables, Epics, Stories..."
              className="w-full pl-8 pr-7 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* View Mode Toggle, Zoom Switcher, and Primary Action */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            {/* View Mode Toggle: Deliverables vs Cycles (Scrum only) */}
            {!isKanban && (
              <div className="flex items-center p-0.5 rounded-xl bg-slate-100 border border-slate-200/80 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('deliverables')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    viewMode === 'deliverables'
                      ? 'bg-white text-purple-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Deliverables
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('cycles')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    viewMode === 'cycles'
                      ? 'bg-white text-purple-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sprint Schedule
                </button>
              </div>
            )}

            {/* Zoom Selector (Weeks vs Months) */}
            {(isKanban || viewMode === 'deliverables') && (
              <div className="flex items-center p-0.5 rounded-xl bg-slate-100 border border-slate-200/80 text-xs">
                <button
                  type="button"
                  onClick={() => setZoomLevel('weeks')}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    zoomLevel === 'weeks'
                      ? 'bg-white text-purple-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Weeks
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel('months')}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    zoomLevel === 'months'
                      ? 'bg-white text-purple-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Months
                </button>
              </div>
            )}

            {/* Create CTA Button */}
            {!readOnly && (
              <button
                type="button"
                onClick={() => {
                  if (!isKanban && viewMode === 'cycles') {
                    setIsCreateSprintOpen(true);
                  } else {
                    setCreateParentItem(null);
                    setCreateInitialType('Story');
                    setIsCreateIssueOpen(true);
                  }
                }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs ${
                  isKanban ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-purple-700 hover:bg-purple-800'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>
                  {!isKanban && viewMode === 'cycles'
                    ? 'Create Sprint'
                    : 'New Deliverable'}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* ROW 2: Filter Strip with subtle top divider */}
        <div className="pt-2.5 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          {/* Left: Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mr-1 select-none">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>Filters:</span>
            </div>

            {/* Type Filter */}
            <div className="relative">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-white transition-colors cursor-pointer shadow-2xs pr-7 appearance-none"
              >
                <option value="ALL">All Types</option>
                <option value="EPIC">Epics</option>
                <option value="STORY">Stories</option>
                <option value="BUG">Bugs</option>
                <option value="TASK">Tasks</option>
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-white transition-colors cursor-pointer shadow-2xs pr-7 appearance-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="IN_REVIEW">In Review</option>
                <option value="COMPLETED">Completed</option>
                <option value="BLOCKED">Blocked</option>
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Priority Filter */}
            <div className="relative">
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-white transition-colors cursor-pointer shadow-2xs pr-7 appearance-none"
              >
                <option value="ALL">All Priorities</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Assignee Filter */}
            <div className="relative">
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-white transition-colors cursor-pointer shadow-2xs pr-7 appearance-none max-w-[150px] truncate"
              >
                <option value="ALL">All Assignees</option>
                <option value="UNASSIGNED">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id || m.user_id} value={m.user_id || m.id}>
                    {m.name || m.email}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* Right: Expand / Collapse All Epics */}
          {viewMode === 'deliverables' && hierarchicalTree.epics.length > 0 && (
            <div className="flex items-center gap-1.5 self-end md:self-auto text-xs text-slate-500">
              <button
                type="button"
                onClick={expandAllEpics}
                title="Expand all Epics"
                className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-purple-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Expand All
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={collapseAllEpics}
                title="Collapse all Epics"
                className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-purple-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Collapse All
              </button>
            </div>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------
          SECTION 3: PRIMARY DELIVERABLE ROADMAP GANTT CHART
          ------------------------------------------------------------- */}
      {viewMode === 'deliverables' ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
          {/* Main Hierarchical Gantt Layout: Left Table + Right Timeline Canvas */}
          <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
            {/* ----------------- LEFT PANE: DELIVERABLE TREE & ATTRIBUTES ----------------- */}
            <div className="w-full lg:w-[480px] shrink-0 bg-slate-50/50 flex flex-col">
              {/* Table Column Headers */}
              <div className="h-12 border-b border-slate-200 bg-slate-100/70 px-3 flex items-center text-[11px] font-bold text-slate-700">
                <div className="flex-1 min-w-0 flex items-center gap-2 pl-1">
                  <ListTree className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                  <span className="truncate">Deliverable Hierarchy</span>
                </div>
                <div className="w-16 text-center text-slate-500 font-medium shrink-0">
                  Assignee
                </div>
                <div className="w-24 text-center text-slate-500 font-medium shrink-0">
                  Status
                </div>
                <div className="w-14 text-right pr-2 text-slate-500 font-medium shrink-0">
                  Points
                </div>
              </div>

              {/* Deliverable Tree Rows */}
              <div className="divide-y divide-slate-100 flex-1">
                {scheduledRows.map((row) => {
                  const item = row.item;
                  const typeMeta = TYPE_CONFIG[item.type] || TYPE_CONFIG.TASK;
                  const statusMeta = STATUS_CONFIG[item.status] || STATUS_CONFIG.TODO;
                  const Icon = typeMeta.icon;
                  const isEpic = row.isEpic;
                  const primaryAssignee = item.assignees?.[0] || item.assignee;

                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedTask(item)}
                      onKeyDown={(e) => {
                        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          setSelectedTask(item);
                        }
                      }}
                      className={`h-12 px-3 flex items-center text-xs hover:bg-purple-50/40 cursor-pointer transition-colors group select-none ${
                        isEpic ? 'bg-purple-50/20 font-semibold' : ''
                      }`}
                    >
                      {/* Column 1: Deliverable Hierarchy (Expand toggle, Icon, Title) */}
                      <div className="flex-1 min-w-0 flex items-center gap-1.5 pr-2" style={{ paddingLeft: `${row.level * 16}px` }}>
                        {isEpic ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleEpicExpand(item.id);
                            }}
                            className="p-1 hover:bg-purple-100 rounded text-slate-500 hover:text-purple-700 transition-colors"
                            title={row.isExpanded ? 'Collapse Epic' : 'Expand Epic'}
                          >
                            {row.isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </button>
                        ) : row.level > 0 ? (
                          <span className="text-slate-300 font-mono text-[11px] pl-1 select-none">└─</span>
                        ) : (
                          <span className="w-5" />
                        )}

                        <span className={`p-1 rounded-md border shrink-0 ${typeMeta.color}`} title={typeMeta.label}>
                          <Icon className="w-3 h-3" />
                        </span>

                        <span className="truncate text-slate-800 font-medium group-hover:text-purple-700 transition-colors" title={item.title}>
                          {item.title}
                        </span>

                        {isEpic && (
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="px-1.5 py-0.2 rounded-md bg-purple-100/80 text-purple-700 font-bold text-[9px]">
                              {row.childCount} {row.childCount === 1 ? 'item' : 'items'}
                            </span>
                            {!readOnly && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCreateParentItem(item);
                                  setCreateInitialType('Story');
                                  setIsCreateIssueOpen(true);
                                }}
                                title="Add child Story or Bug to this Epic"
                                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-purple-200 rounded text-purple-700 transition-opacity cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Column 2: Assignee (neatly centered in fixed-width column) */}
                      <div className="w-16 flex items-center justify-center shrink-0">
                        {primaryAssignee ? (
                          <div
                            className="w-6 h-6 rounded-full bg-purple-100 hover:bg-purple-200 text-purple-700 font-bold text-[10px] flex items-center justify-center shrink-0 border border-purple-200 shadow-2xs transition-colors"
                            title={`Assigned to: ${primaryAssignee.name || primaryAssignee.email}`}
                          >
                            {(primaryAssignee.name || primaryAssignee.email || 'U').charAt(0).toUpperCase()}
                          </div>
                        ) : (
                          <div
                            className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0 text-[10px] border border-slate-200/60"
                            title="Unassigned"
                          >
                            <User className="w-3 h-3" />
                          </div>
                        )}
                      </div>

                      {/* Column 3: Status (neatly centered in fixed-width column) */}
                      <div className="w-24 flex items-center justify-center shrink-0">
                        <span className={`w-full text-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border truncate ${statusMeta.badgeClass}`}>
                          {statusMeta.label}
                        </span>
                      </div>

                      {/* Column 4: Story Points (right-aligned in fixed-width column) */}
                      <div className="w-14 text-right pr-2 font-mono text-[11px] text-slate-600 font-medium shrink-0">
                        {isEpic ? (
                          <span title={`Completed: ${item.completedStoryPoints || 0} / Total: ${item.totalStoryPoints || 0} SP`}>
                            {item.completedStoryPoints ?? 0}/{item.totalStoryPoints ?? 0}
                          </span>
                        ) : (
                          <span>{item.story_points ?? 0} SP</span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {scheduledRows.length === 0 && (
                  <div className="p-8 text-center text-slate-400">
                    <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-700">No scheduled deliverables found</p>
                    <p className="text-[11px] text-slate-400 mt-1">Configure dates for work items to view them on the roadmap</p>
                  </div>
                )}
              </div>
            </div>

            {/* ----------------- RIGHT PANE: HORIZONTALLY SCROLLABLE GANTT CANVAS ----------------- */}
            <div className="flex-1 overflow-x-auto min-w-0" ref={timelineScrollRef}>
              <div className="min-w-[700px] w-full flex flex-col">
                {/* Horizontal Time Columns Header (Weeks or Months) */}
                <div className="h-12 border-b border-slate-200 bg-slate-100/70 text-xs font-bold text-slate-700">
                  <div 
                    className="grid divide-x divide-slate-200/80 h-full"
                    style={{ gridTemplateColumns: `repeat(${timeColumns.length}, minmax(${zoomLevel === 'months' ? '160px' : '130px'}, 1fr))` }}
                  >
                    {timeColumns.map((col) => (
                      <div
                        key={col.id}
                        className={`py-1.5 px-2 text-center flex flex-col justify-center transition-colors ${
                          col.isActive ? 'bg-purple-100/50 border-t-2 border-t-purple-600' : 'bg-slate-50/40'
                        }`}
                      >
                        <span className={`text-[11px] font-bold block ${col.isActive ? 'text-purple-800' : 'text-slate-800'}`}>
                          {col.title}
                        </span>
                        <div className="text-[9px] text-slate-400 font-normal truncate">
                          {col.subtitle}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Timeline Canvas Body */}
                <div className="relative divide-y divide-slate-100 text-xs flex-1">
                  {/* Background Grid Lines matching the time columns */}
                  <div 
                    className="absolute inset-0 grid divide-x divide-slate-100 pointer-events-none"
                    style={{ gridTemplateColumns: `repeat(${timeColumns.length}, minmax(${zoomLevel === 'months' ? '160px' : '130px'}, 1fr))` }}
                  >
                    {timeColumns.map((col) => (
                      <div key={`bg-${col.id}`} className={col.isActive ? 'bg-purple-50/15' : ''} />
                    ))}
                  </div>

                  {/* Vertical "Today" Marker Line */}
                  {todayPositionPercent !== null && (
                    <div
                      className="absolute top-0 bottom-0 z-20 pointer-events-none"
                      style={{ left: `${todayPositionPercent}%` }}
                    >
                      <div className="w-0.5 h-full bg-purple-500 shadow-xs relative">
                        <div className="absolute -top-3 -left-3.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-600 text-white shadow-xs">
                          Today
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Render Scheduled Deliverable Rows */}
                  {scheduledRows.map((row) => {
                    const item = row.item;
                    const isEpic = row.isEpic;
                    const statusMeta = STATUS_CONFIG[item.status] || STATUS_CONFIG.TODO;

                    const itemStartMs = row.startDate ? row.startDate.getTime() : null;
                    const itemDueMs = row.dueDate ? row.dueDate.getTime() : null;

                    // Bar position calculations
                    let leftPercent = 0;
                    let widthPercent = 0;
                    let isSingleMilestone = false;

                    if (itemStartMs && itemDueMs) {
                      leftPercent = Math.max(0, Math.min(96, ((itemStartMs - timelineStartMs) / totalDurationMs) * 100));
                      const rawWidth = ((Math.max(itemDueMs, itemStartMs + 86400000) - itemStartMs) / totalDurationMs) * 100;
                      widthPercent = Math.max(3.5, Math.min(100 - leftPercent, rawWidth));
                    } else if (itemDueMs) {
                      // Due date only -> milestone flag at dueDate
                      leftPercent = Math.max(0, Math.min(97, ((itemDueMs - timelineStartMs) / totalDurationMs) * 100));
                      widthPercent = 3;
                      isSingleMilestone = true;
                    } else if (itemStartMs) {
                      // Start date only -> milestone kickoff at startDate
                      leftPercent = Math.max(0, Math.min(97, ((itemStartMs - timelineStartMs) / totalDurationMs) * 100));
                      widthPercent = 3;
                      isSingleMilestone = true;
                    }

                    const startLabel = row.startDate ? row.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No start';
                    const dueLabel = row.dueDate ? row.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No due';
                    const dateTooltip = `${startLabel} – ${dueLabel}${row.isDerivedStart || row.isDerivedDue ? ' (Derived from child deliverables)' : ''}`;

                    return (
                      <div
                        key={item.id}
                        className="h-12 relative flex items-center px-2 hover:bg-purple-50/20 transition-colors group"
                      >
                        {isSingleMilestone ? (
                          // Single Date Milestone Marker
                          <button
                            type="button"
                            onClick={() => setSelectedTask(item)}
                            style={{ left: `${leftPercent}%` }}
                            title={`${item.title} • Target: ${dueLabel} • Click to view`}
                            className="absolute z-10 cursor-pointer flex items-center gap-1 -translate-x-1/2 group/mile"
                          >
                            <div className="w-5 h-5 rounded-md bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center shadow-xs rotate-45 border-2 border-white">
                              <Flag className="w-2.5 h-2.5 -rotate-45" />
                            </div>
                            <span className="text-[10px] font-semibold text-slate-700 bg-white/90 border border-slate-200 px-1.5 py-0.5 rounded shadow-2xs whitespace-nowrap ml-1 opacity-80 group-hover/mile:opacity-100">
                              {dueLabel}
                            </span>
                          </button>
                        ) : (
                          // Range Gantt Duration Bar
                          <button
                            type="button"
                            onClick={() => setSelectedTask(item)}
                            style={{
                              marginLeft: `${leftPercent}%`,
                              width: `${widthPercent}%`,
                              minWidth: '120px',
                            }}
                            title={`${item.title} (${dateTooltip}) • Progress: ${row.progress}%`}
                            className={`relative z-10 cursor-pointer h-7 rounded-lg px-2 flex items-center justify-between shadow-xs transition-all duration-150 border select-none group/bar overflow-hidden ${
                              isEpic
                                ? 'bg-purple-700 border-purple-500/40 text-white shadow-purple-200/60 ring-1 ring-purple-400/50'
                                : `${statusMeta.barClass} border-black/10`
                            }`}
                          >
                            {/* Inner Progress Bar Fill */}
                            <div
                              className="absolute left-0 top-0 bottom-0 bg-white/20 pointer-events-none transition-all duration-300"
                              style={{ width: `${Math.max(0, Math.min(100, row.progress))}%` }}
                            />

                            {/* Bar Label (Title & Progress) */}
                            <div className="relative z-10 flex items-center gap-1.5 truncate pr-1">
                              {isEpic && (
                                <Layers className="w-3 h-3 text-purple-200 shrink-0" />
                              )}
                              <span className="font-semibold text-[11px] truncate text-white">
                                {item.title}
                              </span>
                            </div>

                            {/* Right Progress % or Date */}
                            <div className="relative z-10 flex items-center gap-1 text-[10px] shrink-0 font-mono text-white/90 pl-1">
                              {row.isDerivedStart || row.isDerivedDue ? (
                                <span className="text-[8px] bg-black/25 px-1 py-0.2 rounded font-sans uppercase tracking-wider" title="Timeline derived from child deliverable dates">
                                  Derived
                                </span>
                              ) : null}
                              <span>{row.progress}%</span>
                            </div>
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {scheduledRows.length === 0 && (
                    <div className="p-14 text-center text-slate-400">
                      <Calendar className="w-10 h-10 text-purple-300 mx-auto mb-2" />
                      <p className="text-sm font-bold text-slate-800">No Deliverables Scheduled on Timeline</p>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                        Deliverables exist in this project but do not have calendar dates configured. Set start and due dates below to plot them on the roadmap.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* -------------------------------------------------------------
            SECTION 3B: SECONDARY SPRINT / CYCLE GANTT TIMELINE
            (Retained for full sprint cycle scheduling visibility)
            ------------------------------------------------------------- */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
          <div className="p-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-purple-600" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                {isKanban ? 'Planning Cycles Schedule' : 'Sprint Planning Iterations Schedule'}
              </h3>
            </div>
            <span className="text-[11px] text-slate-500">
              {sprints.length} {isKanban ? 'cycles configured' : 'sprints configured'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[840px] w-full">
              {/* Weekly Header for Cycles */}
              <div className="border-b border-slate-200 bg-slate-50/90 text-xs font-bold text-slate-700">
                <div 
                  className="grid divide-x divide-slate-100"
                  style={{ gridTemplateColumns: `repeat(${timeColumns.length}, minmax(130px, 1fr))` }}
                >
                  {timeColumns.map((col) => (
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

              {/* Sprints Gantt Rows */}
              <div className="relative divide-y divide-slate-100 text-xs">
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

                {sprints.filter((s) => s.start_date && s.end_date).map((sprint) => {
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

                  return (
                    <div 
                      key={sprint.id} 
                      className="relative py-4 px-2 hover:bg-slate-50/40 transition-colors group min-h-[64px] flex items-center"
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedSprintDetails(sprint)}
                        onKeyDown={(e) => {
                          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            setSelectedSprintDetails(sprint);
                          }
                        }}
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
                        <div className="flex items-center gap-1.5 shrink-0 min-w-0 pr-1 max-w-[130px]">
                          {isActive && (
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                          )}
                          <span className="font-bold text-xs truncate tracking-tight text-white">
                            {sprint.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                          <span className="font-medium text-white/90 truncate shrink-0 text-[10px]">
                            {dateDisplay}
                          </span>

                          <div className="flex items-center gap-1 shrink-0 ml-1">
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

                {sprints.filter((s) => s.start_date && s.end_date).length === 0 && (
                  <div className="p-10 text-center text-slate-400">
                    <p className="text-xs font-semibold text-slate-700">No scheduled iterations found</p>
                    <p className="text-[11px] text-slate-400 mt-1">Configure start and end dates to display iterations on the timeline</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          SECTION 4: COLLAPSIBLE UNSCHEDULED DELIVERABLES TRAY
          (Displays work items that lack start and due dates without fabricating fake dates)
          ------------------------------------------------------------- */}
      {unscheduledRows.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Unscheduled Deliverables
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200/80">
                {unscheduledRows.length} {unscheduledRows.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <p className="text-xs text-slate-400 hidden sm:block">
                Dates not set. Assign start and due dates to plot deliverables on the roadmap timeline.
              </p>
              <button
                type="button"
                onClick={() => setShowUnscheduled(!showUnscheduled)}
                className="text-xs font-semibold text-purple-700 hover:text-purple-800 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>{showUnscheduled ? 'Hide' : 'Show'}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showUnscheduled ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          {showUnscheduled && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
              {unscheduledRows.map((row) => {
                const item = row.item;
                const typeMeta = TYPE_CONFIG[item.type] || TYPE_CONFIG.TASK;
                const statusMeta = STATUS_CONFIG[item.status] || STATUS_CONFIG.TODO;
                const Icon = typeMeta.icon;
                const primaryAssignee = item.assignees?.[0] || item.assignee;

                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedTask(item)}
                    onKeyDown={(e) => {
                      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        setSelectedTask(item);
                      }
                    }}
                    className="p-3 rounded-xl border border-dashed border-slate-300 hover:border-purple-400 bg-slate-50/50 hover:bg-purple-50/20 transition-all flex flex-col justify-between gap-2.5 cursor-pointer group"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`p-1 rounded-md border shrink-0 ${typeMeta.color}`}>
                            <Icon className="w-3 h-3" />
                          </span>
                          <span className="font-bold text-xs text-slate-900 truncate group-hover:text-purple-700 transition-colors">
                            {item.title}
                          </span>
                        </div>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border shrink-0 ${statusMeta.badgeClass}`}>
                          {statusMeta.label}
                        </span>
                      </div>

                      {item.description && (
                        <p className="text-[11px] text-slate-500 line-clamp-1">
                          {item.description}
                        </p>
                      )}

                      {/* Parent Epic / Hierarchy indicator */}
                      {row.parentEpicId && (
                        <div className="flex items-center gap-1 text-[10px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 w-fit">
                          <Layers className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate max-w-[140px] font-medium">
                            {item.parent?.title || 'Parent Epic'}
                          </span>
                        </div>
                      )}
                      {row.isEpic && (
                        <div className="flex items-center gap-1 text-[10px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 w-fit font-semibold">
                          <Layers className="w-2.5 h-2.5 shrink-0" />
                          <span>Epic ({row.childCount} {row.childCount === 1 ? 'child' : 'children'})</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-[11px]">
                      <div className="flex items-center gap-2">
                        {primaryAssignee ? (
                          <span className="text-slate-600 font-medium truncate max-w-[100px]">
                            {primaryAssignee.name || primaryAssignee.email}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-500 font-mono font-medium">{item.story_points ?? 0} SP</span>
                      </div>

                      {!readOnly && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTask(item);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white hover:bg-purple-50 border border-slate-200 hover:border-purple-300 text-purple-700 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                        >
                          <Calendar className="w-3 h-3 text-purple-600" />
                          <span>Set Dates</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------------------
          MODALS
          ------------------------------------------------------------- */}
      {/* 1. Work Item Details & Scheduling Modal */}
      {selectedTask && (
        <TaskDetailModal
          isOpen={Boolean(selectedTask)}
          onClose={() => setSelectedTask(null)}
          task={selectedTask}
          onTaskUpdated={(updated) => {
            onToast?.(`Deliverable "${updated.title}" updated successfully`);
            setWorkItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
            setSelectedTask(updated);
          }}
          onTaskDeleted={(deletedId) => {
            onToast?.('Deliverable deleted successfully');
            setWorkItems((prev) => prev.filter((item) => item.id !== deletedId));
            setSelectedTask(null);
          }}
          onToast={onToast}
          hideAssignees={false}
        />
      )}

      {/* 2. Create Issue / Deliverable Modal */}
      <CreateIssueModal
        isOpen={isCreateIssueOpen}
        onClose={() => {
          setIsCreateIssueOpen(false);
          setCreateParentItem(null);
          setCreateInitialType('Story');
        }}
        projectId={projectId}
        projectName={project?.name || ''}
        epics={hierarchicalTree.epics}
        stories={hierarchicalTree.standaloneStories}
        workItems={workItems}
        sprints={sprints}
        members={members}
        isKanban={isKanban}
        parentItem={createParentItem}
        initialIssueType={createInitialType}
        onCreateIssue={handleCreateIssue}
        onCreateEpic={handleCreateEpic}
      />

      {/* SPRINT MODALS (Scrum only) */}
      {!isKanban && (
        <>
          <CreateSprintModal
            isOpen={isCreateSprintOpen}
            onClose={() => setIsCreateSprintOpen(false)}
            projectId={projectId}
            projectName={project?.name || ''}
            existingSprints={sprints}
            isKanban={false}
            onSuccess={(created) => {
              onToast?.(`Sprint "${created?.name || 'New'}" created successfully`);
              setIsCreateSprintOpen(false);
              loadData(true);
            }}
          />

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

          <EditSprintModal
            isOpen={Boolean(editingSprint)}
            onClose={() => setEditingSprint(null)}
            projectId={projectId}
            projectName={project?.name || ''}
            sprint={editingSprint}
            allSprints={sprints}
            onSuccess={(updated) => {
              onToast?.(`Sprint "${updated?.name || 'Sprint'}" updated successfully`);
              setEditingSprint(null);
              loadData(true);
            }}
            onDelete={(deleted) => {
              onToast?.(`Sprint "${deleted?.name || 'Sprint'}" deleted successfully`);
              setEditingSprint(null);
              loadData(true);
            }}
          />
        </>
      )}
    </div>
  );
}
