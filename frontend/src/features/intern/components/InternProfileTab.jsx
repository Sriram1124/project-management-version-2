import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Loader2,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  FolderKanban,
  Users,
  Calendar,
  ArrowRight,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Building2,
  Clock
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { authService } from '../../../services/auth.service';
import { projectsService } from '../services/projectsService';
import ProjectMethodologyBadge from '../../../components/views/projects/ProjectMethodologyBadge';

export default function InternProfileTab({ onToast, onSelectProject }) {
  const { user: authUser, updateUser } = useAuth();

  // Fresh profile state
  const [profile, setProfile] = useState(authUser || null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Edit Name modal state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(authUser?.name || '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Projects state
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectsError, setProjectsError] = useState(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Change Password state
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    next: false,
    confirm: false,
  });
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(null);
  const [passwordError, setPasswordError] = useState(null);
  const [touched, setTouched] = useState({
    current: false,
    next: false,
    confirm: false,
  });

  // Display computation
  const displayName = profile?.name || authUser?.name || 'Intern';
  const displayEmail = profile?.email || authUser?.email || 'intern@dailoqa.com';
  const displayRole = (profile?.role || authUser?.role || 'INTERN').toUpperCase();
  const displayBatch = profile?.batch || authUser?.batch || 'Not Assigned';
  const displayOrg =
    profile?.organization_name ||
    profile?.organization?.name ||
    authUser?.organization_name ||
    authUser?.organization?.name ||
    'InternHub Enterprise';

  const memberSinceFormatted = useMemo(() => {
    const raw = profile?.created_at || authUser?.created_at;
    if (!raw) return null;
    try {
      const d = new Date(raw);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return null;
    }
  }, [profile?.created_at, authUser?.created_at]);

  const getInitials = (name) => {
    if (!name) return 'IN';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // Fetch / refresh user profile from /api/auth/me
  const fetchProfile = useCallback(async () => {
    try {
      setLoadingProfile(true);
      const data = await authService.getCurrentUser();
      const userObj = data?.user || data;
      if (userObj) {
        setProfile(userObj);
      }
    } catch (err) {
      console.error('Failed to load intern profile:', err);
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  // Fetch assigned projects
  const fetchProjects = useCallback(async () => {
    try {
      setLoadingProjects(true);
      setProjectsError(null);
      const list = await projectsService.getMyProjects();
      setProjects(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Failed to load intern projects:', err);
      setProjectsError(err.message || 'Unable to load assigned projects.');
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
    fetchProjects();
  }, [fetchProfile, fetchProjects]);

  // Edit profile modal handlers
  const handleOpenEdit = () => {
    setEditName(displayName);
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
        setProfile(res.user);
      } else {
        updateUser({ name: editName.trim() });
        setProfile((prev) => ({ ...prev, name: editName.trim() }));
      }
      setIsEditing(false);
      onToast?.('Profile updated successfully!');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  // Change Password validations
  const passwordValidations = useMemo(() => {
    const { currentPassword, newPassword, confirmPassword } = passwordForm;
    const hasCurrent = Boolean(currentPassword.trim());
    const lengthValid = newPassword.length >= 8;
    const differentFromCurrent = hasCurrent && newPassword ? newPassword !== currentPassword : true;
    const matchesConfirm = Boolean(newPassword && newPassword === confirmPassword);
    const isValid = hasCurrent && lengthValid && differentFromCurrent && matchesConfirm;

    return {
      hasCurrent,
      lengthValid,
      differentFromCurrent,
      matchesConfirm,
      isValid,
    };
  }, [passwordForm]);

  const handlePasswordChange = (field, val) => {
    setPasswordForm((prev) => ({ ...prev, [field]: val }));
    setTouched((prev) => ({ ...prev, [field]: true }));
    setPasswordError(null);
    setPasswordSuccess(null);
  };

  const handleCancelPasswordChange = () => {
    setIsChangingPassword(false);
    setPasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    setTouched({ current: false, next: false, confirm: false });
    setPasswordError(null);
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setTouched({ current: true, next: true, confirm: true });

    if (!passwordValidations.hasCurrent) {
      setPasswordError('Current password is required.');
      return;
    }
    if (!passwordValidations.lengthValid) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }
    if (!passwordValidations.differentFromCurrent) {
      setPasswordError('New password cannot match your current password.');
      return;
    }
    if (!passwordValidations.matchesConfirm) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    try {
      setPasswordSubmitting(true);
      setPasswordError(null);
      setPasswordSuccess(null);

      const res = await authService.changePassword(
        passwordForm.currentPassword,
        passwordForm.newPassword
      );

      const msg = res?.message || 'Password changed successfully.';
      setPasswordSuccess(msg);
      onToast?.(msg);

      // Reset form and close expanded view
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setTouched({ current: false, next: false, confirm: false });
      setTimeout(() => {
        setIsChangingPassword(false);
      }, 1500);
    } catch (err) {
      console.error('Password change failed:', err);
      setPasswordError(err.message || 'Failed to update password. Check your current password.');
    } finally {
      setPasswordSubmitting(false);
    }
  };

  // Status badge styling helper
  const getStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE':
        return {
          label: 'Active',
          badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          dotClass: 'bg-emerald-500',
        };
      case 'PLANNED':
        return {
          label: 'Planned',
          badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
          dotClass: 'bg-blue-500',
        };
      case 'COMPLETED':
        return {
          label: 'Completed',
          badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
          dotClass: 'bg-purple-500',
        };
      case 'ARCHIVED':
        return {
          label: 'Archived',
          badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
          dotClass: 'bg-slate-400',
        };
      default:
        return {
          label: status || 'Active',
          badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          dotClass: 'bg-emerald-500',
        };
    }
  };

  // Filter projects based on search query and status filter
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (statusFilter !== 'ALL' && p.status !== statusFilter) {
        return false;
      }
      if (projectSearch.trim()) {
        const q = projectSearch.toLowerCase();
        const nameMatch = p.name?.toLowerCase().includes(q);
        const descMatch = p.description?.toLowerCase().includes(q);
        const methMatch = p.methodology?.toLowerCase().includes(q);
        return nameMatch || descMatch || methMatch;
      }
      return true;
    });
  }, [projects, statusFilter, projectSearch]);

  const activeProjectsCount = useMemo(
    () => projects.filter((p) => p.status === 'ACTIVE').length,
    [projects]
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto w-full pb-10">
      {/* 1. Profile Header Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-purple-700 to-indigo-600 text-white font-extrabold text-2xl flex items-center justify-center shadow-md border-2 border-purple-200 shrink-0">
            {getInitials(displayName)}
          </div>

          <div className="flex-1 text-center sm:text-left space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h2 className="text-xl font-bold text-slate-900">{displayName}</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
                {displayRole}
              </span>
              {displayBatch && displayBatch !== 'Not Assigned' && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Cohort {displayBatch}
                </span>
              )}
            </div>

            <p className="text-xs text-slate-500 font-medium">
              Engineering Intern • {displayOrg}
            </p>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-slate-500 pt-1">
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                {displayEmail}
              </span>
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                {displayOrg}
              </span>
              {memberSinceFormatted && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Joined {memberSinceFormatted}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Edit Profile Button */}
        <button
          type="button"
          onClick={handleOpenEdit}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition-colors shrink-0 cursor-pointer self-center sm:self-start"
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>Edit Profile</span>
        </button>
      </div>

      {/* 2. Account Details & Cohort Privileges */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Account Details */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card space-y-3">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <User className="w-4 h-4 text-purple-600" />
            <span>Account Details</span>
          </h3>
          <div className="space-y-2 text-xs divide-y divide-slate-100">
            <div className="flex justify-between items-center py-2">
              <span className="text-slate-400">Full Name</span>
              <span className="font-semibold text-slate-800">{displayName}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-slate-400">Email Address</span>
              <span className="font-semibold text-slate-800">{displayEmail}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-slate-400">Assigned Cohort</span>
              <span className="font-semibold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded border border-purple-200">
                {displayBatch}
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-slate-400">Account Role</span>
              <span className="font-semibold text-slate-800">{displayRole}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-slate-400">Organization</span>
              <span className="font-semibold text-slate-800">{displayOrg}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-slate-400">Session Status</span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Active
              </span>
            </div>
          </div>
        </div>

        {/* Cohort Overview & Workstation Access */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-purple-600" />
                <span>Cohort & Workstation Access</span>
              </h3>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                Active Member
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-2.5 leading-relaxed">
              Your intern account is enrolled under cohort <strong className="text-slate-800">{displayBatch}</strong>. You have permissions to access assigned sprint projects, complete timesheet logs, log attendance, and view program notifications.
            </p>
          </div>

          <div className="space-y-2 pt-2">
            <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-100 flex items-center justify-between">
              <span className="text-xs text-slate-600 font-medium">Projects Assigned</span>
              <span className="text-xs font-bold text-purple-700">{projects.length} ({activeProjectsCount} active)</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 flex items-center justify-between">
              <span className="text-xs text-slate-600 font-medium">Workstation Status</span>
              <span className="text-xs font-semibold text-emerald-700">Enrolled & Verified</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Change Password Card (Expandable UI) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden transition-all duration-200">
        {!isChangingPassword ? (
          /* Default state: Compact Change Password button with key/lock icon */
          <div className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-50 text-purple-700 rounded-xl">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Change Password</h3>
              </div>
              <p className="text-xs text-slate-500">
                Keep your intern workspace account secure by updating your password regularly.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsChangingPassword(true);
                setPasswordError(null);
                setPasswordSuccess(null);
              }}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-colors shadow-2xs shrink-0 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Change Password</span>
            </button>
          </div>
        ) : (
          /* Expanded state: Form with Current, New, Confirm fields */
          <div className="p-6 space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-purple-50 text-purple-700 rounded-xl">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Change Password</h3>
                  <p className="text-xs text-slate-500">
                    Enter your current credentials and select a strong replacement password.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCancelPasswordChange}
                disabled={passwordSubmitting}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {passwordSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium">{passwordSuccess}</span>
              </div>
            )}

            {passwordError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="font-medium">{passwordError}</span>
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              {/* Field 1: Current Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Current Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.current ? 'text' : 'password'}
                    value={passwordForm.currentPassword}
                    onChange={(e) => handlePasswordChange('currentPassword', e.target.value)}
                    placeholder="Enter current password"
                    disabled={passwordSubmitting}
                    className="w-full px-3.5 py-2.5 pr-10 text-xs border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPasswords((prev) => ({ ...prev, current: !prev.current }))
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title={showPasswords.current ? 'Hide password' : 'Show password'}
                  >
                    {showPasswords.current ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {touched.current && !passwordValidations.hasCurrent && (
                  <p className="text-[11px] text-rose-600 mt-1">Current password is required.</p>
                )}
              </div>

              {/* Field 2: New Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  New Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.next ? 'text' : 'password'}
                    value={passwordForm.newPassword}
                    onChange={(e) => handlePasswordChange('newPassword', e.target.value)}
                    placeholder="Enter new password (min. 8 characters)"
                    disabled={passwordSubmitting}
                    className="w-full px-3.5 py-2.5 pr-10 text-xs border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords((prev) => ({ ...prev, next: !prev.next }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title={showPasswords.next ? 'Hide password' : 'Show password'}
                  >
                    {showPasswords.next ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Field 3: Confirm New Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Confirm New Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.confirm ? 'text' : 'password'}
                    value={passwordForm.confirmPassword}
                    onChange={(e) => handlePasswordChange('confirmPassword', e.target.value)}
                    placeholder="Confirm new password"
                    disabled={passwordSubmitting}
                    className="w-full px-3.5 py-2.5 pr-10 text-xs border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPasswords((prev) => ({ ...prev, confirm: !prev.confirm }))
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title={showPasswords.confirm ? 'Hide password' : 'Show password'}
                  >
                    {showPasswords.confirm ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Password Requirements Checklist */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1.5 text-[11px]">
                <span className="font-bold text-slate-700 block">Password Requirements:</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-0.5">
                  <div
                    className={`flex items-center gap-1.5 ${
                      passwordValidations.lengthValid ? 'text-emerald-700 font-semibold' : 'text-slate-500'
                    }`}
                  >
                    {passwordValidations.lengthValid ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 ml-1" />
                    )}
                    <span>Min. 8 characters</span>
                  </div>

                  <div
                    className={`flex items-center gap-1.5 ${
                      passwordValidations.differentFromCurrent
                        ? 'text-emerald-700 font-semibold'
                        : 'text-slate-500'
                    }`}
                  >
                    {passwordValidations.differentFromCurrent ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 ml-1" />
                    )}
                    <span>Different from current</span>
                  </div>

                  <div
                    className={`flex items-center gap-1.5 ${
                      passwordValidations.matchesConfirm && passwordForm.confirmPassword
                        ? 'text-emerald-700 font-semibold'
                        : 'text-slate-500'
                    }`}
                  >
                    {passwordValidations.matchesConfirm && passwordForm.confirmPassword ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 ml-1" />
                    )}
                    <span>Passwords match</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCancelPasswordChange}
                  disabled={passwordSubmitting}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordSubmitting || !passwordValidations.isValid}
                  className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 disabled:cursor-not-allowed rounded-xl transition-colors shadow-2xs cursor-pointer"
                >
                  {passwordSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Updating Password...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>Update Password</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* 4. Projects Assigned Section */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-purple-50 text-purple-700 rounded-xl">
                <FolderKanban className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Projects Assigned</h3>
              <span className="px-2 py-0.5 text-xs font-bold bg-purple-100 text-purple-800 rounded-full">
                {projects.length}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Active projects, sprints, and team workspaces you are currently assigned to.
            </p>
          </div>

          {/* Controls: Search and Status Filter */}
          <div className="flex flex-wrap items-center gap-2.5">
            <input
              type="text"
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              placeholder="Search projects..."
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-purple-500 w-40 sm:w-48"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-xl bg-white text-slate-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-purple-500"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="PLANNED">Planned</option>
              <option value="COMPLETED">Completed</option>
            </select>
            <button
              type="button"
              onClick={fetchProjects}
              className="p-2 border border-slate-200 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
              title="Refresh projects"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingProjects ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Projects Listing */}
        {loadingProjects ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
            <span className="text-xs">Loading assigned projects...</span>
          </div>
        ) : projectsError ? (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{projectsError}</span>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="py-10 text-center border-2 border-dashed border-slate-200 rounded-xl p-6">
            <FolderKanban className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-700">No assigned projects found</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {projectSearch || statusFilter !== 'ALL'
                ? 'Try adjusting your search query or filter.'
                : 'Projects assigned to you by your manager will appear here.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProjects.map((p) => {
              const statusBadge = getStatusBadge(p.status);
              return (
                <div
                  key={p.id}
                  className="p-4 rounded-xl border border-slate-200 hover:border-purple-300 bg-white hover:shadow-xs transition-all flex flex-col justify-between space-y-3 group"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-slate-900 group-hover:text-purple-700 transition-colors truncate">
                          {p.name}
                        </h4>
                        <span className="text-[10px] font-mono text-purple-600">
                          {p.code || 'PROJ'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <ProjectMethodologyBadge methodology={p.methodology || 'SCRUM'} />
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${statusBadge.badgeClass}`}
                        >
                          <span className={`w-1 h-1 rounded-full ${statusBadge.dotClass}`} />
                          {statusBadge.label}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {p.description || 'No description provided.'}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        {p.members?.length || 0} members
                      </span>
                      {p.startDate && p.startDate !== 'TBD' && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {p.startDate}
                        </span>
                      )}
                    </div>

                    {onSelectProject && (
                      <button
                        type="button"
                        onClick={() => onSelectProject(p.id)}
                        className="flex items-center gap-1 font-bold text-purple-600 hover:text-purple-800 hover:underline cursor-pointer"
                      >
                        <span>Workspace</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Edit Profile Modal */}
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
                  Assigned Cohort
                </label>
                <input
                  type="text"
                  value={displayBatch}
                  disabled
                  className="w-full px-3 py-2 text-xs border border-slate-200 bg-slate-100 text-slate-500 rounded-lg cursor-not-allowed"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Cohort assignment is managed by program managers.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
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
