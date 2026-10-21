import React, { useState } from 'react';
import { 
  Hash, 
  Plus, 
  Send, 
  Users, 
  Bell, 
  FileText, 
  Clock, 
  CheckCircle2, 
  Pin, 
  Paperclip, 
  Smile, 
  Search, 
  Filter, 
  MessageSquare, 
  Sparkles,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
  Download,
  AlertTriangle,
  RotateCcw,
  X,
  Loader2
} from 'lucide-react';
import PostFormModal from './PostFormModal';
import FillFormModal from './FillFormModal';
import ViewSubmissionsModal from './ViewSubmissionsModal';
import { formsService, formatFormDeadline } from '../../services/forms.service';
import CreateFormModal from '../modals/CreateFormModal';
import FormBuilderDrawer from '../modals/FormBuilderDrawer';
import ViewSubmissionsDrawer from '../modals/ViewSubmissionsDrawer';

export default function TeamsChannelView({ 
  onPostForm, 
  onSubmitResponse, 
  onToast,
  selectedCohort,
  selectedCohortId,
  cohorts
}) {
  const [activeChannel, setActiveChannel] = useState('forms-and-surveys');
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'active' | 'completed'
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  
  const [forms, setForms] = useState([]);
  const formsReqSeq = React.useRef(0);
  const [selectedFormForView, setSelectedFormForView] = useState(null);
  const [selectedFormBuilder, setSelectedFormBuilder] = useState(null);
  const [selectedFormForEdit, setSelectedFormForEdit] = useState(null);
  const [chatMessage, setChatMessage] = useState('');
  const [revertingForm, setRevertingForm] = useState(null);
  const [isReverting, setIsReverting] = useState(false);

  // Overdue report & statistics state
  const [overdueStats, setOverdueStats] = useState({
    totalOverdueCount: 0,
    overdueMembersCount: 0,
    formsCount: 0,
    cohortScopeName: 'All Cohorts',
    details: [],
    summary: [],
  });
  const [isDownloadingOverdue, setIsDownloadingOverdue] = useState(false);

  const loadOverdueStats = async () => {
    try {
      const data = await formsService.getOverdueSummary(selectedCohortId);
      if (data) {
        setOverdueStats({
          totalOverdueCount: data.totalOverdueCount ?? 0,
          overdueMembersCount: data.overdueMembersCount ?? 0,
          formsCount: data.formsCount ?? 0,
          cohortScopeName: data.cohortScopeName || (selectedCohort?.name || 'All Cohorts'),
          details: data.details || [],
          summary: data.summary || [],
        });
      }
    } catch (err) {
      console.error('Failed to load overdue statistics:', err);
    }
  };

  const loadForms = async () => {
    const seq = ++formsReqSeq.current;
    try {
      const data = await formsService.getForms(selectedCohortId);
      if (seq !== formsReqSeq.current) return;
      setForms(data);
      await loadOverdueStats();
    } catch (e) {
      console.error('Failed to load forms');
    }
  };

  React.useEffect(() => {
    void loadForms();
  }, [selectedCohortId]);

  const handleDownloadOverdueReport = async () => {
    if (overdueStats.overdueMembersCount === 0) {
      onToast?.(`No members have overdue form submissions for ${selectedCohort?.name || 'the current cohort'}`);
      return;
    }

    setIsDownloadingOverdue(true);
    try {
      const filename = 'overdue_forms.xlsx';
      await formsService.downloadOverdueReport(selectedCohortId, filename);
      onToast?.(`Downloaded overdue members report (${overdueStats.overdueMembersCount} member${overdueStats.overdueMembersCount === 1 ? '' : 's'})`);
    } catch (err) {
      console.error('Download failed:', err);
      onToast?.(err.message || 'Failed to download overdue members report');
    } finally {
      setIsDownloadingOverdue(false);
    }
  };

  const handleDownloadFormOverdue = async (form, count) => {
    if (!form.deadline) {
      onToast?.(`"${form.title}" has no deadline set. Set a deadline to track overdue members.`);
      return;
    }
    const isPast = new Date(form.deadline) < new Date();
    if (!isPast) {
      const formattedDue = formatFormDeadline(form.deadline);
      onToast?.(`"${form.title}" deadline has not passed yet (Due ${formattedDue}).`);
      return;
    }
    if (count === 0) {
      onToast?.(`All eligible members have submitted "${form.title}". No overdue submissions.`);
      return;
    }

    try {
      const filename = 'overdue_forms.xlsx';
      await formsService.downloadOverdueReport(selectedCohortId, filename, form.id);
      onToast?.(`Downloaded overdue report for "${form.title}" (${count} member${count === 1 ? '' : 's'})`);
    } catch (err) {
      console.error('Download failed:', err);
      onToast?.(err.message || `Failed to download overdue report for "${form.title}"`);
    }
  };

  const channelsList = [
    { id: 'forms-and-surveys', name: 'forms-and-surveys', count: forms.length, isPrimary: true },
  ];

  const filteredForms = forms.filter((f) => {
    if (filterTab === 'active') return f.status === 'PUBLISHED';
    if (filterTab === 'completed') return f.status === 'ARCHIVED';
    return true;
  });

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    onToast?.(`Message posted to #${activeChannel}`);
    setChatMessage('');
  };

  const handleRevertForm = async () => {
    return handleConfirmRevert();
  };
  const handleConfirmRevert = async () => {
    if (!revertingForm) return;
    try {
      setIsReverting(true);
      await formsService.revertForm(revertingForm.id);
      onToast?.(`Form "${revertingForm.title}" reverted to draft successfully.`);
      setRevertingForm(null);
      await loadForms();
    } catch (err) {
      onToast?.(err.message || 'Failed to revert form');
    } finally {
      setIsReverting(false);
    }
  };

  const handleRemindPending = (form) => {
    onToast?.(`Sent submission reminder ping for "${form.title}" to pending interns`);
  };

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
            <button
              onClick={() => setIsPostModalOpen(true)}
              className="p-1 rounded-md text-purple-600 hover:bg-purple-100 transition-colors cursor-pointer"
              title="Post New Form"
            >
              <Plus className="w-4 h-4" />
            </button>
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

        {/* Quick Post Button */}
        <div className="pt-2.5 border-t border-slate-200/60 shrink-0">
          <button
            onClick={() => setIsPostModalOpen(true)}
            className="w-full h-8 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Post Form for Cohort</span>
          </button>
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
                Active
              </button>
              <button
                onClick={() => setFilterTab('completed')}
                className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md transition-colors cursor-pointer ${
                  filterTab === 'completed' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'hover:text-slate-900'
                }`}
              >
                Completed
              </button>
            </div>

            {/* Post New Form Button */}
            <button
              onClick={() => setIsPostModalOpen(true)}
              className="h-7 px-2 sm:px-2.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Post New Form</span>
              <span className="sm:hidden">Post</span>
            </button>
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
              const submissionsCount = form._count?.submissions ?? form.submissions?.length ?? 0;
              const totalTarget = form.totalTarget ?? form.total_target ?? 0;
              const completionPercent = totalTarget > 0 ? Math.min(100, Math.round((submissionsCount / totalTarget) * 100)) : 0;

              const creatorName = form.creator?.name || 'Manager';
              const creatorRole = form.creator?.role || 'Manager';
              const creatorAvatar = form.creator?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(creatorName)}&background=7C3AED&color=fff`;

              const formattedDate = form.created_at
                ? new Date(form.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : form.postedAt || 'Recently';

              const formattedDeadline = form.deadline
                ? formatFormDeadline(form.deadline)
                : form.dueDate || 'No deadline';

              const category = form.category || 'General Form';
              let targetAudience = form.targetAudience;
              if (!targetAudience) {
                const roles = form.target_roles || [];
                const cohortTags = roles
                  .filter((r) => r.startsWith('COHORT:'))
                  .map((r) => r.replace('COHORT:', ''));
                if (roles.includes('ALL_COHORTS') || cohortTags.length === 0) {
                  targetAudience = 'All Cohorts';
                } else {
                  const names = cohortTags.map((cid) => {
                    const c = (cohorts || []).find((ch) => ch.id === cid);
                    return c?.name || c?.code || cid;
                  });
                  targetAudience = names.join(', ');
                }
              }

              const overdueForThisForm = (overdueStats.details || []).filter((d) => d.formId === form.id);
              const isFormPastDeadline = Boolean(form.deadline && new Date(form.deadline) < new Date());

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
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                        form.status === 'PUBLISHED' || form.status === 'Active'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                          : form.status === 'DRAFT'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>
                        {form.status === 'PUBLISHED' ? 'Active' : form.status}
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

                      <div className="flex items-center gap-1 text-[11px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 self-start sm:self-auto shrink-0">
                        <Clock className="w-3 h-3" />
                        <span>Due: {formattedDeadline}</span>
                      </div>
                    </div>

                    {form.description && (
                      <p className="text-xs text-slate-600 leading-relaxed break-words">
                        {form.description}
                      </p>
                    )}

                    {/* Submission Progress bar */}
                    <div className="pt-2 border-t border-slate-200/60">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
                        <span>Cohort Submissions</span>
                        {totalTarget > 0 ? (
                          <span className="text-purple-700 font-bold">
                            {submissionsCount} / {totalTarget} Submitted{' '}
                            <span className="text-slate-500 font-normal">({completionPercent}%)</span>
                          </span>
                        ) : submissionsCount > 0 ? (
                          <span className="text-purple-700 font-bold">
                            {submissionsCount} {submissionsCount === 1 ? 'submission' : 'submissions'}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-medium italic">No submissions yet (0%)</span>
                        )}
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            completionPercent >= 100 ? 'bg-emerald-500' : 'bg-purple-600'
                          }`}
                          style={{ width: `${completionPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Action Buttons for Everyone */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {form.status === 'DRAFT' && (
                          <>
                            <button
                              onClick={() => setSelectedFormForEdit(form)}
                              className="h-7 px-2.5 rounded-md text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                            >
                              <span>Edit Form</span>
                            </button>
                            <button
                              onClick={() => setSelectedFormBuilder(form)}
                              className="h-7 px-2.5 rounded-md text-xs font-semibold bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                            >
                              <FileText className="w-3 h-3" />
                              <span>Build Form</span>
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  await formsService.publishForm(form.id);
                                  onToast?.('Form published successfully');
                                  await loadForms();
                                } catch (e) {
                                  onToast?.('Failed to publish form');
                                }
                              }}
                              className="h-7 px-2.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                            >
                              <span>Publish Form</span>
                            </button>
                          </>
                        )}

                        {form.status !== 'DRAFT' && (
                          <>
                            {form.status === 'PUBLISHED' && (
                              <button
                                onClick={() => setRevertingForm(form)}
                                className="h-7 px-2.5 rounded-md text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                                title={`Revert "${form.title}" to draft so interns cannot view or submit it`}
                              >
                                <RotateCcw className="w-3 h-3 text-amber-600" />
                                <span>Revert Form</span>
                              </button>
                            )}
                            <button
                              onClick={() => setSelectedFormForView(form)}
                              className="h-7 px-2.5 rounded-md text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                            >
                              <Users className="w-3 h-3 text-purple-600" />
                              <span>View Submissions ({submissionsCount})</span>
                            </button>
                            <button
                              onClick={() => void handleDownloadFormOverdue(form, overdueForThisForm.length)}
                              className={`h-7 px-2.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer border ${
                                overdueForThisForm.length > 0
                                  ? 'border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-700'
                                  : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
                              }`}
                              title={
                                !form.deadline
                                  ? `No deadline set for "${form.title}"`
                                  : !isFormPastDeadline
                                  ? `Deadline is ${formattedDeadline} (not overdue yet)`
                                  : overdueForThisForm.length > 0
                                  ? `Download report of ${overdueForThisForm.length} overdue member(s)`
                                  : `All eligible members have submitted "${form.title}"`
                              }
                            >
                              <Download className={`w-3 h-3 ${overdueForThisForm.length > 0 ? 'text-purple-600' : 'text-slate-400'}`} />
                              <span>Overdue ({overdueForThisForm.length})</span>
                            </button>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-1 text-[11px] text-slate-500">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{form.status === 'PUBLISHED' ? 'Active for submissions' : form.status === 'DRAFT' ? 'Draft (manager only)' : 'Archived'}</span>
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
                    ? 'No forms have been created yet. Post a form for your cohort to get started.'
                    : `No ${filterTab} forms found.`}
                </p>
                <button
                  onClick={() => setIsPostModalOpen(true)}
                  className="mt-3.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Post Form</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Channel Chat / Message Input Footer */}
        <div className="p-2.5 sm:p-3 border-t border-slate-200 bg-white shrink-0">
          <form onSubmit={handleSendMessage} className="flex items-center gap-2 max-w-4xl mx-auto w-full">
            <button
              type="button"
              onClick={() => setIsPostModalOpen(true)}
              className="h-8 px-2.5 rounded-lg text-purple-700 hover:bg-purple-50 border border-purple-200 flex items-center gap-1.5 text-xs font-semibold transition-colors shrink-0 cursor-pointer shadow-2xs"
              title="Post a Form to this channel"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Attach Form</span>
            </button>
            <div className="relative flex-1 min-w-0">
              <input
                type="text"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Type a message or announcement to #forms-and-surveys..."
                className="w-full h-8 px-3.5 border border-slate-300 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600 bg-white shadow-2xs"
              />
            </div>
            <button
              type="submit"
              disabled={!chatMessage.trim()}
              className="h-8 w-8 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors shrink-0 flex items-center justify-center cursor-pointer shadow-2xs"
              title="Send message"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>

      {/* Revert Form Confirmation Modal */}
      {revertingForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isReverting) {
              setRevertingForm(null);
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

      {/* Modals */}
      {isPostModalOpen && (
        <CreateFormModal
          cohorts={cohorts}
          onClose={() => setIsPostModalOpen(false)}
          onSuccess={() => {
            setIsPostModalOpen(false);
            void loadForms();
            onToast?.('New form created successfully.');
          }}
        />
      )}

      {selectedFormForEdit && (
        <CreateFormModal
          cohorts={cohorts}
          form={selectedFormForEdit}
          onClose={() => setSelectedFormForEdit(null)}
          onSuccess={() => {
            setSelectedFormForEdit(null);
            void loadForms();
            onToast?.('Form updated successfully.');
          }}
        />
      )}

      {selectedFormBuilder && (
        <FormBuilderDrawer
          form={selectedFormBuilder}
          onClose={() => setSelectedFormBuilder(null)}
          onUpdate={loadForms}
        />
      )}

      {selectedFormForView && (
        <ViewSubmissionsDrawer
          formId={selectedFormForView.id}
          onClose={() => setSelectedFormForView(null)}
        />
      )}
    </div>
  );
}

