import React, { useState } from 'react';
import { 
  X, 
  CheckCircle2, 
  Star, 
  Send, 
  Clock, 
  User, 
  AlertCircle 
} from 'lucide-react';
import { formatFormDeadline } from '../../services/forms.service';

export default function FillFormModal({ form, isOpen, onClose, onSubmitResponse }) {
  const [internName, setInternName] = useState('Rohan Patel');
  const [section, setSection] = useState('A1');
  const [answers, setAnswers] = useState({
    q1: 'All sprint tasks completed on schedule. Awaiting PR review from Tech Lead for the auth middleware.',
    q2: 5,
    q3: 'No, on track',
  });
  const [timesheetConfirmed, setTimesheetConfirmed] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen || !form) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      onSubmitResponse({
        formId: form.id,
        internName,
        section,
        rating: answers.q2 || 5,
        blocker: answers.q1 || 'None',
      });
      setSubmitted(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="min-w-0 pr-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
              {form.category}
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-1 truncate">
              {form.title}
            </h3>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
              <span>Posted by {form.author?.name}</span>
              <span>•</span>
              <span className="flex items-center gap-1 text-amber-600 font-semibold">
                <Clock className="w-3 h-3" />
                {form.deadline ? formatFormDeadline(form.deadline) : (form.dueDate || 'No deadline')}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Fields */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs text-slate-700">
          <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-100 text-purple-900 leading-relaxed text-xs">
            {form.description}
          </div>

          {/* Submitter Info */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <label htmlFor="fill-form-intern-name" className="block text-[11px] font-bold text-slate-700 mb-1">Your Name</label>
              <input
                id="fill-form-intern-name"
                type="text"
                value={internName}
                onChange={(e) => setInternName(e.target.value)}
                required
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900"
              />
            </div>
            <div>
              <label htmlFor="fill-form-cohort-section" className="block text-[11px] font-bold text-slate-700 mb-1">Cohort Section</label>
              <select
                id="fill-form-cohort-section"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900"
              >
                {['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'].map((sec) => (
                  <option key={sec} value={sec}>Section {sec}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Render Questions */}
          {form.questions?.map((q, idx) => (
            <div key={q.id} className="space-y-1.5 pt-1">
              {q.type === 'textarea' ? (
                <label htmlFor={`question-${q.id}`} className="block text-xs font-bold text-slate-800">
                  {idx + 1}. {q.label} {q.required && <span className="text-rose-500">*</span>}
                </label>
              ) : (
                <div className="block text-xs font-bold text-slate-800">
                  {idx + 1}. {q.label} {q.required && <span className="text-rose-500">*</span>}
                </div>
              )}

              {q.type === 'textarea' && (
                <textarea
                  id={`question-${q.id}`}
                  rows={3}
                  value={answers[q.id] || ''}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  placeholder={q.placeholder || 'Enter your response...'}
                  required={q.required}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                />
              )}

              {q.type === 'rating' && (
                <div className="flex items-center gap-2 pt-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setAnswers({ ...answers, [q.id]: star })}
                      className={`p-2 rounded-lg border transition-all ${
                        (answers[q.id] || 0) >= star
                          ? 'bg-amber-50 border-amber-300 text-amber-500 font-bold'
                          : 'bg-white border-slate-200 text-slate-300 hover:text-amber-400'
                      }`}
                    >
                      <Star className="w-5 h-5 fill-current" />
                    </button>
                  ))}
                  <span className="text-xs font-semibold text-slate-600 ml-2">
                    {answers[q.id] || 0} / 5 Stars
                  </span>
                </div>
              )}

              {q.type === 'radio' && (
                <div className="space-y-1.5 pt-1">
                  {q.options?.map((opt) => (
                    <label 
                      key={opt}
                      htmlFor={`fill-form-opt-${q.id}-${opt}`}
                      aria-label={opt}
                      className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer text-xs"
                    >
                      <input
                        type="radio"
                        id={`fill-form-opt-${q.id}-${opt}`}
                        name={q.id}
                        value={opt}
                        checked={answers[q.id] === opt}
                        onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                        className="text-purple-600 focus:ring-purple-500"
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Timesheet confirmation checkbox */}
          <div className="pt-2 border-t border-slate-100">
            <label htmlFor="timesheet-confirmed-checkbox" aria-label="I certify that all responses provided in this form are accurate and complete." className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-600">
              <input
                id="timesheet-confirmed-checkbox"
                type="checkbox"
                checked={timesheetConfirmed}
                onChange={(e) => setTimesheetConfirmed(e.target.checked)}
                className="mt-0.5 rounded text-purple-600 focus:ring-purple-500"
              />
              <span>
                I certify that all responses provided in this form are accurate and complete.
              </span>
            </label>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">Section {section} • Intern Hub Portal</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitted}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              {submitted ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Submit Form Response</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

