import React, { useState, useEffect } from 'react';
import { X, User, Mail, ShieldAlert, Loader2, Sparkles, Building2, UserPlus, Info, Layers, GraduationCap } from 'lucide-react';
import { usersService } from '../../services/users.service';
import { cohortsService } from '../../services/cohorts.service';

const BATCH_OPTIONS = ['A', 'B', 'C', 'D'];
const SUBBATCH_OPTIONS = {
  A: ['A1', 'A2'],
  B: ['B1', 'B2'],
  C: ['C1', 'C2'],
  D: ['D1', 'D2'],
};

export default function AddMemberModal({ isOpen, onClose, onSuccess, defaultCohortId = null, cohorts: initialCohorts = [] }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [type, setType] = useState('INTERN');
  const [batch, setBatch] = useState('');
  const [subbatch, setSubbatch] = useState('');
  const [cohortId, setCohortId] = useState('');
  const [cohorts, setCohorts] = useState(initialCohorts);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Load cohorts and set default whenever modal opens or defaultCohortId changes
  useEffect(() => {
    if (isOpen) {
      if (initialCohorts && initialCohorts.length > 0) {
        setCohorts(initialCohorts);
        const chosen = defaultCohortId || localStorage.getItem('selected_cohort_id') || (initialCohorts[0]?.id || '');
        setCohortId(chosen);
      }

      cohortsService.getCohorts()
        .then((res) => {
          const list = Array.isArray(res) ? res : (res?.cohorts || []);
          if (list.length > 0) {
            setCohorts(list);
            const chosen = defaultCohortId || localStorage.getItem('selected_cohort_id') || (list[0]?.id || '');
            setCohortId(chosen);
          }
        })
        .catch((err) => console.error('Failed to load cohorts:', err));
    }
  }, [isOpen, defaultCohortId, initialCohorts]);

  if (!isOpen) return null;

  const handleBatchChange = (newBatch) => {
    setBatch(newBatch);
    if (!newBatch) {
      setSubbatch('');
    } else {
      const validSubs = SUBBATCH_OPTIONS[newBatch] || [];
      setSubbatch(validSubs[0] || '');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const payload = {
        name: name.trim(),
        email: email.trim(),
        type,
      };

      if (type === 'INTERN') {
        if (batch) {
          payload.batch = batch;
          if (subbatch) {
            payload.subbatch = subbatch;
          }
        }
        payload.cohort_id = cohortId || null;
      }

      const result = await usersService.createUser(payload);

      // Clear fields
      setName('');
      setEmail('');
      setType('INTERN');
      setBatch('');
      setSubbatch('');

      // Call parent onSuccess with created user and temporary credentials
      onSuccess(result);
    } catch (err) {
      setError(err.message || 'Failed to create user');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shadow-xs">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Add New Member</h2>
              <p className="text-xs text-slate-500 mt-0.5">Provision an Intern or Employee in your organization.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Full Name
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                autoFocus
                className="w-full pl-9 pr-3 py-2.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-purple-600 text-slate-800 placeholder:text-slate-400 font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. rahul@example.com"
                className="w-full pl-9 pr-3 py-2.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-purple-600 text-slate-800 placeholder:text-slate-400 font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Member Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setType('INTERN')}
                className={`p-3 rounded-xl border text-left flex items-start justify-between transition-all ${
                  type === 'INTERN'
                    ? 'border-purple-600 bg-purple-50/60 ring-2 ring-purple-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900">Intern</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Project task assignee</p>
                </div>
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                  type === 'INTERN' ? 'border-purple-600 bg-purple-600' : 'border-slate-300'
                }`}>
                  {type === 'INTERN' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setType('EMPLOYEE')}
                className={`p-3 rounded-xl border text-left flex items-start justify-between transition-all ${
                  type === 'EMPLOYEE'
                    ? 'border-purple-600 bg-purple-50/60 ring-2 ring-purple-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900">Employee</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Full team contributor</p>
                </div>
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                  type === 'EMPLOYEE' ? 'border-purple-600 bg-purple-600' : 'border-slate-300'
                }`}>
                  {type === 'EMPLOYEE' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </button>
            </div>
          </div>

          {/* Intern Allocation: Batch, Subbatch, and Automatically Assigned Cohort */}
          {type === 'INTERN' && (
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-purple-600" />
                  Intern Allocation &amp; Cohort
                </span>
                <span className="text-[11px] text-purple-700 bg-purple-100/70 font-semibold px-2 py-0.5 rounded-md">
                  Auto-assigned
                </span>
              </div>

              {/* Automatically assigned Cohort */}
              <div>
                <label className="block text-slate-600 font-semibold text-[11px] mb-1">
                  Assigned Cohort
                </label>
                <div className="flex items-center justify-between px-3 py-2 text-xs rounded-lg border border-purple-200 bg-white font-semibold text-slate-800 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-purple-600 shrink-0" />
                    <span>{cohorts.find((c) => c.id === cohortId)?.name || 'Default Cohort'}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-normal">Active Selection</span>
                </div>
              </div>

              {/* Batch & Subbatch selectors */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-slate-600 font-semibold text-[11px]">
                    Batch <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <select
                    value={batch}
                    onChange={(e) => handleBatchChange(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 font-medium focus:outline-none focus:border-purple-600 shadow-2xs cursor-pointer"
                  >
                    <option value="">-- None (Optional) --</option>
                    {BATCH_OPTIONS.map((b) => (
                      <option key={b} value={b}>
                        Batch {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-600 font-semibold text-[11px]">
                    Subbatch <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <select
                    value={subbatch}
                    disabled={!batch}
                    onChange={(e) => setSubbatch(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 font-medium focus:outline-none focus:border-purple-600 shadow-2xs cursor-pointer disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="">-- None (Optional) --</option>
                    {(SUBBATCH_OPTIONS[batch] || []).map((sb) => (
                      <option key={sb} value={sb}>
                        Subbatch {sb}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Automated System Notice */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-start gap-2.5 text-slate-600">
            <Info className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              The platform will automatically generate a human-readable <strong>User ID</strong> (<span className="font-mono text-slate-800">INT-xxxx</span> or <span className="font-mono text-slate-800">EMP-xxxx</span>) and a <strong>temporary password</strong>. The user will be prompted to set a permanent password upon first login.
            </p>
          </div>

          <div className="pt-2 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Creating Member...
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  Create User
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
