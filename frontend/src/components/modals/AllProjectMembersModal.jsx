import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Search, 
  Filter, 
  Users, 
  ChevronDown, 
  ShieldCheck,
  ShieldPlus,
  Check,
  Trash2,
  Loader2,
  AlertTriangle,
  UserPlus,
  MoreVertical,
  UserCog
} from 'lucide-react';
import { PROJECT_ROLE_LABELS } from './AssignProjectRolesModal';
import AddProjectMembersModal from './AddProjectMembersModal';
import AddCustomRoleModal from './AddCustomRoleModal';
import EditMemberPermissionsModal from './EditMemberPermissionsModal';
import { projectsService } from '../../services/projects.service';

export default function AllProjectMembersModal({
  isOpen,
  onClose,
  members = [],
  projectName = '',
  projectId,
  canAssignRoles = false,
  canRemoveMembers = false,
  canAddMembers = false,
  onOpenAssignRoles,
  onMemberRemoved,
  onMembersAdded,
  onToast,
}) {
  if (!isOpen) return null;

  const [localMembers, setLocalMembers] = useState(members);
  const [search, setSearch] = useState('');
  const [selectedRoles, setSelectedRoles] = useState(() => new Set());
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customSelectedIds, setCustomSelectedIds] = useState(() => new Set());
  const [removingUserId, setRemovingUserId] = useState(null);
  const [memberToRemove, setMemberToRemove] = useState(null);
  const [bulkRemoving, setBulkRemoving] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const [isAddMembersOpen, setIsAddMembersOpen] = useState(false);
  const [isAddCustomRoleOpen, setIsAddCustomRoleOpen] = useState(false);
  const [activeMenuMemberId, setActiveMenuMemberId] = useState(null);
  const [editingPermissionsMember, setEditingPermissionsMember] = useState(null);
  const filterRef = useRef(null);

  const allowAddMembers = canAddMembers || canAssignRoles;

  useEffect(() => {
    setLocalMembers(members);
  }, [members]);

  // Close menu on click outside
  useEffect(() => {
    const handleMenuClickOutside = () => setActiveMenuMemberId(null);
    if (activeMenuMemberId) {
      document.addEventListener('click', handleMenuClickOutside);
    }
    return () => document.removeEventListener('click', handleMenuClickOutside);
  }, [activeMenuMemberId]);

  // Close filter popover on click outside
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

  // Distinct roles present among members
  const availableRoles = useMemo(() => {
    const rolesSet = new Set();
    (localMembers || []).forEach((m) => {
      if (m.project_role) rolesSet.add(m.project_role);
      else rolesSet.add('UNASSIGNED');
    });
    return Array.from(rolesSet);
  }, [localMembers]);

  const handleToggleRole = (roleKey) => {
    // If user interacts with role checkboxes, disable custom mode
    setIsCustomMode(false);
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(roleKey)) {
        next.delete(roleKey);
      } else {
        next.add(roleKey);
      }
      return next;
    });
  };

  const handleSelectAllRoles = () => {
    setIsCustomMode(false);
    if (selectedRoles.size === availableRoles.length) {
      setSelectedRoles(new Set());
    } else {
      setSelectedRoles(new Set(availableRoles));
    }
  };

  const handleClearRoles = () => {
    setIsCustomMode(false);
    setSelectedRoles(new Set());
    setCustomSelectedIds(new Set());
  };

  const handleToggleCustomMember = (userId) => {
    setIsCustomMode(true);
    setSelectedRoles(new Set());
    setCustomSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleToggleAllCustom = () => {
    if (customSelectedIds.size === members.length) {
      setCustomSelectedIds(new Set());
    } else {
      setCustomSelectedIds(new Set(members.map((m) => m.user_id)));
    }
  };

  const handleConfirmRemoveMember = async () => {
    if (!memberToRemove || !projectId) return;
    const uid = memberToRemove.user_id || memberToRemove.id;
    try {
      setRemovingUserId(uid);
      setRemoveError('');
      await projectsService.removeMember(projectId, uid);
      // Remove from custom selected set if present
      setCustomSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(uid);
        return next;
      });
      onMemberRemoved?.(uid);
      setMemberToRemove(null);
    } catch (err) {
      console.error('Failed to remove member from project:', err);
      setRemoveError(err?.response?.data?.message || err?.message || 'Failed to remove member from project');
    } finally {
      setRemovingUserId(null);
    }
  };

  const handleBulkRemoveMembers = async () => {
    if (!projectId || customSelectedIds.size === 0) return;
    try {
      setBulkRemoving(true);
      setRemoveError('');
      const idsToRemove = Array.from(customSelectedIds);
      for (const uid of idsToRemove) {
        try {
          await projectsService.removeMember(projectId, uid);
          onMemberRemoved?.(uid);
        } catch (e) {
          console.warn('Failed removing member in bulk:', uid, e);
        }
      }
      setCustomSelectedIds(new Set());
      setIsCustomMode(false);
    } catch (err) {
      setRemoveError(err?.message || 'Failed to remove selected members');
    } finally {
      setBulkRemoving(false);
    }
  };
  const filteredMembers = useMemo(() => {
    const list = (localMembers || []).filter((m) => {
      const name = m.name || m.email || '';
      const email = m.email || '';
      const role = m.project_role || 'UNASSIGNED';

      const matchesSearch = 
        name.toLowerCase().includes(search.toLowerCase()) || 
        email.toLowerCase().includes(search.toLowerCase());

      if (isCustomMode) {
        // If Custom mode is active, filter by specifically picked members (or all if none chosen yet)
        const matchesCustom = customSelectedIds.size === 0 || customSelectedIds.has(m.user_id);
        return matchesSearch && matchesCustom;
      }

      const matchesRole = 
        selectedRoles.size === 0 || selectedRoles.has(role);

      return matchesSearch && matchesRole;
    });

    return list.sort((a, b) => {
      const aIsLead = a.project_role === 'TECH_LEAD' || a.role === 'TECH_LEAD';
      const bIsLead = b.project_role === 'TECH_LEAD' || b.role === 'TECH_LEAD';
      if (aIsLead && !bIsLead) return -1;
      if (!aIsLead && bIsLead) return 1;
      const nameA = a.name || a.email || '';
      const nameB = b.name || b.email || '';
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
  }, [localMembers, search, selectedRoles, isCustomMode, customSelectedIds]);

  const modalContent = (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl h-[580px] max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Project Members
                </h3>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                  {members.length} Total
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {projectName ? `${projectName} team directory & role roster` : 'Full member roster'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {allowAddMembers && (
              <button
                type="button"
                onClick={() => setIsAddMembersOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-xs font-bold transition-all cursor-pointer shadow-2xs hover:shadow-xs"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Members</span>
              </button>
            )}
            {canAssignRoles && (
              <button
                type="button"
                onClick={() => setIsAddCustomRoleOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold border border-purple-200 transition-colors cursor-pointer shadow-2xs"
              >
                <ShieldPlus className="w-3.5 h-3.5" />
                <span>Add Custom Role</span>
              </button>
            )}
            {canAssignRoles && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAssignRoles?.();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold border border-purple-200 transition-colors cursor-pointer shadow-2xs"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Assign Roles</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search and Role Filter Bar */}
        <div className="px-6 py-3 bg-white border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
            />
          </div>

          {/* Role Filter Dropdown with Custom option */}
          <div className="relative w-full sm:w-auto justify-end flex items-center gap-2" ref={filterRef}>
            {isCustomMode && (
              <div className="flex items-center gap-1.5 bg-purple-50 px-2.5 py-1 rounded-xl border border-purple-200 text-xs">
                <span className="font-bold text-purple-700">
                  {customSelectedIds.size} selected
                </span>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={handleToggleAllCustom}
                  className="font-medium text-purple-600 hover:text-purple-800 hover:underline cursor-pointer text-[11px]"
                >
                  {customSelectedIds.size === members.length ? 'Deselect All' : 'Select All'}
                </button>
                {canRemoveMembers && customSelectedIds.size > 0 && (
                  <>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={handleBulkRemoveMembers}
                      disabled={bulkRemoving}
                      className="inline-flex items-center gap-1 font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer text-[11px]"
                    >
                      {bulkRemoving ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                      <span>Remove ({customSelectedIds.size})</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleClearRoles}
                  className="font-medium text-slate-500 hover:text-slate-700 hover:underline cursor-pointer text-[11px] ml-1"
                >
                  Exit Custom
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`flex items-center justify-between gap-2 px-3 py-1.5 text-xs rounded-xl border transition-colors cursor-pointer shadow-2xs select-none ${
                isCustomMode
                  ? 'bg-purple-100/70 border-purple-300 text-purple-800 font-bold'
                  : selectedRoles.size > 0
                  ? 'bg-purple-50 border-purple-300 text-purple-700 font-bold'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 font-semibold'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  {isCustomMode
                    ? customSelectedIds.size === 0
                      ? `Custom Selection (${members.length})`
                      : `Custom (${customSelectedIds.size} selected)`
                    : selectedRoles.size === 0
                    ? `All Roles (${members.length})`
                    : selectedRoles.size === 1
                    ? (() => {
                        const r = Array.from(selectedRoles)[0];
                        return r === 'UNASSIGNED' ? 'Member (Unassigned)' : (PROJECT_ROLE_LABELS[r] || r);
                      })()
                    : `${selectedRoles.size} Roles Selected`}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
            </button>

            {/* Dropdown Popover */}
            {isFilterOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-64 rounded-xl bg-white border border-slate-200 shadow-xl p-2.5 z-50 text-slate-800 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Filter by Role
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllRoles}
                      className="text-[10px] font-semibold text-purple-600 hover:underline cursor-pointer"
                    >
                      {selectedRoles.size === availableRoles.length && !isCustomMode ? 'Deselect All' : 'Select All'}
                    </button>
                    {(selectedRoles.size > 0 || isCustomMode) && (
                      <button
                        type="button"
                        onClick={handleClearRoles}
                        className="text-[10px] font-semibold text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1 max-h-60 overflow-y-auto pr-0.5">
                  {/* Standard Roles with small checkboxes */}
                  {availableRoles.map((roleKey) => {
                    const isChecked = !isCustomMode && selectedRoles.has(roleKey);
                    const label = roleKey === 'UNASSIGNED' ? 'Member (Unassigned)' : (PROJECT_ROLE_LABELS[roleKey] || roleKey);
                    const count = members.filter((m) => (m.project_role || 'UNASSIGNED') === roleKey).length;

                    return (
                      <label
                        key={roleKey}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors select-none ${
                          isChecked
                            ? 'bg-purple-50 text-purple-900 font-semibold'
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleRole(roleKey)}
                            className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer shrink-0"
                          />
                          <span className="truncate">{label}</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 ml-1 shrink-0">
                          ({count})
                        </span>
                      </label>
                    );
                  })}

                  {/* Dedicated Custom Option Item */}
                  <div className="pt-1.5 mt-1.5 border-t border-slate-100">
                    <label
                      onClick={() => {
                        setIsCustomMode(true);
                        setSelectedRoles(new Set());
                      }}
                      className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors select-none ${
                        isCustomMode
                          ? 'bg-purple-50 text-purple-900 font-bold border border-purple-200/80'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isCustomMode}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setIsCustomMode(true);
                              setSelectedRoles(new Set());
                            } else {
                              setIsCustomMode(false);
                            }
                          }}
                          className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer shrink-0"
                        />
                        <div className="min-w-0">
                          <span className="font-bold text-slate-900">Custom</span>
                          <span className="block text-[10px] text-slate-400 font-normal">
                            Pick from main frame
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-purple-600 ml-1 shrink-0">
                        {customSelectedIds.size > 0 ? `(${customSelectedIds.size})` : `(${members.length})`}
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Filtered Members Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {members.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-700">No Members in Project</h4>
              <p className="text-xs text-slate-400 mt-1 mb-4">
                Get started by adding team members from your organization.
              </p>
              {allowAddMembers && (
                <button
                  type="button"
                  onClick={() => setIsAddMembersOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Add First Member</span>
                </button>
              )}
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-700">No Members Match Filter</h4>
              <p className="text-xs text-slate-400 mt-1">
                Try adjusting your search query or role filter.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 items-start content-start">
              {filteredMembers.map((member) => {
                const mName = member.name || member.email || 'Member';
                const mAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(mName)}&background=random`;
                const roleLabel = member.project_role ? (PROJECT_ROLE_LABELS[member.project_role] || member.project_role) : 'Member';
                const isSpecialRole = Boolean(member.project_role);
                const isCustomChecked = customSelectedIds.has(member.user_id);

                return (
                  <div
                    key={member.user_id}
                    onClick={isCustomMode ? () => handleToggleCustomMember(member.user_id) : undefined}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all shadow-2xs ${
                      isCustomMode
                        ? isCustomChecked
                          ? 'bg-purple-50/70 hover:bg-purple-50 border-purple-300 shadow-xs cursor-pointer ring-1 ring-purple-400/30'
                          : 'bg-white hover:bg-slate-50/80 border-slate-200 cursor-pointer opacity-75 hover:opacity-100'
                        : 'bg-slate-50/70 hover:bg-white border-slate-200/80 hover:border-purple-300 hover:shadow-xs'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Checkbox in main frame card when in Custom mode */}
                      {isCustomMode && (
                        <input
                          type="checkbox"
                          checked={isCustomChecked}
                          onChange={() => handleToggleCustomMember(member.user_id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer shrink-0"
                        />
                      )}
                      <img
                        src={mAvatar}
                        alt={mName}
                        className="w-8 h-8 rounded-full object-cover ring-1 ring-slate-200 shrink-0"
                      />
                      <div className="min-w-0 pr-1">
                        <div className="text-xs font-bold text-slate-900 truncate" title={mName}>
                          {mName}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate" title={member.email}>
                          {member.email}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-1">
                      <span
                        className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold border whitespace-nowrap ${
                          isSpecialRole
                            ? 'bg-purple-100 text-purple-800 border-purple-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {roleLabel}
                      </span>

                      {/* Member Actions Three-Dot Menu */}
                      {(canAssignRoles || canRemoveMembers) && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuMemberId(activeMenuMemberId === member.user_id ? null : member.user_id);
                            }}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
                            title={`Options for ${mName}`}
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>

                          {activeMenuMemberId === member.user_id && (
                            <div
                              className="absolute right-0 top-full mt-1 w-48 rounded-xl bg-white border border-slate-200 shadow-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {canAssignRoles && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveMenuMemberId(null);
                                    setEditingPermissionsMember(member);
                                  }}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:text-purple-700 hover:bg-purple-50 transition-colors text-left cursor-pointer"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                                  <span>Edit Permissions</span>
                                </button>
                              )}

                              {canAssignRoles && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveMenuMemberId(null);
                                    onOpenAssignRoles?.();
                                  }}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:text-purple-700 hover:bg-purple-50 transition-colors text-left cursor-pointer"
                                >
                                  <UserCog className="w-3.5 h-3.5 text-slate-500" />
                                  <span>Change Project Role</span>
                                </button>
                              )}

                              {canRemoveMembers && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveMenuMemberId(null);
                                    setMemberToRemove(member);
                                  }}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors text-left cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                  <span>Remove from Project</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing <strong>{filteredMembers.length}</strong> of <strong>{members.length}</strong> members
            {isCustomMode && customSelectedIds.size > 0 && (
              <> · <strong>{customSelectedIds.size}</strong> custom selected</>
            )}
            {!isCustomMode && selectedRoles.size > 0 && (
              <> · <strong>{selectedRoles.size}</strong> roles filtered</>
            )}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Confirmation Dialog for Removing Member */}
      {memberToRemove && (
        <div 
          className="fixed inset-0 z-60 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={(e) => {
            e.stopPropagation();
            setMemberToRemove(null);
          }}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Remove Team Member?</h4>
                <p className="text-xs text-slate-500">
                  Are you sure you want to remove <strong>{memberToRemove.name || memberToRemove.email}</strong> from this project?
                </p>
              </div>
            </div>

            {removeError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                {removeError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setMemberToRemove(null)}
                disabled={Boolean(removingUserId)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoveMember}
                disabled={Boolean(removingUserId)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {removingUserId ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Removing...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove Member</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Project Members Modal */}
      <AddProjectMembersModal
        isOpen={isAddMembersOpen}
        onClose={() => setIsAddMembersOpen(false)}
        projectId={projectId}
        projectName={projectName}
        existingMembers={members}
        onSuccess={(addedList) => {
          onMembersAdded?.(addedList);
        }}
        onToast={onToast}
      />

      {/* Add Custom Role Modal */}
      <AddCustomRoleModal
        isOpen={isAddCustomRoleOpen}
        onClose={() => setIsAddCustomRoleOpen(false)}
        projectId={projectId}
        projectName={projectName}
        onRoleCreated={(newRole) => {
          onToast?.({
            type: 'success',
            title: 'Custom Role Created',
            message: `Role "${newRole.name}" created successfully.`,
          });
        }}
        onToast={onToast}
      />

      {/* Edit Member Permissions Modal */}
      <EditMemberPermissionsModal
        isOpen={Boolean(editingPermissionsMember)}
        onClose={() => setEditingPermissionsMember(null)}
        projectId={projectId}
        member={editingPermissionsMember}
        onSuccess={(updatedMembers) => {
          if (Array.isArray(updatedMembers)) {
            setLocalMembers(updatedMembers);
          }
        }}
        onToast={onToast}
      />
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
