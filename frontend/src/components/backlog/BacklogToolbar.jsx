import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  ChevronDown, 
  Check, 
  X, 
  Filter,
  Sparkles
} from 'lucide-react';

export default function BacklogToolbar({
  issuesCount = 0,
  epicsCount = 0,
  totalSP = 0,
  searchQuery = '',
  onSearchChange,
  selectedAssignee,
  onSelectAssignee,
  selectedPriority,
  onSelectPriority,
  selectedSprintId,
  onSelectSprintId,
  selectedStatus,
  onSelectStatus,
  groupBy = 'epic', // 'epic' | 'sprint' | 'none'
  onSelectGroupBy,
  sprints = [],
  members = [],
  quickFilterMyIssues,
  onToggleMyIssues,
  quickFilterOverdue,
  onToggleOverdue,
  onClearFilters,
  onCreateClick,
  onCreateSprintClick,
  onExpandAll,
  onCollapseAll,
  allExpanded = false,
  readOnly = false,
}) {
  const [openDropdown, setOpenDropdown] = useState(null);
  const [assigneeSearchQuery, setAssigneeSearchQuery] = useState('');
  const toolbarRef = useRef(null);

  const priorities = ['All Priorities', 'URGENT', 'HIGH', 'MEDIUM', 'LOW'];
  const statuses = ['All Statuses', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'COMPLETED'];

  const toggleDropdown = (name) => {
    setOpenDropdown((prev) => {
      const next = prev === name ? null : name;
      if (next !== 'assignee') {
        setAssigneeSearchQuery('');
      }
      return next;
    });
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target)) {
        setOpenDropdown(null);
        setAssigneeSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasActiveFilters = Boolean(
    searchQuery ||
    selectedAssignee ||
    selectedPriority ||
    selectedSprintId ||
    selectedStatus ||
    quickFilterMyIssues ||
    quickFilterOverdue
  );

  return (
    <div
      ref={toolbarRef}
      className="bg-white rounded-md p-3 border border-slate-200 space-y-2.5 relative z-20 text-xs select-none shadow-xs"
    >
      {/* TIER 1: HEADER & STATS */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-slate-900 text-xs tracking-wider uppercase">
            Project Backlog &amp; Epics
          </h2>
          <span className="hidden sm:inline-block text-[11px] text-slate-400 font-normal">
          </span>
        </div>

        <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
          <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-semibold border border-purple-100">
            {issuesCount} Issues
          </span>
          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-semibold border border-slate-200">
            {epicsCount} Epics
          </span>
          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono font-semibold border border-slate-200">
            {totalSP} SP
          </span>
        </div>
      </div>

      {/* TIER 2: PRIMARY ACTIONS (CREATE, SEARCH, VIEW MODE) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        {/* Left: Create buttons & Search */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* + Create Button */}
          {!readOnly && onCreateClick && (
            <button
              type="button"
              onClick={onCreateClick}
              className="px-3 py-1.5 rounded-md bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold flex items-center gap-1.5 transition-colors shadow-xs shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Issue</span>
            </button>
          )}

          {/* + Sprint Button */}
          {!readOnly && onCreateSprintClick && (
            <button
              type="button"
              onClick={onCreateSprintClick}
              className="px-2.5 py-1.5 rounded-md bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-semibold flex items-center gap-1 transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Sprint</span>
            </button>
          )}

          {!readOnly && (onCreateClick || onCreateSprintClick) && (
            <div className="h-4 w-[1px] bg-slate-200 mx-1 hidden sm:block" />
          )}

          {/* Search Box */}
          <div className="relative w-48 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="Search issues, epics, assignees..."
              className="w-full pl-8 pr-6 py-1.5 rounded-md border border-slate-200 text-xs text-slate-800 placeholder-slate-400 bg-white hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange?.('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Right: Expand/Collapse & View Selector */}
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          {/* Expand / Collapse All */}
          {(onExpandAll || onCollapseAll) && (
            <button
              type="button"
              onClick={allExpanded ? onCollapseAll : onExpandAll}
              className="px-2.5 py-1.5 rounded-md border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 font-medium text-xs transition-colors shrink-0"
              title={allExpanded ? 'Collapse All Rows' : 'Expand All Rows'}
            >
              {allExpanded ? 'Collapse All' : 'Expand All'}
            </button>
          )}

          {/* View Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleDropdown('groupby')}
              className="px-2.5 py-1.5 rounded-md border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 font-medium flex items-center gap-1.5 transition-colors shrink-0"
            >
              <span className="text-slate-400 font-normal">View:</span>
              <span className="font-semibold text-purple-700">
                {groupBy === 'none'
                  ? 'Stories & Tasks'
                  : groupBy === 'sprint'
                  ? 'Sprint Groups'
                  : 'Backlog'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {openDropdown === 'groupby' && (
              <div className="absolute right-0 mt-1 w-44 bg-white rounded-md shadow-lg border border-slate-200 py-1 z-30">
                {[
                  { id: 'none', label: 'Stories & Tasks (Flat)' },
                  { id: 'sprint', label: 'Sprint Groups' },
                  { id: 'epic', label: 'Backlog' },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => {
                      onSelectGroupBy?.(mode.id);
                      setOpenDropdown(null);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors flex items-center justify-between ${
                      groupBy === mode.id ? 'text-purple-700 font-semibold bg-purple-50/50' : 'text-slate-700'
                    }`}
                  >
                    <span>{mode.label}</span>
                    {groupBy === mode.id && <Check className="w-3.5 h-3.5 text-purple-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TIER 3: DEDICATED FILTER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
        {/* Left: Filter dropdowns & Quick chips */}
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-1 text-slate-400 font-medium mr-1 shrink-0">
            <Filter className="w-3 h-3 text-slate-400" />
            <span className="text-[11px] uppercase tracking-wider font-semibold">Filter:</span>
          </div>

          {/* Assignee Filter Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleDropdown('assignee')}
              className={`px-2 py-1 rounded-md border font-medium flex items-center gap-1 transition-colors ${
                selectedAssignee
                  ? 'border-purple-300 bg-purple-50/70 text-purple-700 font-semibold'
                  : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
              }`}
            >
              <span>{selectedAssignee ? selectedAssignee.name : 'Assignee'}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {openDropdown === 'assignee' && (
              <div className="absolute left-0 mt-1 w-56 sm:w-64 bg-white rounded-md shadow-lg border border-slate-200 py-1.5 z-30 flex flex-col">
                {/* Search Bar Input inside Assignee Dropdown */}
                <div className="px-2 pb-1.5 pt-0.5 border-b border-slate-100">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={assigneeSearchQuery}
                      onChange={(e) => setAssigneeSearchQuery(e.target.value)}
                      placeholder="Search assignees..."
                      className="w-full pl-7 pr-6 py-1 text-xs rounded-md border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600 transition-colors placeholder:text-slate-400"
                      autoFocus
                    />
                    {assigneeSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setAssigneeSearchQuery('')}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Scrollable list of Assignees */}
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-50 pt-1">
                  {!assigneeSearchQuery.trim() && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectAssignee?.(null);
                        setOpenDropdown(null);
                        setAssigneeSearchQuery('');
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer ${
                        !selectedAssignee ? 'text-purple-700 font-semibold bg-purple-50/40' : 'text-slate-700'
                      }`}
                    >
                      <span>All Assignees</span>
                      {!selectedAssignee && <Check className="w-3 h-3 text-purple-600" />}
                    </button>
                  )}

                  {members.filter((m) => {
                    if (!assigneeSearchQuery.trim()) return true;
                    const q = assigneeSearchQuery.toLowerCase().trim();
                    const name = (m.user?.name || m.name || '').toLowerCase();
                    const email = (m.user?.email || m.email || '').toLowerCase();
                    return name.includes(q) || email.includes(q);
                  }).length > 0 ? (
                    members
                      .filter((m) => {
                        if (!assigneeSearchQuery.trim()) return true;
                        const q = assigneeSearchQuery.toLowerCase().trim();
                        const name = (m.user?.name || m.name || '').toLowerCase();
                        const email = (m.user?.email || m.email || '').toLowerCase();
                        return name.includes(q) || email.includes(q);
                      })
                      .map((member) => {
                        const uid = member.user_id || member.id;
                        const name = member.user?.name || member.name || 'Member';
                        const avatar = member.user?.avatar || member.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7C3AED&color=fff`;
                        const isSelected = selectedAssignee?.id === uid || selectedAssignee?.user_id === uid;
                        return (
                          <button
                            key={uid}
                            type="button"
                            onClick={() => {
                              onSelectAssignee?.({ id: uid, user_id: uid, name, avatar });
                              setOpenDropdown(null);
                              setAssigneeSearchQuery('');
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer ${
                              isSelected ? 'text-purple-700 font-semibold bg-purple-50/40' : 'text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <img src={avatar} alt={name} className="w-4 h-4 rounded-full object-cover shrink-0" />
                              <span className="truncate">{name}</span>
                            </div>
                            {isSelected && <Check className="w-3 h-3 text-purple-600" />}
                          </button>
                        );
                      })
                  ) : (
                    <div className="px-3 py-3 text-center text-xs text-slate-400 italic">
                      No assignees found
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Status Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleDropdown('status')}
              className={`px-2 py-1 rounded-md border font-medium flex items-center gap-1 transition-colors ${
                selectedStatus
                  ? 'border-purple-300 bg-purple-50/70 text-purple-700 font-semibold'
                  : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
              }`}
            >
              <span>{selectedStatus ? selectedStatus.replace('_', ' ') : 'Status'}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {openDropdown === 'status' && (
              <div className="absolute left-0 mt-1 w-40 bg-white rounded-md shadow-lg border border-slate-200 py-1 z-30">
                {statuses.map((st) => {
                  const isSelected = (!selectedStatus && st === 'All Statuses') || selectedStatus === st;
                  const label = st === 'All Statuses' ? st : st.replace('_', ' ');
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        onSelectStatus?.(st === 'All Statuses' ? null : st);
                        setOpenDropdown(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors flex items-center justify-between ${
                        isSelected ? 'text-purple-700 font-semibold bg-purple-50/40' : 'text-slate-700'
                      }`}
                    >
                      <span>{label}</span>
                      {isSelected && <Check className="w-3 h-3 text-purple-600" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Priority Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleDropdown('priority')}
              className={`px-2 py-1 rounded-md border font-medium flex items-center gap-1 transition-colors ${
                selectedPriority
                  ? 'border-purple-300 bg-purple-50/70 text-purple-700 font-semibold'
                  : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
              }`}
            >
              <span>{selectedPriority || 'Priority'}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {openDropdown === 'priority' && (
              <div className="absolute left-0 mt-1 w-36 bg-white rounded-md shadow-lg border border-slate-200 py-1 z-30">
                {priorities.map((p) => {
                  const isSelected = (!selectedPriority && p === 'All Priorities') || selectedPriority === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        onSelectPriority?.(p === 'All Priorities' ? null : p);
                        setOpenDropdown(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors flex items-center justify-between ${
                        isSelected ? 'text-purple-700 font-semibold bg-purple-50/40' : 'text-slate-700'
                      }`}
                    >
                      <span>{p}</span>
                      {isSelected && <Check className="w-3 h-3 text-purple-600" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sprint Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleDropdown('sprint')}
              className={`px-2 py-1 rounded-md border font-medium flex items-center gap-1 transition-colors ${
                selectedSprintId
                  ? 'border-purple-300 bg-purple-50/70 text-purple-700 font-semibold'
                  : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
              }`}
            >
              <span>
                {selectedSprintId
                  ? selectedSprintId === 'backlog'
                    ? 'Backlog'
                    : sprints.find((s) => s.id === selectedSprintId)?.name || 'Sprint'
                  : 'Sprint'}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {openDropdown === 'sprint' && (
              <div className="absolute left-0 mt-1 w-48 bg-white rounded-md shadow-lg border border-slate-200 py-1 z-30">
                <button
                  type="button"
                  onClick={() => {
                    onSelectSprintId?.(null);
                    setOpenDropdown(null);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors flex items-center justify-between ${
                    !selectedSprintId ? 'text-purple-700 font-semibold bg-purple-50/40' : 'text-slate-700'
                  }`}
                >
                  <span>All Sprints</span>
                  {!selectedSprintId && <Check className="w-3 h-3 text-purple-600" />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onSelectSprintId?.('backlog');
                    setOpenDropdown(null);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors flex items-center justify-between ${
                    selectedSprintId === 'backlog' ? 'text-purple-700 font-semibold bg-purple-50/40' : 'text-slate-700'
                  }`}
                >
                  <span>Backlog (Unassigned)</span>
                  {selectedSprintId === 'backlog' && <Check className="w-3 h-3 text-purple-600" />}
                </button>

                {sprints.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      onSelectSprintId?.(s.id);
                      setOpenDropdown(null);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors flex items-center justify-between ${
                      selectedSprintId === s.id ? 'text-purple-700 font-semibold bg-purple-50/40' : 'text-slate-700'
                    }`}
                  >
                    <span className="truncate">{s.name}</span>
                    {selectedSprintId === s.id && <Check className="w-3 h-3 text-purple-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="h-4 w-[1px] bg-slate-200 mx-1 hidden sm:block" />

          {/* Quick Filters */}
          <button
            type="button"
            onClick={onToggleMyIssues}
            className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
              quickFilterMyIssues
                ? 'bg-purple-100 border-purple-300 text-purple-800 font-semibold'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50 bg-white'
            }`}
          >
            My Issues
          </button>

          <button
            type="button"
            onClick={onToggleOverdue}
            className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
              quickFilterOverdue
                ? 'bg-rose-100 border-rose-300 text-rose-800 font-semibold'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50 bg-white'
            }`}
          >
            Overdue
          </button>
        </div>

        {/* Right: Clear Filters */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded transition-colors"
          >
            <X className="w-3 h-3" />
            <span>Clear Filters</span>
          </button>
        )}
      </div>
    </div>
  );
}
