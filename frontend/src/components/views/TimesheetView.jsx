import { useEffect, useState } from 'react';
import { Clock3, LogIn, LogOut, RefreshCw, Timer } from 'lucide-react';
import { timesheetService } from '../../services/timesheet.service';

const formatMinutes = (minutes = 0) => {
  const hours = Math.floor(Number(minutes) / 60);
  const remainder = Number(minutes) % 60;
  return `${hours}h ${remainder}m`;
};

export default function TimesheetView({ onToast }) {
  const [timesheet, setTimesheet] = useState(null);
  const [teamReport, setTeamReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const loadTimesheet = async () => {
    try {
      setLoading(true);
      setError('');
      const [todayResponse, reportResponse] = await Promise.all([
        timesheetService.getToday(),
        timesheetService.getManagerReport(),
      ]);
      setTimesheet(todayResponse.timesheet || null);
      setTeamReport(reportResponse.report || null);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load timesheet data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTimesheet();
  }, []);

  const startSession = async () => {
    try {
      setWorking(true);
      await timesheetService.startSession();
      onToast?.('Work session started');
      await loadTimesheet();
    } catch (requestError) {
      onToast?.(requestError.message || 'Unable to start work session');
    } finally {
      setWorking(false);
    }
  };

  const endSession = async () => {
    try {
      setWorking(true);
      await timesheetService.endSession();
      onToast?.('Work session ended');
      await loadTimesheet();
    } catch (requestError) {
      onToast?.(requestError.message || 'Unable to end work session');
    } finally {
      setWorking(false);
    }
  };

  const activeSession = timesheet?.sessions?.some((session) => !session.ended_at);
  const members = teamReport?.members || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">Attendance & work time</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Timesheet</h1>
          <p className="mt-1 text-sm text-slate-500">Backend-recorded sessions and task time for today.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={loadTimesheet} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-violet-300 hover:text-violet-700 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button type="button" onClick={activeSession ? endSession : startSession} disabled={working || loading} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 ${activeSession ? 'bg-rose-600 hover:bg-rose-700' : 'bg-violet-600 hover:bg-violet-700'}`}>
            {activeSession ? <LogOut className="h-3.5 w-3.5" /> : <LogIn className="h-3.5 w-3.5" />}
            {activeSession ? 'End session' : 'Start session'}
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Office window', formatMinutes(timesheet?.gross_office_minutes), 'Scheduled time'],
          ['Attendance', formatMinutes(timesheet?.attendance_minutes), 'Clamped to office hours'],
          ['Net working', formatMinutes(timesheet?.net_working_minutes), 'After configured break'],
          ['Task time', formatMinutes(timesheet?.task_minutes), 'Recorded task entries'],
        ].map(([label, value, detail]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500"><span>{label}</span><Clock3 className="h-4 w-4 text-violet-500" /></div>
            <div className="mt-3 text-2xl font-bold text-slate-900">{loading ? '...' : value}</div>
            <div className="mt-1 text-[11px] text-slate-400">{detail}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-semibold text-slate-900">Today&apos;s sessions</h2><p className="text-xs text-slate-500">{timesheet?.date || 'Loading...'}</p></div><Timer className="h-5 w-5 text-violet-500" /></div>
          <div className="divide-y divide-slate-100">
            {!loading && !timesheet?.sessions?.length && <p className="px-5 py-8 text-sm text-slate-500">No sessions recorded today.</p>}
            {timesheet?.sessions?.map((session) => <div key={session.id} className="flex items-center justify-between px-5 py-3 text-sm"><span className="text-slate-600">{new Date(session.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><span className="text-slate-400">{session.ended_at ? new Date(session.ended_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active'}</span><span className="font-semibold text-slate-700">{session.ended_at ? formatMinutes((new Date(session.ended_at) - new Date(session.started_at)) / 60000) : 'In progress'}</span></div>)}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-900">Team monthly totals</h2><p className="text-xs text-slate-500">Live backend report</p></div>
          <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
            {!loading && !members.length && <p className="px-5 py-8 text-sm text-slate-500">No team report data available.</p>}
            {members.map((member) => <div key={member.user.id} className="flex items-center justify-between px-5 py-3"><div><div className="text-sm font-semibold text-slate-800">{member.user.name}</div><div className="text-[11px] text-slate-400">{member.user.email}</div></div><div className="text-right text-sm font-semibold text-violet-700">{formatMinutes(member.monthly?.total_actual_minutes)}</div></div>)}
          </div>
        </section>
      </div>
    </div>
  );
}
