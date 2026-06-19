'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/clientApi';
import type { CampaignProgress } from '@/lib/types';
import ProgressBar from './ProgressBar';
import StatCard from './StatCard';
import { useToast } from './Toast';

const ACTIVE = ['queued', 'processing'];

interface ReminderImport {
  file: string;
  totalRows: number;
  found: number;
  onList: number;
  newContacts: number;
  existingContacts: number;
  invalid?: number;
}

export default function ReminderTab() {
  const [recipients, setRecipients] = useState<number | null>(null);
  const [current, setCurrent] = useState<CampaignProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [lastImport, setLastImport] = useState<ReminderImport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const d = await api.get('/api/reminder');
      setRecipients(d.recipients);
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
  const count = recipients ?? 0;

  const processFile = useCallback(async (file: File) => {
    setProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/reminder/import', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Import failed');
      setLastImport(data.result);
      toast.success(`Reminder list now has ${data.result.onList} registrant${data.result.onList === 1 ? '' : 's'}.`);
      load();
    } catch (err) {
      toast.error(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setProcessing(false);
    }
  }, [toast, load]);

  const send = async () => {
    if (!count) return;
    if (!confirm(`Send the Praise Party 3.0 reminder to all ${count} registrant(s) on the reminder list?`)) return;
    setBusy(true);
    try {
      const d = await api.post('/api/reminder');
      setCurrent(d.current ?? null);
      toast.success(`Sending the reminder to ${d.enqueued} registrant${d.enqueued === 1 ? '' : 's'} — it runs in the background.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640 }}>
      {/* Step 1 — upload the registered list */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Step 1 — Upload registered list
        </div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 8, lineHeight: 1.6, marginBottom: 16 }}>
          Drop the file of people who have <strong>already registered</strong>. They are added to the
          reminder list — uploading again just adds anyone new, it never sends on its own.
        </div>

        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
          onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])} />

        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
          style={{ border: `2px dashed ${dragging ? '#6366f1' : '#cbd5e1'}`, borderRadius: 16, padding: '36px 24px', textAlign: 'center', cursor: 'pointer', background: dragging ? '#eef2ff' : '#fafafa', transition: 'all 0.2s' }}
        >
          <div style={{ fontSize: 36, marginBottom: 10 }}>📊</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>Drop your Excel or CSV file here</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>Supports <strong>.xlsx</strong>, <strong>.xls</strong>, <strong>.csv</strong></div>
          <button disabled={processing}
            style={{ background: processing ? '#c7d2fe' : '#6366f1', color: '#fff', border: 'none', padding: '9px 22px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: processing ? 'not-allowed' : 'pointer' }}>
            {processing ? 'Importing…' : 'Browse files'}
          </button>
        </div>

        {lastImport && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#6366f1', marginBottom: 12 }}>✓ {lastImport.file}</div>
            <div className="import-stats-grid">
              <StatCard label="On Reminder List" value={lastImport.onList} accent="#6366f1" />
              <StatCard label="New Contacts" value={lastImport.newContacts} accent="#10b981" />
              <StatCard label="Already Existed" value={lastImport.existingContacts} accent="#f59e0b" />
              {lastImport.invalid ? <StatCard label="Invalid Skipped" value={lastImport.invalid} accent="#ef4444" /> : null}
            </div>
          </div>
        )}
      </div>

      {/* Step 2 — send the reminder */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Step 2 — Send reminder
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
          Reminder: Praise Party 3.0 is this Friday
        </div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 8, lineHeight: 1.6 }}>
          The reminder email (same flyer, confirming their spot) goes only to the{' '}
          <strong>{count}</strong> registrant{count === 1 ? '' : 's'} on the reminder list.
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
            {sending ? 'Sending…' : busy ? 'Starting…' : `⏰  Send reminder to ${count} registrant${count === 1 ? '' : 's'}`}
          </button>
          {count === 0 && (
            <span style={{ fontSize: 13, color: '#94a3b8' }}>
              Upload the registered list above first.
            </span>
          )}
        </div>
      </div>

      {/* Live progress of the most recent reminder send */}
      {current && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 700, color: '#0f172a' }}>
              {sending ? 'Sending now' : 'Last reminder send'}
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
