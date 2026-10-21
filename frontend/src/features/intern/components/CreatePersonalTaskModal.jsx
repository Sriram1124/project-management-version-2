import React, { useState } from 'react';
import { X, Plus, Calendar, AlertCircle } from 'lucide-react';
import { workItemsService } from '../services/workItemsService';

export default function CreatePersonalTaskModal({
  isOpen,
  onClose,
  onTaskCreated,
  onToast
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [storyPoints, setStoryPoints] = useState(1);
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || loading) return;

    const sp = Number(storyPoints);
    if (!storyPoints || Number.isNaN(sp) || !Number.isInteger(sp) || sp <= 0) {
      setError('Story points are mandatory and must be a positive integer greater than 0.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const newTask = await workItemsService.createPersonalTask({
        title: title.trim(),
        description: description.trim(),
        priority,
        story_points: sp,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      });

      onToast?.(`Personal task "${title.trim()}" created!`);
      onTaskCreated?.(newTask);
      setTitle('');
      setDescription('');
      setDueDate('');
      setStoryPoints(1);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create personal task');
      onToast?.(err.message || 'Failed to create personal task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          (e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }
        }
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col"
      >
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
              Personal Task (project_id: null)
            </span>
            <h3 className="text-sm font-bold text-slate-900 mt-1">
              Add Personal Learning Goal or Task
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="personal-task-title" className="block text-[11px] font-bold text-slate-700 mb-1">
              Task Title *
            </label>
            <input
              id="personal-task-title"
              type="text"
              required
              placeholder="e.g. Complete Docker for Developers course"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-purple-600"
            />
          </div>

          <div>
            <label htmlFor="personal-task-desc" className="block text-[11px] font-bold text-slate-700 mb-1">
              Description / Notes
            </label>
            <textarea
              id="personal-task-desc"
              rows={3}
              placeholder="What will you learn or produce? What are the key deliverables?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-purple-600 resize-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="personal-task-priority" className="block text-[11px] font-bold text-slate-700 mb-1">
                Priority
              </label>
              <select
                id="personal-task-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-purple-600"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>

            <div>
              <label htmlFor="personal-task-sp" className="block text-[11px] font-bold text-slate-700 mb-1">
                Story Points *
              </label>
              <input
                id="personal-task-sp"
                type="number"
                min="1"
                max="99"
                step="1"
                required
                value={storyPoints}
                onChange={(e) => setStoryPoints(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 font-mono focus:outline-none focus:border-purple-600"
              />
            </div>

            <div>
              <label htmlFor="personal-task-due" className="block text-[11px] font-bold text-slate-700 mb-1">
                Target Due Date
              </label>
              <input
                id="personal-task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-purple-600"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Task</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
