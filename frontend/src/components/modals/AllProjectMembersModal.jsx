import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
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
  const [projectRoles, setProjectRoles] = useState([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
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
  const triggerBtnRef = useRef(null);

  const allowAddMembers = canAddMembers || canAssignRoles;

  const fetchProjectRoles = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoadingRoles(true);
      const roles = await projectsService.getProjectRoles(projectId);
      setProjectRoles(Array.isArray(roles) ? roles : []);
    } catch (err) {
      console.warn('Could not load project roles in AllProjectMembersModal:', err);
    } finally {
      setLoadingRoles(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isOpen) {
      fetchProjectRoles();
    }
  }, [isOpen, fetchProjectRoles]);

  useEffect(() => {
    if (isFilterOpen && projectId) {
      fetchProjectRoles();
    }
  }, [isFilterOpen, projectId, fetchProjectRoles]);

  useEffect(() => {
    setLocalMembers(members);
  }, [members]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (editingPermissionsMember || isAddMembersOpen || isAddCustomRoleOpen) return;
        if (memberToRemove) {
          setMemberToRemove(null);
          return;
        }
        if (activeMenuMemberId) {
          setActiveMenuMemberId(null);
          return;
        }
        if (isFilterOpen) {
          setIsFilterOpen(false);
          return;
        }
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    editingPermissionsMember,
    isAddMembersOpen,
    isAddCustomRoleOpen,
    memberToRemove,
    activeMenuMemberId,
    isFilterOpen,
    onClose,
  ]);

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

  // Group roles into Organization Reusable Roles, Project-Specific Roles, and Standard Roles
  const reusableRoles = useMemo(() => {
    return projectRoles
      .filter((r) => r.is_custom && (r.is_template || r.carry_forward || !r.project_id))
      .map((r) => ({
        key: r.name,
        label: r.label || r.name,
        isCustom: true,
        isReusable: true,
      }));
  }, [projectRoles]);

  const projectOnlyRoles = useMemo(() => {
    return projectRoles
      .filter((r) => r.is_custom && !(r.is_template || r.carry_forward || !r.project_id))
      .map((r) => ({
        key: r.name,
        label: r.label || r.name,
        isCustom: true,
        isReusable: false,
      }));
  }, [projectRoles]);

  const standardRoles = useMemo(() => {
    const rolesFromApi = projectRoles
      .filter((r) => !r.is_custom && r.name !== 'ADMIN' && r.name !== 'SUPER_ADMIN')
      .map((r) => ({
        key: r.name,
        label: r.label || PROJECT_ROLE_LABELS[r.name] || r.name,
        isCustom: false,
        isReusable: false,
      }));

    if (rolesFromApi.length > 0) return rolesFromApi;

    return [
      { key: 'TECH_LEAD', label: 'Tech Lead', isCustom: false, isReusable: false },
      { key: 'DEVELOPER', label: 'Developer', isCustom: false, isReusable: false },
      { key: 'QA_TESTER', label: 'QA Tester', isCustom: false, isReusable: false },
      { key: 'UI_UX_DESIGNER', label: 'UI/UX Designer', isCustom: false, isReusable: false },
      { key: 'DEVOPS_ENGINEER', label: 'DevOps Engineer', isCustom: false, isReusable: false },
      { key: 'BUSINESS_ANALYST', label: 'Business Analyst', isCustom: false, isReusable: false },
      { key: 'PROJECT_COORDINATOR', label: 'Project Coordinator', isCustom: false, isReusable: false },
    ];
  }, [projectRoles]);

  // Combined set of all possible role keys for filtering
  const allRoleKeys = useMemo(() => {
    const keys = new Set();
    keys.add('UNASSIGNED');
    standardRoles.forEach((r) => keys.add(r.key));
    reusableRoles.forEach((r) => keys.add(r.key));
    projectOnlyRoles.forEach((r) => keys.add(r.key));
    (localMembers || []).forEach((m) => {
      if (m.project_role) keys.add(m.project_role);
    });
    return Array.from(keys);
  }, [standardRoles, reusableRoles, projectOnlyRoles, localMembers]);

  // Calculate member count for each role (case-insensitive)
  const getRoleMemberCount = useCallback((roleKey) => {
    if (roleKey === 'UNASSIGNED') {
      return (localMembers || []).filter((m) => !m.project_role || m.project_role === 'UNASSIGNED').length;
    }
    const targetKey = String(roleKey).toLowerCase();
    return (localMembers || []).filter((m) => {
      const memberRole = String(m.project_role || '').toLowerCase();
      return memberRole === targetKey;
    }).length;
  }, [localMembers]);

  const handleToggleRole = (roleKey) => {
    // If user interacts with role checkboxes, disable manual member pick mode
    setIsCustomMode(false);
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      const existingMatch = Array.from(next).find((k) => k.toLowerCase() === roleKey.toLowerCase());
      if (existingMatch) {
        next.delete(existingMatch);
      } else {
        next.add(roleKey);
      }
      return next;
    });
  };

  const handleSelectAllRoles = () => {
    setIsCustomMode(false);
    if (selectedRoles.size === allRoleKeys.length) {
      setSelectedRoles(new Set());
    } else {
      setSelectedRoles(new Set(allRoleKeys));
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
      const memberRole = m.project_role ? String(m.project_role).trim().toLowerCase() : 'unassigned';

      const matchesSearch = 
        name.toLowerCase().includes(search.toLowerCase()) || 
        email.toLowerCase().includes(search.toLowerCase());

      if (isCustomMode) {
        // If Manual Member Pick mode is active, filter by specifically picked members
        const matchesCustom = customSelectedIds.size === 0 || customSelectedIds.has(m.user_id);
        return matchesSearch && matchesCustom;
      }

      if (selectedRoles.size === 0) return matchesSearch;

      const matchesRole = Array.from(selectedRoles).some((selectedKey) => {
        if (selectedKey === 'UNASSIGNED') {
          return !m.project_role || m.project_role === 'UNASSIGNED';
        }
        return selectedKey.trim().toLowerCase() === memberRole;
      });

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
                  Exit Selection
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
                      ? `Manual Selection (${members.length})`
                      : `Manual (${customSelectedIds.size} picked)`
                    : selectedRoles.size === 0
                    ? `All Roles (${members.length})`
                    : selectedRoles.size === 1
                    ? (() => {
                        const rKey = Array.from(selectedRoles)[0];
                        if (rKey === 'UNASSIGNED') return 'Member (Unassigned)';
                        const match =
                          reusableRoles.find((r) => r.key.toLowerCase() === rKey.toLowerCase()) ||
                          projectOnlyRoles.find((r) => r.key.toLowerCase() === rKey.toLowerCase()) ||
                          standardRoles.find((r) => r.key.toLowerCase() === rKey.toLowerCase());
                        return match?.label || PROJECT_ROLE_LABELS[rKey] || rKey;
                      })()
                    : `${selectedRoles.size} Roles Selected`}
                </span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 ml-1 transition-transform duration-200 ${isFilterOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Popover */}
            {isFilterOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-72 rounded-xl bg-white border border-slate-200 shadow-xl p-2.5 z-50 text-slate-800 animate-in fade-in slide-in-from-top-1 duration-150">
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
                      {selectedRoles.size === allRoleKeys.length && !isCustomMode ? 'Deselect All' : 'Select All'}
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

                <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                  {/* Organization Reusable Roles */}
                  {reusableRoles.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold text-purple-700 uppercase tracking-wider px-2 py-0.5 bg-purple-50 rounded-md mb-1 flex items-center justify-between">
                        <span>Organization Roles</span>
                        <span className="text-[9px] font-semibold px-1 rounded bg-purple-100 text-purple-700 border border-purple-200">
                          Reusable
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        {reusableRoles.map((role) => {
                          const count = getRoleMemberCount(role.key);
                          const isChecked = !isCustomMode && (selectedRoles.has(role.key) || Array.from(selectedRoles).some((s) => s.toLowerCase() === role.key.toLowerCase()));
                          return (
                            <label
                              key={role.key}
                              className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors select-none ${
                                isChecked
                                  ? 'bg-purple-50 text-purple-900 font-semibold ring-1 ring-purple-300'
                                  : 'hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleRole(role.key)}
                                  className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer shrink-0"
                                />
                                <span className="truncate">{role.label}</span>
                              </div>
                              <span className={`text-[10px] font-bold ml-1.5 shrink-0 ${count > 0 ? 'text-purple-700 font-semibold' : 'text-slate-400'}`}>
                                ({count})
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Project-Specific Custom Roles */}
                  {projectOnlyRoles.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider px-2 py-0.5 bg-slate-100 rounded-md mb-1 flex items-center justify-between">
                        <span>Project Roles</span>
                        <span className="text-[9px] font-semibold px-1 rounded bg-slate-200 text-slate-600">
                          Project-Only
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        {projectOnlyRoles.map((role) => {
                          const count = getRoleMemberCount(role.key);
                          const isChecked = !isCustomMode && (selectedRoles.has(role.key) || Array.from(selectedRoles).some((s) => s.toLowerCase() === role.key.toLowerCase()));
                          return (
                            <label
                              key={role.key}
                              className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors select-none ${
                                isChecked
                                  ? 'bg-purple-50 text-purple-900 font-semibold ring-1 ring-purple-300'
                                  : 'hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleRole(role.key)}
                                  className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer shrink-0"
                                />
                                <span className="truncate">{role.label}</span>
                              </div>
                              <span className={`text-[10px] font-bold ml-1.5 shrink-0 ${count > 0 ? 'text-purple-700 font-semibold' : 'text-slate-400'}`}>
                                ({count})
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Standard Roles & Unassigned */}
                  <div>
                    {(reusableRoles.length > 0 || projectOnlyRoles.length > 0) && (
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-0.5 mb-1">
                        Standard Roles
                      </div>
                    )}
                    <div className="space-y-0.5">
                      {/* Unassigned Member */}
                      {(() => {
                        const count = getRoleMemberCount('UNASSIGNED');
                        const isChecked = !isCustomMode && selectedRoles.has('UNASSIGNED');
                        return (
                          <label
                            className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors select-none ${
                              isChecked
                                ? 'bg-purple-50 text-purple-900 font-semibold ring-1 ring-purple-300'
                                : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleRole('UNASSIGNED')}
                                className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer shrink-0"
                              />
                              <span className="truncate">Member (Unassigned)</span>
                            </div>
                            <span className={`text-[10px] font-bold ml-1.5 shrink-0 ${count > 0 ? 'text-purple-700 font-semibold' : 'text-slate-400'}`}>
                              ({count})
                            </span>
                          </label>
                        );
                      })()}

                      {standardRoles.map((role) => {
                        const count = getRoleMemberCount(role.key);
                        const isChecked = !isCustomMode && (selectedRoles.has(role.key) || Array.from(selectedRoles).some((s) => s.toLowerCase() === role.key.toLowerCase()));
                        return (
                          <label
                            key={role.key}
                            className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors select-none ${
                              isChecked
                                ? 'bg-purple-50 text-purple-900 font-semibold ring-1 ring-purple-300'
                                : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleRole(role.key)}
                                className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer shrink-0"
                              />
                              <span className="truncate">{role.label}</span>
                            </div>
                            <span className={`text-[10px] font-bold ml-1.5 shrink-0 ${count > 0 ? 'text-purple-700 font-semibold' : 'text-slate-400'}`}>
                              ({count})
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Manual Member Selection */}
                  <div className="pt-2 mt-2 border-t border-slate-100">
                    <label
                      onClick={() => {
                        setIsCustomMode(true);
                        setSelectedRoles(new Set());
                      }}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors select-none ${
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
                          <span className="font-semibold text-slate-800">Manual Selection</span>
                          <span className="block text-[10px] text-slate-400 font-normal">
                            Pick specific members from list
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
                const matchingRole = projectRoles.find((r) => r.name.toLowerCase() === String(member.project_role || '').toLowerCase());
                const roleLabel = matchingRole?.label || (member.project_role ? (PROJECT_ROLE_LABELS[member.project_role] || member.project_role) : 'Member');
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
                            ? matchingRole?.is_custom
                              ? 'bg-purple-100 text-purple-900 border-purple-300 ring-1 ring-purple-400/20'
                              : 'bg-purple-100 text-purple-800 border-purple-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {roleLabel}
                      </span>

                      {/* Member Actions Three-Dot Menu */}
                      {(canAssignRoles || canRemoveMembers) && (
                        <div className={`relative ${activeMenuMemberId === member.user_id ? 'z-30' : 'z-10'}`}>
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
                                  onClick={(e) => {
                                    triggerBtnRef.current = e.currentTarget;
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

    </div>
  );

  return (
    <>
      {typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent}

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
          fetchProjectRoles();
          if (newRole) {
            setProjectRoles((prev) => {
              const exists = prev.some((r) => r.name.toLowerCase() === newRole.name.toLowerCase());
              return exists ? prev : [...prev, newRole];
            });
          }
          onToast?.({
            type: 'success',
            title: 'Custom Role Created',
            message: `Role "${newRole.name}" created and reflected in all roles.`,
          });
        }}
        onToast={onToast}
      />

      {/* Edit Member Permissions Modal */}
      <EditMemberPermissionsModal
        isOpen={Boolean(editingPermissionsMember)}
        onClose={() => {
          setEditingPermissionsMember(null);
          triggerBtnRef.current?.focus();
        }}
        projectId={projectId}
        member={editingPermissionsMember}
        onSuccess={(updatedMembers) => {
          if (Array.isArray(updatedMembers)) {
            setLocalMembers(updatedMembers);
          }
        }}
        onToast={onToast}
      />
    </>
  );
}
