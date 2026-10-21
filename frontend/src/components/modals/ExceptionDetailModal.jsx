import React from 'react';
import { X, AlertCircle, CheckCircle, ArrowRight, Bell, ShieldAlert, Send } from 'lucide-react';

export default function ExceptionDetailModal({ exceptionId, onClose, onActionTaken }) {
  if (!exceptionId) return null;

  const exceptionDetails = {
    'overdue-interns': {
      title: '4 Interns With Multiple Overdue Tasks',
      severity: 'Critical Intervention Needed',
      summary: 'Interns have passed hard deadlines across Sprint 2 deliverables without status updates.',
      items: [
        { name: 'Rohan Verma', section: 'C1', project: 'Mobile App', overdueCount: 3, pendingTask: 'OAuth2 Login Flow' },
        { name: 'Vikram Sen', section: 'B2', project: 'AI Platform', overdueCount: 2, pendingTask: 'Tokenizer Evaluation' },
        { name: 'Ananya Roy', section: 'B2', project: 'AI Platform', overdueCount: 2, pendingTask: 'Dataset Cleaning' },
        { name: 'Deepak Joshi', section: 'A1', project: 'Student Mgmt', overdueCount: 2, pendingTask: 'Schema Migration' },
      ],
      recommendedAction: 'Schedule emergency standup with Tech Leads to unblock work.',
      actionButton: 'Notify Assigned Tech Leads'
    },
    'blocked-tasks': {
      title: '3 Critical Tasks Blocked by External IT Dependencies',
      severity: 'IT Escalation Required',
      summary: 'Tasks have exceeded 48 hours in "Blocked" state awaiting API keys & credentials.',
      items: [
        { name: 'Auth OAuth2 Setup', section: 'A1', project: 'Student Management System', blockedBy: 'Awaiting Google OAuth Client ID approval' },
        { name: 'Payment Gateway Stub', section: 'E2', project: 'FinTech Analytics Engine', blockedBy: 'Sandbox webhook credentials missing' },
        { name: 'Elasticsearch Cluster Sync', section: 'D1', project: 'Cloud DevOps Pipeline', blockedBy: 'VPC peering request in IT queue' }
      ],
      recommendedAction: 'Send priority IT escalation ping to unlock sandbox keys.',
      actionButton: 'Escalate to IT Helpdesk'
    },
    'overdue-forms': {
      title: '6 Overdue Weekly Feedback Surveys (Section A1)',
      severity: 'Operational Compliance',
      summary: 'Weekly feedback surveys are missing for 6 interns under Priya Sharma in Section A1.',
      items: [
        { name: 'Weekly Progress Report - Week 4', section: 'Section A1', missing: 6, deadline: 'Passed 24h ago' }
      ],
      recommendedAction: 'Send direct ping to Section A1 cohort.',
      actionButton: 'Send Automated Form Reminder'
    },
    'approaching-deadlines': {
      title: 'Project Alpha Approaching Sprint 2 Deadline',
      severity: 'High Velocity Watch',
      summary: 'Sprint 2 cutoff occurs in under 48 hours with 3 critical modules pending code review.',
      items: [
        { name: 'Authentication Module', status: 'In Review', lead: 'Priya Sharma' },
        { name: 'User Profile Sync', status: 'In Review', lead: 'Priya Sharma' },
        { name: 'Audit Log Generator', status: 'In Progress', lead: 'Priya Sharma' }
      ],
      recommendedAction: 'Reassign review bandwidth to senior engineers.',
      actionButton: 'Fast-Track Code Reviews'
    },
    'pending-work-a1': {
      title: 'Section A1 Backlog Density (14 Items)',
      severity: 'Workload Imbalance',
      summary: 'Section A1 has twice the average pending task density compared to Sections B2 and C1.',
      items: [
        { section: 'A1', tasksOpen: 14, interns: 12, lead: 'Priya Sharma' },
        { section: 'B2', tasksOpen: 7, interns: 8, lead: 'Vikram Joshi' },
        { section: 'C1', tasksOpen: 8, interns: 10, lead: 'Rohan Singh' }
      ],
      recommendedAction: 'Balance load by shifting non-critical tasks to Section A2 or extending sprint.',
      actionButton: 'Initiate Workload Rebalance'
    },
    'priya-bottleneck': {
      title: 'Tech Lead Priya Sharma Has 14 Tasks Awaiting Review',
      severity: 'Review Bottleneck',
      summary: 'PR and submission queue for Priya exceeds SLA threshold (avg wait: 36h).',
      items: [
        { lead: 'Priya Sharma', queueLength: 14, avgReviewTime: '36 hours', status: 'Bottlenecked' }
      ],
      recommendedAction: 'Temporarily assign Vikram Joshi to co-review Section A1 pull requests.',
      actionButton: 'Assign Secondary Reviewer'
    }
  };

  const current = exceptionDetails[exceptionId] || exceptionDetails['overdue-interns'];

  const handleAction = () => {
    onActionTaken?.(current.actionButton);
    onClose();
  };

  return (
    <div
      role="button"
      tabIndex={0} 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200"
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
        className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-rose-50/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 bg-rose-100/70 px-1.5 py-0.5 rounded">
                {current.severity}
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-0.5">{current.title}</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
            {current.summary}
          </p>

          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Affected Entities & Tasks
            </h4>
            <div className="space-y-2">
              {current.items.map((item, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-800">{item.name || item.lead || item.section}</span>
                    <div className="text-[11px] text-slate-400">
                      {item.project || item.blockedBy || item.status || `Missing: ${item.missing}`}
                    </div>
                  </div>
                  {item.overdueCount && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                      {item.overdueCount} Overdue
                    </span>
                  )}
                  {item.tasksOpen && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700">
                      {item.tasksOpen} Tasks
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-100 text-xs">
            <span className="font-bold text-purple-900 block mb-1">Recommended Manager Action:</span>
            <span className="text-purple-700">{current.recommendedAction}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 flex items-center justify-end gap-2.5 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl"
          >
            Dismiss
          </button>
          <button
            onClick={handleAction}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#7C3AED] hover:bg-[#6D28D9] rounded-xl shadow-sm flex items-center gap-1.5 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{current.actionButton}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

