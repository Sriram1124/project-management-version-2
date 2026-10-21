import React, { useState, useEffect, useMemo } from 'react';
import { X, Calendar, Edit3, Loader2, AlertCircle, Check, Info, Trash2, AlertTriangle } from 'lucide-react';
import { sprintsService } from '../../services/sprints.service';

export default function EditSprintModal({
  isOpen,
  onClose,
  projectId,
  projectName = '',
  sprint,
  allSprints = [],
  isKanban = false,
  onSuccess,
  onDelete,
}) {
  const iterationLabel = isKanban ? 'Cycle' : 'Sprint';
  const iterationLower = iterationLabel.toLowerCase();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState('PLANNED');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Helper to format date into YYYY-MM-DD for native date input
  const formatDateForInput = (dVal) => {
    if (!dVal) return '';
    try {
      const d = new Date(dVal);
      if (Number.isNaN(d.getTime())) return '';
      return d.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  // Populate state whenever sprint prop changes
  useEffect(() => {
    if (sprint) {
      setName(sprint.name || '');
      setGoal(sprint.goal || '');
      setStartDate(formatDateForInput(sprint.start_date || sprint.startDate));
      setEndDate(formatDateForInput(sprint.end_date || sprint.endDate));
      setStatus(sprint.status || 'PLANNED');
      setError('');
      setIsConfirmingDelete(false);
    }
  }, [sprint, isOpen]);

  // Check if any other sprint in project is active
  const otherActiveSprint = allSprints.find(
    (s) => s.id !== sprint?.id && s.status === 'ACTIVE'
  );

  // Subtle overlap indicator calculation (does not block editing dates)
  const overlappingSprints = useMemo(() => {
    if (!startDate || !endDate || !allSprints?.length) return [];
    const newStart = new Date(startDate).getTime();
    const newEnd = new Date(endDate).getTime();
    if (Number.isNaN(newStart) || Number.isNaN(newEnd) || newStart > newEnd) return [];

    return allSprints.filter((s) => {
      if (s.id === sprint?.id) return false;
      const sStartVal = s.start_date || s.startDate;
      const sEndVal = s.end_date || s.endDate;
      if (!sStartVal || !sEndVal) return false;
      const sStart = new Date(sStartVal).getTime();
      const sEnd = new Date(sEndVal).getTime();
      if (Number.isNaN(sStart) || Number.isNaN(sEnd)) return false;

      return newStart <= sEnd && newEnd >= sStart;
    });
  }, [startDate, endDate, allSprints, sprint]);

  if (!isOpen || !sprint) return null;

  const handleDeleteSprint = async () => {
    if (!projectId || !sprint?.id) return;
    try {
      setDeleting(true);
      setError('');
      await sprintsService.deleteSprint(projectId, sprint.id);
      onDelete?.(sprint);
      onClose();
    } catch (err) {
      console.error(`Failed to delete ${iterationLower}:`, err);
      setError(err?.response?.data?.error || err.message || `Failed to delete ${iterationLower}`);
      setIsConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(`${iterationLabel} name is required`);
      return;
    }

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      setError(`${iterationLabel} start date cannot be later than its end date`);
      return;
    }

    if (status === 'ACTIVE' && otherActiveSprint) {
      setError(`Cannot activate ${iterationLower}: ${iterationLabel} "${otherActiveSprint.name}" is currently active. Please complete or resolve it first.`);
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const updated = await sprintsService.updateSprint(projectId, sprint.id, {
        name: name.trim(),
        goal: goal.trim() || null,
        start_date: startDate ? new Date(startDate).toISOString() : null,
        end_date: endDate ? new Date(endDate).toISOString() : null,
        status: status,
      });

      onSuccess?.(updated || { ...sprint, name: name.trim(), goal: goal.trim(), start_date: startDate, end_date: endDate, status });
      onClose();
    } catch (err) {
      console.error('Failed to update sprint:', err);
      setError(err?.response?.data?.error || err.message || 'Failed to update sprint');
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
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shadow-xs">
              <Edit3 className="w-5 h-5 ml-0.5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Edit {iterationLabel}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Update {iterationLower} details and schedule for {projectName ? `"${projectName}"` : 'this project'}.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer"
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
            <label htmlFor="edit-sprint-name" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              {iterationLabel} Name <span className="text-rose-500">*</span>
            </label>
            <input
              id="edit-sprint-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`e.g., ${iterationLabel} 01 or ${iterationLabel} 02`}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all font-medium"
            />
          </div>

          <div>
            <label htmlFor="edit-sprint-goal" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              {iterationLabel} Goal
            </label>
            <textarea
              id="edit-sprint-goal"
              rows={2}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={`What is the objective or target deliverable for this ${iterationLower}?`}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all resize-none"
            />
          </div>

          <div>
            <label htmlFor="edit-sprint-status" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Status
            </label>
            <select
              id="edit-sprint-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all font-medium cursor-pointer"
            >
              <option value="PLANNED">Planned</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            {status === 'ACTIVE' && otherActiveSprint && (
              <div className="mt-2 p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>
                  {iterationLabel} <strong>"{otherActiveSprint.name}"</strong> is currently active. Please complete or resolve it first before activating this {iterationLower}.
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-sprint-start-date" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Start Date
              </label>
              <input
                id="edit-sprint-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all cursor-pointer"
              />
            </div>
            <div>
              <label htmlFor="edit-sprint-end-date" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                End Date
              </label>
              <input
                id="edit-sprint-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all cursor-pointer"
              />
            </div>
          </div>

          {/* Subtle Overlap Indicator (does not block editing) */}
          {overlappingSprints.length > 0 && (
            <div className="p-3 bg-amber-50/90 border border-amber-200/90 text-amber-900 rounded-xl text-xs flex items-start gap-2.5 animate-in fade-in">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-semibold text-amber-900">
                  Overlapping Schedule Notice
                </div>
                <div className="text-[11px] text-amber-700 leading-relaxed">
                  Dates overlap with {overlappingSprints.map((s) => `"${s.name}"`).join(', ')}. Multiple planned {isKanban ? 'cycles' : 'sprints'} are allowed, but only one {iterationLower} can be active at a time.
                </div>
              </div>
            </div>
          )}

          {/* Footer buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2.5">
            <div>
              {!isConfirmingDelete ? (
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  disabled={submitting || deleting}
                  className="px-3 py-2 text-xs font-bold text-rose-700 hover:text-rose-800 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  title={`Delete this ${iterationLower}`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Delete {iterationLabel}</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 animate-in fade-in">
                  <button
                    type="button"
                    onClick={handleDeleteSprint}
                    disabled={deleting}
                    className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {deleting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    <span>Confirm Delete</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete(false)}
                    disabled={deleting}
                    className="px-2 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting || deleting}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || deleting}
                className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>
  );
}

