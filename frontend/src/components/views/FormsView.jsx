import React, { useState, useEffect } from 'react';
import { FileText, Plus, Search, Calendar, Settings, FileEdit, Trash2, CheckCircle, Users } from 'lucide-react';
import { formsService } from '../../services/forms.service';
import CreateFormModal from '../modals/CreateFormModal';
import FormBuilderDrawer from '../modals/FormBuilderDrawer';
import ViewSubmissionsDrawer from '../modals/ViewSubmissionsDrawer';

export default function FormsView({ onToast }) {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedForm, setSelectedForm] = useState(null); // For builder
  const [submissionsForm, setSubmissionsForm] = useState(null); // For viewing submissions

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

  const handleRevert = async (id, title) => {
    try {
      await formsService.revertForm(id);
      onToast?.(`Form "${title}" reverted to draft successfully`);
      loadForms();
    } catch (e) {
      onToast?.('Failed to revert form');
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
                <span className="text-slate-500 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {form.deadline ? new Date(form.deadline).toLocaleDateString() : 'No deadline'}
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
                  onClick={() => handleRevert(form.id, form.title)}
                  className="mt-3 w-full py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs rounded-lg transition-colors border border-amber-200"
                >
                  Revert to Draft
                </button>
              )}
            </div>
          ))}
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
