import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  FolderKanban, 
  Calendar, 
  Clock, 
  FileText, 
  CheckSquare, 
  Users, 
  Zap, 
  Download, 
  CheckCircle2, 
  MessageSquare,
  ShieldCheck,
  ChevronRight,
  ListTodo,
  FileQuestion,
  Layers,
  Sparkles,
  Search,
  Check,
  Loader2,
  AlertCircle,
  LayoutGrid,
  List,
  GitFork
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { projectsService } from '../../../services/projects.service';
import { workItemsService } from '../../../services/workItems.service';
import FilePreviewModal from '../../../components/views/projects/FilePreviewModal';
import PersonalKanbanBoard from './PersonalKanbanBoard';
import HierarchyTreeView from './HierarchyTreeView';
import ProjectSprintWorkspaceTab from '../../../components/views/projects/ProjectSprintWorkspaceTab';
import ProjectCycleWorkspaceTab from '../../../components/views/projects/ProjectCycleWorkspaceTab';
import ProjectMethodologyBadge from '../../../components/views/projects/ProjectMethodologyBadge';

export default function ScopedProjectView({
  project,
  onBack,
  onTaskClick,
  onToast
}) {
  const { user: authUser } = useAuth();
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'documents' | 'work' | 'sprint' | 'kanban' | 'mom'
  const [previewFile, setPreviewFile] = useState(null);

  // Project Work Items State
  const [projectWorkItems, setProjectWorkItems] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [taskFilter, setTaskFilter] = useState('ALL'); // 'ALL' | 'ASSIGNED_TO_ME' | 'TODO' | 'IN_PROGRESS' | 'COMPLETED'
  const [taskSearch, setTaskSearch] = useState('');
  const [workViewMode, setWorkViewMode] = useState('list'); // 'list' | 'hierarchy'

  const loadProjectWorkItems = async () => {
    if (!project?.id) return;
    try {
      setLoadingTasks(true);
      const items = await workItemsService.listWorkItems({ project_id: project.id });
      setProjectWorkItems(items || []);
    } catch (err) {
      console.error('Failed to load project work items:', err);
    } finally {
      setLoadingTasks(false);
    }
  };

  const authRole = String(authUser?.role?.name || authUser?.role || authUser?.type || authUser?.user_type || '').toUpperCase();
  const authUserId = authUser?.id || authUser?.user_id || authUser?.userId || authUser?.user?.id;
  const isIntern = authRole === 'INTERN';

  const canToggleItem = (item) => {
    if (!isIntern) return true;
    const assignees = item.assignees || item.work_item_assignees || [];
    const assignedUserIds = [
      ...assignees.map((a) => a.user_id || a.userId || a.assignee_id || a.user?.id || a.id),
      ...(item.assignee_ids || item.assigneeIds || []),
    ].filter(Boolean).map(String);
    return Boolean(authUserId) && assignedUserIds.includes(String(authUserId));
  };

  useEffect(() => {
    loadProjectWorkItems();
  }, [project?.id]);

  const handleToggleTask = async (taskOrId) => {
    const targetItem = typeof taskOrId === 'object' ? taskOrId : projectWorkItems.find((w) => w.id === taskOrId);
    if (targetItem && !canToggleItem(targetItem)) {
      onToast?.('You can only update status for tasks assigned to you.');
      return;
    }
    try {
      const updated = await workItemsService.toggleComplete(taskOrId);
      loadProjectWorkItems();
      onToast?.(
        updated?.status === 'COMPLETED'
          ? `Marked "${updated.title}" completed!`
          : `Reopened "${updated?.title}"`
      );
    } catch (err) {
      onToast?.(err.message || 'Failed to update task status');
    }
  };

  if (!project) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
        <FolderKanban className="w-8 h-8 text-slate-400 mx-auto" />
        <h3 className="text-sm font-bold text-slate-800">Project Not Found</h3>
        <p className="text-xs text-slate-500">The requested project could not be loaded or is no longer accessible.</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-semibold hover:bg-purple-700 transition-colors"
        >
          Back to My Projects
        </button>
      </div>
    );
  }

  const documents = project.documents || [];
  const members = project.members || [];
  const ownerName = project.lead?.name || project.owner?.name || 'Project Owner';

  const handleDownloadDoc = async (doc) => {
    if (!project?.id) return;
    try {
      onToast?.(`Downloading ${doc.name}...`);
      await projectsService.downloadDocument(project.id, doc.id, doc.name);
    } catch (err) {
      onToast?.(err?.message || 'Failed to download document');
    }
  };

  const handlePreviewDoc = (doc) => {
    const ext = (doc.name ? doc.name.split('.').pop().toLowerCase() : (doc.type || 'file'));
    const isImg = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext);
    setPreviewFile({
      id: doc.id,
      name: doc.name,
      type: ext,
      uploadedAt: doc.updated || 'Recently',
      isImage: isImg,
    });
  };

  const isKanban = project?.methodology === 'KANBAN';

  useEffect(() => {
    if (isKanban && (activeTab === 'sprint' || activeTab === 'cycles')) {
      setActiveTab('kanban');
    } else if (!isKanban && activeTab === 'cycles') {
      setActiveTab('sprint');
    }
  }, [isKanban, activeTab]);

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'documents', label: `Project Documents (${documents.length})` },
    { id: 'work', label: `Work Items (${projectWorkItems.length})` },
    { id: 'action-items', label: 'Action Items' },
    { id: 'kanban', label: isKanban ? 'Kanban Board' : 'Scrum Board' },
    ...(!isKanban ? [{ id: 'sprint', label: 'Sprint Workspace' }] : []),
  ];

  return (
    <div className="space-y-4">
      {/* Top Context & Navigation Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-card space-y-3">
        {/* Row 1: Back Button & Project Metadata */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
              title="Back to My Projects"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold text-slate-400">
                  {project.code || (project.id ? project.id.slice(0, 8).toUpperCase() : 'PROJ')}
                </span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                  {project.status || 'ACTIVE'}
                </span>
                <ProjectMethodologyBadge methodology={project.methodology} />
              </div>
              <h2 className="text-base font-bold text-slate-900 mt-0.5">
                {project.name}
              </h2>
            </div>
          </div>

          {/* Intern's Role Context Callout */}
          <div className="flex items-center gap-3 text-xs bg-purple-50/70 border border-purple-100 px-3.5 py-1.5 rounded-xl self-start sm:self-auto">
            <div className="flex items-center gap-1.5 text-purple-900 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
              <span>Project Owner: {ownerName}</span>
            </div>
            <span className="text-purple-300">·</span>
            <span className="text-purple-700 font-medium">
              Role: {authUser?.role || 'Intern'}
            </span>
          </div>
        </div>

        {/* Row 2: Scoped Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pt-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-purple-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card space-y-5">
            {/* Scope */}
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1.5">
                Project Scope & Objective
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                {project.description || 'No description provided.'}
              </p>
            </div>

            {/* Project Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">
                  Project Owner
                </span>
                <span className="text-sm font-bold text-slate-800 mt-1 block">
                  {ownerName}
                </span>
                <span className="text-[10px] text-slate-500">Project Lead</span>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">
                  Timeline
                </span>
                <span className="text-sm font-bold text-slate-800 mt-1 block">
                  {project.startDate || 'TBD'} - {project.endDate || 'TBD'}
                </span>
                <span className="text-[10px] text-slate-500">Scheduled Duration</span>
              </div>
            </div>

            {/* Team Members List */}
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                Project Team Members ({members.length})
              </h3>
              {members.length === 0 ? (
                <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-500">
                  No other members currently assigned to this project.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-2.5"
                    >
                      <img
                        src={m.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.name)}&background=random`}
                        alt={m.name}
                        className="w-7 h-7 rounded-full object-cover border border-slate-200"
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-800 block truncate">
                          {m.name}
                        </span>
                        <span className="text-[10px] text-slate-400 block truncate">
                          {m.email || 'Team Member'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Project Documents */}
      {activeTab === 'documents' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Official Project Specifications & Documents
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Centralized project documentation uploaded and managed for this project
              </p>
            </div>
          </div>

          {documents.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-200 rounded-2xl space-y-2">
              <FileQuestion className="w-8 h-8 text-slate-300 mx-auto" />
              <h4 className="text-sm font-bold text-slate-700">No project documents yet</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Documents uploaded to this project will appear here for all team members.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {documents.map((doc) => {
                const ext = (doc.name.split('.').pop() || 'FILE').toUpperCase();
                return (
                  <div
                    key={doc.id}
                    onClick={() => handlePreviewDoc(doc)}
                    className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between hover:border-purple-200 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-[10px] shrink-0">
                        {ext}
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-slate-800 text-xs block truncate" title={doc.name}>
                          {doc.name}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Uploaded {doc.updated || 'Recently'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadDoc(doc);
                      }}
                      className="px-2.5 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-100 rounded-lg transition-colors shrink-0 cursor-pointer"
                    >
                      Download
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          projectId={project.id}
          onClose={() => setPreviewFile(null)}
          onDownload={(f) => handleDownloadDoc(f)}
        />
      )}

      {/* Tab 3: Work Items (Live Data) */}
      {activeTab === 'work' && (() => {
        const getTypeBadge = (type) => {
          switch (type) {
            case 'EPIC':
              return 'bg-purple-100 text-purple-800 border-purple-200';
            case 'STORY':
              return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            case 'TASK':
              return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'SUBTASK':
              return 'bg-slate-100 text-slate-800 border-slate-200';
            case 'BUG':
              return 'bg-rose-100 text-rose-800 border-rose-200';
            default:
              return 'bg-slate-100 text-slate-800 border-slate-200';
          }
        };

        const getStatusBadge = (status) => {
          switch (status) {
            case 'COMPLETED':
              return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            case 'IN_PROGRESS':
              return 'bg-purple-100 text-purple-800 border-purple-200';
            case 'IN_REVIEW':
              return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'BLOCKED':
              return 'bg-rose-100 text-rose-800 border-rose-200';
            case 'TODO':
            default:
              return 'bg-slate-100 text-slate-700 border-slate-200';
          }
        };

        const filteredTasks = projectWorkItems.filter((item) => {
          const matchSearch =
            !taskSearch ||
            (item.title && item.title.toLowerCase().includes(taskSearch.toLowerCase())) ||
            (item.id && item.id.toLowerCase().includes(taskSearch.toLowerCase()));
          if (!matchSearch) return false;

          if (taskFilter === 'ASSIGNED_TO_ME') {
            const isAssigned = item.assignees?.some(
              (a) => a.user_id === authUser?.id || a.email === authUser?.email
            );
            if (!isAssigned) return false;
          } else if (taskFilter === 'TODO') {
            if (item.status !== 'TODO') return false;
          } else if (taskFilter === 'IN_PROGRESS') {
            if (item.status !== 'IN_PROGRESS') return false;
          } else if (taskFilter === 'COMPLETED') {
            if (item.status !== 'COMPLETED') return false;
          }
          return true;
        });

        return (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    placeholder="Search tasks..."
                    className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 w-48 sm:w-60"
                  />
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200 text-xs">
                  {[
                    { id: 'ALL', label: 'All' },
                    { id: 'ASSIGNED_TO_ME', label: 'Assigned to Me' },
                    { id: 'TODO', label: 'To Do' },
                    { id: 'IN_PROGRESS', label: 'In Progress' },
                    { id: 'COMPLETED', label: 'Done' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setTaskFilter(f.id)}
                      className={`px-2.5 py-1 rounded-lg font-medium text-[11px] transition-colors ${
                        taskFilter === f.id
                          ? 'bg-white text-purple-700 font-bold shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setWorkViewMode('list')}
                  className={`p-1.5 rounded-lg transition-colors ${
                    workViewMode === 'list'
                      ? 'bg-white text-purple-700 shadow-2xs font-semibold'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                  title="List View"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setWorkViewMode('hierarchy')}
                  className={`p-1.5 rounded-lg transition-colors ${
                    workViewMode === 'hierarchy'
                      ? 'bg-white text-purple-700 shadow-2xs font-semibold'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                  title="Hierarchy Tree View"
                >
                  <GitFork className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Loading */}
            {loadingTasks && (
              <div className="py-12 bg-white rounded-2xl border border-slate-200 text-center">
                <Loader2 className="w-8 h-8 text-purple-600 animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-500">Loading project work items...</p>
              </div>
            )}

            {/* Empty State */}
            {!loadingTasks && filteredTasks.length === 0 && (
              <div className="py-12 bg-white rounded-2xl border border-dashed border-slate-200 text-center space-y-2">
                <CheckSquare className="w-8 h-8 text-slate-300 mx-auto" />
                <h4 className="text-sm font-bold text-slate-700">No work items found</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {taskFilter === 'ASSIGNED_TO_ME'
                    ? 'You do not have any tasks assigned in this project yet.'
                    : 'Work items added to this project will appear here.'}
                </p>
              </div>
            )}

            {/* Tree View */}
            {!loadingTasks && filteredTasks.length > 0 && workViewMode === 'hierarchy' && (
              <HierarchyTreeView
                workItems={filteredTasks}
                onTaskClick={onTaskClick}
                onToggleTask={handleToggleTask}
              />
            )}

            {/* List View */}
            {!loadingTasks && filteredTasks.length > 0 && workViewMode === 'list' && (
              <div className="space-y-2">
                {filteredTasks.map((item) => {
                  const isDone = item.status === 'COMPLETED';
                  const isOverdue = workItemsService.isOverdue(item);

                  const canToggle = canToggleItem(item);

                  return (
                    <div
                      key={item.id}
                      onClick={() => onTaskClick?.(item)}
                      className={`p-3.5 bg-white border rounded-xl flex items-center justify-between gap-3 hover:border-purple-200 hover:shadow-2xs transition-all cursor-pointer ${
                        isOverdue ? 'border-rose-200 bg-rose-50/20' : 'border-slate-200'
                      }`}
                    >
                      {/* Left: Checkbox + Title + Type Badge */}
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          disabled={!canToggle}
                          title={!canToggle ? 'Only the assigned intern or manager can update status' : undefined}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleTask(item);
                          }}
                          className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-colors shrink-0 ${
                            !canToggle ? 'opacity-40 cursor-not-allowed ' : 'cursor-pointer '
                          }${
                            isDone
                              ? 'bg-emerald-500 border-emerald-500 text-white'
                              : 'border-slate-300 hover:border-purple-500'
                          }`}
                        >
                          {isDone && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </button>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${getTypeBadge(
                                item.type
                              )}`}
                            >
                              {item.type}
                            </span>
                            <span
                              className={`text-xs font-bold truncate ${
                                isDone ? 'text-slate-500' : 'text-slate-800'
                              }`}
                            >
                              {item.title}
                            </span>
                          </div>
                          {item.description && (
                            <p className="text-[11px] text-slate-400 truncate max-w-md mt-0.5">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right: Meta pills */}
                      <div className="flex items-center gap-2 shrink-0">
                        {item.due_date && (
                          <span
                            className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded ${
                              isOverdue
                                ? 'bg-rose-50 text-rose-600 font-bold'
                                : 'bg-slate-50 text-slate-500'
                            }`}
                          >
                            <Calendar className="w-3 h-3" />
                            {new Date(item.due_date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        )}

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${getStatusBadge(
                            item.status
                          )}`}
                        >
                          {item.status?.replace('_', ' ')}
                        </span>

                        <ChevronRight className="w-4 h-4 text-slate-300" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Tab 4: Kanban Board (Live Data) */}
      {activeTab === 'kanban' && (
        <PersonalKanbanBoard
          workItems={projectWorkItems}
          onTaskClick={onTaskClick}
          onTaskUpdated={loadProjectWorkItems}
          onToast={onToast}
        />
      )}

      {/* Tab 5: Sprint Workspace (Scrum) */}
      {activeTab === 'sprint' && !isKanban && (
        <ProjectSprintWorkspaceTab
          projectId={project.id}
          onToast={onToast}
          readOnly={true}
        />
      )}

      {/* Tab 6: Action Items Placeholder (Planned for V2) */}
      {activeTab === 'action-items' && (
        <div className="bg-white rounded-2xl p-12 border border-slate-200 shadow-card text-center max-w-lg mx-auto my-8 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-1">
            <MessageSquare className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Action Items</h3>
          <p className="text-xs text-slate-500 leading-relaxed max-w-md mx-auto">
            Action Items module will be available in V2.
          </p>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            Planned for V2
          </span>
        </div>
      )}
    </div>
  );
}
