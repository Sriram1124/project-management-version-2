import React from 'react';
import { X, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';

export default function BulkDeleteResultsModal({ isOpen, result, onClose }) {
  if (!isOpen || !result) return null;

  const { deletedCount = 0, failedCount = 0, failures = [], message = '' } = result;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-xs ${
              deletedCount > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {deletedCount > 0 ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Bulk Deletion Report
              </h3>
              <p className="text-[11px] text-slate-500">
                Summary of executed deletion request
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 text-xs">
          {/* Status Metric Badges */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200/80 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-emerald-800 block">Deleted Members</span>
                <span className="text-xs text-emerald-600 font-medium">Permanently removed</span>
              </div>
              <span className="text-xl font-extrabold text-emerald-700">{deletedCount}</span>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/80 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-amber-800 block">Blocked Members</span>
                <span className="text-xs text-amber-600 font-medium">Protected / Retained</span>
              </div>
              <span className="text-xl font-extrabold text-amber-700">{failedCount}</span>
            </div>
          </div>

          {/* Description */}
          <p className="text-slate-600 leading-relaxed font-medium">
            {message}
          </p>

          {/* Detailed Failures / Retention Notice */}
          {failures.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                <span>Protected Records ({failures.length})</span>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-100">
                {failures.map((f, idx) => (
                  <div key={f.id || idx} className={`${idx > 0 ? 'pt-2' : ''} space-y-1 text-[11px]`}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">{f.name || 'Unknown'}</span>
                      {f.email && <span className="font-mono text-[10px] text-slate-400">{f.email}</span>}
                    </div>
                    <p className="text-[10px] text-amber-800 bg-amber-50/80 p-2 rounded-lg border border-amber-200/60 leading-normal">
                      {f.reason}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="pt-3 border-t border-slate-100 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

