// A page of greeting cards: reads the card data the build script wrote into the page (the pictures,
// as data URLs, and each card's settings), makes each card's front and masks from its picture, and
// deals them on the stage. A small dock opens the card and turns it over; with more than one card,
// it shows them all to pick from. Without WebGL, the page shows the picture and the letter flat.

import { liftOf } from './lift.js';
import { paintFxOf } from './paint.js';
import { createStage } from './stage.js';
import { artOf, coverOf, FOILS, maskOf, PAPERS, pickAt } from './studio.js';

// the hand the letter is written in: Caveat, embedded in the page, then whatever the device has
const HAND = "'Caveat', 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive";

const AMOUNT = { details: 0.12, darks: 0.15, colour: 0.3 };

function imageOf(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The picture could not be read'));
    image.src = src;
  });
}

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a stock by name (white, cream, blush, sage, sky, midnight), as #rrggbb or [r, g, b]; with none
// named, the picture's own paper if it's drawn on any, and cream if not
function paperOf(p, cover) {
  if (Array.isArray(p) && p.length === 3) return { name: 'custom', rgb: p.map(Number) };
  if (typeof p === 'string' && /^#?[0-9a-f]{6}$/i.test(p)) {
    const n = parseInt(p.replace('#', ''), 16);
    return { name: 'custom', rgb: [n >> 16, (n >> 8) & 255, n & 255] };
  }
  const known = PAPERS.find((k) => k.key === p);
  if (known) return { name: known.name, rgb: known.rgb };
  if (cover.ground.plain) return { name: 'its own', rgb: cover.ground.rgb.map(Math.round) };
  return { name: 'Cream', rgb: PAPERS.find((k) => k.key === 'cream').rgb };
}

// one box [x, y, w, h], or a list of them, as a list (none: null)
function boxesOf(area) {
  if (!Array.isArray(area) || !area.length) return null;
  return typeof area[0] === 'number' ? [area] : area.filter((b) => Array.isArray(b) && b.length === 4);
}

// the foil by name (gold, silver, rose, copper, pink, holo), or one's own { ink, tint }
function foilOf(colour) {
  if (colour && typeof colour === 'object') {
    return { key: 'custom', name: colour.name ?? 'Custom', ink: colour.ink, tint: colour.tint ?? colour.ink.map((c) => c / 255), holo: !!colour.holo };
  }
  return FOILS.find((f) => f.key === colour) ?? FOILS[0];
}

// What turns to foil: { colour, on: 'details' | 'darks' | 'colour' | 'none', amount, pick, pickAt,
// border }, or just a colour's name, or false for none. The foil finish turns its details to foil
// unless told otherwise; the others have none unless asked.
function foilSpecOf(card) {
  const finish = card.finish ?? 'foil';
  const f = card.foil;
  const spec = f === false || f === 'none' ? { on: 'none' } : typeof f === 'string' ? { colour: f } : { ...(f || {}) };
  const on = spec.on === 'color' ? 'colour' : spec.on ?? (finish === 'foil' ? 'details' : 'none');
  return { ...spec, on, colour: foilOf(spec.colour ?? spec.color), amount: spec.amount ?? AMOUNT[on] ?? 0.12 };
}

// points the light catches now and then: on the foil if there's any, or on the brightest paint
function sparklePoints(fx, cover, count = 14) {
  const { w, h, lum } = cover;
  const g = fx.getContext('2d', { willReadFrequently: true });
  const data = g.getImageData(0, 0, w, h).data;
  const step = Math.max(6, Math.round(Math.min(w, h) / 48));
  const foil = [];
  const bright = [];
  for (let y = step; y < h - step; y += step) {
    for (let x = step; x < w - step; x += step) {
      const i = y * w + x;
      if (data[i * 4] > 150) foil.push([x, y]);
      else if (lum[i] > 0.9) bright.push([x, y]);
    }
  }
  const pool = foil.length >= 6 ? foil : [...foil, ...bright];
  const rand = seeded(pool.length + 7);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const apart = Math.min(w, h) * 0.1;
  const out = [];
  for (const p of pool) {
    if (out.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) > apart)) out.push(p);
    if (out.length >= count) break;
  }
  return out;
}

// The card's life: what it's given as `live` (in the card's pixels), and the simple effects,
// which need no places picked: snow, hearts, fireflies, shooting stars, sparkle.
function liveOf(card, cover, fx) {
  const live = card.live ? JSON.parse(JSON.stringify(card.live)) : {};
  const fxs = card.effects || {};
  const W = cover.w;
  const H = cover.h;
  const opts = (v) => (v && typeof v === 'object' ? v : {});
  if (fxs.snow && !live.snow) {
    live.snow = { area: [0, -0.03 * H, W, 1.03 * H], count: 26, size: [0.5, 0.95], fall: [22, 46], lift: [0.012, 0.04], ...opts(fxs.snow) };
  }
  if (fxs.hearts && !live.floatingHearts) {
    live.floatingHearts = { area: [0.15 * W, 0.5 * H, 0.7 * W, 0.4 * H], every: [1.3, 2.8], ...opts(fxs.hearts) };
  }
  if (fxs.fireflies && !live.fireflies) {
    live.fireflies = { area: [0.06 * W, 0.4 * H, 0.88 * W, 0.55 * H], count: 12, color: [1, 0.8, 0.38], size: 0.04, ...opts(fxs.fireflies) };
    if (live.fireflies.colour) live.fireflies.color = live.fireflies.colour;
  }
  if (fxs.shootingStars && !live.shooting) {
    live.shooting = { area: [0.1 * W, 0.05 * H, 0.8 * W, 0.3 * H], every: [6, 12], ...opts(fxs.shootingStars) };
  }
  if (fxs.sparkle && !live.twinkles) {
    live.twinkles = { at: sparklePoints(fx, cover, opts(fxs.sparkle).count ?? 14), every: [1.5, 5], size: 0.045, ...opts(fxs.sparkle) };
  }
  return Object.keys(live).length ? live : null;
}

// a card's settings, made into what the stage deals: its front and masks, its stock, its letter
export function defOf(card, i, image) {
  const cover = coverOf(image, card.shape ?? 'portrait');
  const finish = ['foil', 'paint', 'print'].includes(card.finish) ? card.finish : 'foil';
  const paper = paperOf(card.paper, cover);
  const foil = foilSpecOf(card);
  const pick = foil.pick ?? (foil.pickAt ? pickAt(cover, foil.pickAt[0] / (cover.w - 1), foil.pickAt[1] / (cover.h - 1)) : null);
  const mode = foil.on === 'none' ? 'colour' : foil.on;
  const mask = foil.on === 'none' && !foil.border ? null : maskOf(cover, { mode, amount: foil.amount, pick: foil.on === 'none' ? null : pick, border: !!foil.border, area: boxesOf(foil.area) });
  let print;
  let fx;
  if (finish === 'paint') {
    // the painting's own colours, its gold included; the paint is what catches the light. A foil
    // border is the one thing stamped in the foil's ink.
    print = mask?.rim ? rimmed(cover, mask.rim, foil.colour.ink) : cover.canvas;
    fx = paintFxOf(cover, mask?.foil ?? null);
  } else {
    const art = artOf(cover, mask ?? { foil: new Float32Array(cover.w * cover.h), rim: null, designed: null }, foil.colour, paper.rgb);
    print = art.print;
    fx = art.fx;
  }
  const live = liveOf(card, cover, fx);
  const lift = live ? liftOf(cover, live) : null;
  return {
    slug: `card-${i + 1}`,
    name: card.name ?? `Card ${i + 1}`,
    finish: finish === 'paint' ? 'Paint' : finish === 'print' ? `Printed on ${paper.name.toLowerCase()} paper` : `${foil.colour.name} foil`,
    w: cover.w,
    h: cover.h,
    // a painting's gold throws back its own colour; foil, the foil's
    tint: finish === 'paint' ? 'print' : foil.colour.tint,
    paper: paper.rgb,
    letter: card.message ?? '',
    insert: { size: [0.9, 0.93], messageAt: card.messageAt ?? 0.5 },
    motifs: card.inside,
    back: card.back ?? (card.name ? [card.name] : []),
    signature: card.signature ? { lines: card.signature.slice(0, 2), ink: foil.colour.ink, holo: !!foil.colour.holo, href: card.link } : undefined,
    tooth: 1,
    paint: finish === 'paint' || undefined,
    relief: finish === 'paint' ? card.relief ?? 3 : undefined,
    edge: live ? 0.1 : undefined,
    live,
    src: { front: print, fx, lift },
    // for the page itself
    page: { alt: card.alt ?? '', message: card.message ?? '' },
  };
}

// the picture with the foil's fine rule round its edge, in the foil's ink
function rimmed(cover, rim, ink) {
  const { w, h, px } = cover;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  for (let i = 0; i < rim.length; i++) {
    const k = i * 4;
    for (let ch = 0; ch < 3; ch++) img.data[k + ch] = px[k + ch] + (ink[ch] - px[k + ch]) * rim[i];
    img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// a small picture of a front, for the dock
function thumbOf(canvas) {
  const k = 112 / Math.max(canvas.width, canvas.height);
  const c = document.createElement('canvas');
  c.width = Math.round(canvas.width * k);
  c.height = Math.round(canvas.height * k);
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

export async function mount(root, data) {
  const cards = data.cards || [];
  const page = data.page || {};
  const record = new URLSearchParams(location.search).has('record');
  if (record) root.dataset.record = '';
  const $ = (s) => root.querySelector(s);
  const canvas = $('.gc-canvas');
  const sr = $('.gc-sr');
  const hint = $('.gc-hint');
  const openBtn = $('[data-act="open"]');
  const turnBtn = $('[data-act="turn"]');
  const rail = $('.gc-rail');

  if (page.heading || page.subheading) {
    $('.gc-head').hidden = false;
    $('.gc-heading').textContent = page.heading ?? '';
    $('.gc-sub').textContent = page.subheading ?? '';
  }

  // without WebGL (or if anything goes wrong), the card still arrives: its picture and its letter
  let failed = false;
  const fail = () => {
    if (failed) return;
    failed = true;
    root.dataset.failed = '';
    const card = cards[0] || {};
    const fall = $('.gc-fallback');
    fall.hidden = false;
    fall.querySelector('img').src = card.image || '';
    fall.querySelector('img').alt = card.alt || '';
    fall.querySelector('.gc-letter').textContent = card.message || '';
  };

  let defs;
  try {
    const images = await Promise.all(cards.map((c) => imageOf(c.image)));
    try {
      await document.fonts.load(`500 48px ${HAND}`);
    } catch {
      // the letter still draws, in whatever hand the device has
    }
    defs = cards.map((c, i) => defOf(c, i, images[i]));
  } catch (err) {
    console.error(err);
    fail();
    return null;
  }

  const state = { index: 0, open: false, side: 'front', touched: false };
  const describe = () => {
    const def = defs[state.index];
    if (!def) return;
    sr.textContent = state.open
      ? `${def.name}, open. Inside: ${def.page.message}`
      : state.side === 'back'
        ? `${def.name}, turned over to its back.`
        : `${def.name}. ${def.page.alt}`;
  };
  const touch = () => {
    if (state.touched) return;
    state.touched = true;
    hint.dataset.gone = '';
  };

  if (defs.length > 1) {
    rail.hidden = false;
    $('.gc-divider').hidden = false;
    defs.forEach((def, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gc-thumb';
      b.setAttribute('aria-label', def.name);
      const img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      img.src = thumbOf(def.src.front);
      b.append(img);
      b.addEventListener('click', () => stage.goTo(i));
      rail.append(b);
    });
  }

  const stage = createStage(canvas, {
    cards: defs,
    fonts: { hand: HAND },
    record,
    autoplay: !!page.autoplay,
    lift: 0.05,
    spin: page.turnOver !== false,
    holdFront: page.holdFront ?? 6.5,
    holdOpen: page.holdOpen ?? 6,
    getPaused: () => false,
    onIndex: (i) => {
      state.index = i;
      state.open = false;
      rail.querySelectorAll('.gc-thumb').forEach((b, k) => {
        b.toggleAttribute('data-active', k === i);
        b.setAttribute('aria-current', k === i ? 'true' : 'false');
      });
      describe();
    },
    onOpen: (open) => {
      state.open = open;
      openBtn.setAttribute('aria-pressed', String(open));
      openBtn.toggleAttribute('data-on', open);
      if (open) touch();
      describe();
    },
    onSide: (side) => {
      state.side = side;
      turnBtn.toggleAttribute('data-on', side === 'back');
      touch();
      describe();
    },
    onReady: () => {
      root.dataset.ready = '';
      if (page.hint === false) hint.dataset.gone = '';
      describe();
    },
    onProgress: () => {},
    onFail: fail,
  });

  openBtn.addEventListener('click', () => stage.toggleOpen());
  if (page.turnOver === false) turnBtn.hidden = true;
  turnBtn.addEventListener('click', () => {
    stage.setOpen(false);
    stage.turnTo(state.side === 'back' ? 'front' : 'back');
  });
  canvas.addEventListener('pointerdown', touch, { once: true });
  window.addEventListener('keydown', (e) => {
    if (e.target.closest?.('button, a, input, textarea') && (e.key === ' ' || e.key === 'Enter')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight') stage.go(1);
    else if (e.key === 'ArrowLeft') stage.go(-1);
    else if (e.key === 'o' || e.key === 'O' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      stage.toggleOpen();
    } else if ((e.key === 't' || e.key === 'T') && page.turnOver !== false) {
      stage.turnTo(state.side === 'back' ? 'front' : 'back');
    }
  });
  return stage;
}
