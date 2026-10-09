import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Filter,
  Users, 
  Loader2, 
  UserPlus, 
  Upload, 
  KeyRound,
  UserX,
  Eye,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { usersService } from '../../services/users.service';
import AddMemberModal from '../modals/AddMemberModal';
import CredentialModal from '../modals/CredentialModal';
import BulkImportModal from '../modals/BulkImportModal';
import UserDetailModal from '../modals/UserDetailModal';
import ResetPasswordModal from '../modals/ResetPasswordModal';
import DeactivateUserModal from '../modals/DeactivateUserModal';

const BATCH_GROUPS = [
  { batch: 'Batch A', subbatches: ['A1', 'A2'] },
  { batch: 'Batch B', subbatches: ['B1', 'B2'] },
  { batch: 'Batch C', subbatches: ['C1', 'C2'] },
  { batch: 'Batch D', subbatches: ['D1', 'D2'] },
];

const ALL_SUBBATCHES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'];

export default function InternsView() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'INACTIVE' | 'INTERN'

  // Subbatch filter state
  const [selectedSubbatches, setSelectedSubbatches] = useState(new Set());
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef(null);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [credentialModalData, setCredentialModalData] = useState(null);

  // User management modals
  const [selectedUserForDetail, setSelectedUserForDetail] = useState(null);
  const [selectedUserForReset, setSelectedUserForReset] = useState(null);
  const [selectedUserForDeactivate, setSelectedUserForDeactivate] = useState(null);

  // Close filter popover on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setIsFilterOpen(false);
      }
    };
    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isFilterOpen]);

  const fetchUsers = () => {
    setLoading(true);
    usersService.getUsers(activeTab)
      .then((data) => setUsers(data?.users || []))
      .catch((err) => console.error('Failed to load users:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
  }, [activeTab]);

  const handleCreatedSuccess = (result) => {
    setIsAddModalOpen(false);
    fetchUsers();
    setCredentialModalData(result);
  };

  const handleBulkSuccess = () => {
    fetchUsers();
  };

  const handleUserUpdated = (updatedUser) => {
    if (!updatedUser?.id) return;
    setUsers((prev) =>
      prev.map((u) => (u.id === updatedUser.id ? { ...u, ...updatedUser } : u))
    );
    setSelectedUserForDetail(updatedUser);
  };

  const handleToggleSubbatch = (sb) => {
    setSelectedSubbatches((prev) => {
      const next = new Set(prev);
      if (next.has(sb)) {
        next.delete(sb);
      } else {
        next.add(sb);
      }
      return next;
    });
  };

  const handleSelectAllSubbatches = () => {
    setSelectedSubbatches(new Set(ALL_SUBBATCHES));
  };

  const handleClearSubbatches = () => {
    setSelectedSubbatches(new Set());
  };

  // Filter users by subbatch selections and search query
  const filteredUsers = users.filter((u) => {
    // Subbatch filter (OR logic between selected subbatches)
    if (selectedSubbatches.size > 0) {
      const uSubbatch = (u.subbatch || '').trim().toUpperCase();
      if (!selectedSubbatches.has(uSubbatch)) {
        return false;
      }
    }

    // Search query (matching name, email, batch, subbatch, etc.)
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const matches =
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.batch && u.batch.toLowerCase().includes(q)) ||
        (u.subbatch && u.subbatch.toLowerCase().includes(q)) ||
        (u.user_code && u.user_code.toLowerCase().includes(q)) ||
        (u.type && u.type.toLowerCase().includes(q));
      if (!matches) return false;
    }

    return true;
  });

  // Exactly 4 tabs: All, Active, Inactive, Interns (Employees removed)
  const tabOptions = [
    { key: 'ALL', label: 'All' },
    { key: 'ACTIVE', label: 'Active' },
    { key: 'INACTIVE', label: 'Inactive' },
    { key: 'INTERN', label: 'Interns' },
  ];

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-600" />
            Organization Members &amp; Provisioning
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage, provision, view, and administer interns and employees in your organization.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsBulkModalOpen(true)}
            className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-slate-500" />
            Bulk Import CSV
          </button>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            + Add New
          </button>
        </div>
      </div>

      {/* Filter Tabs and Search Bar + Subbatch Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        
        {/* Type & Status Filter Tabs: All, Active, Inactive, Interns */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto">
          {tabOptions.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1 text-xs font-bold rounded-md whitespace-nowrap transition-all cursor-pointer ${
                activeTab === tab.key
                  ? 'bg-white text-purple-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input + Subbatch Filter Button */}
        <div className="flex items-center gap-2">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, batch..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-white border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-600 w-64 shadow-2xs"
            />
          </div>

          {/* Filter Button & Multi-Select Popover */}
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              onClick={() => setIsFilterOpen((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer shadow-2xs ${
                selectedSubbatches.size > 0 || isFilterOpen
                  ? 'bg-purple-50 border-purple-300 text-purple-700 ring-1 ring-purple-300/50'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              <Filter className="w-3.5 h-3.5 text-purple-600" />
              <span>Filter{selectedSubbatches.size > 0 ? ` (${selectedSubbatches.size})` : ''}</span>
            </button>

            {/* Subbatch Multi-Select Popover */}
            {isFilterOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-60 rounded-xl bg-white border border-slate-200 shadow-xl p-3 z-50 text-slate-800 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    FILTER BY SUBBATCH
                  </span>
                  {selectedSubbatches.size > 0 && (
                    <span className="text-[10px] font-semibold text-purple-700 bg-purple-100 px-1.5 py-0.2 rounded-full">
                      {selectedSubbatches.size} active
                    </span>
                  )}
                </div>

                <div className="space-y-2.5">
                  {BATCH_GROUPS.map((group) => (
                    <div key={group.batch} className="space-y-1">
                      <div className="text-[11px] font-bold text-slate-700">
                        {group.batch}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 pl-1">
                        {group.subbatches.map((sb) => {
                          const isChecked = selectedSubbatches.has(sb);
                          return (
                            <label
                              key={sb}
                              className={`flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors border select-none ${
                                isChecked
                                  ? 'bg-purple-50/70 border-purple-200 text-purple-900 font-semibold'
                                  : 'bg-slate-50/50 border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleSubbatch(sb)}
                                className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-600"
                              />
                              <span>{sb}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2.5 mt-2.5 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleSelectAllSubbatches}
                    className="text-[11px] font-semibold text-purple-600 hover:text-purple-800 transition-colors cursor-pointer"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={handleClearSubbatches}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Enterprise Data Table: Member List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 text-purple-600 animate-spin" />
            <span className="text-xs font-medium">Loading organization members...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-16 text-center text-slate-400">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="font-bold text-slate-700 text-sm">No Members Found</p>
            <p className="text-xs text-slate-400 mt-1">
              {search || selectedSubbatches.size > 0
                ? 'No members match your current filter and search criteria.'
                : 'Click "+ Add New" or "Bulk Import CSV" to provision members.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Member Name</th>
                  <th className="py-3 px-4">Batch / Subbatch</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role / Type</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center text-xs shrink-0 shadow-2xs">
                          {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div className="font-bold text-slate-900">{user.name || 'Member'}</div>
                      </div>
                    </td>

                    <td className="py-2.5 px-4">
                      {user.batch && user.subbatch ? (
                        <span className="font-mono text-[11px] font-bold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded border border-purple-200">
                          {user.batch} / {user.subbatch}
                        </span>
                      ) : user.batch || user.subbatch ? (
                        <span className="font-mono text-[11px] font-bold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded border border-purple-200">
                          {user.batch || user.subbatch}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px] font-medium">—</span>
                      )}
                    </td>

                    <td className="py-2.5 px-4 text-slate-600 font-mono text-[11px]">
                      {user.email}
                    </td>

                    <td className="py-2.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        user.type === 'INTERN'
                          ? 'bg-purple-100 text-purple-700'
                          : user.type === 'EMPLOYEE'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {user.type || 'MEMBER'}
                      </span>
                    </td>

                    <td className="py-2.5 px-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                        user.is_active !== false
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {user.is_active !== false ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Active
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 text-rose-600" />
                            Inactive
                          </>
                        )}
                      </span>
                    </td>

                    <td className="py-2.5 px-4 text-slate-400 text-[11px]">
                      {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                    </td>

                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedUserForDetail(user)}
                          className="px-2 py-1 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-500" />
                          <span>Details</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedUserForReset(user)}
                          className="px-2 py-1 rounded text-purple-700 hover:bg-purple-50 font-medium text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                          title="Reset Password"
                        >
                          <KeyRound className="w-3.5 h-3.5 text-purple-600" />
                          <span>Reset</span>
                        </button>

                        {user.is_active !== false && (
                          <button
                            type="button"
                            onClick={() => setSelectedUserForDeactivate(user)}
                            className="px-2 py-1 rounded text-rose-700 hover:bg-rose-50 font-medium text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                            title="Deactivate User"
                          >
                            <UserX className="w-3.5 h-3.5 text-rose-600" />
                            <span>Deactivate</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Provisioning Modals */}
      <AddMemberModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleCreatedSuccess}
      />

      <CredentialModal
        isOpen={!!credentialModalData}
        data={credentialModalData}
        onClose={() => setCredentialModalData(null)}
      />

      <BulkImportModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        onSuccess={handleBulkSuccess}
      />

      {/* User Management Modals */}
      <UserDetailModal
        isOpen={!!selectedUserForDetail}
        user={selectedUserForDetail}
        onClose={() => setSelectedUserForDetail(null)}
        onOpenResetPassword={(u) => setSelectedUserForReset(u)}
        onOpenDeactivate={(u) => setSelectedUserForDeactivate(u)}
        onSuccess={handleUserUpdated}
      />

      <ResetPasswordModal
        isOpen={!!selectedUserForReset}
        user={selectedUserForReset}
        onClose={() => setSelectedUserForReset(null)}
        onSuccess={fetchUsers}
      />

      <DeactivateUserModal
        isOpen={!!selectedUserForDeactivate}
        user={selectedUserForDeactivate}
        onClose={() => setSelectedUserForDeactivate(null)}
        onSuccess={fetchUsers}
      />
    </div>
  );
}
