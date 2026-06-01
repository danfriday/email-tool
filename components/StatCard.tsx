'use client';

interface StatCardProps {
  label: string;
  value: number | string;
  accent?: string;
}

export default function StatCard({ label, value, accent }: StatCardProps) {
  return (
    <div
      style={{
        background: '#fafafa',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: '14px 18px',
        borderTop: accent ? `3px solid ${accent}` : '1px solid #e2e8f0',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#94a3b8',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: accent || '#0f172a',
          fontFamily: "'DM Mono', monospace",
        }}
      >
        {value}
      </div>
    </div>
  );
}
