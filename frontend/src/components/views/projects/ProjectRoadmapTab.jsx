import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  ChevronDown, 
  CheckCircle2, 
  Calendar,
  Layers,
  Loader2,
  Check
} from 'lucide-react';
import { workItemsService } from '../../../services/workItems.service';
import { sprintsService } from '../../../services/sprints.service';
import { projectsService } from '../../../services/projects.service';
import CreateIssueModal from '../../backlog/CreateIssueModal';
import TaskDetailModal from '../../kanban/TaskDetailModal';

export default function ProjectRoadmapTab({ projectId, project, onToast }) {
  const [loading, setLoading] = useState(true);
  const [workItems, setWorkItems] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [members, setMembers] = useState([]);

  // Filters & View State
  const [viewMode, setViewMode] = useState('Sprints'); // 'Weeks' | 'Sprints' | 'Months'
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedOwnerId, setSelectedOwnerId] = useState('All');
  const [search, setSearch] = useState('');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [ownerDropdownOpen, setOwnerDropdownOpen] = useState(false);

  // Modals
  const [isCreateEpicOpen, setIsCreateEpicOpen] = useState(false);
  const [selectedEpic, setSelectedEpic] = useState(null);

  const loadData = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const [itemsList, sprintsList, membersList] = await Promise.all([
        workItemsService.listWorkItems({ project_id: projectId }).catch(() => []),
        sprintsService.getSprints(projectId).catch(() => []),
        projectsService.getMembers(projectId).catch(() => []),
      ]);
      setWorkItems(itemsList || []);
      setSprints(sprintsList || []);
      setMembers(membersList || []);
    } catch (err) {
      console.error('Failed to load roadmap data:', err);
      onToast?.('Failed to load roadmap timeline');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived Epics
  const epics = useMemo(() => {
    return workItems.filter((w) => w.type === 'EPIC');
  }, [workItems]);

  // Overall Completion
  const overallCompletion = useMemo(() => {
    const nonEpics = workItems.filter((w) => w.type !== 'EPIC');
    if (nonEpics.length === 0) return 0;
    const completed = nonEpics.filter((w) => w.status === 'COMPLETED').length;
    return Math.round((completed / nonEpics.length) * 100);
  }, [workItems]);

  // Active Sprints string
  const activeSprintsText = useMemo(() => {
    const activeList = sprints.filter((s) => s.status === 'ACTIVE');
    if (activeList.length === 0) {
      return sprints.length > 0 ? `${sprints[0].name} (Planned)` : 'None';
    }
    return activeList.map((s) => s.name).join(', ');
  }, [sprints]);

  // Tech Lead / Project Owner Name
  const ownerName = project?.owner
    ? (project.owner.name || project.owner.email)
    : 'Project Lead';

  // Filtered Epics
  const filteredEpics = useMemo(() => {
    return epics.filter((e) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = e.title?.toLowerCase().includes(q);
        const matchDesc = e.description?.toLowerCase().includes(q);
        const matchLead = e.assignees?.some((a) => (a.name || a.email || '').toLowerCase().includes(q));
        if (!matchTitle && !matchDesc && !matchLead) return false;
      }

      if (statusFilter !== 'All') {
        if (statusFilter === 'Completed' && e.status !== 'COMPLETED') return false;
        if (statusFilter === 'In Progress' && e.status !== 'IN_PROGRESS') return false;
        if (statusFilter === 'To Do' && e.status !== 'TODO') return false;
      }

      if (selectedOwnerId !== 'All') {
        const hasOwner = e.assignees?.some((a) => a.id === selectedOwnerId || a.user_id === selectedOwnerId);
        if (!hasOwner) return false;
      }

      return true;
    });
  }, [epics, search, statusFilter, selectedOwnerId]);

  // Epics mapped with child items and timeline column placement
  const epicsWithTimeline = useMemo(() => {
    // Determine total sprint slots (minimum 4 columns)
    const totalSlots = Math.max(4, sprints.length);
    const sprintMap = new Map();
    sprints.forEach((s, idx) => sprintMap.set(s.id, idx + 1));

    return filteredEpics.map((epic, epicIndex) => {
      const childIssues = workItems.filter((w) => w.parent_id === epic.id);
      const completedChildCount = childIssues.filter((w) => w.status === 'COMPLETED').length;
      const progress = childIssues.length > 0
        ? Math.round((completedChildCount / childIssues.length) * 100)
        : 0;

      // Determine which sprints the children are assigned to
      const childSprintIndices = childIssues
        .map((c) => sprintMap.get(c.sprint_id))
        .filter(Boolean);

      let startCol = 1;
      let spanCols = 2;

      if (childSprintIndices.length > 0) {
        const minIdx = Math.min(...childSprintIndices);
        const maxIdx = Math.max(...childSprintIndices);
        startCol = minIdx;
        spanCols = Math.max(1, maxIdx - minIdx + 1);
      } else {
        // Fallback staggered placement if unassigned
        startCol = (epicIndex % Math.max(1, totalSlots - 1)) + 1;
        spanCols = Math.min(2, totalSlots - startCol + 1);
      }

      // Card color themes based on status/index
      const colorClasses = [
        'bg-purple-100 text-purple-900 border border-purple-200',
        'bg-blue-100 text-blue-900 border border-blue-200',
        'bg-emerald-100 text-emerald-900 border border-emerald-200',
        'bg-amber-100 text-amber-900 border border-amber-200',
        'bg-indigo-100 text-indigo-900 border border-indigo-200',
      ];
      const color = colorClasses[epicIndex % colorClasses.length];

      const leadName = epic.assignees?.[0]?.name || epic.assignees?.[0]?.email || 'Unassigned';

      return {
        ...epic,
        lead: leadName,
        childCount: childIssues.length,
        progress,
        startCol,
        spanCols,
        color,
      };
    });
  }, [filteredEpics, workItems, sprints]);

  // Handle Epic Creation
  const handleCreateEpic = async (epicData) => {
    try {
      await workItemsService.createWorkItem({
        title: epicData.title,
        description: epicData.description || null,
        type: 'EPIC',
        priority: epicData.priority || 'MEDIUM',
        project_id: projectId,
        assignee_ids: epicData.assignee_ids || [],
        start_date: epicData.start_date || null,
        due_date: epicData.due_date || null,
      });
      onToast?.(`Epic "${epicData.title}" created successfully`);
      loadData();
    } catch (err) {
      console.error('Failed to create epic:', err);
      onToast?.(`Failed to create epic: ${err.message || 'Error'}`);
    }
  };

  if (loading && workItems.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-12 flex flex-col items-center justify-center min-h-[360px]">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-3" />
        <p className="text-xs font-semibold text-slate-700">Loading Gantt Roadmap...</p>
        <p className="text-[11px] text-slate-400 mt-1">Aggregating epic deliverables and sprint timelines</p>
      </div>
    );
  }

  // Display columns for sprints (padded up to at least 4 for Gantt matrix grid)
  const displaySprints = sprints.length > 0 ? sprints : [
    { id: 's1', name: 'Sprint 01', dates: 'Kickoff', isActive: true },
    { id: 's2', name: 'Sprint 02', dates: 'Iteration', isActive: false },
    { id: 's3', name: 'Sprint 03', dates: 'Iteration', isActive: false },
    { id: 's4', name: 'Sprint 04', dates: 'Release', isActive: false },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-card">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Gantt Roadmap & Sprint Timelines
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              Track high-level deliverables mapped directly to sprint intervals. Adjust epic progress and delivery milestones to align with intern cohort execution.
            </p>
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mt-3">
              <span>Project Lead: <strong className="text-slate-800">{ownerName}</strong></span>
              <span className="text-slate-300 select-none">•</span>
              <span>Active Sprints: <strong className="text-purple-700">{activeSprintsText}</strong></span>
            </div>
          </div>

          {/* Right Stat Cards */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="px-5 py-3 rounded-2xl bg-purple-50/80 border border-purple-100 text-center min-w-[110px]">
              <span className="text-xl font-extrabold text-purple-700">{epics.length}</span>
              <div className="text-[10px] font-bold text-purple-900/60 uppercase mt-0.5">Total Epics</div>
            </div>
            <div className="px-5 py-3 rounded-2xl bg-emerald-50/80 border border-emerald-100 text-center min-w-[110px]">
              <span className="text-xl font-extrabold text-emerald-600">{overallCompletion}%</span>
              <div className="text-[10px] font-bold text-emerald-900/60 uppercase mt-0.5">Completion</div>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar / Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search epics..."
              className="pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 w-full"
            />
          </div>

          {/* Status Dropdown */}
          <div className="relative">
            <button
              onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              <span>{statusFilter === 'All' ? 'All Statuses' : statusFilter}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            {statusDropdownOpen && (
              <div className="absolute left-0 mt-1 w-36 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-30">
                {['All', 'To Do', 'In Progress', 'Completed'].map((st) => (
                  <button
                    key={st}
                    onClick={() => {
                      setStatusFilter(st);
                      setStatusDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center justify-between ${
                      statusFilter === st ? 'text-purple-700 font-bold bg-purple-50' : 'text-slate-700'
                    }`}
                  >
                    <span>{st === 'All' ? 'All Statuses' : st}</span>
                    {statusFilter === st && <Check className="w-3 h-3 text-purple-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Owner Dropdown */}
          <div className="relative">
            <button
              onClick={() => setOwnerDropdownOpen(!ownerDropdownOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              <span>
                {selectedOwnerId === 'All'
                  ? 'All Owners'
                  : members.find((m) => m.id === selectedOwnerId || m.user_id === selectedOwnerId)?.name || 'Owner'}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            {ownerDropdownOpen && (
              <div className="absolute left-0 mt-1 w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-30">
                <button
                  onClick={() => {
                    setSelectedOwnerId('All');
                    setOwnerDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center justify-between ${
                    selectedOwnerId === 'All' ? 'text-purple-700 font-bold bg-purple-50' : 'text-slate-700'
                  }`}
                >
                  <span>All Owners</span>
                  {selectedOwnerId === 'All' && <Check className="w-3 h-3 text-purple-600" />}
                </button>
                {members.map((m) => {
                  const mId = m.user_id || m.id;
                  const isSel = selectedOwnerId === mId;
                  return (
                    <button
                      key={mId}
                      onClick={() => {
                        setSelectedOwnerId(mId);
                        setOwnerDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center justify-between ${
                        isSel ? 'text-purple-700 font-bold bg-purple-50' : 'text-slate-700'
                      }`}
                    >
                      <span className="truncate">{m.name || m.user?.name || m.email}</span>
                      {isSel && <Check className="w-3 h-3 text-purple-600" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Create Epic CTA */}
          <button
            onClick={() => setIsCreateEpicOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer ml-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Epic</span>
          </button>
        </div>

        {/* View Segmented Toggle */}
        <div className="flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold self-start md:self-auto">
          {['Weeks', 'Sprints', 'Months'].map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                viewMode === mode
                  ? 'bg-white text-purple-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Gantt Matrix Chart */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-x-auto">
        <div className="min-w-[900px]">
          {/* Header row: Timeline intervals */}
          <div className="grid grid-cols-12 border-b border-slate-200 text-xs font-semibold text-slate-600 divide-x divide-slate-100">
            <div className="col-span-4 p-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Epic Deliverables & Leads
            </div>
            {displaySprints.slice(0, 4).map((sprint) => {
              const isActive = sprint.status === 'ACTIVE' || sprint.isActive;
              const dateText = sprint.start_date && sprint.end_date
                ? `${new Date(sprint.start_date).toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${new Date(sprint.end_date).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
                : sprint.dates || '';

              return (
                <div 
                  key={sprint.id} 
                  className={`col-span-2 p-3 text-center ${
                    isActive ? 'bg-purple-50/70 border-t-2 border-t-purple-600' : 'bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span className={`text-xs font-bold ${isActive ? 'text-purple-700' : 'text-slate-800'}`}>
                      {sprint.name}
                    </span>
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-pulse" />
                    )}
                  </div>
                  {dateText && (
                    <div className="text-[10px] text-slate-400 mt-0.5">{dateText}</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Rows: Epics */}
          <div className="divide-y divide-slate-100 text-xs">
            {epicsWithTimeline.map((epic) => (
              <div 
                key={epic.id} 
                className="grid grid-cols-12 items-center hover:bg-slate-50/50 transition-colors divide-x divide-slate-100"
              >
                {/* Epic Metadata (4 cols) */}
                <div className="col-span-4 p-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                      EPIC
                    </span>
                    <span
                      onClick={() => setSelectedEpic(epic)}
                      className="font-bold text-slate-800 hover:text-purple-700 transition-colors cursor-pointer"
                    >
                      {epic.title}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 pl-1 flex items-center gap-2">
                    <span>Lead: {epic.lead}</span>
                    <span>•</span>
                    <span>{epic.childCount} child {epic.childCount === 1 ? 'task' : 'tasks'}</span>
                  </div>
                </div>

                {/* Timeline Visual Area (8 cols = 4 sprints * 2 cols each) */}
                <div className="col-span-8 p-3 relative grid grid-cols-4 gap-2">
                  <div 
                    onClick={() => setSelectedEpic(epic)}
                    className={`py-2 px-3 rounded-xl shadow-xs text-xs font-semibold flex items-center justify-between transition-transform hover:scale-[1.01] cursor-pointer ${epic.color}`}
                    style={{
                      gridColumnStart: epic.startCol,
                      gridColumnEnd: `span ${epic.spanCols}`,
                    }}
                  >
                    <span className="truncate">{epic.title}</span>
                    <span className="text-[10px] font-bold shrink-0 ml-2">{epic.progress}%</span>
                  </div>
                </div>
              </div>
            ))}

            {epicsWithTimeline.length === 0 && (
              <div className="p-12 text-center text-slate-400">
                <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-600">No Epics Available</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Create an epic deliverable to establish a milestone on your project roadmap.
                </p>
                <button
                  onClick={() => setIsCreateEpicOpen(true)}
                  className="mt-3 px-3 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Epic</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Epic Modal (reuses CreateIssueModal in Epic mode) */}
      <CreateIssueModal
        isOpen={isCreateEpicOpen}
        onClose={() => setIsCreateEpicOpen(false)}
        projectId={projectId}
        projectName={project?.name || ''}
        epics={epics}
        sprints={sprints}
        members={members}
        initialIssueType="Epic"
        allowedTypes={['Epic']}
        onCreateEpic={handleCreateEpic}
      />

      {/* Task Detail Modal */}
      <TaskDetailModal
        task={selectedEpic}
        isOpen={Boolean(selectedEpic)}
        onClose={() => setSelectedEpic(null)}
        onTaskUpdated={() => loadData()}
        onTaskDeleted={() => {
          setSelectedEpic(null);
          loadData();
        }}
        onToast={onToast}
      />
    </div>
  );
}
