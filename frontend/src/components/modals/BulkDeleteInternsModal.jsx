import React, { useState, useEffect } from 'react';
import { X, Trash2, AlertTriangle, Loader2, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { usersService } from '../../services/users.service';

export default function BulkDeleteInternsModal({
  isOpen,
  selectedCount = 0,
  selectedUsers = [],
  selectedUserIds = [],
  onClose,
  onSuccess,
}) {
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Reset form state whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setConfirmText('');
      setShowPassword(false);
      setLoading(false);
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isConfirmed = confirmText.trim() === 'DELETE';
  const hasPassword = password.trim().length > 0;
  const canSubmit = isConfirmed && hasPassword && !loading && selectedCount > 0;

  const handleDelete = async (e) => {
    e?.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError('');

    try {
      const targetUserIds =
        selectedUserIds && selectedUserIds.length > 0
          ? selectedUserIds
          : selectedUsers.map((u) => (typeof u === 'string' ? u : u.id));
      const result = await usersService.deleteUsersBulk({
        userIds: targetUserIds,
        password: password.trim(),
      });

      onSuccess?.(result);
      onClose();
    } catch (err) {
      const errMsg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Failed to execute bulk deletion.';
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-xs bg-rose-100 text-rose-700">
              <Trash2 className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                Permanently Delete {selectedCount} Member{selectedCount === 1 ? '' : 's'}?
              </h3>
              <p className="text-[11px] text-slate-500">
                Password-protected irreversible bulk deletion
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleDelete} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl font-medium flex items-start gap-2 animate-in fade-in">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{error}</div>
            </div>
          )}

          {/* Warning Banner */}
          <div className="p-3.5 bg-rose-50/70 border border-rose-200/90 rounded-xl text-rose-900 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold block">Permanent Deletion Warning</span>
              <p className="text-[11px] text-rose-800/90 leading-relaxed">
                This action permanently deletes member accounts and access credentials. Associated audit logs and historical project records will be detached according to retention policy. This action cannot be undone.
              </p>
            </div>
          </div>

          {/* Selected Members Summary Preview */}
          {selectedUsers.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                <span>Selected Members ({selectedCount})</span>
                <span className="text-slate-400 font-normal">
                  {selectedUsers.length > 3 ? `Showing first 3 of ${selectedCount}` : ''}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 max-h-28 overflow-y-auto divide-y divide-slate-100">
                {selectedUsers.slice(0, 5).map((user) => (
                  <div key={user.id} className="py-1 flex items-center justify-between text-[11px]">
                    <div className="font-medium text-slate-800 truncate mr-2">
                      {user.name || 'Member'}{' '}
                      <span className="text-slate-400 text-[10px] font-mono">({user.email})</span>
                    </div>
                    <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 shrink-0">
                      {user.type || 'INTERN'}
                    </span>
                  </div>
                ))}
                {selectedUsers.length > 5 && (
                  <div className="pt-1 text-[10px] text-slate-500 italic text-center">
                    + {selectedUsers.length - 5} more member{selectedUsers.length - 5 === 1 ? '' : 's'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Password Verification Field */}
          <div className="space-y-1.5 pt-1">
            <label className="block text-[11px] font-bold text-slate-700">
              Account Password <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                placeholder="Enter your current password to authorize..."
                autoComplete="current-password"
                className="w-full pl-3 pr-10 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs placeholder:text-slate-400 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/20 shadow-2xs disabled:bg-slate-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-500">
              Verified on server using secure cryptographic authentication.
            </p>
          </div>

          {/* Final Explicit Confirmation Keyword Input */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-700">
              Type <span className="font-mono text-rose-600 bg-rose-50 px-1 py-0.5 rounded border border-rose-200">DELETE</span> to confirm <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={loading}
              placeholder="DELETE"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-mono placeholder:text-slate-300 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/20 shadow-2xs disabled:bg-slate-50"
            />
            {confirmText.length > 0 && !isConfirmed && (
              <p className="text-[10px] text-amber-600">
                Confirmation keyword must match exactly: DELETE
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Deleting {selectedCount} Member{selectedCount === 1 ? '' : 's'}...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete {selectedCount} Member{selectedCount === 1 ? '' : 's'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

