import 'server-only';
import { NextResponse } from 'next/server';

export function json<T>(body: T, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Parses a small JSON body; anything else becomes an empty object. */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const text = await request.text();
    if (text.length > 4096) return {};
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
