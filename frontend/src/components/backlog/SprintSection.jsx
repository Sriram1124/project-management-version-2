import React, { useState } from 'react';
import HierarchicalIssueTable from './HierarchicalIssueTable';
import { 
  ChevronDown, 
  ChevronRight, 
  Plus, 
  Check, 
  Play, 
  Calendar 
} from 'lucide-react';

export default function SprintSection({
  sprint,
  issues = [],
  allWorkItems = [],
  sprints = [],
  members = [],
  selectedIssueId,
  onSelectIssue,
  onUpdateStatus,
  onUpdatePriority,
  onUpdateAssignee,
  onUpdateSprint,
  onUpdateStoryPoints,
  onUpdateDueDate,
  onDeleteIssue,
  onAddChild,
  expandedIds,
  onToggleExpand,
  onDragStart,
  onDragEnd,
  onDropIssue,
  onCreateIssueInSprint,
  onCompleteSprint,
  onStartSprint,
  hasActiveFilters = false,
}) {
  const [isSectionOpen, setIsSectionOpen] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);

  // Calculate totals from real database fields
  const totalSP = issues.reduce((acc, curr) => acc + (Number(curr.story_points) || 0), 0);
  const completedCount = issues.filter(
    (i) => String(i.status).toUpperCase() === 'COMPLETED' || String(i.status).toUpperCase() === 'DONE'
  ).length;

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const issueId = e.dataTransfer.getData('text/plain');
    if (issueId) {
      onDropIssue?.(issueId, sprint.id);
    }
  };

  const isBacklog = sprint.id === 'backlog';
  const isActive = sprint.status === 'ACTIVE';

  const formattedDates = sprint.startDate && sprint.endDate
    ? `${new Date(sprint.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(sprint.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : sprint.dates || null;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rounded-md border transition-colors select-none ${
        isDragOver
          ? 'border-purple-400 bg-purple-50/30'
          : 'border-slate-200 bg-white'
      }`}
    >
      {/* Sprint Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-slate-50/90 border-b border-slate-200 rounded-t-md text-xs">
        {/* Left: Expander, Name, Badge, Dates, Stats */}
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <button
            type="button"
            onClick={() => setIsSectionOpen(!isSectionOpen)}
            className="text-slate-500 hover:text-slate-800 p-0.5 rounded transition-colors"
          >
            {isSectionOpen ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>

          <h3 className="font-bold text-slate-900 tracking-tight">
            {sprint.name}
          </h3>

          {/* Status Badge */}
          {isActive ? (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200/80 uppercase tracking-wider">
              Active Sprint
            </span>
          ) : !isBacklog ? (
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200/70 text-slate-700 uppercase tracking-wider">
              Planned
            </span>
          ) : null}

          {/* Dates */}
          {!isBacklog && formattedDates && (
            <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
              <Calendar className="w-3 h-3 text-slate-400" />
              <span>{formattedDates}</span>
            </div>
          )}

          {/* Issue Count & Story Points */}
          <span className="text-[11px] text-slate-400">
            · {issues.length} {issues.length === 1 ? 'issue' : 'issues'}
            {totalSP > 0 && ` · ${totalSP} SP`}
            {isActive && completedCount > 0 && ` (${completedCount} done)`}
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
          {isActive ? (
            <button
              type="button"
              onClick={() => onCompleteSprint?.(sprint.id)}
              className="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors flex items-center gap-1"
            >
              <Check className="w-3 h-3 text-emerald-600" />
              <span>Complete sprint</span>
            </button>
          ) : !isBacklog ? (
            <button
              type="button"
              onClick={() => onStartSprint?.(sprint.id)}
              title={
                sprints?.find((s) => s.id !== sprint.id && s.status === 'ACTIVE')
                  ? `Cannot start sprint: Sprint "${sprints.find((s) => s.id !== sprint.id && s.status === 'ACTIVE').name}" is currently active`
                  : `Start ${sprint.name}`
              }
              className="px-2.5 py-1 rounded-md border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Play className="w-3 h-3 fill-purple-600 text-purple-600" />
              <span>Start sprint</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => onCreateIssueInSprint?.(sprint.id)}
            className="px-2 py-1 rounded-md text-slate-600 hover:text-purple-700 hover:bg-slate-100 text-xs font-medium transition-colors flex items-center gap-1"
            title={`Add issue to ${sprint.name}`}
          >
            <Plus className="w-3 h-3" />
            <span>Create</span>
          </button>
        </div>
      </div>

      {/* Issues Table */}
      {isSectionOpen && (
        <HierarchicalIssueTable
          issues={issues}
          allWorkItems={allWorkItems}
          sprints={sprints}
          members={members}
          selectedIssueId={selectedIssueId}
          onSelectIssue={onSelectIssue}
          onUpdateStatus={onUpdateStatus}
          onUpdatePriority={onUpdatePriority}
          onUpdateAssignee={onUpdateAssignee}
          onUpdateSprint={onUpdateSprint}
          onUpdateStoryPoints={onUpdateStoryPoints}
          onUpdateDueDate={onUpdateDueDate}
          onDeleteIssue={onDeleteIssue}
          onAddChild={onAddChild}
          expandedIds={expandedIds}
          onToggleExpand={onToggleExpand}
          isHierarchical={true}
          hasActiveFilters={hasActiveFilters}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          emptyMessage={`No issues in ${sprint.name}. Drag issues here or click Create to add one.`}
        />
      )}
    </div>
  );
}
