import React, { useState } from 'react';
import { CheckCircle2, Copy, Check, ShieldAlert, KeyRound, User, Mail, Tag, X } from 'lucide-react';

export default function CredentialModal({ isOpen, onClose, data }) {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedPwd, setCopiedPwd] = useState(false);

  if (!isOpen || !data) return null;

  const { user, temporary_password } = data;

  const handleCopyId = async () => {
    if (user?.user_code) {
      try {
        await navigator.clipboard.writeText(user.user_code);
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 2000);
      } catch (err) {
        console.error('Failed to copy user code:', err);
      }
    }
  };

  const handleCopyPwd = async () => {
    if (temporary_password) {
      try {
        await navigator.clipboard.writeText(temporary_password);
        setCopiedPwd(true);
        setTimeout(() => setCopiedPwd(false), 2000);
      } catch (err) {
        console.error('Failed to copy temporary password:', err);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-emerald-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">User Created Successfully</h2>
              <p className="text-xs text-slate-500 mt-0.5">One-time provisioning credentials generated.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Credentials Details */}
        <div className="p-6 space-y-4">
          
          <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs">
            {/* Name */}
            <div className="p-3 flex items-center justify-between">
              <span className="text-slate-500 font-medium">Full Name:</span>
              <span className="text-slate-900 font-bold">{user?.name}</span>
            </div>

            {/* Email */}
            <div className="p-3 flex items-center justify-between">
              <span className="text-slate-500 font-medium">Email Address:</span>
              <span className="text-slate-800 font-mono text-[11px]">{user?.email}</span>
            </div>

            {/* Type */}
            <div className="p-3 flex items-center justify-between">
              <span className="text-slate-500 font-medium">Member Type:</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">
                {user?.type}
              </span>
            </div>

            {/* User ID */}
            <div className="p-3 flex items-center justify-between bg-purple-50/40">
              <div className="flex items-center gap-2">
                <span className="text-slate-600 font-bold">User ID:</span>
                <span className="font-mono font-black text-purple-700 text-sm">{user?.user_code}</span>
              </div>
              <button
                type="button"
                onClick={handleCopyId}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-[11px] font-semibold text-slate-700 flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                {copiedId ? 'Copied' : 'Copy ID'}
              </button>
            </div>

            {/* Temporary Password */}
            <div className="p-3.5 flex items-center justify-between bg-amber-50/50">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
                  Temporary Password
                </span>
                <span className="font-mono font-bold text-amber-950 text-sm tracking-wider">
                  {temporary_password}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyPwd}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                {copiedPwd ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedPwd ? 'Copied' : 'Copy Password'}
              </button>
            </div>
          </div>

          {/* Security Notice */}
          <div className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-xl text-amber-900 text-xs flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-amber-950">Important Security Notice</p>
              <p className="text-[11px] leading-relaxed text-amber-900/90">
                This temporary password will <strong>only be shown right now</strong>. The user must provide this password to sign in and will be immediately required to set a permanent password upon first login.
              </p>
            </div>
          </div>

          {/* Action */}
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-colors"
            >
              Done
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
