'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '@/lib/clientApi';
import type { ContactList } from '@/lib/types';
import StatCard from './StatCard';
import { useToast } from './Toast';

interface ImportResult {
  file: string;
  totalRows: number;
  found: number;
  added: number;
  duplicates: number;
  existingDuplicates?: number;
  inlineDuplicates?: number;
  invalid?: number;
}

export default function ImportTab() {
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [listId, setListId] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    api.get('/api/lists').then((d) => setLists(d.lists)).catch(() => {});
  }, []);

  const processFile = useCallback(async (file: File) => {
    setProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (listId) formData.append('listId', listId);
      // Note: large files are parsed + bulk-upserted server-side; the unique
      // index dedupes atomically so the request returns once persisted.
      const res = await fetch('/api/import', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Import failed');
      setResult(data.result);
      toast.success(`Imported ${data.result.added} new contact${data.result.added === 1 ? '' : 's'} from ${data.result.file}.`);
    } catch (err) {
      toast.error(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setProcessing(false);
    }
  }, [listId, toast]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Add imported contacts to list:</label>
        <select value={listId} onChange={(e) => setListId(e.target.value)}
          style={{ padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <option value="">— None —</option>
          {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
        onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])} />

      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
        style={{ border: `2px dashed ${dragging ? '#6366f1' : '#cbd5e1'}`, borderRadius: 16, padding: '48px 24px', textAlign: 'center', cursor: 'pointer', background: dragging ? '#eef2ff' : '#fafafa', transition: 'all 0.2s' }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>Drop your Excel or CSV file here</div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>Supports <strong>.xlsx</strong>, <strong>.xls</strong>, <strong>.csv</strong> — scans all sheets automatically</div>
        <button disabled={processing}
          style={{ background: processing ? '#c7d2fe' : '#6366f1', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: processing ? 'not-allowed' : 'pointer' }}>
          {processing ? 'Importing…' : 'Browse files'}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#6366f1', marginBottom: 12 }}>✓ {result.file}</div>
          <div className="import-stats-grid">
            <StatCard label="Total Rows" value={result.totalRows} />
            <StatCard label="Valid Emails" value={result.found} accent="#6366f1" />
            <StatCard label="Added" value={result.added} accent="#10b981" />
            <StatCard label="Duplicates Skipped" value={result.duplicates} accent="#f59e0b" />
            {result.invalid ? <StatCard label="Invalid Skipped" value={result.invalid} accent="#ef4444" /> : null}
          </div>
        </div>
      )}
    </div>
  );
}
