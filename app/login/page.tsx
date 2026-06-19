'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabaseBrowser';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = getBrowserSupabase();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      const redirect = params.get('redirect') || '/';
      router.push(redirect);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', padding: 24 }}>
      <form
        onSubmit={handleSubmit}
        style={{ width: '100%', maxWidth: 360, background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>✉️</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Email Tool</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Admin sign in</div>
          </div>
        </div>

        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          style={{ width: '100%', padding: '10px 12px', margin: '6px 0 16px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }}
        />

        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          style={{ width: '100%', padding: '10px 12px', margin: '6px 0 20px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }}
        />

        {error && (
          <div style={{ marginBottom: 16, padding: '10px 12px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', fontSize: 13 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{ width: '100%', padding: '11px', borderRadius: 8, border: 'none', background: loading ? '#a5b4fc' : '#6366f1', color: '#fff', fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
