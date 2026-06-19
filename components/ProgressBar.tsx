'use client';

export default function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ height: 8, background: '#f1f5f9', borderRadius: 100, overflow: 'hidden' }}>
      <div
        style={{
          height: '100%',
          width: `${clamped}%`,
          background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
          borderRadius: 100,
          transition: 'width 0.4s ease',
        }}
      />
    </div>
  );
}
