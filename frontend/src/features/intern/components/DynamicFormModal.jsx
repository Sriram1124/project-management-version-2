import React, { useState, useEffect } from 'react';
import { 
  X, 
  CheckCircle2, 
  Send, 
  Clock, 
  AlertCircle,
  FileCheck,
  Check,
  Loader2,
  FileText,
  UploadCloud
} from 'lucide-react';
import { formsService, formatFormDeadline } from '../services/formsService';

export default function DynamicFormModal({
  form,
  isOpen,
  onClose,
  onSubmitSuccess,
  onToast
}) {
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmittedState, setIsSubmittedState] = useState(false);

  useEffect(() => {
    if (!isOpen || !form) return;

    setErrorMsg('');
    const submitted = form.submission_status === 'SUBMITTED' || (form.submissions && form.submissions.length > 0);
    setIsSubmittedState(Boolean(submitted));

    // Load full form questions if not already present
    const initializeForm = async () => {
      let currentQuestions = form.questions || [];

      if (!currentQuestions.length && form.id) {
        setLoading(true);
        try {
          const fullForm = await formsService.getFormById(form.id);
          if (fullForm?.questions) {
            currentQuestions = fullForm.questions;
          }
        } catch (err) {
          console.error('Failed to fetch full form details:', err);
        } finally {
          setLoading(false);
        }
      }

      setQuestions(currentQuestions);

      // Initialize answers from existing submission or defaults
      const existingAnswers = {};
      const submissionAnswers = form.submissions?.[0]?.answers || [];

      submissionAnswers.forEach((ans) => {
        if (ans.value_array && ans.value_array.length > 0) {
          existingAnswers[ans.question_id] = ans.value_array;
        } else if (ans.value_boolean !== null && ans.value_boolean !== undefined) {
          existingAnswers[ans.question_id] = ans.value_boolean;
        } else if (ans.value_number !== null && ans.value_number !== undefined) {
          existingAnswers[ans.question_id] = ans.value_number;
        } else if (ans.value_string !== null && ans.value_string !== undefined) {
          existingAnswers[ans.question_id] = ans.value_string;
        }
      });

      const initial = {};
      currentQuestions.forEach((q) => {
        if (existingAnswers[q.id] !== undefined) {
          initial[q.id] = existingAnswers[q.id];
        } else if (q.type === 'MULTI_SELECT' || q.type === 'CHECKBOX') {
          initial[q.id] = [];
        } else if (q.type === 'BOOLEAN' || q.type === 'YES_NO') {
          initial[q.id] = null;
        } else {
          initial[q.id] = '';
        }
      });

      setAnswers(initial);
    };

    initializeForm();
  }, [isOpen, form]);

  if (!isOpen || !form) return null;

  const isOverdue = formsService.isOverdue(form);

  const handleInputChange = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleCheckboxToggle = (questionId, option) => {
    setAnswers((prev) => {
      const currentList = Array.isArray(prev[questionId]) ? prev[questionId] : [];
      const exists = currentList.includes(option);
      const nextList = exists
        ? currentList.filter((item) => item !== option)
        : [...currentList, option];
      return { ...prev, [questionId]: nextList };
    });
  };

  const handleFileChange = (questionId, e) => {
    const file = e.target.files?.[0];
    if (file) {
      setFiles((prev) => ({ ...prev, [questionId]: file.name }));
      handleInputChange(questionId, file.name);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (isSubmittedState) {
      setErrorMsg('This form has already been submitted.');
      return;
    }

    // Validate required questions
    for (const q of questions) {
      const isReq = q.is_required !== undefined ? q.is_required : q.required;
      if (isReq) {
        const val = answers[q.id];
        if (
          val === undefined ||
          val === null ||
          val === '' ||
          (Array.isArray(val) && val.length === 0)
        ) {
          setErrorMsg(`Please answer required question: "${q.text || q.label || 'Question'}"`);
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      const formattedAnswers = questions.map((q) => {
        const val = answers[q.id];
        const ans = { question_id: q.id };

        if (q.type === 'NUMBER') {
          ans.value_number = (val !== '' && val !== null && val !== undefined && !Number.isNaN(Number(val)))
            ? Number(val)
            : null;
        } else if (q.type === 'MULTI_SELECT' || q.type === 'CHECKBOX') {
          ans.value_array = Array.isArray(val) ? val : (val ? [val] : []);
        } else if (q.type === 'BOOLEAN' || q.type === 'YES_NO') {
          ans.value_boolean = val === true || val === 'Yes' || val === 'true';
        } else {
          ans.value_string = (val !== undefined && val !== null) ? String(val) : '';
        }

        return ans;
      });

      await formsService.submitForm(form.id, formattedAnswers);
      setIsSubmitting(false);
      setIsSubmittedState(true);
      onToast?.(`Form "${form.title}" submitted successfully!`);
      onSubmitSuccess?.(form.id);
      onClose();
    } catch (err) {
      setIsSubmitting(false);
      setErrorMsg(err.response?.data?.error || err.message || 'Error submitting form');
    }
  };

  // Render question field dynamically based on type
  const renderField = (q) => {
    const value = answers[q.id];
    const isReadOnly = isSubmittedState;

    switch (q.type) {
      case 'SHORT_TEXT':
        return (
          <input
            type="text"
            disabled={isReadOnly}
            placeholder={q.placeholder || 'Type your response here...'}
            value={value || ''}
            onChange={(e) => handleInputChange(q.id, e.target.value)}
            className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 disabled:bg-slate-50 disabled:text-slate-600 transition-colors shadow-2xs"
          />
        );

      case 'LONG_TEXT':
        return (
          <textarea
            rows={3}
            disabled={isReadOnly}
            placeholder={q.placeholder || 'Type your detailed response here...'}
            value={value || ''}
            onChange={(e) => handleInputChange(q.id, e.target.value)}
            className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 disabled:bg-slate-50 disabled:text-slate-600 resize-none transition-colors shadow-2xs"
          />
        );

      case 'NUMBER':
        return (
          <input
            type="number"
            disabled={isReadOnly}
            placeholder="Enter a number..."
            value={value !== undefined && value !== null ? value : ''}
            onChange={(e) => handleInputChange(q.id, e.target.value)}
            className="w-48 px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 disabled:bg-slate-50 disabled:text-slate-600 transition-colors shadow-2xs"
          />
        );

      case 'SINGLE_SELECT':
      case 'DROPDOWN':
      case 'MULTIPLE_CHOICE':
        const optionsList = Array.isArray(q.options) && q.options.length > 0
          ? q.options
          : ['Option 1', 'Option 2'];

        if (optionsList.length > 4) {
          return (
            <select
              disabled={isReadOnly}
              value={value || ''}
              onChange={(e) => handleInputChange(q.id, e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 disabled:bg-slate-50 disabled:text-slate-600 transition-colors shadow-2xs"
            >
              <option value="">-- Select an option --</option>
              {optionsList.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          );
        }

        return (
          <div className="space-y-2 mt-1">
            {optionsList.map((opt) => {
              const isChecked = value === opt;
              return (
                <label
                  key={opt}
                  htmlFor={`q-${q.id}-${opt}`}
                  aria-label={opt}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer text-xs transition-colors ${
                    isChecked
                      ? 'bg-purple-50/80 border-purple-300 text-purple-950 font-bold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  } ${isReadOnly ? 'pointer-events-none opacity-90' : ''}`}
                >
                  <input
                    id={`q-${q.id}-${opt}`}
                    type="radio"
                    name={q.id}
                    disabled={isReadOnly}
                    checked={isChecked}
                    onChange={() => handleInputChange(q.id, opt)}
                    className="w-3.5 h-3.5 text-purple-600 focus:ring-purple-500 cursor-pointer"
                  />
                  <span>{opt}</span>
                </label>
              );
            })}
          </div>
        );

      case 'MULTI_SELECT':
      case 'CHECKBOX':
        const multiOptions = Array.isArray(q.options) && q.options.length > 0
          ? q.options
          : ['Option 1', 'Option 2'];
        const checkedList = Array.isArray(value) ? value : [];

        return (
          <div className="space-y-2 mt-1">
            {multiOptions.map((opt) => {
              const isChecked = checkedList.includes(opt);
              return (
                <label
                  key={opt}
                  htmlFor={`q-${q.id}-${opt}`}
                  aria-label={opt}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer text-xs transition-colors ${
                    isChecked
                      ? 'bg-purple-50/80 border-purple-300 text-purple-950 font-bold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  } ${isReadOnly ? 'pointer-events-none opacity-90' : ''}`}
                >
                  <input
                    id={`q-${q.id}-${opt}`}
                    type="checkbox"
                    disabled={isReadOnly}
                    checked={isChecked}
                    onChange={() => handleCheckboxToggle(q.id, opt)}
                    className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                  />
                  <span>{opt}</span>
                </label>
              );
            })}
          </div>
        );

      case 'BOOLEAN':
      case 'YES_NO':
        return (
          <div className="flex items-center gap-3 mt-1">
            {[
              { label: 'Yes', val: true },
              { label: 'No', val: false }
            ].map(({ label, val }) => {
              const isSelected = value === val || (value === 'Yes' && val === true) || (value === 'No' && val === false);
              return (
                <button
                  key={label}
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => handleInputChange(q.id, val)}
                  className={`px-5 py-2 text-xs font-bold rounded-xl border transition-all ${
                    isSelected
                      ? val
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                        : 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  } ${isReadOnly ? 'pointer-events-none opacity-85' : 'cursor-pointer'}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        );

      case 'DATE':
        return (
          <div className="flex items-center gap-2">
            <input
              type="date"
              disabled={isReadOnly}
              value={value || ''}
              onChange={(e) => handleInputChange(q.id, e.target.value)}
              className="px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:border-purple-600 disabled:bg-slate-50 disabled:text-slate-600 transition-colors shadow-2xs"
            />
          </div>
        );

      case 'FILE_UPLOAD':
        return (
          <div className="mt-1">
            {isReadOnly ? (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2 text-slate-700 text-xs">
                <FileCheck className="w-4 h-4 text-emerald-600" />
                <span>Uploaded Attachment: {value || 'Document Attached'}</span>
              </div>
            ) : (
              <label htmlFor={`file-upload-${q.id}`} aria-label={files[q.id] || 'Upload file'} className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 hover:border-purple-400 rounded-xl cursor-pointer bg-slate-50/50 hover:bg-purple-50/20 transition-all">
                <UploadCloud className="w-6 h-6 text-purple-600 mb-1" />
                <span className="text-xs font-semibold text-slate-700">
                  {files[q.id] || 'Click to select file or drag here'}
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5">
                  PDF, DOCX, PNG, JPG up to 5MB
                </span>
                <input
                  id={`file-upload-${q.id}`}
                  type="file"
                  className="hidden"
                  onChange={(e) => handleFileChange(q.id, e)}
                />
              </label>
            )}
          </div>
        );

      default:
        return (
          <input
            type="text"
            disabled={isReadOnly}
            placeholder="Type your response here..."
            value={value || ''}
            onChange={(e) => handleInputChange(q.id, e.target.value)}
            className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 disabled:bg-slate-50 disabled:text-slate-600 transition-colors shadow-2xs"
          />
        );
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
          if (e.target === e.currentTarget) {
          onClose();
        }
      }
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <div className="min-w-0 pr-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                {form.category || 'Form'}
              </span>
              {isSubmittedState ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  <Check className="w-3 h-3" /> Submitted
                </span>
              ) : isOverdue ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded">
                  <AlertCircle className="w-3 h-3" /> Overdue
                </span>
              ) : (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                  Pending Submission
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-slate-900 mt-1 truncate">
              {form.title}
            </h3>
            {form.deadline && (
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Deadline: {formatFormDeadline(form.deadline)}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {form.description && (
            <div className="p-3.5 bg-purple-50/70 rounded-xl border border-purple-100 text-purple-900 leading-relaxed">
              {form.description}
            </div>
          )}

          {isSubmittedState && (
            <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-medium">
                {form.submitted_at 
                  ? `Submission recorded on ${new Date(form.submitted_at).toLocaleString()}. Answers are locked in read-only mode.`
                  : 'Your submission has been recorded. Answers are locked in read-only mode.'}
              </span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 bg-rose-50 rounded-xl border border-rose-200 text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="font-semibold">{errorMsg}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 text-purple-600 animate-spin" />
              <span>Loading form questions...</span>
            </div>
          ) : questions.length === 0 ? (
            <div className="py-12 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
              <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-700">No Questions Configured</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                The manager has not added questions to this form yet.
              </p>
            </div>
          ) : (
            /* Dynamic Questions List */
            <div className="space-y-4 divide-y divide-slate-100">
              {questions.map((q, idx) => {
                const isReq = q.is_required !== undefined ? q.is_required : q.required;
                const questionText = q.text || q.label || `Question ${idx + 1}`;
                const helpText = q.description || q.helpText;

                return (
                  <div key={q.id || idx} className={idx > 0 ? 'pt-4' : ''}>
                    <span className="block text-xs font-bold text-slate-900 mb-1">
                      {idx + 1}. {questionText}
                      {isReq && <span className="text-rose-500 ml-1">*</span>}
                    </span>
                    {helpText && (
                      <p className="text-[11px] text-slate-400 mb-1.5">{helpText}</p>
                    )}
                    <div className="mt-1.5">{renderField(q)}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer Controls */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
            >
              {isSubmittedState ? 'Close' : 'Cancel'}
            </button>

            {!isSubmittedState && questions.length > 0 && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Submit Form</span>
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
