import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ArrowRight,
  Layers,
  PlusCircle,
  Calendar,
  CheckSquare,
  Square,
  Sparkles,
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

  // Incomplete tasks list from passed tasks or synthesized
  const incompleteTasks = useMemo(() => {
    return tasks.filter((t) => t.status !== 'COMPLETED');
  }, [tasks]);

  const effectiveIncompleteCount = incompleteTasks.length > 0
    ? incompleteTasks.length
    : (sprint?.incomplete_items ?? incompleteCount);

  const effectiveCompletedCount = tasks.length > 0
    ? tasks.filter((t) => t.status === 'COMPLETED').length
    : (sprint?.completed_items ?? completedCount);

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
    return tasks
      .filter((t) => t.status === 'COMPLETED')
      .reduce((sum, t) => sum + (Number(t.story_points) || 0), 0);
  }, [sprint, tasks]);

  const remainingSp = useMemo(() => {
    if (sprint?.remaining_points !== undefined && sprint?.remaining_points !== null) {
      return Number(sprint.remaining_points);
    }
    return Math.max(0, plannedSp - completedSp);
  }, [sprint, plannedSp, completedSp]);

  // Mode: 'CARRY_FORWARD' (Option B) vs 'CONTINUE' (Option A)
  const [activeMode, setActiveMode] = useState('CARRY_FORWARD');

  // Option A: Reopen/Continue Cycle state
  const [newEndDate, setNewEndDate] = useState(() => {
    if (sprint?.end_date) {
      const d = new Date(sprint.end_date);
      d.setDate(d.getDate() + 7);
      return d.toISOString().split('T')[0];
    }
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });

  // Option B: Carry Forward Destination
  const [destinationType, setDestinationType] = useState(() => {
    return upcomingSprints.length > 0 ? 'EXISTING_CYCLE' : 'BACKLOG';
  });
  const [selectedTargetId, setSelectedTargetId] = useState(() => {
    return upcomingSprints.length > 0 ? upcomingSprints[0].id : '';
  });
  const [newSprintName, setNewSprintName] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState(() => new Set());

  // Initialize/reset states on modal open
  useEffect(() => {
    if (isOpen) {
      setActiveMode('CARRY_FORWARD');
      if (upcomingSprints.length > 0) {
        setDestinationType('EXISTING_CYCLE');
        setSelectedTargetId(upcomingSprints[0].id);
      } else {
        setDestinationType('BACKLOG');
        setSelectedTargetId('');
      }
      setNewSprintName(`${sprintName} Carryover`);

      if (incompleteTasks.length > 0) {
        setSelectedTaskIds(new Set(incompleteTasks.map((t) => t.id)));
      } else {
        setSelectedTaskIds(new Set());
      }

      if (sprint?.end_date) {
        const d = new Date(sprint.end_date);
        d.setDate(d.getDate() + 7);
        setNewEndDate(d.toISOString().split('T')[0]);
      }
    }
  }, [isOpen, sprint, upcomingSprints, incompleteTasks, sprintName]);

  if (!isOpen) return null;

  const toggleSelectAll = () => {
    if (selectedTaskIds.size === incompleteTasks.length) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(incompleteTasks.map((t) => t.id)));
    }
  };

  const toggleTaskSelection = (taskId) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    if (effectiveIncompleteCount === 0) {
      onConfirmComplete?.({
        target_sprint_id: null,
      });
      onClose();
      return;
    }

    if (activeMode === 'CONTINUE') {
      // Option A: Reopen/Continue Cycle with date adjustment
      onConfirmComplete?.({
        unfinished_action: 'CONTINUE',
        new_end_date: newEndDate ? new Date(newEndDate).toISOString() : null,
      });
      onClose();
      return;
    }

    // Option B: Carry forward unfinished items
    let targetId = null;
    let action = 'MOVE_TO_BACKLOG';

    if (destinationType === 'EXISTING_CYCLE' && selectedTargetId) {
      targetId = selectedTargetId;
      action = 'MOVE_TO_SPRINT';
    } else if (destinationType === 'NEW_CYCLE' && newSprintName.trim()) {
      action = 'CREATE_NEW_SPRINT';
    } else {
      targetId = null;
      action = 'MOVE_TO_BACKLOG';
    }

    onConfirmComplete?.({
      unfinished_action: action,
      target_sprint_id: targetId,
      new_sprint_name: destinationType === 'NEW_CYCLE' ? newSprintName.trim() : null,
      selected_task_ids: incompleteTasks.length > 0 ? Array.from(selectedTaskIds) : null,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
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
                Review {term} metrics and choose how to handle open deliverables
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
          {/* Metrics Card: Planned SP, Completed SP, Remaining SP, Incomplete Count */}
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

            <div className={`p-3 rounded-xl text-center border ${
              effectiveIncompleteCount > 0
                ? 'bg-amber-50 border-amber-200/80'
                : 'bg-emerald-50 border-emerald-200/80'
            }`}>
              <div className={`text-xl font-black font-mono ${
                effectiveIncompleteCount > 0 ? 'text-amber-700' : 'text-emerald-700'
              }`}>
                {effectiveIncompleteCount}
              </div>
              <div className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${
                effectiveIncompleteCount > 0 ? 'text-amber-800' : 'text-emerald-800'
              }`}>
                Incomplete Tasks
              </div>
            </div>
          </div>

          {/* If all tasks completed */}
          {effectiveIncompleteCount === 0 && (
            <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">All planned work items are completed!</p>
                <p className="text-emerald-700 mt-0.5">
                  100% of planned story points were successfully delivered in this {term}. Closing the {term} will archive its velocity record.
                </p>
              </div>
            </div>
          )}

          {/* If unfinished items exist: Options A and B */}
          {effectiveIncompleteCount > 0 && (
            <div className="space-y-4">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <span>Select Resolution for Unfinished Work:</span>
              </div>

              {/* Mode Selection Tabs / Radios */}
              <div className="grid grid-cols-2 gap-3">
                {/* Option B: Carry Forward */}
                <button
                  type="button"
                  onClick={() => setActiveMode('CARRY_FORWARD')}
                  className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                    activeMode === 'CARRY_FORWARD'
                      ? 'border-purple-600 bg-purple-50/70 shadow-xs ring-1 ring-purple-600'
                      : 'border-slate-200 hover:border-purple-200 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowRight className="w-4 h-4 text-purple-600" />
                    <span className="text-xs font-bold text-slate-900">
                      Option B: Carry Forward
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Close this {term} and roll over unfinished tasks to another {term} or backlog.
                  </p>
                </button>

                {/* Option A: Reopen / Continue Cycle */}
                <button
                  type="button"
                  onClick={() => setActiveMode('CONTINUE')}
                  className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                    activeMode === 'CONTINUE'
                      ? 'border-purple-600 bg-purple-50/70 shadow-xs ring-1 ring-purple-600'
                      : 'border-slate-200 hover:border-purple-200 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <RotateCcw className="w-4 h-4 text-purple-600" />
                    <span className="text-xs font-bold text-slate-900">
                      Option A: Continue {Term}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Extend {term} duration with a new end date and keep working on open items.
                  </p>
                </button>
              </div>

              {/* Mode Details: Option A Details */}
              {activeMode === 'CONTINUE' && (
                <div className="p-4 rounded-xl bg-purple-50/40 border border-purple-200/80 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-purple-900">
                    <Calendar className="w-4 h-4 text-purple-600" />
                    <span>Adjust {Term} End Date:</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    The {term} remains in ACTIVE status without closing. All {effectiveIncompleteCount} incomplete items and {remainingSp} remaining story points stay assigned to this {term}.
                  </p>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      New End Date *
                    </label>
                    <input
                      type="date"
                      value={newEndDate}
                      onChange={(e) => setNewEndDate(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs focus:outline-none focus:border-purple-600"
                    />
                  </div>
                </div>
              )}

              {/* Mode Details: Option B Details */}
              {activeMode === 'CARRY_FORWARD' && (
                <div className="space-y-4">
                  {/* Task Selection Checklist (if incomplete tasks provided) */}
                  {incompleteTasks.length > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                          Select Tasks to Carry Forward ({selectedTaskIds.size}/{incompleteTasks.length})
                        </span>
                        <button
                          type="button"
                          onClick={toggleSelectAll}
                          className="text-[11px] font-semibold text-purple-600 hover:text-purple-700 cursor-pointer"
                        >
                          {selectedTaskIds.size === incompleteTasks.length ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>

                      <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 bg-white text-xs">
                        {incompleteTasks.map((t) => {
                          const isChecked = selectedTaskIds.has(t.id);
                          return (
                            <label
                              key={t.id}
                              className="px-3 py-2 flex items-center gap-2.5 hover:bg-slate-50 cursor-pointer transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleTaskSelection(t.id)}
                                className="w-3.5 h-3.5 text-purple-600 rounded border-slate-300 focus:ring-purple-500 cursor-pointer"
                              />
                              <span className="font-mono text-[10px] font-semibold text-slate-400">
                                {t.id}
                              </span>
                              <span className="text-slate-800 truncate flex-1">
                                {t.title}
                              </span>
                              {t.story_points > 0 && (
                                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                  {t.story_points} SP
                                </span>
                              )}
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase">
                                {t.status}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <div className="px-3 py-1.5 bg-slate-50/70 border-t border-slate-100 text-[11px] text-slate-500">
                        {selectedTaskIds.size < incompleteTasks.length
                          ? `${incompleteTasks.length - selectedTaskIds.size} unselected tasks will return to the backlog.`
                          : 'All unfinished items will carry forward to the destination selected below.'}
                      </div>
                    </div>
                  )}

                  {/* Destination Selection */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Destination for Carried-Forward Work:
                    </label>

                    <div className="space-y-2">
                      {/* Sub-option 1: Existing Planned Cycle */}
                      {upcomingSprints.length > 0 && (
                        <div
                          className={`p-3 rounded-xl border transition-colors ${
                            destinationType === 'EXISTING_CYCLE'
                              ? 'border-purple-300 bg-purple-50/40'
                              : 'border-slate-200 bg-slate-50/50'
                          }`}
                        >
                          <label className="flex items-center gap-2.5 cursor-pointer">
                            <input
                              type="radio"
                              name="destinationType"
                              value="EXISTING_CYCLE"
                              checked={destinationType === 'EXISTING_CYCLE'}
                              onChange={() => setDestinationType('EXISTING_CYCLE')}
                              className="text-purple-600 focus:ring-purple-500"
                            />
                            <div className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                              <Layers className="w-3.5 h-3.5 text-purple-600" />
                              <span>Carry forward into a planned {term}</span>
                            </div>
                          </label>

                          {destinationType === 'EXISTING_CYCLE' && (
                            <div className="mt-2.5 ml-6">
                              <select
                                value={selectedTargetId}
                                onChange={(e) => setSelectedTargetId(e.target.value)}
                                className="w-full px-3 py-1.5 rounded-lg border border-purple-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-purple-600"
                              >
                                {upcomingSprints.map((us) => (
                                  <option key={us.id} value={us.id}>
                                    {us.name} {us.status === 'PLANNED' ? '(Planned)' : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Sub-option 2: Create New Cycle */}
                      <div
                        className={`p-3 rounded-xl border transition-colors ${
                          destinationType === 'NEW_CYCLE'
                            ? 'border-purple-300 bg-purple-50/40'
                            : 'border-slate-200 bg-slate-50/50'
                        }`}
                      >
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="radio"
                            name="destinationType"
                            value="NEW_CYCLE"
                            checked={destinationType === 'NEW_CYCLE'}
                            onChange={() => setDestinationType('NEW_CYCLE')}
                            className="text-purple-600 focus:ring-purple-500"
                          />
                          <div className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                            <PlusCircle className="w-3.5 h-3.5 text-purple-600" />
                            <span>Create new planned {term} for carryover</span>
                          </div>
                        </label>

                        {destinationType === 'NEW_CYCLE' && (
                          <div className="mt-2.5 ml-6">
                            <input
                              type="text"
                              value={newSprintName}
                              onChange={(e) => setNewSprintName(e.target.value)}
                              placeholder={`e.g. ${Term} 2 (Carryover)`}
                              className="w-full px-3 py-1.5 rounded-lg border border-purple-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-purple-600"
                            />
                          </div>
                        )}
                      </div>

                      {/* Sub-option 3: Project Backlog */}
                      <div
                        className={`p-3 rounded-xl border transition-colors ${
                          destinationType === 'BACKLOG'
                            ? 'border-purple-300 bg-purple-50/40'
                            : 'border-slate-200 bg-slate-50/50'
                        }`}
                      >
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="radio"
                            name="destinationType"
                            value="BACKLOG"
                            checked={destinationType === 'BACKLOG'}
                            onChange={() => setDestinationType('BACKLOG')}
                            className="text-purple-600 focus:ring-purple-500"
                          />
                          <div>
                            <div className="text-xs font-bold text-slate-800">
                              Move to Project Backlog
                            </div>
                            <div className="text-[11px] text-slate-400">
                              Unassign from {isKanban ? 'cycles' : 'sprints'} and return to {isKanban ? 'continuous backlog pool' : 'backlog'}
                            </div>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Safety Notice */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              Carried-forward work preserves exact task IDs, assignees, comments, points, and history without duplicate records or false completion metrics.
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            className={`px-4 py-2 text-xs font-bold text-white rounded-xl shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeMode === 'CONTINUE' && effectiveIncompleteCount > 0
                ? 'bg-purple-600 hover:bg-purple-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {activeMode === 'CONTINUE' && effectiveIncompleteCount > 0 ? (
              <>
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Adjust Dates & Continue {Term}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirm & Complete {Term}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
