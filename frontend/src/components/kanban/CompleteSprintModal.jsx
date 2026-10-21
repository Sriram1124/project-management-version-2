import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Layers,
  PlusCircle,
  Calendar,
  Ban,
  Undo2,
  Check,
  User,
  AlertCircle,
} from 'lucide-react';

export default function CompleteSprintModal({
  isOpen,
  onClose,
  sprint = null,
  upcomingSprints = [],
  completedCount = 0,
  incompleteCount = 0,
  tasks = [],
  isKanban = false,
  onConfirmComplete,
}) {
  const Term = isKanban ? 'Cycle' : 'Sprint';
  const term = isKanban ? 'cycle' : 'sprint';
  const sprintName = sprint?.name || Term;

  // Filter completed and incomplete tasks
  const completedTasks = useMemo(() => {
    return tasks.filter((t) => t.status === 'COMPLETED');
  }, [tasks]);

  const incompleteTasks = useMemo(() => {
    return tasks.filter((t) => t.status !== 'COMPLETED');
  }, [tasks]);

  const effectiveCompletedCount =
    tasks.length > 0 ? completedTasks.length : (sprint?.completed_items ?? completedCount);

  const effectiveIncompleteCount =
    tasks.length > 0 ? incompleteTasks.length : (sprint?.incomplete_items ?? incompleteCount);

  // Story Points calculation
  const plannedSp = useMemo(() => {
    if (sprint?.total_points !== undefined && sprint?.total_points !== null) {
      return Number(sprint.total_points);
    }
    return tasks.reduce((sum, t) => sum + (Number(t.story_points) || 0), 0);
  }, [sprint, tasks]);

  const completedSp = useMemo(() => {
    if (sprint?.completed_points !== undefined && sprint?.completed_points !== null) {
      return Number(sprint.completed_points);
    }
    return completedTasks.reduce((sum, t) => sum + (Number(t.story_points) || 0), 0);
  }, [sprint, completedTasks]);

  const remainingSp = useMemo(() => {
    if (sprint?.remaining_points !== undefined && sprint?.remaining_points !== null) {
      return Number(sprint.remaining_points);
    }
    return Math.max(0, plannedSp - completedSp);
  }, [sprint, plannedSp, completedSp]);

  // Destination options for Carried Forward work
  const hasUpcoming = upcomingSprints && upcomingSprints.length > 0;
  const [destinationType, setDestinationType] = useState(() => (hasUpcoming ? 'EXISTING_SPRINT' : 'BACKLOG'));
  const [selectedTargetId, setSelectedTargetId] = useState(() => (hasUpcoming ? upcomingSprints[0].id : ''));
  const [newSprintName, setNewSprintName] = useState('');

  // Per-task decisions: { [taskId]: { action: 'CARRY_FORWARD' | 'RETURN_TO_BACKLOG' | 'CANCEL', cancel_reason: string } }
  const [taskDecisions, setTaskDecisions] = useState({});
  const [validationError, setValidationError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmStep, setIsConfirmStep] = useState(false);

  // Initialize decisions when modal opens or tasks change
  useEffect(() => {
    if (isOpen) {
      setIsConfirmStep(false);
      setValidationError(null);
      setIsSubmitting(false);

      const hasNext = upcomingSprints && upcomingSprints.length > 0;
      setDestinationType(hasNext ? 'EXISTING_SPRINT' : 'BACKLOG');
      setSelectedTargetId(hasNext ? upcomingSprints[0].id : '');
      setNewSprintName(`${sprintName} Carryover`);

      // Default decision: If destination sprint exists, CARRY_FORWARD; else RETURN_TO_BACKLOG
      const initialDecisions = {};
      const defaultAction = hasNext ? 'CARRY_FORWARD' : 'RETURN_TO_BACKLOG';
      incompleteTasks.forEach((t) => {
        initialDecisions[t.id] = {
          action: defaultAction,
          cancel_reason: '',
        };
      });
      setTaskDecisions(initialDecisions);
    }
  }, [isOpen, sprint, upcomingSprints, incompleteTasks, sprintName]);

  if (!isOpen) return null;

  const setSingleDecision = (taskId, action) => {
    setTaskDecisions((prev) => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] || {}),
        action,
      },
    }));
    setValidationError(null);
  };

  const setSingleCancelReason = (taskId, reason) => {
    setTaskDecisions((prev) => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] || {}),
        cancel_reason: reason,
      },
    }));
    setValidationError(null);
  };

  const handleApplyBulkAction = (action) => {
    setTaskDecisions((prev) => {
      const updated = { ...prev };
      incompleteTasks.forEach((t) => {
        updated[t.id] = {
          ...(updated[t.id] || {}),
          action,
        };
      });
      return updated;
    });
    setValidationError(null);
  };

  // Group decision counts
  const carryCount = Object.values(taskDecisions).filter((d) => d.action === 'CARRY_FORWARD').length;
  const backlogCount = Object.values(taskDecisions).filter((d) => d.action === 'RETURN_TO_BACKLOG').length;
  const cancelCount = Object.values(taskDecisions).filter((d) => d.action === 'CANCEL').length;

  const handleProceedToConfirm = () => {
    // Validate cancellation reasons
    for (const task of incompleteTasks) {
      const decision = taskDecisions[task.id];
      if (decision?.action === 'CANCEL') {
        if (!decision.cancel_reason || !decision.cancel_reason.trim()) {
          setValidationError(`Please provide a cancellation reason for task "${task.title}".`);
          return;
        }
      }
    }

    if (carryCount > 0 && destinationType === 'NEW_SPRINT' && !newSprintName.trim()) {
      setValidationError('Please specify a name for the new sprint.');
      return;
    }

    setValidationError(null);
    setIsConfirmStep(true);
  };

  const handleFinalSubmit = async () => {
    try {
      setIsSubmitting(true);
      setValidationError(null);

      // Determine target destination sprint
      let targetId = null;
      let newName = null;

      if (destinationType === 'EXISTING_SPRINT' && selectedTargetId) {
        targetId = selectedTargetId;
      } else if (destinationType === 'NEW_SPRINT' && newSprintName.trim()) {
        newName = newSprintName.trim();
      }

      // Build item_actions payload
      const item_actions = incompleteTasks.map((t) => {
        const d = taskDecisions[t.id] || { action: 'RETURN_TO_BACKLOG', cancel_reason: '' };
        return {
          work_item_id: t.id,
          action: d.action,
          cancel_reason: d.cancel_reason?.trim() || undefined,
          target_sprint_id: d.action === 'CARRY_FORWARD' ? targetId : null,
        };
      });

      await onConfirmComplete?.({
        target_sprint_id: targetId,
        new_sprint_name: newName,
        unfinished_action: destinationType === 'EXISTING_SPRINT' ? 'MOVE_TO_SPRINT' : 'MOVE_TO_BACKLOG',
        item_actions,
      });

      onClose();
    } catch (err) {
      console.error('Failed to complete sprint:', err);
      setValidationError(err.message || 'Failed to complete sprint');
    } finally {
      setIsSubmitting(false);
    }
  };

  const targetSprintName =
    destinationType === 'EXISTING_SPRINT'
      ? upcomingSprints.find((s) => s.id === selectedTargetId)?.name || 'Selected Sprint'
      : destinationType === 'NEW_SPRINT'
      ? newSprintName || 'New Sprint'
      : 'Backlog';

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
          (e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }
        }
      }}
    >
      <div
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Complete {Term} — {sprintName}
              </h3>
              <p className="text-xs text-slate-500">
                Review completed work and resolve unfinished deliverables
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Error Banner */}
          {validationError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-800 text-xs animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{validationError}</div>
            </div>
          )}

          {/* Metrics Card */}
          <div className="grid grid-cols-4 gap-2.5">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
              <div className="text-xl font-black text-slate-800 font-mono">{plannedSp}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">
                Planned SP
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200/70 text-center">
              <div className="text-xl font-black text-emerald-700 font-mono">{completedSp}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 mt-0.5">
                Completed SP
              </div>
            </div>

            <div className="p-3 rounded-xl bg-purple-50 border border-purple-200/70 text-center">
              <div className="text-xl font-black text-purple-700 font-mono">{remainingSp}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-purple-800 mt-0.5">
                Remaining SP
              </div>
            </div>

            <div
              className={`p-3 rounded-xl text-center border ${
                effectiveIncompleteCount > 0
                  ? 'bg-amber-50 border-amber-200/80'
                  : 'bg-emerald-50 border-emerald-200/80'
              }`}
            >
              <div
                className={`text-xl font-black font-mono ${
                  effectiveIncompleteCount > 0 ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {effectiveIncompleteCount}
              </div>
              <div
                className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${
                  effectiveIncompleteCount > 0 ? 'text-amber-800' : 'text-emerald-800'
                }`}
              >
                Unfinished Tasks
              </div>
            </div>
          </div>

          {/* View Mode: Normal Review vs Confirmation Step */}
          {!isConfirmStep ? (
            <>
              {/* All tasks completed state */}
              {effectiveIncompleteCount === 0 && (
                <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">All planned work items are completed!</p>
                    <p className="text-emerald-700 mt-0.5">
                      100% of planned story points were successfully delivered in this {term}. Completing the {term} will finalize velocity records.
                    </p>
                  </div>
                </div>
              )}

              {/* Unfinished tasks resolution */}
              {effectiveIncompleteCount > 0 && (
                <div className="space-y-4">
                  {/* Destination sprint selector for Carried-Forward items */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-purple-600" />
                        <span>Destination for Carried-Forward Tasks:</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {hasUpcoming && (
                        <label
                          className={`p-2.5 rounded-lg border text-xs cursor-pointer flex items-center gap-2 transition-colors ${
                            destinationType === 'EXISTING_SPRINT'
                              ? 'border-purple-500 bg-purple-50/50 text-purple-900 font-semibold'
                              : 'border-slate-200 bg-white text-slate-700'
                          }`}
                        >
                          <input
                            type="radio"
                            name="destType"
                            checked={destinationType === 'EXISTING_SPRINT'}
                            onChange={() => setDestinationType('EXISTING_SPRINT')}
                            className="text-purple-600"
                          />
                          <span>Planned {Term}</span>
                        </label>
                      )}

                      <label
                        className={`p-2.5 rounded-lg border text-xs cursor-pointer flex items-center gap-2 transition-colors ${
                          destinationType === 'BACKLOG'
                            ? 'border-purple-500 bg-purple-50/50 text-purple-900 font-semibold'
                            : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="destType"
                          checked={destinationType === 'BACKLOG'}
                          onChange={() => setDestinationType('BACKLOG')}
                          className="text-purple-600"
                        />
                        <span>Project Backlog</span>
                      </label>

                      <label
                        className={`p-2.5 rounded-lg border text-xs cursor-pointer flex items-center gap-2 transition-colors ${
                          destinationType === 'NEW_SPRINT'
                            ? 'border-purple-500 bg-purple-50/50 text-purple-900 font-semibold'
                            : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="destType"
                          checked={destinationType === 'NEW_SPRINT'}
                          onChange={() => setDestinationType('NEW_SPRINT')}
                          className="text-purple-600"
                        />
                        <span>Create New {Term}</span>
                      </label>
                    </div>

                    {destinationType === 'EXISTING_SPRINT' && hasUpcoming && (
                      <div className="pt-1">
                        <select
                          value={selectedTargetId}
                          onChange={(e) => setSelectedTargetId(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-purple-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-purple-600"
                        >
                          {upcomingSprints.map((us) => (
                            <option key={us.id} value={us.id}>
                              {us.name} {us.status === 'PLANNED' ? '(Planned)' : `(${us.status})`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {destinationType === 'NEW_SPRINT' && (
                      <div className="pt-1">
                        <input
                          type="text"
                          value={newSprintName}
                          onChange={(e) => setNewSprintName(e.target.value)}
                          placeholder={`e.g. ${Term} 2 (Carryover)`}
                          className="w-full px-3 py-1.5 rounded-lg border border-purple-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-purple-600"
                        />
                      </div>
                    )}

                    {!hasUpcoming && destinationType === 'BACKLOG' && (
                      <p className="text-[11px] text-slate-500">
                        No upcoming planned {term}s exist. Unfinished tasks will return to the backlog without auto-creating unexpected sprints.
                      </p>
                    )}
                  </div>

                  {/* Bulk Actions Bar */}
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                      Unfinished Tasks ({incompleteTasks.length})
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">Bulk set all:</span>
                      <button
                        type="button"
                        onClick={() => handleApplyBulkAction('CARRY_FORWARD')}
                        className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 hover:bg-purple-100 font-medium text-[11px] border border-purple-200 cursor-pointer"
                      >
                        Carry Forward
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyBulkAction('RETURN_TO_BACKLOG')}
                        className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium text-[11px] border border-slate-200 cursor-pointer"
                      >
                        Backlog
                      </button>
                    </div>
                  </div>

                  {/* Tasks List */}
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-64 overflow-y-auto bg-white">
                    {incompleteTasks.map((t) => {
                      const decision = taskDecisions[t.id] || { action: 'RETURN_TO_BACKLOG', cancel_reason: '' };
                      const assigneeName =
                        t.assignees?.[0]?.name ||
                        t.assignees?.[0]?.user?.name ||
                        t.assignee?.name ||
                        'Unassigned';

                      return (
                        <div key={t.id} className="p-3 space-y-2 hover:bg-slate-50/50 transition-colors">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[10px] font-semibold text-slate-400">
                                  {t.code || t.id.slice(0, 8)}
                                </span>
                                <span className="text-xs font-semibold text-slate-900 truncate">
                                  {t.title}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3 text-slate-400" />
                                  <span>{assigneeName}</span>
                                </span>
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  {t.status}
                                </span>
                                <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                                  {t.story_points ?? 0} SP
                                </span>
                              </div>
                            </div>

                            {/* Action selector segmented buttons */}
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => setSingleDecision(t.id, 'CARRY_FORWARD')}
                                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer border ${
                                  decision.action === 'CARRY_FORWARD'
                                    ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                                    : 'bg-white text-slate-600 hover:bg-slate-100 border-slate-200'
                                }`}
                              >
                                Carry Forward
                              </button>
                              <button
                                type="button"
                                onClick={() => setSingleDecision(t.id, 'RETURN_TO_BACKLOG')}
                                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer border ${
                                  decision.action === 'RETURN_TO_BACKLOG'
                                    ? 'bg-slate-700 text-white border-slate-700 shadow-xs'
                                    : 'bg-white text-slate-600 hover:bg-slate-100 border-slate-200'
                                }`}
                              >
                                Backlog
                              </button>
                              <button
                                type="button"
                                onClick={() => setSingleDecision(t.id, 'CANCEL')}
                                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer border ${
                                  decision.action === 'CANCEL'
                                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                                    : 'bg-white text-slate-600 hover:bg-rose-50 hover:text-rose-600 border-slate-200'
                                }`}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>

                          {/* Cancellation reason input (required if Cancel is selected) */}
                          {decision.action === 'CANCEL' && (
                            <div className="pt-1.5 pl-2 border-l-2 border-rose-500 animate-in fade-in">
                              <label htmlFor={`cancel-reason-${t.id}`} className="block text-[10px] font-bold text-rose-700 uppercase tracking-wider mb-1">
                                Cancellation Reason *
                              </label>
                              <input
                                id={`cancel-reason-${t.id}`}
                                type="text"
                                value={decision.cancel_reason || ''}
                                onChange={(e) => setSingleCancelReason(t.id, e.target.value)}
                                placeholder="Enter reason (e.g. Scope dropped, duplicate, obsolete)..."
                                className={`w-full px-2.5 py-1 text-xs rounded border bg-white focus:outline-none ${
                                  !decision.cancel_reason?.trim()
                                    ? 'border-rose-300 focus:border-rose-500'
                                    : 'border-slate-300 focus:border-purple-600'
                                }`}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Preservation Notice */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span className="leading-relaxed">
                  Carried-forward work preserves exact task IDs, assignees, comments, points, and epic/story hierarchy without duplicating records or altering previous completion metrics.
                </span>
              </div>
            </>
          ) : (
            /* Step 2: Explicit Confirmation Dialog */
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200">
                <h4 className="text-sm font-bold text-purple-900 mb-1 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-purple-700" />
                  <span>Confirm Sprint Closure Decisions</span>
                </h4>
                <p className="text-xs text-purple-700">
                  Please review the summary below before finalizing closure of {Term} "{sprintName}".
                </p>
              </div>

              <div className="space-y-2.5 text-xs text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between py-1 border-b border-slate-200">
                  <span className="font-medium text-slate-600">Completed Deliverables (Archived):</span>
                  <span className="font-bold text-emerald-700 font-mono">
                    {effectiveCompletedCount} tasks ({completedSp} SP)
                  </span>
                </div>
                {effectiveIncompleteCount > 0 && (
                  <>
                    <div className="flex items-center justify-between py-1 border-b border-slate-200">
                      <span className="font-medium text-slate-600">Carry Forward to {targetSprintName}:</span>
                      <span className="font-bold text-purple-700 font-mono">{carryCount} tasks</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-200">
                      <span className="font-medium text-slate-600">Return to Project Backlog:</span>
                      <span className="font-bold text-slate-800 font-mono">{backlogCount} tasks</span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="font-medium text-slate-600">Cancel with Audit Log:</span>
                      <span className="font-bold text-rose-700 font-mono">{cancelCount} tasks</span>
                    </div>
                  </>
                )}
              </div>

              <p className="text-xs text-slate-500 italic">
                Note: Unfinished tasks will NOT be marked as completed. Sprints can be reopened later by authorized Managers or Tech Leads if needed.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-end gap-2.5">
          {!isConfirmStep ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProceedToConfirm}
                className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Review & Complete {Term}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsConfirmStep(false)}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Back to Edit Decisions
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Finalizing...' : `Confirm & Close ${Term}`}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
