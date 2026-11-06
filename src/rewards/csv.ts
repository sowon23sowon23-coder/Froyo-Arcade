import { PROMOTION } from './config';

export type Cell = string | number | boolean | null | undefined;

/**
 * One CSV cell. Text that a spreadsheet would run as a formula (starting with
 * = + - @ or a tab) gets a leading apostrophe, since emails and other
 * player-typed text end up in these files.
 */
function cell(value: Cell): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV text with a byte-order mark, so Excel opens Korean text correctly. */
export function toCsv(header: string[], rows: Cell[][]): string {
  return `﻿${[header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

const STAMP = new Intl.DateTimeFormat('en-CA', {
  timeZone: PROMOTION.timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** A time as "YYYY-MM-DD HH:mm" in the stores' time zone, which spreadsheets read as a date. */
export function csvTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return STAMP.format(new Date(iso)).replace(', ', ' ');
}

/** froyo-arcade_<name>_<from>_<to>.csv, or _all for no period. */
export function csvName(name: string, range: { from: string; to: string } | null): string {
  return `froyo-arcade_${name}_${range ? `${range.from}_${range.to}` : 'all'}.csv`;
}

/** Saves CSV text as a file in the browser. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
