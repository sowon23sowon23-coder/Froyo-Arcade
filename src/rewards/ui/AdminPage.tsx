'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { GameShell } from '@/components/arcade/GameShell';
import { getGame, type GameSlug } from '@/games/registry';
import type { AdminCoupon } from '../server/admin';
import type { AdminOverview, DateRange, PlayerRow } from '../server/adminStats';
import { formatDateTime, storeDay } from '../format';
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
const STATUS_ORDER: CouponStatus[] = ['waiting', 'available', 'showing', 'shown', 'expired'];
const PLAYER_LIMIT = 200;

const gameName = (slug: string) => {
  try {
    return getGame(slug as GameSlug).title;
  } catch {
    return slug;
  }
};

const whole = (n: number) => Math.round(n).toLocaleString('en-US');
const one = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-US');
const pct = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)}%` : '-');

function duration(ms: number): string {
  const total = Math.round(ms / 1000);
  if (total <= 0) return '-';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

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
    <form className="rw-signin card ad-login" onSubmit={submit}>
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

/** Picks the period every section below it counts. Null means everything. */
function RangePicker({ range, busy, onChange }: { range: DateRange | null; busy: boolean; onChange: (range: DateRange | null) => void }) {
  const [draft, setDraft] = useState<{ from: string; to: string }>({ from: range?.from ?? '', to: range?.to ?? '' });

  useEffect(() => setDraft({ from: range?.from ?? '', to: range?.to ?? '' }), [range]);

  const today = storeDay();
  const presets: { label: string; range: DateRange | null }[] = [
    { label: '오늘', range: { from: today, to: today } },
    { label: '최근 7일', range: { from: storeDay(6), to: today } },
    { label: '최근 30일', range: { from: storeDay(29), to: today } },
    { label: '전체', range: null },
  ];
  const isActive = (preset: DateRange | null) => (preset === null ? range === null : range?.from === preset.from && range?.to === preset.to);

  const set = (key: 'from' | 'to', value: string) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    if (next.from && next.to) onChange(next.from <= next.to ? next : { from: next.to, to: next.from });
  };

  return (
    <div className="ad-range card" role="group" aria-label="기간 선택">
      <div className="ad-range-presets">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={`btn btn-sm ${isActive(preset.range) ? 'btn-primary' : 'btn-secondary'}`}
            aria-pressed={isActive(preset.range)}
            onClick={() => onChange(preset.range)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="ad-range-dates">
        <input type="date" aria-label="시작 날짜" max={today} value={draft.from} onChange={(e) => set('from', e.target.value)} />
        <span aria-hidden="true">~</span>
        <input type="date" aria-label="끝 날짜" max={today} value={draft.to} onChange={(e) => set('to', e.target.value)} />
      </div>
      <span className="rw-fine" role="status">
        {busy ? '불러오는 중…' : '매장 시간대(PT) 기준'}
      </span>
    </div>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="ad-tile card">
      <span>{label}</span>
      <b>{value}</b>
      {note && <small>{note}</small>}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="ad-section">
      <h3 className="section-label">{title}</h3>
      {children}
      {note && <p className="rw-fine ad-note">{note}</p>}
    </section>
  );
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="ad-table card">
      <table>
        <thead>
          <tr>
            {head.map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Totals({ data }: { data: AdminOverview }) {
  const t = data.totals;
  return (
    <Section
      title={data.range ? '기간 요약' : '전체 요약'}
      note={`플레이어는 브라우저 기준이라, 한 사람이 기기를 바꾸거나 쿠키를 지우면 여러 명으로 세어져요. 숫자에는 테스트 기록도 포함돼요.${data.range ? ' 기간 내 로그인은 계정의 마지막 로그인만 기록돼서, 그 뒤에 다시 로그인한 사람은 빠져요.' : ''}`}
    >
      <div className="ad-tiles">
        <Kpi label="플레이어" value={whole(t.players)} note={`총 ${whole(t.plays)}판 시작`} />
        <Kpi
          label="로그인 계정 (전체)"
          value={whole(t.accounts)}
          note={data.range ? `기간 내 신규 ${whole(t.newAccounts)}명 · 로그인 ${whole(t.recentSignIns)}명` : `최근 7일 로그인 ${whole(t.recentSignIns)}명`}
        />
        <Kpi label="총 플레이 시간" value={duration(t.playMs)} note="끝까지 마친 판 기준" />
        <Kpi label="미션 달성 플레이어" value={whole(t.playersWithMission)} note={`플레이어의 ${pct(t.playersWithMission, t.players)}`} />
        <Kpi label="발급 쿠폰" value={whole(t.coupons)} note={`플레이어 대비 ${pct(t.coupons, t.players)}`} />
        <Kpi label="쿠폰 QR 실행" value={whole(t.qrExecuted)} note={`발급 쿠폰의 ${pct(t.qrExecuted, t.coupons)}`} />
        <Kpi label="매장 길찾기 클릭" value={whole(t.storeClicks)} />
        <Kpi label="쿠폰 업그레이드" value={whole(t.upgrades)} />
      </div>
    </Section>
  );
}

function Coupons({ data }: { data: AdminOverview }) {
  return (
    <div className="ad-columns">
      <Section
        title="쿠폰 상태"
        note={`QR 실행은 사용 시도예요. POS에서 결과를 받지 않아 실제 할인 적용 수는 알 수 없어요.${data.range ? ' 기간을 고르면 그 기간에 발급된 쿠폰의 현재 상태를 보여 줘요.' : ''}`}
      >
        <Table head={['상태', '쿠폰 수', '비율']}>
          {STATUS_ORDER.map((status) => (
            <tr key={status}>
              <th scope="row">{STATUS_TEXT[status]}</th>
              <td>{whole(data.byStatus[status])}</td>
              <td>{pct(data.byStatus[status], data.totals.coupons)}</td>
            </tr>
          ))}
        </Table>
      </Section>
      <Section title="할인율별 쿠폰">
        <Table head={['할인율', '쿠폰 수', '비율']}>
          {data.byPercent.map((row) => (
            <tr key={row.percentOff}>
              <th scope="row">{row.percentOff ? `${row.percentOff}%` : '할인율 없음'}</th>
              <td>{whole(row.count)}</td>
              <td>{pct(row.count, data.totals.coupons)}</td>
            </tr>
          ))}
          {data.byPercent.length === 0 && (
            <tr>
              <td colSpan={3}>아직 발급된 쿠폰이 없어요.</td>
            </tr>
          )}
        </Table>
      </Section>
    </div>
  );
}

function Games({ data }: { data: AdminOverview }) {
  return (
    <Section
      title="게임별 현황"
      note="시간은 끝까지 마친 판만 집계해요. 중간에 나간 판은 시간이 남지 않고, Wordle은 시간을 기록하지 않아요. Crush의 시간은 접속 1회당 마지막 클리어까지예요. 의심 기록은 서버가 불가능하다고 판단한 결과로, 점수와 시간에서 제외해요."
    >
      <Table head={['게임', '플레이어', '시작', '완료', '평균 시간', '중간 시간', '총 시간', '미션 달성', '달성률', '쿠폰 발급', 'QR 실행', '의심 기록']}>
        {data.games.map((g) => (
          <tr key={g.game}>
            <th scope="row">{gameName(g.game)}</th>
            <td>{whole(g.players)}</td>
            <td>{whole(g.plays)}</td>
            <td>{whole(g.completes)}</td>
            <td>{g.timedRounds ? duration(g.averageMs) : '-'}</td>
            <td>{g.timedRounds ? duration(g.medianMs) : '-'}</td>
            <td>{g.timedRounds ? duration(g.totalMs) : '-'}</td>
            <td>{whole(g.missions)}</td>
            <td>{pct(g.missions, g.completes)}</td>
            <td>{whole(g.coupons)}</td>
            <td>{whole(g.qr)}</td>
            <td>{whole(g.suspicious)}</td>
          </tr>
        ))}
      </Table>
    </Section>
  );
}

function Scores({ data }: { data: AdminOverview }) {
  const w = data.wordle;
  return (
    <Section title="게임별 점수" note="Catch와 Slice는 판 기준, Crush는 플레이어별 최고 레벨 기준이에요. 기록이 적으면 평균이 크게 흔들려요.">
      <div className="ad-columns ad-columns-3">
        {data.scores.map((s) => {
          const unit = s.game === 'crush' ? '레벨' : '점';
          return (
            <div key={s.game} className="ad-score card">
              <b>{gameName(s.game)}</b>
              <dl>
                <div>
                  <dt>{s.basis === 'player' ? '플레이어' : '판'}</dt>
                  <dd>{whole(s.samples)}</dd>
                </div>
                <div>
                  <dt>평균</dt>
                  <dd>
                    {s.samples ? one(s.average) : '-'}
                    {s.samples ? unit : ''}
                  </dd>
                </div>
                <div>
                  <dt>중간값</dt>
                  <dd>
                    {s.samples ? one(s.median) : '-'}
                    {s.samples ? unit : ''}
                  </dd>
                </div>
                <div>
                  <dt>상위 10%</dt>
                  <dd>
                    {s.samples ? whole(s.p90) : '-'}
                    {s.samples ? unit : ''}
                  </dd>
                </div>
                <div>
                  <dt>최고</dt>
                  <dd>
                    {s.samples ? whole(s.max) : '-'}
                    {s.samples ? unit : ''}
                  </dd>
                </div>
              </dl>
              <table>
                <thead>
                  <tr>
                    <th scope="col">할인 기준</th>
                    <th scope="col">할인</th>
                    <th scope="col">도달</th>
                  </tr>
                </thead>
                <tbody>
                  {s.tiers.map((tier) => (
                    <tr key={tier.goal}>
                      <th scope="row">{tier.goal}</th>
                      <td>{tier.title.replace(' off 1 cup', '')}</td>
                      <td>
                        {whole(tier.reached)} ({pct(tier.reached, s.samples)})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
        <div className="ad-score card">
          <b>{gameName('wordle')}</b>
          <dl>
            <div>
              <dt>끝난 판</dt>
              <dd>{whole(w.rounds)}</dd>
            </div>
            <div>
              <dt>정답</dt>
              <dd>
                {whole(w.wins)} ({pct(w.wins, w.rounds)})
              </dd>
            </div>
            <div>
              <dt>평균 시도</dt>
              <dd>{w.wins ? `${one(w.averageAttempts)}번` : '-'}</dd>
            </div>
          </dl>
          <table>
            <thead>
              <tr>
                <th scope="col">맞힌 시도</th>
                <th scope="col">판 수</th>
              </tr>
            </thead>
            <tbody>
              {w.attempts.map((count, i) => (
                <tr key={i}>
                  <th scope="row">{i + 1}번째</th>
                  <td>{whole(count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}

/** Stays hidden until asked for, so it isn't on screen for anyone walking past. */
function WordleAnswers() {
  const [answers, setAnswers] = useState<{ date: string; answer: string }[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reveal = async () => {
    const { data } = await getJson<{ answers: { date: string; answer: string }[] }>('/api/admin/wordle');
    setFailed(!data);
    if (data) setAnswers(data.answers);
  };

  return (
    <Section title="Wordle 정답" note="정답을 아는 사람은 바로 미션을 달성할 수 있으니 외부에 공유하지 마세요. Vercel의 WORDLE_SECRET을 바꾸면 정답도 바뀌어요.">
      {answers ? (
        <div className="ad-answers">
          {answers.map((row, i) => (
            <div key={row.date} className={`ad-tile card${i === 0 ? ' is-today' : ''}`}>
              <span>{i === 0 ? `오늘 ${row.date}` : row.date}</span>
              <b>{row.answer}</b>
            </div>
          ))}
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAnswers(null)}>
            숨기기
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => void reveal()}>
          정답 보기
        </button>
      )}
      {failed && <p className="rw-error">불러오지 못했어요. 다시 시도해 주세요.</p>}
    </Section>
  );
}

function Daily({ data }: { data: AdminOverview }) {
  return (
    <Section
      title={data.range ? '날짜별 현황' : '최근 14일'}
      note={data.dailyTrimmed ? '기간이 길어서 가장 최근 92일만 보여 줘요. 위쪽 합계에는 기간 전체가 들어가요.' : undefined}
    >
      <Table head={['날짜', '시작한 판', '플레이어', '새 계정', '쿠폰 발급', 'QR 실행']}>
        {data.daily.map((d) => (
          <tr key={d.date}>
            <th scope="row">{d.date}</th>
            <td>{whole(d.plays)}</td>
            <td>{whole(d.players)}</td>
            <td>{whole(d.newAccounts)}</td>
            <td>{whole(d.coupons)}</td>
            <td>{whole(d.qr)}</td>
          </tr>
        ))}
      </Table>
    </Section>
  );
}

function bestText(player: PlayerRow): string {
  if (!player.best.length) return '-';
  return player.best.map((b) => `${gameName(b.game).replace('Froyo ', '')} ${b.game === 'crush' ? `레벨 ${b.value}` : `${whole(b.value)}점`}`).join(', ');
}

function Players({ data }: { data: AdminOverview }) {
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();
  const matches = data.players.filter((p) => p.email.toLowerCase().includes(q));
  return (
    <Section
      title={`로그인 플레이어 (${whole(data.players.length)}명)`}
      note="로그인 전 기록은 같은 브라우저에서 로그인했거나 쿠폰을 받은 경우에만 계정과 연결돼요. 그래서 플레이 수가 실제보다 적게 보일 수 있어요. 달성률은 끝까지 마친 판 대비 미션 달성 비율이에요."
    >
      <input className="ad-filter" aria-label="이메일로 찾기" placeholder="이메일로 찾기" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <Table head={['이메일', '로그인 방법', '가입', '최근 로그인', '시작', '완료', '플레이 시간', '최고 기록', '미션', '달성률', '쿠폰', '상태', 'QR 실행']}>
        {matches.slice(0, PLAYER_LIMIT).map((p) => (
          <tr key={p.userId}>
            <th scope="row">{p.email || '(이메일 없음)'}</th>
            <td>{p.provider === 'google' ? 'Google' : p.provider === 'email' ? '이메일' : p.provider}</td>
            <td>{formatDateTime(p.joinedAt)}</td>
            <td>{p.lastSignInAt ? formatDateTime(p.lastSignInAt) : '-'}</td>
            <td>{whole(p.plays)}</td>
            <td>{whole(p.completes)}</td>
            <td>{duration(p.playMs)}</td>
            <td className="ad-left">{bestText(p)}</td>
            <td>{whole(p.missions)}</td>
            <td>{pct(p.missions, p.completes)}</td>
            <td>{p.couponTitle?.replace(' off 1 cup', '') ?? '-'}</td>
            <td>{p.couponStatus ? STATUS_TEXT[p.couponStatus] : '-'}</td>
            <td>{p.qrExecutedAt ? formatDateTime(p.qrExecutedAt) : '-'}</td>
          </tr>
        ))}
        {matches.length === 0 && (
          <tr>
            <td colSpan={13}>해당하는 플레이어가 없어요.</td>
          </tr>
        )}
      </Table>
      {matches.length > PLAYER_LIMIT && <p className="rw-fine ad-note">최근 로그인 순으로 {PLAYER_LIMIT}명까지 보여 줘요. 이메일로 찾아보세요.</p>}
    </Section>
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
    <Section title="쿠폰 찾기" note="기간과 상관없이 모든 쿠폰에서 찾아요. 검색하지 않으면 최근 발급된 20개를 보여 줘요.">
      <form
        className="ad-search"
        onSubmit={(e) => {
          e.preventDefault();
          void run(query);
        }}
      >
        <input aria-label="이메일 또는 쿠폰 코드" placeholder="이메일 또는 쿠폰 코드" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="submit" className="btn btn-sm btn-primary">
          검색
        </button>
      </form>
      {failed && <p className="rw-error">불러오지 못했어요. 다시 시도해 주세요.</p>}
      {coupons?.length === 0 && <div className="card rw-empty">찾은 쿠폰이 없어요.</div>}
      {coupons && coupons.length > 0 && (
        <Table head={['이메일', '쿠폰 코드', '혜택', '상태', '획득 게임', '발급', '만료', 'QR 실행']}>
          {coupons.map((c) => (
            <tr key={c.id}>
              <th scope="row">{c.email || '(이메일 없음)'}</th>
              <td className="rw-code">{c.code}</td>
              <td>{c.rewardTitle}</td>
              <td>{STATUS_TEXT[c.status]}</td>
              <td>{gameName(c.sourceGame)}</td>
              <td>{formatDateTime(c.issuedAt)}</td>
              <td>{c.expiresAt ? formatDateTime(c.expiresAt) : '-'}</td>
              <td>{c.qrExecutedAt ? formatDateTime(c.qrExecutedAt) : '-'}</td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  );
}

export function AdminPage() {
  const [state, setState] = useState<'loading' | 'login' | 'error' | 'ready'>('loading');
  const [data, setData] = useState<AdminOverview | null>(null);
  const [range, setRange] = useState<DateRange | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);

  const load = useCallback(async (period: DateRange | null) => {
    // Quick clicks can answer out of order; only the newest request counts.
    const request = ++latest.current;
    setBusy(true);
    const query = period ? `?from=${period.from}&to=${period.to}` : '';
    const res = await getJson<AdminOverview>(`/api/admin/overview${query}`);
    if (request !== latest.current) return;
    setBusy(false);
    if (res.data) {
      setData(res.data);
      setState('ready');
    } else {
      setState(res.status === 401 ? 'login' : 'error');
    }
  }, []);

  useEffect(() => {
    void load(null);
  }, [load]);

  const choose = (next: DateRange | null) => {
    setRange(next);
    void load(next);
  };

  const logout = async () => {
    await fetch('/api/admin/login', { method: 'DELETE' }).catch(() => undefined);
    setData(null);
    setState('login');
  };

  return (
    <GameShell title="어드민" className="admin">
      <div className="ad-page screen-in">
        {state === 'loading' && <p className="rw-muted">불러오는 중…</p>}
        {state === 'login' && <Login onDone={() => void load(range)} />}
        {state === 'error' && (
          <div className="card rw-empty">
            불러오지 못했어요.
            <button type="button" className="btn btn-sm btn-primary" onClick={() => void load(range)}>
              다시 시도
            </button>
          </div>
        )}
        {state === 'ready' && data && (
          <>
            <div className="ad-bar">
              <span className="rw-fine">기준 시각 {formatDateTime(data.generatedAt)}</span>
              <div>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => void load(range)}>
                  새로고침
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => void logout()}>
                  로그아웃
                </button>
              </div>
            </div>
            <RangePicker range={range} busy={busy} onChange={choose} />
            <Totals data={data} />
            <Coupons data={data} />
            <Games data={data} />
            <Scores data={data} />
            <WordleAnswers />
            <Daily data={data} />
            <Players data={data} />
            <CouponSearch />
          </>
        )}
      </div>
    </GameShell>
  );
}
