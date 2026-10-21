import React, { useState } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  FileText, 
  ArrowLeft, 
  Send, 
  Calendar,
  AlertCircle
} from 'lucide-react';

export default function InternPortalView({ onSwitchToManager }) {
  const [tasks, setTasks] = useState([
    { id: 't1', title: 'Implement biometric auth flow', status: 'In Progress', due: 'Today, 6:00 PM', priority: 'High', lead: 'Rohan Singh' },
    { id: 't2', title: 'Write unit tests for storage adapters', status: 'To Do', due: 'Tomorrow', priority: 'Medium', lead: 'Rohan Singh' },
    { id: 't3', title: 'Fix Android push notification background bug', status: 'Blocked', due: 'Overdue (1d)', priority: 'High', lead: 'Rohan Singh' },
    { id: 't4', title: 'Update README with setup instructions', status: 'Completed', due: 'Completed', priority: 'Low', lead: 'Rohan Singh' }
  ]);

  const toggleTask = (id) => {
    setTasks(prev => prev.map(t => {
      if (t.id === id) {
        return { ...t, status: t.status === 'Completed' ? 'In Progress' : 'Completed' };
      }
      return t;
    }));
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Perspective Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-700 to-indigo-700 text-white flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
            AP
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold">Aarav Patel (Intern Perspective)</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20">Section C1</span>
            </div>
            <p className="text-xs text-purple-100">Project: Mobile App Development • Lead: Rohan Singh</p>
          </div>
        </div>

        <button
          onClick={onSwitchToManager}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white text-purple-700 hover:bg-purple-50 text-xs font-bold transition-all shadow-sm active:scale-95"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Manager Console</span>
        </button>
      </div>

      {/* Intern Overview Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-card">
          <span className="text-[11px] font-bold text-slate-400 uppercase">My Progress</span>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">75%</div>
          <span className="text-xs text-emerald-600 font-semibold">6 of 8 tasks done</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-card">
          <span className="text-[11px] font-bold text-slate-400 uppercase">Due Today</span>
          <div className="text-2xl font-extrabold text-amber-500 mt-1">1 Task</div>
          <span className="text-xs text-slate-400">Biometric auth flow</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-card">
          <span className="text-[11px] font-bold text-slate-400 uppercase">Pending Forms</span>
          <div className="text-2xl font-extrabold text-purple-600 mt-1">1 Form</div>
          <span className="text-xs text-rose-500 font-semibold">Weekly Report due 5 PM</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-card">
          <span className="text-[11px] font-bold text-slate-400 uppercase">My Attendance</span>
          <div className="text-2xl font-extrabold text-emerald-600 mt-1">92%</div>
          <span className="text-xs text-slate-400">23 of 25 sessions</span>
        </div>
      </div>

      {/* My Assigned Tasks */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">My Assigned Subtasks</h3>
          <span className="text-xs text-slate-400">Click circle to toggle status</span>
        </div>

        <div className="space-y-2.5">
          {tasks.map((t) => (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={() => toggleTask(t.id)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  toggleTask(t.id);
                }
              }}
              className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                t.status === 'Completed'
                  ? 'bg-emerald-50/40 border-emerald-200/60 opacity-80'
                  : t.status === 'Blocked'
                  ? 'bg-rose-50/40 border-rose-200/60'
                  : 'bg-white border-slate-200 hover:border-purple-300 shadow-xs'
              }`}
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                    t.status === 'Completed'
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'border-slate-300 hover:border-purple-500'
                  }`}
                >
                  {t.status === 'Completed' && <CheckCircle2 className="w-4 h-4" />}
                </button>
                <div>
                  <h4 className={`text-xs font-bold ${t.status === 'Completed' ? 'text-slate-500' : 'text-slate-800'}`}>
                    {t.title}
                  </h4>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                    <span>Lead: {t.lead}</span>
                    <span>•</span>
                    <span className={t.due.includes('Overdue') ? 'text-rose-600 font-bold' : ''}>Due: {t.due}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  t.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' :
                  t.status === 'Blocked' ? 'bg-rose-100 text-rose-800' :
                  'bg-purple-100 text-purple-800'
                }`}>
                  {t.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Form Submission */}
      <div className="grid grid-cols-1 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card">
          <h4 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-purple-600" />
            <span>Assigned Forms (1 Action Required)</span>
          </h4>
          <div className="p-3.5 rounded-xl bg-purple-50/60 border border-purple-100 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800">Weekly Progress Report - Week 4</span>
              <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">Due Today 5 PM</span>
            </div>
            <p className="text-[11px] text-slate-500">Provide summary of key commits, blockers, and next sprint goals.</p>
            <button className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors">
              Open & Submit Form
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

