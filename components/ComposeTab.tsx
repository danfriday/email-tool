'use client';

import { useState } from 'react';
import { Contact } from '@/lib/firebase';
import Avatar from './Avatar';

interface SMTPConfig {
  fromName: string;
  fromEmail: string;
}

interface ComposeState {
  subject: string;
  body: string;
}

interface ComposeTabProps {
  smtp: SMTPConfig;
  setSmtp: (smtp: SMTPConfig | ((prev: SMTPConfig) => SMTPConfig)) => void;
  compose: ComposeState;
  setCompose: (compose: ComposeState | ((prev: ComposeState) => ComposeState)) => void;
  contacts: Contact[];
}

export default function ComposeTab({
  smtp,
  setSmtp,
  compose,
  setCompose,
  contacts,
}: ComposeTabProps) {
  const [showPreview, setShowPreview] = useState(false);

  const sample = contacts.find((c) => c.selected) || contacts[0];
  const previewName = sample?.name || 'Sample Name';
  const previewEmail = sample?.email || 'recipient@example.com';

  const field = (label: string, key: keyof SMTPConfig, type = 'text', placeholder = '') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#475569',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        value={smtp[key] || ''}
        onChange={(e) => setSmtp((p) => ({ ...p, [key]: e.target.value }))}
        style={{
          padding: '9px 12px',
          fontSize: 13,
          borderRadius: 8,
          border: '1px solid #e2e8f0',
          background: '#fff',
          color: '#0f172a',
          outline: 'none',
          fontFamily: "'DM Mono', monospace",
        }}
      />
    </div>
  );

  const interpolate = (template: string, name: string) => {
    return template.replace(/\{\{name\}\}/gi, name).replace(/\{\{email\}\}/gi, previewEmail);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* From Email */}
      <section>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#0f172a',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 18 }}>🔐</span> Sender Configuration
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {field('From Name', 'fromName', 'text', 'Your Company')}
          {field('From Email', 'fromEmail', 'email', 'noreply@resend.dev')}
        </div>
        <div
          style={{
            marginTop: 12,
            padding: '10px 14px',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 8,
            fontSize: 12,
            color: '#92400e',
          }}
        >
          💡 Update your Resend API key in <code style={{ background: '#fef3c7', padding: '1px 5px' }}>.env.local</code>
        </div>
      </section>

      <div style={{ borderTop: '1px solid #f1f5f9' }} />

      {/* Email content */}
      <section>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#0f172a',
            marginBottom: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 18 }}>✉️</span> Email Content
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
          Use <code style={{ background: '#e2e8f0', padding: '1px 6px', borderRadius: 4 }}>
            {"{{name}}"}
          </code>{' '}
          and{' '}
          <code style={{ background: '#e2e8f0', padding: '1px 6px', borderRadius: 4 }}>
            {"{{email}}"}
          </code>{' '}
          to personalize each email.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Subject
            </label>
            <input
              type="text"
              placeholder="Hello {{name}}, you're invited!"
              value={compose.subject}
              onChange={(e) => setCompose((p) => ({ ...p, subject: e.target.value }))}
              style={{
                padding: '9px 12px',
                fontSize: 13,
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                background: '#fff',
                color: '#0f172a',
                outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Message Body
            </label>
            <textarea
              rows={8}
              placeholder={'Hi {{name}},\n\nYou\'re invited to join us!\n\nBest regards'}
              value={compose.body}
              onChange={(e) => setCompose((p) => ({ ...p, body: e.target.value }))}
              style={{
                padding: '10px 12px',
                fontSize: 13,
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                background: '#fff',
                color: '#0f172a',
                outline: 'none',
                resize: 'vertical',
                lineHeight: 1.7,
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
          <button
            onClick={() => setShowPreview((p) => !p)}
            style={{
              padding: '9px 20px',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: '#fff',
              color: '#475569',
              cursor: 'pointer',
            }}
          >
            {showPreview ? 'Hide preview' : '👁 Preview'}
          </button>
        </div>
      </section>

      {/* Preview */}
      {showPreview && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
          <div
            style={{
              background: '#f8fafc',
              padding: '10px 16px',
              fontSize: 11,
              fontWeight: 700,
              color: '#94a3b8',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              borderBottom: '1px solid #e2e8f0',
            }}
          >
            Preview — {sample ? `sent to ${previewName}` : 'no contacts imported yet'}
          </div>
          <div style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
              From: {smtp.fromName || 'Sender'} &lt;{smtp.fromEmail || 'sender@example.com'}&gt;
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
              To: {previewEmail}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>
              {compose.subject ? interpolate(compose.subject, previewName) : '(no subject)'}
            </div>
            <pre
              style={{
                fontSize: 13,
                color: '#334155',
                lineHeight: 1.8,
                fontFamily: 'inherit',
                whiteSpace: 'pre-wrap',
                margin: 0,
              }}
            >
              {compose.body ? interpolate(compose.body, previewName) : '(no body)'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
