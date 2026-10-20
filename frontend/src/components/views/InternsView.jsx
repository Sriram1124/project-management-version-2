import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
  XCircle,
  Trash2,
  AlertCircle,
  Clock,
  CheckSquare
} from 'lucide-react';
import { usersService } from '../../services/users.service';
import AddMemberModal from '../modals/AddMemberModal';
import CredentialModal from '../modals/CredentialModal';
import BulkImportModal from '../modals/BulkImportModal';
import UserDetailModal from '../modals/UserDetailModal';
import ResetPasswordModal from '../modals/ResetPasswordModal';
import DeactivateUserModal from '../modals/DeactivateUserModal';
import BulkDeleteInternsModal from '../modals/BulkDeleteInternsModal';
import BulkDeleteResultsModal from '../modals/BulkDeleteResultsModal';

const BATCH_GROUPS = [
  { batch: 'Batch A', subbatches: ['A1', 'A2'] },
  { batch: 'Batch B', subbatches: ['B1', 'B2'] },
  { batch: 'Batch C', subbatches: ['C1', 'C2'] },
  { batch: 'Batch D', subbatches: ['D1', 'D2'] },
];

const ALL_SUBBATCHES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'];

export default function InternsView({ cohorts = [], selectedCohortId = null }) {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const userReqSeq = useRef(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'INACTIVE' | 'INTERN'

  // Subbatch filter state
  const [selectedSubbatches, setSelectedSubbatches] = useState(new Set());
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef(null);

  // Bulk selection & pagination state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState(new Set());
  const [isAllAcrossPagesSelected, setIsAllAcrossPagesSelected] = useState(false);
  const [pageSize, setPageSize] = useState(15);
  const [currentPage, setCurrentPage] = useState(1);
  const headerCheckboxRef = useRef(null);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [credentialModalData, setCredentialModalData] = useState(null);

  // User management modals
  const [selectedUserForDetail, setSelectedUserForDetail] = useState(null);
  const [selectedUserForReset, setSelectedUserForReset] = useState(null);
  const [selectedUserForDeactivate, setSelectedUserForDeactivate] = useState(null);

  // Bulk deletion modals
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [deletionResult, setDeletionResult] = useState(null);

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
    const seq = ++userReqSeq.current;
    setLoading(true);
    usersService.getUsers(activeTab, selectedCohortId)
      .then((data) => {
        if (seq !== userReqSeq.current) return;
        setUsers(data?.users || []);
      })
      .catch((err) => console.error('Failed to load users:', err))
      .finally(() => {
        if (seq === userReqSeq.current) setLoading(false);
      });
  };

  useEffect(() => {
    fetchUsers();
  }, [activeTab, selectedCohortId]);

  // Clear selections and reset to page 1 on cohort change
  useEffect(() => {
    setSelectedUserIds(new Set());
    setIsAllAcrossPagesSelected(false);
    setCurrentPage(1);
  }, [selectedCohortId]);

  // Reset pagination when search, activeTab, or subbatch filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, activeTab, selectedSubbatches]);

  // Reset selections when search filters, status filters, pagination, or subbatch change
  // so unintended members are never deleted across filters or pages
  useEffect(() => {
    setSelectedUserIds(new Set());
    setIsAllAcrossPagesSelected(false);
  }, [search, activeTab, selectedSubbatches, currentPage, pageSize]);

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
    // Cohort filter
    if (selectedCohortId && selectedCohortId !== 'ALL') {
      const matchCohort =
        u.cohort_id === selectedCohortId ||
        u.cohort?.id === selectedCohortId ||
        u.cohort?.code === selectedCohortId ||
        u.cohort?.name === selectedCohortId;
      if (!matchCohort) return false;
    }

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
        (u.type && u.type.toLowerCase().includes(q)) ||
        (u.cohort?.name && u.cohort.name.toLowerCase().includes(q)) ||
        (u.cohort?.code && u.cohort.code.toLowerCase().includes(q)) ||
        (u.cohort_name && u.cohort_name.toLowerCase().includes(q));
      if (!matches) return false;
    }

    return true;
  });

  // Pagination calculations
  const totalPages = pageSize === 'All' ? 1 : Math.max(1, Math.ceil(filteredUsers.length / Number(pageSize)));
  const paginatedUsers = pageSize === 'All'
    ? filteredUsers
    : filteredUsers.slice((currentPage - 1) * Number(pageSize), currentPage * Number(pageSize));

  // Sync indeterminate state for header checkbox
  useEffect(() => {
    if (!headerCheckboxRef.current || !isSelectionMode) return;
    const visibleIds = paginatedUsers.map((u) => u.id);
    const selectedOnPage = visibleIds.filter((id) => selectedUserIds.has(id)).length;

    if (visibleIds.length === 0 || selectedOnPage === 0) {
      headerCheckboxRef.current.checked = false;
      headerCheckboxRef.current.indeterminate = false;
    } else if (selectedOnPage === visibleIds.length) {
      headerCheckboxRef.current.checked = true;
      headerCheckboxRef.current.indeterminate = false;
    } else {
      headerCheckboxRef.current.checked = false;
      headerCheckboxRef.current.indeterminate = true;
    }
  }, [paginatedUsers, selectedUserIds, isSelectionMode]);

  // Bulk Selection Handlers
  const handleToggleSelectPage = () => {
    const visibleIds = paginatedUsers.map((u) => u.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedUserIds.has(id));

    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
    setIsAllAcrossPagesSelected(false);
  };

  const handleToggleUser = (userId) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
    setIsAllAcrossPagesSelected(false);
  };

  const handleSelectAllAcrossPages = () => {
    const allMatchingIds = filteredUsers.map((u) => u.id);
    setSelectedUserIds(new Set(allMatchingIds));
    setIsAllAcrossPagesSelected(true);
  };

  const handleClearSelection = () => {
    setSelectedUserIds(new Set());
    setIsAllAcrossPagesSelected(false);
  };

  const handleCancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedUserIds(new Set());
    setIsAllAcrossPagesSelected(false);
  };

  const handleBulkDeleteSuccess = (result) => {
    handleCancelSelection();
    fetchUsers();
    setDeletionResult(result);
  };

  const selectedUserObjects = users.filter((u) => selectedUserIds.has(u.id));

  // Check if all visible members on current page are selected and more exist across pages
  const isPageFullySelected =
    paginatedUsers.length > 0 && paginatedUsers.every((u) => selectedUserIds.has(u.id));
  const hasMultiplePages = pageSize !== 'All' && filteredUsers.length > paginatedUsers.length;

  // Exactly 4 tabs: All, Active, Inactive, Interns
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
          {isSelectionMode ? (
            <>
              {selectedUserIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setIsBulkDeleteModalOpen(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer animate-in fade-in"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Selected ({selectedUserIds.size})</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleCancelSelection}
                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors shadow-2xs cursor-pointer"
              >
                Cancel Selection
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setIsSelectionMode(true)}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              title="Select members for bulk deletion"
            >
              <CheckSquare className="w-3.5 h-3.5 text-purple-600" />
              <span>Select Members</span>
            </button>
          )}

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

          {/* Subbatch Filter Button & Multi-Select Popover */}
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

          {/* Quick Select Mode Toggle in Filter Bar */}
          <button
            type="button"
            onClick={() => {
              if (isSelectionMode) {
                handleCancelSelection();
              } else {
                setIsSelectionMode(true);
              }
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer shadow-2xs ${
              isSelectionMode
                ? 'bg-purple-50 border-purple-300 text-purple-700 ring-1 ring-purple-300/50'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
            }`}
            title={isSelectionMode ? 'Cancel selection' : 'Select members'}
          >
            <CheckSquare className="w-3.5 h-3.5 text-purple-600" />
            <span>{isSelectionMode ? 'Cancel' : 'Select'}</span>
          </button>
        </div>
      </div>

      {/* Bulk Selection Action Toolbar */}
      {isSelectionMode && selectedUserIds.size === 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-purple-50/80 border border-purple-200/90 p-3 rounded-xl shadow-2xs animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-2 text-xs text-purple-950 font-medium">
            <CheckSquare className="w-4 h-4 text-purple-600 shrink-0" />
            <span>Select members using the checkboxes or select all visible via the table header.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleSelectPage}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
            >
              Select All Visible
            </button>
            <button
              type="button"
              onClick={handleCancelSelection}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-medium text-slate-600 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {selectedUserIds.size > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-purple-50/90 border border-purple-200/90 p-3 rounded-xl shadow-2xs animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-lg bg-purple-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
              {selectedUserIds.size}
            </span>
            <span className="text-xs font-bold text-purple-950">
              {selectedUserIds.size} {selectedUserIds.size === 1 ? 'member' : 'members'} selected
            </span>
            <span className="text-purple-300">|</span>
            <button
              type="button"
              onClick={handleClearSelection}
              className="text-xs font-semibold text-purple-700 hover:text-purple-900 underline cursor-pointer"
            >
              Clear selection
            </button>
            <span className="text-purple-300">|</span>
            <button
              type="button"
              onClick={handleCancelSelection}
              className="text-xs font-semibold text-purple-700 hover:text-purple-900 underline cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsBulkDeleteModalOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected ({selectedUserIds.size})</span>
            </button>
          </div>
        </div>
      )}

      {/* Explicit Cross-Page Selection Banner */}
      {isSelectionMode && isPageFullySelected && hasMultiplePages && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-purple-600 shrink-0" />
            {!isAllAcrossPagesSelected ? (
              <span>
                All <strong className="font-bold text-slate-900">{paginatedUsers.length}</strong> members on this page are selected.{' '}
                <button
                  type="button"
                  onClick={handleSelectAllAcrossPages}
                  className="font-bold text-purple-700 hover:text-purple-900 underline cursor-pointer ml-1"
                >
                  Select all {filteredUsers.length} matching members across every page
                </button>
              </span>
            ) : (
              <span>
                All <strong className="font-bold text-slate-900">{filteredUsers.length}</strong> matching members across all pages are selected.
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleClearSelection}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 underline cursor-pointer shrink-0"
          >
            Clear selection
          </button>
        </div>
      )}

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
                  {isSelectionMode && (
                    <th className="py-3 px-3.5 w-10 text-center">
                      <input
                        ref={headerCheckboxRef}
                        type="checkbox"
                        checked={paginatedUsers.length > 0 && paginatedUsers.every((u) => selectedUserIds.has(u.id))}
                        onChange={handleToggleSelectPage}
                        className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-600 align-middle"
                        title="Select all members on this page"
                      />
                    </th>
                  )}
                  <th className="py-3 px-4">Member Name</th>
                  <th className="py-3 px-4">Batch / Subbatch</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role / Type</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Extensions</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {paginatedUsers.map((user) => {
                  const isSelected = selectedUserIds.has(user.id);
                  return (
                    <tr
                      key={user.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-purple-50/50 hover:bg-purple-50/80' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {isSelectionMode && (
                        <td className="py-2.5 px-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleUser(user.id)}
                            className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-600 align-middle"
                            title={`Select ${user.name || user.email}`}
                          />
                        </td>
                      )}

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

                      <td className="py-2.5 px-4">
                        {user.extensions_count > 0 ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-mono text-[11px] font-bold cursor-help whitespace-nowrap shadow-2xs"
                            title={`${user.extensions_count} Total Requests (${user.extension_stats?.approved || 0} approved, ${user.extension_stats?.pending || 0} pending, ${user.extension_stats?.rejected || 0} rejected)`}
                          >
                            <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>{user.extensions_count}</span>
                            {user.extension_stats && (
                              <span className="text-[10px] font-medium text-amber-600/80">
                                ({user.extension_stats.approved}a/{user.extension_stats.pending}p/{user.extension_stats.rejected}r)
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] font-medium text-slate-400" title="0 extension requests">0</span>
                        )}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Toolbar */}
        {!loading && filteredUsers.length > 0 && (
          <div className="px-4 py-3 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-slate-500">Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(e.target.value === 'All' ? 'All' : Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-2xs focus:outline-none focus:border-purple-600 cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value="All">All</option>
              </select>
              <span className="text-slate-400">|</span>
              <span className="text-[11px] font-medium text-slate-500">
                Showing{' '}
                <span className="font-bold text-slate-800">
                  {pageSize === 'All'
                    ? filteredUsers.length
                    : `${Math.min((currentPage - 1) * Number(pageSize) + 1, filteredUsers.length)} - ${Math.min(
                        currentPage * Number(pageSize),
                        filteredUsers.length
                      )}`}
                </span>{' '}
                of <span className="font-bold text-slate-800">{filteredUsers.length}</span> members
              </span>
            </div>

            {pageSize !== 'All' && totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium text-xs text-slate-700 shadow-2xs transition-colors cursor-pointer"
                >
                  Previous
                </button>
                <span className="px-2 text-xs font-bold text-slate-700">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium text-xs text-slate-700 shadow-2xs transition-colors cursor-pointer"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Provisioning Modals */}
      <AddMemberModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleCreatedSuccess}
        defaultCohortId={selectedCohortId}
        cohorts={cohorts}
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
        onOpenPerformanceReport={(u) => {
          if (u?.id) {
            navigate(`/manager/reports?userId=${encodeURIComponent(u.id)}`, {
              state: { userId: u.id },
            });
          } else {
            navigate('/manager/reports');
          }
        }}
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

      {/* Bulk Delete Modal with Password Verification */}
      <BulkDeleteInternsModal
        isOpen={isBulkDeleteModalOpen}
        selectedCount={selectedUserIds.size}
        selectedUsers={selectedUserObjects}
        selectedUserIds={Array.from(selectedUserIds)}
        onClose={() => setIsBulkDeleteModalOpen(false)}
        onSuccess={handleBulkDeleteSuccess}
      />

      {/* Bulk Delete Results Report Modal */}
      <BulkDeleteResultsModal
        isOpen={!!deletionResult}
        result={deletionResult}
        onClose={() => setDeletionResult(null)}
      />
    </div>
  );
}
