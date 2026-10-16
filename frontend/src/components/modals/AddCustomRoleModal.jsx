import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ShieldPlus,
  Search,
  Check,
  Loader2,
  AlertCircle,
  ShieldAlert,
  FolderKanban,
  CheckSquare,
  FileText,
  Clock,
  Award,
  Bell,
  Users,
  Building,
  Info,
} from 'lucide-react';
import { projectsService } from '../../services/projects.service';

const GROUP_ICONS = {
  Projects: FolderKanban,
  'Tasks & Sprints': CheckSquare,
  Documents: FileText,
  'Forms & Surveys': FileText,
  'Attendance & Tracking': Clock,
  Performance: Award,
  Notifications: Bell,
  'User Management': Users,
  Organization: Building,
};

export default function AddCustomRoleModal({
  isOpen,
  onClose,
  projectId,
  projectName = '',
  onRoleCreated,
  onToast,
}) {
  const [roleName, setRoleName] = useState('');
  const [description, setDescription] = useState('');
  const [permissionsData, setPermissionsData] = useState([]);
  const [selectedPermissions, setSelectedPermissions] = useState(() => new Set());
  const [permSearch, setPermSearch] = useState('');
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Fetch permissions when modal opens
  useEffect(() => {
    if (isOpen) {
      setRoleName('');
      setDescription('');
      setSelectedPermissions(new Set());
      setPermSearch('');
      setError('');
      setLoadingPerms(true);

      projectsService
        .getAvailablePermissions()
        .then((res) => {
          const list = Array.isArray(res)
            ? res
            : res?.permissions || res?.data || [];
          setPermissionsData(list);
          // By default, select standard read permissions
          const defaults = list
            .filter((p) => p.name === 'PROJECT_READ' || p.name === 'TASK_READ')
            .map((p) => p.name);
          setSelectedPermissions(new Set(defaults));
        })
        .catch((err) => {
          console.error('Failed to load permissions registry:', err);
          setError(
            err?.response?.data?.error ||
              err?.message ||
              'Failed to load permissions registry'
          );
        })
        .finally(() => {
          setLoadingPerms(false);
        });
    }
  }, [isOpen]);

  // Group permissions logically
  const groupedPermissions = useMemo(() => {
    const q = permSearch.trim().toLowerCase();
    const groups = {};

    permissionsData.forEach((perm) => {
      const name = (perm.name || '').toLowerCase();
      const label = (perm.label || '').toLowerCase();
      const desc = (perm.description || '').toLowerCase();
      const groupName = perm.group || perm.category || 'General';

      if (q && !name.includes(q) && !label.includes(q) && !desc.includes(q) && !groupName.toLowerCase().includes(q)) {
        return;
      }

      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(perm);
    });

    return groups;
  }, [permissionsData, permSearch]);

  const handleTogglePermission = (permName, isAssignable) => {
    if (!isAssignable) return;
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(permName)) {
        next.delete(permName);
      } else {
        next.add(permName);
      }
      return next;
    });
  };

  const handleToggleGroup = (groupName, permsInGroup) => {
    const assignablePerms = permsInGroup.filter((p) => p.assignable !== false);
    const allSelected = assignablePerms.every((p) => selectedPermissions.has(p.name));

    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        assignablePerms.forEach((p) => next.delete(p.name));
      } else {
        assignablePerms.forEach((p) => next.add(p.name));
      }
      return next;
    });
  };

  const handleSelectAllAssignable = () => {
    const assignable = permissionsData
      .filter((p) => p.assignable !== false)
      .map((p) => p.name);
    setSelectedPermissions(new Set(assignable));
  };

  const handleDeselectAll = () => {
    setSelectedPermissions(new Set());
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (submitting) return;

    const trimmedName = roleName.trim();
    if (!trimmedName) {
      setError('Role name is required.');
      return;
    }

    if (trimmedName.length < 2) {
      setError('Role name must be at least 2 characters long.');
      return;
    }

    if (trimmedName.length > 50) {
      setError('Role name must not exceed 50 characters.');
      return;
    }

    if (selectedPermissions.size === 0) {
      setError('Please select at least one permission for this role.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const newRole = await projectsService.createCustomRole(projectId, {
        name: trimmedName,
        description: description.trim() || undefined,
        permissions: Array.from(selectedPermissions),
      });

      onToast?.({
        type: 'success',
        title: 'Custom Role Created',
        message: `Role "${newRole.name}" has been created with ${selectedPermissions.size} permissions.`,
      });

      onRoleCreated?.(newRole);
      onClose();
    } catch (err) {
      console.error('Failed to create custom role:', err);
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        'Failed to create custom role. Please check your permissions and try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shadow-xs">
              <ShieldPlus className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  Add Custom Role
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200 uppercase tracking-wider">
                  Project Scope
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Define a tailored role and permission set for{' '}
                {projectName ? (
                  <span className="font-semibold text-slate-700">
                    "{projectName}"
                  </span>
                ) : (
                  'this project'
                )}
                .
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium flex items-start gap-2.5 shrink-0">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {/* Role Name */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="custom-role-name"
                className="text-xs font-bold text-slate-700 flex items-center gap-1"
              >
                Role Name <span className="text-rose-500">*</span>
              </label>
              <span className="text-[10px] text-slate-400 font-medium">
                {roleName.length}/50
              </span>
            </div>
            <input
              id="custom-role-name"
              type="text"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              maxLength={50}
              placeholder="e.g. Lead QA Specialist, Security Reviewer, Scrum Master"
              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all font-medium"
              required
              autoFocus
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Must be unique within this project and easy for team members to recognize.
            </p>
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="custom-role-description"
              className="block text-xs font-bold text-slate-700 mb-1.5"
            >
              Description <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              id="custom-role-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={255}
              placeholder="Briefly describe the key responsibilities, deliverables, or team focus for this role..."
              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all font-medium resize-none"
            />
          </div>

          {/* Permissions Section */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  Role Permissions <span className="text-rose-500">*</span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                    {selectedPermissions.size} selected
                  </span>
                </label>
                <p className="text-[11px] text-slate-400">
                  Select capabilities granted to members assigned to this role.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllAssignable}
                  className="text-[11px] font-semibold text-purple-600 hover:text-purple-800 hover:underline cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Permission Search */}
            <div className="relative mb-3">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={permSearch}
                onChange={(e) => setPermSearch(e.target.value)}
                placeholder="Filter permissions by keyword..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all font-medium"
              />
              {permSearch && (
                <button
                  type="button"
                  onClick={() => setPermSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Permission Group Cards */}
            {loadingPerms ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                <span className="text-xs">Loading permissions registry...</span>
              </div>
            ) : Object.keys(groupedPermissions).length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                No permissions matching "{permSearch}"
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(groupedPermissions).map(([groupName, perms]) => {
                  const Icon = GROUP_ICONS[groupName] || Info;
                  const assignablePerms = perms.filter((p) => p.assignable !== false);
                  const selectedInGroup = perms.filter((p) => selectedPermissions.has(p.name)).length;
                  const isAllInGroupSelected =
                    assignablePerms.length > 0 &&
                    assignablePerms.every((p) => selectedPermissions.has(p.name));

                  return (
                    <div
                      key={groupName}
                      className="border border-slate-200/80 rounded-xl bg-slate-50/40 overflow-hidden"
                    >
                      {/* Group Header */}
                      <div className="px-3.5 py-2 bg-slate-100/70 border-b border-slate-200/60 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                          <span className="text-xs font-bold text-slate-800">
                            {groupName}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-400">
                            ({selectedInGroup}/{perms.length})
                          </span>
                        </div>
                        {assignablePerms.length > 0 && (
                          <button
                            type="button"
                            onClick={() => handleToggleGroup(groupName, perms)}
                            className="text-[10px] font-semibold text-purple-600 hover:text-purple-800 cursor-pointer"
                          >
                            {isAllInGroupSelected ? 'Deselect Group' : 'Select Group'}
                          </button>
                        )}
                      </div>

                      {/* Group Permissions List */}
                      <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white">
                        {perms.map((p) => {
                          const isChecked = selectedPermissions.has(p.name);
                          const isAssignable = p.assignable !== false;

                          return (
                            <label
                              key={p.id || p.name}
                              className={`flex items-start gap-2.5 p-2 rounded-lg border text-left cursor-pointer transition-all select-none ${
                                !isAssignable
                                  ? 'bg-slate-50/70 border-slate-200 text-slate-400 opacity-60 cursor-not-allowed'
                                  : isChecked
                                  ? 'bg-purple-50/70 border-purple-200 text-purple-950 font-medium'
                                  : 'bg-white border-slate-200/70 text-slate-700 hover:bg-slate-50/80 hover:border-slate-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={!isAssignable}
                                onChange={() => handleTogglePermission(p.name, isAssignable)}
                                className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer mt-0.5 shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-semibold leading-tight">
                                    {p.label || p.name}
                                  </span>
                                  {p.admin_only && (
                                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                      Admin
                                    </span>
                                  )}
                                </div>
                                {p.description && (
                                  <p className="text-[10px] text-slate-400 mt-0.5 leading-snug line-clamp-2">
                                    {p.description}
                                  </p>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500 font-medium">
            {selectedPermissions.size} {selectedPermissions.size === 1 ? 'permission' : 'permissions'} selected
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !roleName.trim() || selectedPermissions.size === 0}
              className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Creating Role...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Create Role</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
}

