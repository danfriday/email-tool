'use client';

import { useState } from 'react';
import { Contact } from '@/lib/firebase';
import Avatar from './Avatar';
import StatusBadge from './StatusBadge';

interface ContactsTabProps {
  contacts: Contact[];
  setContacts: (contacts: Contact[] | ((prev: Contact[]) => Contact[])) => void;
}

export default function ContactsTab({ contacts, setContacts }: ContactsTabProps) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'sent' | 'failed' | 'bounced'>('all');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [showAddInline, setShowAddInline] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
    const matchStatus = filterStatus === 'all' || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const toggleSelect = (id: string | undefined) => {
    if (!id) return;
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c))
    );
  };

  const toggleAll = (checked: boolean) => {
    setContacts((prev) =>
      prev.map((c) =>
        filtered.find((f) => f.id === c.id) ? { ...c, selected: checked } : c
      )
    );
  };

  const removeSelected = () => {
    setContacts((prev) => prev.filter((c) => !c.selected));
  };

  const removeOne = (id: string | undefined) => {
    if (!id) return;
    setContacts((prev) => prev.filter((c) => c.id !== id));
  };

  const resetStatus = (id: string | undefined) => {
    if (!id) return;
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: 'pending' } : c))
    );
  };

  const allChecked = filtered.length > 0 && filtered.every((c) => c.selected);
  const selectedCount = contacts.filter((c) => c.selected).length;

  const statusCounts = {
    all: contacts.length,
    pending: contacts.filter((c) => c.status === 'pending').length,
    sent: contacts.filter((c) => c.status === 'sent').length,
    failed: contacts.filter((c) => c.status === 'failed').length,
    bounced: contacts.filter((c) => c.status === 'bounced').length,
  };

  if (contacts.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 24px', color: '#94a3b8' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
          No contacts yet
        </div>
        <div style={{ fontSize: 14, marginBottom: 12 }}>Import an Excel/CSV or add contacts manually</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <input
            placeholder="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}
          />
          <input
            placeholder="Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}
          />
          <button
            onClick={async () => {
              if (!newEmail) {
                setFormError('Please enter a valid email address.');
                return;
              }
              setAdding(true);
              setFormError(null);
              try {
                const res = await fetch('/api/contacts', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: newName, email: newEmail }),
                });
                const data = await res.json();
                if (data.success && data.contact) {
                  setContacts((prev) => [
                    ...prev,
                    { ...data.contact, selected: false },
                  ]);
                  setNewName('');
                  setNewEmail('');
                  setFormError(null);
                } else {
                  setFormError(data.error || 'Failed to add contact');
                }
              } catch (err) {
                setFormError('Failed to add contact');
              }
              setAdding(false);
            }}
            disabled={adding}
            style={{ padding: '8px 12px', borderRadius: 8, background: '#6366f1', color: '#fff', border: 'none' }}
          >
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
        {formError && (
          <div style={{ marginTop: 12, color: '#b91c1c', fontSize: 13 }}>
            {formError}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* toolbar */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          marginBottom: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: '1 1 200px',
            padding: '8px 12px',
            fontSize: 13,
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            background: '#fff',
            color: '#0f172a',
            outline: 'none',
          }}
        />
        {(['all', 'pending', 'sent', 'failed', 'bounced'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            style={{
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              border: '1px solid',
              cursor: 'pointer',
              transition: 'all 0.15s',
              borderColor: filterStatus === s ? '#6366f1' : '#e2e8f0',
              background: filterStatus === s ? '#eef2ff' : '#fff',
              color: filterStatus === s ? '#6366f1' : '#475569',
            }}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)} ({statusCounts[s]})
          </button>
        ))}
        {selectedCount > 0 && (
          <button
            onClick={removeSelected}
            style={{
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              border: '1px solid #fca5a5',
              background: '#fef2f2',
              color: '#dc2626',
              cursor: 'pointer',
            }}
          >
            Remove {selectedCount} selected
          </button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {!showAddInline && (
            <button
              onClick={() => setShowAddInline(true)}
              style={{
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              + Add Contact
            </button>
          )}
          {showAddInline && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  placeholder="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <input
                  placeholder="Email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <button
                  onClick={async () => {
                    if (!newEmail) {
                      setFormError('Please enter a valid email address.');
                      return;
                    }
                    setAdding(true);
                    setFormError(null);
                    try {
                      const res = await fetch('/api/contacts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: newName, email: newEmail }),
                      });
                      const data = await res.json();
                      if (data.success && data.contact) {
                        setContacts((prev) => [
                          ...prev,
                          { ...data.contact, selected: false },
                        ]);
                        setNewName('');
                        setNewEmail('');
                        setShowAddInline(false);
                        setFormError(null);
                      } else {
                        setFormError(data.error || 'Failed to add contact');
                      }
                    } catch (err) {
                      setFormError('Failed to add contact');
                    }
                    setAdding(false);
                  }}
                  disabled={adding}
                  style={{ padding: '8px 12px', borderRadius: 8, background: '#6366f1', color: '#fff', border: 'none' }}
                >
                  {adding ? 'Adding...' : 'Add'}
                </button>
                <button
                  onClick={() => {
                    setShowAddInline(false);
                    setNewName('');
                    setNewEmail('');
                    setFormError(null);
                  }}
                  style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff' }}
                >
                  Cancel
                </button>
              </div>
              {formError && (
                <div style={{ marginTop: 10, color: '#b91c1c', fontSize: 13 }}>
                  {formError}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* table */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={{ padding: '10px 14px', textAlign: 'left', width: 36 }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => toggleAll(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
              </th>
              <th
                style={{
                  padding: '10px 14px',
                  textAlign: 'left',
                  color: '#64748b',
                  fontWeight: 600,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Name
              </th>
              <th
                style={{
                  padding: '10px 14px',
                  textAlign: 'left',
                  color: '#64748b',
                  fontWeight: 600,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Email
              </th>
              <th
                style={{
                  padding: '10px 14px',
                  textAlign: 'left',
                  color: '#64748b',
                  fontWeight: 600,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Status
              </th>
              <th style={{ padding: '10px 14px', width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr
                key={c.id}
                style={{
                  background: c.selected ? '#f5f3ff' : i % 2 === 0 ? '#fff' : '#fafafa',
                  borderTop: '1px solid #f1f5f9',
                }}
              >
                <td style={{ padding: '10px 14px' }}>
                  <input
                    type="checkbox"
                    checked={!!c.selected}
                    onChange={() => toggleSelect(c.id)}
                    style={{ cursor: 'pointer' }}
                  />
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={c.name} />
                    <span style={{ fontWeight: 500, color: '#0f172a' }}>{c.name}</span>
                  </div>
                </td>
                <td
                  style={{
                    padding: '10px 14px',
                    color: '#475569',
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 12,
                  }}
                >
                  {c.email}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <StatusBadge status={c.status || 'pending'} />
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(c.status === 'sent' || c.status === 'failed' || c.status === 'bounced') && (
                      <button
                        onClick={() => resetStatus(c.id)}
                        title="Reset to pending"
                        style={{
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          fontSize: 14,
                          color: '#94a3b8',
                          padding: '2px 4px',
                          borderRadius: 4,
                        }}
                      >
                        ↺
                      </button>
                    )}
                    <button
                      onClick={() => removeOne(c.id)}
                      title="Remove"
                      style={{
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        fontSize: 14,
                        color: '#94a3b8',
                        padding: '2px 4px',
                        borderRadius: 4,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: '32px',
                    textAlign: 'center',
                    color: '#94a3b8',
                    fontSize: 13,
                  }}
                >
                  No contacts match your filter
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>
        Showing {filtered.length} of {contacts.length} contacts
      </div>
    </div>
  );
}
