'use client';

import {
  createContext, useCallback, useContext, useMemo, useRef, useState,
  type ReactNode,
} from 'react';

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
  duration: number; // ms; 0 = sticky until dismissed
}

interface ToastApi {
  show: (message: string, type?: ToastType, duration?: number) => number;
  success: (message: string, duration?: number) => number;
  error: (message: string, duration?: number) => number;
  info: (message: string, duration?: number) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Hook used anywhere under <ToastProvider> to fire toasts. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

const STYLES: Record<ToastType, { accent: string; bg: string; icon: string }> = {
  success: { accent: '#16a34a', bg: '#f0fdf4', icon: '✓' },
  error: { accent: '#dc2626', bg: '#fef2f2', icon: '✕' },
  info: { accent: '#6366f1', bg: '#eef2ff', icon: 'ℹ' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const handle = timers.current.get(id);
    if (handle) { clearTimeout(handle); timers.current.delete(id); }
  }, []);

  const show = useCallback(
    (message: string, type: ToastType = 'info', duration = type === 'error' ? 6000 : 4000) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, type, message, duration }]);
      if (duration > 0) {
        timers.current.set(id, setTimeout(() => dismiss(id), duration));
      }
      return id;
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(() => ({
    show,
    success: (m, d) => show(m, 'success', d),
    error: (m, d) => show(m, 'error', d),
    info: (m, d) => show(m, 'info', d),
    dismiss,
  }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(24px) scale(0.96); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
      `}</style>
      <div
        style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999,
          display: 'flex', flexDirection: 'column', gap: 10,
          maxWidth: 'min(380px, calc(100vw - 32px))', pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => {
          const s = STYLES[t.type];
          return (
            <div
              key={t.id}
              role="status"
              style={{
                pointerEvents: 'auto',
                display: 'flex', alignItems: 'flex-start', gap: 12,
                background: '#fff', border: '1px solid #e2e8f0',
                borderLeft: `4px solid ${s.accent}`, borderRadius: 12,
                padding: '12px 14px', boxShadow: '0 10px 30px rgba(15,23,42,0.12)',
                animation: 'toast-in 0.22s cubic-bezier(0.16,1,0.3,1)',
              }}
            >
              <div style={{
                flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
                background: s.bg, color: s.accent, fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
              }}>
                {s.icon}
              </div>
              <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5, color: '#0f172a', wordBreak: 'break-word' }}>
                {t.message}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                style={{
                  flexShrink: 0, border: 'none', background: 'none', cursor: 'pointer',
                  color: '#94a3b8', fontSize: 15, lineHeight: 1, padding: 2, marginTop: -1,
                }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
