'use client';

interface StatusBadgeProps {
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const map = {
    pending: { bg: '#f1f5f9', color: '#64748b', label: 'Pending' },
    sending: { bg: '#fef3c7', color: '#d97706', label: 'Sending…' },
    sent: { bg: '#dcfce7', color: '#16a34a', label: 'Sent' },
    failed: { bg: '#fee2e2', color: '#dc2626', label: 'Failed' },
    skipped: { bg: '#f1f5f9', color: '#94a3b8', label: 'Skipped' },
  };

  const s = map[status] || map.pending;

  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 100,
        letterSpacing: '0.02em',
      }}
    >
      {status === 'sending' && (
        <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', marginRight: 4 }}>
          ⟳
        </span>
      )}
      {s.label}
    </span>
  );
}
