import React, { useState, useEffect } from 'react';
import { 
  X, 
  Shield, 
  Check, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  RotateCcw,
  BarChart3,
  FolderKanban,
  Users,
  Clock,
  FileSpreadsheet,
  Lock,
  Sparkles
} from 'lucide-react';
import { usersService } from '../../services/users.service';

const CATEGORY_ICONS = {
  'Dashboard & Analytics': BarChart3,
  'Projects': FolderKanban,
  'Intern Management': Users,
  'Timesheets': Clock,
  'Forms & Action Items': FileSpreadsheet,
  'Organization Settings': Lock,
};

export default function ManagePermissionsModal({
  isOpen,
  user,
  onClose,
  onPermissionsUpdated
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  const [availablePermissions, setAvailablePermissions] = useState([]);
  const [basePermissions, setBasePermissions] = useState([]);
  const [selectedPermissions, setSelectedPermissions] = useState(new Set());
  const [initialGranted, setInitialGranted] = useState(new Set());
  const [activeCategory, setActiveCategory] = useState('ALL');

  useEffect(() => {
    if (isOpen && user?.id) {
      loadPermissions();
    } else {
      setError('');
      setSuccessMsg('');
    }
  }, [isOpen, user?.id]);

  const loadPermissions = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccessMsg('');
      const data = await usersService.getUserPermissions(user.id);
      
      const avail = data.availablePermissions || [];
      const base = data.basePermissions || [];
      const granted = new Set(data.grantedPermissions || []);

      setAvailablePermissions(avail);
      setBasePermissions(base);
      setInitialGranted(granted);
      setSelectedPermissions(new Set(granted));
    } catch (err) {
      console.error('Failed to load permissions:', err);
      setError(err.message || 'Failed to retrieve permissions for this member');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !user) return null;

  const categories = ['ALL', 'Dashboard & Analytics', 'Projects', 'Intern Management', 'Timesheets', 'Forms & Action Items', 'Organization Settings'];

  const filteredPermissions = availablePermissions.filter((perm) => {
    if (activeCategory === 'ALL') return true;
    return perm.category === activeCategory;
  });

  const isAllSelected = availablePermissions.length > 0 && 
    availablePermissions.every((p) => selectedPermissions.has(p.name));

  const handleTogglePermission = (name) => {
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedPermissions(new Set());
    } else {
      setSelectedPermissions(new Set(availablePermissions.map((p) => p.name)));
    }
  };

  const handleResetToInitial = () => {
    setSelectedPermissions(new Set(initialGranted));
  };

  const handleSaveChanges = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccessMsg('');
      const permsArray = Array.from(selectedPermissions);
      const res = await usersService.updateUserPermissions(user.id, permsArray);
      
      setInitialGranted(new Set(permsArray));
      setSuccessMsg(`Permissions updated successfully for ${user.name || user.email}.`);
      onPermissionsUpdated?.(res);
      
      setTimeout(() => {
        setSuccessMsg('');
      }, 3500);
    } catch (err) {
      console.error('Failed to update permissions:', err);
      setError(err.message || 'Failed to save permission changes');
    } finally {
      setSaving(false);
    }
  };

  const hasUnsavedChanges = (() => {
    if (selectedPermissions.size !== initialGranted.size) return true;
    for (const p of selectedPermissions) {
      if (!initialGranted.has(p)) return true;
    }
    return false;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-purple-100 border border-purple-200 text-purple-700 flex items-center justify-center shadow-xs shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  Manage Permissions
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                  {user.role || 'INTERN'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                <span className="font-semibold text-slate-700">{user.name || 'Intern'}</span> • {user.email}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Filters & Quick Controls */}
        <div className="px-5 py-3 border-b border-slate-100 bg-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
            {categories.map((cat) => {
              const count = cat === 'ALL' 
                ? availablePermissions.length 
                : availablePermissions.filter((p) => p.category === cat).length;
              const isSelected = activeCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-purple-100 text-purple-800 shadow-2xs font-bold'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {cat === 'ALL' ? 'All Permissions' : cat}
                  <span className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] ${
                    isSelected ? 'bg-purple-200/70 text-purple-900' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            {hasUnsavedChanges && (
              <button
                type="button"
                onClick={handleResetToInitial}
                className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                title="Reset to saved state"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleToggleSelectAll}
              disabled={loading || availablePermissions.length === 0}
              className="px-2.5 py-1 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              {isAllSelected ? 'Deselect All' : 'Select All'}
            </button>
          </div>
        </div>

        {/* Status / Alert Messages */}
        {error && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {successMsg && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2.5 font-medium animate-in fade-in duration-150">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="flex-1">{successMsg}</div>
          </div>
        )}

        {/* Permissions List Body */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
              <p className="text-xs font-medium text-slate-500">Loading current permission assignments...</p>
            </div>
          ) : (
            <>
              {/* Category: Organization Settings Notice */}
              {activeCategory === 'Organization Settings' && (
                <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-900 text-xs space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5 text-amber-800">
                    <Lock className="w-4 h-4 text-amber-600" />
                    <span>Organization Settings Restricted</span>
                  </div>
                  <p className="text-amber-700 leading-relaxed">
                    Organization-level settings (tenant creation, billing policies, and platform audit logs) are strictly reserved for Super Administrators and cannot be delegated to intern accounts in accordance with security policy.
                  </p>
                </div>
              )}

              {/* Filtered Permission Cards */}
              <div className="grid grid-cols-1 gap-2.5">
                {filteredPermissions.map((perm) => {
                  const isChecked = selectedPermissions.has(perm.name);
                  const Icon = CATEGORY_ICONS[perm.category] || Shield;
                  return (
                    <div
                      key={perm.name}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleTogglePermission(perm.name)}
                      onKeyDown={(e) => {
                        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          handleTogglePermission(perm.name);
                        }
                      }}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5 select-none ${
                        isChecked
                          ? 'bg-purple-50/60 border-purple-300 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}} // handled by div onClick
                        className="mt-0.5 w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-slate-300 shrink-0 cursor-pointer pointer-events-none"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-slate-900">
                            {perm.label}
                          </span>
                          <span className="font-mono text-[10px] px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded border border-slate-200">
                            {perm.name}
                          </span>
                          <span className="text-[10px] font-semibold text-purple-700 bg-purple-100/60 px-1.5 py-0.2 rounded">
                            {perm.category}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                          {perm.description}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {filteredPermissions.length === 0 && activeCategory !== 'Organization Settings' && (
                  <div className="text-center py-10 text-xs text-slate-400">
                    No permissions found in this category.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            <span className="font-bold text-purple-700">{selectedPermissions.size}</span> of {availablePermissions.length} manager permissions selected
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-200/70 border border-slate-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveChanges}
              disabled={saving || loading}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-purple-700 hover:bg-purple-800 shadow-sm transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

