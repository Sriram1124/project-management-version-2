import React, { useState } from 'react';
import { X, Building2, CheckCircle2, AlertCircle } from 'lucide-react';
import { organizationService } from '../../../services/organization.service';

export default function CreateOrganizationModal({ isOpen, onClose, onSuccess }) {
  const [organizationName, setOrganizationName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!organizationName.trim()) {
      setError('Organization name is required');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const result = await organizationService.createOrganizationOnly(organizationName.trim());
      setOrganizationName('');
      onSuccess?.(result.organization);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create organization');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Provision Organization</h3>
              <p className="text-[11px] text-slate-500">Create a new platform organization tenant</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="create-org-name" className="block text-xs font-bold text-slate-700 mb-1">
                Organization Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="create-org-name"
                  type="text"
                  required
                  value={organizationName}
                  onChange={(e) => {
                    setOrganizationName(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="e.g. Acme Corporation"
                  className="w-full pl-9 pr-3 py-2.5 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-purple-600 focus:outline-none text-slate-900 placeholder:text-slate-400 transition-colors"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                Managers can be added individually or in bulk after creating the organization.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !organizationName.trim()}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white transition-colors disabled:opacity-50 cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                {isSubmitting ? 'Creating...' : 'Create Organization'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
