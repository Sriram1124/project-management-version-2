import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function CompleteSprintModal({
  isOpen,
  onClose,
  sprint = null,
  upcomingSprints = [],
  completedCount = 0,
  incompleteCount = 0,
  onConfirmComplete,
}) {
  const [selectedTargetId, setSelectedTargetId] = useState('backlog');

  useEffect(() => {
    if (upcomingSprints.length > 0) {
      setSelectedTargetId(upcomingSprints[0].id);
    } else {
      setSelectedTargetId('backlog');
    }
  }, [upcomingSprints, isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    const targetSprintId = selectedTargetId === 'backlog' ? null : selectedTargetId;
    onConfirmComplete?.(targetSprintId);
    onClose();
  };

  const sprintName = sprint?.name || 'Sprint';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Complete {sprintName}</h3>
              <p className="text-xs text-slate-400">Review deliverables and close sprint cycle</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
              <div className="text-2xl font-black text-emerald-600">{completedCount}</div>
              <div className="text-[10px] font-bold uppercase text-emerald-800 mt-0.5">
                Completed Tasks
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
              <div className="text-2xl font-black text-amber-600">{incompleteCount}</div>
              <div className="text-[10px] font-bold uppercase text-amber-800 mt-0.5">
                Open / Incomplete
              </div>
            </div>
          </div>

          {incompleteCount > 0 && (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Move Incomplete Tasks To:
              </label>

              <div className="space-y-2">
                {upcomingSprints.map((us) => (
                  <label
                    key={us.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      selectedTargetId === us.id
                        ? 'border-purple-300 bg-purple-50/40'
                        : 'border-slate-200 hover:border-purple-200 bg-slate-50/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="destination"
                      value={us.id}
                      checked={selectedTargetId === us.id}
                      onChange={() => setSelectedTargetId(us.id)}
                      className="text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-800">{us.name}</div>
                      <div className="text-[11px] text-slate-400">
                        Rollover into planned sprint
                      </div>
                    </div>
                  </label>
                ))}

                <label
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    selectedTargetId === 'backlog'
                      ? 'border-purple-300 bg-purple-50/40'
                      : 'border-slate-200 hover:border-purple-200 bg-slate-50/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="destination"
                    value="backlog"
                    checked={selectedTargetId === 'backlog'}
                    onChange={() => setSelectedTargetId('backlog')}
                    className="text-purple-600 focus:ring-purple-500"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-800">Project Backlog</div>
                    <div className="text-[11px] text-slate-400">
                      Unassigned backlog for future sprint planning
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-500 leading-normal flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <span>
              Completing this sprint will lock burndown metrics and archive the current milestone.
            </span>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Confirm & Complete Sprint</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

