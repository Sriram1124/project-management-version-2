import React, { useState, useRef, useEffect } from 'react';
import { Search, Bell, ArrowLeft, ChevronDown, Users } from 'lucide-react';

export default function Header({ 
  breadcrumbs = ['Console', 'Manager Dashboard'], 
  title = 'Manager Dashboard',
  onOpenSearch,
  onOpenAlertModal,
  unreadAlertCount = 0,
  onBreadcrumbClick,
  onBackClick,
  cohorts = [],
  selectedCohortId,
  onSelectCohort,
}) {
  const [cohortDropdownOpen, setCohortDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setCohortDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const currentCohort = cohorts.find((c) => c.id === selectedCohortId) || cohorts[0];

  return (
    <header className="h-14 bg-white px-6 flex items-center justify-between border-b border-slate-200 select-none">
      {/* Left: Breadcrumbs & Context Title */}
      <div className="flex items-center gap-2.5">
        {onBackClick && (
          <button
            type="button"
            onClick={onBackClick}
            className="text-slate-400 hover:text-slate-700 transition-colors p-0 cursor-pointer flex items-center justify-center select-none"
            title="Back to Projects"
            aria-label="Back to Projects"
          >
            <ArrowLeft className="w-4 h-4 stroke-[2]" />
          </button>
        )}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-slate-500 font-medium">
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={idx}>
                {idx > 0 && <span className="text-slate-400 select-none">/</span>}
                {isLast ? (
                  <span className="text-slate-900 font-semibold" aria-current="page">
                    {crumb}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onBreadcrumbClick?.(crumb)}
                    className="text-slate-500 hover:text-purple-700 hover:underline transition-colors font-medium cursor-pointer"
                  >
                    {crumb}
                  </button>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      </div>

      {/* Right: Search, Cohort Dropdown, Action Icons, Date */}
      <div className="flex items-center gap-3">
        {/* Compact Search Input */}
        <button
          onClick={onOpenSearch}
          className="flex items-center gap-2.5 w-60 px-2.5 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-slate-400 hover:bg-white hover:border-slate-300 hover:text-slate-600 transition-colors text-xs"
        >
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="flex-1 text-left truncate">Search tasks, interns, epics...</span>
        </button>

        {/* Dynamic Cohort Dropdown */}
        {cohorts && cohorts.length > 0 && (
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setCohortDropdownOpen((prev) => !prev)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-purple-50/70 hover:bg-purple-100/70 border border-purple-200 text-purple-900 text-xs font-semibold shadow-xs transition-colors cursor-pointer select-none"
              title="Select Intern Cohort"
            >
              <Users className="w-3.5 h-3.5 text-purple-600" />
              <span>{currentCohort?.name || 'Cohort 1'}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-purple-500 transition-transform ${cohortDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {cohortDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  Select Intern Cohort
                </div>
                {cohorts.map((cohort) => {
                  const isSelected = cohort.id === currentCohort?.id;
                  return (
                    <button
                      key={cohort.id}
                      type="button"
                      onClick={() => {
                        onSelectCohort?.(cohort.id);
                        setCohortDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors text-left ${
                        isSelected
                          ? 'bg-purple-50 text-purple-700 font-bold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span>{cohort.name}</span>
                        {cohort.code === 'cohort-2' && (
                          <span className="text-[10px] text-slate-400 font-normal">Upcoming Cohort</span>
                        )}
                      </div>
                      {isSelected && (
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          <button 
            onClick={onOpenAlertModal}
            title="Notifications & Alerts"
            className="w-8 h-8 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 flex items-center justify-center transition-colors relative"
          >
            <Bell className="w-3.5 h-3.5" />
            {unreadAlertCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            )}
          </button>
        </div>

        {/* Date Display */}
        <div className="pl-3 border-l border-slate-200 text-xs font-medium text-slate-500 whitespace-nowrap">
          {formattedDate}
        </div>
      </div>
    </header>
  );
}
