'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PROMOTION } from '../config';
import { track } from '../client/api';
import { chromeIntentUrl, isAndroid, isInAppBrowser } from '../client/browser';
import { browserAuth } from '../client/supabase';
import './rewards.css';

const RESEND_SECONDS = 60;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9l3.7-2.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.6l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}

/**
 * Email code first, because it works inside Instagram's browser and keeps the
 * player on this page. Google appears only in a regular browser, where Google
 * allows it.
 */
export function SignIn({
  next,
  onSignedIn,
  allowBrowserSwitch = true,
}: {
  next: string;
  onSignedIn: () => void;
  /** False while a mission result is waiting: it belongs to this browser and would be lost by switching. */
  allowBrowserSwitch?: boolean;
}) {
  const [inApp, setInApp] = useState<boolean | null>(null);
  const [android, setAndroid] = useState(false);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [ageOk, setAgeOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInApp(isInAppBrowser());
    setAndroid(isAndroid());
    track('sign_in_view');
    if (new URLSearchParams(window.location.search).get('signin') === 'failed') {
      setError("Google sign-in didn't finish. Try again, or use an email code.");
    }
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  useEffect(() => {
    if (step === 'code') codeInput.current?.focus();
  }, [step]);

  const auth = browserAuth();
  if (!auth) return <p className="rw-muted">Sign-in isn&apos;t available right now.</p>;

  const needAge = () => {
    if (ageOk) return true;
    setError(`Please confirm you are ${PROMOTION.minAge} or older.`);
    return false;
  };

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault();
    setError('');
    if (!needAge()) return;
    const address = email.trim();
    if (!EMAIL.test(address)) return setError('Enter a valid email address.');
    setBusy(true);
    const { error: err } = await auth.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } });
    setBusy(false);
    if (err) {
      setError(
        err.status === 429 ? 'Too many codes requested. Wait a minute and try again.' : "We couldn't send the code. Try again."
      );
      return;
    }
    setStep('code');
    setCode('');
    setCooldown(RESEND_SECONDS);
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const token = code.replace(/\D/g, '');
    if (token.length < 6) return setError('Enter the code from the email.');
    setBusy(true);
    const { error: err } = await auth.auth.verifyOtp({ email: email.trim(), token, type: 'email' });
    setBusy(false);
    if (err) {
      setError(/expired/i.test(err.message) ? 'That code expired. Send a new one.' : "That code didn't match. Check the email and try again.");
      return;
    }
    onSignedIn();
  };

  const google = async () => {
    setError('');
    if (!needAge()) return;
    setBusy(true);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error: err } = await auth.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (err) {
      setBusy(false);
      setError("Google sign-in couldn't start. Use an email code instead.");
    }
  };

  return (
    <div className="rw-signin card">
      {step === 'email' ? (
        <form onSubmit={sendCode} noValidate>
          <label className="rw-field">
            <span>Email</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="rw-check">
            <input type="checkbox" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)} />
            <span>I am {PROMOTION.minAge} or older.</span>
          </label>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Sending…' : 'Email me a code'}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} noValidate>
          <p className="rw-muted">
            We sent a 6-digit code to <b>{email.trim()}</b>. Keep this page open while you check your email.
          </p>
          <label className="rw-field">
            <span>Code</span>
            <input
              ref={codeInput}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={busy}
            />
          </label>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <div className="rw-row">
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => void sendCode()} disabled={busy || cooldown > 0}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setStep('email')} disabled={busy}>
              Change email
            </button>
          </div>
          <p className="rw-fine">No email? Check your spam folder.</p>
        </form>
      )}

      {error && (
        <p className="rw-error" role="alert">
          {error}
        </p>
      )}

      {step === 'email' && inApp === false && (
        <>
          <div className="rw-or">
            <span>or</span>
          </div>
          <button type="button" className="btn btn-secondary btn-block rw-google" onClick={() => void google()} disabled={busy}>
            <GoogleIcon />
            Continue with Google
          </button>
        </>
      )}

      {step === 'email' && inApp && allowBrowserSwitch && (
        <p className="rw-fine">
          Want to use Google sign-in? Open this page in your browser first
          {android ? (
            <>
              :{' '}
              <a className="rw-link" href={chromeIntentUrl(window.location.href)}>
                Open in Chrome
              </a>
            </>
          ) : (
            <> from the ••• menu (Open in external browser).</>
          )}
        </p>
      )}

      {(PROMOTION.termsUrl || PROMOTION.privacyUrl) && (
        <p className="rw-fine">
          By signing in you agree to the{' '}
          {PROMOTION.termsUrl && (
            <a className="rw-link" href={PROMOTION.termsUrl} target="_blank" rel="noreferrer">
              Terms
            </a>
          )}
          {PROMOTION.termsUrl && PROMOTION.privacyUrl && ' and '}
          {PROMOTION.privacyUrl && (
            <a className="rw-link" href={PROMOTION.privacyUrl} target="_blank" rel="noreferrer">
              Privacy Policy
            </a>
          )}
          .
        </p>
      )}
    </div>
  );
}
