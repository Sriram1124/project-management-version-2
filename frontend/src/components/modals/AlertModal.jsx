import React, { useState } from 'react';
import { X, Send, Bell, Users, CheckCircle2, AlertCircle } from 'lucide-react';

export default function AlertModal({ isOpen, onClose, onSent }) {
  const [targetGroup, setTargetGroup] = useState('all-pending-overdue');
  const [message, setMessage] = useState('');
  const [sendSuccess, setSendSuccess] = useState(false);

  if (!isOpen) return null;

  const presets = [
    "Reminder: Weekly progress report submission is due by 5:00 PM today.",
    "Notice: Multiple assigned subtasks are flagged as overdue. Please update your status.",
    "Action Required: Unblock ticket opened with IT. Please recheck your credentials.",
    "Schedule Alert: Mandatory Sprint Retrospective meeting tomorrow at 4:00 PM."
  ];

  const handleSend = (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    setSendSuccess(true);
    setTimeout(() => {
      onSent?.(message, targetGroup);
      setSendSuccess(false);
      setMessage('');
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div 
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-purple-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Broadcast Manager Alert</h3>
              <p className="text-xs text-slate-500">Send high-priority operational alert to cohort members</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        {sendSuccess ? (
          <div className="p-8 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center animate-bounce">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-bold text-slate-900">Alert Broadcast Dispatched!</h4>
            <p className="text-xs text-slate-500 max-w-sm">
              Successfully sent instant notification to 11 targeted interns across Section A1, B2, and C1.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSend} className="p-6 space-y-4">
            {/* Target Audience Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Target Recipients
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTargetGroup('all-pending-overdue')}
                  className={`p-3 rounded-xl border text-left text-xs font-medium transition-all ${
                    targetGroup === 'all-pending-overdue'
                      ? 'border-purple-600 bg-purple-50 text-purple-900 ring-1 ring-purple-600'
                      : 'border-slate-200 hover:border-slate-300 text-slate-600'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1.5 text-slate-800">
                    <Users className="w-3.5 h-3.5 text-purple-600" />
                    Pending & Overdue (11)
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    8 pending forms + 3 overdue interns
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetGroup('all-cohort')}
                  className={`p-3 rounded-xl border text-left text-xs font-medium transition-all ${
                    targetGroup === 'all-cohort'
                      ? 'border-purple-600 bg-purple-50 text-purple-900 ring-1 ring-purple-600'
                      : 'border-slate-200 hover:border-slate-300 text-slate-600'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1.5 text-slate-800">
                    <Users className="w-3.5 h-3.5 text-purple-600" />
                    Entire Cohort (48)
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    All active tracks & sections
                  </div>
                </button>
              </div>
            </div>

            {/* Quick Template Presets */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Quick Template
              </label>
              <div className="space-y-1">
                {presets.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setMessage(p)}
                    className="w-full text-left p-2 rounded-lg text-xs text-slate-600 bg-slate-50 hover:bg-purple-50 hover:text-purple-700 border border-slate-100 transition-colors truncate block"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Message Area */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Alert Message
              </label>
              <textarea
                rows={3}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your operational alert broadcast..."
                className="w-full p-3 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 resize-none shadow-inner"
              />
            </div>

            {/* Delivery Info */}
            <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              <AlertCircle className="w-3.5 h-3.5 text-purple-500 shrink-0" />
              <span>Will dispatch in-app push notification & email alert to targeted recipients.</span>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#7C3AED] hover:bg-[#6D28D9] rounded-xl shadow-sm transition-all flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Broadcast Alert</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

