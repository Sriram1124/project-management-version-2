import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Search,
  UserPlus,
  Users,
  Check,
  Loader2,
  AlertCircle,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { projectsService } from '../../services/projects.service';
import { PROJECT_ROLES } from './AssignProjectRolesModal';

export default function AddProjectMembersModal({
  isOpen,
  onClose,
  projectId,
  projectName = '',
  existingMembers = [],
  onSuccess,
  onToast,
}) {
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL'); // 'ALL' | 'INTERN' | 'STAFF'
  const [selectedUserIds, setSelectedUserIds] = useState(() => new Set());
  const [selectedRole, setSelectedRole] = useState('');
  const [error, setError] = useState('');

  // Fetch organization users when modal opens
  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setError('');
      setSelectedUserIds(new Set());
      setSearch('');
      setSelectedRole('');
      setTypeFilter('ALL');

      projectsService
        .getUsers()
        .then((users) => {
          setAllUsers(Array.isArray(users) ? users : []);
        })
        .catch((err) => {
          console.error('Failed to load organization users:', err);
          setError(err?.message || 'Failed to load organization members');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, projectId]);

  // Set of existing member user IDs in this project
  const existingMemberIds = useMemo(() => {
    const set = new Set();
    (existingMembers || []).forEach((m) => {
      const uid = m.user_id || m.id || m.userId || m.user?.id;
      if (uid) set.add(uid);
    });
    return set;
  }, [existingMembers]);

  // Available users (not yet members of this project)
  const availableUsers = useMemo(() => {
    return allUsers.filter((u) => !existingMemberIds.has(u.id));
  }, [allUsers, existingMemberIds]);

  // Filtered available users based on search and type filter
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return availableUsers.filter((u) => {
      const name = (u.name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const matchesSearch = !q || name.includes(q) || email.includes(q);

      const isIntern = u.type === 'INTERN' || u.role === 'INTERN' || u.roles?.includes('INTERN');
      let matchesType = true;
      if (typeFilter === 'INTERN') matchesType = isIntern;
      if (typeFilter === 'STAFF') matchesType = !isIntern;

      return matchesSearch && matchesType;
    });
  }, [availableUsers, search, typeFilter]);

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
  };

  const handleSelectAllFiltered = () => {
    const filteredIds = filteredUsers.map((u) => u.id);
    const allFilteredSelected = filteredIds.every((id) => selectedUserIds.has(id));

    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredIds.forEach((id) => next.delete(id));
      } else {
        filteredIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!projectId || selectedUserIds.size === 0) return;

    try {
      setSubmitting(true);
      setError('');
      const userIds = Array.from(selectedUserIds);
      const roleParam = selectedRole && selectedRole.trim() ? selectedRole.trim() : undefined;

      const added = await projectsService.addMembers(projectId, userIds, roleParam);
      const addedList = Array.isArray(added) ? added : (added?.members || [added]);

      onSuccess?.(addedList);
      onToast?.(`Added ${addedList.length} ${addedList.length === 1 ? 'member' : 'members'} to ${projectName || 'project'}`);
      onClose();
    } catch (err) {
      console.error('Failed to add members to project:', err);
      setError(err?.response?.data?.error || err?.message || 'Failed to add members to project');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const internCount = availableUsers.filter((u) => u.type === 'INTERN' || u.role === 'INTERN' || u.roles?.includes('INTERN')).length;
  const staffCount = availableUsers.length - internCount;
  const isAllFilteredSelected = filteredUsers.length > 0 && filteredUsers.every((u) => selectedUserIds.has(u.id));

  const modalContent = (
    <div
      className="fixed inset-0 z-70 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50/90 border-b border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold shadow-2xs">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Add Project Members</h3>
                {projectName && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                    {projectName}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Select members from your organization to add to this project.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar: Search, Type Filter Pills, and Role Selector */}
        <div className="p-4 bg-white border-b border-slate-100 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search available members by name or email..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white placeholder-slate-400 text-slate-800 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600 shadow-2xs"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Initial Role Selector */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">
                Role:
              </span>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white text-slate-800 font-semibold focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600 cursor-pointer shadow-2xs"
              >
                <option value="">Member (Standard)</option>
                {PROJECT_ROLES.filter((r) => r.value).map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Sub-bar: Type Filter Pills & Selection Controls */}
          <div className="flex items-center justify-between gap-2 pt-1 text-xs">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setTypeFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                  typeFilter === 'ALL'
                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 border border-transparent'
                }`}
              >
                All Available ({availableUsers.length})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('INTERN')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                  typeFilter === 'INTERN'
                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 border border-transparent'
                }`}
              >
                Interns ({internCount})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('STAFF')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                  typeFilter === 'STAFF'
                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 border border-transparent'
                }`}
              >
                Staff / Leads ({staffCount})
              </button>
            </div>

            {filteredUsers.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="text-[11px] font-semibold text-purple-600 hover:text-purple-800 hover:underline cursor-pointer"
              >
                {isAllFilteredSelected ? 'Deselect All' : 'Select All Filtered'}
              </button>
            )}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-6 mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {/* User Selection List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2">
          {loading ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 text-purple-600 animate-spin" />
              <span className="text-xs font-medium">Loading organization members...</span>
            </div>
          ) : availableUsers.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                <Check className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">All Organization Members Added!</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                Every member in your organization is already assigned to {projectName || 'this project'}.
              </p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-700">No Members Found</h4>
              <p className="text-xs text-slate-400 mt-1">
                No available members match "{search}".
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filteredUsers.map((u) => {
                const isSelected = selectedUserIds.has(u.id);
                const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || u.email)}&background=random`;
                const isIntern = u.type === 'INTERN' || u.role === 'INTERN' || u.roles?.includes('INTERN');

                return (
                  <div
                    key={u.id}
                    onClick={() => handleToggleUser(u.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none ${
                      isSelected
                        ? 'bg-purple-50/80 border-purple-300 ring-1 ring-purple-400/40 shadow-xs'
                        : 'bg-white hover:bg-slate-50/80 border-slate-200 hover:border-slate-300 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleUser(u.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer shrink-0"
                      />
                      <img
                        src={avatar}
                        alt={u.name}
                        className="w-8 h-8 rounded-full object-cover ring-1 ring-slate-200 shrink-0"
                      />
                      <div className="min-w-0 pr-1">
                        <div className="text-xs font-bold text-slate-900 truncate" title={u.name}>
                          {u.name}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate" title={u.email}>
                          {u.email}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-1">
                      {isIntern && u.batch && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          {u.batch}{u.subbatch ? `-${u.subbatch}` : ''}
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          isIntern
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-purple-50 text-purple-700 border-purple-200'
                        }`}
                      >
                        {u.type || u.role || 'MEMBER'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <div className="text-slate-600 font-medium">
            <span className="font-bold text-slate-900">{selectedUserIds.size}</span> members selected
            {selectedRole && (
              <span className="ml-1 text-purple-700 font-semibold">
                · as {PROJECT_ROLES.find((r) => r.value === selectedRole)?.label || selectedRole}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-1.5 rounded-xl text-slate-600 font-semibold hover:bg-slate-200/70 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || selectedUserIds.size === 0}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Adding...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>
                    Add {selectedUserIds.size > 0 ? `${selectedUserIds.size} Members` : 'Members'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}

