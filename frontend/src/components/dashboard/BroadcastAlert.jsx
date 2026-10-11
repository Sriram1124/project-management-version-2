import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Bell, 
  Send, 
  Users, 
  AlertTriangle, 
  Search, 
  X, 
  CheckCircle2, 
  Clock,
  Filter 
} from 'lucide-react';

const BATCH_GROUPS = [
  { batch: 'Batch A', subbatches: ['A1', 'A2'] },
  { batch: 'Batch B', subbatches: ['B1', 'B2'] },
  { batch: 'Batch C', subbatches: ['C1', 'C2'] },
  { batch: 'Batch D', subbatches: ['D1', 'D2'] },
];

export default function BroadcastAlert({ 
  onSendAlert, 
  onPreview,
  users = [],
  workItems = [],
  stats
}) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubbatches, setSelectedSubbatches] = useState(() => new Set());
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef(null);
  const [activeTab, setActiveTab] = useState('INTERNS'); // 'INTERNS' | 'UNDERPERFORMING'
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [isSending, setIsSending] = useState(false);

  // Strictly identify interns within organization
  const internUsers = useMemo(() => {
    if (!Array.isArray(users)) return [];
    return users.filter((u) => {
      const type = (u.type || u.role || '').toUpperCase();
      const hasInternRole = Array.isArray(u.roles) && u.roles.some((r) => {
        const rName = (r.role?.name || r.name || '').toUpperCase();
        return rName.includes('INTERN');
      });
      return type === 'INTERN' || type.includes('INTERN') || hasInternRole;
    });
  }, [users]);

  // Strictly intern pool
  const targetInterns = internUsers;

  // Helper to test if a work item is overdue (task deadline passed and not completed)
  const isItemOverdue = (item) => {
    if (!item) return false;
    if (item.is_overdue !== undefined && item.is_overdue !== null) {
      return Boolean(item.is_overdue);
    }
    if (!item.due_date || item.status === 'COMPLETED') return false;
    return new Date(item.due_date) < new Date();
  };

  // Map each user ID to overdue task count & task titles from the database
  const internOverdueMap = useMemo(() => {
    const map = new Map();
    if (!Array.isArray(workItems)) return map;

    workItems.forEach((item) => {
      if (isItemOverdue(item)) {
        const assigneeIds = new Set();
        if (Array.isArray(item.assignees)) {
          item.assignees.forEach((a) => {
            const uid = a?.user_id || a?.id || a?.user?.id;
            if (uid) assigneeIds.add(uid);
          });
        }
        if (Array.isArray(item.assignee_ids)) {
          item.assignee_ids.forEach((id) => {
            if (id) assigneeIds.add(id);
          });
        }
        if (item.user_id) assigneeIds.add(item.user_id);
        if (assigneeIds.size === 0 && item.created_by) {
          assigneeIds.add(item.created_by);
        }

        assigneeIds.forEach((uid) => {
          const current = map.get(uid) || { count: 0, titles: [] };
          current.count += 1;
          if (item.title) current.titles.push(item.title);
          map.set(uid, current);
        });
      }
    });

    return map;
  }, [workItems]);

  // Identify underperforming interns whose tasks are not matching deadlines
  const underperformingInterns = useMemo(() => {
    return targetInterns.filter((u) => {
      const stats = internOverdueMap.get(u.id);
      return stats && stats.count > 0;
    });
  }, [targetInterns, internOverdueMap]);

  // Active pool according to the selected tab
  const activePool = activeTab === 'UNDERPERFORMING' ? underperformingInterns : targetInterns;

  // Sync selected IDs whenever users change or activeTab changes
  useEffect(() => {
    if (!Array.isArray(users) || users.length === 0) {
      setSelectedIds(new Set());
      return;
    }

    if (activeTab === 'UNDERPERFORMING') {
      setSelectedIds(new Set(underperformingInterns.map((u) => u.id)));
    } else {
      setSelectedIds(new Set(targetInterns.map((u) => u.id)));
    }
  }, [users, activeTab, underperformingInterns.length]);

  // Handle switching tabs
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'UNDERPERFORMING') {
      setSelectedIds(new Set(underperformingInterns.map((u) => u.id)));
    } else {
      setSelectedIds(new Set(targetInterns.map((u) => u.id)));
    }
  };

  // Close filter popover on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setIsFilterOpen(false);
      }
    };
    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isFilterOpen]);

  const handleToggleSubbatch = (sb) => {
    setSelectedSubbatches((prev) => {
      const next = new Set(prev);
      if (next.has(sb)) {
        next.delete(sb);
      } else {
        next.add(sb);
      }
      return next;
    });
  };

  const handleClearSubbatches = () => {
    setSelectedSubbatches(new Set());
  };

  // Filter active pool by selected subbatches and search query
  const filteredUsers = useMemo(() => {
    if (!Array.isArray(activePool)) return [];

    return activePool.filter((u) => {
      // Subbatch filter (supports multiple selections: A1 OR A2, etc.)
      if (selectedSubbatches.size > 0) {
        const uSubbatch = (u.subbatch || '').trim().toUpperCase();
        if (!selectedSubbatches.has(uSubbatch)) {
          return false;
        }
      }

      // Search query filter (matching name, email, batch, or subbatch)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = u.name && u.name.toLowerCase().includes(q);
        const matchesEmail = u.email && u.email.toLowerCase().includes(q);
        const matchesBatch = u.batch && u.batch.toLowerCase().includes(q);
        const matchesSubbatch = u.subbatch && u.subbatch.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesBatch && !matchesSubbatch) {
          return false;
        }
      }

      return true;
    });
  }, [activePool, selectedSubbatches, searchQuery]);

  const handleToggle = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const currentSelectionTarget = (searchQuery.trim() || selectedSubbatches.size > 0) ? filteredUsers : activePool;
  const allCurrentSelected = currentSelectionTarget.length > 0 && currentSelectionTarget.every((u) => selectedIds.has(u.id));

  const handleToggleAll = () => {
    const targetIds = currentSelectionTarget.map((u) => u.id);
    if (allCurrentSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        targetIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        targetIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!message.trim() || selectedIds.size === 0 || isSending) return;
    setIsSending(true);
    try {
      await onSendAlert?.(
        {
          title: title.trim() || 'Broadcast Announcement',
          message: message.trim(),
        },
        Array.from(selectedIds)
      );
      setMessage('');
      setTitle('');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/90 shadow-2xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
            <Bell className="w-3.5 h-3.5 stroke-[2.2]" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 tracking-tight">
              Broadcast Alert
            </h3>
            <p className="text-[10px] text-slate-500 font-medium">
              Send notifications to organization interns & underperforming interns
            </p>
          </div>
        </div>

        {/* Search bar & Filter button beside Organization Communications tag */}
        <div className="flex items-center gap-2 self-start sm:self-center flex-wrap sm:flex-nowrap relative">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search interns..."
              className="pl-8 pr-7 py-1 text-xs rounded-lg bg-white border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 w-36 sm:w-44 transition-colors shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                title="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Filter Button & Popover */}
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              onClick={() => setIsFilterOpen((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer shadow-2xs ${
                selectedSubbatches.size > 0 || isFilterOpen
                  ? 'bg-purple-50 border-purple-300 text-purple-700 ring-1 ring-purple-300/50'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              <Filter className="w-3 h-3 text-purple-600" />
              <span>Filter</span>
              {selectedSubbatches.size > 0 && (
                <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-[10px] flex items-center justify-center font-bold">
                  {selectedSubbatches.size}
                </span>
              )}
            </button>

            {/* Subbatch Multi-Select Popover */}
            {isFilterOpen && (
              <div className="absolute right-0 sm:right-0 top-full mt-1.5 w-60 rounded-xl bg-white border border-slate-200 shadow-xl p-3 z-50 text-slate-800 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    FILTER BY SUBBATCH
                  </span>
                  {selectedSubbatches.size > 0 && (
                    <button
                      type="button"
                      onClick={handleClearSubbatches}
                      className="text-[10px] font-semibold text-purple-600 hover:text-purple-800 hover:underline cursor-pointer"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                <div className="space-y-2.5">
                  {BATCH_GROUPS.map((group) => (
                    <div key={group.batch} className="space-y-1">
                      <div className="text-[11px] font-bold text-slate-700">
                        {group.batch}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 pl-1">
                        {group.subbatches.map((sb) => {
                          const isChecked = selectedSubbatches.has(sb);
                          return (
                            <label
                              key={sb}
                              className={`flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors border select-none ${
                                isChecked
                                  ? 'bg-purple-50/70 border-purple-200 text-purple-900 font-semibold'
                                  : 'bg-slate-50/50 border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleSubbatch(sb)}
                                className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                              />
                              <span>{sb}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <span className="text-[10px] font-bold text-purple-700 bg-purple-100/70 border border-purple-200 px-2 py-0.5 rounded-full whitespace-nowrap">
            Organization Communications
          </span>
        </div>
      </div>

      {/* Tab Navigation: Interns vs Underperforming Interns */}
      <div className="flex items-center gap-2 p-1 rounded-lg bg-slate-200/60 border border-slate-200/80 mb-3">
        <button
          type="button"
          onClick={() => handleTabChange('INTERNS')}
          className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'INTERNS'
              ? 'bg-white text-purple-900 shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Interns</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
            activeTab === 'INTERNS'
              ? 'bg-purple-100 text-purple-700'
              : 'bg-slate-300/70 text-slate-700'
          }`}>
            {targetInterns.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('UNDERPERFORMING')}
          className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'UNDERPERFORMING'
              ? 'bg-white text-rose-800 shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
          }`}
        >
          <AlertTriangle className={`w-3.5 h-3.5 ${
            underperformingInterns.length > 0 ? 'text-rose-500' : 'text-slate-400'
          }`} />
          <span>Underperforming Interns</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
            underperformingInterns.length > 0
              ? activeTab === 'UNDERPERFORMING'
                ? 'bg-rose-100 text-rose-700 border border-rose-200'
                : 'bg-rose-50 text-rose-600 border border-rose-200'
              : 'bg-slate-300/70 text-slate-700'
          }`}>
            {underperformingInterns.length}
          </span>
        </button>
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-3 divide-x divide-slate-200 rounded-lg bg-white border border-slate-200/80 py-2 px-1 mb-3 text-center">
        <div className="flex items-center justify-center gap-1.5 px-2">
          <span className="text-xs font-bold text-slate-800">{targetInterns.length}</span>
          <span className="text-[11px] font-medium text-slate-500">Total Interns</span>
        </div>
        <div className="flex items-center justify-center gap-1.5 px-2">
          <span className="text-xs font-bold text-rose-600">{underperformingInterns.length}</span>
          <span className="text-[11px] font-medium text-slate-500">Behind Deadline</span>
        </div>
        <div className="flex items-center justify-center gap-1.5 px-2">
          <span className="text-xs font-bold text-purple-700">{selectedIds.size}</span>
          <span className="text-[11px] font-medium text-slate-500">Targeted</span>
        </div>
      </div>

      {/* Recipients Section */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5 px-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              {activeTab === 'UNDERPERFORMING' ? 'Underperforming Recipients' : 'Intern Recipients'}
            </span>
            <span className="text-[10px] text-purple-600 font-bold">
              ({selectedIds.size} selected)
            </span>
          </div>
          {activePool.length > 0 && (
            <button
              type="button"
              onClick={handleToggleAll}
              className="text-[11px] font-semibold text-purple-600 hover:text-purple-700 transition-colors cursor-pointer"
            >
              {allCurrentSelected ? 'Clear Selection' : `Select All ${activeTab === 'UNDERPERFORMING' ? 'Underperforming' : 'Interns'}`}
            </button>
          )}
        </div>

        {/* Scrollable recipient list */}
        {activePool.length === 0 ? (
          activeTab === 'UNDERPERFORMING' ? (
            <div className="p-5 text-center rounded-lg border border-slate-200/90 bg-white text-slate-500 space-y-1">
              <CheckCircle2 className="w-5 h-5 mx-auto text-emerald-500 mb-1" />
              <p className="text-xs font-semibold text-slate-800">All Interns Are On Track</p>
              <p className="text-[11px] text-slate-400">
                No interns currently have overdue tasks or missed deadlines in the database.
              </p>
            </div>
          ) : (
            <div className="p-6 text-center rounded-lg border border-slate-200/90 bg-white text-slate-400 space-y-1">
              <Users className="w-5 h-5 mx-auto text-slate-300" />
              <p className="text-xs font-medium text-slate-600">No Interns Found</p>
              <p className="text-[11px] text-slate-400">
                No intern accounts currently enrolled in this organization.
              </p>
            </div>
          )
        ) : filteredUsers.length === 0 ? (
          <div className="p-4 text-center rounded-lg border border-slate-200/90 bg-white text-slate-400">
            <p className="text-xs font-medium text-slate-500">
              {searchQuery && selectedSubbatches.size > 0
                ? `No interns matching "${searchQuery}" in selected subbatches (${Array.from(selectedSubbatches).join(', ')})`
                : selectedSubbatches.size > 0
                ? `No interns found in selected subbatches (${Array.from(selectedSubbatches).join(', ')})`
                : `No interns match "${searchQuery}"`}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200/90 overflow-hidden bg-white">
            {/* Column Header */}
            <div className="bg-slate-50/80 px-3 py-1.5 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500 grid grid-cols-12 gap-2 items-center select-none">
              <div className="col-span-1 flex items-center">
                <span className="sr-only">Select</span>
              </div>
              <div className="col-span-5">Name</div>
              <div className="col-span-2 text-center">Batch</div>
              <div className="col-span-4">Email</div>
            </div>

            {/* Scrollable list items */}
            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
              {filteredUsers.map((user) => {
                const isSelected = selectedIds.has(user.id);
                const overdueData = internOverdueMap.get(user.id);
                const overdueCount = overdueData?.count || 0;

                return (
                  <div
                    key={user.id}
                    onClick={() => handleToggle(user.id)}
                    className={`grid grid-cols-12 gap-2 items-center px-3 py-2 text-xs hover:bg-slate-50 transition-colors cursor-pointer select-none ${
                      isSelected ? 'bg-purple-50/30' : ''
                    }`}
                  >
                    {/* Col 1: Checkbox & Avatar */}
                    <div className="col-span-1 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggle(user.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer shrink-0"
                      />
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
                        overdueCount > 0 ? 'bg-rose-100 text-rose-700' : 'bg-purple-100 text-purple-700'
                      }`}>
                        {(user.name || user.email || 'I').charAt(0).toUpperCase()}
                      </div>
                    </div>

                    {/* Col 2: Name */}
                    <div className="col-span-5 min-w-0 pr-1">
                      <span className="font-semibold text-slate-900 truncate block text-xs" title={user.name || 'Intern'}>
                        {user.name || 'Intern'}
                      </span>
                    </div>

                    {/* Col 3: Batch / Subbatch Badge */}
                    <div className="col-span-2 flex items-center justify-center">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200/70 font-mono tracking-tight whitespace-nowrap">
                        {user.batch || '—'} · {user.subbatch || '—'}
                      </span>
                    </div>

                    {/* Col 4: Email */}
                    <div className="col-span-4 min-w-0 pr-1">
                      <span className="text-[11px] text-slate-500 truncate block" title={user.email}>
                        {user.email}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Message input area */}
      <form onSubmit={handleSend} className="space-y-2.5">
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
            Alert Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              activeTab === 'UNDERPERFORMING'
                ? 'e.g. Urgent Notice: Pending Task Deadlines Require Attention'
                : 'e.g. Important Notice: Daily Standup Rescheduled'
            }
            className="w-full px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
            Alert Message
          </label>
          <textarea
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              activeTab === 'UNDERPERFORMING'
                ? 'Type an alert message addressing overdue deliverables or deadline extensions...'
                : 'Type your announcement or alert message for the interns...'
            }
            className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 resize-none transition-colors"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-slate-500 font-medium">
            Will dispatch in-app alert to <strong className="text-purple-700 font-bold">{selectedIds.size}</strong> recipient{selectedIds.size === 1 ? '' : 's'}.
          </span>
          <div className="flex items-center gap-2">
            {onPreview && (
              <button
                type="button"
                onClick={onPreview}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors cursor-pointer"
              >
                Preview
              </button>
            )}
            <button
              type="submit"
              disabled={!message.trim() || selectedIds.size === 0 || isSending}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3 h-3" />
              <span>{isSending ? 'Sending...' : 'Send Alert'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
