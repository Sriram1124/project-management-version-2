import React, { useState } from 'react';
import { 
  User, 
  Mail, 
  GraduationCap, 
  ShieldCheck, 
  CheckCircle2, 
  Edit3,
  Check, 
  X,
  Layers,
  Save,
  Loader2
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { authService } from '../../../services/auth.service';

export default function InternProfileTab({ onToast }) {
  const { user: authUser, updateUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(authUser?.name || '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const displayName = authUser?.name || 'Intern';
  const displayEmail = authUser?.email || 'intern@dailoqa.com';
  const displayRole = authUser?.role || 'INTERN';
  const displayBatch = authUser?.batch || 'Not Assigned';
  const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=7C3AED&color=fff`;

  const handleOpenEdit = () => {
    setEditName(authUser?.name || '');
    setErrorMsg('');
    setIsEditing(true);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!editName.trim()) {
      setErrorMsg('Name cannot be empty');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMsg('');
      const res = await authService.updateProfile({ name: editName.trim() });
      if (res?.user) {
        updateUser(res.user);
      } else {
        updateUser({ name: editName.trim() });
      }
      setIsEditing(false);
      onToast?.('Profile updated successfully!');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto w-full">
      {/* Profile Header Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card flex flex-col sm:flex-row items-center sm:items-start justify-between gap-5">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <img
            src={avatar}
            alt={displayName}
            className="w-20 h-20 rounded-2xl object-cover border-2 border-purple-200 shadow-sm"
          />

          <div className="flex-1 text-center sm:text-left space-y-1">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">{displayName}</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 w-fit mx-auto sm:mx-0">
                {displayRole}
              </span>
              {authUser?.batch && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 w-fit mx-auto sm:mx-0">
                  {authUser.batch}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-medium">
              {displayRole === 'INTERN' ? 'Engineering Intern' : displayRole}
            </p>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-slate-500 pt-2">
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                {displayEmail}
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                Role: {displayRole}
              </span>
              <span className="flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
                Batch: {displayBatch}
              </span>
            </div>
          </div>
        </div>

        {/* Edit Profile Button */}
        <button
          type="button"
          onClick={handleOpenEdit}
          className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition-colors self-center sm:self-start"
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>Edit Profile</span>
        </button>
      </div>

      {/* Account Details & Batch Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card space-y-3">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <User className="w-4 h-4 text-purple-600" />
            <span>Account Details</span>
          </h3>
          <div className="space-y-2 text-xs divide-y divide-slate-100">
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Full Name:</span>
              <span className="font-semibold text-slate-800">{displayName}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Email Address:</span>
              <span className="font-semibold text-slate-800">{displayEmail}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Assigned Batch:</span>
              <span className="font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                {displayBatch}
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Account Type:</span>
              <span className="font-semibold text-slate-800">{displayRole}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Session Status:</span>
              <span className="font-semibold text-emerald-600">Active</span>
            </div>
          </div>
        </div>

        {/* Workstation Overview */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-purple-600" />
                <span>Intern Overview</span>
              </h3>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                Active Cohort
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Your intern account is registered under cohort {displayBatch}. You can review your assigned projects, complete daily work items, and participate in scheduled team syncs through your workstation tabs.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 flex items-center justify-between">
            <span className="text-xs text-slate-600 font-medium">Cohort Status</span>
            <span className="text-xs font-semibold text-emerald-700">Enrolled & Active</span>
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
                  <Edit3 className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Edit Profile</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="mt-4 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="Enter your name"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={displayEmail}
                  disabled
                  className="w-full px-3 py-2 text-xs border border-slate-200 bg-slate-100 text-slate-500 rounded-lg cursor-not-allowed"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Email address is managed by your organization and cannot be changed.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assigned Batch
                </label>
                <input
                  type="text"
                  value={displayBatch}
                  disabled
                  className="w-full px-3 py-2 text-xs border border-slate-200 bg-slate-100 text-slate-500 rounded-lg cursor-not-allowed"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Batch assignment is managed by program managers.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
