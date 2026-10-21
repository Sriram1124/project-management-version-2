import React from 'react';
import BroadcastAlert from './BroadcastAlert';
import { 
  Bell, 
  AlertCircle, 
  Lock, 
  FileText, 
  Clock, 
  Layers, 
  UserCheck 
} from 'lucide-react';

export default function AttentionRequired({ 
  onAlertAll, 
  onSendCustomAlert, 
  onCardClick 
}) {

  const exceptions = [
    {
      id: 'overdue-interns',
      icon: AlertCircle,
      title: '4 interns have multiple overdue tasks',
      description: 'Rohan, Vikram, and 2 others are lagging behind schedule.',
      iconColor: 'text-rose-500',
      borderColor: 'border-rose-100 hover:border-rose-300',
      bgGlow: 'hover:bg-rose-50/20'
    },
    {
      id: 'blocked-tasks',
      icon: Lock,
      title: '3 tasks are blocked',
      description: 'Awaiting external API access keys from IT department.',
      iconColor: 'text-amber-500',
      borderColor: 'border-amber-100 hover:border-amber-300',
      bgGlow: 'hover:bg-amber-50/20'
    },
    {
      id: 'overdue-forms',
      icon: FileText,
      title: '6 forms are overdue',
      description: 'Weekly feedback surveys are missing from Section A1.',
      iconColor: 'text-rose-500',
      borderColor: 'border-rose-100 hover:border-rose-300',
      bgGlow: 'hover:bg-rose-50/20'
    },
    {
      id: 'approaching-deadlines',
      icon: Clock,
      title: 'Project Alpha has approaching deadlines',
      description: 'Sprint 2 ends in 48 hours; 3 critical modules remain open.',
      iconColor: 'text-amber-500',
      borderColor: 'border-amber-100 hover:border-amber-300',
      bgGlow: 'hover:bg-amber-50/20'
    },
    {
      id: 'pending-work-a1',
      icon: Layers,
      title: 'Section A1 has significant pending work',
      description: '14 total backlog items; highest density across sections.',
      iconColor: 'text-purple-600',
      borderColor: 'border-purple-100 hover:border-purple-300',
      bgGlow: 'hover:bg-purple-50/20'
    },
    {
      id: 'priya-bottleneck',
      icon: UserCheck,
      title: 'Tech Lead Priya has 14 tasks awaiting review',
      description: 'Approval bottlenecks identified; review queue is growing.',
      iconColor: 'text-purple-600',
      borderColor: 'border-purple-100 hover:border-purple-300',
      bgGlow: 'hover:bg-purple-50/20'
    }
  ];


  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-card">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            Attention Required
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Critical exceptions requiring operational intervention
          </p>
        </div>
        <button
          onClick={onAlertAll}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-semibold shadow-sm transition-all active:scale-[0.98] shrink-0"
        >
          <Bell className="w-3.5 h-3.5" />
          <span>Alert All Pending</span>
        </button>
      </div>

      {/* Broadcast Alert Admin Action Card */}
      <div className="mt-4">
        <BroadcastAlert 
          onSendAlert={onSendCustomAlert}
          onPreview={onAlertAll}
          stats={{ pending: 8, overdue: 3, recipients: 11 }}
        />
      </div>

      {/* 2x3 Grid of 6 Exception Cards */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        {exceptions.map((exc) => {
          const Icon = exc.icon;
          return (
            <button
              type="button"
              key={exc.id}
              onClick={() => onCardClick?.(exc.id)}
              className={`w-full text-left p-4 rounded-xl border ${exc.borderColor} ${exc.bgGlow} transition-all duration-150 cursor-pointer bg-white flex items-start gap-3 shadow-sm group`}
            >
              <div className={`mt-0.5 shrink-0 ${exc.iconColor}`}>
                <Icon className="w-4 h-4 stroke-[2.2]" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-slate-800 leading-snug group-hover:text-purple-700 transition-colors">
                  {exc.title}
                </h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                  {exc.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

