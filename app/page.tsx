'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Contact } from '@/lib/firebase';
import { EMAIL_REGEX, parseName, generateId, sleep, generateAvatarInitials, getAvatarColor } from '@/lib/utils';
import ImportTab from '@/components/ImportTab';
import ContactsTab from '@/components/ContactsTab';
import SendTab from '@/components/SendTab';

const TABS = ['import', 'contacts', 'send'] as const;
const TAB_LABELS = {
  import: '📥 Import',
  contacts: '👥 Contacts',
  send: '🚀 Send',
};

interface SMTPConfig {
  fromName: string;
  fromEmail: string;
}

export default function Home() {
  const [tab, setTab] = useState<typeof TABS[number]>('import');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [smtp, setSmtp] = useState<SMTPConfig>({
    fromName: 'Praise Party 3.0',
    fromEmail: process.env.NEXT_PUBLIC_FROM_EMAIL || 'noreply@resend.dev',
  });
  const [loading, setLoading] = useState(false);

  // Load contacts from backend on mount
  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      const response = await fetch('/api/contacts');
      const data = await response.json();
      if (data.success) {
        setContacts(data.contacts);
      }
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
  };

  const pendingCount = contacts.filter(
    (c) => c.selected && c.status === 'pending'
  ).length;
  const sentCount = contacts.filter((c) => c.status === 'sent').length;

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>

      <div className="page-shell">
        {/* Top bar */}
        <div className="page-header" style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 32px', position: 'sticky', top: 0, zIndex: 100 }}>
          <div className="page-inner page-header-inner">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                }}
              >
                ✉️
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Email Tool</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: -2 }}>
                  Resend + Firebase
                </div>
              </div>
            </div>
            <div className="top-badges" style={{ display: 'flex', gap: 4 }}>
              {contacts.length > 0 && (
                <>
                  <span
                    style={{
                      fontSize: 11,
                      padding: '3px 10px',
                      borderRadius: 100,
                      background: '#eef2ff',
                      color: '#6366f1',
                      fontWeight: 600,
                      alignSelf: 'center',
                      marginRight: 8,
                    }}
                  >
                    {contacts.length} contacts
                  </span>
                  {sentCount > 0 && (
                    <span
                      style={{
                        fontSize: 11,
                        padding: '3px 10px',
                        borderRadius: 100,
                        background: '#dcfce7',
                        color: '#16a34a',
                        fontWeight: 600,
                        alignSelf: 'center',
                        marginRight: 8,
                      }}
                    >
                      {sentCount} sent
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="page-tabs" style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 32px' }}>
          <div className="page-inner page-tabs-inner">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '12px 20px',
                  fontSize: 13,
                  fontWeight: 600,
                  border: 'none',
                  borderBottom: `2px solid ${tab === t ? '#6366f1' : 'transparent'}`,
                  background: 'none',
                  color: tab === t ? '#6366f1' : '#64748b',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {TAB_LABELS[t]}
                {t === 'contacts' && contacts.length > 0 && (
                  <span
                    style={{
                      fontSize: 10,
                      padding: '1px 6px',
                      borderRadius: 100,
                      background: '#6366f1',
                      color: '#fff',
                    }}
                  >
                    {contacts.length}
                  </span>
                )}
                {t === 'send' && pendingCount > 0 && (
                  <span
                    style={{
                      fontSize: 10,
                      padding: '1px 6px',
                      borderRadius: 100,
                      background: '#f59e0b',
                      color: '#fff',
                    }}
                  >
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="page-inner page-inner--padded">
          {tab === 'import' && <ImportTab contacts={contacts} setContacts={setContacts} />}
          {tab === 'contacts' && <ContactsTab contacts={contacts} setContacts={setContacts} />}
          {tab === 'send' && (
            <SendTab contacts={contacts} setContacts={setContacts} smtp={smtp} />
          )}
        </div>
      </div>
    </>
  );
}
