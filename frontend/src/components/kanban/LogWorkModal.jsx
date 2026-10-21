import React, { useState } from 'react';
import { X, Clock, Plus, Check } from 'lucide-react';

export default function LogWorkModal({
  isOpen,
  onClose,
  tasks = [],
  onSaveLog,
}) {
  const [hours, setHours] = useState('2');
  const [minutes, setMinutes] = useState('30');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedTaskId, setSelectedTaskId] = useState(tasks[0]?.id || '');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const formattedTime = `${hours || 0}h ${minutes || 0}m`;
    onSaveLog?.({
      timeSpent: formattedTime,
      hours: Number(hours) || 0,
      minutes: Number(minutes) || 0,
      description: description.trim(),
      date,
      taskId: selectedTaskId,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-purple-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Log Work Time</h3>
              <p className="text-xs text-slate-400">Record engineering hours to Sprint 05</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Time Spent (Hours & Minutes) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Time Spent *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="24"
                  required
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:border-purple-500 shadow-2xs"
                />
                <span className="text-xs font-semibold text-slate-500">Hours</span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:border-purple-500 shadow-2xs"
                />
                <span className="text-xs font-semibold text-slate-500">Mins</span>
              </div>
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:border-purple-500 shadow-2xs"
            />
          </div>

          {/* Linked Task */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Linked Task (Optional)
            </label>
            <select
              value={selectedTaskId}
              onChange={(e) => setSelectedTaskId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-purple-500 shadow-2xs"
            >
              <option value="">General Sprint Activities</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id}: {t.title}
                </option>
              ))}
            </select>
          </div>

          {/* Work Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Work Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you work on during this period?"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:border-purple-500 resize-none shadow-2xs"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[#7C3AED] hover:bg-[#6D28D9] rounded-xl shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Time</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

