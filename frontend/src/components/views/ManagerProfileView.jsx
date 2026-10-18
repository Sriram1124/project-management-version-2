import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  User,
  Mail,
  Building2,
  Shield,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  FolderKanban,
  Users,
  Calendar,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Loader2,
  Hash,
  Sparkles,
  ExternalLink,
  ShieldAlert,
  X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/auth.service';
import { projectsService } from '../../services/projects.service';
import ProjectMethodologyBadge from './projects/ProjectMethodologyBadge';

export default function ManagerProfileView({ onSelectProject, onToast }) {
  const { user: authUser } = useAuth();

  // Fresh user profile fetched directly from /api/auth/me
  const [profile, setProfile] = useState(authUser || null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState(null);

  // Projects managed state (fetched via /api/projects?my=true)
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectsError, setProjectsError] = useState(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Change Password state
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
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [touched, setTouched] = useState({
    current: false,
    next: false,
    confirm: false,
  });

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

  // Fetch / refresh user profile from /api/auth/me
  const fetchProfile = useCallback(async () => {
    try {
      setLoadingProfile(true);
      setProfileError(null);
      const data = await authService.getCurrentUser();
      const userObj = data?.user || data;
      if (userObj) {
        setProfile(userObj);
      }
    } catch (err) {
      console.error('Failed to load manager profile:', err);
      setProfileError(err.message || 'Unable to load profile data.');
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  // Fetch projects managed by this manager
  const fetchManagedProjects = useCallback(async () => {
    try {
      setLoadingProjects(true);
      setProjectsError(null);
      const list = await projectsService.getProjects({ my: true });
      setProjects(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Failed to load managed projects:', err);
      setProjectsError(err.message || 'Unable to load managed projects.');
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
    fetchManagedProjects();
  }, [fetchProfile, fetchManagedProjects]);

  // Authorization check: only authenticated MANAGER role
  const isManager = (profile?.role || authUser?.role) === 'MANAGER';

  // Computed display values
  const displayName = profile?.name || authUser?.name || 'Manager';
  const displayEmail = profile?.email || authUser?.email || '';
  const displayRole = profile?.role || authUser?.role || 'MANAGER';
  const orgName =
    profile?.organization_name ||
    profile?.organization?.name ||
    authUser?.organization_name ||
    authUser?.organization?.name ||
    'InternHub Enterprise';
  const userCode = profile?.user_code || authUser?.user_code || null;
  const createdAtFormatted = useMemo(() => {
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

  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    displayName
  )}&background=7C3AED&color=fff&size=128&bold=true`;

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
          label: status || 'Unknown',
          badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
          dotClass: 'bg-slate-400',
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

  // Project counts
  const totalProjects = projects.length;
  const activeProjectsCount = useMemo(
    () => projects.filter((p) => p.status === 'ACTIVE').length,
    [projects]
  );

  // Password validations
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

      // Reset form and close expanded section
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setTouched({ current: false, next: false, confirm: false });
      setPasswordError(null);
      setIsChangingPassword(false);
    } catch (err) {
      console.error('Password change failed:', err);
      const errMsg =
        err?.response?.data?.error ||
        err?.message ||
        'Failed to change password. Please verify your current password.';
      setPasswordError(errMsg);
    } finally {
      setPasswordSubmitting(false);
    }
  };

  if (!isManager) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-white rounded-xl border border-rose-200 text-center shadow-xs">
        <div className="w-12 h-12 mx-auto rounded-full bg-rose-50 flex items-center justify-center text-rose-600 mb-4">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">Access Restricted</h2>
        <p className="text-sm text-slate-600 mb-6">
          The Manager Profile view is only available to users with the Manager role viewing their own account.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Top Banner / Profile Header Card */}
      <div className="bg-white rounded-xl border border-purple-100 shadow-2xs overflow-hidden">
        {/* Decorative Top Accent Banner */}
        <div className="h-20 bg-linear-to-r from-purple-700 via-purple-600 to-indigo-600 relative">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
        </div>

        {/* Profile Info Bar */}
        <div className="px-6 pb-6 pt-0 relative flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          {/* Avatar and Primary Details */}
          <div className="flex items-end gap-4 -mt-10">
            <div className="relative">
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-20 h-20 rounded-xl object-cover border-4 border-white shadow-md bg-purple-700 shrink-0"
              />
              <span
                className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white"
                title="Account Active"
              />
            </div>

            <div className="space-y-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 leading-tight">{displayName}</h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                  <Shield className="w-3 h-3 text-purple-600" />
                  {displayRole}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{displayEmail}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-purple-500" />
                  <span className="font-medium text-slate-700">{orgName}</span>
                </span>
                {userCode && (
                  <span className="flex items-center gap-1.5 font-mono text-slate-600">
                    <Hash className="w-3.5 h-3.5 text-slate-400" />
                    <span>{userCode}</span>
                  </span>
                )}
                {createdAtFormatted && (
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Joined {createdAtFormatted}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Change Password Action */}
          <div className="flex items-center gap-2 pt-2 md:pt-0">
            <button
              type="button"
              onClick={() => {
                setIsChangingPassword(true);
                setPasswordError(null);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-purple-700 hover:bg-purple-800 rounded-lg shadow-xs transition-colors cursor-pointer"
              title="Change Account Password"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Change Password</span>
            </button>
          </div>
        </div>

        {/* Quick KPI Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-slate-100 bg-slate-50/50">
          <div className="p-4 border-r border-slate-100">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
              Role
            </div>
            <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <User className="w-4 h-4 text-purple-600" />
              <span>Program Manager</span>
            </div>
          </div>

          <div className="p-4 border-r border-slate-100">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
              Organization
            </div>
            <div className="text-sm font-bold text-slate-800 truncate" title={orgName}>
              {orgName}
            </div>
          </div>

          <div className="p-4 border-r border-slate-100">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
              Projects Managed
            </div>
            <div className="text-sm font-bold text-purple-700 flex items-center gap-1.5">
              <FolderKanban className="w-4 h-4" />
              <span>{totalProjects}</span>
              <span className="text-xs font-normal text-slate-500">
                ({activeProjectsCount} active)
              </span>
            </div>
          </div>

          <div className="p-4">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
              Account Status
            </div>
            <div className="text-sm font-bold text-emerald-700 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Verified & Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* Feedback Banner for Password Success */}
      {passwordSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3 text-xs text-emerald-800 shadow-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <span className="font-bold text-emerald-900">Success: </span>
              <span>{passwordSuccess}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPasswordSuccess(null)}
            className="p-1 rounded text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Projects Managed (Full Width) */}
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            {/* Header & Controls */}
            <div className="p-4 sm:p-5 border-b border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
                    <FolderKanban className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Projects Managed</h2>
                    <p className="text-xs text-slate-500">
                      Projects you own or participate in as a team lead/manager
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                    {filteredProjects.length} of {totalProjects}
                  </span>
                </div>
              </div>

              {/* Search and Status Filters */}
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    placeholder="Search managed projects..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all text-slate-800"
                  />
                  <FolderKanban className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>

                <div className="flex items-center gap-1 shrink-0 overflow-x-auto pb-0.5">
                  {['ALL', 'ACTIVE', 'PLANNED', 'COMPLETED'].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                        statusFilter === st
                          ? 'bg-purple-900 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {st === 'ALL' ? 'All' : st.charAt(0) + st.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Projects List / Empty States */}
            <div className="divide-y divide-slate-100">
              {loadingProjects ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                  <span className="text-xs">Loading managed projects...</span>
                </div>
              ) : projectsError ? (
                <div className="p-6 text-center space-y-2">
                  <AlertCircle className="w-6 h-6 text-rose-500 mx-auto" />
                  <p className="text-xs text-rose-600 font-medium">{projectsError}</p>
                  <button
                    type="button"
                    onClick={fetchManagedProjects}
                    className="text-xs text-purple-700 underline font-medium"
                  >
                    Try again
                  </button>
                </div>
              ) : projects.length === 0 ? (
                <div className="py-12 px-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-purple-50 border border-purple-100 text-purple-500 mx-auto flex items-center justify-center">
                    <FolderKanban className="w-6 h-6 opacity-80" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-800">No Projects Assigned</h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      You are not currently assigned as an owner or team member of any projects.
                      Projects will appear here once created or assigned to you.
                    </p>
                  </div>
                </div>
              ) : filteredProjects.length === 0 ? (
                <div className="py-10 px-6 text-center text-slate-400 space-y-2">
                  <p className="text-xs">No projects match your filter criteria.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setProjectSearch('');
                      setStatusFilter('ALL');
                    }}
                    className="text-xs text-purple-700 underline font-medium"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                filteredProjects.map((proj) => {
                  const statusInfo = getStatusBadge(proj.status);
                  const memberCount =
                    proj._count?.members ??
                    (Array.isArray(proj.members) ? proj.members.length : 0);

                  return (
                    <div
                      key={proj.id}
                      onClick={() => onSelectProject?.(proj.id, proj.name)}
                      className="p-4 hover:bg-purple-50/40 transition-colors cursor-pointer group flex items-center justify-between gap-4"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectProject?.(proj.id, proj.name);
                        }
                      }}
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-slate-800 group-hover:text-purple-700 transition-colors truncate">
                            {proj.name}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${statusInfo.badgeClass}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotClass}`} />
                            {statusInfo.label}
                          </span>
                          <ProjectMethodologyBadge methodology={proj.methodology} size="sm" />
                        </div>

                        {proj.description && (
                          <p className="text-xs text-slate-500 line-clamp-1">{proj.description}</p>
                        )}

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 pt-0.5">
                          <span className="flex items-center gap-1 text-slate-600 font-medium">
                            <Users className="w-3 h-3 text-purple-500" />
                            <span>
                              {memberCount} {memberCount === 1 ? 'member' : 'members'}
                            </span>
                          </span>

                          {proj.start_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              <span>
                                {new Date(proj.start_date).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                                {proj.end_date &&
                                  ` – ${new Date(proj.end_date).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                  })}`}
                              </span>
                            </span>
                          )}

                          {proj.owner?.name && (
                            <span className="text-slate-400">
                              Lead: <span className="text-slate-600">{proj.owner.name}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-semibold text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          Open Workspace
                          <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Account Security Info Card */}
          <div className="bg-purple-50/60 rounded-xl border border-purple-100 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-purple-900">
              <Shield className="w-4 h-4 text-purple-600" />
              <span>InternHub Security Policy</span>
            </div>
            <p className="text-[11px] text-purple-800/80 leading-relaxed">
              Passwords are cryptographically hashed using Argon2id. Once changed, your current active
              session is refreshed automatically.
            </p>
          </div>
        </div>

        {/* Change Password Modal */}
        {isChangingPassword && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
            <div 
              className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-150"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-change-password-title"
            >
              {/* Modal Header */}
              <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-3 bg-purple-50/40">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 id="modal-change-password-title" className="text-sm font-bold text-slate-900">Change Password</h2>
                    <p className="text-xs text-slate-500">Update your account login credentials</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCancelPasswordChange}
                  disabled={passwordSubmitting}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Form Body */}
              <form onSubmit={handlePasswordSubmit} className="p-5 space-y-4">
                {/* Feedback Banners */}
                {passwordError && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2 text-xs text-rose-800 animate-in fade-in duration-150">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="font-medium">{passwordError}</div>
                  </div>
                )}

                {/* 1. Current Password Field */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Current Password <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPasswords.current ? 'text' : 'password'}
                      value={passwordForm.currentPassword}
                      onChange={(e) => handlePasswordChange('currentPassword', e.target.value)}
                      placeholder="Enter current password"
                      className="w-full pl-8 pr-9 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all text-slate-900"
                      autoComplete="current-password"
                      disabled={passwordSubmitting}
                    />
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <button
                      type="button"
                      onClick={() =>
                        setShowPasswords((prev) => ({ ...prev, current: !prev.current }))
                      }
                      className="p-1 text-slate-400 hover:text-slate-600 absolute right-2 top-1.5 rounded transition-colors cursor-pointer"
                      title={showPasswords.current ? 'Hide password' : 'Show password'}
                    >
                      {showPasswords.current ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  {touched.current && !passwordValidations.hasCurrent && (
                    <p className="text-[11px] text-rose-600 flex items-center gap-1 mt-0.5">
                      <AlertCircle className="w-3 h-3" />
                      Current password is required.
                    </p>
                  )}
                </div>

                {/* 2. New Password Field */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    New Password <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPasswords.next ? 'text' : 'password'}
                      value={passwordForm.newPassword}
                      onChange={(e) => handlePasswordChange('newPassword', e.target.value)}
                      placeholder="Minimum 8 characters"
                      className="w-full pl-8 pr-9 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all text-slate-900"
                      autoComplete="new-password"
                      disabled={passwordSubmitting}
                    />
                    <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <button
                      type="button"
                      onClick={() => setShowPasswords((prev) => ({ ...prev, next: !prev.next }))}
                      className="p-1 text-slate-400 hover:text-slate-600 absolute right-2 top-1.5 rounded transition-colors cursor-pointer"
                      title={showPasswords.next ? 'Hide password' : 'Show password'}
                    >
                      {showPasswords.next ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* 3. Confirm New Password Field */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Confirm New Password <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPasswords.confirm ? 'text' : 'password'}
                      value={passwordForm.confirmPassword}
                      onChange={(e) => handlePasswordChange('confirmPassword', e.target.value)}
                      placeholder="Re-enter new password"
                      className="w-full pl-8 pr-9 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all text-slate-900"
                      autoComplete="new-password"
                      disabled={passwordSubmitting}
                    />
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <button
                      type="button"
                      onClick={() =>
                        setShowPasswords((prev) => ({ ...prev, confirm: !prev.confirm }))
                      }
                      className="p-1 text-slate-400 hover:text-slate-600 absolute right-2 top-1.5 rounded transition-colors cursor-pointer"
                      title={showPasswords.confirm ? 'Hide password' : 'Show password'}
                    >
                      {showPasswords.confirm ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Real-time Checklist */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 space-y-1.5 text-[11px]">
                  <div className="font-semibold text-slate-700 mb-1">Password Requirements:</div>
                  <div
                    className={`flex items-center gap-1.5 ${
                      passwordForm.newPassword.length >= 8
                        ? 'text-emerald-700 font-medium'
                        : 'text-slate-500'
                    }`}
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] ${
                        passwordForm.newPassword.length >= 8
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-200 text-slate-400'
                      }`}
                    >
                      ✓
                    </span>
                    <span>At least 8 characters long</span>
                  </div>

                  <div
                    className={`flex items-center gap-1.5 ${
                      passwordForm.newPassword && passwordValidations.differentFromCurrent
                        ? 'text-emerald-700 font-medium'
                        : passwordForm.newPassword && !passwordValidations.differentFromCurrent
                        ? 'text-rose-600 font-medium'
                        : 'text-slate-500'
                    }`}
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] ${
                        passwordForm.newPassword && passwordValidations.differentFromCurrent
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-200 text-slate-400'
                      }`}
                    >
                      ✓
                    </span>
                    <span>Must be different from current password</span>
                  </div>

                  <div
                    className={`flex items-center gap-1.5 ${
                      passwordForm.confirmPassword && passwordValidations.matchesConfirm
                        ? 'text-emerald-700 font-medium'
                        : passwordForm.confirmPassword && !passwordValidations.matchesConfirm
                        ? 'text-rose-600 font-medium'
                        : 'text-slate-500'
                    }`}
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] ${
                        passwordForm.confirmPassword && passwordValidations.matchesConfirm
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-200 text-slate-400'
                      }`}
                    >
                      ✓
                    </span>
                    <span>New password and confirmation must match</span>
                  </div>
                </div>

                {/* Action Buttons: Update Password & Cancel */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={passwordSubmitting || !passwordValidations.isValid}
                    className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-semibold text-xs shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
                  <button
                    type="button"
                    disabled={passwordSubmitting}
                    onClick={handleCancelPasswordChange}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
    </div>
  );
}

