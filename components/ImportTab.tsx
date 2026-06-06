'use client';

import { useState, useRef, useCallback } from 'react';
import { Contact } from '@/lib/firebase';
import { EMAIL_REGEX, parseName } from '@/lib/utils';
import StatCard from './StatCard';

interface ImportResult {
  file: string;
  totalRows: number;
  found: number;
  dupes: number;
  existingDuplicates?: number;
  inlineDuplicates?: number;
  added: number;
  errors?: number;
}

interface ImportTabProps {
  contacts: Contact[];
  setContacts: (contacts: Contact[] | ((prev: Contact[]) => Contact[])) => void;
}

export default function ImportTab({ contacts, setContacts }: ImportTabProps) {
  const [dragging, setDragging] = useState(false);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    setProcessing(true);
    setErrorMessage(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const fileBuffer = e.target?.result;
        if (!fileBuffer) {
          throw new Error('File read failed');
        }

        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/import', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Import failed');
        }

        if (!data.result) {
          throw new Error('Import result missing');
        }

        const apiResult = data.result;
        setLastResult({
          file: apiResult.file,
          totalRows: apiResult.totalRows,
          found: apiResult.found,
          dupes: apiResult.duplicates,
          existingDuplicates: apiResult.existingDuplicates,
          inlineDuplicates: apiResult.inlineDuplicates,
          added: apiResult.added,
        });

        if (apiResult.contacts?.length) {
          setContacts((prev) => [
            ...prev,
            ...apiResult.contacts.map((c: any) => ({
              ...c,
              selected: true,
              status: 'pending' as const,
              createdAt: Date.now(),
            })),
          ]);
        }
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setProcessing(false);
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
          disabled={processing}
          style={{
            background: processing ? '#c7d2fe' : '#6366f1',
            color: '#fff',
            border: 'none',
            padding: '10px 24px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: processing ? 'not-allowed' : 'pointer',
          }}
        >
          {processing ? 'Importing…' : 'Browse files'}
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

      {errorMessage && (
        <div
          style={{
            marginTop: 24,
            padding: '12px 16px',
            background: '#fee2e2',
            color: '#991b1b',
            borderRadius: 10,
            border: '1px solid #fecaca',
            fontSize: 13,
          }}
        >
          <strong>Error importing file:</strong> {errorMessage}
        </div>
      )}
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
            {lastResult.existingDuplicates ? (
              <StatCard label="Existing Emails Skipped" value={lastResult.existingDuplicates} accent="#f59e0b" />
            ) : null}
            {lastResult.inlineDuplicates ? (
              <StatCard label="Duplicate Rows Skipped" value={lastResult.inlineDuplicates} accent="#f59e0b" />
            ) : null}
            {lastResult.errors ? (
              <StatCard label="Import Errors" value={lastResult.errors} accent="#ef4444" />
            ) : null}
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
