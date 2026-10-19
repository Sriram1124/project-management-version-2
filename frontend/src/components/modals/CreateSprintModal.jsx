import React, { useState, useMemo } from 'react';
import { X, Calendar, Play, Loader2, AlertCircle, Check, Info } from 'lucide-react';
import { sprintsService } from '../../services/sprints.service';

export default function CreateSprintModal({
  isOpen,
  onClose,
  projectId,
  projectName = '',
  existingSprints = [],
  onSuccess,
  isKanban = false,
}) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Subtle overlap indicator calculation (does not block sprint creation)
  const overlappingSprints = useMemo(() => {
    if (!startDate || !endDate || !existingSprints?.length) return [];
    const newStart = new Date(startDate).getTime();
    const newEnd = new Date(endDate).getTime();
    if (isNaN(newStart) || isNaN(newEnd) || newStart > newEnd) return [];

    return existingSprints.filter((s) => {
      const sStartVal = s.start_date || s.startDate;
      const sEndVal = s.end_date || s.endDate;
      if (!sStartVal || !sEndVal) return false;
      const sStart = new Date(sStartVal).getTime();
      const sEnd = new Date(sEndVal).getTime();
      if (isNaN(sStart) || isNaN(sEnd)) return false;

      return newStart <= sEnd && newEnd >= sStart;
    });
  }, [startDate, endDate, existingSprints]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(isKanban ? 'Cycle name is required' : 'Sprint name is required');
      return;
    }

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      setError(isKanban ? 'Cycle start date cannot be later than its end date' : 'Sprint start date cannot be later than its end date');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const created = await sprintsService.createSprint(projectId, {
        name: name.trim(),
        goal: goal.trim() || null,
        start_date: startDate || null,
        end_date: endDate || null,
      });

      setName('');
      setGoal('');
      setStartDate('');
      setEndDate('');
      onSuccess?.(created);
      onClose();
    } catch (err) {
      console.error(`Failed to create ${isKanban ? 'cycle' : 'sprint'}:`, err);
      setError(err?.response?.data?.error || err.message || (isKanban ? 'Failed to create cycle' : 'Failed to create sprint'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-xs ${
              isKanban ? 'bg-indigo-100 text-indigo-700' : 'bg-purple-100 text-purple-700'
            }`}>
              <Play className="w-5 h-5 ml-0.5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                {isKanban ? 'Create Planning Cycle' : 'Create Sprint'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isKanban
                  ? `Plan a new cycle for ${projectName ? `"${projectName}"` : 'this project'}.`
                  : `Plan a new sprint iteration for ${projectName ? `"${projectName}"` : 'this project'}.`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              {isKanban ? 'Cycle Name' : 'Sprint Name'} <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isKanban ? 'e.g., Cycle 1 - Core Flow' : 'e.g., Sprint 01 or Sprint 02'}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              {isKanban ? 'Cycle Goal / Scope' : 'Sprint Goal'}
            </label>
            <textarea
              rows={2}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={isKanban ? 'What is the objective or target deliverable for this cycle?' : 'What is the objective or target milestone for this sprint?'}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all cursor-pointer"
              />
            </div>
          </div>

          {/* Subtle Overlap Indicator (does not block sprint creation) */}
          {overlappingSprints.length > 0 && (
            <div className="p-3 bg-amber-50/90 border border-amber-200/90 text-amber-900 rounded-xl text-xs flex items-start gap-2.5 animate-in fade-in">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-semibold text-amber-900">
                  Overlapping Schedule Notice
                </div>
                <div className="text-[11px] text-amber-700 leading-relaxed">
                  Dates overlap with {overlappingSprints.map((s) => `"${s.name}"`).join(', ')}. Multiple planned {isKanban ? 'cycles' : 'sprints'} are allowed, but only one {isKanban ? 'cycle' : 'sprint'} can be active at a time.
                </div>
              </div>
            </div>
          )}

          {/* Footer buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`px-4 py-2 text-xs font-bold text-white rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                isKanban ? 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800' : 'bg-purple-600 hover:bg-purple-700 active:bg-purple-800'
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>{isKanban ? 'Create Cycle' : 'Create Sprint'}</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}

