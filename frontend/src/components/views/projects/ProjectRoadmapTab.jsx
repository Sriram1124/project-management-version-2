import React, { useState, useEffect, useCallback, useMemo, useRef, useDeferredValue } from 'react';
import { 
  Loader2, 
  ListTree,
  Calendar,
  Layers,
  Bookmark,
  AlertCircle,
  CheckSquare
} from 'lucide-react';
import { workItemsService } from '../../../services/workItems.service';
import { sprintsService } from '../../../services/sprints.service';
import { projectsService } from '../../../services/projects.service';
import TaskDetailModal from '../../kanban/TaskDetailModal';
import CreateIssueModal from '../../backlog/CreateIssueModal';
import CreateSprintModal from '../../modals/CreateSprintModal';
import EditSprintModal from '../../modals/EditSprintModal';
import SprintDetailsModal from '../../modals/SprintDetailsModal';

import { 
  getItemSortTimestamp, 
  computeTimelineRange, 
  computeTimelineGeometryMap 
} from './roadmapUtils';
import { useRoadmapVirtualizer } from './useRoadmapVirtualizer';
import { RoadmapVirtualRow } from './RoadmapRowComponents';
import { RoadmapHeaderKPIs } from './RoadmapHeaderKPIs';
import { RoadmapToolbar } from './RoadmapToolbar';
import { RoadmapUnscheduledTray } from './RoadmapUnscheduledTray';
import { RoadmapSprintsSchedule } from './RoadmapSprintsSchedule';

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

  // Filters with React 18 Deferred Value for instant typing response
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);

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

  // Layout references for unified scroll container
  const tableContainerRef = useRef(null);

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

      // Auto-expand all Epics by default on initial load
      const epicIds = (itemsRes || []).filter((i) => i.type === 'EPIC').map((e) => e.id);
      setExpandedEpics((prev) => (prev.size === 0 ? new Set(epicIds) : prev));
    } catch (err) {
      console.error('Failed to load roadmap data:', err);
      onToast?.('Failed to load project roadmap data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId, isKanban, onToast]);

  useEffect(() => {
    void loadData();
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
      void loadData(true);
    };
    window.addEventListener('work-items-updated', handleUpdate);
    return () => window.removeEventListener('work-items-updated', handleUpdate);
  }, [loadData]);

  // Stable toggle Epic expand / collapse
  const toggleEpicExpand = useCallback((epicId) => {
    setExpandedEpics((prev) => {
      const next = new Set(prev);
      if (next.has(epicId)) {
        next.delete(epicId);
      } else {
        next.add(epicId);
      }
      return next;
    });
  }, []);

  const expandAllEpics = useCallback(() => {
    const epicIds = workItems.filter((i) => i.type === 'EPIC').map((e) => e.id);
    setExpandedEpics(new Set(epicIds));
  }, [workItems]);

  const collapseAllEpics = useCallback(() => {
    setExpandedEpics(new Set());
  }, []);

  // Stable modal callbacks
  const handleSelectTask = useCallback((item) => {
    setSelectedTask(item);
  }, []);

  const handleAddChild = useCallback((epicItem) => {
    setCreateParentItem(epicItem);
    setCreateInitialType('Story');
    setIsCreateIssueOpen(true);
  }, []);

  // Handle Deliverable Creation (Story, Task, Bug)
  const handleCreateIssue = useCallback(async (payload) => {
    try {
      const created = await workItemsService.createWorkItem({
        ...payload,
        project_id: projectId,
      });

      if (payload.parent_id) {
        setExpandedEpics((prev) => new Set([...prev, payload.parent_id]));
      }

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
  }, [projectId, typeFilter, statusFilter, priorityFilter, assigneeFilter, search, onToast, loadData]);

  // Handle Epic Creation
  const handleCreateEpic = useCallback(async (payload) => {
    try {
      const created = await workItemsService.createWorkItem({
        ...payload,
        project_id: projectId,
        type: 'EPIC',
      });

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
  }, [projectId, typeFilter, statusFilter, priorityFilter, search, onToast, loadData]);

  // -------------------------------------------------------------
  // CHRONOLOGICAL SPRINT & TIMELINE ORDERING MAP
  // -------------------------------------------------------------
  const sprintOrderMap = useMemo(() => {
    const map = new Map();
    const sorted = [...sprints].sort((a, b) => {
      const aStart = a.start_date ? Date.parse(a.start_date) : 0;
      const bStart = b.start_date ? Date.parse(b.start_date) : 0;
      if (aStart && bStart) return aStart - bStart;
      if (aStart) return -1;
      if (bStart) return 1;
      return (a.created_at ? Date.parse(a.created_at) : 0) - (b.created_at ? Date.parse(b.created_at) : 0);
    });

    sorted.forEach((s, idx) => {
      map.set(s.id, {
        orderIndex: idx,
        startTime: s.start_date ? Date.parse(s.start_date) : null,
      });
    });
    return map;
  }, [sprints]);

  // -------------------------------------------------------------
  // HIERARCHY & DELIVERABLE DERIVATION
  // -------------------------------------------------------------
  const hierarchicalTree = useMemo(() => {
    const epics = [];
    const standaloneStories = [];
    const standaloneTasks = [];

    // Group items by parent_id
    const childrenMap = new Map();
    for (let i = 0; i < workItems.length; i++) {
      const item = workItems[i];
      if (item.parent_id) {
        let list = childrenMap.get(item.parent_id);
        if (!list) {
          list = [];
          childrenMap.set(item.parent_id, list);
        }
        list.push(item);
      }
    }

    for (let i = 0; i < workItems.length; i++) {
      const item = workItems[i];
      if (item.type === 'EPIC') {
        const directChildren = childrenMap.get(item.id) || [];
        const enrichedChildren = directChildren.map((child) => {
          const grandChildren = childrenMap.get(child.id) || [];
          grandChildren.sort((a, b) => 
            getItemSortTimestamp(a, sprintOrderMap) - getItemSortTimestamp(b, sprintOrderMap)
          );
          return {
            ...child,
            children: grandChildren,
            sortTime: getItemSortTimestamp(child, sprintOrderMap),
            startMs: child.start_date ? Date.parse(child.start_date) : null,
            dueMs: child.due_date ? Date.parse(child.due_date) : null,
          };
        });

        enrichedChildren.sort((a, b) => a.sortTime - b.sortTime);

        let derivedStartMs = item.start_date ? Date.parse(item.start_date) : null;
        let derivedDueMs = item.due_date ? Date.parse(item.due_date) : null;
        let isDerivedStart = !item.start_date;
        let isDerivedDue = !item.due_date;

        const allDescendants = [];
        for (let c = 0; c < enrichedChildren.length; c++) {
          const child = enrichedChildren[c];
          allDescendants.push(child);
          if (child.children) {
            allDescendants.push(...child.children);
          }
        }

        for (let d = 0; d < allDescendants.length; d++) {
          const desc = allDescendants[d];
          if (desc.start_date) {
            const dStart = Date.parse(desc.start_date);
            if (!derivedStartMs || dStart < derivedStartMs) {
              derivedStartMs = dStart;
              isDerivedStart = true;
            }
          }
          if (desc.due_date) {
            const dDue = Date.parse(desc.due_date);
            if (!derivedDueMs || dDue > derivedDueMs) {
              derivedDueMs = dDue;
              isDerivedDue = true;
            }
          }
        }

        const leafItems = allDescendants.filter((d) => !d.children || d.children.length === 0);
        let totalStoryPoints = 0;
        let completedStoryPoints = 0;
        for (let l = 0; l < leafItems.length; l++) {
          const sp = Number(leafItems[l].story_points) || 0;
          totalStoryPoints += sp;
          if (leafItems[l].status === 'COMPLETED') {
            completedStoryPoints += sp;
          }
        }

        let progressPercent = 0;
        if (totalStoryPoints > 0) {
          progressPercent = Math.round((completedStoryPoints / totalStoryPoints) * 100);
        } else if (allDescendants.length > 0) {
          const completedCount = allDescendants.filter((d) => d.status === 'COMPLETED').length;
          progressPercent = Math.round((completedCount / allDescendants.length) * 100);
        } else if (item.status === 'COMPLETED') {
          progressPercent = 100;
        }

        const epicSortTime = derivedStartMs
          ? derivedStartMs
          : enrichedChildren.length > 0
          ? Math.min(...enrichedChildren.map((c) => c.sortTime))
          : getItemSortTimestamp(item, sprintOrderMap);

        epics.push({
          ...item,
          children: enrichedChildren,
          allDescendants,
          startMs: derivedStartMs,
          dueMs: derivedDueMs,
          startDate: derivedStartMs ? new Date(derivedStartMs) : null,
          dueDate: derivedDueMs ? new Date(derivedDueMs) : null,
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
          subChildren.sort((a, b) => 
            getItemSortTimestamp(a, sprintOrderMap) - getItemSortTimestamp(b, sprintOrderMap)
          );
          standaloneStories.push({
            ...item,
            children: subChildren,
            startMs: item.start_date ? Date.parse(item.start_date) : null,
            dueMs: item.due_date ? Date.parse(item.due_date) : null,
            progressPercent: item.status === 'COMPLETED' ? 100 : (item.status === 'IN_PROGRESS' || item.status === 'IN_REVIEW' ? 50 : 0),
            sortTime: getItemSortTimestamp(item, sprintOrderMap),
          });
        } else if (item.type === 'TASK') {
          const subChildren = childrenMap.get(item.id) || [];
          subChildren.sort((a, b) => 
            getItemSortTimestamp(a, sprintOrderMap) - getItemSortTimestamp(b, sprintOrderMap)
          );
          standaloneTasks.push({
            ...item,
            children: subChildren,
            startMs: item.start_date ? Date.parse(item.start_date) : null,
            dueMs: item.due_date ? Date.parse(item.due_date) : null,
            progressPercent: item.status === 'COMPLETED' ? 100 : (item.status === 'IN_PROGRESS' || item.status === 'IN_REVIEW' ? 50 : 0),
            sortTime: getItemSortTimestamp(item, sprintOrderMap),
          });
        }
      }
    }

    epics.sort((a, b) => a.sortTime - b.sortTime);
    standaloneStories.sort((a, b) => a.sortTime - b.sortTime);
    standaloneTasks.sort((a, b) => a.sortTime - b.sortTime);

    return { epics, standaloneStories, standaloneTasks };
  }, [workItems, sprintOrderMap]);

  // -------------------------------------------------------------
  // FLATTENED DELIVERABLE ROWS (Filtering with deferredSearch)
  // -------------------------------------------------------------
  const visibleDeliverableRows = useMemo(() => {
    const rows = [];
    const searchFilter = deferredSearch.trim().toLowerCase();

    const matchesFilters = (item) => {
      if (searchFilter) {
        const matchTitle = (item.title || '').toLowerCase().includes(searchFilter);
        const matchDesc = (item.description || '').toLowerCase().includes(searchFilter);
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

    const rootItems = [
      ...hierarchicalTree.epics.map((e) => ({ ...e, isEpicRoot: true })),
      ...hierarchicalTree.standaloneStories.map((s) => ({ ...s, isStoryRoot: true })),
      ...hierarchicalTree.standaloneTasks.map((t) => ({ ...t, isTaskRoot: true })),
    ];
    rootItems.sort((a, b) => (a.sortTime || 0) - (b.sortTime || 0));

    for (let r = 0; r < rootItems.length; r++) {
      const root = rootItems[r];
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
            startMs: epic.startMs,
            dueMs: epic.dueMs,
            startDate: epic.startDate,
            dueDate: epic.dueDate,
            isDerivedStart: epic.isDerivedStart,
            isDerivedDue: epic.isDerivedDue,
            progress: epic.progressPercent,
          });

          if (isExpanded) {
            const children = epic.children || [];
            for (let c = 0; c < children.length; c++) {
              const child = children[c];
              if (matchesFilters(child) || epicMatches) {
                const childProgress = child.status === 'COMPLETED' ? 100 : (child.status === 'IN_PROGRESS' || child.status === 'IN_REVIEW' ? 50 : 0);

                rows.push({
                  item: child,
                  level: 1,
                  parentEpicId: epic.id,
                  hasChildren: (child.children || []).length > 0,
                  childCount: (child.children || []).length,
                  startMs: child.startMs,
                  dueMs: child.dueMs,
                  startDate: child.startMs ? new Date(child.startMs) : null,
                  dueDate: child.dueMs ? new Date(child.dueMs) : null,
                  isDerivedStart: false,
                  isDerivedDue: false,
                  progress: childProgress,
                });

                const grandChildren = child.children || [];
                for (let g = 0; g < grandChildren.length; g++) {
                  const grandChild = grandChildren[g];
                  if (matchesFilters(grandChild) || matchesFilters(child)) {
                    const gStartMs = grandChild.start_date ? Date.parse(grandChild.start_date) : null;
                    const gDueMs = grandChild.due_date ? Date.parse(grandChild.due_date) : null;

                    rows.push({
                      item: grandChild,
                      level: 2,
                      parentStoryId: child.id,
                      hasChildren: false,
                      startMs: gStartMs,
                      dueMs: gDueMs,
                      startDate: gStartMs ? new Date(gStartMs) : null,
                      dueDate: gDueMs ? new Date(gDueMs) : null,
                      isDerivedStart: false,
                      isDerivedDue: false,
                      progress: grandChild.status === 'COMPLETED' ? 100 : 0,
                    });
                  }
                }
              }
            }
          }
        }
      } else if (root.isStoryRoot) {
        const item = root;
        if (matchesFilters(item) || (item.children || []).some(matchesFilters)) {
          rows.push({
            item,
            level: 0,
            isStandalone: true,
            hasChildren: (item.children || []).length > 0,
            childCount: (item.children || []).length,
            startMs: item.startMs,
            dueMs: item.dueMs,
            startDate: item.startMs ? new Date(item.startMs) : null,
            dueDate: item.dueMs ? new Date(item.dueMs) : null,
            isDerivedStart: false,
            isDerivedDue: false,
            progress: item.progressPercent,
          });

          const children = item.children || [];
          for (let c = 0; c < children.length; c++) {
            const child = children[c];
            if (matchesFilters(child) || matchesFilters(item)) {
              const cStartMs = child.start_date ? Date.parse(child.start_date) : null;
              const cDueMs = child.due_date ? Date.parse(child.due_date) : null;

              rows.push({
                item: child,
                level: 1,
                parentStoryId: item.id,
                hasChildren: false,
                startMs: cStartMs,
                dueMs: cDueMs,
                startDate: cStartMs ? new Date(cStartMs) : null,
                dueDate: cDueMs ? new Date(cDueMs) : null,
                isDerivedStart: false,
                isDerivedDue: false,
                progress: child.status === 'COMPLETED' ? 100 : 0,
              });
            }
          }
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
            startMs: item.startMs,
            dueMs: item.dueMs,
            startDate: item.startMs ? new Date(item.startMs) : null,
            dueDate: item.dueMs ? new Date(item.dueMs) : null,
            isDerivedStart: false,
            isDerivedDue: false,
            progress: item.progressPercent,
          });
        }
      }
    }

    return rows;
  }, [hierarchicalTree, deferredSearch, typeFilter, statusFilter, priorityFilter, assigneeFilter, expandedEpics]);

  const scheduledRows = useMemo(() => {
    return visibleDeliverableRows.filter((r) => r.startMs || r.dueMs);
  }, [visibleDeliverableRows]);

  const unscheduledRows = useMemo(() => {
    return visibleDeliverableRows.filter((r) => !r.startMs && !r.dueMs);
  }, [visibleDeliverableRows]);

  // -------------------------------------------------------------
  // DYNAMIC GANTT TIMELINE RANGE & COLUMNS
  // -------------------------------------------------------------
  const { timeColumns, timelineStartMs, timelineEndMs, totalDurationMs, columnWidth } = useMemo(() => {
    return computeTimelineRange(scheduledRows, sprints, zoomLevel);
  }, [scheduledRows, sprints, zoomLevel]);

  const totalTimelineWidth = useMemo(() => {
    return timeColumns.length * columnWidth;
  }, [timeColumns.length, columnWidth]);

  // Precomputed geometry map for timeline bars: O(N) once per timeline range
  const timelineGeometryMap = useMemo(() => {
    return computeTimelineGeometryMap(scheduledRows, timelineStartMs, totalDurationMs);
  }, [scheduledRows, timelineStartMs, totalDurationMs]);

  // Today marker percentage position
  const todayPositionPercent = useMemo(() => {
    const nowMs = Date.now();
    if (nowMs < timelineStartMs || nowMs > timelineEndMs) return null;
    return Math.max(0, Math.min(100, ((nowMs - timelineStartMs) / totalDurationMs) * 100));
  }, [timelineStartMs, timelineEndMs, totalDurationMs]);

  // High-performance virtual scroll hook
  const virtualizer = useRoadmapVirtualizer({
    itemCount: scheduledRows.length,
    itemHeight: 48,
    overscan: 6,
    scrollContainerRef: tableContainerRef,
    enabledThreshold: 15,
  });

  // Top KPI summary metrics
  const metrics = useMemo(() => {
    const total = workItems.length;
    let completed = 0;
    let inProgress = 0;
    let overdueOrAtRisk = 0;
    let totalPoints = 0;
    let completedPoints = 0;

    const now = Date.now();

    for (let i = 0; i < workItems.length; i++) {
      const item = workItems[i];
      const sp = Number(item.story_points) || 0;
      totalPoints += sp;

      if (item.status === 'COMPLETED') {
        completed++;
        completedPoints += sp;
      } else if (item.status === 'IN_PROGRESS' || item.status === 'IN_REVIEW') {
        inProgress++;
      }

      const isOverdue = item.due_date && Date.parse(item.due_date) < now && item.status !== 'COMPLETED';
      const isBlocked = item.status === 'BLOCKED';
      if (isOverdue || isBlocked) {
        overdueOrAtRisk++;
      }
    }

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

  const hasActiveFilters = Boolean(
    search.trim() ||
    typeFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    priorityFilter !== 'ALL' ||
    assigneeFilter !== 'ALL'
  );

  const handleClearFilters = useCallback(() => {
    setSearch('');
    setTypeFilter('ALL');
    setStatusFilter('ALL');
    setPriorityFilter('ALL');
    setAssigneeFilter('ALL');
  }, []);

  const handleOpenCreateModal = useCallback(() => {
    if (!isKanban && viewMode === 'cycles') {
      setIsCreateSprintOpen(true);
    } else {
      setCreateParentItem(null);
      setCreateInitialType('Story');
      setIsCreateIssueOpen(true);
    }
  }, [isKanban, viewMode]);

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
      {/* SECTION 1: HEADER & KEY PERFORMANCE METRICS */}
      <RoadmapHeaderKPIs
        project={project}
        isKanban={isKanban}
        refreshing={refreshing}
        metrics={metrics}
      />

      {/* SECTION 2: TOOLBAR WITH FILTERS, SEARCH, ZOOM & VIEWS */}
      <RoadmapToolbar
        search={search}
        onSearchChange={setSearch}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        zoomLevel={zoomLevel}
        onZoomLevelChange={setZoomLevel}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        priorityFilter={priorityFilter}
        onPriorityFilterChange={setPriorityFilter}
        assigneeFilter={assigneeFilter}
        onAssigneeFilterChange={setAssigneeFilter}
        members={members}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={handleClearFilters}
        isKanban={isKanban}
        readOnly={readOnly}
        onOpenCreate={handleOpenCreateModal}
        hasEpics={hierarchicalTree.epics.length > 0}
        onExpandAll={expandAllEpics}
        onCollapseAll={collapseAllEpics}
      />

      {/* SECTION 3: PRIMARY DELIVERABLE ROADMAP GANTT CHART */}
      {viewMode === 'deliverables' ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
          {/* Synchronized Unified Dual-Pane Scroll Table with Virtualization & Sticky Headers */}
          <div 
            ref={tableContainerRef}
            className="overflow-auto border-0 bg-white max-h-[calc(100vh-270px)] min-h-[500px] relative select-none"
            style={{ contain: 'layout paint' }}
          >
            <div 
              style={{ 
                minWidth: `${480 + totalTimelineWidth}px`, 
                height: `${Math.max(500, virtualizer.totalHeight + 48)}px`, 
                position: 'relative' 
              }}
            >
              {/* STICKY HEADER ROW (h-12, sticky top-0, z-30) */}
              <div className="sticky top-0 z-30 h-12 flex border-b border-slate-200 bg-slate-100/95 backdrop-blur-xs">
                {/* STICKY TOP-LEFT CORNER CELL (sticky left-0 z-40) */}
                <div className="w-[480px] shrink-0 sticky left-0 z-40 bg-slate-100 border-r border-slate-200 px-3 flex items-center text-[11px] font-bold text-slate-700 shadow-xs">
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

                {/* HORIZONTAL TIME COLUMNS HEADER */}
                <div 
                  className="grid divide-x divide-slate-200/80 h-full flex-1"
                  style={{ 
                    width: `${totalTimelineWidth}px`,
                    gridTemplateColumns: `repeat(${timeColumns.length}, minmax(${columnWidth}px, 1fr))` 
                  }}
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

              {/* BACKGROUND GRID LINES & TODAY MARKER */}
              <div 
                className="absolute top-12 bottom-0 pointer-events-none"
                style={{ 
                  left: '480px', 
                  width: `${totalTimelineWidth}px` 
                }}
              >
                {/* Background column lines */}
                <div 
                  className="absolute inset-0 grid divide-x divide-slate-100 pointer-events-none"
                  style={{ gridTemplateColumns: `repeat(${timeColumns.length}, minmax(${columnWidth}px, 1fr))` }}
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
              </div>

              {/* VIRTUALIZED ROWS BODY */}
              <div 
                className="absolute top-12 left-0 right-0"
                style={{ height: `${virtualizer.totalHeight}px` }}
              >
                {scheduledRows.length === 0 ? (
                  <div className="p-14 text-center text-slate-400">
                    <Calendar className="w-10 h-10 text-purple-300 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-800">No Deliverables Scheduled on Timeline</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      Deliverables exist in this project but do not have calendar dates configured. Set start and due dates below to plot them on the roadmap.
                    </p>
                  </div>
                ) : (
                  virtualizer.virtualRows.map((vRow) => {
                    const row = scheduledRows[vRow.index];
                    if (!row) return null;
                    const item = row.item;
                    const typeMeta = TYPE_CONFIG[item.type] || TYPE_CONFIG.TASK;
                    const statusMeta = STATUS_CONFIG[item.status] || STATUS_CONFIG.TODO;
                    const geometry = timelineGeometryMap.get(item.id);

                    return (
                      <RoadmapVirtualRow
                        key={item.id}
                        row={row}
                        geometry={geometry}
                        typeMeta={typeMeta}
                        statusMeta={statusMeta}
                        top={vRow.start}
                        timelineWidth={totalTimelineWidth}
                        onSelectTask={handleSelectTask}
                        onToggleEpic={toggleEpicExpand}
                        onAddChild={handleAddChild}
                        readOnly={readOnly}
                      />
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* SECTION 3B: SECONDARY SPRINT / CYCLE GANTT TIMELINE */
        <RoadmapSprintsSchedule
          sprints={sprints}
          isKanban={isKanban}
          timeColumns={timeColumns}
          todayPositionPercent={todayPositionPercent}
          timelineStartMs={timelineStartMs}
          totalDurationMs={totalDurationMs}
          readOnly={readOnly}
          onSelectSprintDetails={setSelectedSprintDetails}
          onEditSprint={setEditingSprint}
          onOpenSprintBoard={onOpenSprintBoard}
        />
      )}

      {/* SECTION 4: COLLAPSIBLE UNSCHEDULED DELIVERABLES TRAY */}
      <RoadmapUnscheduledTray
        unscheduledRows={unscheduledRows}
        showUnscheduled={showUnscheduled}
        onToggleShow={() => setShowUnscheduled((prev) => !prev)}
        onSelectTask={handleSelectTask}
        readOnly={readOnly}
        typeConfig={TYPE_CONFIG}
        statusConfig={STATUS_CONFIG}
      />

      {/* MODALS */}
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
              void loadData(true);
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
              void loadData(true);
            }}
            onDelete={(deleted) => {
              onToast?.(`Sprint "${deleted?.name || 'Sprint'}" deleted successfully`);
              setEditingSprint(null);
              void loadData(true);
            }}
          />
        </>
      )}
    </div>
  );
}
