#!/usr/bin/env node
// Optional: screenshots a card page in a headless browser, to check it before handing it over.
// Renders the card's front, its front again with the light held over its upper half (as a
// pointer would hold it, so the foil or paint is seen catching it), its inside (with the letter)
// and its back, frame by frame, so the pictures come out the same every time.
//
//     node snapshot.mjs card.html [out-dir] [--size 1200x900] [--card 1] [--live]
//
// With --live, for a card that comes alive, it also writes:
//   <name>-live-motion.png  the card held still, with everything that moves on its own in magenta
//                           (on the faded card): check each moving part moves, and nothing else.
//                           Snow, fireflies and the like are held still for the check.
//   <name>-live-taps.png    one panel per light and per tap spot: what changes when it's tapped,
//                           in magenta, with the spot ringed. A tap that shows no magenta does
//                           nothing; magenta in the wrong place means a patch is misplaced.
//
// Needs Node and Playwright with a Chromium (npm i playwright && npx playwright install chromium).
// Without a GPU it renders in software, which is slow but fine.

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const USAGE = 'usage: node snapshot.mjs card.html [out-dir] [--size 1200x900] [--card 1] [--live]';
const positional = [];
const opts = { size: '1200x900', card: '1', live: false };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--live') opts.live = true;
  else if (a === '--size' || a === '--card') opts[a.slice(2)] = process.argv[++i];
  else if (a.startsWith('--')) {
    console.error(`unknown option ${a}\n${USAGE}`);
    process.exit(2);
  } else positional.push(a);
}
const [file, out = '.'] = positional;
if (!file) {
  console.error(USAGE);
  process.exit(2);
}
const outDir = resolve(out);
const [width, height] = opts.size.split('x').map(Number);
const cardIndex = Number(opts.card) - 1;

// found the way require() finds it, so a Playwright installed globally (NODE_PATH) works too
let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.error('snapshot.mjs needs Playwright: npm i playwright && npx playwright install chromium');
  process.exit(3);
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width, height } });
page.setDefaultTimeout(600000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${pathToFileURL(resolve(file)).href}?record`);
await page.waitForFunction(() => window.__cards?.ready || document.querySelector('.gc[data-failed]'), null, { timeout: 120000 });
mkdirSync(outDir, { recursive: true });
if (await page.$('.gc[data-failed]')) {
  console.error('the card could not start WebGL; the page shows its picture and letter flat instead');
  await page.screenshot({ path: `${outDir}/fallback.png` });
  await browser.close();
  process.exit(1);
}

const name = basename(file).replace(/\.html?$/, '');
const step = (secs) =>
  page.evaluate((s) => {
    for (let i = 0; i < Math.round(s * 15); i++) window.__cards.frame(1 / 15);
  }, secs);
const save = (label, dataUrl) => {
  const path = `${outDir}/${name}-${label}.png`;
  writeFileSync(path, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote', path);
};
const shot = async (label) => save(label, await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png')));

if (cardIndex > 0) {
  await page.evaluate((i) => window.__cards.goTo(i), cardIndex);
}
await step(3);
await shot('front');
// the lamp follows the pointer: hold it over the upper half of the card, a little left of middle
await page.evaluate(() => window.__cards.setPointer(-0.12, 0.28));
await step(1.4);
await shot('front-lit');
await page.evaluate(() => window.__cards.setPointer(null));
await step(0.8);
await page.evaluate(() => window.__cards.setOpen(true));
await step(2.6);
await shot('inside');
await page.evaluate(() => window.__cards.setOpen(false));
await step(1.6);
await page.evaluate(() => window.__cards.turnTo('back'));
await step(2.2);
await shot('back');
if (opts.live) await checkLife();
if (errors.length) console.error('page errors:\n' + errors.join('\n'));
await browser.close();
process.exit(errors.length ? 1 : 0);

// --- what lives on the card ---------------------------------------------------------------------

// Runs last, in a smaller window (software rendering is slow, and this takes many frames): the
// card shut, face up and held still, so only what lives on it moves.
async function checkLife() {
  const spec = await page.evaluate((i) => {
    const data = JSON.parse(document.getElementById('card-data').textContent);
    const card = data.cards[Math.min(i, data.cards.length - 1)];
    return { live: card.live ?? {}, effects: card.effects ?? {} };
  }, cardIndex);
  const glows = spec.live.glows ?? [];
  const taps = spec.live.taps ?? [];
  const events = [
    ...glows.map((g, k) => ({
      label: `light ${k + 1} at [${g.at}]${g.kind ? ` (${g.kind})` : ''}`,
      at: g.tap ? g.tap.slice(0, 2) : g.at,
      glow: k,
    })),
    ...taps.map((z, k) => {
      const does = [z.kick?.length ? `kicks ${z.kick.join(', ')}` : '', ...['hearts', 'snow', 'twinkle', 'sparkle'].filter((w) => z[w])];
      return { label: `tap ${k + 1} at [${z.area.slice(0, 2)}]: ${does.filter(Boolean).join(', ') || 'does nothing'}`, at: z.area.slice(0, 2) };
    }),
  ];
  if (!Object.keys(spec.live).length && !Object.keys(spec.effects).length) {
    console.log('--live: this card has no "live" or "effects", so nothing moves on it');
  }

  await page.setViewportSize({ width: 960, height: 720 });
  await page.evaluate(() => {
    window.__cards.setOpen(false);
    window.__cards.turnTo('front');
    window.__cards.hold(true);
  });
  await step(2.6);

  // Everything below runs in the page: the card's part of each frame is read straight off WebGL
  // and compared there.
  await page.evaluate(() => {
    const src = document.querySelector('canvas');
    const gl = src.getContext('webgl2') || src.getContext('webgl');
    const H = gl.drawingBufferHeight;
    // the card's box on the canvas, from where its corners are
    const { w: cw, h: ch } = window.__cards.size();
    const pts = [[0, 0], [cw, 0], [0, ch], [cw, ch]].map(([x, y]) => window.__cards.toScreen(x, y));
    const pad = 8;
    const x0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[0])) - pad));
    const y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1])) - pad));
    const w = Math.min(gl.drawingBufferWidth, Math.ceil(Math.max(...pts.map((p) => p[0])) + pad)) - x0;
    const h = Math.min(H, Math.ceil(Math.max(...pts.map((p) => p[1])) + pad)) - y0;
    const raw = new Uint8Array(w * h * 4);
    const grab = () => {
      gl.readPixels(x0, H - y0 - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
      const out = new Uint8ClampedArray(w * h * 4); // rows come bottom up
      for (let y = 0; y < h; y++) out.set(raw.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      return out;
    };
    const run = (secs) => {
      for (let i = 0; i < Math.round(secs * 15); i++) window.__cards.frame(1 / 15);
    };
    // the most each pixel changes from `base` over `secs`, looked at every `every` seconds, and
    // in how many of those looks it had changed (to leave out a single flicker)
    const motion = (base, secs, every) => {
      const most = new Float32Array(w * h);
      const seen = new Uint8Array(w * h);
      for (let t = 0; t < secs - 1e-6; t += every) {
        run(every);
        const d = grab();
        for (let i = 0; i < w * h; i++) {
          const k = i * 4;
          const v = Math.abs(d[k] - base[k]) + Math.abs(d[k + 1] - base[k + 1]) + Math.abs(d[k + 2] - base[k + 2]);
          if (v > most[i]) most[i] = v;
          if (v > 16) seen[i]++;
        }
      }
      most.seen = seen;
      return most;
    };
    // `base` faded, with `amount` (0 to 1 a pixel) in magenta, and rings round the spots given
    const paint = (base, amount, rings = []) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      const img = g.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        const k = i * 4;
        const m = amount[i];
        img.data[k] = (base[k] * 0.32 + 255 * 0.68) * (1 - m) + 214 * m;
        img.data[k + 1] = (base[k + 1] * 0.32 + 255 * 0.68) * (1 - m);
        img.data[k + 2] = (base[k + 2] * 0.32 + 255 * 0.68) * (1 - m) + 120 * m;
        img.data[k + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      g.lineWidth = 2;
      g.strokeStyle = 'rgb(40, 60, 210)';
      for (const [x, y] of rings) {
        const [sx, sy] = window.__cards.toScreen(x, y);
        g.beginPath();
        g.arc(sx - x0, sy - y0, 8, 0, Math.PI * 2);
        g.stroke();
      }
      return c;
    };
    const ramp = (v, lo, hi) => Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
    window.__check = { grab, run, motion, paint, ramp };
  });

  // what moves on the card by itself over a few seconds
  const motionUrl = await page.evaluate(() => {
    const { grab, motion, paint, ramp } = window.__check;
    const base = grab();
    const idle = motion(base, 2.4, 0.2);
    window.__check.idle = idle;
    const amount = idle.map((v) => ramp(v, 14, 60));
    return paint(base, amount).toDataURL('image/png');
  });
  save('live-motion', motionUrl);

  // each light and tap spot in turn: what changes when it's tapped, beyond what moves anyway
  const panels = [];
  for (const ev of events) {
    const url = await page.evaluate((e) => {
      const { grab, run, motion, paint, ramp, idle } = window.__check;
      run(1.2); // whatever the last one set going settles
      const base = grab();
      if (e.glow != null) window.__cards.poke(e.glow);
      else window.__cards.tap(e.at[0], e.at[1]);
      const most = motion(base, 1.2, 0.2);
      const amount = most.map((v, i) => (most.seen[i] >= 2 ? ramp(v - idle[i], 16, 64) : 0));
      return paint(base, amount, [e.at]).toDataURL('image/png');
    }, ev);
    panels.push({ label: ev.label, url });
    process.stdout.write('.');
  }
  if (panels.length) process.stdout.write('\n');
  await page.evaluate(() => window.__cards.hold(false));
  if (!panels.length) return;
  // the panels side by side, labelled, three to a row
  const sheet = await page.evaluate(async (list) => {
    const imgs = await Promise.all(
      list.map(
        (p) =>
          new Promise((done) => {
            const im = new Image();
            im.onload = () => done(im);
            im.src = p.url;
          }),
      ),
    );
    const cols = Math.min(3, imgs.length);
    const pw = Math.max(...imgs.map((im) => im.width));
    const ph = Math.max(...imgs.map((im) => im.height));
    const head = 26;
    const rows = Math.ceil(imgs.length / cols);
    const c = document.createElement('canvas');
    c.width = cols * pw + (cols - 1) * 14;
    c.height = rows * (ph + head) + (rows - 1) * 14;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#000';
    g.font = '13px sans-serif';
    imgs.forEach((im, i) => {
      const x = (i % cols) * (pw + 14);
      const y = Math.floor(i / cols) * (ph + head + 14);
      g.fillText(list[i].label.slice(0, 56), x + 3, y + 17);
      g.drawImage(im, x, y + head);
    });
    return c.toDataURL('image/png');
  }, panels);
  save('live-taps', sheet);
}
