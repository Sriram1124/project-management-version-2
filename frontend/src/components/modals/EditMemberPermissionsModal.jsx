import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ShieldCheck, Check, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { projectsService } from '../../services/projects.service';

export const NINE_PROJECT_CAPABILITIES = [
  {
    key: 'DOCUMENT_UPLOAD',
    label: 'Upload project PDFs',
    group: 'Documents',
    description: 'Upload and attach project specifications, PDFs, and documentation',
  },
  {
    key: 'ROLE_ASSIGN',
    label: 'Assign project roles',
    group: 'Team & Roles',
    description: 'Assign and change project roles for project members',
  },
  {
    key: 'CYCLE_ACTIVATE',
    label: 'Activate a cycle',
    group: 'Cycles',
    description: 'Start and activate planned project cycles',
  },
  {
    key: 'CYCLE_UPDATE',
    label: 'Edit cycle details',
    group: 'Cycles',
    description: 'Update cycle dates, goals, names, or carry forward items',
  },
  {
    key: 'CYCLE_CREATE',
    label: 'Create a cycle',
    group: 'Cycles',
    description: 'Create new project cycles or sprint iterations',
  },
  {
    key: 'TASK_UPDATE',
    label: 'Edit task details',
    group: 'Tasks',
    description: 'Modify task details, descriptions, priorities, story points, and due dates',
  },
  {
    key: 'TASK_CREATE',
    label: 'Create tasks, issues, stories',
    group: 'Tasks',
    description: 'Create new tasks, stories, bugs, and subtasks within the project',
  },
  {
    key: 'ACTION_ITEM_CREATE',
    label: 'Add Action Items',
    group: 'Action Items',
    description: 'Create and assign action items extracted from project documents',
  },
  {
    key: 'ACTION_ITEM_DELETE',
    label: 'Delete Action Items',
    group: 'Action Items',
    description: 'Remove action items from the project',
  },
];

export default function EditMemberPermissionsModal({
  isOpen,
  onClose,
  projectId,
  member,
  onSuccess,
  onToast,
}) {
  const [selectedPerms, setSelectedPerms] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const memberName = member?.name || member?.user?.name || member?.email || 'Member';
  const memberEmail = member?.email || member?.user?.email || '';
  const currentRole = member?.project_role || member?.role || 'Member';

  // Initialize selected permissions from member's custom permissions if present
  useEffect(() => {
    if (isOpen && member) {
      setError('');
      const perms = new Set();
      const existingList = member.role_details?.permissions || [];
      existingList.forEach((p) => {
        // Map any aliases
        if (p === 'PROJECT_ROLE_ASSIGN') perms.add('ROLE_ASSIGN');
        else if (p === 'SPRINT_ACTIVATE') perms.add('CYCLE_ACTIVATE');
        else if (p === 'SPRINT_UPDATE') perms.add('CYCLE_UPDATE');
        else if (p === 'SPRINT_CREATE') perms.add('CYCLE_CREATE');
        else perms.add(p);
      });
      setSelectedPerms(perms);
    }
  }, [isOpen, member]);

  if (!isOpen || !member) return null;

  const handleToggle = (key) => {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSelectNone = () => {
    setSelectedPerms(new Set());
  };

  const handleSelectAll = () => {
    setSelectedPerms(new Set(NINE_PROJECT_CAPABILITIES.map((c) => c.key)));
  };

  const handleSave = async () => {
    const userId = member.user_id || member.user?.id || member.id;
    if (!userId || !projectId) return;

    try {
      setSaving(true);
      setError('');
      const permsArray = Array.from(selectedPerms);
      const updatedMembers = await projectsService.updateMemberPermissions(
        projectId,
        userId,
        permsArray
      );
      onToast?.(
        permsArray.length === 0
          ? `Reset custom permissions for ${memberName}`
          : `Updated permissions for ${memberName} (${permsArray.length} capabilities assigned)`
      );
      onSuccess?.(updatedMembers);
      onClose();
    } catch (err) {
      console.error('Failed to update member permissions:', err);
      setError(err?.response?.data?.error || err.message || 'Failed to update member permissions');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Edit Member Permissions — {memberName}
              </h3>
              <p className="text-[11px] text-slate-500">
                Role: <span className="font-semibold text-slate-700">{currentRole}</span> · Customize capabilities without creating a new shared role
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Bar (None / All toggles) */}
        <div className="px-6 py-2.5 bg-slate-100/60 border-b border-slate-200/60 flex items-center justify-between text-xs">
          <div className="text-[11px] font-semibold text-slate-600">
            {selectedPerms.size === 0 ? (
              <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                None (Using Base Role Defaults)
              </span>
            ) : (
              <span className="text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 font-bold">
                {selectedPerms.size} of {NINE_PROJECT_CAPABILITIES.length} Capabilities Selected
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectNone}
              className="text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>None (Reset)</span>
            </button>
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-[11px] font-bold text-purple-700 hover:text-purple-900 px-2 py-1 rounded hover:bg-purple-100/60 transition-colors cursor-pointer"
            >
              Select All
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-6 mt-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-start gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Capabilities List */}
        <div className="p-6 overflow-y-auto space-y-2 flex-1">
          {NINE_PROJECT_CAPABILITIES.map((cap) => {
            const isChecked = selectedPerms.has(cap.key);
            return (
              <label
                key={cap.key}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  isChecked
                    ? 'bg-purple-50/50 border-purple-300 ring-1 ring-purple-400/20 shadow-2xs'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => handleToggle(cap.key)}
                  className="mt-0.5 w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900">{cap.label}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                      {cap.group}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    {cap.description}
                  </p>
                </div>
              </label>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {memberEmail}
          </span>
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
              disabled={saving}
              className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Permissions</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

