'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { GameShell } from '@/components/arcade/GameShell';
import { getGame, type GameSlug } from '@/games/registry';
import type { AdminCoupon, AdminOverview } from '../server/admin';
import { formatDateTime } from '../format';
import type { CouponStatus } from '../types';
import './rewards.css';

// Internal screen, so unlike the customer pages its text is in Korean.
// Read-only: nothing here can change a coupon.

const STATUS_TEXT: Record<CouponStatus, string> = {
  waiting: '사용 전 (24시간 대기)',
  available: '사용 가능',
  showing: 'QR 표시 중',
  shown: 'QR 실행됨',
  expired: '소멸',
};

const gameName = (slug: string) => {
  try {
    return getGame(slug as GameSlug).title;
  } catch {
    return slug;
  }
};

async function getJson<T>(url: string): Promise<{ status: number; data: T | null }> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    return { status: res.status, data: res.ok ? ((await res.json()) as T) : null };
  } catch {
    return { status: 0, data: null };
  }
}

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    let status = 0;
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      status = res.status;
    } catch {
      // handled below
    }
    setBusy(false);
    if (status === 200) return onDone();
    setPassword('');
    setError(
      status === 401
        ? '비밀번호가 맞지 않아요.'
        : status === 429
          ? '비밀번호를 여러 번 틀려서 잠겼어요. 15분 뒤에 다시 시도해 주세요.'
          : status === 503
            ? '어드민이 아직 설정되지 않았어요.'
            : '연결에 문제가 있어요. 다시 시도해 주세요.'
    );
  };

  return (
    <form className="rw-signin card" onSubmit={submit}>
      <label className="rw-field">
        <span>어드민 비밀번호</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
      </label>
      <button type="submit" className="btn btn-primary btn-block" disabled={busy || !password}>
        {busy ? '확인 중…' : '들어가기'}
      </button>
      {error && (
        <p className="rw-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function Dashboard({ data }: { data: AdminOverview }) {
  const columns: [keyof AdminOverview['funnel'][number], string][] = [
    ['game_starts', '시작'],
    ['game_completes', '완료'],
    ['missions_achieved', '미션 달성'],
    ['coupons_issued', '쿠폰 발급'],
    ['store_clicks', '매장 클릭'],
    ['qr_executions', 'QR 실행'],
  ];
  return (
    <>
      <section>
        <h3 className="section-label">쿠폰 현황 (전체 {data.couponTotal}개)</h3>
        <div className="ad-tiles">
          {(Object.keys(STATUS_TEXT) as CouponStatus[]).map((status) => (
            <div key={status} className="ad-tile card">
              <span>{STATUS_TEXT[status]}</span>
              <b>{data.byStatus[status]}</b>
            </div>
          ))}
          <div className="ad-tile card">
            <span>업그레이드 횟수</span>
            <b>{data.upgrades}</b>
          </div>
        </div>
      </section>

      <section>
        <h3 className="section-label">할인율별 쿠폰</h3>
        {data.byPercent.length === 0 ? (
          <div className="card rw-empty">아직 발급된 쿠폰이 없어요.</div>
        ) : (
          <div className="ad-tiles">
            {data.byPercent.map((row) => (
              <div key={row.percentOff} className="ad-tile card">
                <span>{row.percentOff ? `${row.percentOff}%` : '할인율 없음'}</span>
                <b>{row.count}</b>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="section-label">게임별 현황</h3>
        <div className="ad-table card">
          <table>
            <thead>
              <tr>
                <th scope="col">게임</th>
                {columns.map(([key, label]) => (
                  <th key={key} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.funnel.map((row) => (
                <tr key={row.game}>
                  <th scope="row">{gameName(row.game)}</th>
                  {columns.map(([key]) => (
                    <td key={key}>{row[key]}</td>
                  ))}
                </tr>
              ))}
              {data.funnel.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1}>아직 기록이 없어요.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="rw-fine ad-note">
          QR 실행은 사용 시도예요. POS에서 결과를 받지 않아 실제 할인 적용 수는 알 수 없어요. 숫자에는 테스트 기록도 포함돼요.
        </p>
      </section>
    </>
  );
}

function CouponSearch() {
  const [query, setQuery] = useState('');
  const [coupons, setCoupons] = useState<AdminCoupon[] | null>(null);
  const [failed, setFailed] = useState(false);

  const run = useCallback(async (q: string) => {
    const { data } = await getJson<{ coupons: AdminCoupon[] }>(`/api/admin/coupons?q=${encodeURIComponent(q)}`);
    setFailed(!data);
    if (data) setCoupons(data.coupons);
  }, []);

  useEffect(() => {
    void run('');
  }, [run]);

  return (
    <section>
      <h3 className="section-label">쿠폰 찾기</h3>
      <form
        className="ad-search"
        onSubmit={(e) => {
          e.preventDefault();
          void run(query);
        }}
      >
        <input
          aria-label="이메일 또는 쿠폰 코드"
          placeholder="이메일 또는 쿠폰 코드"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="btn btn-sm btn-primary">
          검색
        </button>
      </form>
      {failed && <p className="rw-error">불러오지 못했어요. 다시 시도해 주세요.</p>}
      {coupons?.length === 0 && <div className="card rw-empty">찾은 쿠폰이 없어요.</div>}
      {coupons && coupons.length > 0 && (
        <ul className="rw-past card">
          {coupons.map((coupon) => (
            <li key={coupon.id}>
              <div className="rw-past-top">
                <b>{coupon.rewardTitle}</b>
                <span className={`badge rw-status is-${coupon.status}`}>{STATUS_TEXT[coupon.status]}</span>
              </div>
              <span>{coupon.email || '(이메일 없음)'}</span>
              <span className="rw-code">{coupon.code}</span>
              <span className="rw-fine">
                {gameName(coupon.sourceGame)} · 발급 {formatDateTime(coupon.issuedAt)}
                {coupon.expiresAt ? ` · 만료 ${formatDateTime(coupon.expiresAt)}` : ''}
                {coupon.qrExecutedAt ? ` · QR 실행 ${formatDateTime(coupon.qrExecutedAt)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AdminPage() {
  const [state, setState] = useState<'loading' | 'login' | 'error' | 'ready'>('loading');
  const [data, setData] = useState<AdminOverview | null>(null);

  const load = useCallback(async () => {
    const res = await getJson<AdminOverview>('/api/admin/overview');
    if (res.data) {
      setData(res.data);
      setState('ready');
    } else {
      setState(res.status === 401 ? 'login' : 'error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const logout = async () => {
    await fetch('/api/admin/login', { method: 'DELETE' }).catch(() => undefined);
    setData(null);
    setState('login');
  };

  return (
    <GameShell title="어드민" className="rewards">
      <div className="rw-page screen-in">
        {state === 'loading' && <p className="rw-muted">불러오는 중…</p>}
        {state === 'login' && <Login onDone={() => void load()} />}
        {state === 'error' && (
          <div className="card rw-empty">
            불러오지 못했어요.
            <button type="button" className="btn btn-sm btn-primary" onClick={() => void load()}>
              다시 시도
            </button>
          </div>
        )}
        {state === 'ready' && data && (
          <>
            <div className="ad-bar">
              <span className="rw-fine">기준 시각 {formatDateTime(data.generatedAt)}</span>
              <div>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => void load()}>
                  새로고침
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => void logout()}>
                  로그아웃
                </button>
              </div>
            </div>
            <Dashboard data={data} />
            <CouponSearch />
          </>
        )}
      </div>
    </GameShell>
  );
}
