import React, { useState, useEffect, useCallback, useMemo } from 'react';
import BacklogToolbar from '../../backlog/BacklogToolbar';
import SprintSection from '../../backlog/SprintSection';
import HierarchicalIssueTable from '../../backlog/HierarchicalIssueTable';
import IssueDetailDrawer from '../../backlog/IssueDetailDrawer';
import CreateIssueModal from '../../backlog/CreateIssueModal';
import CreateSprintModal from '../../modals/CreateSprintModal';
import { Loader2 } from 'lucide-react';
import { workItemsService } from '../../../services/workItems.service';
import { sprintsService } from '../../../services/sprints.service';
import { projectsService } from '../../../services/projects.service';
import { useAuth } from '../../../context/AuthContext';

export default function ProjectBacklogTab({ projectId, project = null, onToast, readOnly = false }) {
  const { user: authUser } = useAuth();
  const [currentProject, setCurrentProject] = useState(project);
  const [loading, setLoading] = useState(true);
  const [sprints, setSprints] = useState([]);
  const [workItems, setWorkItems] = useState([]);
  const [members, setMembers] = useState([]);

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
  const [groupBy, setGroupBy] = useState('none'); // 'none' (Flat Stories & Tasks) | 'sprint' (Sprint Groups) | 'epic' (Hierarchy Tree)

  // Quick Filters
  const [quickFilterMyIssues, setQuickFilterMyIssues] = useState(false);
  const [quickFilterOverdue, setQuickFilterOverdue] = useState(false);

  // Hierarchy Expansion State
  const [expandedIds, setExpandedIds] = useState(new Set());

  // Drawer & Modal States
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreateSprintOpen, setIsCreateSprintOpen] = useState(false);
  const [createInitialSprintId, setCreateInitialSprintId] = useState('backlog');
  const [createInitialType, setCreateInitialType] = useState('Story');
  const [createAllowedTypes, setCreateAllowedTypes] = useState(null);
  const [createParentItem, setCreateParentItem] = useState(null);

  // Fetch live data from backend
  const loadProjectData = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const [sprintsList, itemsList, membersList] = await Promise.all([
        sprintsService.getSprints(projectId).catch(() => []),
        workItemsService.listWorkItems({ project_id: projectId }).catch(() => []),
        projectsService.getMembers(projectId).catch(() => []),
      ]);

      const items = itemsList || [];
      setSprints(sprintsList || []);
      setWorkItems(items);
      setMembers(membersList || []);

      // Auto-expand all Epics and Stories on initial load so user immediately sees hierarchy
      setExpandedIds((prev) => {
        const next = new Set(prev);
        items.forEach((item) => {
          if (item.type === 'EPIC' || item.type === 'STORY') {
            next.add(item.id);
          }
        });
        return next;
      });
    } catch (err) {
      console.error('Failed to load backlog data:', err);
      onToast?.('Failed to load project backlog data');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadProjectData();
  }, [loadProjectData]);

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

  // Total Story Points across all project items
  const totalSP = useMemo(() => {
    return workItems.reduce((acc, curr) => acc + (Number(curr.story_points) || 0), 0);
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
    try {
      setWorkItems((prev) =>
        prev.map((item) => (item.id === issueId ? { ...item, status: newStatus } : item))
      );
      await workItemsService.updateWorkItem(issueId, { status: newStatus });
      loadProjectData();
      onToast?.(`Status updated to ${newStatus}`);
    } catch (err) {
      console.error('Failed to update status:', err);
      onToast?.(err.message || 'Failed to update status');
      loadProjectData();
    }
  };

  const handleUpdatePriority = async (issueId, newPriority) => {
    try {
      setWorkItems((prev) =>
        prev.map((item) => (item.id === issueId ? { ...item, priority: newPriority } : item))
      );
      await workItemsService.updateWorkItem(issueId, { priority: newPriority });
      loadProjectData();
      onToast?.(`Priority updated to ${newPriority}`);
    } catch (err) {
      console.error('Failed to update priority:', err);
      onToast?.(err.message || 'Failed to update priority');
      loadProjectData();
    }
  };

  const handleUpdateAssignee = async (issueId, assigneeIds) => {
    try {
      await workItemsService.updateWorkItem(issueId, { assignee_ids: assigneeIds });
      loadProjectData();
      onToast?.('Assignee updated');
    } catch (err) {
      console.error('Failed to update assignee:', err);
      onToast?.(err.message || 'Failed to update assignee');
      loadProjectData();
    }
  };

  const handleUpdateSprint = async (issueId, sprintId) => {
    try {
      const targetSprintId = sprintId === 'backlog' ? null : sprintId;
      setWorkItems((prev) =>
        prev.map((item) => (item.id === issueId ? { ...item, sprint_id: targetSprintId } : item))
      );
      await workItemsService.updateWorkItem(issueId, { sprint_id: targetSprintId });
      loadProjectData();
      const sprintName = targetSprintId ? sprints.find((s) => s.id === targetSprintId)?.name || 'Sprint' : 'Backlog';
      onToast?.(`Moved issue to ${sprintName}`);
    } catch (err) {
      console.error('Failed to update sprint:', err);
      onToast?.(err.message || 'Failed to update sprint');
      loadProjectData();
    }
  };

  const handleUpdateStoryPoints = async (issueId, points) => {
    try {
      setWorkItems((prev) =>
        prev.map((item) => (item.id === issueId ? { ...item, story_points: points } : item))
      );
      await workItemsService.updateWorkItem(issueId, { story_points: points });
      loadProjectData();
      onToast?.('Story points updated');
    } catch (err) {
      console.error('Failed to update story points:', err);
      onToast?.(err.message || 'Failed to update story points');
      loadProjectData();
    }
  };

  const handleUpdateDueDate = async (issueId, dueDate) => {
    try {
      setWorkItems((prev) =>
        prev.map((item) => (item.id === issueId ? { ...item, due_date: dueDate } : item))
      );
      await workItemsService.updateWorkItem(issueId, { due_date: dueDate });
      loadProjectData();
      onToast?.('Due date updated');
    } catch (err) {
      console.error('Failed to update due date:', err);
      onToast?.(err.message || 'Failed to update due date');
      loadProjectData();
    }
  };

  const handleDeleteIssue = async (issueId) => {
    try {
      await workItemsService.deleteWorkItem(issueId);
      if (selectedIssue?.id === issueId) setSelectedIssue(null);
      loadProjectData();
      onToast?.('Issue deleted successfully');
    } catch (err) {
      console.error('Failed to delete issue:', err);
      onToast?.(err.message || 'Failed to delete issue');
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
      allowedTypes = ['Task', 'Bug'];
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

  const handleCompleteSprint = async (sprintId) => {
    try {
      await sprintsService.completeSprint(projectId, sprintId, {
        unfinished_action: 'MOVE_TO_BACKLOG',
      });
      loadProjectData();
      onToast?.('Sprint completed successfully');
    } catch (err) {
      console.error('Failed to complete sprint:', err);
      onToast?.(err?.response?.data?.error || err.message || 'Failed to complete sprint');
    }
  };

  // Create issue modal submissions
  const handleCreateIssue = async (payload) => {
    try {
      await workItemsService.createWorkItem({
        ...payload,
        project_id: projectId,
      });
      loadProjectData();
      onToast?.(`Created ${payload.type}: ${payload.title}`);
    } catch (err) {
      console.error('Failed to create issue:', err);
      onToast?.(err.message || 'Failed to create issue');
    }
  };

  const handleCreateEpic = async (payload) => {
    try {
      await workItemsService.createWorkItem({
        ...payload,
        project_id: projectId,
        type: 'EPIC',
      });
      loadProjectData();
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
        const isOverdue = Boolean(
          item.due_date &&
            new Date(item.due_date) < new Date() &&
            item.status !== 'COMPLETED'
        );
        if (!isOverdue) return false;
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

  // When filters are active or viewing sprint groups, automatically ensure all required ancestors are expanded so matching items are visible
  useEffect(() => {
    if ((hasActiveFilters || groupBy === 'sprint') && filteredWorkItems.length > 0) {
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

  // Combined sprint sections list including the "Backlog" section
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
      name: 'Backlog',
      status: 'PLANNED',
      isBacklog: true,
    });
    return list;
  }, [sprints]);

  if (loading) {
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
        readOnly={readOnly}
        onCreateClick={readOnly ? undefined : () => {
          setCreateInitialSprintId('backlog');
          setCreateInitialType('Story');
          setCreateAllowedTypes(null);
          setCreateParentItem(null);
          setIsCreateModalOpen(true);
        }}
        onCreateSprintClick={readOnly ? undefined : () => setIsCreateSprintOpen(true)}
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
        allExpanded={expandedIds.size > 0}
      />

      {/* 2. MAIN WORKSPACE CONTENT */}
      {/* VIEW MODE A: HIERARCHICAL TREE (EPICS AT ROOT EXPANDING DOWN) */}
      {groupBy === 'epic' && (
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
          emptyMessage="No issues match the selected filters. Click + Create Issue to add a Story or Task."
        />
      )}

      {/* VIEW MODE B: SPRINT SECTIONS (ACTIVE SPRINT, PLANNED SPRINTS, BACKLOG) */}
      {groupBy === 'sprint' && (
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
              />
            );
          })}
        </div>
      )}

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
          isOpen={Boolean(selectedIssue)}
          onClose={() => setSelectedIssue(null)}
          onUpdateIssue={async (updated) => {
            try {
              const sprintIdToSave = updated.sprint_id !== undefined 
                ? (updated.sprint_id === 'backlog' ? null : updated.sprint_id) 
                : (updated.sprintId === 'backlog' ? null : updated.sprintId);

              const parentIdToSave = updated.parent_id !== undefined 
                ? (updated.parent_id === '' ? null : updated.parent_id) 
                : (updated.epicId === '' ? null : updated.epicId);

              const payload = {
                title: updated.title,
                description: updated.description,
                status: updated.status,
                priority: updated.priority,
                story_points: updated.story_points,
                due_date: updated.due_date,
              };

              if (sprintIdToSave !== undefined) {
                payload.sprint_id = sprintIdToSave;
              }
              if (parentIdToSave !== undefined) {
                payload.parent_id = parentIdToSave;
              }
              if (updated.assignee_ids !== undefined) {
                payload.assignee_ids = updated.assignee_ids;
              } else if (updated.assigneeId !== undefined) {
                payload.assignee_ids = updated.assigneeId ? [updated.assigneeId] : [];
              }

              await workItemsService.updateWorkItem(updated.id, payload);
              loadProjectData();
              setSelectedIssue((prev) => (prev ? { 
                ...prev, 
                ...updated, 
                sprint_id: sprintIdToSave,
                sprintId: sprintIdToSave,
                parent_id: parentIdToSave,
              } : null));
              onToast?.('Issue updated');
            } catch (err) {
              console.error('Failed to update issue:', err);
              onToast?.(err.message || 'Failed to update issue');
            }
          }}
          onDeleteIssue={handleDeleteIssue}
          onToggleSubtask={async (issueId, subtaskId) => {
            const currentSubtask = workItems.find((w) => w.id === subtaskId);
            if (!currentSubtask) return;
            const newStatus = currentSubtask.status === 'COMPLETED' ? 'TODO' : 'COMPLETED';
            await handleUpdateStatus(subtaskId, newStatus);
          }}
          onAddSubtask={async (parentIssueId, subtaskTitle, childType = 'SUBTASK', sprintId = null) => {
            try {
              await workItemsService.createWorkItem({
                project_id: projectId,
                parent_id: parentIssueId,
                type: childType,
                title: subtaskTitle.trim(),
                sprint_id: sprintId || null,
              });
              loadProjectData();
              onToast?.(`Added ${childType.toLowerCase()}: "${subtaskTitle.trim()}"`);
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

      {/* 5. CREATE SPRINT MODAL */}
      <CreateSprintModal
        isOpen={isCreateSprintOpen}
        onClose={() => setIsCreateSprintOpen(false)}
        projectId={projectId}
        projectName={currentProject?.name}
        existingSprints={sprints}
        onSuccess={() => {
          loadProjectData();
          onToast?.('Sprint created successfully');
        }}
      />
    </div>
  );
}
