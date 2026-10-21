import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Calendar, 
  AlertCircle, 
  Search, 
  Check, 
  X, 
  Loader2, 
  User, 
  ExternalLink, 
  RefreshCw,
  ShieldCheck,
  ChevronRight,
  ArrowRight,
  Info
} from 'lucide-react';
import { projectsService } from '../../../services/projects.service';
import { workItemsService } from '../../../services/workItems.service';
import { useAuth } from '../../../context/AuthContext';
import IssueDetailDrawer from '../../backlog/IssueDetailDrawer';
import { IssueTypeIcon } from '../../backlog/HierarchicalIssueTable';

export default function ProjectApprovalsTab({
  projectId,
  project,
  onToast,
  readOnly = false,
}) {
  const { user: authUser } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('PENDING'); // 'PENDING' | 'APPROVED' | 'REJECTED'
  const [searchQuery, setSearchQuery] = useState('');

  // Confirmation Modal state
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [decisionType, setDecisionType] = useState('APPROVE'); // 'APPROVE' | 'REJECT'
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState('');

  // Selected Issue for Drawer inspection
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [loadingIssue, setLoadingIssue] = useState(false);

  // Authorization check
  const authRole = String(
    authUser?.role?.name || authUser?.role || authUser?.type || authUser?.user_type || ''
  ).toUpperCase();
  const currentUserId = authUser?.id || authUser?.user_id;

  const isTechLead =
    authRole === 'TECH_LEAD' ||
    Boolean(authUser?.is_tech_lead && (authUser?.lead_project_ids?.includes(projectId) || !authUser?.lead_project_ids?.length)) ||
    (project?.members || []).some(
      (m) =>
        (m.user_id === currentUserId || m.id === currentUserId) &&
        (m.project_role === 'TECH_LEAD' || m.role === 'TECH_LEAD')
    );

  const isManagerOrLead =
    authRole === 'MANAGER' ||
    authRole === 'ADMIN' ||
    authRole === 'SUPER_ADMIN' ||
    project?.owner_id === currentUserId ||
    isTechLead;

  const canReview = isManagerOrLead && !readOnly;

  // Fetch all extension requests for the project
  const loadRequests = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await projectsService.getExtensionRequests(projectId);
      setRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load extension requests:', err);
      setError(err?.message || 'Failed to load approval requests');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  // Counts for tabs
  const counts = useMemo(() => {
    const pending = requests.filter((r) => r.status === 'PENDING').length;
    const approved = requests.filter((r) => r.status === 'APPROVED').length;
    const rejected = requests.filter((r) => r.status === 'REJECTED').length;
    return { pending, approved, rejected, total: requests.length };
  }, [requests]);

  // Filtered requests by active tab and search query
  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      if (req.status !== activeFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const taskTitle = req.task?.title?.toLowerCase() || '';
      const taskId = req.task?.id?.toLowerCase() || '';
      const reqName = req.requester?.name?.toLowerCase() || '';
      const reqEmail = req.requester?.email?.toLowerCase() || '';
      const reason = req.reason?.toLowerCase() || '';
      return (
        taskTitle.includes(q) ||
        taskId.includes(q) ||
        reqName.includes(q) ||
        reqEmail.includes(q) ||
        reason.includes(q)
      );
    });
  }, [requests, activeFilter, searchQuery]);

  // Handle open decision confirmation modal
  const handleOpenDecisionModal = (req, type) => {
    setConfirmTarget(req);
    setDecisionType(type);
    setDecisionNote('');
    setDecisionError('');
  };

  // Submit decision
  const handleConfirmDecision = async (e) => {
    e?.preventDefault();
    if (!confirmTarget || !confirmTarget.task?.id) return;
    try {
      setDecisionSubmitting(true);
      setDecisionError('');

      await workItemsService.decideExtension(
        confirmTarget.task.id,
        confirmTarget.id,
        {
          decision: decisionType,
          decision_note: decisionNote.trim() || undefined,
        }
      );

      const actionText = decisionType === 'APPROVE' ? 'approved' : 'rejected';
      onToast?.(`Extension request ${actionText} successfully for "${confirmTarget.task?.title || 'deliverable'}"`);

      // Optimistically update local requests to immediately move item out of Pending
      setRequests((prev) =>
        prev.map((r) =>
          r.id === confirmTarget.id
            ? {
                ...r,
                status: decisionType === 'APPROVE' ? 'APPROVED' : 'REJECTED',
                decision_note: decisionNote.trim() || null,
                reviewed_at: new Date().toISOString(),
                reviewer: {
                  id: authUser?.id,
                  name: authUser?.name || 'You',
                  email: authUser?.email,
                },
              }
            : r
        )
      );

      setConfirmTarget(null);
      // Re-fetch to guarantee complete DB sync
      void loadRequests();
    } catch (err) {
      console.error('Failed to submit decision:', err);
      setDecisionError(err?.message || 'Failed to submit decision. Please try again.');
    } finally {
      setDecisionSubmitting(false);
    }
  };

  // Inspect task in drawer
  const handleInspectTask = async (taskId) => {
    if (!taskId) return;
    try {
      setLoadingIssue(true);
      const item = await workItemsService.getWorkItemById(taskId);
      setSelectedIssue(item);
    } catch (err) {
      console.error('Failed to load task details:', err);
      onToast?.(err?.message || 'Unable to open task details', 'error');
    } finally {
      setLoadingIssue(false);
    }
  };

  // Helper for computing extension days
  const computeExtensionDays = (orig, req) => {
    if (!orig || !req) return null;
    const origMs = new Date(orig).getTime();
    const reqMs = new Date(req).getTime();
    if (Number.isNaN(origMs) || Number.isNaN(reqMs)) return null;
    const diffDays = Math.round((reqMs - origMs) / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="space-y-4">
      {/* 1. UNIFORM HEADER & CONTROLS */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  Project Approvals
                </h2>
                {counts.pending > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    {counts.pending} Action Required
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Review, approve, or reject due-date extensions and scope change requests submitted by project members.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            <button
              type="button"
              onClick={() => { void loadRequests(); }}
              disabled={loading}
              title="Refresh requests"
              className="p-2 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-xl border border-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-purple-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Toolbar: Filter Tabs & Search Bar */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Segmented Filter Control */}
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => setActiveFilter('PENDING')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeFilter === 'PENDING'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>Pending</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeFilter === 'PENDING'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {counts.pending}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('APPROVED')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeFilter === 'APPROVED'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Approved</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeFilter === 'APPROVED'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {counts.approved}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('REJECTED')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeFilter === 'REJECTED'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <XCircle className="w-3.5 h-3.5 text-rose-500" />
              <span>Rejected</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeFilter === 'REJECTED'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {counts.rejected}
              </span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search deliverable, requester, reason..."
              className="w-full pl-8 pr-8 py-1.5 text-xs rounded-xl border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. UNIFORM TABLE CONTENT */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading && requests.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
            <p className="text-xs font-medium">Loading project approval requests...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-2">
              <AlertCircle className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 mb-1">Error Loading Approvals</h4>
            <p className="text-xs text-rose-600 mb-4">{error}</p>
            <button
              type="button"
              onClick={() => { void loadRequests(); }}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-purple-600 text-white hover:bg-purple-700 cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="py-16 px-4 text-center">
            {activeFilter === 'PENDING' ? (
              <div className="max-w-sm mx-auto">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">All Caught Up!</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  There are no pending due-date extension requests waiting for review. When a project member requests an extension, it will appear here.
                </p>
              </div>
            ) : activeFilter === 'APPROVED' ? (
              <div className="max-w-sm mx-auto">
                <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-3">
                  <Calendar className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">No Approved Requests</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {searchQuery ? 'No approved requests matched your search query.' : 'No extension requests have been approved for this project yet.'}
                </p>
              </div>
            ) : (
              <div className="max-w-sm mx-auto">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-3">
                  <XCircle className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">No Rejected Requests</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {searchQuery ? 'No rejected requests matched your search query.' : 'No extension requests have been rejected for this project.'}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse text-xs table-auto">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-bold text-slate-500 uppercase tracking-wider select-none">
                  <th className="py-3 px-3.5">Deliverable</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Requested By</th>
                  <th className="py-3 px-3">Current Due</th>
                  <th className="py-3 px-3">Requested Due</th>
                  <th className="py-3 px-3 max-w-[220px]">Reason</th>
                  <th className="py-3 px-3">Submitted</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRequests.map((req) => {
                  const daysExtended = computeExtensionDays(req.original_due_date, req.requested_due_date);
                  const isPending = req.status === 'PENDING';
                  const isApproved = req.status === 'APPROVED';
                  const isRejected = req.status === 'REJECTED';

                  const requesterInitials = (req.requester?.name || req.requester?.email || 'IN')
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2);

                  return (
                    <tr
                      key={req.id}
                      className="hover:bg-purple-50/20 transition-colors group"
                    >
                      {/* 1. Deliverable */}
                      <td className="py-3.5 px-3.5 align-middle">
                        <div className="flex items-center gap-2.5">
                          <IssueTypeIcon type={req.task?.type || 'STORY'} className="w-3.5 h-3.5 shrink-0" />
                          <div className="min-w-0 max-w-[200px]">
                            <button
                              type="button"
                              onClick={() => handleInspectTask(req.task_id)}
                              className="font-semibold text-slate-900 hover:text-purple-600 truncate block text-xs cursor-pointer group-hover:underline text-left"
                              title={req.task?.title || 'Deliverable'}
                            >
                              {req.task?.title || 'Untitled Deliverable'}
                            </button>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400 font-mono">
                              <span>#{req.task_id?.slice(0, 8)}</span>
                              {req.task?.status && (
                                <span className="px-1.5 py-0.2 rounded font-sans font-medium text-[9px] bg-slate-100 text-slate-600">
                                  {req.task.status}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Type */}
                      <td className="py-3.5 px-3 align-middle whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                          <Calendar className="w-3 h-3 text-purple-500" />
                          Due Date Ext
                        </span>
                      </td>

                      {/* 3. Requested By */}
                      <td className="py-3.5 px-3 align-middle whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 shadow-2xs">
                            {requesterInitials}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-800 text-xs truncate max-w-[120px]">
                              {req.requester?.name || 'Intern'}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate max-w-[120px]">
                              {req.requester?.email || '—'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 4. Current Due */}
                      <td className="py-3.5 px-3 align-middle whitespace-nowrap">
                        <div className="text-xs font-medium text-slate-700">
                          {req.original_due_date
                            ? new Date(req.original_due_date).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            : 'No due date'}
                        </div>
                      </td>

                      {/* 5. Requested Due */}
                      <td className="py-3.5 px-3 align-middle whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-purple-900 text-xs">
                            {req.requested_due_date
                              ? new Date(req.requested_due_date).toLocaleDateString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })
                              : '—'}
                          </span>
                          {daysExtended !== null && daysExtended > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                              +{daysExtended}d
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 6. Reason */}
                      <td className="py-3.5 px-3 align-middle">
                        <div
                          className="text-xs text-slate-700 italic bg-slate-50 border border-slate-200/70 rounded-lg px-2.5 py-1.5 max-w-[200px] line-clamp-2"
                          title={req.reason}
                        >
                          "{req.reason}"
                        </div>
                      </td>

                      {/* 7. Submitted */}
                      <td className="py-3.5 px-3 align-middle whitespace-nowrap text-slate-500 text-[11px]">
                        <div className="font-medium text-slate-700">
                          {req.created_at
                            ? new Date(req.created_at).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                              })
                            : '—'}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {req.created_at
                            ? new Date(req.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ''}
                        </div>
                      </td>

                      {/* 8. Status */}
                      <td className="py-3.5 px-3 align-middle text-center whitespace-nowrap">
                        {isPending && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                            <Clock className="w-3 h-3 text-amber-600" />
                            Pending Review
                          </span>
                        )}
                        {isApproved && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Approved
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-300">
                            <XCircle className="w-3 h-3 text-rose-600" />
                            Rejected
                          </span>
                        )}
                      </td>

                      {/* 9. Actions */}
                      <td className="py-3.5 px-3.5 align-middle text-right whitespace-nowrap">
                        {isPending ? (
                          canReview ? (
                            <div className="inline-flex items-center gap-1.5 justify-end">
                              <button
                                type="button"
                                onClick={() => handleOpenDecisionModal(req, 'APPROVE')}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors cursor-pointer"
                                title="Approve extension"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Approve</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenDecisionModal(req, 'REJECT')}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 hover:border-rose-300 shadow-2xs transition-colors cursor-pointer"
                                title="Reject extension"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>Reject</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-medium italic">
                              Awaiting Review
                            </span>
                          )
                        ) : (
                          <div className="text-right">
                            <div className="text-[11px] font-semibold text-slate-700">
                              {req.reviewer?.name ? `By ${req.reviewer.name}` : 'Decided'}
                            </div>
                            {req.reviewed_at && (
                              <div className="text-[10px] text-slate-400">
                                {new Date(req.reviewed_at).toLocaleDateString([], {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </div>
                            )}
                            {req.decision_note && (
                              <div
                                className="text-[10px] text-slate-500 italic truncate max-w-[140px] ml-auto"
                                title={req.decision_note}
                              >
                                Note: "{req.decision_note}"
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Table Footer */}
        <div className="p-3.5 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            Showing {filteredRequests.length} of {requests.filter((r) => r.status === activeFilter).length} {activeFilter.toLowerCase()} requests
          </span>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              Pending: <strong>{counts.pending}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Approved: <strong>{counts.approved}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              Rejected: <strong>{counts.rejected}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* 3. CONFIRMATION MODAL */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    decisionType === 'APPROVE'
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-rose-50 text-rose-600'
                  }`}
                >
                  {decisionType === 'APPROVE' ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <XCircle className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {decisionType === 'APPROVE'
                      ? 'Approve Due-Date Extension'
                      : 'Reject Due-Date Extension'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {decisionType === 'APPROVE'
                      ? 'This will update the task deadline to the requested date.'
                      : 'This will leave the current task deadline unchanged.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {decisionError && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-700 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{decisionError}</span>
              </div>
            )}

            {/* Request Summary Card */}
            <div className="mt-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Deliverable:</span>
                <span className="font-bold text-slate-900 truncate max-w-[280px]">
                  {confirmTarget.task?.title || 'Deliverable'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Requested By:</span>
                <span className="font-semibold text-slate-800">
                  {confirmTarget.requester?.name || confirmTarget.requester?.email || 'Intern'}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                <span className="text-slate-500 font-medium">Current Due Date:</span>
                <span className="font-medium text-slate-700">
                  {confirmTarget.original_due_date
                    ? new Date(confirmTarget.original_due_date).toLocaleDateString()
                    : 'None'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">New Requested Due Date:</span>
                <span className="font-bold text-purple-700 flex items-center gap-1">
                  <span>
                    {confirmTarget.requested_due_date
                      ? new Date(confirmTarget.requested_due_date).toLocaleDateString()
                      : '—'}
                  </span>
                  {(() => {
                    const diff = computeExtensionDays(
                      confirmTarget.original_due_date,
                      confirmTarget.requested_due_date
                    );
                    return diff > 0 ? `(+${diff} days)` : '';
                  })()}
                </span>
              </div>
              <div className="pt-1 border-t border-slate-200/60">
                <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">
                  Intern's Reason:
                </span>
                <p className="text-xs text-slate-700 italic bg-white p-2 rounded border border-slate-200/80">
                  "{confirmTarget.reason}"
                </p>
              </div>
            </div>

            {/* Optional Decision Note */}
            <form onSubmit={handleConfirmDecision} className="mt-4 space-y-3">
              <div>
                <label htmlFor="approval-decision-note" className="block text-xs font-semibold text-slate-700 mb-1">
                  Decision Note / Feedback for Intern <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  id="approval-decision-note"
                  rows={3}
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  placeholder={
                    decisionType === 'APPROVE'
                      ? 'e.g. Approved. Please ensure all deliverables are completed by the new date.'
                      : 'e.g. Due date cannot be pushed back further because sprint closes this Friday.'
                  }
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setConfirmTarget(null)}
                  disabled={decisionSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={decisionSubmitting}
                  className={`px-4 py-2 text-xs font-semibold rounded-xl text-white transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-xs ${
                    decisionType === 'APPROVE'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {decisionSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : decisionType === 'APPROVE' ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <X className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {decisionType === 'APPROVE'
                      ? 'Confirm & Approve Extension'
                      : 'Confirm & Reject Extension'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. DETAIL DRAWER (When task is clicked) */}
      {selectedIssue && (
        <IssueDetailDrawer
          issue={selectedIssue}
          isOpen={Boolean(selectedIssue)}
          onClose={() => setSelectedIssue(null)}
          onUpdateIssue={async (updated) => {
            setSelectedIssue((prev) => ({ ...prev, ...updated }));
            void loadRequests();
          }}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}
