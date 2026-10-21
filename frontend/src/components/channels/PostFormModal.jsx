import React, { useState } from 'react';
import { 
  X, 
  Send, 
  Calendar, 
  Users, 
  HelpCircle, 
  Plus, 
  Trash2, 
  FileText,
  Clock,
  Sparkles
} from 'lucide-react';

export default function PostFormModal({ isOpen, onClose, onPostForm }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Weekly Reflection');
  const [targetAudience, setTargetAudience] = useState('All Cohorts (48 Interns)');
  const [dueDate, setDueDate] = useState('Friday, 5:00 PM');
  const [questions, setQuestions] = useState([
    {
      id: 'q1',
      label: 'What critical blockers or dependencies did you encounter this sprint?',
      type: 'textarea',
      placeholder: 'Describe any technical blockers or review bottlenecks...',
      required: true,
    },
    {
      id: 'q2',
      label: 'Rate your task velocity and sprint confidence (1-5):',
      type: 'rating',
      required: true,
    },
    {
      id: 'q3',
      label: 'Do you require 1:1 mentorship check-in this week?',
      type: 'radio',
      options: ['No, on track', 'Yes, urgent assistance needed', 'Optional sync requested'],
      required: true,
    },
  ]);

  if (!isOpen) return null;

  const handleAddQuestion = () => {
    const newQ = {
      id: `q-${Date.now()}`,
      label: 'New Question',
      type: 'textarea',
      placeholder: 'Enter response...',
      required: false,
    };
    setQuestions([...questions, newQ]);
  };

  const handleRemoveQuestion = (idx) => {
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newForm = {
      id: `form-${Date.now()}`,
      title: title.trim(),
      description: description.trim() || 'Please review and submit your responses prior to the deadline.',
      category,
      author: {
        name: 'Sarah Mitchell',
        role: 'Program Manager',
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80',
      },
      targetAudience,
      targetSections: targetAudience.includes('All') ? ['All'] : [targetAudience],
      dueDate,
      postedAt: 'Just now',
      pinned: true,
      totalTarget: 48,
      submittedCount: 0,
      status: 'Active',
      questions,
      sampleResponses: [],
    };

    onPostForm(newForm);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-purple-100 text-purple-700">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Post Form to Teams Channel</h3>
              <p className="text-xs text-slate-500">
                Publish a form or survey for all interns and leads to submit
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs text-slate-700">
          {/* Title */}
          <div>
            <label htmlFor="post-form-title" className="block text-xs font-bold text-slate-800 mb-1">
              Form Title <span className="text-rose-500">*</span>
            </label>
            <input
              id="post-form-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Sprint 06 Weekly Self-Reflection & Timesheet Sign-off"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="post-form-instructions" className="block text-xs font-bold text-slate-800 mb-1">
              Instructions / Description
            </label>
            <textarea
              id="post-form-instructions"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief guidance for interns completing this submission..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
            />
          </div>

          {/* Configuration Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="post-form-category" className="block text-xs font-bold text-slate-800 mb-1">Category</label>
              <select
                id="post-form-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 focus:outline-hidden focus:border-purple-600"
              >
                <option value="Weekly Reflection">Weekly Reflection</option>
                <option value="Feedback Survey">Feedback Survey</option>
                <option value="Compliance Checklist">Compliance Checklist</option>
                <option value="Standup Sign-off">Standup Sign-off</option>
              </select>
            </div>

            <div>
              <label htmlFor="post-form-audience" className="block text-xs font-bold text-slate-800 mb-1">Target Audience</label>
              <select
                id="post-form-audience"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 focus:outline-hidden focus:border-purple-600"
              >
                <option value="All Cohorts (48 Interns)">All Cohorts (48 Interns)</option>
                <option value="Section A1 (12 Interns)">Section A1 (12 Interns)</option>
                <option value="Section A2 (12 Interns)">Section A2 (12 Interns)</option>
                <option value="Section B1 (12 Interns)">Section B1 (12 Interns)</option>
                <option value="Section B2 (12 Interns)">Section B2 (12 Interns)</option>
                <option value="Tech Leads Only">Tech Leads Only</option>
              </select>
            </div>

            <div>
              <label htmlFor="post-form-due-date" className="block text-xs font-bold text-slate-800 mb-1">Due Date</label>
              <input
                id="post-form-due-date"
                type="text"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                placeholder="e.g., Friday, 5:00 PM"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:border-purple-600"
              />
            </div>
          </div>

          {/* Form Questions */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-800">Form Questions ({questions.length})</span>
              <button
                type="button"
                onClick={handleAddQuestion}
                className="text-purple-600 hover:text-purple-700 font-semibold text-xs flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Question</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {questions.map((q, idx) => (
                <div key={q.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex items-start gap-2.5">
                  <span className="text-xs font-bold text-purple-700 mt-1">{idx + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={q.label}
                      onChange={(e) => {
                        const updated = [...questions];
                        updated[idx].label = e.target.value;
                        setQuestions(updated);
                      }}
                      className="w-full px-2 py-1 border border-slate-200 rounded text-xs text-slate-800 bg-white"
                    />
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500">
                      <span>Type: <strong className="text-slate-700">{q.type}</strong></span>
                      <span>•</span>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={q.required}
                          onChange={(e) => {
                            const updated = [...questions];
                            updated[idx].required = e.target.checked;
                            setQuestions(updated);
                          }}
                          className="rounded text-purple-600"
                        />
                        <span>Required</span>
                      </label>
                    </div>
                  </div>
                  {questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(idx)}
                      className="text-slate-400 hover:text-rose-600 p-1"
                      title="Remove question"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            <span>Will be broadcasted to #forms-channel immediately</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Post Form to Channel</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

