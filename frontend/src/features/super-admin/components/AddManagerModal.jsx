import React, { useState } from 'react';
import { X, User, Mail, ShieldAlert, Copy, Check, UserPlus } from 'lucide-react';
import { organizationService } from '../../../services/organization.service';

export default function AddManagerModal({ isOpen, onClose, organization, onSuccess }) {
  const [managerName, setManagerName] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [createdResult, setCreatedResult] = useState(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen || !organization) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const result = await organizationService.addManager(organization.id, {
        managerName,
        managerEmail,
      });
      setCreatedResult(result);
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to provision additional manager');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!createdResult?.manager) return;
    const text = `Organization: ${organization.name}
Manager: ${createdResult.manager.name}
Email: ${createdResult.manager.email}
User Code: ${createdResult.manager.user_code}
Temporary Password: ${createdResult.manager.temporary_password}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {createdResult ? 'Manager Provisioned' : 'Add Co-Manager to Organization'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {organization.name} ({organization.id.slice(0, 8)}...)
              </p>
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
          {createdResult ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <p className="font-bold text-amber-800">Save credentials now!</p>
                  <p className="text-amber-700 mt-0.5">
                    The temporary password is only shown once and is not stored in plaintext anywhere.
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 space-y-2.5 font-mono text-xs">
                <div>
                  <span className="text-slate-400 select-none">Name: </span>
                  <span className="font-semibold text-slate-800">{createdResult.manager.name}</span>
                </div>
                <div>
                  <span className="text-slate-400 select-none">Email: </span>
                  <span className="font-semibold text-purple-700">{createdResult.manager.email}</span>
                </div>
                <div>
                  <span className="text-slate-400 select-none">User Code: </span>
                  <span className="font-semibold text-slate-700">{createdResult.manager.user_code}</span>
                </div>
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-slate-400 select-none">Temp Password: </span>
                    <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                      {createdResult.manager.temporary_password}
                    </span>
                  </div>
                  <button
                    onClick={handleCopyCredentials}
                    className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-sans font-semibold transition-colors cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                        <span>Copy All</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={onClose}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Manager Full Name</label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-purple-600 focus:outline-none text-slate-900 placeholder:text-slate-400 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Manager Work Email</label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={managerEmail}
                    onChange={(e) => setManagerEmail(e.target.value)}
                    placeholder="j.doe@company.com"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-purple-600 focus:outline-none text-slate-900 placeholder:text-slate-400 transition-colors"
                  />
                </div>
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
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  {isSubmitting ? 'Provisioning...' : 'Add Manager'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
