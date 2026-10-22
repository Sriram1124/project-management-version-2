import React, { memo } from 'react';
import { 
  Search, 
  X, 
  Plus, 
  Filter, 
  ChevronDown 
} from 'lucide-react';

export const RoadmapToolbar = memo(function RoadmapToolbar({
  search,
  onSearchChange,
  viewMode,
  onViewModeChange,
  zoomLevel,
  onZoomLevelChange,
  typeFilter,
  onTypeFilterChange,
  statusFilter,
  onStatusFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  assigneeFilter,
  onAssigneeFilterChange,
  members,
  hasActiveFilters,
  onClearFilters,
  isKanban,
  readOnly,
  onOpenCreate,
  hasEpics,
  onExpandAll,
  onCollapseAll,
}) {
  return (
    <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
      {/* ROW 1: Search Box & View Mode / Zoom / Primary CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search Box */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search deliverables, Epics, Stories..."
            className="w-full pl-8 pr-7 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
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
                onClick={() => onViewModeChange('deliverables')}
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
                onClick={() => onViewModeChange('cycles')}
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
                onClick={() => onZoomLevelChange('weeks')}
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
                onClick={() => onZoomLevelChange('months')}
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
              onClick={onOpenCreate}
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
              onChange={(e) => onTypeFilterChange(e.target.value)}
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
              onChange={(e) => onStatusFilterChange(e.target.value)}
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
              onChange={(e) => onPriorityFilterChange(e.target.value)}
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
              onChange={(e) => onAssigneeFilterChange(e.target.value)}
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
              onClick={onClearFilters}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {/* Right: Expand / Collapse All Epics */}
        {viewMode === 'deliverables' && hasEpics && (
          <div className="flex items-center gap-1.5 self-end md:self-auto text-xs text-slate-500">
            <button
              type="button"
              onClick={onExpandAll}
              title="Expand all Epics"
              className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-purple-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Expand All
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={onCollapseAll}
              title="Collapse all Epics"
              className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-purple-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Collapse All
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

