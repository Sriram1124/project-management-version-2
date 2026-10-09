import React, { useState } from 'react';
import { X, UserX, AlertTriangle, Loader2 } from 'lucide-react';
import { usersService } from '../../services/users.service';

export default function DeactivateUserModal({ isOpen, user, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !user) return null;

  const handleDeactivate = async () => {
    setLoading(true);
    setError('');
    try {
      await usersService.deactivateUser(user.id);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to deactivate user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-xs bg-red-100 text-red-700">
              <UserX className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Deactivate User Account?
              </h3>
              <p className="text-[11px] text-slate-500">
                {user.name} ({user.email})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl font-medium">
              {error}
            </div>
          )}

          <div className="p-3.5 bg-red-50/60 border border-red-200/80 rounded-xl text-red-900 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold block">Account Deactivation Notice</span>
              <p className="text-[11px] text-red-800/90 leading-relaxed">
                <strong>{user.name}</strong> will no longer be able to log in to the platform. Any active login sessions will be terminated immediately.
              </p>
            </div>
          </div>

          <p className="text-slate-600 leading-relaxed">
            Existing project assignments, tasks, work items, and form submissions created by this user will be safely preserved in the database.
          </p>

          <div className="pt-2 flex justify-end gap-2.5">
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleDeactivate}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Deactivating...
                </>
              ) : (
                <>
                  <UserX className="w-3.5 h-3.5" />
                  Deactivate User
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
