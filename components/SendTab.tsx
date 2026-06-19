'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/clientApi';
import type { CampaignProgress } from '@/lib/types';
import ProgressBar from './ProgressBar';
import { useToast } from './Toast';

const ACTIVE = ['queued', 'processing'];

export default function SendTab() {
  const [activeContacts, setActiveContacts] = useState<number | null>(null);
  const [current, setCurrent] = useState<CampaignProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const d = await api.get('/api/send');
      setActiveContacts(d.activeContacts);
      setCurrent(d.current ?? null);
    } catch {
      /* transient poll error — the next tick retries silently */
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, 4000); // live progress
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [load]);

  const sending = !!current && ACTIVE.includes(current.status);

  const send = async () => {
    if (!activeContacts) return;
    if (!confirm(`Send the Praise Party 3.0 invitation to all ${activeContacts} active contact(s)?`)) return;
    setBusy(true);
    try {
      const d = await api.post('/api/send');
      setCurrent(d.current ?? null);
      toast.success(`Sending the invitation to ${d.enqueued} contact${d.enqueued === 1 ? '' : 's'} — it runs in the background.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setBusy(false);
    }
  };

  const count = activeContacts ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640 }}>
      {/* What gets sent */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Email
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
          Praise Party 3.0 — You&apos;re Invited! VICTORY Concert
        </div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 8, lineHeight: 1.6 }}>
          The Praise Party invitation flyer + details go to every active contact.
          Suppressed and unsubscribed contacts are skipped automatically.
        </div>

        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button
            onClick={send}
            disabled={busy || sending || count === 0}
            style={{
              padding: '12px 24px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 15,
              color: '#fff', cursor: busy || sending || count === 0 ? 'not-allowed' : 'pointer',
              background: busy || sending || count === 0 ? '#a5b4fc' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            }}
          >
            {sending ? 'Sending…' : busy ? 'Starting…' : `✉️  Send to all ${count} contact${count === 1 ? '' : 's'}`}
          </button>
          {count === 0 && (
            <span style={{ fontSize: 13, color: '#94a3b8' }}>
              No active contacts — import some in the Import tab.
            </span>
          )}
        </div>
      </div>

      {/* Live progress of the most recent send */}
      {current && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 700, color: '#0f172a' }}>
              {sending ? 'Sending now' : 'Last send'}
            </span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              {new Date(current.createdAt).toLocaleString()}
            </span>
          </div>

          <ProgressBar pct={current.completionPct} />

          <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 13, color: '#64748b', flexWrap: 'wrap' }}>
            <span>Total {current.totalRecipients}</span>
            <span style={{ color: '#16a34a' }}>Sent {current.sent}</span>
            <span>Pending {current.pending}</span>
            <span style={{ color: '#dc2626' }}>Failed {current.failed}</span>
            <span>Skipped {current.skipped}</span>
            <span style={{ marginLeft: 'auto', fontWeight: 700, color: '#0f172a' }}>{current.completionPct}%</span>
          </div>

          {sending && (
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 12 }}>
              Sending runs in the background — you can safely close this page.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
