import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Loader2,
  Calendar,
  User,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { organizationService } from '../../../services/organization.service';

export default function SuperAdminAuditLogsView() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');

  const fetchLogs = async (targetPage = 1) => {
    try {
      setLoading(true);
      const res = await organizationService.getAuditLogs({
        page: targetPage,
        limit: 15,
        action: actionFilter || undefined,
        targetType: targetTypeFilter || undefined,
      });
      setLogs(res.logs || []);
      setPage(res.pagination?.page || 1);
      setTotalPages(res.pagination?.totalPages || 1);
      setTotal(res.pagination?.total || 0);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLogs(1);
  }, [actionFilter, targetTypeFilter]);

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 tracking-wider uppercase">
            Compliance & Security
          </span>
          <h1 className="text-xl font-bold text-slate-900 mt-1">Platform Administrative Audit Trail</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Immutable log of sensitive operations: tenant provisioning, status suspensions, and manager credential changes
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400 font-semibold">Total Logged Events</p>
          <p className="text-2xl font-black text-slate-900">{total}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-purple-600 font-semibold text-slate-700 shadow-2xs"
        >
          <option value="">All Actions</option>
          <option value="ORGANIZATION_CREATED">ORGANIZATION_CREATED</option>
          <option value="MANAGER_PROVISIONED">MANAGER_PROVISIONED</option>
          <option value="MANAGER_PASSWORD_RESET">MANAGER_PASSWORD_RESET</option>
          <option value="ORGANIZATION_SUSPENDED">ORGANIZATION_SUSPENDED</option>
          <option value="ORGANIZATION_REACTIVATED">ORGANIZATION_REACTIVATED</option>
          <option value="ORGANIZATION_UPDATED">ORGANIZATION_UPDATED</option>
        </select>

        <select
          value={targetTypeFilter}
          onChange={(e) => setTargetTypeFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-purple-600 font-semibold text-slate-700 shadow-2xs"
        >
          <option value="">All Targets</option>
          <option value="ORGANIZATION">ORGANIZATION</option>
          <option value="USER">USER</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 text-purple-600 animate-spin" />
            <span className="text-xs font-medium">Loading platform audit logs...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-16 text-center text-slate-400">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="font-bold text-slate-700 text-sm">No Audit Logs Found</p>
            <p className="text-xs text-slate-400 mt-0.5">Administrative events will appear here automatically</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/75 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Target</th>
                  <th className="py-3 px-4">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => {
                  const isSuspension = log.action.includes('SUSPENDED');
                  const isCreation = log.action.includes('CREATED') || log.action.includes('PROVISIONED');
                  const isReset = log.action.includes('RESET');

                  const badgeClass = isSuspension
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : isCreation
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : isReset
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-purple-50 text-purple-700 border-purple-200';

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>

                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badgeClass}`}>
                          {log.action}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        {log.actor ? (
                          <div>
                            <span className="font-bold text-slate-800 block">{log.actor.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{log.actor.email}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">System / Deleted</span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px]">
                        <span className="font-semibold text-slate-700 block">{log.target_type}</span>
                        <span className="text-slate-400 text-[10px]">{log.target_id.slice(0, 8)}...</span>
                      </td>

                      <td className="py-3 px-4">
                        <pre className="text-[10px] font-mono text-slate-600 bg-slate-50 p-1.5 rounded-lg border border-slate-100 max-w-md overflow-x-auto">
                          {log.metadata ? JSON.stringify(log.metadata, null, 2) : '—'}
                        </pre>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-slate-50/50">
            <span className="text-xs text-slate-500">
              Page {page} of {totalPages} ({total} events)
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => { void fetchLogs(page - 1); }}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => { void fetchLogs(page + 1); }}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
