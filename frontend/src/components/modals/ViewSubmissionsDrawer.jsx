import React, { useState, useEffect } from 'react';
import { X, Users, CheckCircle2 } from 'lucide-react';
import { formsService } from '../../services/forms.service';

export default function ViewSubmissionsDrawer({ formId, onClose }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadSubmissions();
  }, [formId]);

  const loadSubmissions = async () => {
    try {
      const data = await formsService.getSubmissions(formId);
      setSubmissions(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getAnswerValue = (ans) => {
    if (!ans) return <span className="text-slate-400 italic">No answer</span>;
    if (ans.value_boolean !== null) return ans.value_boolean ? 'Yes' : 'No';
    if (ans.value_number !== null) return ans.value_number;
    if (ans.value_array && ans.value_array.length > 0) return ans.value_array.join(', ');
    return ans.value_string || <span className="text-slate-400 italic">No answer</span>;
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-3xl bg-slate-50 shadow-2xl z-50 flex flex-col border-l border-slate-200 animate-slide-left">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Form Submissions</h2>
            <span className="text-xs font-semibold text-slate-500">
              {submissions.length} total response{submissions.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {loading ? (
          <div className="text-center py-10 text-slate-400">Loading submissions...</div>
        ) : submissions.length === 0 ? (
          <div className="text-center py-12 bg-white border border-slate-200 rounded-2xl shadow-sm">
            <h3 className="text-sm font-bold text-slate-700 mb-1">No responses yet</h3>
            <p className="text-xs text-slate-500">Users have not submitted this form yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {submissions.map((sub) => (
              <div key={sub.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-[10px]">
                      {sub.submitter.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-800">{sub.submitter.name}</div>
                      <div className="text-[10px] text-slate-500">{sub.submitter.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                    <CheckCircle2 className="w-3 h-3" />
                    Submitted {new Date(sub.created_at).toLocaleString()}
                  </div>
                </div>
                
                <div className="p-5 space-y-4">
                  {sub.answers.map((ans, i) => (
                    <div key={ans.id} className="text-sm">
                      <div className="font-semibold text-slate-700 mb-1">{i + 1}. {ans.question.text}</div>
                      <div className="text-slate-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                        {getAnswerValue(ans)}
                      </div>
                    </div>
                  ))}
                  {sub.answers.length === 0 && (
                    <div className="text-sm text-slate-400 italic">Submitted with no answers.</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
