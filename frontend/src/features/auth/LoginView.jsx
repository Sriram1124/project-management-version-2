import React, { useState, useEffect } from 'react';
import { 
  Loader2, 
  ShieldCheck, 
  Building2, 
  ArrowRight, 
  ArrowLeft, 
  Search, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  Sparkles,
  AlertCircle,
  KeyRound,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { authService } from '../../services/auth.service';
import dailoqaLogo from '../../../dailoqa-logo.jpg';

export default function LoginView() {
  // Step state: 'PORTAL_SELECT' | 'ROOT_LOGIN' | 'ORG_SELECT' | 'ORG_LOGIN' | 'FORCE_CHANGE_PASSWORD'
  const [step, setStep] = useState('PORTAL_SELECT');
  
  // Credentials
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Forced Password Change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Organizations
  const [organizations, setOrganizations] = useState([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [orgLoadFailed, setOrgLoadFailed] = useState(false);
  const [orgSearch, setOrgSearch] = useState('');
  const [selectedOrg, setSelectedOrg] = useState(null);

  // Status
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  // Load organizations on demand
  const fetchOrganizations = async () => {
    try {
      setLoadingOrgs(true);
      setError('');
      setOrgLoadFailed(false);
      const data = await authService.getOrganizations();
      setOrganizations(Array.isArray(data) ? data : []);
    } catch (err) {
      setOrgLoadFailed(true);
      setError(err.message || 'Unable to load organizations. Please check your connection.');
    } finally {
      setLoadingOrgs(false);
    }
  };

  const routeUserByRole = (role) => {
    if (role === 'SUPER_ADMIN') {
      navigate('/super-admin/dashboard');
    } else if (role === 'MANAGER') {
      navigate('/manager/dashboard');
    } else if (role === 'INTERN' || role === 'EMPLOYEE' || role === 'TECH_LEAD') {
      navigate('/intern/dashboard');
    } else {
      navigate('/unauthorized');
    }
  };

  const handleSelectPortalMode = (mode) => {
    setError('');
    setIdentifier('');
    setPassword('');
    if (mode === 'ROOT') {
      setStep('ROOT_LOGIN');
    } else {
      setStep('ORG_SELECT');
      if (organizations.length === 0 || orgLoadFailed) {
        fetchOrganizations();
      }
    }
  };

  const handleSelectOrg = (org) => {
    setSelectedOrg(org);
    setError('');
    setIdentifier('');
    setPassword('');
    setStep('ORG_LOGIN');
  };

  const handleBack = () => {
    setError('');
    if (step === 'ROOT_LOGIN') {
      setStep('PORTAL_SELECT');
    } else if (step === 'ORG_SELECT') {
      setStep('PORTAL_SELECT');
    } else if (step === 'ORG_LOGIN') {
      setStep('ORG_SELECT');
    } else if (step === 'FORCE_CHANGE_PASSWORD') {
      setStep(selectedOrg ? 'ORG_LOGIN' : 'PORTAL_SELECT');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const orgId = step === 'ORG_LOGIN' ? selectedOrg?.id : null;

    try {
      const data = await login(identifier, password, orgId);
      const user = data?.user;

      // Check if newly provisioned user is required to set a permanent password
      if (user?.must_change_password) {
        setPendingUser(user);
        setCurrentPassword(password);
        setStep('FORCE_CHANGE_PASSWORD');
        return;
      }

      // Authoritative backend-determined role routing - NO role selection screen
      routeUserByRole(user?.role);
    } catch (err) {
      if (err.message?.toLowerCase().includes('failed to fetch') || err.message?.toLowerCase().includes('network error')) {
        setError('Cannot connect to server. Please ensure the backend is running.');
      } else {
        setError(err.message || 'Invalid credentials');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChangeSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }

    if (newPassword === currentPassword) {
      setError('New password must be different from your temporary password.');
      return;
    }

    setIsChangingPassword(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      // Auto redirect according to role
      routeUserByRole(pendingUser?.role);
    } catch (err) {
      setError(err.message || 'Failed to update password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const filteredOrgs = organizations.filter((org) =>
    org.name.toLowerCase().includes(orgSearch.trim().toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#f5f3ff] text-slate-900 relative overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(167,139,250,0.32),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(196,181,253,0.34),_transparent_24%)]" />
      <div className="absolute left-[-8rem] top-[-6rem] h-72 w-72 rounded-full bg-violet-200/70 blur-3xl" />
      <div className="absolute right-[-7rem] bottom-[-7rem] h-96 w-96 rounded-full bg-purple-200/80 blur-3xl" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4 py-10 sm:px-6 lg:px-12">
        <div className="grid w-full max-w-6xl overflow-hidden rounded-[32px] border border-violet-200 bg-white/80 shadow-[0_30px_80px_rgba(76,29,149,0.09)] backdrop-blur-xl lg:grid-cols-[1.05fr_0.95fr]">
          <div className="p-6 sm:p-8 lg:p-12">
            <div className="mb-8">
              <div className="text-xl font-bold tracking-tight text-slate-900">Project Management</div>
            </div>

            {error && (
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <span>{error}</span>
              </div>
            )}

            {step === 'PORTAL_SELECT' && (
              <div className="space-y-6">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">Sign in</p>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Welcome to Dailoqa</h1>
                  <p className="mt-2 text-sm text-slate-600">Choose your access path to continue.</p>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => handleSelectPortalMode('ROOT')}
                    className="w-full rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-white p-4 text-left shadow-sm transition hover:border-violet-300 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600 text-violet-50 shadow-md shadow-violet-200">
                          <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-900">Super Admin</h3>
                            <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-600">Global</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">Platform administration and organization management</p>
                        </div>
                      </div>
                      <ArrowRight className="h-5 w-5 text-violet-500" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPortalMode('ORG')}
                    className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-violet-200 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                          <Building2 className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">Organization Sign In</h3>
                          <p className="mt-1 text-xs text-slate-500">Managers, interns, and team members</p>
                        </div>
                      </div>
                      <ArrowRight className="h-5 w-5 text-violet-500" />
                    </div>
                  </button>
                </div>
              </div>
            )}

            {step === 'ROOT_LOGIN' && (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <button type="button" onClick={handleBack} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 transition hover:text-violet-700">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                  </button>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-900">Super Admin Sign In</h1>
                  <p className="mt-1 text-sm text-slate-500">Use your global Dailoqa administrator account.</p>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Email / User ID</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="superadmin@dailoqa.com"
                      autoFocus
                      className="w-full rounded-2xl border border-violet-200 bg-violet-50/40 py-3 pl-11 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full rounded-2xl border border-violet-200 bg-violet-50/40 py-3 pl-11 pr-12 text-sm text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={isLoading} className="w-full rounded-2xl bg-violet-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60">
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Authenticating...
                    </span>
                  ) : (
                    'Sign In to Dailoqa'
                  )}
                </button>
              </form>
            )}

            {step === 'ORG_SELECT' && (
              <div className="space-y-5">
                <div>
                  <button type="button" onClick={handleBack} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 transition hover:text-violet-700">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                  </button>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-900">Select Organization</h1>
                  <p className="mt-1 text-sm text-slate-500">Choose the workspace you want to access.</p>
                </div>

                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={orgSearch}
                    onChange={(e) => setOrgSearch(e.target.value)}
                    placeholder="Search organizations"
                    className="w-full rounded-2xl border border-violet-200 bg-violet-50/40 py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  />
                </div>

                <div className="space-y-2">
                  {loadingOrgs ? (
                    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-violet-100 bg-violet-50/40 py-8 text-sm text-slate-500">
                      <Loader2 className="h-5 w-5 animate-spin text-violet-500" /> Loading organizations...
                    </div>
                  ) : orgLoadFailed ? (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-red-100 bg-red-50/40 p-6 text-center text-sm text-red-600">
                      <AlertCircle className="h-5 w-5 text-red-500" />
                      <span>Failed to load organizations.</span>
                      <button
                        type="button"
                        onClick={fetchOrganizations}
                        className="rounded-xl bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-700"
                      >
                        Retry
                      </button>
                    </div>
                  ) : filteredOrgs.length === 0 ? (
                    <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-6 text-center text-sm text-slate-500">
                      No active organizations found.
                    </div>
                  ) : (
                    filteredOrgs.map((org) => (
                      <button
                        key={org.id}
                        type="button"
                        onClick={() => handleSelectOrg(org)}
                        className="flex w-full items-center justify-between rounded-2xl border border-violet-100 bg-violet-50/30 p-4 text-left shadow-sm transition hover:border-violet-200 hover:bg-violet-50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                            <Building2 className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{org.name}</div>
                            <div className="text-[11px] text-slate-500">Workspace tenant</div>
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-violet-500" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {step === 'ORG_LOGIN' && (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <button type="button" onClick={handleBack} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 transition hover:text-violet-700">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                  </button>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-900">{selectedOrg?.name || 'Organization'}</h1>
                  <p className="mt-1 text-sm text-slate-500">Sign in with your organization credentials.</p>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Email / User ID</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="manager@dailoqa.com or INT-1234"
                      className="w-full rounded-2xl border border-violet-200 bg-violet-50/40 py-3 pl-11 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full rounded-2xl border border-violet-200 bg-violet-50/40 py-3 pl-11 pr-12 text-sm text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={isLoading} className="w-full rounded-2xl bg-violet-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60">
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Authenticating...
                    </span>
                  ) : (
                    `Sign In to ${selectedOrg?.name || 'Dailoqa'}`
                  )}
                </button>
              </form>
            )}

            {step === 'FORCE_CHANGE_PASSWORD' && (
              <form onSubmit={handlePasswordChangeSubmit} className="space-y-4">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-900">Update your password</h1>
                  <p className="mt-2 text-sm text-slate-500">Welcome back, {pendingUser?.name}. Set a new password to continue.</p>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Temporary Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full rounded-2xl border border-violet-200 bg-violet-50/40 py-3 pl-11 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="w-full rounded-2xl border border-violet-200 bg-violet-50/40 py-3 pl-11 pr-12 text-sm text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    />
                    <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700">
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Confirm New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full rounded-2xl border border-violet-200 bg-violet-50/40 py-3 pl-11 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    />
                  </div>
                </div>

                <button type="submit" disabled={isChangingPassword} className="w-full rounded-2xl bg-violet-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60">
                  {isChangingPassword ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Updating password...
                    </span>
                  ) : (
                    'Change Password & Continue'
                  )}
                </button>
              </form>
            )}
          </div>

          <div className="relative hidden overflow-hidden bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-12 lg:flex lg:items-center lg:justify-center">
            <div className="absolute left-[-5rem] top-[-5rem] h-56 w-56 rounded-full bg-violet-200/80 blur-3xl" />
            <div className="absolute bottom-[-4rem] right-[-4rem] h-60 w-60 rounded-full bg-purple-200/80 blur-3xl" />
            <div className="absolute inset-8 rounded-[28px] border border-violet-100 bg-white/60" />
            <div className="relative z-10 flex flex-col items-center text-center">
              <img
                src={dailoqaLogo}
                alt="Dailoqa"
                className="w-72 max-w-full object-contain"
              />
              <p className="mt-7 max-w-xs text-sm font-medium leading-6 text-slate-600">Performance, projects, and operational clarity in one secure workspace.</p>
              <div className="mt-8 flex items-center gap-4 opacity-80">
                <div className="h-px w-16 bg-violet-300" />
                <div className="h-2.5 w-2.5 rounded-full bg-violet-500 shadow-[0_0_16px_rgba(124,58,237,0.8)]" />
                <div className="h-px w-16 bg-violet-300" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
