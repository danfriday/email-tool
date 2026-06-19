'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/clientApi';
import type { ActivityLog, Paginated } from '@/lib/types';

const TYPES = ['', 'campaign', 'contact', 'list', 'import', 'email', 'job', 'system'];
const LEVELS = ['', 'info', 'warn', 'error'];

export default function LogsTab() {
  const [data, setData] = useState<Paginated<ActivityLog> | null>(null);
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [level, setLevel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '50' });
      if (type) params.set('type', type);
      if (level) params.set('level', level);
      const d = await api.get(`/api/logs?${params}`);
      setData(d);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load logs');
    }
  }, [page, type, level]);

  useEffect(() => { load(); }, [load]);

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 0;
  const color = (l: string) => (l === 'error' ? '#dc2626' : l === 'warn' ? '#d97706' : '#64748b');

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} style={select}>
          {TYPES.map((t) => <option key={t} value={t}>{t ? t : 'All types'}</option>)}
        </select>
        <select value={level} onChange={(e) => { setLevel(e.target.value); setPage(1); }} style={select}>
          {LEVELS.map((l) => <option key={l} value={l}>{l ? l : 'All levels'}</option>)}
        </select>
        <button onClick={load} style={select}>↻ Refresh</button>
      </div>

      {error && <div style={{ marginBottom: 12, color: '#b91c1c', fontSize: 13 }}>{error}</div>}

      <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={th}>Time</th><th style={th}>Type</th><th style={th}>Level</th><th style={th}>Message</th><th style={th}>Actor</th>
            </tr>
          </thead>
          <tbody>
            {items.map((l) => (
              <tr key={l.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ ...td, whiteSpace: 'nowrap', color: '#94a3b8' }}>{new Date(l.createdAt).toLocaleString()}</td>
                <td style={td}>{l.type}</td>
                <td style={{ ...td, color: color(l.level), fontWeight: 600 }}>{l.level}</td>
                <td style={td}>{l.message}</td>
                <td style={{ ...td, color: '#94a3b8' }}>{l.actor || '—'}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>No log entries</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, fontSize: 12, color: '#64748b' }}>
        <span>{data?.total ?? 0} entries</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={select}>← Prev</button>
          <span>Page {page} of {Math.max(1, totalPages)}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages} style={select}>Next →</button>
        </div>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' };
const td: React.CSSProperties = { padding: '8px 12px', color: '#475569', verticalAlign: 'top' };
const select: React.CSSProperties = { padding: '7px 10px', fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer' };
