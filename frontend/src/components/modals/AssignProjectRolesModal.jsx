import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, ShieldCheck, Loader2, Users, AlertCircle, Check } from 'lucide-react';
import { projectsService } from '../../services/projects.service';

export const PROJECT_ROLES = [
  { value: '', label: 'Not Assigned' },
  { value: 'DEVELOPER', label: 'Developer' },
  { value: 'QA_TESTER', label: 'QA Tester' },
  { value: 'TECH_LEAD', label: 'Tech Lead' },
  { value: 'UI_UX_DESIGNER', label: 'UI/UX Designer' },
  { value: 'DEVOPS_ENGINEER', label: 'DevOps Engineer' },
  { value: 'BUSINESS_ANALYST', label: 'Business Analyst' },
  { value: 'PROJECT_COORDINATOR', label: 'Project Coordinator' },
];

export const PROJECT_ROLE_LABELS = {
  DEVELOPER: 'Developer',
  QA_TESTER: 'QA Tester',
  TECH_LEAD: 'Tech Lead',
  UI_UX_DESIGNER: 'UI/UX Designer',
  DEVOPS_ENGINEER: 'DevOps Engineer',
  BUSINESS_ANALYST: 'Business Analyst',
  PROJECT_COORDINATOR: 'Project Coordinator',
};

export default function AssignProjectRolesModal({
  isOpen,
  onClose,
  projectId,
  projectName = '',
  members = [],
  onSuccess,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleMap, setRoleMap] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Sync roleMap whenever modal opens or members change
  useEffect(() => {
    if (isOpen) {
      const initialMap = {};
      members.forEach((m) => {
        const uid = m.user_id || m.user?.id || m.id;
        if (uid) {
          initialMap[uid] = m.project_role || '';
        }
      });
      setRoleMap(initialMap);
      setSearchQuery('');
      setError('');
    }
  }, [isOpen, members]);

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = q ? members.filter((m) => {
      const name = (m.name || m.user?.name || '').toLowerCase();
      const email = (m.email || m.user?.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    }) : [...members];

    return list.sort((a, b) => {
      const aIsLead = (roleMap[a.user_id] || a.project_role || a.role) === 'TECH_LEAD';
      const bIsLead = (roleMap[b.user_id] || b.project_role || b.role) === 'TECH_LEAD';
      if (aIsLead && !bIsLead) return -1;
      if (!aIsLead && bIsLead) return 1;
      const nameA = a.name || a.user?.name || a.email || '';
      const nameB = b.name || b.user?.name || b.email || '';
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
  }, [members, searchQuery, roleMap]);

  if (!isOpen) return null;

  const handleRoleChange = (userId, newRole) => {
    setRoleMap((prev) => ({
      ...prev,
      [userId]: newRole,
    }));
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!projectId) return;

    setSaving(true);
    setError('');

    try {
      const roleAssignments = members.map((m) => {
        const uid = m.user_id || m.user?.id || m.id;
        const assignedRole = roleMap[uid];
        return {
          user_id: uid,
          project_role: assignedRole && assignedRole.trim() ? assignedRole.trim() : null,
        };
      });

      const updatedMembers = await projectsService.updateMemberRoles(projectId, roleAssignments);
      onSuccess?.(updatedMembers);
      onClose();
    } catch (err) {
      console.error('Failed to update project roles:', err);
      setError(err?.response?.data?.error || err.message || 'Failed to update member roles');
    } finally {
      setSaving(false);
    }
  };

  const modalContent = (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Assign Project Member Roles
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Assign project-specific roles to members of {projectName ? <span className="font-semibold text-slate-700">"{projectName}"</span> : 'this project'}.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search bar inside Role Assignment Panel */}
        <div className="p-4 border-b border-slate-100 bg-white shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search project members by name or email..."
              className="w-full pl-9 pr-9 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-semibold"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium flex items-start gap-2.5 shrink-0">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Members List */}
        <div className="p-5 overflow-y-auto flex-1 divide-y divide-slate-100">
          {members.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-700">No Project Members</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                There are no members assigned to this project yet.
              </p>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="py-10 text-center">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-600">No members match "{searchQuery}"</p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-2 text-xs text-purple-600 font-bold hover:underline"
              >
                Clear search filter
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredMembers.map((member) => {
                const uid = member.user_id || member.user?.id || member.id;
                const mName = member.name || member.user?.name || member.email || 'Member';
                const mEmail = member.email || member.user?.email || '';
                const mAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(mName)}&background=random`;
                const currentRoleValue = roleMap[uid] || '';

                return (
                  <div
                    key={uid}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-50/70 hover:bg-slate-50 border border-slate-200/60 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={mAvatar}
                        alt={mName}
                        className="w-9 h-9 rounded-full object-cover ring-1 ring-slate-200 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {mName}
                        </div>
                        {mEmail && (
                          <div className="text-[11px] text-slate-400 truncate">
                            {mEmail}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <label htmlFor={`role-select-${uid}`} className="sr-only">
                        Project Role for {mName}
                      </label>
                      <select
                        id={`role-select-${uid}`}
                        value={currentRoleValue}
                        onChange={(e) => handleRoleChange(uid, e.target.value)}
                        disabled={saving}
                        className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all cursor-pointer shadow-2xs"
                      >
                        {PROJECT_ROLES.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500 font-medium">
            {members.length} {members.length === 1 ? 'member' : 'members'} in project
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || members.length === 0}
              className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Roles</span>
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

