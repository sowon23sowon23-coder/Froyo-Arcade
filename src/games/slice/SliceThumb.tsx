'use client';

import { useEffect, useRef } from 'react';
import { CUP_SLOTS, FRUIT_KINDS, cupLayout, drawCup, drawHalf, drawItem, type CupTopping } from './art';

/** Card / start-screen art: a few fruits mid-air, one being sliced, over a topped cup. */
export function SliceThumb() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const paint = () => {
      const { width: W, height: H } = c.getBoundingClientRect();
      if (!W || !H) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      const ctx = c.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const font = getComputedStyle(document.body).fontFamily;

      const layout = cupLayout(W, H, 0);
      layout.rimY = H - layout.w * 0.42; // let the cup sit partly below the frame
      const toppings: CupTopping[] = CUP_SLOTS.slice(0, 12).map((_, i) => ({
        kind: FRUIT_KINDS[i % FRUIT_KINDS.length]!,
        slot: i,
        rot: (i * 1.7) % 6.28,
        side: 1,
      }));
      drawCup(ctx, layout, toppings, font);

      const r = Math.min(W, H) * 0.11;
      const place = (x: number, y: number, rot: number, fn: () => void) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        fn();
        ctx.restore();
      };
      place(W * 0.16, H * 0.3, -0.3, () => drawItem(ctx, 'mango', r));
      place(W * 0.84, H * 0.26, 0.4, () => drawItem(ctx, 'kiwi', r * 0.95));
      place(W * 0.3, H * 0.62, 0.2, () => drawItem(ctx, 'blueberry', r * 0.8));
      place(W * 0.78, H * 0.62, 0, () => drawItem(ctx, 'bomb', r * 0.85, 0.2));
      // the slice: two halves drifting apart along a blade trail
      const cut = -0.5;
      place(W * 0.47, H * 0.28, 0, () => drawHalf(ctx, 'strawberry', r * 1.1, cut, -1));
      place(W * 0.53, H * 0.36, 0, () => drawHalf(ctx, 'strawberry', r * 1.1, cut, 1));
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(150,9,83,0.18)';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(W * 0.3, H * 0.44);
      ctx.lineTo(W * 0.7, H * 0.2);
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4;
      ctx.stroke();
      // juice
      ctx.fillStyle = '#E8364F';
      for (const [dx, dy, s] of [
        [0.44, 0.4, 3],
        [0.57, 0.24, 2.5],
        [0.6, 0.42, 2],
        [0.41, 0.22, 2],
      ] as const) {
        ctx.beginPath();
        ctx.arc(W * dx, H * dy, s, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  return <canvas ref={ref} className="thumb-slice-canvas" aria-hidden="true" />;
}
