import React, { useState, useEffect } from 'react';
import { X, FileText, Users, CheckSquare } from 'lucide-react';
import { formsService } from '../../services/forms.service';
import { cohortsService } from '../../services/cohorts.service';

export default function CreateFormModal({ form, cohorts: initialCohorts, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [cohorts, setCohorts] = useState(initialCohorts || []);
  const [selectedCohortIds, setSelectedCohortIds] = useState([]);
  const [isAllCohorts, setIsAllCohorts] = useState(true);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    deadline: '',
    target_roles: ['INTERN']
  });
  const [error, setError] = useState('');

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
        deadline: form.deadline ? new Date(form.deadline).toISOString().slice(0, 16) : '',
        target_roles: form.target_roles || ['INTERN']
      });

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
        deadline: '',
        target_roles: ['INTERN']
      });
      setIsAllCohorts(true);
      if (cohorts.length > 0) {
        setSelectedCohortIds(cohorts.map((c) => c.id));
      }
    }
  }, [form, cohorts]);

  const isEditMode = Boolean(form && form.id);

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
        deadline: formData.deadline ? new Date(formData.deadline).toISOString() : null
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
              autoFocus
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

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Submission Deadline</label>
            <input
              type="datetime-local"
              className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
              value={formData.deadline}
              onChange={(e) => setFormData((p) => ({ ...p, deadline: e.target.value }))}
            />
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
