'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiClientError, api } from '../lib/api';
import { TextField } from '../ui/fields';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState(process.env.NEXT_PUBLIC_TENANT_SLUG ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await api.post('/auth/login', {
        email,
        password,
        ...(tenantSlug.trim() ? { tenantSlug: tenantSlug.trim() } : {}),
      });
      router.replace('/');
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiClientError
          ? caughtError.message
          : 'Unable to reach the API. Try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="eyebrow">Payload CMS</div>
        <h1 id="login-title">Sign in to your workspace</h1>
        <p className="muted">Manage sites, pages, drafts and assets from one place.</p>
        <form className="stack" onSubmit={handleSubmit}>
          <TextField
            autoComplete="email"
            label="Email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
          <TextField
            autoComplete="organization"
            label="Tenant slug"
            name="tenantSlug"
            onChange={(event) => setTenantSlug(event.target.value)}
            placeholder="demo"
            value={tenantSlug}
          />
          <TextField
            autoComplete="current-password"
            label="Password"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          {error ? (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          ) : null}
          <button className="button button-primary" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}
