'use client';

import { useState } from 'react';
import { useRealtimeQuery } from '@/lib/hooks/useRealtimeQuery';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import {
  Search, ChevronLeft, ChevronRight, RefreshCw, AlertCircle, CheckCircle, Clock, Loader2, Mail
} from 'lucide-react';

interface EmailLog {
  id: string;
  recipient: string;
  subject: string | null;
  template: string | null;
  status: 'PENDING' | 'SENT' | 'FAILED';
  retryCount: number;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
}

const STATUS_ICONS: Record<string, any> = {
  PENDING: Clock,
  SENT: CheckCircle,
  FAILED: AlertCircle,
};

const STATUS_BADGE: Record<string, string> = {
  SENT: 'bg-green-100 text-green-800 border-green-200',
  PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  FAILED: 'bg-red-100 text-red-800 border-red-200',
};

const TEMPLATE_LABELS: Record<string, string> = {
  TEST_SCORECARD: 'Test Scorecard',
  ATTENDANCE_WARNING: 'Attendance Warning',
};

const TEMPLATE_OPTIONS = ['TEST_SCORECARD', 'ATTENDANCE_WARNING'];

export default function EmailLogsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [templateFilter, setTemplateFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [retrying, setRetrying] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const limit = 20;

  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const authHeaders = { Authorization: `Bearer ${token}` };

  const buildParams = () => {
    const p = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (statusFilter) p.set('status', statusFilter);
    if (templateFilter) p.set('template', templateFilter);
    if (search) p.set('search', search);
    if (dateFrom) p.set('dateFrom', dateFrom);
    if (dateTo) p.set('dateTo', dateTo);
    return p;
  };

  const { data: logsData, refetch: refetchLogs } = useRealtimeQuery<{ data: EmailLog[]; pagination: { total: number }; summary: Record<string, number> }>(
    ['admin-email-logs', page, statusFilter, templateFilter, search, dateFrom, dateTo],
    () => fetch(`/api/email-logs?${buildParams()}`, { headers: authHeaders }).then(r => r.json()),
    { pollInterval: 20000 }
  );

  const logs = logsData?.data ?? [];
  const total = logsData?.pagination?.total ?? 0;
  const totalPages = Math.ceil(total / limit);
  const summary = logsData?.summary ?? { SENT: 0, PENDING: 0, FAILED: 0 };

  async function handleRetry(id: string) {
    setRetrying(id);
    setNotice(null);
    try {
      const res = await fetch(`/api/email-logs/${id}/retry`, {
        method: 'POST',
        headers: authHeaders,
      });
      const body = await res.json();
      if (res.ok && body.success) {
        setNotice({ type: 'success', text: 'Email retried successfully.' });
      } else {
        setNotice({ type: 'error', text: body.error?.message || 'Retry failed. Please try again.' });
      }
      refetchLogs();
    } catch {
      setNotice({ type: 'error', text: 'Could not reach the server. Please try again.' });
    }
    setRetrying(null);
  }

  return (
    <ProtectedRoute allowedRoles={['ADMIN']}>
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Email Logs</h1>
          <button onClick={() => refetchLogs()} className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {notice && (
          <div className={`mb-4 px-4 py-3 rounded-lg border text-sm ${notice.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {notice.text}
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'SENT', value: summary.SENT ?? 0, color: 'border-green-200 bg-green-50 text-green-700' },
            { label: 'PENDING', value: summary.PENDING ?? 0, color: 'border-yellow-200 bg-yellow-50 text-yellow-700' },
            { label: 'FAILED', value: summary.FAILED ?? 0, color: 'border-red-200 bg-red-50 text-red-700' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border p-4 ${s.color}`}>
              <p className="text-xs font-medium opacity-75">{s.label}</p>
              <p className="text-2xl font-bold mt-1">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput.trim()); setPage(1); } }}
              placeholder="Search recipient or subject…"
              className="pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg w-64"
            />
          </div>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">All Status</option>
            <option value="SENT">Sent</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
          </select>
          <select value={templateFilter} onChange={e => { setTemplateFilter(e.target.value); setPage(1); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">All Types</option>
            {TEMPLATE_OPTIONS.map(t => <option key={t} value={t}>{TEMPLATE_LABELS[t] || t}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="From date" />
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="To date" />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Recipient</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Subject</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Email Type</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Retry Count</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Timestamp</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Action</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-400">No email logs found.</td></tr>
                ) : logs.map((log: EmailLog) => {
                  const StatusIcon = STATUS_ICONS[log.status] || Clock;
                  return (
                    <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
                      <td className="px-4 py-3 text-gray-900">
                        {log.recipient}
                        {log.status === 'FAILED' && log.errorMessage && (
                          <p className="mt-1 text-xs text-red-600 max-w-[220px] whitespace-normal">{log.errorMessage}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs max-w-[240px] whitespace-normal">{log.subject || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-700">
                          <Mail className="w-3 h-3" /> {TEMPLATE_LABELS[log.template || ''] || log.template || 'General'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_BADGE[log.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                          <StatusIcon className="w-3 h-3" /> {log.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{log.retryCount}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        {log.status === 'FAILED' ? (
                          <button onClick={() => handleRetry(log.id)} disabled={retrying === log.id} className="text-xs text-blue-600 hover:underline disabled:opacity-50">
                            {retrying === log.id ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Retry'}
                          </button>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
              <span className="text-sm text-gray-500">{total} total</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-100 flex items-center gap-1"><ChevronLeft className="w-3 h-3" /> Prev</button>
                <span className="px-3 py-1 text-sm text-gray-600">Page {page} of {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-100 flex items-center gap-1">Next <ChevronRight className="w-3 h-3" /></button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
