'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabaseBrowser';
import DashboardTab from '@/components/DashboardTab';
import ImportTab from '@/components/ImportTab';
import ContactsTab from '@/components/ContactsTab';
import SendTab from '@/components/SendTab';
import LogsTab from '@/components/LogsTab';

const TABS = ['dashboard', 'import', 'contacts', 'send', 'logs'] as const;
const LABELS: Record<(typeof TABS)[number], string> = {
  dashboard: '📊 Dashboard',
  import: '📥 Import',
  contacts: '👥 Contacts',
  send: '✉️ Send',
  logs: '📜 Logs',
};

export default function Home() {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>('dashboard');

  const signOut = async () => {
    await getBrowserSupabase().auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div className="page-shell">
        <div className="page-header" style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 32px', position: 'sticky', top: 0, zIndex: 100 }}>
          <div className="page-inner page-header-inner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>✉️</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Email Tool</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: -2 }}>Bulk email platform</div>
              </div>
            </div>
            <button onClick={signOut} style={{ fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer' }}>
              Sign out
            </button>
          </div>
        </div>

        <div className="page-tabs" style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 32px' }}>
          <div className="page-inner page-tabs-inner" style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding: '12px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderBottom: `2px solid ${tab === t ? '#6366f1' : 'transparent'}`, background: 'none', color: tab === t ? '#6366f1' : '#64748b', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="page-inner page-inner--padded">
          {tab === 'dashboard' && <DashboardTab />}
          {tab === 'import' && <ImportTab />}
          {tab === 'contacts' && <ContactsTab />}
          {tab === 'send' && <SendTab />}
          {tab === 'logs' && <LogsTab />}
        </div>
      </div>
    </>
  );
}
