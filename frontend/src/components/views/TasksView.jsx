import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, 
  CheckSquare, 
  Plus, 
  Loader2, 
  AlertCircle, 
  Calendar, 
  User, 
  Clock, 
  FolderKanban,
  Filter,
  Layers,
  ChevronRight
} from 'lucide-react';
import { workItemsService } from '../../services/workItems.service';
import { projectsService } from '../../services/projects.service';
import AddTaskModal from '../kanban/AddTaskModal';
import TaskDetailModal from '../kanban/TaskDetailModal';

const STATUS_TABS = [
  { id: 'ALL', label: 'All' },
  { id: 'TODO', label: 'To Do' },
  { id: 'IN_PROGRESS', label: 'In Progress' },
  { id: 'IN_REVIEW', label: 'In Review' },
  { id: 'COMPLETED', label: 'Completed' },
  { id: 'BLOCKED', label: 'Blocked' },
];

export default function TasksView({ projectId = null, onToast }) {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || '');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

  // Load projects list if not locked to a specific project
  useEffect(() => {
    if (!projectId) {
      projectsService
        .getProjects()
        .then((list) => setProjects(list || []))
        .catch((err) => console.error('Failed to load projects in TasksView:', err));
    }
  }, [projectId]);

  // Load work items from backend
  const loadWorkItems = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const targetProj = projectId || (selectedProjectId ? selectedProjectId : undefined);
      const filters = {};
      if (targetProj) filters.project_id = targetProj;
      if (statusFilter !== 'ALL') filters.status = statusFilter;
      if (typeFilter !== 'ALL') filters.type = typeFilter;

      const items = await workItemsService.listWorkItems(filters);
      setTasks(items || []);
    } catch (err) {
      console.error('Failed to load work items:', err);
      setError(err.message || 'Failed to load work items');
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedProjectId, statusFilter, typeFilter]);

  useEffect(() => {
    loadWorkItems();
  }, [loadWorkItems]);

  const filteredTasks = tasks.filter((t) => {
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    const matchTitle = t.title && t.title.toLowerCase().includes(query);
    const matchId = t.id && t.id.toLowerCase().includes(query);
    const matchProject = t.project?.name && t.project.name.toLowerCase().includes(query);
    const matchAssignee = t.assignees?.some(
      (a) => (a.name && a.name.toLowerCase().includes(query)) || (a.email && a.email.toLowerCase().includes(query))
    );
    return matchTitle || matchId || matchProject || matchAssignee;
  });

  const getTypeStyle = (type) => {
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

  const getPriorityStyle = (priority) => {
    switch (priority) {
      case 'URGENT':
        return 'bg-rose-50 text-rose-700 border-rose-200 font-bold';
      case 'HIGH':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'MEDIUM':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'LOW':
        return 'bg-slate-50 text-slate-600 border-slate-200';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'IN_PROGRESS':
        return 'bg-purple-50 text-purple-700 border-purple-200 font-semibold';
      case 'IN_REVIEW':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'BLOCKED':
        return 'bg-rose-50 text-rose-700 border-rose-200 font-bold';
      case 'TODO':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-purple-600" />
            <span>Work Management</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Operational deliverables, epics, stories, and tasks across projects
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Project Dropdown Filter (if not locked to a specific project) */}
          {!projectId && (
            <div className="flex items-center gap-1.5">
              <FolderKanban className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="py-1 px-2.5 text-xs rounded-lg bg-white border border-slate-200 text-slate-800 font-medium focus:outline-none focus:border-purple-600"
              >
                <option value="">All Projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search work items..."
              className="pl-8 pr-3 py-1 text-xs rounded-lg bg-white border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-600 w-44 sm:w-56"
            />
          </div>

          {/* Create Button */}
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Work Item</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs & Issue Type Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-2">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto min-w-0 max-w-full">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-purple-50 border border-purple-300 text-purple-700 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Type Filter */}
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Filter className="w-3.5 h-3.5" />
          <span>Type:</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="py-0.5 px-2 text-xs rounded-md bg-white border border-slate-200 text-slate-700 focus:outline-none focus:border-purple-600"
          >
            <option value="ALL">All Types</option>
            <option value="EPIC">Epics</option>
            <option value="STORY">Stories</option>
            <option value="TASK">Tasks</option>
            <option value="SUBTASK">Subtasks</option>
            <option value="BUG">Bugs</option>
          </select>
        </div>
      </div>

      {/* Main Content: Loading, Error, Empty, or Table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-600" />
          <span className="text-xs font-medium">Loading work items from server...</span>
        </div>
      ) : error ? (
        <div className="bg-white rounded-xl border border-rose-200 p-8 text-center text-rose-700 space-y-3">
          <AlertCircle className="w-8 h-8 mx-auto text-rose-500" />
          <h4 className="text-sm font-bold">Failed to load work items</h4>
          <p className="text-xs text-rose-600">{error}</p>
          <button
            onClick={loadWorkItems}
            className="px-3.5 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <CheckSquare className="w-10 h-10 text-purple-400 mx-auto mb-3" />
          <h3 className="font-bold text-slate-800 text-base">No Work Items Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
            {search || statusFilter !== 'ALL' || typeFilter !== 'ALL'
              ? 'No tickets match the selected filters.'
              : 'There are no work items created in this view yet.'}
          </p>
          <div className="mt-4">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Work Item</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs min-w-0 max-w-full">
          <div className="overflow-x-auto min-w-0 max-w-full">
            <table className="w-full text-left text-xs border-collapse table-auto md:table-fixed">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3.5 w-18 md:w-20 shrink-0">Type</th>
                  <th className="py-2.5 px-3.5 md:w-[32%] min-w-[150px]">Title</th>
                  <th className="py-2.5 px-3.5 md:w-[16%] min-w-[100px]">Project</th>
                  <th className="py-2.5 px-3.5 md:w-[18%] min-w-[110px]">Assignees</th>
                  <th className="py-2.5 px-3.5 w-20 md:w-24 shrink-0">Priority</th>
                  <th className="py-2.5 px-3.5 w-24 md:w-28 shrink-0">Status</th>
                  <th className="py-2.5 px-3.5 w-24 md:w-28 shrink-0">Due Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredTasks.map((task) => {
                  const isOverdue = task.is_overdue || workItemsService.isOverdue(task);
                  const assigneesText = task.assignees && task.assignees.length > 0
                    ? task.assignees.map((a) => a.name || a.email || 'Member').join(', ')
                    : 'Unassigned';

                  return (
                    <tr
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className="hover:bg-purple-50/40 transition-colors cursor-pointer group"
                    >
                      {/* Type Badge */}
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${getTypeStyle(
                            task.type
                          )}`}
                        >
                          {task.type}
                        </span>
                      </td>

                      {/* Title & Parent Hierarchy indicator */}
                      <td className="py-2.5 px-3.5 min-w-0">
                        <div className="flex flex-col min-w-0">
                          <span
                            className="text-slate-900 font-semibold group-hover:text-purple-700 transition-colors truncate block"
                            title={task.title}
                          >
                            {task.title}
                          </span>
                          {task.parent && (
                            <span
                              className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5 truncate"
                              title={`[${task.parent.type}] ${task.parent.title}`}
                            >
                              <span className="text-slate-300 shrink-0">↳</span>
                              <span className="truncate">[{task.parent.type}] {task.parent.title}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Project */}
                      <td className="py-2.5 px-3.5 text-slate-600 min-w-0">
                        {task.project?.name ? (
                          <span className="truncate block" title={task.project.name}>
                            {task.project.name}
                          </span>
                        ) : (
                          <span className="text-[10px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">
                            Personal
                          </span>
                        )}
                      </td>

                      {/* Assignees */}
                      <td className="py-2.5 px-3.5 min-w-0">
                        {task.assignees && task.assignees.length > 0 ? (
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-slate-700 text-xs truncate block" title={assigneesText}>
                              {assigneesText}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px] whitespace-nowrap">Unassigned</span>
                        )}
                      </td>

                      {/* Priority */}
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-medium border ${getPriorityStyle(
                            task.priority
                          )}`}
                        >
                          {task.priority}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-medium border ${getStatusBadge(
                            task.status
                          )}`}
                        >
                          {task.status.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Due Date & Overdue */}
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-[11px]">
                          {task.due_date ? (
                            <>
                              <Clock
                                className={`w-3 h-3 shrink-0 ${isOverdue ? 'text-rose-600' : 'text-slate-400'}`}
                              />
                              <span className={isOverdue ? 'text-rose-600 font-bold' : 'text-slate-600'}>
                                {new Date(task.due_date).toLocaleDateString()}
                              </span>
                              {isOverdue && (
                                <span className="text-[9px] px-1 py-0.2 bg-rose-100 text-rose-700 font-bold rounded shrink-0">
                                  OVERDUE
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-400 text-[11px]">No due date</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      <AddTaskModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        projectId={projectId || selectedProjectId || null}
        onTaskCreated={() => {
          loadWorkItems();
        }}
        onToast={onToast}
      />

      {/* Task Detail Modal */}
      <TaskDetailModal
        task={selectedTask}
        isOpen={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
        onTaskUpdated={() => {
          loadWorkItems();
        }}
        onTaskDeleted={() => {
          loadWorkItems();
        }}
        onToast={onToast}
      />
    </div>
  );
}
