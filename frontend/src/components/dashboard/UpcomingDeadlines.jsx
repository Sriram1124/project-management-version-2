import React, { useState } from 'react';
import { 
  Clock, 
  ArrowUpRight, 
  Calendar, 
  AlertCircle, 
  User, 
  FolderKanban, 
  CheckCircle2,
  CalendarDays,
  Filter
} from 'lucide-react';

export default function UpcomingDeadlines({ deadlines, onViewAll }) {
  const [activeFilter, setActiveFilter] = useState('ALL');

  // Helper to parse subtitle into project and assignee
  const parseSubtitle = (subtitle) => {
    if (!subtitle) return { project: 'General', assignee: 'Unassigned' };
    const parts = subtitle.split('•').map((s) => s.trim());
    const project = parts[0] || 'General';
    const rawAssignee = parts[1] || '';
    const assignee = rawAssignee.replace(/^(Assignee:\s*|Target:\s*)/i, '') || 'Assigned Team';
    return { project, assignee };
  };

  // Due time mapping for clarity
  const getDueTime = (item, group) => {
    if (item.dueTime) return item.dueTime;
    switch (group) {
      case 'TODAY':
        return item.id === 'd1' ? 'Today, 5:00 PM' : 'Today, 6:30 PM';
      case 'TOMORROW':
        return 'Tomorrow, 12:00 PM';
      case 'THIS WEEK':
        return item.id === 'd4' ? 'Thu, 25 Dec' : 'Fri, 26 Dec (5 PM)';
      case 'NEXT WEEK':
        return 'Tue, 30 Dec';
      default:
        return 'Upcoming';
    }
  };

  // Total count calculation
  const totalCount = (deadlines || []).reduce((acc, g) => acc + (g?.items?.length || 0), 0);
  const todayCount = (deadlines || []).find((g) => g?.group === 'TODAY')?.items?.length || 0;

  // Filter groups
  const filteredGroups = (deadlines || [])
    .map((group) => {
      if (!group) return null;
      if (activeFilter === 'ALL') return group;
      if (activeFilter === 'TODAY' && group.group === 'TODAY') return group;
      if (activeFilter === 'TOMORROW' && group.group === 'TOMORROW') return group;
      if (activeFilter === 'WEEK' && (group.group === 'THIS WEEK' || group.group === 'NEXT WEEK')) return group;
      return null;
    })
    .filter(Boolean);

  const getPriorityBadge = (tag, tagType) => {
    switch (tagType) {
      case 'danger':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
            {tag}
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            {tag}
          </span>
        );
      case 'purple':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-purple-50 text-purple-700 border border-purple-200">
            {tag}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-slate-100 text-slate-700 border border-slate-200">
            {tag}
          </span>
        );
    }
  };

  const getGroupBadge = (group) => {
    switch (group) {
      case 'TODAY':
        return {
          pill: 'bg-rose-100 text-rose-800 border-rose-200',
          dot: 'bg-rose-500',
          borderLeft: 'border-l-rose-500',
          label: 'Critical • Due Today',
        };
      case 'TOMORROW':
        return {
          pill: 'bg-amber-100 text-amber-800 border-amber-200',
          dot: 'bg-amber-500',
          borderLeft: 'border-l-amber-500',
          label: 'Due Tomorrow',
        };
      case 'THIS WEEK':
        return {
          pill: 'bg-purple-100 text-purple-800 border-purple-200',
          dot: 'bg-purple-600',
          borderLeft: 'border-l-purple-600',
          label: 'Due This Week',
        };
      default:
        return {
          pill: 'bg-slate-100 text-slate-700 border-slate-200',
          dot: 'bg-slate-400',
          borderLeft: 'border-l-slate-400',
          label: 'Upcoming',
        };
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* SECTION HEADER: High-contrast, unambiguous branding */}
      <div className="p-5 border-b border-slate-100 bg-gradient-to-b from-slate-50/60 to-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-rose-50 border border-rose-200/80 flex items-center justify-center text-rose-600 shrink-0 shadow-2xs">
            <Clock className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Upcoming Deadlines
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                {todayCount} Due Today
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                {totalCount} Total
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Operational schedule, milestones, and task deliverables across cohorts
            </p>
          </div>
        </div>

        {/* Action Controls & Filter Pills */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs border border-slate-200">
            <button
              onClick={() => setActiveFilter('ALL')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                activeFilter === 'ALL'
                  ? 'bg-white text-slate-900 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({totalCount})
            </button>
            <button
              onClick={() => setActiveFilter('TODAY')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                activeFilter === 'TODAY'
                  ? 'bg-white text-rose-700 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Today ({todayCount})
            </button>
            <button
              onClick={() => setActiveFilter('WEEK')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                activeFilter === 'WEEK'
                  ? 'bg-white text-slate-900 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              This Week
            </button>
          </div>
        </div>
      </div>

      {/* DEADLINES CONTENT LIST */}
      <div className="p-5 space-y-6">
        {filteredGroups.length === 0 ? (
          <div className="py-8 text-center text-slate-400 space-y-1">
            <Clock className="w-8 h-8 text-purple-400 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-700">No Upcoming Task Deadlines</p>
            <p className="text-[11px] text-slate-400">Task schedules and milestone deliverables are planned for V2.</p>
          </div>
        ) : (
          filteredGroups.map((group) => {
            const config = getGroupBadge(group.group);
            return (
              <div key={group.group} className="space-y-3">
                {/* TIMELINE GROUP HEADER: Clear label with divider */}
                <div className="flex items-center gap-2.5">
                  <div className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider border flex items-center gap-1.5 ${config.pill}`}>
                    <span className={`w-2 h-2 rounded-full ${config.dot}`}></span>
                    <span>{group.group}</span>
                    <span className="text-[10px] font-medium opacity-80">({group.items.length})</span>
                  </div>
                  <div className="h-px bg-slate-200 flex-1"></div>
                </div>

                {/* TASK ITEMS: Clear, high-contrast rows */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {group.items.map((item) => {
                    const { project, assignee } = parseSubtitle(item.subtitle);
                    const due = getDueTime(item, group.group);
                    const isToday = group.group === 'TODAY';

                    return (
                      <div
                        key={item.id}
                        className={`p-3.5 rounded-lg bg-white border border-slate-200 hover:border-slate-300 hover:shadow-xs transition-all flex flex-col justify-between gap-2.5 border-l-4 ${config.borderLeft}`}
                      >
                        {/* Title & Priority Badge */}
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight leading-snug">
                            {item.title}
                          </h4>
                          <div className="shrink-0">
                            {getPriorityBadge(item.tag, item.tagType)}
                          </div>
                        </div>

                        {/* Project, Assignee & Due Time Meta Row */}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              <FolderKanban className="w-3 h-3 text-slate-400" />
                              <span>{project}</span>
                            </span>
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 font-medium">
                              <User className="w-3 h-3 text-slate-400" />
                              <span>{assignee}</span>
                            </span>
                          </div>

                          <div className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                            isToday ? 'text-rose-600' : 'text-slate-600'
                          }`}>
                            <Clock className={`w-3 h-3 ${isToday ? 'text-rose-500' : 'text-slate-400'}`} />
                            <span>{due}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* FOOTER STRIP */}
      <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500 gap-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <CalendarDays className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="truncate">Showing upcoming schedule from active sprints and cohort milestones</span>
        </div>
        <button
          onClick={onViewAll}
          className="text-xs font-semibold text-purple-700 hover:text-purple-900 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-purple-200 bg-purple-50/70 hover:bg-purple-100/80 transition-colors cursor-pointer shrink-0 ml-auto"
        >
          <span>Tasks</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
