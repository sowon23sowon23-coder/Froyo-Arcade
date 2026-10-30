import { signIn, signOut } from '@/rewards/server/admin';
import { json, readBody } from '@/rewards/server/http';

const STATUS = { ok: 200, wrong: 401, locked: 429, closed: 503 } as const;

export async function POST(request: Request) {
  const body = await readBody(request);
  try {
    const result = await signIn(typeof body.password === 'string' ? body.password : '');
    return json({ result }, STATUS[result]);
  } catch {
    return json({ result: 'server' }, 500);
  }
}

export async function DELETE() {
  await signOut();
  return json({ ok: true });
}
