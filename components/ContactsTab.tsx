'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, debounce } from '@/lib/clientApi';
import type { Contact, ContactList, Paginated } from '@/lib/types';
import Avatar from './Avatar';
import { useToast } from './Toast';

type Filter = 'all' | 'active' | 'suppressed';
type Sort = 'created_at' | 'name' | 'email';

export default function ContactsTab() {
  const [data, setData] = useState<Paginated<Contact> | null>(null);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('created_at');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const pageSize = 50;

  const debouncedSetSearch = useMemo(
    () => debounce((v: string) => { setSearch(v); setPage(1); }, 300),
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page), pageSize: String(pageSize),
        filter, sort, order,
      });
      if (search) params.set('search', search);
      const res = await api.get<Paginated<Contact> & { success: true }>(`/api/contacts?${params}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, [page, search, filter, sort, order]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/api/lists').then((d) => setLists(d.lists)).catch(() => {});
  }, []);

  const items = data?.items ?? [];
  const allOnPageSelected = items.length > 0 && items.every((c) => selected.has(c.id));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) items.forEach((c) => next.delete(c.id));
      else items.forEach((c) => next.add(c.id));
      return next;
    });
  };

  const addContact = async () => {
    if (!newEmail.trim()) { toast.error('Enter an email address.'); return; }
    setBusy(true);
    try {
      await api.post('/api/contacts', { name: newName, email: newEmail });
      setNewName(''); setNewEmail('');
      await load();
      toast.success('Contact added.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add contact');
    } finally { setBusy(false); }
  };

  const deleteSelected = async () => {
    if (!selected.size) return;
    const count = selected.size;
    if (!confirm(`Delete ${count} contact(s)? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.del('/api/contacts', { ids: Array.from(selected) });
      setSelected(new Set());
      await load();
      toast.success(`Deleted ${count} contact${count === 1 ? '' : 's'}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally { setBusy(false); }
  };

  const deleteOne = async (id: string) => {
    if (!confirm('Delete this contact?')) return;
    try { await api.del(`/api/contacts?id=${id}`); await load(); toast.success('Contact deleted.'); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Delete failed'); }
  };

  const addSelectedToList = async (listId: string) => {
    if (!listId || !selected.size) return;
    setBusy(true);
    try {
      const r = await api.post('/api/lists/members', { listId, contactIds: Array.from(selected) });
      toast.success(`Added ${r.added} contact${r.added === 1 ? '' : 's'} to list.`);
      api.get('/api/lists').then((d) => setLists(d.lists)).catch(() => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add to list');
    } finally { setBusy(false); }
  };

  const toggleSuppress = async (c: Contact) => {
    try {
      await api.patch('/api/contacts', { id: c.id, suppressed: !c.suppressed });
      await load();
      toast.success(c.suppressed ? 'Contact un-suppressed.' : 'Contact suppressed.');
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Update failed'); }
  };

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;

  return (
    <div>
      {/* toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Search name or email…"
          value={searchInput}
          onChange={(e) => { setSearchInput(e.target.value); debouncedSetSearch(e.target.value); }}
          style={{ flex: '1 1 220px', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8 }}
        />
        {(['all', 'active', 'suppressed'] as Filter[]).map((f) => (
          <button key={f} onClick={() => { setFilter(f); setPage(1); }}
            style={chip(filter === f)}>
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} style={select}>
          <option value="created_at">Date added</option>
          <option value="name">Name</option>
          <option value="email">Email</option>
        </select>
        <button onClick={() => setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))} style={chip(false)}>
          {order === 'asc' ? '↑ Asc' : '↓ Desc'}
        </button>
      </div>

      {/* add + batch */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }} />
        <input placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }} />
        <button onClick={addContact} disabled={busy}
          style={{ padding: '8px 14px', borderRadius: 8, background: '#6366f1', color: '#fff', border: 'none', fontWeight: 600 }}>
          + Add
        </button>

        {selected.size > 0 && (
          <>
            <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b' }}>{selected.size} selected</span>
            <select defaultValue="" onChange={(e) => { addSelectedToList(e.target.value); e.target.value = ''; }} style={select} disabled={busy}>
              <option value="" disabled>Add to list…</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button onClick={deleteSelected} disabled={busy}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', fontWeight: 600 }}>
              Delete selected
            </button>
          </>
        )}
      </div>

      {error && <div style={{ marginBottom: 12, color: '#b91c1c', fontSize: 13 }}>{error}</div>}

      {/* table */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={{ padding: '10px 14px', width: 36 }}>
                <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} />
              </th>
              <th style={th}>Name</th>
              <th style={th}>Email</th>
              <th style={th}>State</th>
              <th style={{ ...th, width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c, i) => (
              <tr key={c.id} style={{ background: selected.has(c.id) ? '#f5f3ff' : i % 2 ? '#fafafa' : '#fff', borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: '10px 14px' }}>
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={c.name || c.email} />
                    <span style={{ fontWeight: 500, color: '#0f172a' }}>{c.name || '—'}</span>
                  </div>
                </td>
                <td style={{ padding: '10px 14px', color: '#475569', fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{c.email}</td>
                <td style={{ padding: '10px 14px' }}>
                  {c.suppressed
                    ? <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: '#ffedd5', color: '#c2410c' }}>Suppressed</span>
                    : <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: '#dcfce7', color: '#16a34a' }}>Active</span>}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => toggleSuppress(c)} title={c.suppressed ? 'Un-suppress' : 'Suppress'}
                      style={iconBtn}>{c.suppressed ? '↺' : '🚫'}</button>
                    <button onClick={() => deleteOne(c.id)} title="Delete" style={iconBtn}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>No contacts found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, fontSize: 12, color: '#64748b' }}>
        <span>{total} total{loading ? ' · loading…' : ''}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={chip(false)}>← Prev</button>
          <span>Page {page} of {Math.max(1, totalPages)}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages} style={chip(false)}>Next →</button>
        </div>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' };
const iconBtn: React.CSSProperties = { border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: '#94a3b8', padding: '2px 4px', borderRadius: 4 };
const select: React.CSSProperties = { padding: '7px 10px', fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569' };
function chip(active: boolean): React.CSSProperties {
  return { padding: '7px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: '1px solid', cursor: 'pointer', borderColor: active ? '#6366f1' : '#e2e8f0', background: active ? '#eef2ff' : '#fff', color: active ? '#6366f1' : '#475569' };
}
