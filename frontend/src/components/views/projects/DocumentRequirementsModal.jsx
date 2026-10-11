import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  FileText, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  HelpCircle, 
  RefreshCw, 
  Loader2, 
  Download, 
  Edit3, 
  Save, 
  Sparkles,
  Layers,
  ChevronRight
} from 'lucide-react';
import { projectsService } from '../../../services/projects.service';

const STATUS_OPTIONS = [
  { id: 'PENDING', label: 'Pending', badgeClass: 'bg-slate-100 text-slate-700 border-slate-300' },
  { id: 'IN_PROGRESS', label: 'In Progress', badgeClass: 'bg-purple-100 text-purple-700 border-purple-300' },
  { id: 'COMPLETED', label: 'Completed', badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  { id: 'BLOCKED', label: 'Blocked', badgeClass: 'bg-rose-100 text-rose-700 border-rose-300' },
];

export default function DocumentRequirementsModal({
  isOpen,
  onClose,
  document,
  projectId,
  onRequirementUpdated,
  onToast,
}) {
  if (!isOpen || !document) return null;

  const [requirements, setRequirements] = useState(document.requirements || []);
  const [reparsing, setReparsing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editNote, setEditNote] = useState('');
  const [editActivity, setEditActivity] = useState('');
  const [savingId, setSavingId] = useState(null);

  // Sync requirements if document prop changes
  React.useEffect(() => {
    setRequirements(document.requirements || []);
  }, [document]);

  const total = requirements.length;
  const completed = requirements.filter((r) => r.status === 'COMPLETED').length;
  const inProgress = requirements.filter((r) => r.status === 'IN_PROGRESS').length;
  const blocked = requirements.filter((r) => r.status === 'BLOCKED').length;
  const pending = requirements.filter((r) => r.status === 'PENDING').length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const handleStatusChange = async (reqId, newStatus) => {
    setSavingId(reqId);
    try {
      const updated = await projectsService.updateRequirement(projectId, document.id, reqId, {
        status: newStatus,
      });
      setRequirements((prev) =>
        prev.map((r) => (r.id === reqId ? { ...r, ...updated, status: newStatus } : r))
      );
      onRequirementUpdated?.();
      onToast?.(`Requirement updated to ${newStatus.replace('_', ' ')}`);
    } catch (err) {
      onToast?.(err?.message || 'Failed to update requirement');
    } finally {
      setSavingId(null);
    }
  };

  const handleStartEdit = (req) => {
    setEditingId(req.id);
    setEditNote(req.progress_note || '');
    setEditActivity(req.current_activity || '');
  };

  const handleSaveEdit = async (reqId) => {
    setSavingId(reqId);
    try {
      const updated = await projectsService.updateRequirement(projectId, document.id, reqId, {
        progress_note: editNote.trim() || null,
        current_activity: editActivity.trim() || null,
      });
      setRequirements((prev) =>
        prev.map((r) => (r.id === reqId ? { ...r, ...updated } : r))
      );
      setEditingId(null);
      onRequirementUpdated?.();
      onToast?.('Progress activity saved');
    } catch (err) {
      onToast?.(err?.message || 'Failed to save progress activity');
    } finally {
      setSavingId(null);
    }
  };

  const handleReparse = async () => {
    setReparsing(true);
    try {
      const updatedDoc = await projectsService.reparseDocument(projectId, document.id);
      if (updatedDoc?.requirements) {
        setRequirements(updatedDoc.requirements);
      }
      onRequirementUpdated?.();
      onToast?.(`Analysis completed: found ${updatedDoc?.requirements?.length || 0} actionable requirements`);
    } catch (err) {
      onToast?.(err?.message || 'Failed to re-parse document');
    } finally {
      setReparsing(false);
    }
  };

  // Group requirements by section
  const grouped = requirements.reduce((acc, req) => {
    const sec = req.section || 'General Requirements';
    if (!acc[sec]) acc[sec] = [];
    acc[sec].push(req);
    return acc;
  }, {});

  const modalContent = (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-200/60 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 truncate" title={document.name}>
                  {document.name}
                </h3>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200/60">
                  {document.type}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Dynamic Requirement Breakdown & Implementation Verification
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReparse}
              disabled={reparsing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-purple-700 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
              title="Re-run requirement extraction from file"
            >
              {reparsing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span>{reparsing ? 'Analyzing...' : 'Re-parse Requirements'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Stats Bar */}
        <div className="px-6 py-3.5 bg-white border-b border-slate-100 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/60">
            <div className="text-[10px] font-bold uppercase text-slate-400">Total Requirements</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">{total}</div>
          </div>
          <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200/60">
            <div className="text-[10px] font-bold uppercase text-emerald-600">Completed</div>
            <div className="text-lg font-bold text-emerald-700 mt-0.5">{completed} ({pct}%)</div>
          </div>
          <div className="p-2 rounded-xl bg-purple-50 border border-purple-200/60">
            <div className="text-[10px] font-bold uppercase text-purple-600">In Progress</div>
            <div className="text-lg font-bold text-purple-700 mt-0.5">{inProgress}</div>
          </div>
          <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/60">
            <div className="text-[10px] font-bold uppercase text-slate-500">Pending</div>
            <div className="text-lg font-bold text-slate-700 mt-0.5">{pending}</div>
          </div>
          <div className="p-2 rounded-xl bg-rose-50 border border-rose-200/60">
            <div className="text-[10px] font-bold uppercase text-rose-600">Blocked</div>
            <div className="text-lg font-bold text-rose-700 mt-0.5">{blocked}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-100 h-1.5">
          <div
            className="bg-purple-600 h-1.5 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Requirements Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {total === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <HelpCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-700">No Actionable Requirements Extracted</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
                This document either contains no structured requirements or is an unsupported media format. Click "Re-parse Requirements" to re-scan the file.
              </p>
            </div>
          ) : (
            Object.entries(grouped).map(([sectionName, items]) => (
              <div key={sectionName} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-600" />
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    {sectionName}
                  </h4>
                  <span className="text-[10px] text-slate-400 font-semibold bg-slate-100 px-2 py-0.5 rounded-full">
                    {items.length} items
                  </span>
                </div>

                <div className="space-y-2.5">
                  {items.map((req) => {
                    const isEditing = editingId === req.id;
                    const isSaving = savingId === req.id;

                    return (
                      <div
                        key={req.id}
                        className="p-4 rounded-xl border border-slate-200/90 hover:border-purple-300 transition-colors bg-white shadow-2xs space-y-2.5"
                      >
                        {/* Requirement Top Row */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-start gap-2.5 min-w-0">
                            {req.code && (
                              <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-700 border border-slate-200 shrink-0 font-mono">
                                {req.code}
                              </span>
                            )}
                            <h5 className="text-xs font-bold text-slate-900 leading-snug">
                              {req.title}
                            </h5>
                          </div>

                          {/* Status Selector */}
                          <div className="flex items-center gap-2 shrink-0">
                            {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />}
                            <select
                              value={req.status}
                              disabled={isSaving}
                              onChange={(e) => handleStatusChange(req.id, e.target.value)}
                              className={`py-1 px-2.5 text-xs font-semibold rounded-lg border focus:outline-none cursor-pointer ${
                                STATUS_OPTIONS.find((s) => s.id === req.status)?.badgeClass || 'bg-slate-50'
                              }`}
                            >
                              {STATUS_OPTIONS.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Description */}
                        {req.description && req.description !== req.title && (
                          <p className="text-[11px] text-slate-500 leading-relaxed pl-1">
                            {req.description}
                          </p>
                        )}

                        {/* Current Activity & Progress Note */}
                        <div className="pt-2 border-t border-slate-100 flex flex-col gap-1.5 text-xs">
                          {isEditing ? (
                            <div className="space-y-2 bg-slate-50/80 p-3 rounded-lg border border-slate-200">
                              <div>
                                <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                                  Current Activity (What is currently being worked on):
                                </label>
                                <input
                                  type="text"
                                  value={editActivity}
                                  onChange={(e) => setEditActivity(e.target.value)}
                                  placeholder="e.g. Implementing authentication middleware and token validation..."
                                  className="w-full px-2.5 py-1 text-xs rounded border border-slate-300 focus:outline-none focus:border-purple-600 bg-white"
                                />
                              </div>

                              <div>
                                <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                                  Progress Note & Verification Details:
                                </label>
                                <textarea
                                  value={editNote}
                                  onChange={(e) => setEditNote(e.target.value)}
                                  placeholder="e.g. Database schema migrated; unit tests written."
                                  rows={2}
                                  className="w-full px-2.5 py-1 text-xs rounded border border-slate-300 focus:outline-none focus:border-purple-600 bg-white"
                                />
                              </div>

                              <div className="flex items-center justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  className="px-2.5 py-1 rounded text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(req.id)}
                                  disabled={isSaving}
                                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-2xs transition-colors"
                                >
                                  <Save className="w-3 h-3" />
                                  <span>Save Note</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-3 group">
                              <div className="space-y-1 min-w-0">
                                {req.current_activity ? (
                                  <div className="flex items-center gap-1.5 text-purple-700 font-medium">
                                    <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                    <span className="truncate">
                                      <strong>Active:</strong> {req.current_activity}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-slate-400 italic">
                                    No active task logged for this requirement yet.
                                  </div>
                                )}

                                {req.progress_note && (
                                  <div className="text-[11px] text-slate-600 pl-5">
                                    <span className="font-semibold text-slate-700">Note:</span> {req.progress_note}
                                  </div>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => handleStartEdit(req)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold text-slate-500 hover:text-purple-700 hover:bg-purple-50 transition-colors cursor-pointer shrink-0"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>Update Activity</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Requirements are persisted in the Supabase PostgreSQL database.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}

