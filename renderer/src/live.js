// The life in a painted card's front. It plays like a paper-craft painting come alive: the lights
// painted on it glow and flicker, and now and then blaze up and throw rays across the picture; its
// creatures and things move (a tail swishes, an ear twitches, a scarf flutters, a branch sways);
// pieces of it stand off the paper on their own little shadows; and snow, smoke, leaves and hearts
// drift over it, each casting its shadow on the paint below. It answers whoever's looking: moving
// the pointer over it is a breeze through it, and tapping its lights, creatures and things sets them
// going.
//
// def.live describes it, everything in the card's print pixels (y down), angles in degrees:
//
//   glows: the lights painted on it, at most 4
//     at, r, reach  where the light is, the size of its bright core, how far its light carries
//     color         its light, as 0..1 RGB
//     kind          'flame' flickers, 'breathe' swells and settles slowly, 'steady' holds
//     level         how bright it burns, as a rule (1)
//     rake          how hard it lights the strokes round it from the side
//     halo          the soft glow round its core
//     emit          how bright what's painted as giving its light (the lift mask's G) comes up
//     twinkle       how much that painted light flickers from place to place (lit windows)
//     wash          how much it warms the whole picture, as a rule; a flare warms it more
//     rays, raysIdle, rayLight  how many rays it throws, how much of them shows as a rule, and how
//                   much more when it flares
//     flare         { every, size }: it blazes up on its own every so often, the way a low sun
//                   does through cloud; without it, it only does when it's tapped
//     glint         { size, points, rest }: a star of light on its core, its size a share of the
//                   card's height, with its points, as bright as rest as a rule and more as it flares
//     tap           [x, y, r]: tapping there makes it flare, and throws sparks (embers: they rise)
//     kick          the moving parts a tap on it also sets going (the star it's painted on)
//
//   movers: its moving parts, by name, at most 16. Each moves the paint in a soft patch about a
//     pivot, wholly in the patch's middle and less toward its edge:
//     pivot         [x, y]
//     area          its patch, an oval: [x, y, rx, ry]; or tip and width, a capsule from the pivot
//                   to its tip (a tail, an arm, an ear), width its radius; soft is the share of the
//                   patch that eases out
//     cut           true: a cut-out, which moves whole, by its outline in the lift mask's red, and
//                   leaves the paint behind it to slide into the gap (a wreath, the moon, a cloud)
//     sway          [deg, hz]: it sways about its pivot, now and always
//     drift         [px, hz]: it drifts to and fro
//     twitch        [deg, min, max]: it flicks, twice quickly, every so often (seconds apart)
//     blink         [min, max]: it shuts (squashes flat) for a moment, every so often
//     breathe       [share, hz]: it swells and settles, upward from its pivot
//     flutter       [px, hz, heading]: a ripple runs out along it from its pivot (cloth, ribbon)
//     flicker       share: it stretches and leans like a flame
//     react         what a kick does: 'spring' (it swings, deg says how far), 'twitch', 'blink',
//                   'wave' (an arm waving), 'jiggle' (a squash and stretch), 'flutter', 'sigh'
//     kick          how far a kick swings it, deg (a 'spring'), or how hard (a 'jiggle'); a
//                   breeze leans it about as far
//     wind          how much a breeze from the pointer moves it
//
//   taps: what a tap on a part of it does: { area: [x, y, rx, ry], kick: [mover names],
//     hearts: [x, y] (hearts float up from there), snow: [[x, y]] (snow falls off there),
//     sparkle: [[x, y]] (a burst of sparkles from each), twinkle: [[x, y]] (each glints),
//     flurry: true (the snow behind the glass comes down thick for a while), leaf: true (a leaf
//     comes loose) }
//   notice: what the pointer coming near does: { area, kick, every } (an ear turns to it)
//   greet: the moving parts that say hello as the card lands (the snowman waves), which shows
//     they can be played with
//
//   lifted: pieces of the print that stand where they are, off the paper: { box: [x, y, w, h],
//     lift, bob, twinkle, ride }. lift is how far off, as a share of the card's height; a piece that
//     twinkles (a star) comes up bright now and then, with a glint on it; one that rides a mover
//     moves with it (the star on a tree that sways), so the paint under it never shows.
//   snow: the cottage's snow dots, falling over it: { area: [x, y, w, h], count, size, fall, lift }
//   smoke: puffs off a chimney: { from: [x, y], box (the puff on the print), every, life, drift,
//     curl, size, lift, max }
//   leaves: a leaf off the print, falling from the branches now and then: { box, from: [[x, y]],
//     every: [min, max], fall, to, size, max }
//   fireflies: { area, count, color, size }; they keep away from the pointer
//   floatingHearts: { area: [x, y, w, h], every: [min, max] }: now and then a few hearts rise off
//     somewhere in the area and float away, the way they float off a paper-craft painting
//   twinkles: { at: [[x, y]], every: [min, max], size }: points (on the foil, say) that catch the
//     light now and then, with a star of light
//   shooting: { area: [x, y, w, h], every: [min, max] }: a star shoots across there now and then
//   snowfall: snow falling behind the glass (the lift mask's B), which the face draws itself; the
//     breeze blows it about
//
// The stage gives step() typed arrays to write the pieces and glints into, and the uniforms of the
// lights and the movers; and tells it where the pointer is on the card, and how fast it's moving.

import { HEARTS } from './hearts.js';

const TAU = Math.PI * 2;
const STRIP = 6; // snowflakes along the snow strip
const SPARKS = 24;
const BURST = 18; // snowflakes kept for what a shaken branch drops
const LOVE = 20; // hearts kept for petting

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const clamp01 = (x) => clamp(x, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const rad = (d) => (d * Math.PI) / 180;
const inOval = (x, y, [cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1;

// a steady stream of chance for each card, so it plays the same way each time it's shown
function seeded(text) {
  let a = 0x9e3779b9;
  for (const ch of text) a = Math.imul(a ^ ch.charCodeAt(0), 0x85ebca6b);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// how far through a flare it is: up quickly, a moment at its height, and a long fall
function flareAt(age) {
  if (age < 0) return 0;
  if (age < 0.45) return easeOut(age / 0.45);
  if (age < 0.95) return 1;
  return Math.max(0, 1 - easeInOut((age - 0.95) / 1.75));
}

// the shapes of a twitch (out and back twice, the second smaller), a blink, and a wave
function twitchAt(a) {
  if (a < 0 || a > 0.4) return 0;
  if (a < 0.16) return Math.sin((Math.PI * a) / 0.16);
  return a > 0.24 ? 0.55 * Math.sin((Math.PI * (a - 0.24)) / 0.16) : 0;
}
const blinkAt = (a) => (a < 0 || a > 0.2 ? 0 : Math.sin((Math.PI * a) / 0.2));
const WAVE = 1.8;
const waveAt = (a) => (a < 0 || a > WAVE ? 0 : Math.sin(TAU * 2.2 * a) * Math.sin((Math.PI * a) / WAVE));
const SIGH = 4.5;
const sighAt = (a) => (a < 0 || a > SIGH ? 0 : Math.sin((Math.PI * a) / SIGH));

function put(arr, i, a, b, c, d) {
  arr[i * 4] = a;
  arr[i * 4 + 1] = b;
  arr[i * 4 + 2] = c;
  arr[i * 4 + 3] = d;
}

export function createLife(def, { reduced = false } = {}) {
  const W = def.w;
  const H = def.h;
  const spec = def.live;
  const rand = seeded(def.slug);
  const pick = (a, b) => lerp(a, b, rand());
  const pace = reduced ? 0.55 : 1; // calmer, for someone who'd rather things moved less
  const calm = reduced ? 0.5 : 1;
  const u = (x) => x / W;
  const v = (y) => 1 - y / H;
  const home = ([x, y, w, h]) => [x / W, 1 - (y + h) / H, w / W, h / H];
  // the movers are in the card's height as the unit, y up
  const hx = (x) => x / H;
  const hy = (y) => 1 - y / H;

  let now = 0;

  // --- the lights ------------------------------------------------------------------------------

  const glows = (spec.glows || []).map((g) => ({
    ...g,
    phase: rand() * TAU,
    turn: rand() * TAU,
    since: -10, // when it last flared
    size: 0,
    next: g.flare ? 2.2 + rand() * g.flare.every * 0.6 : Infinity,
    hover: 0,
    env: 0,
  }));

  function burn(g, t) {
    if (g.kind === 'flame') {
      // a candle's flicker, and now and then a draught that bows it
      const flick = 0.06 * Math.sin(13.1 * t + g.phase) + 0.05 * Math.sin(7.7 * t + 2 * g.phase) + 0.04 * Math.sin(23.3 * t);
      const draught = Math.pow(Math.max(0, Math.sin(0.53 * t + g.phase)), 12);
      return (0.88 + flick) * (1 - 0.22 * draught);
    }
    if (g.kind === 'breathe') return 0.78 + 0.2 * Math.sin(0.8 * t + g.phase);
    return 1;
  }

  // --- the moving parts ------------------------------------------------------------------------

  const movers = Object.entries(spec.movers || {}).map(([name, m]) => {
    const react = m.react ?? 'spring';
    const [k, c] = react === 'jiggle' ? [170, 8] : [28, 3.2];
    // the middle of its patch, and how far that reaches, for the breeze
    const mid = m.tip ? [(m.pivot[0] + m.tip[0]) / 2, (m.pivot[1] + m.tip[1]) / 2] : [m.area[0], m.area[1]];
    const span = m.tip ? Math.hypot(m.tip[0] - m.pivot[0], m.tip[1] - m.pivot[1]) / 2 + m.width : Math.max(m.area[2], m.area[3]);
    return {
      name,
      ...m,
      react,
      k,
      c,
      phase: rand() * TAU,
      spring: { x: 0, v: 0 }, // set going by kicks and the breeze: a turn, or a squash
      sign: 1, // which way the next kick swings it
      twitchNext: m.twitch ? pick(m.twitch[1], m.twitch[2]) * 0.5 : Infinity,
      twitchSince: -10,
      twitchSign: 1,
      blinkNext: m.blink ? pick(...m.blink) : Infinity,
      blinkSince: -10,
      waveSince: -10,
      sighSince: -10,
      boost: 0, // a flutter, set going
      ripple: 0, // how far its ripple has run
      mid,
      span,
      // from its pivot to the middle of its patch, y up: how a breeze turns it
      arm: [hx(mid[0]) - hx(m.pivot[0]), hy(mid[1]) - hy(m.pivot[1])],
      patch: m.tip ? [hx(m.tip[0]), hy(m.tip[1]), m.width / H, -1] : [hx(m.area[0]), hy(m.area[1]), m.area[2] / H, m.area[3] / H],
      move: { angle: 0, sx: 1, sy: 1, dx: 0, dy: 0 }, // where it is this moment
    };
  });
  const byName = new Map(movers.map((m) => [m.name, m]));

  function kick(m) {
    if (m.react === 'twitch') {
      m.twitchSince = now;
      m.twitchSign = -m.twitchSign;
    } else if (m.react === 'blink') m.blinkSince = now;
    else if (m.react === 'wave') m.waveSince = now;
    else if (m.react === 'sigh') m.sighSince = now;
    else if (m.react === 'flutter') m.boost = 1;
    else {
      // each kick swings it the other way; however many come, it never swings much past its own
      const most = m.react === 'jiggle' ? (m.kick ?? 1) * 1.6 : rad(m.kick ?? 4) * Math.sqrt(m.k);
      m.spring.v = clamp(m.spring.v + (m.react === 'jiggle' ? most : m.sign * most), -1.5 * most, 1.5 * most);
      m.sign = -m.sign;
    }
  }

  const taps = spec.taps || [];
  let greetAt = Infinity;
  const notice = (spec.notice || []).map((n) => ({ ...n, last: -10, inside: false }));

  // --- the pieces ------------------------------------------------------------------------------

  // the print's pieces: those that stand where they are, then the smoke, then the leaves
  const lifted = (spec.lifted || []).map((p) => ({
    ...p,
    home: home(p.box),
    at: [u(p.box[0] + p.box[2] / 2), v(p.box[1] + p.box[3] / 2)],
    phase: rand() * TAU,
    next: p.twinkle ? pick(0.5, 4) : Infinity,
    since: -10,
    env: 0,
  }));
  const smoke = spec.smoke && {
    ...spec.smoke,
    home: home(spec.smoke.box),
    puffs: Array.from({ length: spec.smoke.max }, () => ({ born: -100, phase: 0, wx: 0 })),
    last: -100,
  };
  const leaves = spec.leaves && {
    ...spec.leaves,
    home: home(spec.leaves.box),
    falling: Array.from({ length: spec.leaves.max }, () => ({ born: -100, on: false })),
    next: pick(...spec.leaves.every) * 0.5,
  };
  const printCount = lifted.length + (smoke ? smoke.max : 0) + (leaves ? leaves.max : 0);

  // the snow strip's flakes; each one nearer the eye (d) is bigger, higher and quicker; and some
  // kept back for what a shaken branch drops
  const snow = spec.snow && {
    ...spec.snow,
    flakes: Array.from({ length: spec.snow.count }, () => ({})),
    dropped: Array.from({ length: BURST }, () => ({ born: -100, life: 0 })),
    next: 0,
  };
  function flake(f, anywhere) {
    const { area, size, fall, lift } = snow;
    const d = rand();
    Object.assign(f, {
      x: area[0] + rand() * area[2],
      y: anywhere ? area[1] + rand() * area[3] : area[1] - rand() * 30,
      cell: Math.floor(rand() * STRIP),
      scale: lerp(size[0], size[1], d),
      lift: lerp(lift[0], lift[1], d),
      speed: lerp(fall[0], fall[1], d) * pick(0.85, 1.15),
      sway: pick(6, 18),
      swayRate: pick(0.5, 1.2),
      phase: rand() * TAU,
      // turned a little, never mirrored: each dot's light is painted on from the upper left
      turn: pick(-0.3, 0.3),
    });
  }
  if (snow) for (const f of snow.flakes) flake(f, true);
  function dropSnow(points) {
    if (!snow) return;
    for (const [x, y] of points) {
      for (let k = 0; k < 3; k++) {
        const f = snow.dropped[snow.next];
        snow.next = (snow.next + 1) % BURST;
        Object.assign(f, {
          born: now + rand() * 0.25,
          x: x + pick(-14, 14),
          y: y + pick(-6, 6),
          vx: pick(-25, 25),
          vy: pick(10, 50),
          cell: Math.floor(rand() * STRIP),
          scale: pick(0.4, 0.75),
          life: pick(1.3, 2),
          turn: pick(-0.3, 0.3),
        });
      }
    }
  }

  // hearts, floating up off whatever's petted, like the hearts that float up off the paper in a
  // paper-craft painting
  const love = Array.from({ length: LOVE }, () => ({ born: -100, life: 0, wx: 0 }));
  let nextLove = 0;
  const lovable = taps.some((z) => z.hearts) || !!spec.floatingHearts;
  const floating = spec.floatingHearts && { ...spec.floatingHearts, next: pick(0.6, 1.6) };
  function hearts([x, y], count = 5) {
    for (let k = 0; k < count; k++) {
      const h = love[nextLove];
      nextLove = (nextLove + 1) % LOVE;
      Object.assign(h, {
        born: now + k * 0.12 + rand() * 0.08,
        x: x + pick(-28, 28),
        y: y + pick(-8, 12),
        rise: pick(55, 90),
        drift: pick(-14, 14),
        sway: pick(6, 14),
        phase: rand() * TAU,
        cell: Math.floor(rand() * HEARTS),
        scale: pick(0.55, 0.85),
        life: pick(2.4, 3.4),
        wx: 0,
      });
    }
  }

  // --- the glints ------------------------------------------------------------------------------

  const flies = spec.fireflies && {
    ...spec.fireflies,
    bugs: Array.from({ length: spec.fireflies.count }, () => ({
      x: spec.fireflies.area[0] + rand() * spec.fireflies.area[2],
      y: spec.fireflies.area[1] + rand() * spec.fireflies.area[3],
      phase: rand() * TAU,
      period: pick(2.2, 4.2),
      wander: pick(0.6, 1.4),
    })),
  };
  const sparks = Array.from({ length: SPARKS }, () => ({ born: -100, life: 0 }));
  let nextSpark = 0;
  function spark(x, y, { vx = 0, vy = 0, life = 1, size = 0.024, color = [1, 0.9, 0.6], rise = false, points = 0.8 }) {
    const s = sparks[nextSpark];
    nextSpark = (nextSpark + 1) % SPARKS;
    Object.assign(s, { born: now, x, y, vx, vy, life, size, color, rise, points, phase: rand() * TAU });
    return s;
  }
  function throwSparks(g) {
    const embers = g.kind === 'flame';
    for (let k = 0; k < (embers ? 10 : 14); k++) {
      const a = embers ? -Math.PI / 2 + pick(-0.9, 0.9) : rand() * TAU;
      const speed = embers ? pick(40, 110) : pick(120, 300);
      const s = spark(g.at[0] + Math.cos(a) * g.r * 0.4, g.at[1] + Math.sin(a) * g.r * 0.4, {
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: pick(0.8, 1.5),
        size: pick(0.016, 0.03),
        color: g.color,
        rise: embers,
        points: embers ? 0.2 : 0.8,
      });
      s.born += rand() * (embers ? 0.5 : 0.12);
    }
  }
  const shooting = spec.shooting && { ...spec.shooting, next: pick(...spec.shooting.every) * 0.6, star: null };
  const shining = glows.filter((g) => g.glint);
  const twinkling = lifted.filter((p) => p.twinkle);
  const glimmers = (spec.twinkles?.at || []).map(([x, y]) => ({
    x,
    y,
    since: -10,
    next: pick(0.3, spec.twinkles.every?.[1] ?? 5),
    turn: rand() * TAU,
  }));
  const glintCount =
    shining.length + twinkling.length + glimmers.length + (flies ? flies.bugs.length : 0) + SPARKS + (shooting ? 1 : 0);

  // the snow behind the glass: how thick it falls, how far it's drifted and fallen, a flurry
  const fall = { drift: 0, down: 0, flurry: 0 };

  // the breeze the pointer makes, in the card's pixels a second, quick to rise and slow to die away
  const gust = [0, 0];
  let pointer = null;

  // --- what's asked of it ----------------------------------------------------------------------

  const pokes = [];
  const lightAt = (x, y) => glows.findIndex((g) => g.tap && Math.hypot(x - g.tap[0], y - g.tap[1]) < g.tap[2]);
  const zoneAt = (x, y) => taps.find((z) => inOval(x, y, z.area));

  function step(dt, t, out, input = {}) {
    now = t;
    const real = dt;
    dt *= pace;
    // held still to be checked: what drifts over the card on its own (snow, fireflies, shooting
    // stars, hearts) stays put, so only the parts, the lights and what a tap sets off move
    const still = !!input.still;

    // the breeze, and the pointer coming near
    pointer = input.at || null;
    for (const k of [0, 1]) {
      const want = pointer ? clamp(input.vel?.[k] ?? 0, -2400, 2400) : 0;
      const quick = Math.abs(want) > Math.abs(gust[k]) ? 10 : 2.2;
      gust[k] += (want - gust[k]) * (1 - Math.exp(-real * quick));
    }
    if (t > greetAt) {
      greetAt = Infinity;
      for (const name of spec.greet || []) byName.get(name) && kick(byName.get(name));
    }
    for (const n of notice) {
      const inside = !!pointer && inOval(pointer[0], pointer[1], n.area);
      if (inside && !n.inside && t - n.last > (n.every ?? 1.5)) {
        n.last = t;
        for (const name of n.kick) byName.get(name) && kick(byName.get(name));
      }
      n.inside = inside;
    }

    // the lights
    const hovered = pointer ? lightAt(pointer[0], pointer[1]) : -1;
    glows.forEach((g, i) => {
      if (t > g.next) {
        g.since = t;
        g.size = g.flare.size;
        g.next = t + g.flare.every * pick(0.75, 1.3);
      }
      g.env = flareAt(t - g.since) * g.size;
      g.hover = lerp(g.hover, i === hovered ? 1 : 0, 1 - Math.exp(-dt * 6));
      g.turn += dt * (0.05 + 0.3 * g.env);
    });
    while (pokes.length) {
      const g = glows[pokes.shift()];
      g.since = t;
      g.size = Math.max(1.1, g.flare?.size ?? 1.1);
      if (g.flare) g.next = Math.max(g.next, t + g.flare.every * 0.8);
      throwSparks(g);
    }
    // A flare is mostly in the halo, the rays and the warmth it spreads: what it lights close by
    // brightens only a little, so a white cat by a lantern goes gold rather than blank.
    glows.forEach((g, i) => {
      const level = burn(g, t) * (g.level ?? 1) + 0.25 * g.hover;
      const env = g.env;
      out.glow.at[i].set(u(g.at[0]), v(g.at[1]), (g.r * (1 + 0.7 * env)) / H, g.reach / H);
      out.glow.col[i].set(g.color[0], g.color[1], g.color[2], g.rays || 0);
      out.glow.light[i].set(
        (g.rake ?? 1) * (level + 0.2 * env),
        (g.halo ?? 0.5) * (level + 0.9 * env),
        (g.emit ?? 1) * (level + 0.45 * env),
        g.twinkle ?? 0,
      );
      out.glow.warm[i].set((g.wash ?? 0) * (1 + 4 * env), g.rays ? (g.raysIdle ?? 0.12) + (g.rayLight ?? 0.9) * env : 0, g.turn, 0);
    });

    // the moving parts: their own motion, what's set them going, and the breeze where they are
    movers.forEach((m, i) => {
      const local = pointer ? Math.exp(-((Math.hypot(pointer[0] - m.mid[0], pointer[1] - m.mid[1]) / (m.span * 1.6)) ** 2)) : 0;
      const breeze = (m.wind ?? 0) * (0.2 + 0.8 * local);
      const wx = (gust[0] / H) * breeze;
      const wy = (-gust[1] / H) * breeze;
      const reach = Math.max(Math.hypot(m.arm[0], m.arm[1]), 0.03);
      // a push across the line from its pivot turns it, the way a gust turns a weathervane
      const push = (m.arm[0] * wy - m.arm[1] * wx) / reach;
      if (m.twitch && t > m.twitchNext) {
        m.twitchSince = t;
        m.twitchSign = rand() < 0.5 ? -1 : 1;
        m.twitchNext = t + pick(m.twitch[1], m.twitch[2]);
      }
      if (m.blink && t > m.blinkNext) {
        m.blinkSince = t;
        m.blinkNext = t + pick(...m.blink);
      }
      const s = m.spring;
      // a breeze leans it as far as a kick swings it, and no further
      const target = m.react === 'jiggle' ? 0 : clamp(push * 0.8, -1, 1) * rad(m.kick ?? 4);
      s.v += (-m.k * (s.x - target) - m.c * s.v) * real;
      s.x += s.v * real;
      m.boost *= Math.exp(-real * 0.9);

      const mv = m.move;
      mv.angle = 0;
      mv.sx = 1;
      mv.sy = 1;
      mv.dx = 0;
      mv.dy = 0;
      if (m.sway) {
        const w = TAU * m.sway[1] * t + m.phase;
        mv.angle += (rad(m.sway[0]) * calm * (Math.sin(w) + 0.35 * Math.sin(2.3 * w + m.phase))) / 1.35;
      }
      if (m.drift) mv.dx += (m.drift[0] / H) * calm * Math.sin(TAU * m.drift[1] * t + m.phase);
      if (m.twitch) mv.angle += rad(m.twitch[0]) * m.twitchSign * twitchAt(t - m.twitchSince);
      if (m.react === 'wave') mv.angle += rad(m.kick ?? 18) * waveAt(t - m.waveSince);
      if (m.react === 'jiggle') {
        mv.sy *= 1 - 0.1 * s.x;
        mv.sx *= 1 + 0.06 * s.x;
      } else {
        mv.angle += s.x;
      }
      if (m.breathe) {
        const deep = 1 + 1.8 * sighAt(t - m.sighSince);
        const b = m.breathe[0] * deep * Math.sin(TAU * m.breathe[1] * t + m.phase);
        mv.sy *= 1 + b;
        mv.sx *= 1 - b * 0.3;
      }
      if (m.blink) mv.sy *= 1 - 0.85 * blinkAt(t - m.blinkSince);
      if (m.flicker) {
        const f = m.flicker * (0.55 * Math.sin(17.3 * t + m.phase) + 0.3 * Math.sin(29.1 * t) + 0.15 * Math.sin(41.7 * t + 2 * m.phase));
        mv.sy *= 1 + f;
        mv.sx *= 1 - f * 0.4;
        mv.angle += rad(5) * Math.sin(7.9 * t + m.phase) * calm;
      }
      let ripple = 0;
      if (m.flutter) {
        const stir = clamp(Math.hypot(wx, wy) * 1.5, 0, 1.5);
        ripple = m.flutter[0] * calm * (1 + 1.6 * m.boost + stir);
        m.ripple = (m.ripple + real * TAU * m.flutter[1] * (1 + 0.8 * m.boost + 0.6 * stir)) % (TAU * 64);
      }
      out.move.a[i].set(hx(m.pivot[0]), hy(m.pivot[1]), mv.angle, m.cut ? 1 : 0);
      out.move.b[i].set(...m.patch);
      out.move.c[i].set(mv.sx, mv.sy, mv.dx, mv.dy);
      out.move.d[i].set(m.soft ?? 0.35, ripple / H, m.ripple, -rad(m.flutter?.[2] ?? 0));
    });

    // the print's pieces
    const printLayer = out.layers.print;
    let n = 0;
    for (const p of lifted) {
      if (t > p.next) {
        p.since = t;
        p.next = t + pick(2.5, 7);
      }
      const age = t - p.since;
      p.env = age < 1.2 ? Math.pow(Math.sin((Math.PI * age) / 1.2), 2) : 0;
      // one that rides a mover goes where it takes it: turned, stretched and shifted about its pivot
      let [au, av] = p.at;
      let turn = 0;
      let scale = 1;
      const m = p.ride && byName.get(p.ride);
      if (m) {
        const mv = m.move;
        const px = au * (W / H) - hx(m.pivot[0]);
        const py = av - hy(m.pivot[1]);
        const qx = px * mv.sx;
        const qy = py * mv.sy;
        const cs = Math.cos(mv.angle);
        const sn = Math.sin(mv.angle);
        au = (hx(m.pivot[0]) + qx * cs - qy * sn + mv.dx) * (H / W);
        av = hy(m.pivot[1]) + qx * sn + qy * cs + mv.dy;
        turn = mv.angle;
        scale = (mv.sx + mv.sy) / 2;
      }
      put(printLayer.home, n, ...p.home);
      put(printLayer.at, n, au, av, scale, turn);
      put(printLayer.look, n, (p.lift ?? 0.008) + (p.bob ?? 0.002) * Math.sin(0.9 * t + p.phase), 1, 0.7 * p.env, 1);
      n++;
    }
    if (smoke) {
      if (t - smoke.last > smoke.every) {
        const slot = smoke.puffs.reduce((a, b) => (a.born < b.born ? a : b));
        Object.assign(slot, { born: t, phase: rand() * TAU, kick: pick(0.8, 1.2), wx: 0 });
        smoke.last = t;
      }
      for (const puff of smoke.puffs) {
        const age = t - puff.born;
        const k = age / smoke.life;
        if (k < 0 || k > 1) {
          put(printLayer.look, n++, 0, 0, 0, 1);
          continue;
        }
        puff.wx += gust[0] * 0.14 * dt;
        const x = smoke.from[0] + smoke.drift[0] * age * puff.kick + smoke.curl * age * age + 5 * Math.sin(1.3 * age + puff.phase) + puff.wx;
        const y = smoke.from[1] + smoke.drift[1] * age;
        const opacity = smooth(0, 0.08, k) * (1 - smooth(0.5, 1, k)) * 0.95;
        put(printLayer.home, n, ...smoke.home);
        put(printLayer.at, n, u(x), v(y), lerp(smoke.size[0], smoke.size[1], easeOut(k)), 0.12 * Math.sin(0.8 * age + puff.phase));
        put(printLayer.look, n, lerp(smoke.lift[0], smoke.lift[1], k), opacity, 0, 1);
        n++;
      }
    }
    if (leaves) {
      if (t > leaves.next) {
        const slot = leaves.falling.find((l) => !l.on);
        if (slot) {
          const [x0, y0] = leaves.from[Math.floor(rand() * leaves.from.length)];
          Object.assign(slot, {
            on: true,
            born: t,
            x0,
            y0,
            wx: 0,
            phase: rand() * TAU,
            spin: pick(1.6, 2.6),
            sway: pick(24, 46),
            drift: pick(-10, 14),
            scale: pick(...leaves.size),
          });
        }
        leaves.next = t + pick(...leaves.every);
      }
      for (const l of leaves.falling) {
        const age = t - l.born;
        const y = l.y0 + leaves.fall * age;
        if (!l.on || y > leaves.to) {
          l.on = false;
          put(printLayer.look, n++, 0, 0, 0, 1);
          continue;
        }
        l.wx += gust[0] * 0.25 * dt;
        const x = l.x0 + l.sway * Math.sin(1.4 * age + l.phase) + l.drift * age + l.wx;
        // tumbling: seen edge on and back round, its face coming and going
        const c = Math.cos(l.spin * age + l.phase);
        const flip = Math.sign(c || 1) * Math.max(0.14, Math.abs(c));
        const down = clamp01((y - l.y0) / (leaves.to - l.y0));
        put(printLayer.home, n, ...leaves.home);
        put(printLayer.at, n, u(x), v(y), l.scale, 0.45 + 0.55 * Math.sin(1.1 * age + l.phase * 0.7));
        put(printLayer.look, n, lerp(0.03, 0.01, down), smooth(0, 0.35, age) * (1 - smooth(0.82, 1, down)), 0, flip);
        n++;
      }
    }

    // the falling snow, and what's dropped off a shaken branch, which falls quicker
    if (snow) {
      const s = out.layers.snow;
      const [, top, , tall] = snow.area;
      snow.flakes.forEach((f, i) => {
        if (!still) {
          f.y += f.speed * dt + gust[1] * 0.08 * dt;
          f.x += Math.cos(f.swayRate * t + f.phase) * f.sway * dt + gust[0] * 0.2 * dt;
        }
        if (f.y > top + tall) flake(f, false);
        const k = (f.y - top) / tall;
        put(s.home, i, f.cell / STRIP, 0, 1 / STRIP, 1);
        put(s.at, i, u(f.x), v(f.y), f.scale, f.turn);
        put(s.look, i, f.lift, smooth(0, 0.06, k) * (1 - smooth(0.88, 1, k)), 0, 1);
      });
      snow.dropped.forEach((f, j) => {
        const i = snow.flakes.length + j;
        const age = t - f.born;
        if (age < 0 || age > f.life) {
          put(s.look, i, 0, 0, 0, 1);
          return;
        }
        const x = f.x + f.vx * age;
        const y = f.y + f.vy * age + 160 * age * age;
        put(s.home, i, f.cell / STRIP, 0, 1 / STRIP, 1);
        put(s.at, i, u(x), v(y), f.scale, f.turn + age);
        put(s.look, i, 0.02 + 0.015 * age, smooth(0, 0.08, age) * (1 - smooth(f.life * 0.7, f.life, age)), 0, 1);
      });
    }

    // hearts, and now and then a few rising off the picture on their own
    if (floating && !still && t > floating.next) {
      const [ax, ay, aw, ah] = floating.area;
      hearts([ax + rand() * aw, ay + rand() * ah], 1 + Math.floor(rand() * 2));
      floating.next = t + pick(...(floating.every || [1.2, 2.6]));
    }
    if (lovable) {
      const hl = out.layers.hearts;
      love.forEach((h, i) => {
        const age = t - h.born;
        if (age < 0 || age > h.life) {
          put(hl.look, i, 0, 0, 0, 1);
          return;
        }
        h.wx += gust[0] * 0.15 * dt;
        const k = age / h.life;
        // popping up out of it, then rising and swaying, and fading as they go
        const pop = age < 0.3 ? easeOut(age / 0.3) * (1 + 0.25 * Math.sin((Math.PI * age) / 0.3)) : 1;
        const x = h.x + h.drift * age + h.sway * Math.sin(2.2 * age + h.phase) + h.wx;
        const y = h.y - h.rise * age;
        put(hl.home, i, h.cell / HEARTS, 0, 1 / HEARTS, 1);
        put(hl.at, i, u(x), v(y), h.scale * pop, 0.25 * Math.sin(1.7 * age + h.phase));
        put(hl.look, i, lerp(0.012, 0.035, smooth(0, 0.4, k)), 1 - smooth(0.65, 1, k), 0, 1);
      });
    }

    // the snow behind the glass: a flurry thickens it and hurries it, the breeze blows it about
    if (out.snowfall) {
      fall.flurry *= Math.exp(-dt * 0.45);
      fall.down += dt * (1 + 1.6 * fall.flurry);
      fall.drift += dt * ((gust[0] / H) * 22 + 0.6 * fall.flurry * Math.sin(1.3 * t));
      out.snowfall.set(0.3 + 0.32 * fall.flurry, fall.drift, fall.down, 0);
    }

    // the glints: on the lights, on the stars, the fireflies, the sparks, a shooting star
    const gl = out.glints;
    let m = 0;
    for (const g of shining) {
      const level = burn(g, t) * (g.level ?? 1);
      put(gl.at, m, u(g.at[0]), v(g.at[1]), g.glint.size * (0.8 + 0.5 * g.env), g.turn * 0.25);
      put(gl.glint, m, g.color[0], g.color[1], g.color[2], (g.glint.rest ?? 0.15) * level + 1.1 * g.env);
      put(gl.shape, m, g.glint.points ?? 1, 0.004, 0, 0);
      m++;
    }
    for (const g of glimmers) {
      if (t > g.next) {
        g.since = t;
        g.next = t + pick(...(spec.twinkles.every || [2, 6]));
      }
      const age = t - g.since;
      const env = age < 0.9 ? Math.pow(Math.sin((Math.PI * age) / 0.9), 2) : 0;
      put(gl.at, m, u(g.x), v(g.y), (spec.twinkles.size ?? 0.045) * (0.5 + 0.5 * env), g.turn + age * 0.6);
      put(gl.glint, m, 1, 0.95, 0.82, 1.4 * env);
      put(gl.shape, m, 1, 0.004, 0, 0);
      m++;
    }
    for (const p of twinkling) {
      put(gl.at, m, p.at[0], p.at[1], 0.05 * (0.6 + 0.4 * p.env), 0.3 * Math.sin(p.phase));
      put(gl.glint, m, 1, 0.93, 0.72, 1.5 * p.env);
      put(gl.shape, m, 1, (p.lift ?? 0.008) + 0.002, 0, 0);
      m++;
    }
    if (flies) {
      const [ax, ay, aw, ah] = flies.area;
      for (const b of flies.bugs) {
        if (!still) {
          b.x += 16 * Math.sin(0.37 * b.wander * t + b.phase) * dt + gust[0] * 0.1 * dt;
          b.y += (-7 + 11 * Math.sin(0.29 * b.wander * t + 2 * b.phase)) * dt;
        }
        // they keep their distance from the pointer
        if (pointer && !still) {
          const dx = b.x - pointer[0];
          const dy = b.y - pointer[1];
          const d = Math.hypot(dx, dy);
          if (d < 110 && d > 0.1) {
            b.x += (dx / d) * (110 - d) * 2.2 * dt;
            b.y += (dy / d) * (110 - d) * 2.2 * dt;
          }
        }
        if (b.y < ay - 10) b.y = ay + ah;
        if (b.y > ay + ah + 10) b.y = ay;
        if (b.x < ax) b.x += aw;
        if (b.x > ax + aw) b.x -= aw;
        const pulse = Math.pow(Math.max(0, Math.sin((TAU * t) / b.period + b.phase)), 3);
        put(gl.at, m, u(b.x), v(b.y), flies.size * (0.75 + 0.4 * pulse), 0);
        put(gl.glint, m, flies.color[0], flies.color[1], flies.color[2], 0.18 + 1.3 * pulse);
        put(gl.shape, m, 0, 0.03, 1, 0);
        m++;
      }
    }
    for (const s of sparks) {
      const age = t - s.born;
      if (age < 0 || age > s.life) {
        put(gl.glint, m++, 0, 0, 0, 0);
        continue;
      }
      // thrown out, slowing; embers rise and waver instead
      const go = (1 - Math.exp(-age * 3)) / 3;
      const x = s.x + s.vx * go + (s.rise ? 8 * Math.sin(5 * age + s.phase) : 0);
      const y = s.y + s.vy * go - (s.rise ? 30 * age : 0);
      const k = age / s.life;
      // a spark that's still (a bauble catching the light) swells and fades; one thrown dims
      const bright = s.vx || s.vy ? (1 - k) * (1 - k) : Math.sin(Math.PI * k);
      put(gl.at, m, u(x), v(y), s.size * (s.vx || s.vy ? 1 - 0.5 * k : 0.6 + 0.4 * bright), age * 2);
      put(gl.glint, m, lerp(1, s.color[0], 0.6), lerp(1, s.color[1], 0.6), lerp(1, s.color[2], 0.6), 1.6 * bright);
      put(gl.shape, m, s.points, 0.03, 0, 0);
      m++;
    }
    if (shooting) {
      if (t > shooting.next && !shooting.star && !still) {
        const [ax, ay, aw, ah] = shooting.area;
        const right = rand() < 0.5;
        const heading = rad(pick(18, 34));
        shooting.star = {
          born: t,
          x: ax + aw * (right ? pick(0.05, 0.4) : pick(0.6, 0.95)),
          y: ay + ah * pick(0.05, 0.35),
          vx: (right ? 1 : -1) * Math.cos(heading) * 520,
          vy: Math.sin(heading) * 520,
        };
        shooting.next = t + pick(...shooting.every);
      }
      const st = shooting.star;
      const age = st ? t - st.born : -1;
      if (st && age < 0.75) {
        const k = age / 0.75;
        put(gl.at, m, u(st.x + st.vx * age), v(st.y + st.vy * age), 0.07, Math.atan2(-st.vy, st.vx));
        put(gl.glint, m, 1, 0.95, 0.85, 1.4 * Math.sin(Math.PI * k));
        put(gl.shape, m, 0, 0.012, 0, 1);
      } else {
        shooting.star = null;
        put(gl.glint, m, 0, 0, 0, 0);
      }
      m++;
    }
  }

  return {
    glows: glows.length,
    movers: movers.length,
    layers: { print: printCount, snow: snow ? snow.count + BURST : 0, hearts: lovable ? LOVE : 0 },
    glints: glintCount,
    snowfall: !!spec.snowfall,
    step,
    // whether tapping a point on the card does something (a light flares, a cat flicks its tail)
    hit(x, y) {
      return lightAt(x, y) >= 0 || !!zoneAt(x, y);
    },
    // does it, and says whether it did
    tap(x, y) {
      const light = lightAt(x, y);
      if (light >= 0) {
        pokes.push(light);
        for (const name of glows[light].kick || []) byName.get(name) && kick(byName.get(name));
        return true;
      }
      const zone = zoneAt(x, y);
      if (!zone) return false;
      for (const name of zone.kick || []) byName.get(name) && kick(byName.get(name));
      if (zone.hearts) hearts(zone.hearts);
      if (zone.snow) dropSnow(zone.snow);
      for (const [sx, sy] of zone.sparkle || []) {
        for (let k = 0; k < 7; k++) {
          const a = -Math.PI / 2 + pick(-1.3, 1.3);
          const speed = pick(90, 220);
          spark(sx, sy, { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: pick(0.7, 1.2), size: pick(0.016, 0.026) });
        }
      }
      for (const [gx, gy] of zone.twinkle || []) {
        const s = spark(gx, gy, { life: pick(0.8, 1.2), size: 0.05, points: 1, color: [1, 0.85, 0.75] });
        s.born += rand() * 0.3;
      }
      if (zone.flurry) fall.flurry = 1;
      if (zone.leaf && leaves) leaves.next = now;
      return true;
    },
    // the card's landed: its parts say hello in a moment
    greet() {
      greetAt = now + 0.5;
    },
    // a tap on one of its lights (the stage's record mode asks for this by number)
    poke(i) {
      if (glows[i]) pokes.push(i);
    },
    // how hard the brightest light is flaring right now
    get flare() {
      return glows.reduce((a, g) => Math.max(a, g.env), 0);
    },
  };
}
