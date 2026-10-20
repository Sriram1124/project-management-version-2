import React, { useState, useMemo } from 'react';
import { 
  Hash, 
  FileText, 
  Clock, 
  CheckCircle2, 
  Sparkles, 
  ShieldCheck, 
  AlertCircle, 
  Send,
  Pin
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { formatFormDeadline } from '../../../services/forms.service';

export default function AssignedFormsTab({
  forms = [],
  onOpenFormModal,
  onToast
}) {
  const { user: authUser } = useAuth();
  const [activeChannel, setActiveChannel] = useState('forms-and-surveys');
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'active' | 'completed'


  const isFormOverdue = (form) => {
    if (!form?.deadline) return false;
    return new Date(form.deadline) < new Date() && form.submission_status !== 'SUBMITTED';
  };

  const activeFormsCount = useMemo(() => {
    return forms.filter((f) => f.submission_status !== 'SUBMITTED').length;
  }, [forms]);

  const completedFormsCount = useMemo(() => {
    return forms.filter((f) => f.submission_status === 'SUBMITTED').length;
  }, [forms]);

  const filteredForms = useMemo(() => {
    return forms.filter((f) => {
      const isSubmitted = f.submission_status === 'SUBMITTED';
      if (filterTab === 'active') {
        return !isSubmitted;
      }
      if (filterTab === 'completed') {
        return isSubmitted;
      }
      return true;
    });
  }, [forms, filterTab]);

  const channelsList = [
    { id: 'forms-and-surveys', name: 'forms-and-surveys', count: forms.length, isPrimary: true },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card flex flex-col md:flex-row h-full min-h-0 min-w-0 w-full overflow-hidden">
      {/* LEFT CHANNEL SIDEBAR */}
      <div className="w-full md:w-56 lg:w-64 border-r border-slate-200/80 bg-slate-50/70 p-3 sm:p-3.5 flex flex-col justify-between shrink-0 h-full overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3.5 pr-0.5">
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                T
              </div>
              <div className="leading-tight">
                <h3 className="text-xs font-bold text-slate-900">Intern Teams</h3>
                <span className="text-[10px] text-slate-400">Cohort Channels</span>
              </div>
            </div>
          </div>

          {/* Channel Groups */}
          <div className="space-y-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 px-1">
                Team Channels
              </div>
              <nav className="space-y-0.5">
                {channelsList.map((ch) => {
                  const isActive = activeChannel === ch.id;
                  return (
                    <button
                      key={ch.id}
                      onClick={() => setActiveChannel(ch.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-purple-100 text-purple-800 font-bold'
                          : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Hash className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-purple-600' : 'text-slate-400'}`} />
                        <span className="truncate">{ch.name}</span>
                      </div>
                      <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                        isActive ? 'bg-purple-200 text-purple-800' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {ch.count}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT MAIN FEED */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col h-full bg-[#FBFBFE] overflow-hidden">
        {/* Channel Header */}
        <div className="h-12 px-3 sm:px-5 border-b border-slate-200 flex items-center justify-between bg-white shrink-0 gap-2">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-purple-50 border border-purple-100 text-purple-700 shrink-0">
              <Hash className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xs sm:text-sm font-bold text-slate-900 truncate">forms-and-surveys</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                  Broadcast Channel
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate hidden sm:block">
                Manager weekly reflection forms, check-ins, and survey requests
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Filter Tabs */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs font-medium text-slate-600">
              <button
                onClick={() => setFilterTab('all')}
                className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md transition-colors cursor-pointer ${
                  filterTab === 'all' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'hover:text-slate-900'
                }`}
              >
                All ({forms.length})
              </button>
              <button
                onClick={() => setFilterTab('active')}
                className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md transition-colors cursor-pointer ${
                  filterTab === 'active' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'hover:text-slate-900'
                }`}
              >
                Active ({activeFormsCount})
              </button>
              <button
                onClick={() => setFilterTab('completed')}
                className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md transition-colors cursor-pointer ${
                  filterTab === 'completed' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'hover:text-slate-900'
                }`}
              >
                Completed ({completedFormsCount})
              </button>
            </div>
          </div>
        </div>

        {/* Channel Posts Feed */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-4 md:p-5 space-y-3.5">
          {/* Welcome Banner */}
          <div className="max-w-4xl mx-auto w-full p-3 rounded-xl bg-purple-50/70 border border-purple-200/80 flex items-center gap-2.5 text-xs text-purple-950">
            <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
            <div className="leading-snug">
              <strong className="font-semibold text-purple-900">Forms Management Channel:</strong> Forms posted here by the Manager are immediately accessible to active cohort members for response submission.
            </div>
          </div>

          {/* Form Stream */}
          <div className="max-w-4xl mx-auto w-full space-y-3.5">
            {filteredForms.map((form) => {
              const isSubmitted = form.submission_status === 'SUBMITTED';
              const isOverdue = isFormOverdue(form);

              const creatorName = form.creator?.name || 'Manager';
              const creatorRole = form.creator?.role || 'Manager';
              const creatorAvatar =
                form.creator?.avatar ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(creatorName)}&background=7C3AED&color=fff`;

              const formattedDate = form.created_at
                ? new Date(form.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : form.postedAt || 'Recently';

              const formattedDeadline = form.deadline
                ? formatFormDeadline(form.deadline)
                : form.dueDate || 'No deadline';

              const category = form.category || 'General Form';
              const targetAudience =
                form.targetAudience ||
                (form.target_roles?.length > 0 ? form.target_roles.join(', ') : 'INTERN');

              const formattedSubmittedDate = form.submitted_at
                ? new Date(form.submitted_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : null;

              return (
                <div
                  key={form.id}
                  className="bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:border-purple-200 transition-all p-3.5 sm:p-4 space-y-2.5"
                >
                  {/* Author row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={creatorAvatar}
                        alt={creatorName}
                        className="w-7 h-7 rounded-full object-cover ring-1 ring-purple-100 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-slate-900 truncate">{creatorName}</span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-50 text-purple-700 border border-purple-100 shrink-0">
                            {creatorRole}
                          </span>
                          {form.pinned && (
                            <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 shrink-0">
                              <Pin className="w-2.5 h-2.5 fill-current" />
                              Pinned
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">Posted {formattedDate}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                          isSubmitted
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : isOverdue
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        {isSubmitted ? 'SUBMITTED' : isOverdue ? 'OVERDUE' : 'ACTIVE'}
                      </span>
                    </div>
                  </div>

                  {/* Embedded Form Card Box */}
                  <div className="p-3 sm:p-3.5 rounded-lg bg-slate-50/80 border border-slate-200/80 space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-1.5 rounded-lg bg-purple-600 text-white shadow-2xs shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-xs sm:text-sm font-bold text-slate-900 break-words line-clamp-2">
                            {form.title}
                          </h3>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                            <span className="font-semibold text-purple-700">{category}</span>
                            <span>•</span>
                            <span className="truncate max-w-[200px]">Target: {targetAudience}</span>
                          </div>
                        </div>
                      </div>

                      <div
                        className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border self-start sm:self-auto shrink-0 ${
                          isOverdue
                            ? 'text-rose-700 bg-rose-50 border-rose-200'
                            : 'text-amber-700 bg-amber-50 border-amber-200'
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        <span>Due: {formattedDeadline}</span>
                      </div>
                    </div>

                    {form.description && (
                      <p className="text-xs text-slate-600 leading-relaxed break-words">
                        {form.description}
                      </p>
                    )}

                    {/* Progress / Submission Status bar */}
                    <div className="pt-2 border-t border-slate-200/60">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
                        <span>Cohort Submissions</span>
                        {isSubmitted ? (
                          <span className="text-emerald-700 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Submitted {formattedSubmittedDate ? `on ${formattedSubmittedDate}` : '(100%)'}
                          </span>
                        ) : (
                          <span className="text-purple-700 font-medium italic">
                            Active for response submission
                          </span>
                        )}
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isSubmitted ? 'bg-emerald-500' : 'bg-purple-600'
                          }`}
                          style={{ width: isSubmitted ? '100%' : '0%' }}
                        />
                      </div>
                    </div>

                    {/* Action Row - Submit Form button */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5">
                      <div className="flex items-center gap-1.5">
                        {isSubmitted ? (
                          <button
                            type="button"
                            onClick={() => onOpenFormModal?.(form)}
                            className="h-7 px-3 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>View My Submission</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onOpenFormModal?.(form)}
                            className="h-7 px-3.5 rounded-md text-xs font-semibold bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                          >
                            <Send className="w-3 h-3" />
                            <span>Submit Form</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1 text-[11px] text-slate-500">
                        {isSubmitted ? (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Response recorded</span>
                          </>
                        ) : isOverdue ? (
                          <>
                            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                            <span>Overdue for submission</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Active for submissions</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredForms.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-md mx-auto my-6 shadow-2xs">
                <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-2.5">
                  <FileText className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">No forms found</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  {filterTab === 'all'
                    ? 'No forms have been published for your cohort yet.'
                    : `No ${filterTab} forms found.`}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
