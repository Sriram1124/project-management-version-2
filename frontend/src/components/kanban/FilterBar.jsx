import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';
// No mock data - 100% database driven

export default function FilterBar({
  isKanban = false,
  searchQuery = '',
  onSearchChange,
  members = [],
  epics = [],
  sprints = [],
  selectedAssignee,
  onSelectAssignee,
  selectedPriority,
  onSelectPriority,
  selectedEpic,
  onSelectEpic,
  selectedSprint = 'All Sprints',
  onSelectSprint,
  quickFilterMyTasks = false,
  onToggleMyTasks,
  quickFilterOverdue = false,
  onToggleOverdue,
  quickFilterBlocked = false,
  onToggleBlocked,
  onClearFilters,
}) {
  const [openDropdown, setOpenDropdown] = useState(null);
  const [assigneeSearchQuery, setAssigneeSearchQuery] = useState('');
  const barRef = useRef(null);

  const priorities = ['All Priorities', 'High', 'Medium', 'Low', 'Blocked', 'Completed'];

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
    const handleClickOutside = (event) => {
      if (barRef.current && !barRef.current.contains(event.target)) {
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
    (selectedEpic && selectedEpic !== 'All Epics') ||
    quickFilterMyTasks ||
    quickFilterOverdue ||
    quickFilterBlocked
  );

  const allAssigneesList = Array.isArray(members) ? members : [];
  const filteredAssignees = allAssigneesList.filter((user) => {
    if (!assigneeSearchQuery.trim()) return true;
    const q = assigneeSearchQuery.toLowerCase().trim();
    const name = (user.name || '').toLowerCase();
    const email = (user.email || '').toLowerCase();
    return name.includes(q) || email.includes(q);
  });

  return (
    <div
      ref={barRef}
      className="bg-white rounded-md p-2.5 border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 relative z-10"
    >
      {/* Left side: Search input + 4 Dropdowns */}
      <div className="flex flex-wrap items-center gap-2 flex-1">
        {/* Search Input */}
        <div className="relative min-w-[190px] sm:w-56">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder="Search tasks..."
            className="w-full pl-8 pr-6 py-1 rounded-md border border-slate-200 text-xs text-slate-800 placeholder-slate-400 bg-white hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange?.('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="h-4 w-[1px] bg-slate-200 hidden sm:block" />

        {/* Assignee Dropdown */}
        <div className="relative">
          <button
            onClick={() => toggleDropdown('assignee')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
              selectedAssignee
                ? 'border-purple-400 bg-purple-50/60 text-purple-700 font-semibold'
                : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
            }`}
          >
            {selectedAssignee ? (
              <div className="flex items-center gap-1.5">
                <img
                  src={selectedAssignee.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedAssignee.name || selectedAssignee.email || 'User')}&background=7C3AED&color=fff`}
                  alt={selectedAssignee.name}
                  className="w-3.5 h-3.5 rounded-full object-cover"
                />
                <span className="truncate max-w-[90px]">{selectedAssignee.name}</span>
              </div>
            ) : (
              <span>Assignee</span>
            )}
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

                {filteredAssignees.length > 0 ? (
                  filteredAssignees.map((user) => {
                    const uid = user.user_id || user.id;
                    const uName = user.name || user.email;
                    const uAvatar = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(uName)}&background=random`;
                    const isSelected = selectedAssignee && ((selectedAssignee.user_id || selectedAssignee.id) === uid);
                    return (
                      <button
                        key={uid}
                        type="button"
                        onClick={() => {
                          onSelectAssignee?.(user);
                          setOpenDropdown(null);
                          setAssigneeSearchQuery('');
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer ${
                          isSelected ? 'text-purple-700 font-semibold bg-purple-50/40' : 'text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <img src={uAvatar} alt={uName} className="w-4 h-4 rounded-full object-cover shrink-0" />
                          <span className="truncate">{uName}</span>
                        </div>
                        {isSelected && <Check className="w-3 h-3 text-purple-600 shrink-0" />}
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

        {/* Priority Dropdown */}
        <div className="relative">
          <button
            onClick={() => toggleDropdown('priority')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
              selectedPriority
                ? 'border-purple-400 bg-purple-50/60 text-purple-700 font-semibold'
                : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
            }`}
          >
            <span>{selectedPriority || 'Priority'}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {openDropdown === 'priority' && (
            <div className="absolute left-0 mt-1 w-40 bg-white rounded-md shadow-md border border-slate-200 py-1 z-30">
              {priorities.map((p) => {
                const isSelected = (!selectedPriority && p === 'All Priorities') || selectedPriority === p;
                return (
                  <button
                    key={p}
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

        {/* Epic Dropdown */}
        <div className="relative">
          <button
            onClick={() => toggleDropdown('epic')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
              selectedEpic && selectedEpic !== 'All Epics'
                ? 'border-purple-400 bg-purple-50/60 text-purple-700 font-semibold'
                : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
            }`}
          >
            <span className="truncate max-w-[100px]">
              {selectedEpic && selectedEpic !== 'All Epics'
                ? (selectedEpic && typeof selectedEpic === 'object' ? selectedEpic.name || selectedEpic.title : selectedEpic)
                : 'Epic'}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {openDropdown === 'epic' && (
            <div className="absolute left-0 mt-1 w-52 bg-white rounded-md shadow-md border border-slate-200 py-1 z-30">
              <button
                onClick={() => {
                  onSelectEpic?.(null);
                  setOpenDropdown(null);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors flex items-center justify-between ${
                  !selectedEpic || selectedEpic === 'All Epics' ? 'text-purple-700 font-semibold bg-purple-50/40' : 'text-slate-700'
                }`}
              >
                <span>All Epics</span>
                {(!selectedEpic || selectedEpic === 'All Epics') && <Check className="w-3 h-3 text-purple-600" />}
              </button>

              {epics.length > 0 ? (
                epics.map((e) => {
                  const eid = e.id || e;
                  const ename = e.name || e.title || e;
                  const isSelected = selectedEpic === eid || selectedEpic === ename || selectedEpic?.id === eid;
                  return (
                    <button
                      key={eid}
                      onClick={() => {
                        onSelectEpic?.(eid);
                        setOpenDropdown(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer ${
                        isSelected ? 'text-purple-700 font-semibold bg-purple-50/40' : 'text-slate-700'
                      }`}
                    >
                      <span className="truncate">{ename}</span>
                      {isSelected && <Check className="w-3 h-3 text-purple-600" />}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-2 text-xs text-slate-400 text-center italic">
                  No Epics in this project
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sprint Dropdown (hidden in Kanban continuous flow) */}
        {!isKanban && (
          <div className="relative">
            <button
              onClick={() => toggleDropdown('sprint')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors"
            >
              <span className="truncate max-w-[130px]">
                {selectedSprint && typeof selectedSprint === 'object' ? selectedSprint.name : (selectedSprint || 'All Sprints')}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {openDropdown === 'sprint' && (
              <div className="absolute left-0 mt-1 w-56 bg-white rounded-md shadow-md border border-slate-200 py-1 z-30">
                <button
                  onClick={() => {
                    onSelectSprint?.('All Sprints');
                    setOpenDropdown(null);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors flex items-center justify-between ${
                    selectedSprint === 'All Sprints' ? 'text-purple-700 font-semibold bg-purple-50/40' : 'text-slate-700'
                  }`}
                >
                  <span>All Sprints</span>
                  {selectedSprint === 'All Sprints' && <Check className="w-3 h-3 text-purple-600" />}
                </button>

                <button
                  onClick={() => {
                    onSelectSprint?.('Backlog Only');
                    setOpenDropdown(null);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors flex items-center justify-between ${
                    selectedSprint === 'Backlog Only' ? 'text-purple-700 font-semibold bg-purple-50/40' : 'text-slate-700'
                  }`}
                >
                  <span>Backlog (Unassigned)</span>
                  {selectedSprint === 'Backlog Only' && <Check className="w-3 h-3 text-purple-600" />}
                </button>

                {sprints.map((s) => {
                  const sName = s.name || s;
                  const isSelected = selectedSprint === sName || selectedSprint === s.id;
                  return (
                    <button
                      key={s.id || s}
                      onClick={() => {
                        onSelectSprint?.(sName);
                        setOpenDropdown(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer ${
                        isSelected ? 'text-purple-700 font-semibold bg-purple-50/40' : 'text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate">{sName}</span>
                        {s.status === 'ACTIVE' && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100 text-purple-700 shrink-0">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      {isSelected && <Check className="w-3 h-3 text-purple-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right side: Quick Filters + Clear */}
      <div className="flex items-center gap-1.5 text-xs shrink-0">
        <button
          onClick={onToggleMyTasks}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
            quickFilterMyTasks
              ? 'bg-purple-50 border-purple-300 text-purple-700 font-semibold'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          My Tasks
        </button>

        <button
          onClick={onToggleOverdue}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
            quickFilterOverdue
              ? 'bg-rose-50 border-rose-300 text-rose-700 font-semibold'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          Overdue
        </button>

        <button
          onClick={onToggleBlocked}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
            quickFilterBlocked
              ? 'bg-rose-100 border-rose-400 text-rose-800 font-semibold'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          Blocked
        </button>

        {hasActiveFilters && (
          <button
            onClick={onClearFilters}
            className="text-[11px] font-medium text-slate-400 hover:text-slate-700 ml-1 underline transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
