import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import BacklogToolbar from '../../backlog/BacklogToolbar';
import SprintSection from '../../backlog/SprintSection';
import CompleteSprintModal from '../../kanban/CompleteSprintModal';
import HierarchicalIssueTable from '../../backlog/HierarchicalIssueTable';
import IssueDetailDrawer from '../../backlog/IssueDetailDrawer';
import CreateIssueModal from '../../backlog/CreateIssueModal';
import CreateSprintModal from '../../modals/CreateSprintModal';
import { Loader2 } from 'lucide-react';
import { workItemsService } from '../../../services/workItems.service';
import { sprintsService } from '../../../services/sprints.service';
import { projectsService } from '../../../services/projects.service';
import { useAuth } from '../../../context/AuthContext';

export default function ProjectBacklogTab({ projectId, project = null, isKanbanProject = false, onToast, readOnly = false }) {
  const { user: authUser } = useAuth();
  const [currentProject, setCurrentProject] = useState(project);
  const isKanban = isKanbanProject || currentProject?.methodology === 'KANBAN';
  const [loading, setLoading] = useState(true);
  const [sprints, setSprints] = useState([]);
  const [workItems, setWorkItems] = useState([]);
  const [members, setMembers] = useState([]);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    hasLoadedRef.current = false;
  }, [projectId]);

  useEffect(() => {
    if (project) {
      setCurrentProject(project);
    } else if (projectId) {
      projectsService
        .getProjectById(projectId)
        .then((p) => setCurrentProject(p))
        .catch(() => {});
    }
  }, [projectId, project]);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState(null);
  const [selectedPriority, setSelectedPriority] = useState(null);
  const [selectedSprintId, setSelectedSprintId] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [groupBy, setGroupBy] = useState(isKanbanProject || project?.methodology === 'KANBAN' ? 'epic' : 'none'); // 'none' (Flat) | 'epic' (Backlog) | 'all_cycles' (All Cycles) | 'cycle:<id>' | 'no_cycle'


  // Quick Filters
  const [quickFilterMyIssues, setQuickFilterMyIssues] = useState(false);
  const [quickFilterOverdue, setQuickFilterOverdue] = useState(false);

  // Hierarchy Expansion State
  const [expandedIds, setExpandedIds] = useState(new Set());

  // Drawer & Modal States
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [completingSprint, setCompletingSprint] = useState(null);
  const [isCompleteSprintOpen, setIsCompleteSprintOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreateSprintOpen, setIsCreateSprintOpen] = useState(false);
  const [createInitialSprintId, setCreateInitialSprintId] = useState('backlog');
  const [createInitialType, setCreateInitialType] = useState('Story');
  const [createAllowedTypes, setCreateAllowedTypes] = useState(null);
  const [createParentItem, setCreateParentItem] = useState(null);

  // Fetch live data from backend
  const loadProjectData = useCallback(async (isSilent = false) => {
    if (!projectId) return;
    try {
      if (!isSilent && !hasLoadedRef.current) {
        setLoading(true);
      }
      const [sprintsList, itemsList, membersList] = await Promise.all([
        isKanban ? Promise.resolve([]) : sprintsService.getSprints(projectId).catch(() => []),
        workItemsService.listWorkItems({ project_id: projectId }).catch(() => []),
        projectsService.getMembers(projectId).catch(() => []),
      ]);

      const items = itemsList || [];
      setSprints(sprintsList || []);
      setWorkItems(items);
      setMembers(membersList || []);

      // Auto-expand all Epics and Stories only on initial load so user's expansions are preserved
      if (!hasLoadedRef.current) {
        setExpandedIds((prev) => {
          if (prev && prev.size > 0) return prev;
          const next = new Set(prev);
          items.forEach((item) => {
            if (item.type === 'EPIC' || item.type === 'STORY') {
              next.add(item.id);
            }
          });
          return next;
        });
        hasLoadedRef.current = true;
      }
    } catch (err) {
      console.error('Failed to load backlog data:', err);
      onToast?.('Failed to load project backlog data');
    } finally {
      setLoading(false);
    }
  }, [projectId, onToast]);

  useEffect(() => {
    loadProjectData();
  }, [loadProjectData]);

  useEffect(() => {
    const handleSync = (e) => {
      if (e?.detail?.action === 'update' && e.detail.item) {
        const updatedItem = e.detail.item;
        setWorkItems((prev) =>
          prev.map((item) => (item.id === e.detail.id ? { ...item, ...updatedItem } : item))
        );
        setSelectedIssue((prev) =>
          prev?.id === e.detail.id ? { ...prev, ...updatedItem } : prev
        );
        return;
      }
      if (e?.detail?.action === 'delete' && e.detail.id) {
        setWorkItems((prev) => prev.filter((item) => item.id !== e.detail.id && item.parent_id !== e.detail.id));
        setSelectedIssue((prev) => (prev?.id === e.detail.id ? null : prev));
        return;
      }
      loadProjectData(true);
    };
    window.addEventListener('work-items-updated', handleSync);
    return () => window.removeEventListener('work-items-updated', handleSync);
  }, [loadProjectData]);

  // Keep selectedIssue in sync with live workItems when refreshed
  useEffect(() => {
    if (selectedIssue?.id && workItems.length > 0) {
      const fresh = workItems.find((w) => w.id === selectedIssue.id);
      if (fresh) {
        setSelectedIssue((prev) => {
          if (!prev) return null;
          if (JSON.stringify(prev) !== JSON.stringify(fresh)) {
            return fresh;
          }
          return prev;
        });
      }
    }
  }, [workItems, selectedIssue?.id]);

  // Derived Epics list (for filter dropdown and detail drawer)
  const epics = useMemo(() => {
    return workItems
      .filter((w) => w.type === 'EPIC')
      .map((e) => {
        const childIssues = workItems.filter((w) => w.parent_id === e.id);
        const completedCount = childIssues.filter((w) => w.status === 'COMPLETED').length;
        const progress = childIssues.length > 0 ? Math.round((completedCount / childIssues.length) * 100) : 0;
        return {
          id: e.id,
          name: e.title,
          description: e.description,
          status: e.status,
          color: '#7C3AED',
          lead: e.creator?.name || 'Lead',
          progress,
        };
      });
  }, [workItems]);

  // Total Story Points across all project items (leaf deliverables to avoid double counting)
  const totalSP = useMemo(() => {
    const parentIds = new Set(workItems.map((w) => w.parent_id).filter(Boolean));
    const eligibleLeaves = workItems.filter((w) => w.type !== 'EPIC' && !parentIds.has(w.id));
    return eligibleLeaves.reduce((acc, curr) => acc + (Number(curr.story_points) || 0), 0);
  }, [workItems]);

  // Total unassigned items in Backlog / Continuous Flow
  const unassignedCount = useMemo(() => {
    return workItems.filter((w) => w.type !== 'EPIC' && !w.sprint_id).length;
  }, [workItems]);

  // Toggle single row expand
  const handleToggleExpand = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Expand all parent nodes
  const handleExpandAll = useCallback(() => {
    const parentIds = new Set();
    workItems.forEach((w) => {
      if (w.type === 'EPIC' || w.type === 'STORY' || w.type === 'TASK') {
        parentIds.add(w.id);
      }
    });
    setExpandedIds(parentIds);
  }, [workItems]);

  // Collapse all nodes
  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  // Inline update handlers connected directly to backend
  const handleUpdateStatus = async (issueId, newStatus) => {
    const originalItem = workItems.find((item) => item.id === issueId);
    try {
      setWorkItems((prev) =>
        prev.map((item) => (item.id === issueId ? { ...item, status: newStatus } : item))
      );
      if (selectedIssue?.id === issueId) {
        setSelectedIssue((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
      const saved = await workItemsService.updateWorkItem(issueId, { status: newStatus });
      if (saved) {
        setWorkItems((prev) => prev.map((item) => (item.id === issueId ? saved : item)));
        if (selectedIssue?.id === issueId) setSelectedIssue(saved);
      }
      onToast?.(`Status updated to ${newStatus}`);
    } catch (err) {
      console.error('Failed to update status:', err);
      if (originalItem) {
        setWorkItems((prev) => prev.map((item) => (item.id === issueId ? originalItem : item)));
        if (selectedIssue?.id === issueId) setSelectedIssue(originalItem);
      }
      onToast?.(err.message || 'Failed to update status');
    }
  };

  const handleUpdatePriority = async (issueId, newPriority) => {
    if (isIntern) {
      onToast?.('Forbidden: interns cannot change task priority');
      return;
    }
    const originalItem = workItems.find((item) => item.id === issueId);
    try {
      setWorkItems((prev) =>
        prev.map((item) => (item.id === issueId ? { ...item, priority: newPriority } : item))
      );
      if (selectedIssue?.id === issueId) {
        setSelectedIssue((prev) => (prev ? { ...prev, priority: newPriority } : null));
      }
      const saved = await workItemsService.updateWorkItem(issueId, { priority: newPriority });
      if (saved) {
        setWorkItems((prev) => prev.map((item) => (item.id === issueId ? saved : item)));
        if (selectedIssue?.id === issueId) setSelectedIssue(saved);
      }
      onToast?.(`Priority updated to ${newPriority}`);
    } catch (err) {
      console.error('Failed to update priority:', err);
      if (originalItem) {
        setWorkItems((prev) => prev.map((item) => (item.id === issueId ? originalItem : item)));
        if (selectedIssue?.id === issueId) setSelectedIssue(originalItem);
      }
      onToast?.(err.message || 'Failed to update priority');
    }
  };

  const handleUpdateAssignee = async (issueId, assigneeIds) => {
    if (isIntern) {
      onToast?.('Forbidden: interns cannot reassign tasks');
      return;
    }
    const originalItem = workItems.find((item) => item.id === issueId);
    try {
      const saved = await workItemsService.updateWorkItem(issueId, { assignee_ids: assigneeIds });
      if (saved) {
        setWorkItems((prev) => prev.map((item) => (item.id === issueId ? saved : item)));
        if (selectedIssue?.id === issueId) setSelectedIssue(saved);
      }
      onToast?.('Assignee updated');
    } catch (err) {
      console.error('Failed to update assignee:', err);
      if (originalItem) {
        setWorkItems((prev) => prev.map((item) => (item.id === issueId ? originalItem : item)));
        if (selectedIssue?.id === issueId) setSelectedIssue(originalItem);
      }
      onToast?.(err.message || 'Failed to update assignee');
    }
  };

  const handleUpdateSprint = async (issueId, sprintId) => {
    const originalItem = workItems.find((item) => item.id === issueId);
    try {
      const targetSprintId = sprintId === 'backlog' ? null : sprintId;
      setWorkItems((prev) =>
        prev.map((item) => (item.id === issueId ? { ...item, sprint_id: targetSprintId } : item))
      );
      if (selectedIssue?.id === issueId) {
        setSelectedIssue((prev) => (prev ? { ...prev, sprint_id: targetSprintId, sprintId: targetSprintId } : null));
      }
      const saved = await workItemsService.updateWorkItem(issueId, { sprint_id: targetSprintId });
      if (saved) {
        setWorkItems((prev) => prev.map((item) => (item.id === issueId ? saved : item)));
        if (selectedIssue?.id === issueId) setSelectedIssue(saved);
      }
      const sprintName = targetSprintId ? sprints.find((s) => s.id === targetSprintId)?.name || 'Sprint' : 'Backlog';
      onToast?.(`Moved issue to ${sprintName}`);
    } catch (err) {
      console.error('Failed to update sprint:', err);
      if (originalItem) {
        setWorkItems((prev) => prev.map((item) => (item.id === issueId ? originalItem : item)));
        if (selectedIssue?.id === issueId) setSelectedIssue(originalItem);
      }
      onToast?.(err.message || 'Failed to update sprint');
    }
  };

  const handleUpdateStoryPoints = async (issueId, points) => {
    const originalItem = workItems.find((item) => item.id === issueId);
    try {
      setWorkItems((prev) =>
        prev.map((item) => (item.id === issueId ? { ...item, story_points: points } : item))
      );
      if (selectedIssue?.id === issueId) {
        setSelectedIssue((prev) => (prev ? { ...prev, story_points: points, storyPoints: points } : null));
      }
      const saved = await workItemsService.updateWorkItem(issueId, { story_points: points });
      if (saved) {
        setWorkItems((prev) => prev.map((item) => (item.id === issueId ? saved : item)));
        if (selectedIssue?.id === issueId) setSelectedIssue(saved);
      }
      onToast?.('Story points updated');
    } catch (err) {
      console.error('Failed to update story points:', err);
      if (originalItem) {
        setWorkItems((prev) => prev.map((item) => (item.id === issueId ? originalItem : item)));
        if (selectedIssue?.id === issueId) setSelectedIssue(originalItem);
      }
      onToast?.(err.message || 'Failed to update story points');
    }
  };

  const handleUpdateDueDate = async (issueId, dueDate) => {
    const originalItem = workItems.find((item) => item.id === issueId);
    try {
      setWorkItems((prev) =>
        prev.map((item) => (item.id === issueId ? { ...item, due_date: dueDate } : item))
      );
      if (selectedIssue?.id === issueId) {
        setSelectedIssue((prev) => (prev ? { ...prev, due_date: dueDate, dueDate } : null));
      }
      const saved = await workItemsService.updateWorkItem(issueId, { due_date: dueDate });
      if (saved) {
        setWorkItems((prev) => prev.map((item) => (item.id === issueId ? saved : item)));
        if (selectedIssue?.id === issueId) setSelectedIssue(saved);
      }
      onToast?.('Due date updated');
    } catch (err) {
      console.error('Failed to update due date:', err);
      if (originalItem) {
        setWorkItems((prev) => prev.map((item) => (item.id === issueId ? originalItem : item)));
        if (selectedIssue?.id === issueId) setSelectedIssue(originalItem);
      }
      onToast?.(err.message || 'Failed to update due date');
    }
  };

  const handleDeleteIssue = async (issueId) => {
    try {
      await workItemsService.deleteWorkItem(issueId);
      if (selectedIssue?.id === issueId) setSelectedIssue(null);
      setWorkItems((prev) => {
        const toRemove = new Set([issueId]);
        let sizeBefore = 0;
        while (toRemove.size !== sizeBefore) {
          sizeBefore = toRemove.size;
          for (const item of prev) {
            if (item.parent_id && toRemove.has(item.parent_id)) {
              toRemove.add(item.id);
            }
          }
        }
        return prev.filter((item) => !toRemove.has(item.id));
      });
      onToast?.('Issue deleted successfully');
    } catch (err) {
      console.error('Failed to delete issue:', err);
      alert(err?.response?.data?.error || err.message || 'Failed to delete issue');
      onToast?.(err?.response?.data?.error || err.message || 'Failed to delete issue');
    }
  };

  // Context-sensitive add child action from row
  const handleAddChild = (parentItem) => {
    const pType = String(parentItem.type || '').toUpperCase();
    let initialType = 'Story';
    let allowedTypes = null;

    if (pType === 'EPIC') {
      initialType = 'Story';
      allowedTypes = ['Story', 'Bug'];
    } else if (pType === 'STORY') {
      initialType = 'Task';
      allowedTypes = ['Task'];
    } else if (pType === 'TASK') {
      initialType = 'Subtask';
      allowedTypes = ['Subtask'];
    }

    setCreateParentItem(parentItem);
    setCreateInitialType(initialType);
    setCreateAllowedTypes(allowedTypes);
    setCreateInitialSprintId(parentItem.sprint_id || 'backlog');
    setIsCreateModalOpen(true);
  };

  // Drag and drop to sprint
  const handleDragStart = (e, issueId) => {
    e.dataTransfer.setData('text/plain', issueId);
  };

  const handleDragEnd = () => {};

  const handleDropIssue = async (issueId, targetSprintId) => {
    await handleUpdateSprint(issueId, targetSprintId);
  };

  const currentMember = useMemo(() => {
    if (!authUser || !members?.length) return null;
    const uid = authUser.id || authUser.user_id;
    return members.find((m) => (m.user_id || m.id) === uid) || null;
  }, [authUser, members]);

  const authRole = authUser?.role || authUser?.user_metadata?.role || '';
  const isManagerOrAdmin =
    authRole === 'MANAGER' ||
    authRole === 'ADMIN' ||
    authRole === 'SUPER_ADMIN' ||
    Boolean(authUser?.is_admin) ||
    Boolean(authUser?.is_super_admin);

  const isTechLead =
    authRole === 'TECH_LEAD' ||
    Boolean(authUser?.is_tech_lead) ||
    currentMember?.project_role === 'TECH_LEAD' ||
    currentMember?.role === 'TECH_LEAD';

  const canManageSprint = isManagerOrAdmin || isTechLead;
  const isIntern = String(authRole).toUpperCase() === 'INTERN' && !canManageSprint;

  // Sprint lifecycle
  const handleStartSprint = async (sprintId) => {
    const activeSprint = sprints.find((s) => s.status === 'ACTIVE');
    if (activeSprint && activeSprint.id !== sprintId) {
      onToast?.(
        `Cannot start sprint: Sprint "${activeSprint.name}" is currently active. Please complete or resolve it first.`
      );
      return;
    }

    try {
      await sprintsService.startSprint(projectId, sprintId);
      loadProjectData();
      onToast?.('Sprint started successfully');
    } catch (err) {
      console.error('Failed to start sprint:', err);
      onToast?.(err?.response?.data?.error || err.message || 'Failed to start sprint');
    }
  };

  const handleCompleteSprint = (sprintId) => {
    const target = sprints.find((s) => s.id === sprintId);
    if (target) {
      setCompletingSprint(target);
      setIsCompleteSprintOpen(true);
    }
  };

  const handleConfirmCompleteSprint = async (options) => {
    if (!completingSprint) return;
    try {
      await sprintsService.completeSprint(projectId, completingSprint.id, options);
      setIsCompleteSprintOpen(false);
      setCompletingSprint(null);
      loadProjectData();
      onToast?.(`Sprint "${completingSprint.name}" completed successfully`);
    } catch (err) {
      console.error('Failed to complete sprint:', err);
      onToast?.(err?.response?.data?.error || err.message || 'Failed to complete sprint');
      throw err;
    }
  };

  const handleReopenSprint = async (sprintId) => {
    const activeSprint = sprints.find((s) => s.status === 'ACTIVE' && s.id !== sprintId);
    if (activeSprint) {
      onToast?.(
        `Cannot reopen sprint: Sprint "${activeSprint.name}" is currently active. Only one active sprint is allowed per project.`
      );
      return;
    }
    try {
      await sprintsService.reopenSprint(projectId, sprintId);
      loadProjectData();
      onToast?.('Sprint reopened successfully');
    } catch (err) {
      console.error('Failed to reopen sprint:', err);
      onToast?.(err?.response?.data?.error || err.message || 'Failed to reopen sprint');
    }
  };

  // Create issue modal submissions
  const handleCreateIssue = async (payload) => {
    try {
      const created = await workItemsService.createWorkItem({
        ...payload,
        project_id: projectId,
      });
      if (created) {
        setWorkItems((prev) => [created, ...prev]);
        if (created.parent_id) {
          setExpandedIds((prev) => new Set([...prev, created.parent_id]));
        }
      }
      onToast?.(`Created ${payload.type}: ${payload.title}`);
    } catch (err) {
      console.error('Failed to create issue:', err);
      onToast?.(err.message || 'Failed to create issue');
    }
  };

  const handleCreateEpic = async (payload) => {
    try {
      const created = await workItemsService.createWorkItem({
        ...payload,
        project_id: projectId,
        type: 'EPIC',
      });
      if (created) {
        setWorkItems((prev) => [created, ...prev]);
        setExpandedIds((prev) => new Set([...prev, created.id]));
      }
      onToast?.(`Created Epic: ${payload.title}`);
    } catch (err) {
      console.error('Failed to create epic:', err);
      onToast?.(err.message || 'Failed to create epic');
    }
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedAssignee(null);
    setSelectedPriority(null);
    setSelectedSprintId(null);
    setSelectedStatus(null);
    setQuickFilterMyIssues(false);
    setQuickFilterOverdue(false);
  };

  // Actionable Stories & Tasks (excludes EPICs from flat actionable view)
  const actionableWorkItems = useMemo(() => {
    return workItems.filter((w) => w.type !== 'EPIC');
  }, [workItems]);

  // Filter evaluation logic
  const filteredWorkItems = useMemo(() => {
    return workItems.filter((item) => {
      // In flat view (groupBy === 'none'), hide Epics so only actionable Stories, Tasks, Bugs, Subtasks show
      if (groupBy === 'none' && item.type === 'EPIC') {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchId = item.id.toLowerCase().includes(q);
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchDesc = item.description?.toLowerCase().includes(q);
        const matchType = item.type?.toLowerCase().includes(q);
        const matchAssignee = item.assignees?.some((a) =>
          (a.name || a.user?.name || '').toLowerCase().includes(q)
        );
        if (!matchId && !matchTitle && !matchDesc && !matchType && !matchAssignee) {
          return false;
        }
      }

      if (selectedAssignee) {
        const targetUid = selectedAssignee.user_id || selectedAssignee.id;
        if (!targetUid) return false;
        const isAssigned = Boolean(
          item.assignees?.some((a) => {
            const aId = a.user_id || a.id;
            return Boolean(aId) && aId === targetUid;
          })
        );
        if (!isAssigned) return false;
      }

      if (selectedPriority && item.priority !== selectedPriority.toUpperCase()) {
        return false;
      }

      if (selectedStatus && item.status?.toUpperCase() !== selectedStatus.toUpperCase()) {
        return false;
      }

      if (selectedSprintId) {
        if (selectedSprintId === 'backlog') {
          if (item.sprint_id !== null) return false;
        } else if (item.sprint_id !== selectedSprintId) {
          return false;
        }
      }

      if (quickFilterMyIssues && authUser) {
        const myId = authUser.id || authUser.user_id;
        if (!myId) return false;
        const isAssigned = Boolean(
          item.assignees?.some((a) => {
            const aId = a.user_id || a.id;
            return Boolean(aId) && aId === myId;
          })
        );
        if (!isAssigned) return false;
      }

      if (quickFilterOverdue) {
        if (!workItemsService.isOverdue(item)) return false;
      }

      return true;
    });
  }, [
    workItems,
    groupBy,
    searchQuery,
    selectedAssignee,
    selectedPriority,
    selectedStatus,
    selectedSprintId,
    quickFilterMyIssues,
    authUser,
    quickFilterOverdue,
  ]);

  // Determine whether any filtering criteria are currently active
  const hasActiveFilters = useMemo(() => {
    return Boolean(
      searchQuery.trim() ||
      selectedAssignee ||
      selectedPriority ||
      selectedStatus ||
      selectedSprintId ||
      quickFilterMyIssues ||
      quickFilterOverdue
    );
  }, [
    searchQuery,
    selectedAssignee,
    selectedPriority,
    selectedStatus,
    selectedSprintId,
    quickFilterMyIssues,
    quickFilterOverdue,
  ]);

  // When filters are active or viewing sprint/cycle groups, automatically ensure all required ancestors are expanded so matching items are visible
  useEffect(() => {
    if (
      (hasActiveFilters ||
        groupBy === 'sprint' ||
        groupBy === 'all_cycles' ||
        groupBy === 'no_cycle' ||
        groupBy?.startsWith('cycle:')) &&
      filteredWorkItems.length > 0
    ) {
      const itemMap = new Map(workItems.map((w) => [w.id, w]));
      const ancestorIds = new Set();
      filteredWorkItems.forEach((item) => {
        let curr = itemMap.get(item.parent_id);
        while (curr) {
          ancestorIds.add(curr.id);
          curr = itemMap.get(curr.parent_id);
        }
      });
      if (ancestorIds.size > 0) {
        setExpandedIds((prev) => {
          const next = new Set(prev);
          ancestorIds.forEach((id) => next.add(id));
          return next;
        });
      }
    }
  }, [hasActiveFilters, groupBy, filteredWorkItems, workItems]);

  // Combined sprint sections list including the "Backlog (No Cycle)" or "Backlog (No Sprint)" section
  const sprintSections = useMemo(() => {
    const list = sprints.map((s) => ({
      id: s.id,
      name: s.name,
      goal: s.goal,
      status: s.status,
      startDate: s.start_date,
      endDate: s.end_date,
      isBacklog: false,
    }));
    // Append dedicated Backlog section
    list.push({
      id: 'backlog',
      name: isKanban ? 'Backlog (No Cycle)' : 'Backlog (No Sprint)',
      status: 'PLANNED',
      isBacklog: true,
    });
    return list;
  }, [sprints, isKanban]);

  if (loading && workItems.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="w-6 h-6 text-purple-600 animate-spin mr-2.5" />
        <span className="text-xs font-semibold text-slate-600">Loading project backlog &amp; epics...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 1. BACKLOG TOOLBAR WITH REAL PROJECT MEMBERS AND STATS */}
      <BacklogToolbar
        issuesCount={actionableWorkItems.length}
        epicsCount={epics.length}
        totalSP={totalSP}
        unassignedCount={unassignedCount}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedAssignee={selectedAssignee}
        onSelectAssignee={setSelectedAssignee}
        selectedPriority={selectedPriority}
        onSelectPriority={setSelectedPriority}
        selectedSprintId={selectedSprintId}
        onSelectSprintId={setSelectedSprintId}
        selectedStatus={selectedStatus}
        onSelectStatus={setSelectedStatus}
        groupBy={groupBy}
        onSelectGroupBy={setGroupBy}
        epics={epics}
        sprints={sprintSections.filter((s) => !s.isBacklog)}
        members={members}
        quickFilterMyIssues={quickFilterMyIssues}
        onToggleMyIssues={() => setQuickFilterMyIssues(!quickFilterMyIssues)}
        quickFilterOverdue={quickFilterOverdue}
        onToggleOverdue={() => setQuickFilterOverdue(!quickFilterOverdue)}
        onClearFilters={handleClearFilters}
        isKanban={isKanban}
        readOnly={readOnly}
        onCreateClick={readOnly ? undefined : () => {
          setCreateInitialSprintId('backlog');
          setCreateInitialType('Story');
          setCreateAllowedTypes(null);
          setCreateParentItem(null);
          setIsCreateModalOpen(true);
        }}
        onCreateSprintClick={readOnly || isKanban ? undefined : () => setIsCreateSprintOpen(true)}
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
        allExpanded={expandedIds.size > 0}
      />

      {/* 2. MAIN WORKSPACE CONTENT */}
      {/* VIEW MODE A: HIERARCHICAL TREE (EPICS AT ROOT EXPANDING DOWN) */}
      {(groupBy === 'epic' || (isKanban && groupBy !== 'none')) && (
        <HierarchicalIssueTable
          issues={filteredWorkItems}
          allWorkItems={workItems}
          sprints={sprints}
          members={members}
          selectedIssueId={selectedIssue?.id}
          onSelectIssue={(issue) => setSelectedIssue(issue)}
          onUpdateStatus={handleUpdateStatus}
          onUpdatePriority={handleUpdatePriority}
          onUpdateAssignee={handleUpdateAssignee}
          onUpdateSprint={handleUpdateSprint}
          onUpdateStoryPoints={handleUpdateStoryPoints}
          onUpdateDueDate={handleUpdateDueDate}
          onDeleteIssue={handleDeleteIssue}
          onAddChild={handleAddChild}
          expandedIds={expandedIds}
          onToggleExpand={handleToggleExpand}
          isHierarchical={true}
          hasActiveFilters={hasActiveFilters}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          isKanban={isKanban}
          emptyMessage="No issues match the selected filters. Click + Create Issue to add a Story or Task."
        />
      )}

      {/* VIEW MODE B: ALL CYCLES GROUPED (Scrum only) */}
      {!isKanban && (groupBy === 'sprint' || groupBy === 'all_cycles') && (
        <div className="space-y-3">
          {sprintSections.map((sprint) => {
            const sprintItems = sprint.isBacklog
              ? filteredWorkItems.filter((i) => {
                  if (i.sprint_id) return false;
                  // If it's an epic with children, do not count directly in Backlog issues list;
                  // it will be included as contextual parent if any of its children are in backlog
                  if (i.type === 'EPIC') {
                    const hasChildren = workItems.some((w) => w.parent_id === i.id);
                    if (hasChildren) return false;
                  }
                  return true;
                })
              : filteredWorkItems.filter((i) => i.sprint_id === sprint.id);

            return (
              <SprintSection
                key={sprint.id}
                sprint={sprint}
                issues={sprintItems}
                allWorkItems={workItems}
                sprints={sprints}
                members={members}
                selectedIssueId={selectedIssue?.id}
                isKanban={isKanban}
                onSelectIssue={(issue) => setSelectedIssue(issue)}
                onUpdateStatus={handleUpdateStatus}
                onUpdatePriority={handleUpdatePriority}
                onUpdateAssignee={handleUpdateAssignee}
                onUpdateSprint={handleUpdateSprint}
                onUpdateStoryPoints={handleUpdateStoryPoints}
                onUpdateDueDate={handleUpdateDueDate}
                onDeleteIssue={handleDeleteIssue}
                onAddChild={handleAddChild}
                expandedIds={expandedIds}
                onToggleExpand={handleToggleExpand}
                hasActiveFilters={hasActiveFilters}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDropIssue={handleDropIssue}
                onCreateIssueInSprint={(sprintId) => {
                  setCreateInitialSprintId(sprintId);
                  setCreateInitialType('Story');
                  setCreateAllowedTypes(null);
                  setCreateParentItem(null);
                  setIsCreateModalOpen(true);
                }}
                onStartSprint={handleStartSprint}
                onCompleteSprint={handleCompleteSprint}
                onReopenSprint={handleReopenSprint}
                canManageSprint={canManageSprint}
              />
            );
          })}
        </div>
      )}

      {/* VIEW MODE C: INDIVIDUAL CYCLE (Scrum only) */}
      {!isKanban && groupBy?.startsWith('cycle:') && (() => {
        const targetCycleId = groupBy.replace('cycle:', '');
        const targetSprint = sprintSections.find((s) => s.id === targetCycleId) || sprints.find((s) => s.id === targetCycleId);
        if (!targetSprint) {
          return (
            <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-slate-500 text-xs">
              Sprint not found or has been removed. Please select another view.
            </div>
          );
        }
        const cycleItems = filteredWorkItems.filter((i) => i.sprint_id === targetSprint.id);
        return (
          <SprintSection
            key={targetSprint.id}
            sprint={targetSprint}
            issues={cycleItems}
            allWorkItems={workItems}
            sprints={sprints}
            members={members}
            selectedIssueId={selectedIssue?.id}
            isKanban={false}
            onSelectIssue={(issue) => setSelectedIssue(issue)}
            onUpdateStatus={handleUpdateStatus}
            onUpdatePriority={handleUpdatePriority}
            onUpdateAssignee={handleUpdateAssignee}
            onUpdateSprint={handleUpdateSprint}
            onUpdateStoryPoints={handleUpdateStoryPoints}
            onUpdateDueDate={handleUpdateDueDate}
            onDeleteIssue={handleDeleteIssue}
            onAddChild={handleAddChild}
            expandedIds={expandedIds}
            onToggleExpand={handleToggleExpand}
            hasActiveFilters={hasActiveFilters}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDropIssue={handleDropIssue}
            onCreateIssueInSprint={(sprintId) => {
              setCreateInitialSprintId(sprintId);
              setCreateInitialType('Story');
              setCreateAllowedTypes(null);
              setCreateParentItem(null);
              setIsCreateModalOpen(true);
            }}
            onStartSprint={handleStartSprint}
            onCompleteSprint={handleCompleteSprint}
                onReopenSprint={handleReopenSprint}
                canManageSprint={canManageSprint}
          />
        );
      })()}

      {/* VIEW MODE D: BACKLOG (NO CYCLE) (Scrum only) */}
      {!isKanban && groupBy === 'no_cycle' && (() => {
        const backlogSprint = sprintSections.find((s) => s.isBacklog) || {
          id: 'backlog',
          name: isKanban ? 'Backlog (No Cycle)' : 'Backlog (No Sprint)',
          status: 'PLANNED',
          isBacklog: true,
        };
        const unassignedItems = filteredWorkItems.filter((i) => {
          if (i.sprint_id) return false;
          if (i.type === 'EPIC') {
            const hasChildren = workItems.some((w) => w.parent_id === i.id);
            if (hasChildren) return false;
          }
          return true;
        });
        return (
          <SprintSection
            key="backlog-no-cycle"
            sprint={backlogSprint}
            issues={unassignedItems}
            allWorkItems={workItems}
            sprints={sprints}
            members={members}
            selectedIssueId={selectedIssue?.id}
            isKanban={isKanban}
            onSelectIssue={(issue) => setSelectedIssue(issue)}
            onUpdateStatus={handleUpdateStatus}
            onUpdatePriority={handleUpdatePriority}
            onUpdateAssignee={handleUpdateAssignee}
            onUpdateSprint={handleUpdateSprint}
            onUpdateStoryPoints={handleUpdateStoryPoints}
            onUpdateDueDate={handleUpdateDueDate}
            onDeleteIssue={handleDeleteIssue}
            onAddChild={handleAddChild}
            expandedIds={expandedIds}
            onToggleExpand={handleToggleExpand}
            hasActiveFilters={hasActiveFilters}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDropIssue={handleDropIssue}
            onCreateIssueInSprint={(sprintId) => {
              setCreateInitialSprintId('backlog');
              setCreateInitialType('Story');
              setCreateAllowedTypes(null);
              setCreateParentItem(null);
              setIsCreateModalOpen(true);
            }}
            onStartSprint={handleStartSprint}
            onCompleteSprint={handleCompleteSprint}
                onReopenSprint={handleReopenSprint}
                canManageSprint={canManageSprint}
          />
        );
      })()}

      {/* VIEW MODE C: FLAT LIST (DEFAULT STORIES & TASKS) */}
      {groupBy === 'none' && (
        <HierarchicalIssueTable
          issues={filteredWorkItems}
          allWorkItems={workItems}
          sprints={sprints}
          members={members}
          selectedIssueId={selectedIssue?.id}
          onSelectIssue={(issue) => setSelectedIssue(issue)}
          onUpdateStatus={handleUpdateStatus}
          onUpdatePriority={handleUpdatePriority}
          onUpdateAssignee={handleUpdateAssignee}
          onUpdateSprint={handleUpdateSprint}
          onUpdateStoryPoints={handleUpdateStoryPoints}
          onUpdateDueDate={handleUpdateDueDate}
          onDeleteIssue={handleDeleteIssue}
          onAddChild={handleAddChild}
          expandedIds={expandedIds}
          onToggleExpand={handleToggleExpand}
          isHierarchical={false}
          hasActiveFilters={hasActiveFilters}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          isKanban={isKanban}
          emptyMessage="No stories or tasks found matching the criteria. Click + Create Issue to get started."
        />
      )}

      {/* 3. DETAIL DRAWER */}
      {selectedIssue && (
        <IssueDetailDrawer
          issue={selectedIssue}
          epics={epics}
          sprints={sprints}
          members={members}
          workItems={workItems}
          isKanban={isKanban}
          isOpen={Boolean(selectedIssue)}
          onClose={() => setSelectedIssue(null)}
          onUpdateIssue={async (updated, delta) => {
            const prevWorkItems = [...workItems];
            const prevSelected = selectedIssue;
            try {
              let payload = {};
              if (delta && typeof delta === "object" && Object.keys(delta).length > 0) {
                if (delta.status !== undefined) payload.status = delta.status;
                if (delta.title !== undefined) payload.title = delta.title;
                if (delta.description !== undefined) payload.description = delta.description;
                if (delta.priority !== undefined) payload.priority = delta.priority;
                if (delta.due_date !== undefined) payload.due_date = delta.due_date;
                if (delta.dueDate !== undefined && delta.due_date === undefined) payload.due_date = delta.dueDate;
                if (delta.story_points !== undefined || delta.storyPoints !== undefined) {
                  const sp = delta.story_points !== undefined ? delta.story_points : delta.storyPoints;
                  payload.story_points = sp !== null && sp !== "" && !Number.isNaN(Number(sp)) ? Number(sp) : null;
                }
                if (delta.sprint_id !== undefined || delta.sprintId !== undefined) {
                  const sid = delta.sprint_id !== undefined ? delta.sprint_id : delta.sprintId;
                  payload.sprint_id = sid === "backlog" ? null : sid;
                }
                if (delta.parent_id !== undefined || delta.epicId !== undefined) {
                  const pid = delta.parent_id !== undefined ? delta.parent_id : delta.epicId;
                  payload.parent_id = pid === "" ? null : pid;
                }
                if (delta.assignee_ids !== undefined) {
                  payload.assignee_ids = delta.assignee_ids;
                } else if (delta.assigneeId !== undefined) {
                  payload.assignee_ids = delta.assigneeId ? [delta.assigneeId] : [];
                }
              } else {
                const orig = selectedIssue || {};
                if (updated.status !== undefined && updated.status !== orig.status) {
                  payload.status = updated.status;
                }
                if (updated.title !== undefined && updated.title !== orig.title) {
                  payload.title = updated.title;
                }
                if (updated.description !== undefined && updated.description !== orig.description) {
                  payload.description = updated.description;
                }
                if (updated.priority !== undefined && updated.priority !== orig.priority) {
                  payload.priority = updated.priority;
                }
                if (updated.due_date !== undefined && updated.due_date !== orig.due_date) {
                  payload.due_date = updated.due_date;
                }
                const updatedSp = updated.story_points !== undefined ? updated.story_points : updated.storyPoints;
                const origSp = orig.story_points !== undefined ? orig.story_points : orig.storyPoints;
                if (updatedSp !== undefined && updatedSp !== origSp) {
                  payload.story_points = updatedSp !== null && updatedSp !== "" && !Number.isNaN(Number(updatedSp)) ? Number(updatedSp) : null;
                }
                const updatedSprint = updated.sprint_id !== undefined ? updated.sprint_id : updated.sprintId;
                const origSprint = orig.sprint_id !== undefined ? orig.sprint_id : orig.sprintId;
                if (updatedSprint !== undefined && updatedSprint !== origSprint) {
                  payload.sprint_id = updatedSprint === "backlog" ? null : updatedSprint;
                }
                const updatedParent = updated.parent_id !== undefined ? updated.parent_id : updated.epicId;
                const origParent = orig.parent_id !== undefined ? orig.parent_id : orig.epicId;
                if (updatedParent !== undefined && updatedParent !== origParent) {
                  payload.parent_id = updatedParent === "" ? null : updatedParent;
                }
                if (updated.assignee_ids !== undefined) {
                  payload.assignee_ids = updated.assignee_ids;
                } else if (updated.assigneeId !== undefined) {
                  payload.assignee_ids = updated.assigneeId ? [updated.assigneeId] : [];
                }
              }

              // If no work-item fields changed (e.g. extension request metadata or external update)
              if (Object.keys(payload).length === 0) {
                setWorkItems((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
                setSelectedIssue((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
                return updated;
              }

              // Optimistic UI update
              const optimisticItem = { ...selectedIssue, ...updated };
              setWorkItems((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...optimisticItem } : item)));
              setSelectedIssue(optimisticItem);

              const saved = await workItemsService.updateWorkItem(updated.id, payload);
              const finalItem = saved || optimisticItem;
              setWorkItems((prev) => prev.map((item) => (item.id === updated.id ? finalItem : item)));
              setSelectedIssue(finalItem);
              onToast?.("Issue updated");
              return finalItem;
            } catch (err) {
              setWorkItems(prevWorkItems);
              setSelectedIssue(prevSelected);
              console.error("Failed to update issue:", err);
              onToast?.(err?.response?.data?.message || err?.message || "Failed to update issue");
              throw err;
            }
          }}
          onDeleteIssue={handleDeleteIssue}
          onToggleSubtask={async (issueId, subtaskId) => {
            const currentSubtask = workItems.find((w) => w.id === subtaskId);
            if (!currentSubtask) return;
            const newStatus = currentSubtask.status === 'COMPLETED' ? 'TODO' : 'COMPLETED';
            await handleUpdateStatus(subtaskId, newStatus);
          }}
          onAddSubtask={async (parentIssueId, subtaskTitle, childType = 'SUBTASK', sprintId = null, storyPoints = 3) => {
            try {
              const isSpApplicable = ['TASK', 'SUBTASK', 'BUG', 'STORY'].includes(childType);
              const spVal = isSpApplicable ? (Number(storyPoints) > 0 ? Number(storyPoints) : 3) : Number(storyPoints) || 0;
              const created = await workItemsService.createWorkItem({
                project_id: projectId,
                parent_id: parentIssueId,
                type: childType,
                title: subtaskTitle.trim(),
                sprint_id: isKanban ? null : (sprintId || null),
                story_points: spVal,
              });
              if (created) {
                setWorkItems((prev) => [created, ...prev]);
                setExpandedIds((prev) => new Set([...prev, parentIssueId]));
              }
              onToast?.(`Added ${childType.toLowerCase()}: "${subtaskTitle.trim()}" (${spVal} SP)`);
            } catch (err) {
              console.error('Failed to add child item:', err);
              onToast?.(err.message || 'Failed to add child item');
            }
          }}
        />
      )}

      {/* 4. CREATE ISSUE MODAL */}
      <CreateIssueModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setCreateParentItem(null);
          setCreateAllowedTypes(null);
        }}
        projectId={projectId}
        isKanban={isKanban}
        initialIssueType={createInitialType}
        initialSprintId={createInitialSprintId}
        allowedTypes={createAllowedTypes}
        parentItem={createParentItem}
        members={members}
        sprints={sprints}
        workItems={workItems}
        onCreateIssue={handleCreateIssue}
        onCreateEpic={handleCreateEpic}
      />

      {/* 5. CREATE SPRINT MODAL (Scrum only) */}
      {!isKanban && (
        <CreateSprintModal
          isOpen={isCreateSprintOpen}
          onClose={() => setIsCreateSprintOpen(false)}
          projectId={projectId}
          projectName={currentProject?.name}
          existingSprints={sprints}
          isKanban={false}
          onSuccess={() => {
            loadProjectData();
            onToast?.('Sprint created successfully');
          }}
        />
      )}
    </div>
  );
}
