// Canvas illustrations for Froyo Slice. The game, the arcade thumbnail and the
// finished-cup image all draw with these functions so the art stays consistent:
// flat shapes, a soft top-left light, one darker outline tone, one white highlight.

export type FruitKind = 'strawberry' | 'banana' | 'mango' | 'kiwi' | 'blueberry';
export type ItemKind = FruitKind | 'bomb';

export const FRUIT_KINDS: FruitKind[] = ['strawberry', 'banana', 'mango', 'kiwi', 'blueberry'];

type Palette = { skin: string; light: string; edge: string; flesh: string; core: string; juice: string };

export const PALETTE: Record<FruitKind, Palette> = {
  strawberry: { skin: '#E8364F', light: '#FF6F80', edge: '#A91B33', flesh: '#FF8FA0', core: '#FFE1E6', juice: '#E8364F' },
  banana: { skin: '#FFD84D', light: '#FFEA94', edge: '#C99A00', flesh: '#FFF5CF', core: '#FFFBEA', juice: '#FFD84D' },
  mango: { skin: '#FFB02E', light: '#FFD27A', edge: '#C9700A', flesh: '#FFC233', core: '#FFE08A', juice: '#FFA41B' },
  kiwi: { skin: '#8B5E34', light: '#B0834F', edge: '#5C3B1C', flesh: '#8DC63F', core: '#F4FAE6', juice: '#8DC63F' },
  blueberry: { skin: '#4A5FD0', light: '#7F90F0', edge: '#26338A', flesh: '#D9EBB5', core: '#EEF6DC', juice: '#5B5FD6' },
};

/** Relative size of each item (multiplied by the base radius). */
export const SIZE: Record<ItemKind, number> = {
  strawberry: 1,
  banana: 1.08,
  mango: 1.05,
  kiwi: 0.95,
  blueberry: 0.78,
  bomb: 0.95,
};

/** Builds the outline path of an item centered at 0,0. */
export function itemPath(ctx: CanvasRenderingContext2D, kind: ItemKind, r: number) {
  ctx.beginPath();
  switch (kind) {
    case 'strawberry':
      ctx.moveTo(0, r * 0.98);
      ctx.bezierCurveTo(-r * 0.95, r * 0.45, -r * 1.02, -r * 0.6, -r * 0.42, -r * 0.78);
      ctx.quadraticCurveTo(0, -r * 0.92, r * 0.42, -r * 0.78);
      ctx.bezierCurveTo(r * 1.02, -r * 0.6, r * 0.95, r * 0.45, 0, r * 0.98);
      break;
    case 'banana':
      ctx.moveTo(-r * 1.0, -r * 0.42);
      ctx.quadraticCurveTo(-r * 0.2, r * 1.25, r * 1.0, -r * 0.42);
      ctx.quadraticCurveTo(r * 0.98, -r * 0.18, r * 0.82, -r * 0.2);
      ctx.quadraticCurveTo(-r * 0.05, r * 0.62, -r * 0.84, -r * 0.24);
      ctx.quadraticCurveTo(-r * 0.98, -r * 0.2, -r * 1.0, -r * 0.42);
      break;
    case 'mango':
      ctx.ellipse(0, r * 0.04, r * 0.98, r * 0.8, -0.35, 0, Math.PI * 2);
      break;
    case 'kiwi':
      ctx.ellipse(0, 0, r, r * 0.86, 0.2, 0, Math.PI * 2);
      break;
    case 'blueberry':
    case 'bomb':
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      break;
  }
  ctx.closePath();
}

function shade(ctx: CanvasRenderingContext2D, r: number, light: string, base: string) {
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.15);
  g.addColorStop(0, light);
  g.addColorStop(0.7, base);
  g.addColorStop(1, base);
  return g;
}

function highlight(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a = 0.55) {
  ctx.save();
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Draws a whole item centered at 0,0. `t` (seconds) animates the bomb fuse. */
export function drawItem(ctx: CanvasRenderingContext2D, kind: ItemKind, r: number, t = 0) {
  if (kind === 'bomb') return drawBomb(ctx, r, t);
  const p = PALETTE[kind];
  ctx.save();
  ctx.lineJoin = 'round';
  itemPath(ctx, kind, r);
  ctx.fillStyle = shade(ctx, r, p.light, p.skin);
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.07);
  ctx.strokeStyle = p.edge;
  ctx.stroke();

  switch (kind) {
    case 'strawberry': {
      ctx.fillStyle = '#FFE38A';
      const seeds = [
        [-0.42, -0.35], [0, -0.42], [0.42, -0.35], [-0.55, 0.05], [-0.18, 0.0],
        [0.2, 0.02], [0.55, 0.05], [-0.3, 0.4], [0.05, 0.42], [0.32, 0.4], [0, 0.72],
      ];
      for (const [sx, sy] of seeds) {
        ctx.beginPath();
        ctx.ellipse(sx! * r, sy! * r, r * 0.05, r * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // leafy crown
      ctx.fillStyle = '#4FB044';
      ctx.strokeStyle = '#2E7D32';
      ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + (i / 4) * Math.PI;
        const lx = Math.cos(a) * r * 0.48;
        const ly = -r * 0.78 + Math.sin(a) * r * 0.22;
        ctx.moveTo(0, -r * 0.8);
        ctx.quadraticCurveTo((lx + 0) / 2 - r * 0.1, (ly - r * 0.8) / 2 - r * 0.12, lx, ly);
        ctx.quadraticCurveTo((lx + 0) / 2 + r * 0.1, (ly - r * 0.8) / 2 + r * 0.08, 0, -r * 0.8);
      }
      ctx.fill();
      ctx.stroke();
      highlight(ctx, -r * 0.42, -r * 0.3, r * 0.14, r * 0.24, 0.45);
      break;
    }
    case 'banana':
      ctx.fillStyle = '#6B4A1E';
      ctx.beginPath();
      ctx.ellipse(-r * 0.96, -r * 0.36, r * 0.09, r * 0.12, 0.4, 0, Math.PI * 2);
      ctx.ellipse(r * 0.96, -r * 0.36, r * 0.09, r * 0.12, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(201,154,0,0.6)';
      ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, -r * 0.12);
      ctx.quadraticCurveTo(-r * 0.1, r * 0.78, r * 0.7, -r * 0.12);
      ctx.stroke();
      highlight(ctx, -r * 0.45, r * 0.22, r * 0.1, r * 0.22, 0.5);
      break;
    case 'mango': {
      const blush = ctx.createRadialGradient(r * 0.45, r * 0.35, 0, r * 0.45, r * 0.35, r * 0.75);
      blush.addColorStop(0, 'rgba(255,90,60,0.55)');
      blush.addColorStop(1, 'rgba(255,90,60,0)');
      itemPath(ctx, kind, r);
      ctx.fillStyle = blush;
      ctx.fill();
      ctx.fillStyle = '#5BA33B';
      ctx.strokeStyle = '#3B7A23';
      ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.beginPath();
      ctx.moveTo(-r * 0.15, -r * 0.72);
      ctx.quadraticCurveTo(r * 0.2, -r * 1.15, r * 0.62, -r * 0.92);
      ctx.quadraticCurveTo(r * 0.25, -r * 0.65, -r * 0.15, -r * 0.72);
      ctx.fill();
      ctx.stroke();
      highlight(ctx, -r * 0.45, -r * 0.25, r * 0.16, r * 0.26, 0.5);
      break;
    }
    case 'kiwi':
      ctx.fillStyle = 'rgba(70,40,15,0.35)';
      for (let i = 0; i < 14; i++) {
        const a = i * 2.4;
        const d = (0.25 + ((i * 37) % 10) / 16) * r;
        ctx.fillRect(Math.cos(a) * d, Math.sin(a) * d * 0.86, r * 0.05, r * 0.05);
      }
      highlight(ctx, -r * 0.4, -r * 0.35, r * 0.14, r * 0.22, 0.3);
      break;
    case 'blueberry':
      ctx.fillStyle = '#1E2A66';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        const b = a + Math.PI / 5;
        ctx.lineTo(Math.cos(a) * r * 0.3, -r * 0.42 + Math.sin(a) * r * 0.3);
        ctx.lineTo(Math.cos(b) * r * 0.12, -r * 0.42 + Math.sin(b) * r * 0.12);
      }
      ctx.closePath();
      ctx.fill();
      highlight(ctx, -r * 0.4, -r * 0.05, r * 0.14, r * 0.24, 0.5);
      break;
  }
  ctx.restore();
}

function drawBomb(ctx: CanvasRenderingContext2D, r: number, t: number) {
  ctx.save();
  // fuse
  ctx.strokeStyle = '#8B6B4A';
  ctx.lineWidth = Math.max(2, r * 0.1);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(r * 0.5, -r * 0.82);
  ctx.quadraticCurveTo(r * 0.75, -r * 1.25, r * 1.05, -r * 1.05);
  ctx.stroke();
  // spark
  const pulse = 0.85 + 0.15 * Math.sin(t * 18);
  ctx.translate(r * 1.08, -r * 1.08);
  ctx.fillStyle = '#FFB020';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const len = (i % 2 ? 0.16 : 0.32) * r * pulse;
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#FFF3C4';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(-r * 1.08, r * 1.08);
  // cap
  ctx.fillStyle = '#4B5059';
  ctx.save();
  ctx.translate(r * 0.42, -r * 0.72);
  ctx.rotate(0.6);
  ctx.fillRect(-r * 0.22, -r * 0.16, r * 0.44, r * 0.3);
  ctx.restore();
  // body
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = shade(ctx, r, '#6A707B', '#23272E');
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.07);
  ctx.strokeStyle = '#111317';
  ctx.stroke();
  // red warning band so it never reads as a dark fruit
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#E5484D';
  ctx.fillRect(-r, r * 0.1, r * 2, r * 0.26);
  ctx.restore();
  // ✕ mark
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = Math.max(2, r * 0.11);
  ctx.beginPath();
  ctx.moveTo(-r * 0.22, -r * 0.48);
  ctx.lineTo(r * 0.12, -r * 0.14);
  ctx.moveTo(r * 0.12, -r * 0.48);
  ctx.lineTo(-r * 0.22, -r * 0.14);
  ctx.stroke();
  highlight(ctx, -r * 0.45, -r * 0.42, r * 0.12, r * 0.2, 0.35);
  ctx.restore();
}

/**
 * Draws one half of a cut fruit. The cut runs along the local x axis after
 * rotating by `cutAngle`; `side` picks the half (+1 below the cut, -1 above).
 */
export function drawHalf(ctx: CanvasRenderingContext2D, kind: FruitKind, r: number, cutAngle: number, side: 1 | -1) {
  const p = PALETTE[kind];
  ctx.save();
  ctx.rotate(cutAngle);
  ctx.beginPath();
  ctx.rect(-r * 2, side > 0 ? 0 : -r * 2, r * 4, r * 2);
  ctx.clip();
  ctx.rotate(-cutAngle);
  drawItem(ctx, kind, r);
  // exposed flesh next to the cut
  ctx.save();
  ctx.scale(0.9, 0.9);
  itemPath(ctx, kind, r);
  ctx.restore();
  ctx.clip();
  ctx.rotate(cutAngle);
  const band = r * 0.42 * side;
  const g = ctx.createLinearGradient(0, 0, 0, band);
  g.addColorStop(0, p.core);
  g.addColorStop(0.35, p.flesh);
  g.addColorStop(1, p.flesh);
  ctx.fillStyle = g;
  ctx.fillRect(-r * 2, Math.min(0, band), r * 4, Math.abs(band));
  if (kind === 'kiwi' || kind === 'strawberry') {
    ctx.fillStyle = kind === 'kiwi' ? '#2B2B2B' : '#FFE38A';
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.ellipse(i * r * 0.2, band * 0.45, r * 0.035, r * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- cup

export type CupTopping = { kind: FruitKind; slot: number; rot: number; side: 1 | -1 };

export const MAX_TOPPINGS = 22;

/** Topping positions on the swirl, in cup-width units relative to the rim center. */
export const CUP_SLOTS: { u: number; v: number }[] = (() => {
  const slots: { u: number; v: number }[] = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // fill from the outer edge of the swirl inward so the cup looks balanced early on
  const rings = [
    { n: 8, ru: 0.36, rv: 0.13, cy: -0.1 },
    { n: 7, ru: 0.25, rv: 0.1, cy: -0.24 },
    { n: 5, ru: 0.15, rv: 0.06, cy: -0.36 },
    { n: 2, ru: 0.05, rv: 0.03, cy: -0.46 },
  ];
  for (const ring of rings) {
    const off = rand() * Math.PI;
    for (let i = 0; i < ring.n; i++) {
      const a = off + (i / ring.n) * Math.PI * 2;
      slots.push({ u: Math.cos(a) * ring.ru, v: ring.cy + Math.sin(a) * ring.rv });
    }
  }
  return slots.slice(0, MAX_TOPPINGS);
})();

export type CupLayout = { cx: number; rimY: number; w: number; toppingR: number };

export function cupLayout(width: number, height: number, bottomPad = 8): CupLayout {
  const w = Math.max(104, Math.min(170, width * 0.34));
  const cupH = w * 0.56;
  return { cx: width / 2, rimY: height - bottomPad - cupH, w, toppingR: w * 0.085 };
}

export function slotPosition(layout: CupLayout, slot: number) {
  const s = CUP_SLOTS[slot % CUP_SLOTS.length]!;
  return { x: layout.cx + s.u * layout.w, y: layout.rimY + s.v * layout.w };
}

export function drawCup(ctx: CanvasRenderingContext2D, layout: CupLayout, toppings: CupTopping[], fontFamily = 'sans-serif') {
  const { cx, rimY, w, toppingR } = layout;
  const cupH = w * 0.56;
  const topW = w;
  const botW = w * 0.72;
  ctx.save();
  // shadow
  ctx.fillStyle = 'rgba(25,31,40,0.08)';
  ctx.beginPath();
  ctx.ellipse(cx, rimY + cupH + 2, botW * 0.62, w * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // swirl (behind the rim)
  const swirl = (y: number, rx: number, ry: number) => {
    ctx.beginPath();
    ctx.ellipse(cx, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };
  ctx.fillStyle = '#FFF4F8';
  ctx.strokeStyle = '#EFC6D8';
  ctx.lineWidth = Math.max(1.5, w * 0.014);
  swirl(rimY - w * 0.08, w * 0.47, w * 0.16);
  swirl(rimY - w * 0.22, w * 0.36, w * 0.13);
  swirl(rimY - w * 0.34, w * 0.24, w * 0.1);
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.1, rimY - w * 0.4);
  ctx.quadraticCurveTo(cx + w * 0.02, rimY - w * 0.56, cx + w * 0.06, rimY - w * 0.5);
  ctx.quadraticCurveTo(cx + w * 0.12, rimY - w * 0.42, cx + w * 0.1, rimY - w * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // toppings sit on the swirl, drawn in slot order (outer ring first)
  for (const t of toppings) {
    const p = slotPosition(layout, t.slot);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(t.rot);
    drawHalf(ctx, t.kind, toppingR * SIZE[t.kind], 0, t.side);
    ctx.restore();
  }

  // cup body
  const body = ctx.createLinearGradient(cx - topW / 2, 0, cx + topW / 2, 0);
  body.addColorStop(0, '#F3E3EA');
  body.addColorStop(0.45, '#FFFFFF');
  body.addColorStop(1, '#EAD3DD');
  ctx.fillStyle = body;
  ctx.strokeStyle = '#E2C4D2';
  ctx.lineWidth = Math.max(1.5, w * 0.014);
  ctx.beginPath();
  ctx.moveTo(cx - topW / 2, rimY);
  ctx.lineTo(cx + topW / 2, rimY);
  ctx.lineTo(cx + botW / 2, rimY + cupH - w * 0.05);
  ctx.quadraticCurveTo(cx + botW / 2 - 2, rimY + cupH, cx + botW / 2 - w * 0.06, rimY + cupH);
  ctx.lineTo(cx - botW / 2 + w * 0.06, rimY + cupH);
  ctx.quadraticCurveTo(cx - botW / 2 + 2, rimY + cupH, cx - botW / 2, rimY + cupH - w * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // rim
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.ellipse(cx, rimY, topW / 2, w * 0.045, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // brand band
  ctx.fillStyle = '#960953';
  ctx.font = `800 ${Math.round(w * 0.12)}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Yogurtland', cx, rimY + cupH * 0.48);
  ctx.fillStyle = '#5B8C1F';
  ctx.font = `700 ${Math.round(w * 0.06)}px ${fontFamily}`;
  ctx.fillText('get real.', cx, rimY + cupH * 0.7);
  ctx.restore();
}
