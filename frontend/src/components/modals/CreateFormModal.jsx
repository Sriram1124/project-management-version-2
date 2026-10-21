import React, { useState, useEffect } from 'react';
import { X, FileText, Users, CheckSquare, Clock, Calendar } from 'lucide-react';
import { formsService, formatFormDeadline } from '../../services/forms.service';
import { cohortsService } from '../../services/cohorts.service';

function parseDeadlineToParts(deadline) {
  if (!deadline) return { date: '', hours: '11', minutes: '59', ampm: 'PM' };
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return { date: '', hours: '11', minutes: '59', ampm: 'PM' };
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d);
  let hours = '11';
  let minutes = '59';
  let ampm = 'PM';
  for (const p of parts) {
    if (p.type === 'hour') hours = p.value.padStart(2, '0');
    if (p.type === 'minute') minutes = p.value.padStart(2, '0');
    if (p.type === 'dayPeriod') ampm = p.value.toUpperCase();
  }
  return { date: dateStr, hours, minutes, ampm };
}

function combineDateAndTime(dateStr, hoursStr, minutesStr, ampmStr) {
  if (!dateStr) return null;
  let h = parseInt(hoursStr, 10);
  const m = parseInt(minutesStr, 10);
  if (Number.isNaN(h) || h < 1 || h > 12) return null;
  if (Number.isNaN(m) || m < 0 || m > 59) return null;
  if (ampmStr === 'AM') {
    if (h === 12) h = 0;
  } else if (ampmStr === 'PM') {
    if (h !== 12) h += 12;
  }
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return new Date(`${dateStr}T${hh}:${mm}:00.000+05:30`).toISOString();
}

export default function CreateFormModal({ form, cohorts: initialCohorts, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [cohorts, setCohorts] = useState(initialCohorts || []);
  const [selectedCohortIds, setSelectedCohortIds] = useState([]);
  const [isAllCohorts, setIsAllCohorts] = useState(true);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    target_roles: ['INTERN']
  });

  const [deadlineDate, setDeadlineDate] = useState('');
  const [timeHours, setTimeHours] = useState('11');
  const [timeMinutes, setTimeMinutes] = useState('59');
  const [timeAmPm, setTimeAmPm] = useState('PM');
  const [error, setError] = useState('');

  const isEditMode = Boolean(form && form.id);
  const todayInBusinessTz = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const savedDateStr = form?.deadline ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(form.deadline)) : null;
  const minDate = isEditMode && savedDateStr && savedDateStr < todayInBusinessTz ? savedDateStr : todayInBusinessTz;

  // Fetch cohorts if not passed
  useEffect(() => {
    if (!initialCohorts || initialCohorts.length === 0) {
      cohortsService.getCohorts()
        .then((res) => {
          const list = Array.isArray(res) ? res : (res?.cohorts || []);
          if (list.length > 0) {
            setCohorts(list);
          }
        })
        .catch((err) => console.error('Failed to load cohorts for form modal:', err));
    }
  }, [initialCohorts]);

  useEffect(() => {
    if (form) {
      setFormData({
        title: form.title || '',
        description: form.description || '',
        target_roles: form.target_roles || ['INTERN']
      });

      const parsed = parseDeadlineToParts(form.deadline);
      setDeadlineDate(parsed.date);
      setTimeHours(parsed.hours);
      setTimeMinutes(parsed.minutes);
      setTimeAmPm(parsed.ampm);

      const roles = form.target_roles || [];
      const cohortTags = roles
        .filter((r) => r.startsWith('COHORT:'))
        .map((r) => r.replace('COHORT:', ''));

      if (roles.includes('ALL_COHORTS') || cohortTags.length === 0) {
        setIsAllCohorts(true);
        if (cohorts.length > 0) {
          setSelectedCohortIds(cohorts.map((c) => c.id));
        }
      } else {
        setIsAllCohorts(false);
        setSelectedCohortIds(cohortTags);
      }
    } else {
      setFormData({
        title: '',
        description: '',
        target_roles: ['INTERN']
      });
      setDeadlineDate('');
      setTimeHours('11');
      setTimeMinutes('59');
      setTimeAmPm('PM');
      setIsAllCohorts(true);
      if (cohorts.length > 0) {
        setSelectedCohortIds(cohorts.map((c) => c.id));
      }
    }
  }, [form, cohorts]);

  const handleToggleAll = () => {
    if (isAllCohorts) {
      setIsAllCohorts(false);
      setSelectedCohortIds([]);
    } else {
      setIsAllCohorts(true);
      setSelectedCohortIds(cohorts.map((c) => c.id));
    }
  };

  const handleToggleCohort = (cohortId) => {
    setSelectedCohortIds((prev) => {
      let next;
      if (prev.includes(cohortId)) {
        next = prev.filter((id) => id !== cohortId);
      } else {
        next = [...prev, cohortId];
      }
      setIsAllCohorts(next.length === cohorts.length && cohorts.length > 0);
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title?.trim()) return setError('Form Title is required');
    if (!isAllCohorts && selectedCohortIds.length === 0) {
      return setError('Please select at least one cohort audience');
    }

    let deadlineIso = null;
    if (deadlineDate) {
      if (deadlineDate < minDate) {
        return setError(`Deadline date cannot be earlier than permitted date (${minDate})`);
      }
      const h = parseInt(timeHours, 10);
      const m = parseInt(timeMinutes, 10);
      if (Number.isNaN(h) || h < 1 || h > 12) {
        return setError('Please enter a valid deadline hour (1-12)');
      }
      if (Number.isNaN(m) || m < 0 || m > 59) {
        return setError('Please enter a valid deadline minute (00-59)');
      }
      deadlineIso = combineDateAndTime(deadlineDate, timeHours, timeMinutes, timeAmPm);
      if (!deadlineIso) {
        return setError('Invalid deadline date or time');
      }
    }

    setLoading(true);
    setError('');
    try {
      const targetRoles = ['INTERN'];
      if (isAllCohorts || (cohorts.length > 0 && selectedCohortIds.length === cohorts.length)) {
        targetRoles.push('ALL_COHORTS');
        cohorts.forEach((c) => targetRoles.push(`COHORT:${c.id}`));
      } else {
        selectedCohortIds.forEach((id) => targetRoles.push(`COHORT:${id}`));
      }

      const payload = {
        ...formData,
        target_roles: targetRoles,
        target_cohort_ids: isAllCohorts ? cohorts.map((c) => c.id) : selectedCohortIds,
        deadline: deadlineIso
      };

      if (isEditMode) {
        await formsService.updateForm(form.id, payload);
      } else {
        await formsService.createForm(payload);
      }
      onSuccess();
    } catch (err) {
      setError(err.message || (isEditMode ? 'Failed to update form' : 'Failed to create form'));
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-600" />
            {isEditMode ? 'Update Form' : 'Create New Form'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">
          {error && <div className="p-3 bg-rose-50 text-rose-700 text-xs font-semibold rounded-lg">{error}</div>}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Form Title *</label>
            <input
              type="text"
              className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
              placeholder="e.g. Weekly Cohort Evaluation"
              value={formData.title}
              onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
            <textarea
              className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 min-h-[72px]"
              placeholder="Brief instructions for respondents..."
              value={formData.description}
              onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
            />
          </div>

          {/* Cohort Option Audience Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <Users className="w-3.5 h-3.5 text-purple-600" />
                <span>Target Cohort Audience *</span>
              </label>
              <button
                type="button"
                onClick={handleToggleAll}
                className="text-[11px] font-semibold text-purple-600 hover:text-purple-800 transition-colors cursor-pointer"
              >
                {isAllCohorts ? 'Deselect All' : 'Select All Cohorts'}
              </button>
            </div>

            <div className="space-y-2">
              {/* All Cohorts multiple selective choice master switch */}
              <label className="flex items-center justify-between px-3 py-2 rounded-xl bg-purple-50/70 border border-purple-200/80 cursor-pointer select-none hover:bg-purple-100/60 transition-colors">
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={isAllCohorts}
                    onChange={handleToggleAll}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-purple-300"
                  />
                  <span className="text-xs font-bold text-purple-900">All Cohorts</span>
                </div>
                <span className="text-[10px] font-semibold text-purple-700 bg-purple-100/90 border border-purple-200 px-2 py-0.5 rounded-full">
                  {cohorts.length > 0 ? `${cohorts.length} available` : 'All database cohorts'}
                </span>
              </label>

              {/* Individual Cohorts multiple checkboxes */}
              {cohorts.length > 0 && (
                <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto p-1.5 bg-slate-50/80 border border-slate-200 rounded-xl">
                  {cohorts.map((c) => {
                    const isSelected = selectedCohortIds.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors select-none ${
                          isSelected
                            ? 'bg-purple-100/80 border-purple-300 text-purple-900 font-bold'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleCohort(c.id)}
                          className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 border-slate-300"
                        />
                        <span className="truncate">{c.name || c.code}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="text-[10px] text-slate-500 mt-1">
              {isAllCohorts
                ? 'This form will be accessible to all interns across all cohorts in the organization.'
                : `${selectedCohortIds.length} of ${cohorts.length} cohort(s) selected.`}
            </p>
          </div>

          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Deadline Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-purple-600" />
                    Deadline Date
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">Min: {minDate}</span>
                </label>
                <input
                  type="date"
                  min={minDate}
                  value={deadlineDate}
                  onChange={(e) => {
                    setDeadlineDate(e.target.value);
                    if (error) setError('');
                  }}
                  className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                />
              </div>

              {/* Deadline Time */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-purple-600" />
                    Deadline Time
                  </span>
                  <span className="text-[10px] text-purple-600 font-medium">Asia/Kolkata (IST)</span>
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    max="12"
                    placeholder="11"
                    value={timeHours}
                    onChange={(e) => {
                      const v = e.target.value.slice(0, 2);
                      setTimeHours(v);
                    }}
                    className="w-14 text-center text-sm p-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 font-mono"
                  />
                  <span className="font-bold text-slate-400">:</span>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    placeholder="59"
                    value={timeMinutes}
                    onChange={(e) => {
                      const v = e.target.value.slice(0, 2);
                      setTimeMinutes(v);
                    }}
                    className="w-14 text-center text-sm p-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 font-mono"
                  />
                  <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200 ml-1">
                    <button
                      type="button"
                      onClick={() => setTimeAmPm('AM')}
                      className={`px-2 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                        timeAmPm === 'AM'
                          ? 'bg-purple-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      AM
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimeAmPm('PM')}
                      className={`px-2 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                        timeAmPm === 'PM'
                          ? 'bg-purple-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      PM
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Presets & Live Selected Deadline Preview */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-0.5">
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <span className="text-[10px] uppercase font-bold text-slate-400">Presets:</span>
                <button
                  type="button"
                  onClick={() => { setTimeHours('11'); setTimeMinutes('59'); setTimeAmPm('PM'); }}
                  className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-purple-50 hover:text-purple-700 text-slate-600 transition-colors font-medium cursor-pointer text-[10px]"
                >
                  11:59 PM (End of Day)
                </button>
                <button
                  type="button"
                  onClick={() => { setTimeHours('06'); setTimeMinutes('00'); setTimeAmPm('PM'); }}
                  className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-purple-50 hover:text-purple-700 text-slate-600 transition-colors font-medium cursor-pointer text-[10px]"
                >
                  6:00 PM
                </button>
              </div>

              {deadlineDate ? (
                <div className="text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                  <Clock className="w-3 h-3 text-purple-600" />
                  <span>Selected: {formatFormDeadline(combineDateAndTime(deadlineDate, timeHours, timeMinutes, timeAmPm))}</span>
                </div>
              ) : (
                <span className="text-[11px] text-slate-400 italic">No deadline configured</span>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
            >
              {loading
                ? (isEditMode ? 'Updating...' : 'Creating...')
                : (isEditMode ? 'Update Form' : 'Create Form')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
