import React, { useState } from 'react';
import { 
  X, 
  CheckCircle2, 
  Users, 
  Clock, 
  Search, 
  Filter, 
  Bell, 
  Star,
  Download
} from 'lucide-react';

export default function ViewSubmissionsModal({ form, isOpen, onClose, onRemindPending }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSection, setFilterSection] = useState('All');

  if (!isOpen || !form) return null;

  const responses = form.sampleResponses || [];
  const pendingCount = Math.max(0, form.totalTarget - form.submittedCount);
  const completionPercent = Math.round((form.submittedCount / form.totalTarget) * 100);

  const filteredResponses = responses.filter((r) => {
    const matchesSearch = r.internName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          r.blocker.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSection = filterSection === 'All' || r.section === filterSection;
    return matchesSearch && matchesSection;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <div className="min-w-0 pr-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
              Form Submissions
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-1 truncate">
              {form.title}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Target Audience: {form.targetAudience} • Due {form.dueDate}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Strip */}
        <div className="px-6 py-3.5 bg-purple-50/40 border-b border-purple-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white p-3 rounded-xl border border-purple-100 shadow-2xs">
            <span className="text-[10px] font-bold uppercase text-slate-400">Total Submitted</span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-bold text-purple-700">{form.submittedCount}</span>
              <span className="text-xs text-slate-400">/ {form.totalTarget} ({completionPercent}%)</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
              <div 
                className="bg-purple-600 h-full rounded-full transition-all duration-500" 
                style={{ width: `${completionPercent}%` }} 
              />
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-purple-100 shadow-2xs">
            <span className="text-[10px] font-bold uppercase text-slate-400">Pending Interns</span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-bold text-amber-600">{pendingCount}</span>
              <span className="text-xs text-slate-400">awaiting responses</span>
            </div>
            <p className="text-[10px] text-amber-600 font-semibold mt-2">Sections A1: 4, B2: 6</p>
          </div>

          <div className="bg-white p-3 rounded-xl border border-purple-100 shadow-2xs flex flex-col justify-between">
            <span className="text-[10px] font-bold uppercase text-slate-400">Manager Action</span>
            <button
              onClick={() => onRemindPending?.(form)}
              className="mt-1 w-full py-1.5 px-3 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Remind {pendingCount} Pending</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="px-6 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by intern name or blocker..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-purple-600"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Section:</span>
            <select
              value={filterSection}
              onChange={(e) => setFilterSection(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700"
            >
              <option value="All">All Sections</option>
              <option value="A1">Section A1</option>
              <option value="A2">Section A2</option>
              <option value="B1">Section B1</option>
              <option value="B2">Section B2</option>
            </select>
          </div>
        </div>

        {/* Submissions List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2.5 bg-slate-50/50">
          {filteredResponses.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">
              No matching submitted responses found.
            </div>
          ) : (
            filteredResponses.map((r) => (
              <div 
                key={r.id}
                className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs hover:border-purple-200 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 font-bold text-xs flex items-center justify-center shrink-0">
                    {r.internName.split(' ').map((n) => n[0]).join('')}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">{r.internName}</span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        Section {r.section}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      <strong className="text-slate-700">Response / Blocker:</strong> {r.blocker}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0 sm:text-right">
                  <div>
                    <div className="flex items-center gap-1 sm:justify-end text-amber-500">
                      <Star className="w-3 h-3 fill-current" />
                      <span className="text-xs font-bold text-slate-800">{r.rating}/5</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{r.submittedAt}</div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Verified
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-white flex items-center justify-between text-xs text-slate-500">
          <span>Displaying {filteredResponses.length} sample response(s)</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

