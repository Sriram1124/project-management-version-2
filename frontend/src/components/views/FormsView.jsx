import React, { useState, useEffect } from 'react';
import { FileText, Plus, Search, Calendar, Settings, FileEdit, Trash2, CheckCircle, Users, Clock, RotateCcw, X, Loader2 } from 'lucide-react';
import { formsService, formatFormDeadline } from '../../services/forms.service';
import CreateFormModal from '../modals/CreateFormModal';
import FormBuilderDrawer from '../modals/FormBuilderDrawer';
import ViewSubmissionsDrawer from '../modals/ViewSubmissionsDrawer';

export default function FormsView({ onToast }) {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedForm, setSelectedForm] = useState(null); // For builder
  const [submissionsForm, setSubmissionsForm] = useState(null); // For viewing submissions
  const [revertingForm, setRevertingForm] = useState(null);
  const [isReverting, setIsReverting] = useState(false);

  const loadForms = async () => {
    try {
      setLoading(true);
      const data = await formsService.getForms();
      setForms(data);
    } catch (err) {
      onToast?.('Failed to load forms');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadForms();
  }, []);

  const handlePublish = async (id) => {
    try {
      await formsService.publishForm(id);
      onToast?.('Form published successfully');
      loadForms();
    } catch (e) {
      onToast?.('Failed to publish form');
    }
  };

  const handleConfirmRevert = async () => {
    if (!revertingForm) return;
    try {
      setIsReverting(true);
      await formsService.revertForm(revertingForm.id);
      onToast?.(`Form "${revertingForm.title}" reverted to draft successfully`);
      setRevertingForm(null);
      loadForms();
    } catch (e) {
      onToast?.('Failed to revert form');
    } finally {
      setIsReverting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Structured Forms & Submission Tracking</h2>
          <p className="text-xs text-slate-500 mt-0.5">Manage data collection, surveys, and cohort evaluations</p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Form
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-slate-400">Loading forms...</div>
      ) : forms.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-200/80 shadow-card text-center">
          <FileText className="w-10 h-10 text-purple-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Forms Available</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
            Create your first form to start collecting responses from interns or other team members.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {forms.map(form => (
            <div key={form.id} className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col shadow-card hover:border-purple-200 transition-colors">
              <div className="flex justify-between items-start mb-3">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                  form.status === 'PUBLISHED' ? 'text-emerald-700 bg-emerald-50 border-emerald-100' :
                  form.status === 'ARCHIVED' ? 'text-slate-600 bg-slate-50 border-slate-200' :
                  'text-amber-700 bg-amber-50 border-amber-100'
                }`}>
                  {form.status}
                </span>
                
                <div className="flex gap-1">
                  {form.status === 'DRAFT' && (
                    <button onClick={() => setSelectedForm(form)} className="p-1.5 text-slate-400 hover:text-purple-600 rounded bg-slate-50 hover:bg-purple-50">
                      <FileEdit className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {form.status !== 'ARCHIVED' && (
                    <button onClick={() => setSubmissionsForm(form)} className="p-1.5 text-slate-400 hover:text-emerald-600 rounded bg-slate-50 hover:bg-emerald-50" title="View Submissions">
                      <Users className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              
              <h3 className="font-bold text-slate-900 text-sm mb-1">{form.title}</h3>
              <p className="text-xs text-slate-500 line-clamp-2 mb-4 flex-1">
                {form.description || 'No description'}
              </p>
              
              <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-3 mt-auto">
                <span className="text-slate-600 font-medium flex items-center gap-1.5" title={form.deadline ? `Deadline: ${formatFormDeadline(form.deadline)}` : 'No deadline set'}>
                  <Clock className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                  <span className="truncate">{formatFormDeadline(form.deadline)}</span>
                </span>
                <span className="font-semibold text-slate-700">
                  {form._count?.submissions || 0} Responses
                </span>
              </div>
              
              {form.status === 'DRAFT' && (
                <button
                  onClick={() => handlePublish(form.id)}
                  className="mt-3 w-full py-2 bg-slate-50 hover:bg-purple-50 text-purple-700 font-bold text-xs rounded-lg transition-colors border border-purple-100"
                >
                  Publish Form
                </button>
              )}
              {form.status === 'PUBLISHED' && (
                <button
                  onClick={() => setRevertingForm(form)}
                  className="mt-3 w-full py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs rounded-lg transition-colors border border-amber-200"
                >
                  Revert to Draft
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Revert Form Confirmation Modal */}
      {revertingForm && (
        <div
          role="button"
          tabIndex={0}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isReverting) {
              setRevertingForm(null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              (e) => {
            if (e.target === e.currentTarget && !isReverting) {
              setRevertingForm(null);
            }
          }
            }
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Revert Form to Draft</h3>
              </div>
              <button
                type="button"
                onClick={() => !isReverting && setRevertingForm(null)}
                disabled={isReverting}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 mb-6">
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to revert <span className="font-bold text-slate-900">"{revertingForm.title}"</span> to draft?
              </p>
              <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900 space-y-1">
                <p className="font-semibold text-amber-800">What happens when reverted:</p>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800">
                  <li>Interns will no longer be able to see or submit responses to this form.</li>
                  <li>Existing responses and submission history will remain safely preserved.</li>
                  <li>You can edit the form questions and re-publish it at any time.</li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRevertingForm(null)}
                disabled={isReverting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRevert}
                disabled={isReverting}
                className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                {isReverting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Reverting...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Confirm Revert</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {isCreateOpen && (
        <CreateFormModal
          onClose={() => setIsCreateOpen(false)}
          onSuccess={() => {
            setIsCreateOpen(false);
            loadForms();
          }}
        />
      )}

      {selectedForm && (
        <FormBuilderDrawer
          form={selectedForm}
          onClose={() => setSelectedForm(null)}
          onUpdate={loadForms}
        />
      )}

      {submissionsForm && (
        <ViewSubmissionsDrawer
          formId={submissionsForm.id}
          onClose={() => setSubmissionsForm(null)}
        />
      )}
    </div>
  );
}
