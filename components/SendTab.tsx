'use client';

import { useState, useRef } from 'react';
import { Contact } from '@/lib/firebase';
import StatCard from './StatCard';
import StatusBadge from './StatusBadge';

interface SMTPConfig {
  fromName: string;
  fromEmail: string;
}

interface SendLog {
  id: string;
  time: string;
  msg: string;
  type: 'info' | 'ok' | 'err' | 'warn';
}

interface SendTabProps {
  contacts: Contact[];
  setContacts: (contacts: Contact[] | ((prev: Contact[]) => Contact[])) => void;
  smtp: SMTPConfig;
}

export default function SendTab({
  contacts,
  setContacts,
  smtp,
}: SendTabProps) {
  const [logs, setLogs] = useState<SendLog[]>([]);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);

  const pending = contacts.filter((c) => c.selected && c.status === 'pending');
  const sent = contacts.filter((c) => c.status === 'sent').length;
  const failed = contacts.filter((c) => c.status === 'failed').length;
  const total = contacts.filter((c) => c.selected).length;
  const done = sent + failed;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const uid = () => Math.random().toString(36).slice(2, 9);

  const addLog = (msg: string, type: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs((p) => [...p, { id: uid(), time, msg, type }]);
  };

  const startSend = async () => {
    if (!pending.length) {
      addLog('No pending contacts to send to.', 'warn');
      return;
    }

    stopRef.current = false;
    setRunning(true);
    setLogs([]);
    addLog(`Starting to send Praise Party 3.0 invitations to ${pending.length} contacts…`, 'info');

    try {
      // Send to backend API
      const publicFlyerUrl =
        process.env.NEXT_PUBLIC_FLYER_IMAGE_URL ||
        (process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_BUCKET &&
        process.env.NEXT_PUBLIC_SUPABASE_FLYER_FILE
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${process.env.NEXT_PUBLIC_SUPABASE_BUCKET}/${encodeURIComponent(process.env.NEXT_PUBLIC_SUPABASE_FLYER_FILE)}`
          : '');
      const resolvedFlyerImageUrl = publicFlyerUrl || `${window.location.origin}/api/flyer`;

      const response = await fetch('/api/send-emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contactIds: pending.map((c) => c.id),
          templateName: 'praise-party',
          contactData: pending.map((c) => ({
            id: c.id,
            name: c.name,
            email: c.email,
          })),
          fromEmail: smtp.fromEmail,
          fromName: smtp.fromName,
          flyerImageUrl: resolvedFlyerImageUrl,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        addLog(`Error: ${data.error}`, 'err');
        setRunning(false);
        return;
      }

      // Update contacts based on results
      data.results.forEach((result: any) => {
        if (result.success) {
          addLog(
            `✓ Sent → ${pending.find((c) => c.id === result.id)?.name || result.id} <${pending.find((c) => c.id === result.id)?.email || ''}>`,
            'ok'
          );
        } else {
          addLog(
            `✗ Failed → ${pending.find((c) => c.id === result.id)?.email || result.id} (${result.error})`,
            'err'
          );
        }
      });

      // Update contacts state based on API results
      setContacts((prev) =>
        prev.map((contact) => {
          const result = data.results.find((r: any) => r.id === contact.id);
          if (result) {
            return {
              ...contact,
              status: result.success ? 'sent' : 'failed',
            };
          }
          return contact;
        })
      );

      addLog(`Send complete: ${data.sentCount} sent, ${data.failedCount} failed`, 'info');
    } catch (error) {
      addLog(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'err');
    }

    setRunning(false);
  };

  const stopSend = () => {
    stopRef.current = true;
    setRunning(false);
  };

  const resetAll = () => {
    setContacts((prev) => prev.map((c) => ({ ...c, status: 'pending' as const })));
    setLogs([]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Stats */}
      <div className="stats-grid">
        <StatCard label="Selected" value={total} />
        <StatCard label="Sent" value={sent} accent="#10b981" />
        <StatCard label="Failed" value={failed} accent="#ef4444" />
        <StatCard label="Remaining" value={pending.length} accent="#6366f1" />
      </div>

      {/* Progress */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 6,
            fontSize: 12,
            color: '#64748b',
          }}
        >
          <span>Progress</span>
          <span>{pct}%</span>
        </div>
        <div
          style={{
            height: 8,
            background: '#f1f5f9',
            borderRadius: 100,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: pct + '%',
              background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
              borderRadius: 100,
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {!running ? (
          <button
            onClick={startSend}
            disabled={pending.length === 0}
            style={{
              padding: '10px 22px',
              fontSize: 13,
              fontWeight: 700,
              borderRadius: 8,
              border: 'none',
              background: pending.length === 0 ? '#e2e8f0' : '#6366f1',
              color: pending.length === 0 ? '#94a3b8' : '#fff',
              cursor: pending.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            ▶ Send ({pending.length} contacts)
          </button>
        ) : (
          <button
            onClick={stopSend}
            style={{
              padding: '10px 22px',
              fontSize: 13,
              fontWeight: 700,
              borderRadius: 8,
              border: 'none',
              background: '#ef4444',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            ■ Stop
          </button>
        )}
        <button
          onClick={resetAll}
          style={{
            padding: '10px 22px',
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            background: '#fff',
            color: '#475569',
            cursor: 'pointer',
          }}
        >
          ↺ Reset All
        </button>
      </div>

      {/* Log */}
      {logs.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#475569',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 8,
            }}
          >
            Send Log
          </div>
          <div
            style={{
              background: '#0f172a',
              borderRadius: 10,
              padding: '14px 16px',
              maxHeight: 240,
              overflowY: 'auto',
              fontFamily: "'DM Mono', monospace",
              fontSize: 12,
              lineHeight: 1.8,
            }}
          >
            {logs.map((l) => (
              <div
                key={l.id}
                style={{
                  color:
                    l.type === 'ok'
                      ? '#4ade80'
                      : l.type === 'err'
                        ? '#f87171'
                        : l.type === 'warn'
                          ? '#fcd34d'
                          : '#94a3b8',
                }}
              >
                <span style={{ color: '#4b5563' }}>{l.time} </span>
                {l.msg}
              </div>
            ))}
            {running && (
              <div style={{ color: '#6366f1', animation: 'blink 1s infinite' }}>▌</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
