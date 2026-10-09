'use client';

import { useEffect, useRef } from 'react';
import { SIZE, drawItem, type ItemKind } from './art';

/** A fruit or bomb drawn with the same canvas art as the game. */
export function ItemIcon({ kind, size = 28 }: { kind: ItemKind; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.translate(size / 2, size / 2 + (kind === 'bomb' ? size * 0.06 : 0));
    drawItem(ctx, kind, (size * 0.36) / Math.max(1, SIZE[kind]) * (kind === 'bomb' ? 0.85 : 1));
  }, [kind, size]);

  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden="true" />;
}
