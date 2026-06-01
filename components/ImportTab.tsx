'use client';

import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Contact } from '@/lib/firebase';
import { EMAIL_REGEX, parseName } from '@/lib/utils';
import StatCard from './StatCard';

interface ImportResult {
  file: string;
  totalRows: number;
  found: number;
  dupes: number;
  added: number;
}

interface ImportTabProps {
  contacts: Contact[];
  setContacts: (contacts: Contact[] | ((prev: Contact[]) => Contact[])) => void;
}

export default function ImportTab({ contacts, setContacts }: ImportTabProps) {
  const [dragging, setDragging] = useState(false);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const result = e.target?.result;
        if (!result) {
          throw new Error('File read failed');
        }

        const wb = XLSX.read(new Uint8Array(result as ArrayBuffer), { type: 'array' });
        
        // Send to backend for processing
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/import', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (data.success && data.result) {
          const result = data.result;
          setLastResult({
            file: result.file,
            totalRows: result.totalRows,
            found: result.found,
            dupes: result.duplicates,
            added: result.added,
          });

          // Update local contacts state
          setContacts((prev) => [
            ...prev,
            ...result.contacts.map((c: any) => ({
              ...c,
              selected: true,
              status: 'pending' as const,
              createdAt: Date.now(),
            })),
          ]);
        }
      } catch (err) {
        alert('Failed to import file: ' + (err instanceof Error ? err.message : 'Unknown error'));
      }
    };
    reader.readAsArrayBuffer(file);
  }, [setContacts]);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  };

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
      />

      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragging ? '#6366f1' : '#cbd5e1'}`,
          borderRadius: 16,
          padding: '48px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? '#eef2ff' : '#fafafa',
          transition: 'all 0.2s',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>
          Drop your Excel or CSV file here
        </div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
          Supports <strong>.xlsx</strong>, <strong>.xls</strong>, <strong>.csv</strong> — scans all sheets automatically
        </div>
        <button
          style={{
            background: '#6366f1',
            color: '#fff',
            border: 'none',
            padding: '10px 24px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Browse files
        </button>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: '12px 16px',
          background: '#f8fafc',
          borderRadius: 10,
          border: '1px solid #e2e8f0',
          fontSize: 13,
          color: '#475569',
        }}
      >
        <strong style={{ color: '#0f172a' }}>Auto-detection:</strong> Scans column headers for keywords like{' '}
        <code style={{ background: '#e2e8f0', padding: '1px 6px', borderRadius: 4 }}>email</code>,{' '}
        <code style={{ background: '#e2e8f0', padding: '1px 6px', borderRadius: 4 }}>name</code>,{' '}
        <code style={{ background: '#e2e8f0', padding: '1px 6px', borderRadius: 4 }}>first_name</code>,{' '}
        <code style={{ background: '#e2e8f0', padding: '1px 6px', borderRadius: 4 }}>last_name</code>. Falls back to pattern-matching cell values.
      </div>

      {lastResult && (
        <div style={{ marginTop: 24 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#6366f1',
              marginBottom: 12,
            }}
          >
            ✓ {lastResult.file}
          </div>
          <div className="import-stats-grid">
            <StatCard label="Total Rows" value={lastResult.totalRows} />
            <StatCard label="Emails Found" value={lastResult.found} accent="#6366f1" />
            <StatCard label="Duplicates Removed" value={lastResult.dupes} accent="#f59e0b" />
            <StatCard label="Added" value={lastResult.added} accent="#10b981" />
          </div>
          {contacts.length > 0 && (
            <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
              <button
                onClick={() => setContacts([])}
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  border: '1px solid #fca5a5',
                  background: '#fef2f2',
                  color: '#dc2626',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Clear all contacts
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  border: '1px solid #e2e8f0',
                  background: '#fff',
                  color: '#0f172a',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                + Import another file
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
