'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/clientApi';
import type { CampaignProgress } from '@/lib/types';
import StatCard from './StatCard';
import StatusBadge from './StatusBadge';
import ProgressBar from './ProgressBar';

interface Stats {
  contacts: number;
  suppressed: number;
  lists: number;
  campaigns: number;
  activeCampaigns: number;
  sentTotal: number;
}

export default function DashboardTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [active, setActive] = useState<CampaignProgress[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/dashboard');
      setStats(data.stats);
      setActive(data.activeCampaigns ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    }
  }, []);

  // Poll so progress updates live while the worker sends in the background.
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}

      <div className="stats-grid">
        <StatCard label="Contacts" value={stats?.contacts ?? '—'} accent="#6366f1" />
        <StatCard label="Sends" value={stats?.campaigns ?? '—'} accent="#8b5cf6" />
        <StatCard label="Active" value={stats?.activeCampaigns ?? '—'} accent="#f59e0b" />
        <StatCard label="Emails Sent" value={stats?.sentTotal ?? '—'} accent="#10b981" />
        <StatCard label="Suppressed" value={stats?.suppressed ?? '—'} accent="#c2410c" />
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
          Currently sending
        </div>
        {active.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: 13, border: '1px dashed #e2e8f0', borderRadius: 12 }}>
            Nothing sending right now. Start a send in the Send tab.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {active.map((c) => (
              <div key={c.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>{c.name}</span>
                  <StatusBadge status={c.status as any} />
                </div>
                <ProgressBar pct={c.completionPct} />
                <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: '#64748b' }}>
                  <span>{c.sent} sent</span>
                  <span>{c.pending} pending</span>
                  <span>{c.failed} failed</span>
                  <span>{c.skipped} skipped</span>
                  <span style={{ marginLeft: 'auto' }}>{c.completionPct}% of {c.totalRecipients}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
