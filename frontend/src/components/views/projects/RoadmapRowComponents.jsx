import React, { memo } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  User, 
  Plus, 
  Flag, 
  Layers 
} from 'lucide-react';

/**
 * RoadmapHierarchyCell
 * Memoized left pane cell rendering the deliverable hierarchy tree, expand/collapse toggles,
 * item type icon, title, assignee avatar, status badge, and story points.
 */
export const RoadmapHierarchyCell = memo(function RoadmapHierarchyCell({
  row,
  typeMeta,
  statusMeta,
  onSelectTask,
  onToggleEpic,
  onAddChild,
  readOnly,
}) {
  const item = row.item;
  const isEpic = row.isEpic;
  const Icon = typeMeta.icon;
  const primaryAssignee = item.assignees?.[0] || item.assignee;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelectTask(item)}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelectTask(item);
        }
      }}
      className={`h-12 px-3 flex items-center text-xs transition-colors group select-none ${
        isEpic ? 'bg-purple-50/20 font-semibold' : ''
      }`}
    >
      {/* Column 1: Deliverable Hierarchy (Expand toggle, Icon, Title) */}
      <div
        className="flex-1 min-w-0 flex items-center gap-1.5 pr-2"
        style={{ paddingLeft: `${row.level * 16}px` }}
      >
        {isEpic ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleEpic(item.id);
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
                  onAddChild(item);
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

      {/* Column 2: Assignee */}
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

      {/* Column 3: Status */}
      <div className="w-24 flex items-center justify-center shrink-0">
        <span className={`w-full text-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border truncate ${statusMeta.badgeClass}`}>
          {statusMeta.label}
        </span>
      </div>

      {/* Column 4: Story Points */}
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
});

/**
 * RoadmapTimelineBarCell
 * Memoized timeline bar or milestone marker. Uses precalculated geometry to eliminate
 * date parsing, Math.min/max, and toLocaleDateString during render.
 */
export const RoadmapTimelineBarCell = memo(function RoadmapTimelineBarCell({
  row,
  geometry,
  statusMeta,
  onSelectTask,
}) {
  const item = row.item;
  const isEpic = row.isEpic;

  if (!geometry) {
    return <div className="h-12 relative flex items-center px-2" />;
  }

  const { leftPercent, widthPercent, isSingleMilestone, dueLabel, dateTooltip } = geometry;

  return (
    <div className="h-12 relative flex items-center px-2">
      {isSingleMilestone ? (
        // Single Date Milestone Marker
        <button
          type="button"
          onClick={() => onSelectTask(item)}
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
          onClick={() => onSelectTask(item)}
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
              <span
                className="text-[8px] bg-black/25 px-1 py-0.2 rounded font-sans uppercase tracking-wider"
                title="Timeline derived from child deliverable dates"
              >
                Derived
              </span>
            ) : null}
            <span>{row.progress}%</span>
          </div>
        </button>
      )}
    </div>
  );
});

/**
 * RoadmapVirtualRow
 * Single unified row component combining sticky Left Hierarchy Cell and Right Timeline Bar.
 * Guarantees zero height/scroll desynchronization.
 */
export const RoadmapVirtualRow = memo(function RoadmapVirtualRow({
  row,
  geometry,
  typeMeta,
  statusMeta,
  top,
  timelineWidth,
  onSelectTask,
  onToggleEpic,
  onAddChild,
  readOnly,
}) {
  return (
    <div
      className="h-12 flex border-b border-slate-100 group hover:bg-purple-50/20 transition-colors"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        transform: `translateY(${top}px)`,
        height: '48px',
        contain: 'layout style',
      }}
    >
      {/* Sticky Left Hierarchy Cell */}
      <div className="w-[480px] shrink-0 sticky left-0 z-20 bg-white group-hover:bg-purple-50/40 border-r border-slate-200 shadow-xs">
        <RoadmapHierarchyCell
          row={row}
          typeMeta={typeMeta}
          statusMeta={statusMeta}
          onSelectTask={onSelectTask}
          onToggleEpic={onToggleEpic}
          onAddChild={onAddChild}
          readOnly={readOnly}
        />
      </div>

      {/* Right Timeline Canvas Bar Cell */}
      <div className="relative flex-1" style={{ width: `${timelineWidth}px` }}>
        <RoadmapTimelineBarCell
          row={row}
          geometry={geometry}
          statusMeta={statusMeta}
          onSelectTask={onSelectTask}
        />
      </div>
    </div>
  );
});

