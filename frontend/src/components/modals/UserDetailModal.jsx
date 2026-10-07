import React, { useEffect, useState } from 'react';
import { X, User, KeyRound, UserX, Shield, Calendar, Mail, Hash, CheckCircle2, Clock, Loader2, RefreshCw } from 'lucide-react';
import { timesheetService } from '../../services/timesheet.service';

const formatMinutes = (minutes = 0) => {
  const total = Number(minutes) || 0;
  return `${Math.floor(total / 60)}h ${total % 60}m`;
};

const today = () => new Date().toISOString().slice(0, 10);

export default function UserDetailModal({
  isOpen,
  user,
  onClose,
  onOpenResetPassword,
  onOpenDeactivate
}) {
  const [reportPeriod, setReportPeriod] = useState('day');
  const [reportDate, setReportDate] = useState(today());
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');

  const loadReport = async () => {
    if (!user?.id) return;
    try {
      setReportLoading(true);
      setReportError('');
      const response = await timesheetService.getUserReport(user.id, {
        period: reportPeriod,
        date: reportDate,
      });
      setReport(response.report || null);
    } catch (error) {
      setReport(null);
      setReportError(error.message || 'Unable to load timesheet report.');
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && user?.id) loadReport();
  }, [isOpen, user?.id, reportPeriod, reportDate]);

  if (!isOpen || !user) return null;

  const totals = report?.totals || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm shadow-xs">
              {(user.name || user.email || 'U').charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Member Details</h2>
              <p className="text-xs text-slate-500 mt-0.5">Account profile &amp; security status</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Details */}
        <div className="p-6 space-y-4 text-xs">
          
          {/* Status Banner */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="font-semibold text-slate-600">Account Status</span>
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
              user.is_active !== false
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}>
              {user.is_active !== false ? '● Active' : '○ Inactive'}
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                Name
              </span>
              <span className="font-bold text-slate-900">{user.name || '—'}</span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-slate-400" />
                User ID
              </span>
              <span className="font-mono text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                {user.user_code || '—'}
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                Email
              </span>
              <span className="font-mono text-slate-700">{user.email}</span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-slate-400" />
                Role / Type
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                user.type === 'INTERN'
                  ? 'bg-purple-100 text-purple-700'
                  : user.type === 'EMPLOYEE'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-slate-100 text-slate-700'
              }`}>
                {user.type || 'MEMBER'}
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Created Date
              </span>
              <span className="text-slate-700">
                {user.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}
              </span>
            </div>

            {user.updated_at && (
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-500 font-medium flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Last Updated
                </span>
                <span className="text-slate-700">
                  {new Date(user.updated_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                </span>
              </div>
            )}
          </div>

          <section className="mt-5 rounded-xl border border-violet-100 bg-violet-50/30 p-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Clock className="h-4 w-4 text-violet-600" /> Timesheet / Work Report</h3>
                <p className="mt-1 text-[11px] text-slate-500">Backend-recorded attendance and task time for this member.</p>
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-violet-100 bg-white p-1">
                {['day', 'week', 'month'].map((period) => (
                  <button key={period} type="button" onClick={() => setReportPeriod(period)} className={`rounded-md px-2.5 py-1 text-[11px] font-bold capitalize ${reportPeriod === period ? 'bg-violet-600 text-white' : 'text-slate-500 hover:bg-violet-50'}`}>
                    {period}
                  </button>
                ))}
                <input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} className="ml-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600" />
                <button type="button" onClick={loadReport} disabled={reportLoading} title="Refresh timesheet" className="rounded-md p-1.5 text-slate-500 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${reportLoading ? 'animate-spin' : ''}`} /></button>
              </div>
            </div>

            {reportLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-violet-600" /> Loading report...</div>
            ) : reportError ? (
              <div className="mt-3 flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700"><span>{reportError}</span><button type="button" onClick={loadReport} title="Retry" className="rounded p-1 hover:bg-rose-100"><RefreshCw className="h-3.5 w-3.5" /></button></div>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[
                    ['Gross', totals.gross_office_minutes],
                    ['Break', totals.break_minutes],
                    ['Net work', totals.net_working_minutes],
                    ['Task time', totals.task_minutes],
                    ['Unallocated', totals.unallocated_minutes],
                  ].map(([label, value]) => <div key={label} className="rounded-lg border border-white bg-white p-2.5"><div className="text-[10px] font-semibold text-slate-400">{label}</div><div className="mt-1 font-bold text-slate-800">{formatMinutes(value)}</div></div>)}
                </div>

                <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="w-full min-w-[560px] text-left text-[11px]"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Attendance</th><th className="px-3 py-2">Net Work</th><th className="px-3 py-2">Task Time</th><th className="px-3 py-2">Unallocated</th></tr></thead><tbody className="divide-y divide-slate-100">{report?.days?.length ? report.days.map((day) => <tr key={day.date}><td className="px-3 py-2 font-semibold text-slate-700">{day.date}</td><td className="px-3 py-2 text-slate-600">{formatMinutes(day.attendance_minutes)}</td><td className="px-3 py-2 text-slate-600">{formatMinutes(day.net_working_minutes)}</td><td className="px-3 py-2 text-slate-600">{formatMinutes(day.task_minutes)}</td><td className="px-3 py-2 text-slate-600">{formatMinutes(day.unallocated_minutes)}</td></tr>) : <tr><td colSpan="5" className="px-3 py-5 text-center text-slate-400">No recorded work for this period.</td></tr>}</tbody></table>
                </div>

                <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="w-full min-w-[860px] text-left text-[11px]"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Task</th><th className="px-3 py-2">Project</th><th className="px-3 py-2">Assigned</th><th className="px-3 py-2">Completed</th><th className="px-3 py-2">Lifecycle</th><th className="px-3 py-2">Actual Work</th><th className="px-3 py-2">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{report?.task_breakdown?.length ? report.task_breakdown.map((task) => <tr key={task.task_id}><td className="px-3 py-2 font-semibold text-slate-700">{task.task_title}</td><td className="px-3 py-2 text-slate-600">{task.project_name || 'Personal'}</td><td className="px-3 py-2 text-slate-600">{task.assigned_at ? new Date(task.assigned_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td><td className="px-3 py-2 text-slate-600">{task.completed_at ? new Date(task.completed_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'In Progress'}</td><td className="px-3 py-2 font-semibold text-violet-700">{formatMinutes(task.lifecycle_minutes)}</td><td className="px-3 py-2 font-semibold text-emerald-700">{formatMinutes(task.actual_work_minutes ?? task.minutes)}</td><td className="px-3 py-2 text-slate-600">{task.status || '—'}</td></tr>) : <tr><td colSpan="7" className="px-3 py-5 text-center text-slate-400">No tasks assigned in this period.</td></tr>}</tbody></table>
                </div>

                <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="w-full min-w-[680px] text-left text-[11px]"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Recorded Work</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Start</th><th className="px-3 py-2">End</th><th className="px-3 py-2">Duration</th></tr></thead><tbody className="divide-y divide-slate-100">{report?.time_entries?.length ? report.time_entries.map((entry) => <tr key={entry.id}><td className="px-3 py-2 font-semibold text-slate-700">{entry.task_title}</td><td className="px-3 py-2 text-slate-600">{new Date(entry.date).toLocaleDateString()}</td><td className="px-3 py-2 text-slate-600">{new Date(entry.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td className="px-3 py-2 text-slate-600">{new Date(entry.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td className="px-3 py-2 text-slate-600">{formatMinutes(entry.duration_minutes)}</td></tr>) : <tr><td colSpan="5" className="px-3 py-5 text-center text-slate-400">No TimeEntries recorded for this period.</td></tr>}</tbody></table>
                </div>

                <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Task timeline</div>{report?.timeline?.length ? <div className="space-y-2">{report.timeline.map((event, index) => <div key={`${event.type}-${event.task_id}-${event.timestamp}-${index}`} className="flex items-start gap-2 text-[11px]"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" /><div><span className="font-semibold text-slate-700">{event.type.replaceAll('_', ' ')}</span><span className="text-slate-500"> · {event.task_title}</span><span className="ml-2 text-slate-400">{new Date(event.timestamp).toLocaleString()}</span></div></div>)}</div> : <div className="text-[11px] text-slate-400">No task lifecycle events recorded for this period.</div>}</div>
              </>
            )}
          </section>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenResetPassword(user);
              }}
              className="px-3 py-1.5 rounded-lg border border-purple-200 hover:bg-purple-50 text-purple-700 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Reset Password
            </button>

            {user.is_active !== false && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenDeactivate(user);
                }}
                className="px-3 py-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-700 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                <UserX className="w-3.5 h-3.5" />
                Deactivate
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-slate-600 hover:bg-slate-200/60 font-semibold text-xs transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
