// Foil Studio: turns a picture someone brings into the pair the card stage reads for a front, the
// same as the made cards': the print, and its masks (R foil, G pearl, B relief). Part of the
// picture goes to foil (whatever the mode picks out, and as much of it as asked), recoloured in
// the foil and raised off the paper; the rest stays printed as it was.

const LONG = 1280; // a front's long side, pixels

export const SHAPES = [
  { key: 'original', name: 'As it is' },
  { key: 'portrait', name: 'Portrait', aspect: 5 / 7 },
  { key: 'square', name: 'Square', aspect: 1 },
  { key: 'landscape', name: 'Landscape', aspect: 7 / 5 },
];

// what turns to foil
export const MODES = [
  { key: 'details', name: 'Details', hint: 'The fine lines and dark detail turn to foil.' },
  { key: 'darks', name: 'Shadows', hint: 'The darkest parts turn to foil.' },
  { key: 'colour', name: 'A colour', hint: 'Tap the picture to choose the colour that turns to foil.' },
];

// The foils there are to stamp with, the ones a print shop has on the roll. ink: the foil's
// colour printed flat, as sRGB; tint: what it throws back where it catches the light (as the made
// cards' tint); holo: a pearl over it that shifts colour as it turns
export const FOILS = [
  { key: 'gold', name: 'Gold', ink: [214, 170, 92], tint: [1, 0.72, 0.3] },
  { key: 'silver', name: 'Silver', ink: [200, 203, 210], tint: [0.88, 0.9, 0.97] },
  { key: 'rose', name: 'Rose gold', ink: [226, 162, 142], tint: [1, 0.7, 0.58] },
  { key: 'copper', name: 'Copper', ink: [200, 122, 80], tint: [1, 0.58, 0.36] },
  { key: 'pink', name: 'Pink', ink: [228, 128, 168], tint: [1, 0.58, 0.8] },
  { key: 'holo', name: 'Holographic', ink: [206, 210, 220], tint: [0.9, 0.92, 1], holo: true },
];

// the stock: the inside and back, and the cut edge
export const PAPERS = [
  { key: 'white', name: 'White', rgb: [245, 244, 241] },
  { key: 'cream', name: 'Cream', rgb: [241, 233, 217] },
  { key: 'blush', name: 'Blush', rgb: [236, 202, 198] },
  { key: 'sage', name: 'Sage', rgb: [200, 212, 192] },
  { key: 'sky', name: 'Sky', rgb: [200, 214, 230] },
  { key: 'midnight', name: 'Midnight', rgb: [42, 46, 64] },
];

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// --- filters on a single channel, w × h floats ---------------------------------------------

// a box blur, run `passes` times so it comes out close to a gaussian; the edges hold their value
export function blur(src, w, h, r, passes = 3) {
  let a = Float32Array.from(src);
  let b = new Float32Array(a.length);
  const inv = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let acc = a[row] * (r + 1);
      for (let k = 1; k <= r; k++) acc += a[row + Math.min(k, w - 1)];
      for (let x = 0; x < w; x++) {
        b[row + x] = acc * inv;
        acc += a[row + Math.min(x + r + 1, w - 1)] - a[row + Math.max(x - r, 0)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = b[x] * (r + 1);
      for (let k = 1; k <= r; k++) acc += b[Math.min(k, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc * inv;
        acc += b[Math.min(y + r + 1, h - 1) * w + x] - b[Math.max(y - r, 0) * w + x];
      }
    }
  }
  return a;
}

// the least (or most) in each 3 × 3, for wearing specks away and growing back what's left
function rank(src, w, h, pick) {
  const a = new Float32Array(src.length);
  const b = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      a[i] = pick(src[x > 0 ? i - 1 : i], src[i], src[x < w - 1 ? i + 1 : i]);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      b[i] = pick(a[y > 0 ? i - w : i], a[i], a[y < h - 1 ? i + w : i]);
    }
  }
  return b;
}

// --- colour ------------------------------------------------------------------------------

const LINEAR = Float32Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
});

// OKLab, where a distance reads about the way a difference in colour looks
function oklab(r, g, b) {
  const R = LINEAR[r];
  const G = LINEAR[g];
  const B = LINEAR[b];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

// --- the picture ---------------------------------------------------------------------------

// The picture cut to the card: filled to the shape asked for (or its own, kept within what
// folds into a card), centred, at the front's size, over white for anything see-through.
// `designedFx` is a made card's own masks, cut the same way, for the foil it was made with.
// `place` maps a box on the picture, in its own pixels, to where it lands on the cover.
export function coverOf(image, shape, designedFx = null) {
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  const own = iw / ih;
  const aspect = SHAPES.find((s) => s.key === shape)?.aspect ?? Math.min(1.5, Math.max(0.62, own));
  const w = aspect >= 1 ? LONG : Math.round(LONG * aspect);
  const h = aspect >= 1 ? Math.round(LONG / aspect) : LONG;
  const sw = own > aspect ? ih * aspect : iw;
  const sh = own > aspect ? ih : iw / aspect;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  const cut = (src, fill) => {
    const c = canvasOf(w, h);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = fill;
    g.fillRect(0, 0, w, h);
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    return { c, data: g.getImageData(0, 0, w, h).data };
  };
  const { c: canvas, data: px } = cut(image, '#ffffff');
  const lum = new Float32Array(w * h);
  for (let i = 0; i < lum.length; i++) {
    lum[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
  }
  let designed = null;
  if (designedFx) {
    const { data } = cut(designedFx, '#000000');
    designed = { foil: new Float32Array(w * h), relief: new Float32Array(w * h) };
    for (let i = 0; i < lum.length; i++) {
      designed.foil[i] = data[i * 4] / 255;
      designed.relief[i] = data[i * 4 + 2] / 255;
    }
  }
  const k = w / sw;
  const place = ([x, y, bw, bh]) => [(x - sx) * k, (y - sy) * k, bw * k, bh * k].map(Math.round);
  return { canvas, w, h, px, lum, designed, place, ground: groundOf(px, w, h), cache: new Map() };
}

// The bare paper a picture is drawn on, if it's drawn on any: the colour most of its edge comes
// close to, counted only if it's light and near grey, the way paper is. A photo that runs to its
// edges has none (`plain` is false), so it keeps its own colours whatever the stock.
function groundOf(px, w, h) {
  const edge = [];
  for (let x = 0; x < w; x += 2) edge.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y += 2) edge.push(y * w, y * w + w - 1);
  const bins = new Map();
  for (const i of edge) {
    const key = (px[i * 4] >> 4) * 256 + (px[i * 4 + 1] >> 4) * 16 + (px[i * 4 + 2] >> 4);
    bins.set(key, (bins.get(key) || 0) + 1);
  }
  const top = [...bins.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  const sum = [0, 0, 0];
  let n = 0;
  for (const i of edge) {
    if ((px[i * 4] >> 4) * 256 + (px[i * 4 + 1] >> 4) * 16 + (px[i * 4 + 2] >> 4) !== top) continue;
    for (let c = 0; c < 3; c++) sum[c] += px[i * 4 + c];
    n++;
  }
  const rgb = sum.map((v) => v / n);
  const near = edge.filter(
    (i) => Math.hypot(px[i * 4] - rgb[0], px[i * 4 + 1] - rgb[1], px[i * 4 + 2] - rgb[2]) < 28,
  ).length;
  const light = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  const grey = Math.max(...rgb) - Math.min(...rgb);
  return { rgb, plain: near / edge.length > 0.4 && light > 0.75 && grey < 45 };
}

// How much each pixel is that bare paper, 1 where it's nothing but. Its own colour counts wherever
// it is (inside a letter, between stems); colours only near it, like a wash over the stock, count
// where they join the card's edge through more of it, so a pale highlight in a petal stays put.
export function groundMaskOf(cover) {
  if (!cover.groundMask) {
    const { w, h, px, ground } = cover;
    const [r, g, b] = ground.rgb;
    const a = new Float32Array(w * h);
    const exact = new Float32Array(w * h);
    for (let i = 0; i < a.length; i++) {
      const far = Math.hypot(px[i * 4] - r, px[i * 4 + 1] - g, px[i * 4 + 2] - b);
      a[i] = 1 - smoothstep(24, 64, far);
      exact[i] = 1 - smoothstep(10, 22, far);
    }
    const reach = new Float32Array(w * h);
    const stack = [];
    const visit = (i) => {
      if (!reach[i] && a[i] > 0.35) {
        reach[i] = 1;
        stack.push(i);
      }
    };
    for (let x = 0; x < w; x++) (visit(x), visit((h - 1) * w + x));
    for (let y = 0; y < h; y++) (visit(y * w), visit(y * w + w - 1));
    while (stack.length) {
      const i = stack.pop();
      const x = i % w;
      if (x > 0) visit(i - 1);
      if (x < w - 1) visit(i + 1);
      if (i >= w) visit(i - w);
      if (i < w * (h - 1)) visit(i + w);
    }
    // grown a little, so the soft rim round what's reached comes with it
    const near = rank(rank(reach, w, h, Math.max), w, h, Math.max);
    for (let i = 0; i < a.length; i++) a[i] = Math.max(exact[i], a[i] * near[i]);
    cover.groundMask = blur(a, w, h, 1, 1);
  }
  return cover.groundMask;
}

// the colour at a spot on the picture (u, v in shares of it), taken over a few pixels round it
export function pickAt(cover, u, v) {
  const { w, h, px } = cover;
  const cx = Math.round(u * (w - 1));
  const cy = Math.round(v * (h - 1));
  const sum = [0, 0, 0];
  let n = 0;
  for (let y = Math.max(0, cy - 3); y <= Math.min(h - 1, cy + 3); y++) {
    for (let x = Math.max(0, cx - 3); x <= Math.min(w - 1, cx + 3); x++) {
      for (let c = 0; c < 3; c++) sum[c] += px[(y * w + x) * 4 + c];
      n++;
    }
  }
  return sum.map((s) => Math.round(s / n));
}

// how strongly each pixel reads as the kind of thing the mode turns to foil
function scoreOf(cover, mode, pick) {
  const key = mode === 'colour' ? `colour ${pick}` : mode;
  if (cover.cache.has(key)) return cover.cache.get(key);
  const { w, h, lum, px } = cover;
  let s;
  if (mode === 'details') {
    // darker than what's round it: lines, outlines, eyes, lettering. Taken off a softened copy,
    // so the grain of a photo or a painted texture doesn't count as detail.
    const fine = blur(lum, w, h, 2, 2);
    const around = blur(lum, w, h, Math.max(2, Math.round(Math.max(w, h) * 0.009)));
    s = new Float32Array(lum.length);
    for (let i = 0; i < s.length; i++) s[i] = Math.max(0, around[i] - fine[i]);
  } else if (mode === 'darks') {
    // softened well first, so what's cut out has the smooth outline of a stamp, not the picture's
    // grain or its compression blocks
    s = blur(lum, w, h, Math.max(2, Math.round(Math.max(w, h) * 0.004)), 3);
    for (let i = 0; i < s.length; i++) s[i] = 1 - s[i];
  } else {
    // nearness to the colour picked, 1 on it
    const [L0, a0, b0] = oklab(...pick);
    s = new Float32Array(lum.length);
    for (let i = 0; i < s.length; i++) {
      const [L, a, b] = oklab(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
      s[i] = 1 - Math.hypot(L - L0, a - a0, b - b0);
    }
    s = blur(s, w, h, 1, 1);
  }
  cover.cache.set(key, s);
  return s;
}

// the score above which `share` of the picture lies (of the part `within`, if given)
function quantile(s, share, within = null) {
  let top = 1e-6;
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    if (within && !within[i]) continue;
    count++;
    if (s[i] > top) top = s[i];
  }
  const bins = new Uint32Array(2048);
  for (let i = 0; i < s.length; i++) {
    if (within && !within[i]) continue;
    bins[Math.min(2047, Math.floor((Math.max(0, s[i]) / top) * 2047))]++;
  }
  let over = 0;
  const want = share * count;
  for (let k = 2047; k >= 0; k--) {
    over += bins[k];
    if (over >= want) return { at: (k / 2047) * top, top };
  }
  return { at: 0, top };
}

// Clears away the pieces of foil smaller than `least` pixels (a piece being anything over half
// foil, joined at its corners too), so what's left reads as stamped shapes, not dust; it keeps the
// soft edge round what stays.
function dropSpecks(foil, w, h, least) {
  const label = new Int32Array(w * h).fill(-1);
  const sizes = [];
  const stack = [];
  for (let i = 0; i < foil.length; i++) {
    if (foil[i] < 0.5 || label[i] >= 0) continue;
    const n = sizes.length;
    let size = 0;
    label[i] = n;
    stack.push(i);
    while (stack.length) {
      const k = stack.pop();
      size++;
      const x = k % w;
      const y = (k - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (label[j] < 0 && foil[j] >= 0.5) {
            label[j] = n;
            stack.push(j);
          }
        }
      }
    }
    sizes.push(size);
  }
  // a pixel stays if it's in a piece big enough, or at the soft edge of one
  const keep = new Uint8Array(w * h);
  for (let i = 0; i < keep.length; i++) {
    if (label[i] < 0 || sizes[label[i]] < least) continue;
    const x = i % w;
    const y = (i - x) / w;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) keep[yy * w + xx] = 1;
      }
    }
  }
  const out = new Float32Array(foil.length);
  for (let i = 0; i < out.length; i++) out[i] = keep[i] ? foil[i] : 0;
  return out;
}

// 1 inside any of the boxes ([x, y, w, h] in the cover's pixels), 0 outside them all
function areaOf(w, h, boxes) {
  const within = new Uint8Array(w * h);
  for (const [bx, by, bw, bh] of boxes) {
    const x0 = Math.max(0, Math.round(bx));
    const y0 = Math.max(0, Math.round(by));
    const x1 = Math.min(w, Math.round(bx + bw));
    const y1 = Math.min(h, Math.round(by + bh));
    for (let y = y0; y < y1; y++) within.fill(1, y * w + x0, y * w + Math.max(x0, x1));
  }
  return within;
}

// a fine double rule stamped round the edge
function rimOf(w, h) {
  const c = canvasOf(w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  const s = Math.min(w, h);
  const inset = s * 0.045;
  const lw = s * 0.0075;
  g.strokeStyle = '#ffffff';
  g.lineWidth = lw;
  g.strokeRect(inset, inset, w - 2 * inset, h - 2 * inset);
  g.lineWidth = lw * 0.4;
  const in2 = inset + lw * 2.4;
  g.strokeRect(in2, in2, w - 2 * in2, h - 2 * in2);
  const d = g.getImageData(0, 0, w, h).data;
  const rim = new Float32Array(w * h);
  for (let i = 0; i < rim.length; i++) rim[i] = d[i * 4 + 3] / 255;
  return rim;
}

// What's foil, 0 to 1 a pixel. amount: for most modes the share of the picture that goes to
// foil; for a colour, how far from it still counts. `area`, boxes in the cover's pixels, keeps
// the foil to them, and then the share is of them. 'designed' is a made card's own foil, as it
// was made.
export function maskOf(cover, { mode, amount, pick, border, area }) {
  const { w, h } = cover;
  const within = area?.length ? areaOf(w, h, area) : null;
  let foil;
  if (mode === 'designed' && cover.designed) {
    foil = Float32Array.from(cover.designed.foil);
  } else if (mode === 'colour' && !pick) {
    foil = new Float32Array(w * h);
  } else {
    const s = scoreOf(cover, mode, pick);
    foil = new Float32Array(s.length);
    if (mode === 'colour') {
      const near = 1 - (0.03 + amount * 0.32);
      for (let i = 0; i < s.length; i++) foil[i] = within && !within[i] ? 0 : smoothstep(near - 0.025, near + 0.025, s[i]);
    } else {
      const { at, top } = quantile(s, amount, within);
      // Detail faint enough to be the grain of the picture only counts when a lot of foil is
      // asked for; short of that, a picture without much drawn into it gets less foil, not dust.
      const faint = mode === 'details' ? 0.07 * Math.max(0, 1 - amount / 0.4) : 0;
      const cut = Math.max(at, top * 0.03, faint);
      // a narrow band, so the foil's edge is crisp even where the picture only fades
      const soft = cut * 0.04 + top * 0.002;
      for (let i = 0; i < s.length; i++) foil[i] = within && !within[i] ? 0 : smoothstep(cut - soft, cut + soft, s[i]);
    }
    // wear away the stray specks, grow back what's left, and soften its edge a touch
    foil = rank(rank(foil, w, h, Math.min), w, h, Math.max);
    foil = dropSpecks(foil, w, h, w * h * 0.00012);
    foil = blur(foil, w, h, 1, 1);
  }
  const rim = border ? rimOf(w, h) : null;
  if (rim) for (let i = 0; i < foil.length; i++) foil[i] = Math.max(foil[i], rim[i]);
  const designed = mode === 'designed' ? cover.designed : null;
  return { foil, rim, designed };
}

// The print and masks for the stage. In the foil, the picture's own light and dark still shows,
// about the foil's middle tone; the relief raises the foil off the paper, with the picture's fine
// detail pressed into it. A made
// card's own foil keeps its own relief, and, in the gold it was made in, its own print. Where the
// picture is on bare paper, that paper becomes the stock chosen (`paper`, sRGB), its grain kept.
export function artOf(cover, { foil, rim, designed }, finish, paper) {
  const { w, h, px, lum, ground } = cover;
  const restock = paper && ground.plain ? groundMaskOf(cover) : null;
  const groundLight = (0.299 * ground.rgb[0] + 0.587 * ground.rgb[1] + 0.114 * ground.rgb[2]) / 255;
  const soft = blur(foil, w, h, 1, 3);
  const base = blur(lum, w, h, 2, 2);
  const rimSoft = rim ? blur(rim, w, h, 1, 3) : null;
  const asMade = designed && finish.key === 'gold';
  let sum = 0;
  let weight = 0;
  for (let i = 0; i < foil.length; i++) {
    sum += foil[i] * lum[i];
    weight += foil[i];
  }
  const mid = weight > 0 ? sum / weight : 0.5;
  const print = canvasOf(w, h);
  const fx = canvasOf(w, h);
  const P = new ImageData(w, h);
  const F = new ImageData(w, h);
  const [ir, ig, ib] = finish.ink;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const k = i * 4;
      const m = foil[i];
      const L = lum[i];
      const detail = L - base[i];
      const tone = Math.min(1.25, Math.max(0.45, 1 + 0.7 * (L - mid)));
      let fr = ir * tone;
      let fg = ig * tone;
      let fb = ib * tone;
      if (finish.holo) {
        // the holographic foil's rainbow runs across the card on a slant
        const phase = 6.2831853 * ((x / w) * 0.9 + (y / h) * 0.55);
        fr *= 0.82 + 0.3 * Math.cos(phase);
        fg *= 0.82 + 0.3 * Math.cos(phase - 2.07);
        fb *= 0.82 + 0.3 * Math.cos(phase - 4.15);
      }
      let r = px[k];
      let g = px[k + 1];
      let b = px[k + 2];
      if (restock) {
        const t = restock[i] * (1 - m);
        const grain = L / groundLight;
        r += (paper[0] * grain - r) * t;
        g += (paper[1] * grain - g) * t;
        b += (paper[2] * grain - b) * t;
      }
      const ink = asMade ? (rim ? rim[i] : 0) : m;
      P.data[k] = r + (fr - r) * ink;
      P.data[k + 1] = g + (fg - g) * ink;
      P.data[k + 2] = b + (fb - b) * ink;
      P.data[k + 3] = 255;
      let relief;
      if (designed) {
        relief = Math.max(designed.relief[i], rimSoft ? clamp01(0.51 * rimSoft[i] + 0.08) : 0);
      } else {
        relief = clamp01((0.6 * soft[i] + 0.5 * detail * m) * 0.85 + 0.08);
      }
      F.data[k] = m * 255;
      F.data[k + 1] = finish.holo ? m * 215 : 0;
      F.data[k + 2] = relief * 255;
      F.data[k + 3] = 255;
    }
  }
  print.getContext('2d').putImageData(P, 0, 0);
  fx.getContext('2d').putImageData(F, 0, 0);
  return { print, fx };
}
