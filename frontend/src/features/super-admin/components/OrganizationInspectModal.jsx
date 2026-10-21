import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  Building2, 
  Users, 
  FolderKanban, 
  FileText, 
  UserPlus, 
  UploadCloud, 
  KeyRound, 
  Loader2, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  AlertCircle,
  Copy,
  Check,
  ShieldAlert,
  Search
} from 'lucide-react';
import { organizationService } from '../../../services/organization.service';
import AddManagerModal from './AddManagerModal';
import BulkImportManagersModal from './BulkImportManagersModal';

export default function OrganizationInspectModal({
  isOpen,
  orgId,
  onClose,
  onOrganizationUpdated,
}) {
  const [activeTab, setActiveTab] = useState('managers'); // 'managers' | 'members'
  const [orgDetails, setOrgDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [detailsError, setDetailsError] = useState('');

  // Members state
  const [members, setMembers] = useState([]);
  const [memberPage, setMemberPage] = useState(1);
  const [totalMemberPages, setTotalMemberPages] = useState(1);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberRoleFilter, setMemberRoleFilter] = useState('ALL');

  // Sub-modals
  const [isAddManagerOpen, setIsAddManagerOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);

  // Temporary password modal for reset
  const [tempCredentials, setTempCredentials] = useState(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  const fetchOrganizationDetails = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoadingDetails(true);
      setDetailsError('');
      const data = await organizationService.getOrganizationById(orgId);
      setOrgDetails(data);
    } catch (err) {
      setDetailsError(err.message || 'Failed to load organization details');
    } finally {
      setLoadingDetails(false);
    }
  }, [orgId]);

  const fetchMembers = useCallback(async (page = 1, search = memberSearch, role = memberRoleFilter) => {
    if (!orgId) return;
    try {
      setLoadingMembers(true);
      const res = await organizationService.getOrganizationMembers(orgId, {
        page,
        limit: 10,
        search: search.trim() || undefined,
        role: role !== 'ALL' ? role : undefined,
      });
      setMembers(res.members || []);
      setMemberPage(res.pagination?.page || 1);
      setTotalMemberPages(res.pagination?.totalPages || 1);
    } catch (err) {
      console.error('Failed to load organization members:', err);
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, [orgId, memberSearch, memberRoleFilter]);

  useEffect(() => {
    if (isOpen && orgId) {
      void fetchOrganizationDetails();
      void fetchMembers(1, '', 'ALL');
    } else {
      setOrgDetails(null);
      setMembers([]);
      setMemberSearch('');
      setMemberRoleFilter('ALL');
    }
  }, [isOpen, orgId, fetchOrganizationDetails]);

  // Debounced search for members
  useEffect(() => {
    if (!isOpen || !orgId) return;
    const timer = setTimeout(() => {
      void fetchMembers(1, memberSearch, memberRoleFilter);
    }, 300);
    return () => clearTimeout(timer);
  }, [memberSearch, memberRoleFilter, isOpen, orgId, fetchMembers]);

  const handleResetPassword = async (managerId, managerName) => {
    if (!window.confirm(`Reset password for manager "${managerName}"? All existing sessions will be invalidated immediately.`)) {
      return;
    }

    try {
      const res = await organizationService.resetManagerPassword(orgId, managerId);
      setTempCredentials({
        name: managerName,
        temporary_password: res.temporary_password,
      });
    } catch (err) {
      alert(err.message || 'Failed to reset manager password');
    }
  };

  const handleCopyTempPassword = async () => {
    if (!tempCredentials) return;
    try {
      await navigator.clipboard.writeText(
      `Manager: ${tempCredentials.name}\nTemporary Password: ${tempCredentials.temporary_password}`
    );
      setCopiedCreds(true);
      setTimeout(() => setCopiedCreds(false), 2000);
    } catch (err) {
      console.error('Failed to copy temporary password:', err);
    }
  };

  const handleManagerOperationSuccess = () => {
    void fetchOrganizationDetails();
    void fetchMembers(1);
    onOrganizationUpdated?.();
  };

  if (!isOpen) return null;

  // Filter managers from orgDetails
  const managers = orgDetails?.users?.filter((u) => u.role === 'MANAGER' || u.role === 'ADMIN') || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-base">
                  {orgDetails?.name || 'Loading organization...'}
                </h3>
                {orgDetails && (
                  orgDetails.is_active ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Active
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                      Suspended
                    </span>
                  )
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono">Org ID: {orgId}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Loading / Error / Body */}
        {loadingDetails && !orgDetails ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
            <span className="text-xs font-medium">Loading organization profile...</span>
          </div>
        ) : detailsError ? (
          <div className="p-8 text-center space-y-3">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 inline-block">
              {detailsError}
            </div>
            <div>
              <button
                onClick={() => { void fetchOrganizationDetails(); }}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Stats Overview */}
            <div className="grid grid-cols-4 gap-3 px-6 py-3 border-b border-slate-100 bg-white shrink-0">
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Users</p>
                <p className="text-base font-black text-slate-800 mt-0.5">{orgDetails?.stats?.user_count || 0}</p>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Managers</p>
                <p className="text-base font-black text-purple-700 mt-0.5">{managers.length}</p>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Projects</p>
                <p className="text-base font-black text-slate-800 mt-0.5">{orgDetails?.stats?.project_count || 0}</p>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Work Items</p>
                <p className="text-base font-black text-slate-800 mt-0.5">{orgDetails?.stats?.work_item_count || 0}</p>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center justify-between px-6 pt-3 border-b border-slate-200 bg-slate-50/50 shrink-0">
              <div className="flex gap-4">
                <button
                  onClick={() => setActiveTab('managers')}
                  className={`pb-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                    activeTab === 'managers'
                      ? 'border-purple-600 text-purple-700'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Managers ({managers.length})
                </button>
                <button
                  onClick={() => setActiveTab('members')}
                  className={`pb-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                    activeTab === 'members'
                      ? 'border-purple-600 text-purple-700'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  All Members ({orgDetails?.stats?.user_count || 0})
                </button>
              </div>

              {/* Action Buttons for Managers */}
              <div className="flex items-center gap-2 pb-2">
                <button
                  onClick={() => setIsAddManagerOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Add Manager</span>
                </button>
                <button
                  onClick={() => setIsBulkImportOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Bulk Import</span>
                </button>
              </div>
            </div>

            {/* Tab 1: Managers Section */}
            {activeTab === 'managers' && (
              <div className="flex-1 p-6 overflow-y-auto space-y-3">
                {managers.length === 0 ? (
                  <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-2xl space-y-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">No managers assigned yet</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        This organization currently has no manager accounts to oversee members and projects.
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-2 pt-2">
                      <button
                        onClick={() => setIsAddManagerOpen(true)}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors"
                      >
                        Add First Manager
                      </button>
                      <button
                        onClick={() => setIsBulkImportOpen(true)}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                      >
                        Bulk Import Managers
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {managers.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between p-3.5 bg-white hover:bg-slate-50/80 rounded-xl border border-slate-200/80 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 font-bold text-xs flex items-center justify-center border border-purple-100">
                            {m.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-xs">{m.name}</span>
                              {m.user_code && (
                                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-mono">
                                  {m.user_code}
                                </span>
                              )}
                              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-bold">
                                {m.role}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-500 font-mono">{m.email}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { void handleResetPassword(m.id, m.name); }}
                            title="Reset manager password and revoke active sessions"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-amber-50 text-amber-700 border border-slate-200 hover:border-amber-300 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>Reset Password</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: All Members Section */}
            {activeTab === 'members' && (
              <div className="flex-1 p-6 flex flex-col min-h-0 space-y-3">
                {/* Search & Filter Bar */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Search members by name, email, or user code..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-purple-600 focus:outline-none"
                    />
                  </div>
                  <select
                    value={memberRoleFilter}
                    onChange={(e) => setMemberRoleFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-700 focus:outline-none"
                  >
                    <option value="ALL">All Roles</option>
                    <option value="MANAGER">MANAGER</option>
                    <option value="TECH_LEAD">TECH_LEAD</option>
                    <option value="EMPLOYEE">EMPLOYEE</option>
                    <option value="INTERN">INTERN</option>
                  </select>
                </div>

                {/* Members list */}
                {loadingMembers ? (
                  <div className="flex-1 flex items-center justify-center text-slate-400 gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                    <span className="text-xs">Loading members...</span>
                  </div>
                ) : members.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">
                    No organization members found.
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                    {members.map((u) => {
                      const isManager = u.role === 'MANAGER' || u.role === 'ADMIN';
                      return (
                        <div
                          key={u.id}
                          className="flex items-center justify-between p-2.5 bg-slate-50/60 hover:bg-slate-50 rounded-xl border border-slate-100 text-xs transition-colors"
                        >
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-800">{u.name}</span>
                              {u.user_code && (
                                <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded text-[10px] font-mono">
                                  {u.user_code}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400">{u.email}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-bold">
                              {u.role}
                            </span>
                            {isManager && (
                              <button
                                onClick={() => { void handleResetPassword(u.id, u.name); }}
                                title="Reset Manager Password"
                                className="flex items-center gap-1 px-2 py-1 bg-white hover:bg-amber-50 border border-slate-200 hover:border-amber-300 text-amber-700 rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                              >
                                <KeyRound className="w-3 h-3" />
                                <span>Reset Password</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pagination */}
                {totalMemberPages > 1 && (
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500 shrink-0">
                    <span>Page {memberPage} of {totalMemberPages}</span>
                    <div className="flex items-center gap-1">
                      <button
                        disabled={memberPage <= 1}
                        onClick={() => { void fetchMembers(memberPage - 1); }}
                        className="p-1 rounded border border-slate-200 disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        disabled={memberPage >= totalMemberPages}
                        onClick={() => { void fetchMembers(memberPage + 1); }}
                        className="p-1 rounded border border-slate-200 disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end px-6 py-3 border-t border-slate-100 bg-slate-50/50 shrink-0">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sub-modals */}
      <AddManagerModal
        isOpen={isAddManagerOpen}
        organization={orgDetails}
        onClose={() => setIsAddManagerOpen(false)}
        onSuccess={handleManagerOperationSuccess}
      />

      <BulkImportManagersModal
        isOpen={isBulkImportOpen}
        organization={orgDetails}
        onClose={() => setIsBulkImportOpen(false)}
        onSuccess={handleManagerOperationSuccess}
      />

      {/* Temporary Password Credential Modal */}
      {tempCredentials && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-900">Password Reset Complete</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  All active sessions have been invalidated. Provide this temporary password to the manager. It will not be shown again.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 font-mono text-xs space-y-2">
              <div>
                <span className="text-slate-400">Manager: </span>
                <span className="font-bold text-slate-800">{tempCredentials.name}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <div>
                  <span className="text-slate-400">New Temp Password: </span>
                  <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    {tempCredentials.temporary_password}
                  </span>
                </div>
                <button
                  onClick={handleCopyTempPassword}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-sans font-semibold cursor-pointer"
                >
                  {copiedCreds ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setTempCredentials(null)}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
