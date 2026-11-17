// Little hearts in thick paint, drawn once into a strip the painted cards float up off a cat or a
// fawn when it's petted. Each is the shape filled in its colour, shaded light at the upper left and
// deep at the lower right the way the paintings are lit, worked over with short strokes that follow
// its curve and a few pale dabs where the light catches the paint, its edge laid on by hand. The
// stage reads them like any print: the colour, masks (no gold, wet paint, all relief), and a lift
// mask whose red is each heart's outline.

const HEART = 72; // each heart's square in the strip, in pixels
const COLORS = ['#e2434b', '#ef7a6b', '#f2a2a6', '#d24d66', '#f5b5a8', '#c7343f'];
export const HEARTS = COLORS.length; // along the strip

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a plump heart, its middle at cx, cy, s across from its middle to either lobe's edge
function heart(g, cx, cy, s) {
  g.beginPath();
  g.moveTo(cx, cy + s * 0.92);
  g.bezierCurveTo(cx - s * 1.15, cy + s * 0.22, cx - s * 1.08, cy - s * 0.9, cx - s * 0.5, cy - s * 0.84);
  g.bezierCurveTo(cx - s * 0.16, cy - s * 0.8, cx, cy - s * 0.5, cx, cy - s * 0.38);
  g.bezierCurveTo(cx, cy - s * 0.5, cx + s * 0.16, cy - s * 0.8, cx + s * 0.5, cy - s * 0.84);
  g.bezierCurveTo(cx + s * 1.08, cy - s * 0.9, cx + s * 1.15, cy + s * 0.22, cx, cy + s * 0.92);
  g.closePath();
}

// a colour made lighter (k > 0) or darker (k < 0)
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)));
  return `rgb(${c.join(',')})`;
}

export function paintHearts() {
  const n = COLORS.length;
  const make = () => {
    const c = document.createElement('canvas');
    c.width = HEART * n;
    c.height = HEART;
    return c;
  };
  const print = make();
  const fx = make();
  const lift = make();
  const pg = print.getContext('2d');
  const fg = fx.getContext('2d');
  const lg = lift.getContext('2d');
  // the masks on solid black, so a heart's soft edge is in their red (a transparent canvas would
  // lose it to its alpha)
  for (const g of [fg, lg]) {
    g.fillStyle = '#000';
    g.fillRect(0, 0, HEART * n, HEART);
  }
  // the print's ground under each heart is its own colour, so its soft edge never shows another
  const rand = seeded(1225);
  COLORS.forEach((color, i) => {
    const cx = HEART * i + HEART / 2;
    const cy = HEART / 2 + 2;
    const s = HEART * 0.34;
    pg.fillStyle = color;
    pg.fillRect(HEART * i, 0, HEART, HEART);

    pg.save();
    heart(pg, cx, cy, s);
    pg.clip();
    // lit from the upper left, deep at the lower right
    const light = pg.createRadialGradient(cx - s * 0.5, cy - s * 0.5, 1, cx - s * 0.3, cy - s * 0.2, s * 1.6);
    light.addColorStop(0, shade(color, 0.32));
    light.addColorStop(0.55, color);
    light.addColorStop(1, shade(color, -0.32));
    pg.fillStyle = light;
    pg.fillRect(HEART * i, 0, HEART, HEART);
    // short strokes of paint round its curve, some a little lighter, some a little deeper
    pg.lineCap = 'round';
    for (let k = 0; k < 46; k++) {
      const a = rand() * Math.PI * 2;
      const r = s * (0.15 + 0.85 * Math.sqrt(rand()));
      const x = cx + Math.cos(a) * r;
      const y = cy - s * 0.15 + Math.sin(a) * r * 0.95;
      const len = s * (0.18 + 0.3 * rand());
      const t = a + Math.PI / 2 + (rand() - 0.5) * 0.5;
      pg.strokeStyle = shade(color, (rand() - 0.45) * 0.42);
      pg.globalAlpha = 0.55 + 0.4 * rand();
      pg.lineWidth = 1.6 + 2.4 * rand();
      pg.beginPath();
      pg.moveTo(x - (Math.cos(t) * len) / 2, y - (Math.sin(t) * len) / 2);
      pg.quadraticCurveTo(x + Math.cos(a) * 2, y + Math.sin(a) * 2, x + (Math.cos(t) * len) / 2, y + (Math.sin(t) * len) / 2);
      pg.stroke();
    }
    // where the light catches the wet paint, on the left lobe
    for (let k = 0; k < 5; k++) {
      pg.globalAlpha = 0.5 + 0.4 * rand();
      pg.fillStyle = shade(color, 0.75);
      pg.beginPath();
      pg.ellipse(cx - s * (0.35 + 0.3 * rand()), cy - s * (0.45 + 0.2 * rand()), 1.2 + 2 * rand(), 0.8 + rand(), -0.6, 0, Math.PI * 2);
      pg.fill();
    }
    pg.restore();
    // its edge, laid on by hand: a little deeper than it, and not quite even
    pg.globalAlpha = 0.6;
    pg.strokeStyle = shade(color, -0.22);
    pg.lineWidth = 1.6;
    heart(pg, cx, cy, s);
    pg.stroke();
    pg.globalAlpha = 1;

    // masks: no gold, wet paint, all relief; and its outline, a hair outside the painted edge
    fg.fillStyle = 'rgb(0, 210, 255)';
    heart(fg, cx, cy, s);
    fg.fill();
    lg.fillStyle = '#ff0000';
    lg.strokeStyle = '#ff0000';
    lg.lineWidth = 1.5;
    heart(lg, cx, cy, s);
    lg.fill();
    lg.stroke();
  });
  return { print, fx, lift };
}
