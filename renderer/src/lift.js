// The lift mask a card that comes alive reads (as live.js and the shaders describe it), drawn from its
// picture and its spec rather than cut by hand:
//
//   R  the outline of each thing that stands off the paper or moves whole: what's in each lifted
//      piece's box, each cut-out mover's patch, and the leaf and smoke templates, told from the
//      colour round the edge of its box (a moon on the sky, a star, a cloud)
//   G  what's painted as giving off light: the bright paint at each light (its core, or a box)
//   B  glass that snow falls behind: each snowfall area, where the picture is dark there
//
// Everything is in the card's pixels (the picture as cut to the card), y down.

import { blur } from './studio.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// a box clipped to the card, in whole pixels: [x0, y0, x1, y1]
function clip([x, y, w, h], W, H) {
  return [Math.max(0, Math.floor(x)), Math.max(0, Math.floor(y)), Math.min(W, Math.ceil(x + w)), Math.min(H, Math.ceil(y + h))];
}

function median(values) {
  const s = Float32Array.from(values).sort();
  return s.length ? s[s.length >> 1] : 0;
}

// What's in a box, told from the colour round its edge: 1 well away from that colour, 0 on it.
function cutOut(R, cover, box) {
  const { w: W, h: H, px } = cover;
  const [x0, y0, x1, y1] = clip(box, W, H);
  if (x1 - x0 < 3 || y1 - y0 < 3) return;
  const edge = [[], [], []];
  for (let x = x0; x < x1; x++) {
    for (const y of [y0, y0 + 1, y1 - 2, y1 - 1]) for (let c = 0; c < 3; c++) edge[c].push(px[(y * W + x) * 4 + c]);
  }
  for (let y = y0; y < y1; y++) {
    for (const x of [x0, x0 + 1, x1 - 2, x1 - 1]) for (let c = 0; c < 3; c++) edge[c].push(px[(y * W + x) * 4 + c]);
  }
  const ground = edge.map(median);
  const bw = x1 - x0;
  const bh = y1 - y0;
  let a = new Float32Array(bw * bh);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const k = (y * W + x) * 4;
      const far = Math.hypot(px[k] - ground[0], px[k + 1] - ground[1], px[k + 2] - ground[2]);
      a[(y - y0) * bw + (x - x0)] = smoothstep(26, 62, far);
    }
  }
  a = blur(a, bw, bh, 1, 1);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * W + x;
      R[i] = Math.max(R[i], a[(y - y0) * bw + (x - x0)]);
    }
  }
}

// the bright paint at a light: in its box if it has one, else round it, fading out at the edge
function light(G, cover, g) {
  const { w: W, h: H, lum } = cover;
  const box = g.emitBox;
  const reach = g.emitR ?? (g.r ?? 20) * 1.4;
  const [cx, cy] = g.at;
  const [x0, y0, x1, y1] = clip(box ?? [cx - reach, cy - reach, 2 * reach, 2 * reach], W, H);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * W + x;
      const near = box ? 1 : smoothstep(reach, reach * 0.55, Math.hypot(x - cx, y - cy));
      G[i] = Math.max(G[i], smoothstep(0.55, 0.82, lum[i]) * near);
    }
  }
}

// glass that snow falls behind, where the picture is dark (a night sky through a window)
function glass(B, cover, box, darkOnly) {
  const { w: W, h: H, lum } = cover;
  const [x0, y0, x1, y1] = clip(box, W, H);
  const soft = 6;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * W + x;
      const edge = Math.min(x - x0, x1 - 1 - x, y - y0, y1 - 1 - y);
      const dark = darkOnly ? smoothstep(0.62, 0.38, lum[i]) : 1;
      B[i] = Math.max(B[i], smoothstep(0, soft, edge) * dark);
    }
  }
}

// a mover's patch as a box: an oval's, or a capsule's from its pivot to its tip
function patchBox(m) {
  if (m.tip) {
    const [px, py] = m.pivot;
    const [tx, ty] = m.tip;
    const r = m.width;
    return [Math.min(px, tx) - r, Math.min(py, ty) - r, Math.abs(tx - px) + 2 * r, Math.abs(ty - py) + 2 * r];
  }
  const [cx, cy, rx, ry] = m.area;
  return [cx - rx, cy - ry, 2 * rx, 2 * ry];
}

export function liftOf(cover, live) {
  const { w: W, h: H } = cover;
  const R = new Float32Array(W * H);
  const G = new Float32Array(W * H);
  const B = new Float32Array(W * H);
  const boxes = [
    ...(live.lifted || []).map((p) => p.box),
    ...(live.cutouts || []),
    ...Object.values(live.movers || {})
      .filter((m) => m.cut)
      .map(patchBox),
    ...(live.leaves ? [live.leaves.box] : []),
    ...(live.smoke ? [live.smoke.box] : []),
  ];
  for (const box of boxes) cutOut(R, cover, box);
  for (const g of live.glows || []) if ((g.emit ?? 1) > 0) light(G, cover, g);
  for (const box of live.snowfall?.areas || []) glass(B, cover, box, live.snowfall.darkOnly !== false);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const img = g.createImageData(W, H);
  for (let i = 0; i < R.length; i++) {
    img.data[i * 4] = R[i] * 255;
    img.data[i * 4 + 1] = G[i] * 255;
    img.data[i * 4 + 2] = B[i] * 255;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return canvas;
}
