import type { CSSProperties } from 'react';
import type { GameSlug } from '@/games/registry';
import { SliceThumb } from '@/games/slice/SliceThumb';
import './thumbnails.css';

function CatchThumb() {
  const drops: { src: string; left: string; top: string; rotate: number }[] = [
    { src: 'strawberry', left: '14%', top: '16%', rotate: -12 },
    { src: 'kiwi', left: '70%', top: '10%', rotate: 10 },
    { src: 'gummy-bear', left: '40%', top: '30%', rotate: 6 },
    { src: 'cookie', left: '78%', top: '44%', rotate: -8 },
    { src: 'soccer-ball', left: '20%', top: '52%', rotate: 0 },
  ];
  return (
    <div className="thumb thumb-catch">
      {drops.map((d) => (
        <img
          key={d.src}
          className="drop"
          src={`/catch/${d.src}.png`}
          alt=""
          style={{ left: d.left, top: d.top, transform: `rotate(${d.rotate}deg)` }}
          draggable={false}
        />
      ))}
      <img className="cup" src="/catch/berry.png" alt="" draggable={false} />
    </div>
  );
}

// Same colors and toppings as the Froyo Crush board.
const CRUSH_TILES: Record<string, [string, string, string]> = {
  s: ['🍓', '#FF8A9A', '#D31E3C'],
  b: ['🫐', '#8FA0FF', '#2E3C93'],
  k: ['🥝', '#C6EC7C', '#5C8C1E'],
  m: ['🥭', '#FFD97A', '#E08A00'],
  c: ['🍫', '#C89A6B', '#6B3E1D'],
  o: ['🍥', '#FFE3EE', '#E8A9C4'],
};
const CRUSH_LAYOUT = ['skmsbo', 'bsscmk', 'ockkkm', 'mbsoks'];

function CrushThumb() {
  return (
    <div className="thumb thumb-crush">
      <div className="mini-board">
        {CRUSH_LAYOUT.flatMap((row, r) =>
          row.split('').map((key, c) => {
            const [emoji, a, b] = CRUSH_TILES[key]!;
            const style: CSSProperties = { background: `radial-gradient(circle at 32% 26%, ${a}, ${b} 78%)` };
            return (
              <span key={`${r}-${c}`} className={`mini-tile${r === 2 && c >= 2 && c <= 4 ? ' glow' : ''}`} style={style}>
                {emoji}
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}

const WORDLE_ROWS: { word: string; marks: ('correct' | 'present' | 'absent')[] }[] = [
  { word: 'CREAM', marks: ['absent', 'present', 'present', 'absent', 'absent'] },
  { word: 'FERRY', marks: ['absent', 'correct', 'correct', 'correct', 'correct'] },
  { word: 'BERRY', marks: ['correct', 'correct', 'correct', 'correct', 'correct'] },
];

function WordleThumb() {
  return (
    <div className="thumb thumb-wordle">
      <div className="mini-grid">
        {WORDLE_ROWS.map((row) => (
          <div key={row.word} className="mini-row">
            {row.word.split('').map((letter, i) => (
              <span key={i} className={`mini-letter ${row.marks[i]}`}>
                {letter}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SliceThumbFrame() {
  return (
    <div className="thumb thumb-slice">
      <SliceThumb />
    </div>
  );
}

export function GameThumbnail({ slug }: { slug: GameSlug }) {
  switch (slug) {
    case 'catch':
      return <CatchThumb />;
    case 'crush':
      return <CrushThumb />;
    case 'wordle':
      return <WordleThumb />;
    case 'slice':
      return <SliceThumbFrame />;
  }
}
