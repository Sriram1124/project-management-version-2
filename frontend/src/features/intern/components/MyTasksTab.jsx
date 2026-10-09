import React, { useState } from 'react';
import { 
  CheckSquare, 
  Search, 
  Plus, 
  Clock, 
  AlertCircle, 
  Check, 
  CornerDownRight, 
  Calendar,
  Layers,
  Users,
  LayoutGrid,
  List,
  GitFork,
  Loader2
} from 'lucide-react';
import PersonalKanbanBoard from './PersonalKanbanBoard';
import HierarchyTreeView from './HierarchyTreeView';
import { workItemsService } from '../services/workItemsService';

export default function MyTasksTab({
  workItems = [],
  loading = false,
  onReload,
  onOpenTaskModal,
  onOpenCreatePersonalTask,
  onToggleTask,
  onToast,
  showViewSwitcher = true
}) {
  const [filterType, setFilterType] = useState('ALL'); // 'ALL' | 'DUE_TODAY' | 'OVERDUE' | 'IN_PROGRESS' | 'COMPLETED' | 'PERSONAL'
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('board'); // 'list' | 'board' | 'hierarchy'

  // Filtering
  const filteredItems = workItems.filter((item) => {
    const projectName = item.project?.name || item.project_name || '';
    const matchSearch =
      (item.title && item.title.toLowerCase().includes(search.toLowerCase())) ||
      (item.id && item.id.toLowerCase().includes(search.toLowerCase())) ||
      projectName.toLowerCase().includes(search.toLowerCase());

    if (!matchSearch) return false;

    // Filter tab
    if (filterType === 'DUE_TODAY') return workItemsService.isDueToday(item);
    if (filterType === 'OVERDUE') return workItemsService.isOverdue(item);
    if (filterType === 'IN_PROGRESS') return item.status === 'IN_PROGRESS';
    if (filterType === 'COMPLETED') return item.status === 'COMPLETED';
    if (filterType === 'PERSONAL') return item.project_id === null;
    return true;
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

  const getStatusBadge = (status) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-emerald-100 text-emerald-800';
      case 'IN_PROGRESS':
        return 'bg-purple-100 text-purple-800';
      case 'IN_REVIEW':
        return 'bg-blue-100 text-blue-800';
      case 'BLOCKED':
        return 'bg-rose-100 text-rose-800';
      case 'TODO':
        return 'bg-slate-100 text-slate-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-card">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-purple-600" />
            <span>My Work Items</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tasks, subtasks, and personal goals assigned specifically to you
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter my work..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-600 w-44 sm:w-52"
            />
          </div>

          <button
            type="button"
            onClick={onOpenCreatePersonalTask}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Personal Task</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs & 3-Way View Switcher (LIST, BOARD, HIERARCHY) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-2">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {[
            { id: 'ALL', label: 'All Work', count: workItems.length },
            { id: 'DUE_TODAY', label: 'Due Today', count: workItems.filter(w => workItemsService.isDueToday(w)).length },
            { id: 'OVERDUE', label: 'Overdue', count: workItems.filter(w => workItemsService.isOverdue(w)).length },
            { id: 'IN_PROGRESS', label: 'In Progress', count: workItems.filter(w => w.status === 'IN_PROGRESS' || w.status === 'IN_REVIEW').length },
            { id: 'COMPLETED', label: 'Completed', count: workItems.filter(w => w.status === 'COMPLETED').length },
            { id: 'PERSONAL', label: 'Personal Goals', count: workItems.filter(w => w.project_id === null).length }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                filterType === tab.id
                  ? 'bg-purple-600 text-white shadow-2xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    filterType === tab.id
                      ? 'bg-purple-800 text-white'
                      : tab.id === 'OVERDUE'
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 3-Way View Switcher: LIST, BOARD, HIERARCHY */}
        {showViewSwitcher && (
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs self-start md:self-auto shrink-0">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-semibold transition-all ${
                viewMode === 'list'
                  ? 'bg-white text-purple-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>LIST</span>
            </button>

            <button
              onClick={() => setViewMode('board')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-semibold transition-all ${
                viewMode === 'board'
                  ? 'bg-white text-purple-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>BOARD</span>
            </button>

            <button
              onClick={() => setViewMode('hierarchy')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-semibold transition-all ${
                viewMode === 'hierarchy'
                  ? 'bg-white text-purple-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GitFork className="w-3.5 h-3.5" />
              <span>HIERARCHY</span>
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-purple-600" />
          <h4 className="font-bold text-slate-800 text-sm">Loading your work items...</h4>
        </div>
      ) : workItems.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 text-slate-400">
          <CheckSquare className="w-10 h-10 mx-auto mb-3 text-purple-400" />
          <h4 className="font-bold text-slate-800 text-base">No Tasks Assigned Yet</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
            You currently have no tasks assigned to you across your projects. You can also create personal tasks and learning goals.
          </p>
          <div className="mt-4">
            <button
              onClick={onOpenCreatePersonalTask}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Personal Task</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* VIEW 1: BOARD (Personal Kanban) */}
          {viewMode === 'board' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 pb-1">
                <span>Personal Kanban Board (Showing your {filteredItems.length} active tickets)</span>
                <span>Drag cards between columns to update status</span>
              </div>
              <PersonalKanbanBoard
                workItems={filteredItems}
                onTaskClick={onOpenTaskModal}
                onTaskUpdated={onReload}
                onToast={onToast}
              />
            </div>
          )}

          {/* VIEW 2: HIERARCHY TREE */}
          {viewMode === 'hierarchy' && (
            <HierarchyTreeView
              workItems={filteredItems}
              onTaskClick={onOpenTaskModal}
              onToggleTask={onToggleTask}
            />
          )}

          {/* VIEW 3: LIST VIEW */}
          {viewMode === 'list' && (
            filteredItems.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 text-slate-400">
                <CheckSquare className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <h4 className="font-bold text-slate-700 text-sm">No tasks found</h4>
                <p className="text-xs text-slate-500 mt-1">
                  {search
                    ? 'No work items match your search filters.'
                    : 'You have no tasks in this category.'}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-card divide-y divide-slate-100 overflow-hidden">
                {filteredItems.map((item) => {
                  const isOverdue = workItemsService.isOverdue(item);
                  const isCompleted = item.status === 'COMPLETED';
                  const isPersonal = item.project_id === null;
                  const assigneesList = item.assignees || item.work_item_assignees || [];
                  const hasMultipleAssignees = assigneesList.length > 1;
                  const projectName = item.project?.name || item.project_name || (isPersonal ? 'Personal Goal' : 'Project Task');

                  return (
                    <div
                      key={item.id}
                      onClick={() => onOpenTaskModal?.(item)}
                      className={`p-4 flex items-center justify-between transition-colors cursor-pointer hover:bg-slate-50 select-none ${
                        isOverdue ? 'bg-rose-50/20' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-3">
                        {/* Complete checkbox */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleTask?.(item.id);
                          }}
                          className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors shrink-0 ${
                            isCompleted
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'border-slate-300 hover:border-purple-500 bg-white'
                          }`}
                        >
                          {isCompleted && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </button>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold text-slate-400">
                              {item.id}
                            </span>
                            <span
                              className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border ${getTypeStyle(
                                item.type
                              )}`}
                            >
                              {item.type}
                            </span>
                            {isPersonal && (
                              <span className="text-[9px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded">
                                Personal
                              </span>
                            )}
                            <h4
                              className={`text-xs font-bold truncate ${
                                isCompleted
                                  ? 'text-slate-500'
                                  : 'text-slate-800'
                              }`}
                            >
                              {item.title}
                            </h4>
                          </div>

                          <div className="flex items-center gap-2.5 text-[11px] text-slate-400 mt-1">
                            <span className="text-slate-600 font-medium">
                              {projectName}
                            </span>
                            <span>•</span>
                            <span
                              className={
                                isOverdue
                                  ? 'text-rose-600 font-bold'
                                  : workItemsService.isDueToday(item)
                                  ? 'text-amber-600 font-bold'
                                  : ''
                              }
                            >
                              {isOverdue
                                ? '⚠️ Overdue'
                                : workItemsService.isDueToday(item)
                                ? 'Due Today'
                                : item.due_date
                                ? `Due ${new Date(item.due_date).toLocaleDateString()}`
                                : 'No due date'}
                            </span>

                            {hasMultipleAssignees && (
                              <>
                                <span>•</span>
                                <span className="text-purple-600 font-medium flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  <span>{assigneesList.length} assignees</span>
                                </span>
                              </>
                            )}

                            {item.attachments?.length > 0 && (
                              <>
                                <span>•</span>
                                <span className="text-slate-500">
                                  📎 {item.attachments.length} files
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.priority === 'URGENT' || item.priority === 'HIGH'
                              ? 'text-amber-700 bg-amber-50 border border-amber-200'
                              : 'text-slate-600 bg-slate-100'
                          }`}
                        >
                          {item.priority}
                        </span>

                        <span
                          className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${getStatusBadge(
                            item.status
                          )}`}
                        >
                          {item.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
