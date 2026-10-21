import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, CheckSquare, Type, List, Hash } from 'lucide-react';
import { formsService } from '../../services/forms.service';

export default function FormBuilderDrawer({ form: initialForm, onClose, onUpdate }) {
  const [form, setForm] = useState(initialForm);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadQuestions();
  }, [initialForm.id]);

  const loadQuestions = async () => {
    try {
      const full = await formsService.getFormById(form.id);
      setQuestions(full.questions || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddQuestion = async (type) => {
    try {
      await formsService.addQuestion(form.id, {
        type,
        text: 'New Question',
        is_required: true,
        options: type === 'SINGLE_SELECT' || type === 'MULTI_SELECT' ? ['Option 1'] : []
      });
      void loadQuestions();
    } catch (e) {
      alert('Failed to add question');
    }
  };

  const handleDelete = async (qId) => {
    try {
      await formsService.deleteQuestion(form.id, qId);
      void loadQuestions();
    } catch (e) {
      alert('Failed to delete question');
    }
  };

  const handleUpdate = async (qId, updates) => {
    try {
      // Optimistic
      setQuestions(prev => prev.map(q => q.id === qId ? { ...q, ...updates } : q));
      await formsService.updateQuestion(form.id, qId, updates);
    } catch (e) {
      void loadQuestions(); // Revert on fail
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200 animate-slide-left">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{form.title}</h2>
          <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">DRAFT BUILDER</span>
        </div>
        <button onClick={() => { onUpdate(); onClose(); }} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {loading ? (
          <div className="text-center py-10 text-slate-400">Loading questions...</div>
        ) : questions.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
            <h3 className="text-sm font-bold text-slate-700 mb-1">No questions yet</h3>
            <p className="text-xs text-slate-500 mb-4">Add questions to start building your form.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {questions.map((q, i) => (
              <div key={q.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative group">
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { void handleDelete(q.id); }} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="pr-8 space-y-3">
                  <input
                    type="text"
                    value={q.text}
                    onChange={(e) => { void handleUpdate(q.id, { text: e.target.value }); }}
                    className="w-full text-sm font-bold text-slate-800 border-none p-0 focus:ring-0 placeholder:text-slate-300"
                    placeholder="Question text"
                  />
                  
                  <div className="flex items-center gap-4">
                    <select
                      value={q.type}
                      onChange={(e) => { void handleUpdate(q.id, { type: e.target.value }); }}
                      className="text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none"
                    >
                      <option value="SHORT_TEXT">Short Text</option>
                      <option value="LONG_TEXT">Long Text</option>
                      <option value="NUMBER">Number</option>
                      <option value="SINGLE_SELECT">Single Select</option>
                      <option value="MULTI_SELECT">Multi Select</option>
                      <option value="BOOLEAN">Yes / No</option>
                      <option value="DATE">Date</option>
                    </select>

                    <label htmlFor={`q-required-${q.id}`} aria-label="Required" className="flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer">
                      <input
                        id={`q-required-${q.id}`}
                        type="checkbox"
                        checked={q.is_required}
                        onChange={(e) => { void handleUpdate(q.id, { is_required: e.target.checked }); }}
                        className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                      />
                      Required
                    </label>
                  </div>

                  {(q.type === 'SINGLE_SELECT' || q.type === 'MULTI_SELECT') && (
                    <div className="pt-2 space-y-2">
                      {(q.options || []).map((opt, oIdx) => (
                        <div key={oIdx} className="flex items-center gap-2">
                          <div className={`w-3 h-3 border border-slate-300 ${q.type === 'MULTI_SELECT' ? 'rounded-sm' : 'rounded-full'}`} />
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => {
                              const newOpts = [...q.options];
                              newOpts[oIdx] = e.target.value;
                              void handleUpdate(q.id, { options: newOpts });
                            }}
                            className="text-sm flex-1 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-purple-500 focus:outline-none px-1 py-0.5"
                          />
                          <button
                            onClick={() => {
                              const newOpts = q.options.filter((_, idx) => idx !== oIdx);
                              void handleUpdate(q.id, { options: newOpts });
                            }}
                            className="p-1 text-slate-400 hover:text-rose-500"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => { void handleUpdate(q.id, { options: [...(q.options||[]), `Option ${(q.options?.length||0)+1}`] }); }}
                        className="text-xs font-semibold text-purple-600 hover:text-purple-700 flex items-center gap-1 mt-1"
                      >
                        <Plus className="w-3 h-3" /> Add Option
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center gap-2 overflow-x-auto">
        <span className="text-xs font-bold text-slate-500 mr-2 whitespace-nowrap">ADD FIELD:</span>
        <button onClick={() => { void handleAddQuestion('SHORT_TEXT'); }} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:border-purple-300 flex items-center gap-1.5 shadow-sm whitespace-nowrap"><Type className="w-3.5 h-3.5 text-purple-500"/> Text</button>
        <button onClick={() => { void handleAddQuestion('LONG_TEXT'); }} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:border-purple-300 flex items-center gap-1.5 shadow-sm whitespace-nowrap"><Type className="w-3.5 h-3.5 text-purple-500"/> Paragraph</button>
        <button onClick={() => { void handleAddQuestion('SINGLE_SELECT'); }} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:border-purple-300 flex items-center gap-1.5 shadow-sm whitespace-nowrap"><List className="w-3.5 h-3.5 text-purple-500"/> Select</button>
        <button onClick={() => { void handleAddQuestion('BOOLEAN'); }} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:border-purple-300 flex items-center gap-1.5 shadow-sm whitespace-nowrap"><CheckSquare className="w-3.5 h-3.5 text-purple-500"/> Yes/No</button>
      </div>
    </div>
  );
}
