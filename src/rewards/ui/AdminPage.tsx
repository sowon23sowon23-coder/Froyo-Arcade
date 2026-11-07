'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { GameShell } from '@/components/arcade/GameShell';
import { getGame, type GameSlug } from '@/games/registry';
import { NO_RECORD } from '../attribution';
import type { AdminCoupon } from '../server/admin';
import type { AdminOverview, DateRange, PlayerRow } from '../server/adminStats';
import { csvName, csvTime, downloadCsv, toCsv } from '../csv';
import { formatDateTime, storeDay } from '../format';
import type { CouponStatus } from '../types';
import { ADMIN_TEXT, type AdminText, type Lang } from './adminText';
import './rewards.css';

// Internal screen, in Korean by default with an English switch (adminText.ts).
// Read-only: nothing here can change a coupon.

const STATUS_ORDER: CouponStatus[] = ['waiting', 'available', 'showing', 'shown', 'expired'];
const PLAYER_LIMIT = 200;
const LANG_KEY = 'froyo-arcade:admin-lang';

const TextContext = createContext<AdminText>(ADMIN_TEXT.ko);
const useText = () => useContext(TextContext);

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

function duration(ms: number, t: AdminText): string {
  const total = Math.round(ms / 1000);
  if (total <= 0) return '-';
  return t.duration(Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60);
}

async function getJson<T>(url: string): Promise<{ status: number; data: T | null }> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    return { status: res.status, data: res.ok ? ((await res.json()) as T) : null };
  } catch {
    return { status: 0, data: null };
  }
}

function LangToggle({ lang, onChange }: { lang: Lang; onChange: (lang: Lang) => void }) {
  const t = useText();
  return (
    <button
      type="button"
      className="btn btn-sm btn-secondary ad-lang"
      lang={lang === 'ko' ? 'en' : 'ko'}
      onClick={() => onChange(lang === 'ko' ? 'en' : 'ko')}
    >
      {t.langLabel}
    </button>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const t = useText();
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
    setError(status === 401 ? t.wrongPassword : status === 429 ? t.locked : status === 503 ? t.notSetUp : t.connection);
  };

  return (
    <form className="rw-signin card ad-login" onSubmit={submit}>
      <label className="rw-field">
        <span>{t.password}</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
      </label>
      <button type="submit" className="btn btn-primary btn-block" disabled={busy || !password}>
        {busy ? t.checking : t.enter}
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
  const t = useText();
  const [draft, setDraft] = useState<{ from: string; to: string }>({ from: range?.from ?? '', to: range?.to ?? '' });

  useEffect(() => setDraft({ from: range?.from ?? '', to: range?.to ?? '' }), [range]);

  const today = storeDay();
  const presets: { key: string; label: string; range: DateRange | null }[] = [
    { key: 'today', label: t.today, range: { from: today, to: today } },
    { key: '7', label: t.last7, range: { from: storeDay(6), to: today } },
    { key: '30', label: t.last30, range: { from: storeDay(29), to: today } },
    { key: 'all', label: t.all, range: null },
  ];
  const isActive = (preset: DateRange | null) => (preset === null ? range === null : range?.from === preset.from && range?.to === preset.to);

  const set = (key: 'from' | 'to', value: string) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    if (next.from && next.to) onChange(next.from <= next.to ? next : { from: next.to, to: next.from });
  };

  return (
    <div className="ad-range card" role="group" aria-label={t.period}>
      <div className="ad-range-presets">
        {presets.map((preset) => (
          <button
            key={preset.key}
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
        <input type="date" aria-label={t.startDate} max={today} value={draft.from} onChange={(e) => set('from', e.target.value)} />
        <span aria-hidden="true">~</span>
        <input type="date" aria-label={t.endDate} max={today} value={draft.to} onChange={(e) => set('to', e.target.value)} />
      </div>
      <span className="rw-fine" role="status">
        {busy ? t.loading : t.storeTime}
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

function CsvButton({ onClick, label = 'CSV' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="btn btn-sm btn-ghost ad-csv" onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  );
}

function Section({ title, note, action, children }: { title: string; note?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="ad-section">
      <div className="ad-section-head">
        <h3 className="section-label">{title}</h3>
        {action}
      </div>
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

/* ---------- CSV exports ---------- */
// Times go out as seconds and rates as numbers, so a spreadsheet can add them up.
// Column titles follow the chosen language.

const seconds = (ms: number) => Math.round(ms / 1000);
const ratio = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : '');

function exportSummary(data: AdminOverview, t: AdminText) {
  const c = t.csv;
  const s = data.totals;
  const rows: (string | number)[][] = [
    [c.groupSummary, c.sPlayers, s.players],
    [c.groupSummary, c.sPlays, s.plays],
    [c.groupSummary, c.sCompletes, s.completes],
    [c.groupSummary, c.sPlaySeconds, seconds(s.playMs)],
    [c.groupSummary, c.sAccounts, s.accounts],
    [c.groupSummary, data.range ? c.sNewRange : c.sNewAll, s.newAccounts],
    [c.groupSummary, data.range ? c.sSignInRange : c.sSignIn7, s.recentSignIns],
    [c.groupSummary, c.sMissionPlayers, s.playersWithMission],
    [c.groupSummary, c.sCoupons, s.coupons],
    [c.groupSummary, c.sQr, s.qrExecuted],
    [c.groupSummary, c.sStoreClicks, s.storeClicks],
    [c.groupSummary, c.sUpgrades, s.upgrades],
    ...STATUS_ORDER.map((st) => [c.groupStatus, t.status[st], data.byStatus[st]]),
    ...data.byPercent.map((p) => [c.groupPercent, p.percentOff ? `${p.percentOff}%` : t.noPercent, p.count]),
  ];
  downloadCsv(csvName('summary', data.range), toCsv(c.summaryHead, rows));
}

function exportGames(data: AdminOverview, t: AdminText) {
  downloadCsv(
    csvName('games', data.range),
    toCsv(
      t.csv.gameHead,
      data.games.map((g) => [
        gameName(g.game),
        g.players,
        g.plays,
        g.completes,
        g.timedRounds ? seconds(g.averageMs) : '',
        g.timedRounds ? seconds(g.medianMs) : '',
        g.timedRounds ? seconds(g.totalMs) : '',
        g.missions,
        ratio(g.missions, g.completes),
        g.coupons,
        g.qr,
        g.storeClicks,
        g.suspicious,
      ])
    )
  );
}

function exportScores(data: AdminOverview, t: AdminText) {
  const c = t.csv;
  const rows: (string | number)[][] = [];
  for (const s of data.scores) {
    const name = gameName(s.game);
    const unit = s.game === 'crush' ? t.unitLevel : t.unitScore;
    rows.push(
      [name, s.basis === 'player' ? c.samplePlayers : c.sampleRounds, s.samples, ''],
      [name, c.withUnit(t.average, unit), Math.round(s.average * 10) / 10, ''],
      [name, c.withUnit(t.median, unit), s.median, ''],
      [name, c.withUnit(t.top10, unit), s.p90, ''],
      [name, c.withUnit(t.max, unit), s.max, ''],
      ...s.tiers.map((tier) => [name, c.reached(tier.goal, tier.title), tier.reached, ratio(tier.reached, s.samples)])
    );
  }
  const w = data.wordle;
  rows.push(
    ['Wordle', t.wordleRounds, w.rounds, ''],
    ['Wordle', t.wordleWins, w.wins, ratio(w.wins, w.rounds)],
    ['Wordle', t.wordleAvg, Math.round(w.averageAttempts * 10) / 10, ''],
    ...w.attempts.map((count, i) => ['Wordle', c.solvedOnNth(i + 1), count, ratio(count, w.wins)])
  );
  downloadCsv(csvName('scores', data.range), toCsv(c.scoreHead, rows));
}

function exportChannels(data: AdminOverview, t: AdminText) {
  downloadCsv(
    csvName('channels', data.range),
    toCsv(
      t.csv.channelHead,
      data.channels.map((c) => [
        sourceLabel(c.source, t),
        c.medium,
        c.campaign,
        c.tagged ? 'UTM' : t.guessed,
        c.visits,
        c.visitors,
        c.players,
        c.plays,
        c.missions,
        c.coupons,
        c.qr,
        ratio(c.coupons, c.visitors),
        ratio(c.qr, c.coupons),
      ])
    )
  );
}

function exportDaily(data: AdminOverview, t: AdminText) {
  downloadCsv(
    csvName('daily', data.range),
    toCsv(
      t.csv.dailyHead,
      [...data.daily].reverse().map((d) => [d.date, d.plays, d.players, d.newAccounts, d.coupons, d.qr])
    )
  );
}

function exportPlayers(data: AdminOverview, t: AdminText) {
  const best = (p: PlayerRow, game: string) => p.best.find((b) => b.game === game)?.value ?? '';
  downloadCsv(
    csvName('players', data.range),
    toCsv(
      t.csv.playerHead,
      data.players.map((p) => [
        p.email,
        p.provider,
        csvTime(p.joinedAt),
        csvTime(p.lastSignInAt),
        p.plays,
        p.completes,
        seconds(p.playMs),
        best(p, 'catch'),
        best(p, 'slice'),
        best(p, 'crush'),
        p.missions,
        p.couponTitle ?? '',
        p.couponStatus ? t.status[p.couponStatus] : '',
        csvTime(p.qrExecutedAt),
      ])
    )
  );
}

/** The full coupon list comes from the server, since the page only holds counts. */
async function exportCoupons(range: DateRange | null, lang: Lang, t: AdminText) {
  const params = new URLSearchParams({ lang });
  if (range) {
    params.set('from', range.from);
    params.set('to', range.to);
  }
  try {
    const res = await fetch(`/api/admin/coupons/export?${params}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    // Reading the body as text drops the byte-order mark Excel needs, so put it back.
    const text = await res.text();
    downloadCsv(csvName('coupons', range), text.startsWith('﻿') ? text : `﻿${text}`);
  } catch {
    window.alert(t.couponCsvFailed);
  }
}

/** Channel names stored by the server, shown in the chosen language. */
function sourceLabel(source: string, t: AdminText): string {
  return source === NO_RECORD.source ? t.noRecord : source;
}

function Totals({ data }: { data: AdminOverview }) {
  const t = useText();
  const s = data.totals;
  return (
    <Section
      action={<CsvButton onClick={() => exportSummary(data, t)} />}
      title={data.range ? t.summaryRange : t.summaryAll}
      note={`${t.summaryNote}${data.range ? t.summaryNoteRange : ''}`}
    >
      <div className="ad-tiles">
        <Kpi label={t.kPlayers} value={whole(s.players)} note={t.kPlaysStarted(whole(s.plays))} />
        <Kpi
          label={t.kAccounts}
          value={whole(s.accounts)}
          note={data.range ? t.kAccountsRange(whole(s.newAccounts), whole(s.recentSignIns)) : t.kAccountsAll(whole(s.recentSignIns))}
        />
        <Kpi label={t.kPlayTime} value={duration(s.playMs, t)} note={t.kPlayTimeNote} />
        <Kpi label={t.kMissionPlayers} value={whole(s.playersWithMission)} note={t.ofPlayers(pct(s.playersWithMission, s.players))} />
        <Kpi label={t.kCoupons} value={whole(s.coupons)} note={t.perPlayers(pct(s.coupons, s.players))} />
        <Kpi label={t.kQr} value={whole(s.qrExecuted)} note={t.ofCoupons(pct(s.qrExecuted, s.coupons))} />
        <Kpi label={t.kStoreClicks} value={whole(s.storeClicks)} />
        <Kpi label={t.kUpgrades} value={whole(s.upgrades)} />
      </div>
    </Section>
  );
}

function Coupons({ data, lang }: { data: AdminOverview; lang: Lang }) {
  const t = useText();
  return (
    <div className="ad-columns">
      <Section
        action={<CsvButton label={t.allCouponsCsv} onClick={() => void exportCoupons(data.range, lang, t)} />}
        title={t.couponStatus}
        note={`${t.couponStatusNote}${data.range ? t.couponStatusNoteRange : ''}`}
      >
        <Table head={t.statusHead}>
          {STATUS_ORDER.map((status) => (
            <tr key={status}>
              <th scope="row">{t.status[status]}</th>
              <td>{whole(data.byStatus[status])}</td>
              <td>{pct(data.byStatus[status], data.totals.coupons)}</td>
            </tr>
          ))}
        </Table>
      </Section>
      <Section title={t.byPercent}>
        <Table head={t.percentHead}>
          {data.byPercent.map((row) => (
            <tr key={row.percentOff}>
              <th scope="row">{row.percentOff ? `${row.percentOff}%` : t.noPercent}</th>
              <td>{whole(row.count)}</td>
              <td>{pct(row.count, data.totals.coupons)}</td>
            </tr>
          ))}
          {data.byPercent.length === 0 && (
            <tr>
              <td colSpan={3}>{t.noCoupons}</td>
            </tr>
          )}
        </Table>
      </Section>
    </div>
  );
}

function Games({ data }: { data: AdminOverview }) {
  const t = useText();
  return (
    <Section action={<CsvButton onClick={() => exportGames(data, t)} />} title={t.games} note={t.gamesNote}>
      <Table head={t.gameHead}>
        {data.games.map((g) => (
          <tr key={g.game}>
            <th scope="row">{gameName(g.game)}</th>
            <td>{whole(g.players)}</td>
            <td>{whole(g.plays)}</td>
            <td>{whole(g.completes)}</td>
            <td>{g.timedRounds ? duration(g.averageMs, t) : '-'}</td>
            <td>{g.timedRounds ? duration(g.medianMs, t) : '-'}</td>
            <td>{g.timedRounds ? duration(g.totalMs, t) : '-'}</td>
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
  const t = useText();
  const w = data.wordle;
  const stat = (label: string, value: string) => (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
  return (
    <Section action={<CsvButton onClick={() => exportScores(data, t)} />} title={t.scores} note={t.scoresNote}>
      <div className="ad-columns ad-columns-3">
        {data.scores.map((s) => {
          const unit = s.game === 'crush' ? t.unitLevel : t.unitScore;
          const show = (v: string) => (s.samples ? `${v}${unit}` : '-');
          return (
            <div key={s.game} className="ad-score card">
              <b>{gameName(s.game)}</b>
              <dl>
                {stat(s.basis === 'player' ? t.samplePlayers : t.sampleRounds, whole(s.samples))}
                {stat(t.average, show(one(s.average)))}
                {stat(t.median, show(one(s.median)))}
                {stat(t.top10, show(whole(s.p90)))}
                {stat(t.max, show(whole(s.max)))}
              </dl>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t.tierGoal}</th>
                    <th scope="col">{t.tierDiscount}</th>
                    <th scope="col">{t.tierReached}</th>
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
            {stat(t.wordleRounds, whole(w.rounds))}
            {stat(t.wordleWins, `${whole(w.wins)} (${pct(w.wins, w.rounds)})`)}
            {stat(t.wordleAvg, w.wins ? t.tries(one(w.averageAttempts)) : '-')}
          </dl>
          <table>
            <thead>
              <tr>
                <th scope="col">{t.solvedOn}</th>
                <th scope="col">{t.roundCount}</th>
              </tr>
            </thead>
            <tbody>
              {w.attempts.map((count, i) => (
                <tr key={i}>
                  <th scope="row">{t.nth(i + 1)}</th>
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
  const t = useText();
  const [answers, setAnswers] = useState<{ date: string; answer: string }[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reveal = async () => {
    const { data } = await getJson<{ answers: { date: string; answer: string }[] }>('/api/admin/wordle');
    setFailed(!data);
    if (data) setAnswers(data.answers);
  };

  return (
    <Section title={t.answers} note={t.answersNote}>
      {answers ? (
        <div className="ad-answers">
          {answers.map((row, i) => (
            <div key={row.date} className={`ad-tile card${i === 0 ? ' is-today' : ''}`}>
              <span>{i === 0 ? t.todayDate(row.date) : row.date}</span>
              <b>{row.answer}</b>
            </div>
          ))}
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAnswers(null)}>
            {t.hide}
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => void reveal()}>
          {t.showAnswers}
        </button>
      )}
      {failed && <p className="rw-error">{t.loadFailedRetry}</p>}
    </Section>
  );
}

function Channels({ data }: { data: AdminOverview }) {
  const t = useText();
  return (
    <Section action={<CsvButton onClick={() => exportChannels(data, t)} />} title={t.channels} note={t.channelsNote}>
      <Table head={t.channelHead}>
        {data.channels.map((c) => (
          <tr key={`${c.source}|${c.medium}|${c.campaign}`}>
            <th scope="row" className="ad-channel">
              <b>{sourceLabel(c.source, t)}</b>
              {c.medium && <span> / {c.medium}</span>}
              {c.campaign && <span> / {c.campaign}</span>}
              {!c.tagged && c.medium !== '' && <em>{t.guessed}</em>}
            </th>
            <td>{whole(c.visits)}</td>
            <td>{whole(c.visitors)}</td>
            <td>{whole(c.players)}</td>
            <td>{whole(c.plays)}</td>
            <td>{whole(c.missions)}</td>
            <td>{whole(c.coupons)}</td>
            <td>{whole(c.qr)}</td>
            <td>{pct(c.coupons, c.visitors)}</td>
            <td>{pct(c.qr, c.coupons)}</td>
          </tr>
        ))}
        {data.channels.length === 0 && (
          <tr>
            <td colSpan={10}>{t.noData}</td>
          </tr>
        )}
      </Table>
    </Section>
  );
}

const SITE = 'https://froyo-arcade.vercel.app';
const LINK_PAGES = ['/', '/catch', '/crush', '/wordle', '/slice'];

/** Builds a tagged link for a post, story or ad, so its visitors show up as their own channel. */
function LinkBuilder() {
  const t = useText();
  const [page, setPage] = useState('/');
  const [tags, setTags] = useState({ utm_source: 'instagram', utm_medium: 'story', utm_campaign: '', utm_content: '' });
  const [copied, setCopied] = useState(false);

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(tags)) {
    const clean = value.trim().toLowerCase().replace(/\s+/g, '_');
    if (clean) params.set(key, clean);
  }
  const link = `${SITE}${page}${params.toString() ? `?${params}` : ''}`;
  const ready = Boolean(tags.utm_source.trim() && tags.utm_campaign.trim());

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt(t.copyPrompt, link);
    }
  };

  const field = (key: keyof typeof tags, label: string, placeholder: string) => (
    <label className="rw-field">
      <span>{label}</span>
      <input value={tags[key]} placeholder={placeholder} onChange={(e) => setTags({ ...tags, [key]: e.target.value })} />
    </label>
  );

  return (
    <Section title={t.linkBuilder} note={t.linkBuilderNote}>
      <div className="ad-link card">
        <label className="rw-field">
          <span>{t.linkPage}</span>
          <select value={page} onChange={(e) => setPage(e.target.value)}>
            {LINK_PAGES.map((path) => (
              <option key={path} value={path}>
                {path === '/' ? t.home : gameName(path.slice(1))}
              </option>
            ))}
          </select>
        </label>
        {field('utm_source', `source (${t.required})`, 'instagram')}
        {field('utm_medium', 'medium', 'story, post, reel, ad, bio')}
        {field('utm_campaign', `campaign (${t.required})`, 'launch_2026')}
        {field('utm_content', 'content', 'video_a')}
        <div className="ad-link-out">
          <code>{link}</code>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => void copy()} disabled={!ready}>
            {copied ? t.copied : t.copy}
          </button>
        </div>
      </div>
    </Section>
  );
}

function Daily({ data }: { data: AdminOverview }) {
  const t = useText();
  return (
    <Section
      action={<CsvButton onClick={() => exportDaily(data, t)} />}
      title={data.range ? t.dailyRange : t.dailyAll}
      note={data.dailyTrimmed ? t.dailyTrimmed : undefined}
    >
      <DailyGrid days={data.daily} />
    </Section>
  );
}

/** Days run left to right, oldest first, so a whole period fits in five short rows. */
function DailyGrid({ days }: { days: AdminOverview['daily'] }) {
  const t = useText();
  const rows: [keyof AdminOverview['daily'][number], string][] = [
    ['plays', t.dPlays],
    ['players', t.dPlayers],
    ['newAccounts', t.dNewAccounts],
    ['coupons', t.dCoupons],
    ['qr', t.dQr],
  ];
  const ordered = [...days].reverse();
  const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  const box = useRef<HTMLDivElement>(null);
  // Long periods scroll sideways: start at the newest day, on the right.
  useEffect(() => {
    if (box.current) box.current.scrollLeft = box.current.scrollWidth;
  }, [days]);
  return (
    <div ref={box} className="ad-table ad-daily card">
      <table>
        <thead>
          <tr>
            <th scope="col">{t.measure}</th>
            {ordered.map((d) => (
              <th key={d.date} scope="col" title={d.date}>
                {shortDate(d.date)}
              </th>
            ))}
            <th scope="col" className="ad-daily-total">
              {t.total}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, label]) => {
            const values = ordered.map((d) => Number(d[key]));
            return (
              <tr key={key}>
                <th scope="row">{label}</th>
                {values.map((value, i) => (
                  <td key={ordered[i]!.date} className={value === 0 ? 'is-zero' : undefined}>
                    {whole(value)}
                  </td>
                ))}
                <td className="ad-daily-total">{key === 'players' ? '-' : whole(values.reduce((a, b) => a + b, 0))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function bestText(player: PlayerRow, t: AdminText): string {
  if (!player.best.length) return '-';
  return player.best
    .map((b) => {
      const game = gameName(b.game).replace('Froyo ', '');
      return b.game === 'crush' ? t.bestLevel(game, b.value) : t.bestScore(game, whole(b.value));
    })
    .join(', ');
}

function Players({ data }: { data: AdminOverview }) {
  const t = useText();
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();
  const matches = data.players.filter((p) => p.email.toLowerCase().includes(q));
  return (
    <Section action={<CsvButton onClick={() => exportPlayers(data, t)} />} title={t.players(whole(data.players.length))} note={t.playersNote}>
      <input className="ad-filter" aria-label={t.findEmail} placeholder={t.findEmail} value={filter} onChange={(e) => setFilter(e.target.value)} />
      <Table head={t.playerHead}>
        {matches.slice(0, PLAYER_LIMIT).map((p) => (
          <tr key={p.userId}>
            <th scope="row">{p.email || t.noEmail}</th>
            <td>{p.provider === 'google' ? 'Google' : p.provider === 'email' ? t.providerEmail : p.provider}</td>
            <td>{formatDateTime(p.joinedAt)}</td>
            <td>{p.lastSignInAt ? formatDateTime(p.lastSignInAt) : '-'}</td>
            <td>{whole(p.plays)}</td>
            <td>{whole(p.completes)}</td>
            <td>{duration(p.playMs, t)}</td>
            <td className="ad-left">{bestText(p, t)}</td>
            <td>{whole(p.missions)}</td>
            <td>{pct(p.missions, p.completes)}</td>
            <td>{p.couponTitle?.replace(' off 1 cup', '') ?? '-'}</td>
            <td>{p.couponStatus ? t.status[p.couponStatus] : '-'}</td>
            <td>{p.qrExecutedAt ? formatDateTime(p.qrExecutedAt) : '-'}</td>
          </tr>
        ))}
        {matches.length === 0 && (
          <tr>
            <td colSpan={13}>{t.noPlayers}</td>
          </tr>
        )}
      </Table>
      {matches.length > PLAYER_LIMIT && <p className="rw-fine ad-note">{t.playerLimit(PLAYER_LIMIT)}</p>}
    </Section>
  );
}

function CouponSearch() {
  const t = useText();
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
    <Section title={t.couponSearch} note={t.couponSearchNote}>
      <form
        className="ad-search"
        onSubmit={(e) => {
          e.preventDefault();
          void run(query);
        }}
      >
        <input aria-label={t.emailOrCode} placeholder={t.emailOrCode} value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="submit" className="btn btn-sm btn-primary">
          {t.search}
        </button>
      </form>
      {failed && <p className="rw-error">{t.loadFailedRetry}</p>}
      {coupons?.length === 0 && <div className="card rw-empty">{t.noCouponFound}</div>}
      {coupons && coupons.length > 0 && (
        <Table head={t.couponHead}>
          {coupons.map((c) => (
            <tr key={c.id}>
              <th scope="row">{c.email || t.noEmail}</th>
              <td className="rw-code">{c.code}</td>
              <td>{c.rewardTitle}</td>
              <td>{t.status[c.status]}</td>
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
  const [lang, setLang] = useState<Lang>('ko');
  const [state, setState] = useState<'loading' | 'login' | 'error' | 'ready'>('loading');
  const [data, setData] = useState<AdminOverview | null>(null);
  const [range, setRange] = useState<DateRange | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);
  const t = ADMIN_TEXT[lang];

  // The chosen language is remembered in this browser.
  useEffect(() => {
    try {
      if (localStorage.getItem(LANG_KEY) === 'en') setLang('en');
    } catch {
      // storage blocked: stay in Korean
    }
  }, []);

  const changeLang = (next: Lang) => {
    setLang(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // storage blocked: the choice lasts until reload
    }
  };

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
    <TextContext.Provider value={t}>
      <GameShell title={t.title} className="admin" headerRight={<LangToggle lang={lang} onChange={changeLang} />}>
        <div className="ad-page screen-in" lang={lang}>
          {state === 'loading' && <p className="rw-muted">{t.loading}</p>}
          {state === 'login' && <Login onDone={() => void load(range)} />}
          {state === 'error' && (
            <div className="card rw-empty">
              {t.loadFailed}
              <button type="button" className="btn btn-sm btn-primary" onClick={() => void load(range)}>
                {t.retry}
              </button>
            </div>
          )}
          {state === 'ready' && data && (
            <>
              <div className="ad-bar">
                <span className="rw-fine">{t.asOf(formatDateTime(data.generatedAt))}</span>
                <div>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => void load(range)}>
                    {t.refresh}
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => void logout()}>
                    {t.logout}
                  </button>
                </div>
              </div>
              <RangePicker range={range} busy={busy} onChange={choose} />
              <Totals data={data} />
              <Channels data={data} />
              <Coupons data={data} lang={lang} />
              <Games data={data} />
              <Scores data={data} />
              <WordleAnswers />
              <Daily data={data} />
              <Players data={data} />
              <CouponSearch />
              <LinkBuilder />
            </>
          )}
        </div>
      </GameShell>
    </TextContext.Provider>
  );
}
