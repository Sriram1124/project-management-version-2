import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  X, 
  User, 
  KeyRound, 
  UserX, 
  Shield, 
  Calendar, 
  Mail, 
  Layers, 
  CheckCircle2, 
  Clock, 
  Loader2, 
  Edit3,
  BarChart3,
  GraduationCap
} from 'lucide-react';
import { usersService } from '../../services/users.service';
import { cohortsService } from '../../services/cohorts.service';
import { useAuth } from '../../context/AuthContext';

const BATCH_OPTIONS = ['A', 'B', 'C', 'D'];
const SUBBATCH_OPTIONS = {
  A: ['A1', 'A2'],
  B: ['B1', 'B2'],
  C: ['C1', 'C2'],
  D: ['D1', 'D2'],
};

export default function UserDetailModal({
  isOpen,
  user,
  onClose,
  onOpenResetPassword,
  onOpenDeactivate,
  onOpenPerformanceReport,
  onSuccess
}) {
  const { user: authUser } = useAuth();
  const canEdit = authUser?.role === 'MANAGER' || authUser?.role === 'ADMIN' || authUser?.role === 'SUPER_ADMIN';

  const [currentUser, setCurrentUser] = useState(user);
  const [isEditing, setIsEditing] = useState(false);
  const [cohorts, setCohorts] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    batch: 'A',
    subbatch: 'A1',
    cohort_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const navigate = useNavigate();

  // Load cohorts when modal opens
  useEffect(() => {
    if (isOpen) {
      cohortsService.getCohorts()
        .then((res) => {
          const list = Array.isArray(res) ? res : (res?.cohorts || []);
          setCohorts(list);
        })
        .catch((err) => {
          console.error('Failed to load cohorts:', err);
        });
    }
  }, [isOpen]);

  // Sync internal user state when user prop changes
  useEffect(() => {
    setCurrentUser(user);
    setIsEditing(false);
    setEditError('');
    setSuccessMsg('');
  }, [user, isOpen]);

  if (!isOpen || !currentUser) return null;

  const handleStartEdit = () => {
    let initialBatch = (currentUser.batch || 'A').toUpperCase();
    if (!BATCH_OPTIONS.includes(initialBatch)) {
      initialBatch = 'A';
    }
    const validSubbatches = SUBBATCH_OPTIONS[initialBatch] || ['A1', 'A2'];
    let initialSubbatch = (currentUser.subbatch || validSubbatches[0]).toUpperCase();
    if (!validSubbatches.includes(initialSubbatch)) {
      initialSubbatch = validSubbatches[0];
    }

    setFormData({
      name: currentUser.name || '',
      batch: initialBatch,
      subbatch: initialSubbatch,
      cohort_id: currentUser.cohort_id || currentUser.cohort?.id || '',
    });
    setEditError('');
    setSuccessMsg('');
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditError('');
  };

  const handleBatchChange = (newBatch) => {
    const validSubbatches = SUBBATCH_OPTIONS[newBatch] || [];
    const newSubbatch = validSubbatches.includes(formData.subbatch)
      ? formData.subbatch
      : validSubbatches[0] || '';
    setFormData((prev) => ({
      ...prev,
      batch: newBatch,
      subbatch: newSubbatch,
    }));
  };

  const handleSaveChanges = async (e) => {
    e?.preventDefault();
    if (!formData.name.trim()) {
      setEditError('Name is required and cannot be empty.');
      return;
    }

    try {
      setSaving(true);
      setEditError('');
      const response = await usersService.updateMember(currentUser.id, {
        name: formData.name.trim(),
        batch: formData.batch,
        subbatch: formData.subbatch,
        cohort_id: formData.cohort_id || null,
      });

      const selectedCohortObj = cohorts.find((c) => c.id === formData.cohort_id) || null;
      const updated = response?.user || {
        ...currentUser,
        name: formData.name.trim(),
        batch: formData.batch,
        subbatch: formData.subbatch,
        cohort_id: formData.cohort_id || null,
        cohort: selectedCohortObj,
        updated_at: new Date().toISOString(),
      };

      setCurrentUser(updated);
      setIsEditing(false);
      setSuccessMsg('Intern details updated successfully.');
      onSuccess?.(updated);

      // Auto-clear success message after 4 seconds
      setTimeout(() => {
        setSuccessMsg('');
      }, 4000);
    } catch (err) {
      setEditError(err.message || 'Failed to update member details.');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setIsEditing(false);
    setEditError('');
    setSuccessMsg('');
    onClose();
  };

  const handlePerformanceReport = () => {
    handleClose();
    if (onOpenPerformanceReport) {
      onOpenPerformanceReport(currentUser);
    } else {
      navigate('/manager/reports');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-50/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
              {(currentUser.name || currentUser.email || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 tracking-tight truncate">
                {isEditing ? 'Edit Member Details' : 'Member Details'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {isEditing ? 'Update profile information and batch allocation' : 'Account profile & security status'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            {!isEditing && (
              <button
                type="button"
                onClick={handlePerformanceReport}
                className="px-3 py-1.5 rounded-lg border border-purple-200 hover:bg-purple-50 text-purple-700 font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
                title="View Performance Report"
              >
                <BarChart3 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span>Performance Report</span>
              </button>
            )}
            {canEdit && !isEditing && (
              <button
                type="button"
                onClick={handleStartEdit}
                className="px-3 py-1.5 rounded-lg border border-purple-200 hover:bg-purple-50 text-purple-700 font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
              >
                <Edit3 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span>Edit Details</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer shrink-0"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Details */}
        <div className="p-6 space-y-4 text-xs">
          
          {/* Success Banner */}
          {successMsg && !isEditing && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 font-medium animate-in fade-in duration-150">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Status Banner */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="font-semibold text-slate-600">Account Status</span>
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
              currentUser.is_active !== false
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}>
              {currentUser.is_active !== false ? '● Active' : '○ Inactive'}
            </span>
          </div>

          {/* EDIT MODE FORM */}
          {isEditing ? (
            <form onSubmit={handleSaveChanges} className="space-y-4 pt-1">
              {editError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium animate-in fade-in duration-150">
                  {editError}
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-slate-700 font-bold text-xs">
                  Member Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter intern's full name"
                  required
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900 font-medium focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600 shadow-2xs"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-700 font-bold text-xs">
                  Cohort
                </label>
                <select
                  value={formData.cohort_id}
                  onChange={(e) => setFormData((prev) => ({ ...prev, cohort_id: e.target.value }))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900 font-medium bg-white focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600 shadow-2xs cursor-pointer"
                >
                  <option value="">-- No Cohort Assigned --</option>
                  {cohorts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="block text-slate-700 font-bold text-xs">
                    Batch <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.batch}
                    onChange={(e) => handleBatchChange(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900 font-medium bg-white focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600 shadow-2xs cursor-pointer"
                  >
                    {BATCH_OPTIONS.map((b) => (
                      <option key={b} value={b}>
                        Batch {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-700 font-bold text-xs">
                    Subbatch <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.subbatch}
                    onChange={(e) => setFormData((prev) => ({ ...prev, subbatch: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-900 font-medium bg-white focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600 shadow-2xs cursor-pointer"
                  >
                    {(SUBBATCH_OPTIONS[formData.batch] || []).map((sb) => (
                      <option key={sb} value={sb}>
                        Subbatch {sb}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500 font-medium text-[11px]">
                  Email (Read-only)
                </label>
                <div className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 font-mono text-slate-600 select-all">
                  {currentUser.email}
                </div>
                <p className="text-[10px] text-slate-400">
                  Email is locked for account identity and authentication safety.
                </p>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500 font-medium text-[11px]">
                  Role / Type (Read-only)
                </label>
                <div className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    currentUser.type === 'INTERN'
                      ? 'bg-purple-100 text-purple-700'
                      : currentUser.type === 'EMPLOYEE'
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-slate-100 text-slate-700'
                  }`}>
                    {currentUser.type || 'INTERN'}
                  </span>
                </div>
              </div>
            </form>
          ) : (
            /* READ-ONLY VIEW */
            <>
              <div className="divide-y divide-slate-100">
                
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-500 font-medium flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    Name
                  </span>
                  <span className="font-bold text-slate-900">{currentUser.name || '—'}</span>
                </div>

                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-500 font-medium flex items-center gap-1.5">
                    <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
                    Cohort
                  </span>
                  {currentUser.cohort?.name || currentUser.cohort_name ? (
                    <span className="font-semibold text-xs text-slate-800">
                      {currentUser.cohort?.name || currentUser.cohort_name}
                    </span>
                  ) : (
                    <span className="text-slate-400 font-medium text-xs">Not assigned</span>
                  )}
                </div>

                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-500 font-medium flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-slate-400" />
                    Batch / Subbatch
                  </span>
                  {currentUser.batch && currentUser.subbatch ? (
                    <span className="font-mono text-[11px] font-bold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded border border-purple-200">
                      {currentUser.batch} / {currentUser.subbatch}
                    </span>
                  ) : currentUser.batch || currentUser.subbatch ? (
                    <span className="font-mono text-[11px] font-bold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded border border-purple-200">
                      {currentUser.batch || currentUser.subbatch}
                    </span>
                  ) : (
                    <span className="text-slate-400 font-medium text-xs">Not assigned</span>
                  )}
                </div>

                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-500 font-medium flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    Email
                  </span>
                  <span className="font-mono text-slate-700">{currentUser.email}</span>
                </div>

                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-500 font-medium flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-slate-400" />
                    Role / Type
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    currentUser.type === 'INTERN'
                      ? 'bg-purple-100 text-purple-700'
                      : currentUser.type === 'EMPLOYEE'
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-slate-100 text-slate-700'
                  }`}>
                    {currentUser.type || 'MEMBER'}
                  </span>
                </div>

                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-500 font-medium flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    Created Date
                  </span>
                  <span className="text-slate-700">
                    {currentUser.created_at ? new Date(currentUser.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}
                  </span>
                </div>

                {currentUser.updated_at && (
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-500 font-medium flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      Last Updated
                    </span>
                    <span className="text-slate-700">
                      {new Date(currentUser.updated_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Action Buttons Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
          {isEditing ? (
            <div className="flex items-center justify-end gap-2 w-full">
              <button
                type="button"
                disabled={saving}
                onClick={handleCancelEdit}
                className="px-4 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveChanges}
                className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save Changes
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleClose();
                    onOpenResetPassword(currentUser);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-purple-200 hover:bg-purple-50 text-purple-700 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  Reset Password
                </button>

                {currentUser.is_active !== false && (
                  <button
                    type="button"
                    onClick={() => {
                      handleClose();
                      onOpenDeactivate(currentUser);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-700 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    Deactivate
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-1.5 rounded-lg text-slate-600 hover:bg-slate-200/60 font-semibold text-xs transition-colors cursor-pointer"
              >
                Close
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
