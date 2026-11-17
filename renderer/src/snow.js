// Flakes of snow in thick white paint, drawn once into a strip the cards scatter as falling snow.
// Each is a soft, not quite round dab, lit from the upper left the way the cards are, a little blue
// in its shade, with a stroke or two of paint across it. The stage reads them like any print: the
// colour, masks (no gold, wet paint, all relief), and a lift mask whose red is each flake's outline.

const CELL = 40; // each flake's square in the strip, in pixels
const COUNT = 6; // along the strip (live.js reads six)

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a dab of paint: round, with its edge pushed in and out a little at a few points
function dab(g, cx, cy, r, wobble) {
  g.beginPath();
  const n = wobble.length;
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2;
    const rr = r * (1 + wobble[k % n]);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (k === 0) g.moveTo(x, y);
    else {
      const am = ((k - 0.5) / n) * Math.PI * 2;
      const rm = r * (1 + 0.5 * (wobble[k % n] + wobble[(k - 1) % n]));
      g.quadraticCurveTo(cx + Math.cos(am) * rm * 1.04, cy + Math.sin(am) * rm * 1.04, x, y);
    }
  }
  g.closePath();
}

export function paintSnow() {
  const make = () => {
    const c = document.createElement('canvas');
    c.width = CELL * COUNT;
    c.height = CELL;
    return c;
  };
  const print = make();
  const fx = make();
  const lift = make();
  const pg = print.getContext('2d');
  const fg = fx.getContext('2d');
  const lg = lift.getContext('2d');
  // the masks on solid black, so a flake's soft edge is in their red
  for (const g of [fg, lg]) {
    g.fillStyle = '#000';
    g.fillRect(0, 0, CELL * COUNT, CELL);
  }
  // the print's ground under each flake is its own colour, so its soft edge never shows another
  pg.fillStyle = '#eef2f8';
  pg.fillRect(0, 0, CELL * COUNT, CELL);
  const rand = seeded(1225);
  for (let i = 0; i < COUNT; i++) {
    const cx = CELL * i + CELL / 2;
    const cy = CELL / 2;
    const r = CELL * (0.25 + 0.05 * rand());
    const wobble = Array.from({ length: 7 }, () => (rand() - 0.5) * 0.16);

    pg.save();
    dab(pg, cx, cy, r, wobble);
    pg.clip();
    const light = pg.createRadialGradient(cx - r * 0.45, cy - r * 0.5, 1, cx - r * 0.2, cy - r * 0.15, r * 1.5);
    light.addColorStop(0, '#ffffff');
    light.addColorStop(0.55, '#f1f4f9');
    light.addColorStop(1, '#c5d0e2');
    pg.fillStyle = light;
    pg.fillRect(CELL * i, 0, CELL, CELL);
    // a stroke or two of paint across it
    pg.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const a = rand() * Math.PI;
      const off = (rand() - 0.5) * r;
      pg.strokeStyle = rand() < 0.5 ? 'rgba(255,255,255,0.9)' : 'rgba(196,208,228,0.7)';
      pg.lineWidth = 1.2 + rand() * 1.6;
      pg.beginPath();
      pg.moveTo(cx + Math.cos(a) * r * 0.7 - Math.sin(a) * off, cy + Math.sin(a) * r * 0.7 + Math.cos(a) * off);
      pg.lineTo(cx - Math.cos(a) * r * 0.7 - Math.sin(a) * off, cy - Math.sin(a) * r * 0.7 + Math.cos(a) * off);
      pg.stroke();
    }
    pg.restore();

    // masks: no gold, wet paint, all relief; and its outline, a hair outside the painted edge
    fg.fillStyle = 'rgb(0, 190, 255)';
    dab(fg, cx, cy, r, wobble);
    fg.fill();
    lg.fillStyle = '#ff0000';
    lg.strokeStyle = '#ff0000';
    lg.lineWidth = 1.2;
    dab(lg, cx, cy, r, wobble);
    lg.fill();
    lg.stroke();
  }
  return { print, fx, lift };
}
