// The card stage: folded cards in WebGL, dealt one after another, that catch the light in their foil
// or paint, open to the letter inside, and, for cards that come alive, glow, move and answer a tap.
// Adapted from bubbbly.com's foil and Christmas cards for a page of its own: no framework, and
// every picture and mask comes in as a canvas drawn by the page.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { drawFaces, IVORY } from './faces.js';
import { paintHearts } from './hearts.js';
import { createLife } from './live.js';
import { paintSnow } from './snow.js';
import {
  GLINT_FRAG,
  GLINT_VERT,
  GRAIN,
  PANEL_FRAG,
  PANEL_VERT,
  PIECE_SHADOW_FRAG,
  PIECE_SHADOW_VERT,
  SHADOW_FRAG,
  SHADOW_VERT,
} from './shaders.js';

const SEGMENTS = 48; // along each panel, so the cover can bow as it swings
const FOV = 30;
const EYE = 6;
const BACKDROP = -1.2; // the white wall the shadows fall on (SHADOW_VERT has its own copy)
const THICK = 0.012; // the stock, world units
const INSERT = 0.0035; // the ivory sheet laid inside, which the message is written on
const GAP = 0.0004; // between the insert and the back, and the cover and the insert when it's shut
const OPEN = Math.PI * 0.94; // how far the cover swings: not quite flat, the way a card stands open
const RELIEF = 2.6; // how hard the stamped foil and emboss bend the light
const HOLD_FRONT = 2.8; // seconds a card shows its front before it opens
const HOLD_OPEN = 4.6; // and then stays open to be read
const BEAT = 0.6; // shut again, before the next one comes in
const SHUFFLE = 1.15;
const EDGE = 0.24; // how close to the cover's free edge (share of the width) takes hold of it
const LAMP = 1.6; // how far in front of the card the lamp that follows the pointer hangs
const TURN = 0.011; // how far a sideways drag turns a card that spins, radians a pixel
const BLOOM = 0.2; // how far what's brighter than white glows past itself
const PIECES_MAP = 256; // the long side of the copy of them their shadows are blurred from
const PIECES_ROOM = 0.5; // the clear margin round that copy, as a share of its long side

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const clamp01 = (x) => clamp(x, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeIn = (t) => t * t * t;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// runs past the target once and settles
const settle = (t) => 1 - Math.exp(-6 * t) * Math.cos(3 * Math.PI * t);

// a value along keyframes [[t, value, ease?]]; each segment eases by its end key's ease
function keys(t, frames) {
  if (t <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1, ease = easeInOut] = frames[i];
    const [t0, v0] = frames[i - 1];
    if (t <= t1) return lerp(v0, v1, ease((t - t0) / (t1 - t0)));
  }
  return frames[frames.length - 1][1];
}

function blankPose() {
  return { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1, dim: 1 };
}

// the idle drift a card has while it holds the stage; card stock is stiff, so it only turns
function sway(t, seed, amount) {
  const p = blankPose();
  p.y = 0.025 * Math.sin(t * 1.1 + seed) * amount;
  p.rx = 0.07 * Math.sin(t * 0.73 + seed * 1.7) * amount;
  p.ry = (0.14 * Math.sin(t * 0.9 + seed) + 0.035 * Math.sin(t * 2.3 + seed * 3.1)) * amount;
  p.rz = 0.02 * Math.sin(t * 0.55 + seed * 0.7) * amount;
  return p;
}

// A card-deck shuffle: the new card pops out from behind the old one and lands in front while
// the old one slides the other way, tucks underneath and fades into the white.
function shuffleIn(p, q, dir, hA, hB) {
  p.y += keys(q, [
    [0, dir * 0.12 * hA],
    [0.42, dir * (0.5 * hA + 0.4 * hB), easeOut],
    [1, 0, easeInOut],
  ]);
  p.z += keys(q, [
    [0, -0.6],
    [0.25, -0.35, easeOut],
    [0.5, 0.3],
    [1, 0],
  ]);
  p.s *= keys(q, [
    [0, 0.62],
    [0.42, 0.9, easeOut],
    [1, 1, easeOut],
  ]);
  p.rz += keys(q, [
    [0, -0.28 * dir],
    [0.42, 0.1 * dir],
    [1, 0, settle],
  ]);
  p.rx += keys(q, [
    [0, 0.1 * dir],
    [0.42, -0.4 * dir],
    [0.8, 0.14 * dir],
    [1, 0],
  ]);
}

function shuffleOut(p, q, dir, hA, hB) {
  p.y += keys(q, [
    [0, 0],
    [0.48, -dir * (0.5 * hB + 0.3 * hA)],
    [1, -dir * 0.12 * hA],
  ]);
  p.z += keys(q, [
    [0, 0],
    [0.45, -0.5],
    [1, -0.9, easeIn],
  ]);
  p.s *= keys(q, [
    [0, 1],
    [1, 0.62, easeIn],
  ]);
  p.rz += keys(q, [
    [0, 0],
    [0.5, 0.2 * dir],
    [1, 0.08 * dir],
  ]);
  p.rx += keys(q, [
    [0, 0],
    [0.45, 0.3 * dir],
    [1, 0],
  ]);
  p.dim = keys(q, [
    [0, 1],
    [0.55, 0.8],
    [1, 0, easeIn],
  ]);
}

// autoplay: whether the stage tours the cards on its own (front, open, shut, next), or leaves
// opening them to whoever's looking. lift: how far above centre the card sits, as a share of the
// view's height, to clear the dock. spin: whether a sideways drag turns the card right round to
// its back (instead of tilting it and swiping to the next); onSide hears which side it settles on.
// holdFront, holdOpen: how long the tour lets each card show its front, and then stay open.
export function createStage(
  canvas,
  {
    cards,
    fonts,
    record,
    autoplay = true,
    lift = 0.035,
    spin = false,
    holdFront = HOLD_FRONT,
    holdOpen = HOLD_OPEN,
    getPaused,
    onIndex,
    onOpen,
    onSide = () => {},
    onReady,
    onProgress,
    onFail,
  },
) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const swayAmount = reduced ? 0.35 : 1;
  let still = false; // record mode can hold the card and its lamp still, to see what moves on it
  const hold = { front: holdFront * (reduced ? 1.6 : 1), open: holdOpen * (reduced ? 1.6 : 1) };

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: !!record,
    });
  } catch {
    onFail();
    return { go() {}, goTo() {}, setOpen() {}, toggleOpen() {}, turnTo() {}, replace() {}, dispose() {} };
  }
  renderer.setPixelRatio(record ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  // no tone mapping: the backdrop stays pure white and the prints keep their exact colours
  renderer.setClearColor(0xffffff, 1);
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
  camera.position.set(0, 0, EYE);

  // multisampled, for clean edges on the stock
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM, 0.3, 1.3);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grain = new ShaderPass(GRAIN);
  composer.addPass(grain);

  const light = { value: new THREE.Vector2() };
  const lamp = { value: new THREE.Vector3(0, 0, LAMP - EYE) };
  const lampOn = { value: 0.7 };
  const time = { value: 0 }; // the stage's clock, for what moves in a painted face (snow behind glass)

  const panelGeometry = new THREE.BoxGeometry(1, 1, 1, SEGMENTS, 1, 1);
  const shadowGeometry = new THREE.PlaneGeometry(1, 1, SEGMENTS, 1);
  const loader = new THREE.TextureLoader();
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const finish = (tex, srgb) => {
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = anisotropy;
    return tex;
  };
  const load = (url, srgb) => loader.loadAsync(url).then((tex) => finish(tex, srgb));
  // a card's print and masks: its own files in public/cards, or `src`, given as urls or as
  // canvases already drawn
  const source = (s, srgb) =>
    typeof s === 'string' ? load(s, srgb) : Promise.resolve(finish(new THREE.CanvasTexture(s), srgb));
  // A card that comes alive (def.live) has a third set of masks (def.src.lift); snow falling over
  // it is a strip of painted flakes every card shares.
  let snowStrip = null;
  const snow = () => {
    if (!snowStrip) {
      const { print, fx, lift } = paintSnow();
      snowStrip = [print, fx, lift].map((c, k) => finish(new THREE.CanvasTexture(c), k === 0));
      disposables.push(...snowStrip);
    }
    return snowStrip;
  };
  // the hearts a petted creature floats up, painted once into a strip they share
  let heartStrip = null;
  const hearts = () => {
    if (!heartStrip) {
      const { print, fx, lift } = paintHearts();
      heartStrip = [print, fx, lift].map((c, k) => finish(new THREE.CanvasTexture(c), k === 0));
      disposables.push(...heartStrip);
    }
    return heartStrip;
  };
  const loadCard = (def) =>
    Promise.all([
      source(def.src?.front ?? `/cards/${def.slug}.webp`, true),
      source(def.src?.fx ?? `/cards/${def.slug}-fx.webp`, false),
      def.live ? source(def.src?.lift ?? `/cards/${def.slug}-lift.webp`, false) : null,
      def.live?.snow ? snow() : null,
    ]).then(([map, fx, liftMask, strip]) =>
      drawFaces(def, map.image, fx.image, fonts, liftMask?.image).then((faces) => [map, fx, faces, { liftMask, strip }]),
    );

  // what of a print spills past its card's edges, small, with a clear margin round it for the
  // shadows to blur into
  function piecesOf(image, [bx, by, bw, bh]) {
    const k = PIECES_MAP / Math.max(image.width, image.height);
    const w = Math.round(image.width * k);
    const h = Math.round(image.height * k);
    const pad = Math.round(PIECES_ROOM * PIECES_MAP);
    const c = document.createElement('canvas');
    c.width = w + 2 * pad;
    c.height = h + 2 * pad;
    const g = c.getContext('2d');
    g.drawImage(image, pad, pad, w, h);
    g.clearRect(pad + bx * k, pad + by * k, bw * k, bh * k);
    return {
      tex: new THREE.CanvasTexture(c),
      box: new THREE.Vector4(pad / c.width, pad / c.height, w / c.width, h / c.height),
    };
  }

  const WHOLE = new THREE.Vector4(0, 0, 1, 1);
  const items = [];
  const disposables = [panelGeometry, shadowGeometry, target];
  let visW = 1;
  let visH = 1;
  let stageY = 0;

  function build(def, i, map, fx, faces, { liftMask, strip } = {}) {
    const drawn = (c, srgb) => finish(new THREE.CanvasTexture(c), srgb);
    const tex = {
      front: [map, fx],
      left: [drawn(faces.left.print, true), drawn(faces.left.masks, false)],
      right: [drawn(faces.right.print, true), drawn(faces.right.masks, false)],
      back: [drawn(faces.back.print, true), drawn(faces.back.masks, false)],
      insert: [drawn(faces.insert.print, true), drawn(faces.insert.masks, false)],
    };
    const own = []; // what this card alone holds, freed when it goes
    const size = { value: new THREE.Vector2(1, 1) };
    const thick = { value: THICK };
    // the cover hinges just clear of the insert, so it shuts over it
    const coverU = { uSize: size, uThick: thick, uZ0: { value: INSERT + 2 * GAP }, uBend: { value: 0 } };
    const backU = { uSize: size, uThick: thick, uZ0: { value: -THICK }, uBend: { value: 0 } };
    const insertU = {
      uSize: { value: new THREE.Vector2(1, 1) },
      uThick: { value: INSERT },
      uZ0: { value: GAP },
      uBend: { value: 0 },
    };
    const dim = { value: 1 };
    const inside = { value: 1 }; // light on the inside faces
    const stock = (rgb) => ({ value: new THREE.Color().setRGB(...rgb.map((c) => c / 255), THREE.SRGBColorSpace) });
    const paper = stock(def.paper);
    const printTint = def.tint === 'print';
    const tint = { value: new THREE.Vector3(...(printTint ? [1, 1, 1] : def.tint)) };
    // the card itself, on its print; what's printed past it is stuck on the front
    const body = def.body ?? [0, 0, def.w, def.h];
    const onPrint = new THREE.Vector4(
      body[0] / def.w,
      1 - (body[1] + body[3]) / def.h,
      body[2] / def.w,
      body[3] / def.h,
    );
    const topBox = { value: new THREE.Vector4() };

    // A painted card (def.paint) is impasto rather than foil on stock, all of it, inside and out.
    // One that comes alive (def.live) has lights in its front, and pieces of it standing off it.
    const life = def.live && liftMask ? createLife(def, { reduced }) : null;
    const vec4s = (n) => ({ value: Array.from({ length: n }, () => new THREE.Vector4()) });
    const liveU = life && {
      uLift: { value: liftMask },
      uTime: time,
      uLive: { value: 1 },
      uCardPx: { value: new THREE.Vector2(def.w, def.h) },
      ...(life.glows && {
        uGlowAt: vec4s(life.glows),
        uGlowCol: vec4s(life.glows),
        uGlowLight: vec4s(life.glows),
        uGlowWarm: vec4s(life.glows),
      }),
      ...(life.movers && {
        uMoveA: vec4s(life.movers),
        uMoveB: vec4s(life.movers),
        uMoveC: vec4s(life.movers),
        uMoveD: vec4s(life.movers),
      }),
      ...(life.snowfall && { uSnow: { value: new THREE.Vector4(0.3, 0, 0, 0) } }),
    };
    const liveDefines = life && {
      LIVE: 1,
      ...(life.glows && { GLOWS: life.glows }),
      ...(life.movers && { MOVERS: life.movers }),
      ...(life.snowfall && { SNOWFALL: 1 }),
    };

    const face = (panelU, [m, f], shade, tooth, mapBox = WHOLE, extra = {}) =>
      new THREE.ShaderMaterial({
        uniforms: {
          ...panelU,
          uMapBox: { value: mapBox },
          uTopBox: topBox,
          uMap: { value: m },
          uFx: { value: f },
          uFxTexel: { value: new THREE.Vector2(1 / f.image.width, 1 / f.image.height) },
          uTint: tint,
          uPaper: paper,
          uRelief: { value: def.relief ?? RELIEF },
          uTooth: { value: tooth },
          uShade: shade,
          uLamp: lamp,
          uLampOn: lampOn,
          uLight: light,
          uDim: dim,
          ...extra.uniforms,
        },
        defines: { FACE: 0, ...(printTint && { TINT_PRINT: 1 }), ...(def.paint && { PAINT: 1 }), ...extra.defines },
        vertexShader: PANEL_VERT,
        fragmentShader: PANEL_FRAG,
        alphaToCoverage: !!extra.defines?.TOPPER,
      });
    const edge = (panelU, of = paper) =>
      new THREE.ShaderMaterial({
        uniforms: { ...panelU, uPaper: of, uShade: { value: 1 }, uLight: light, uDim: dim },
        defines: { FACE: 1 },
        vertexShader: PANEL_VERT,
        fragmentShader: PANEL_FRAG,
      });
    // a box's faces come in the order +x, -x, +y, -y, +z, -z
    const coverEdge = edge(coverU);
    const backEdge = edge(backU);
    const coverMats = [coverEdge, coverEdge, coverEdge, coverEdge];
    // the renders have their own paper fibre; a front drawn here (`tooth: 1`) gets the stage's
    const alive = life ? { defines: liveDefines, uniforms: liveU } : {};
    coverMats.push(face(coverU, tex.front, { value: 1 }, def.tooth ?? 0, onPrint, alive), face(coverU, tex.left, inside, 1));
    const backMats = [backEdge, backEdge, backEdge, backEdge];
    backMats.push(face(backU, tex.right, inside, 1), face(backU, tex.back, { value: 1 }, 1));
    const insertEdge = edge(insertU, stock(IVORY));
    const insertMats = [
      insertEdge,
      insertEdge,
      insertEdge,
      insertEdge,
      face(insertU, tex.insert, inside, 1),
      insertEdge,
    ];
    const cover = new THREE.Mesh(panelGeometry, coverMats);
    const back = new THREE.Mesh(panelGeometry, backMats);
    const insert = new THREE.Mesh(panelGeometry, insertMats);
    // the flowers that spill over, stuck on the front of the cover: printed on their face, bare
    // stock behind, which shows past the cover's edges once it's open
    const topped = !!def.body;
    const topper = topped
      ? new THREE.Mesh(
          shadowGeometry,
          face(coverU, tex.front, { value: 1 }, def.tooth ?? 0, onPrint, { defines: { TOPPER: 1 } }),
        )
      : null;
    if (topper) topper.material.side = THREE.DoubleSide;
    const pieces = topped ? piecesOf(map.image, body) : null;

    const backRect = { value: new THREE.Vector4() };
    const shadowOf = (panelU, fromEye, strength, rect = backRect, withPieces = false) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          ...panelU,
          uRect: rect,
          uPad: { value: 0.3 },
          uFromEye: { value: fromEye },
          uStrength: { value: strength },
          uDim: dim,
          uPieces: { value: pieces?.tex ?? null },
          uPiecesBox: { value: pieces?.box ?? WHOLE },
        },
        defines: withPieces ? { TOPPER: 1 } : {},
        vertexShader: SHADOW_VERT,
        fragmentShader: SHADOW_FRAG,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(shadowGeometry, mat);
      mesh.renderOrder = -1;
      own.push(mat);
      return mesh;
    };
    // the cover's take in the pieces stuck on it, so they're cast over the whole print
    const coverRect = topped ? topBox : backRect;
    const coverShadows = [shadowOf(coverU, 0, 0.3, coverRect, topped), shadowOf(coverU, 1, 0.13, coverRect, topped)];
    const backShadows = [shadowOf(backU, 0, 0.3), shadowOf(backU, 1, 0.13)];

    // What stands off the front of a card that comes alive: pieces cut from a print (its own, or
    // the snow strip), each in one draw, with their shadows on the face under them, and the glints
    // over it all. The life writes them every frame.
    const lively = [];
    const liveOut = { layers: {} };
    const liveAttrs = [];
    const instanced = (count, names) => {
      const geometry = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1));
      geometry.instanceCount = count;
      const arrays = {};
      for (const name of names) {
        const attr = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
        attr.setUsage(THREE.DynamicDrawUsage);
        geometry.setAttribute(name, attr);
        liveAttrs.push(attr);
        arrays[name] = attr.array;
      }
      own.push(geometry);
      return { geometry, arrays };
    };
    if (life) {
      const layers = { print: [map, fx, liftMask], snow: strip, hearts: life.layers.hearts ? hearts() : null };
      for (const [name, count] of Object.entries(life.layers)) {
        if (!count) continue;
        const [m, f, l] = layers[name];
        const { geometry, arrays } = instanced(count, ['aHome', 'aAt', 'aLook']);
        const placeU = {
          uMapBox: { value: onPrint },
          uCardPx: liveU.uCardPx,
          uHomePx: { value: new THREE.Vector2(m.image.width, m.image.height) },
          uLift: { value: l },
        };
        const look = face(coverU, [m, f], { value: 1 }, 0, onPrint, {
          defines: { ...liveDefines, PIECE: 1 },
          uniforms: { ...liveU, ...placeU },
        });
        look.transparent = true;
        look.depthWrite = false;
        const cast = new THREE.ShaderMaterial({
          uniforms: { ...coverU, ...placeU, uLight: light, uDim: dim, uLive: liveU.uLive, uStrength: { value: 0.36 } },
          vertexShader: PIECE_SHADOW_VERT,
          fragmentShader: PIECE_SHADOW_FRAG,
          transparent: true,
          depthWrite: false,
        });
        const shadows = new THREE.Mesh(geometry, cast);
        const pieces = new THREE.Mesh(geometry, look);
        // the snow falls in front of what stands still, and the hearts float up over it all
        shadows.renderOrder = 1;
        pieces.renderOrder = { print: 2, snow: 3, hearts: 3.5 }[name];
        lively.push(shadows, pieces);
        own.push(look, cast);
        liveOut.layers[name] = { home: arrays.aHome, at: arrays.aAt, look: arrays.aLook };
      }
      const { geometry, arrays } = instanced(life.glints, ['aAt', 'aGlint', 'aShape']);
      const shine = new THREE.ShaderMaterial({
        uniforms: { ...coverU, uMapBox: { value: onPrint }, uCardPx: liveU.uCardPx, uDim: dim, uLive: liveU.uLive },
        vertexShader: GLINT_VERT,
        fragmentShader: GLINT_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const glints = new THREE.Mesh(geometry, shine);
      glints.renderOrder = 4;
      lively.push(glints);
      own.push(shine, liftMask);
      liveOut.glints = { at: arrays.aAt, glint: arrays.aGlint, shape: arrays.aShape };
      if (life.movers) {
        liveOut.move = { a: liveU.uMoveA.value, b: liveU.uMoveB.value, c: liveU.uMoveC.value, d: liveU.uMoveD.value };
      }
      if (life.snowfall) liveOut.snowfall = liveU.uSnow.value;
      if (life.glows) {
        liveOut.glow = {
          at: liveU.uGlowAt.value,
          col: liveU.uGlowCol.value,
          light: liveU.uGlowLight.value,
          warm: liveU.uGlowWarm.value,
        };
      }
    }

    // the root turns about the middle of whatever's showing; the spine slides from the closed
    // card's left edge to the middle of the spread as it opens
    const root = new THREE.Group();
    root.rotation.order = 'YXZ';
    const spine = new THREE.Group();
    const hinge = new THREE.Group();
    hinge.add(cover, ...(topper ? [topper] : []), ...coverShadows, ...lively);
    spine.add(back, insert, hinge, ...backShadows);
    root.add(spine);
    // the shaders bow and project the panels well outside the box's own bounds
    root.traverse((o) => {
      o.frustumCulled = false;
    });
    root.visible = false;
    scene.add(root);
    own.push(...Object.values(tex).flat(), ...new Set([...coverMats, ...backMats, ...insertMats]));
    if (topper) own.push(topper.material, pieces.tex);
    return {
      dispose() {
        scene.remove(root);
        for (const d of own) d.dispose();
      },
      def,
      root,
      spine,
      hinge,
      size: size.value,
      body,
      topBox: topBox.value,
      backRect: backRect.value,
      insert,
      insertSize: insertU.uSize.value,
      bend: coverU.uBend,
      dim,
      inside,
      backShadows: backShadows.map((m) => [m.material.uniforms.uStrength, m.material.uniforms.uStrength.value]),
      seed: i * 1.618 + 0.4,
      links: faces.links || [], // what's on the back to tap through to, from drawFaces
      life,
      live: liveU?.uLive,
      liveOut,
      liveAttrs,
      th: { x: 0, v: 0 }, // the cover's swing
      lay: { x: 0, v: 0 }, // how far the stage has made room for the open spread
      spread: { s: 1, x: 0 },
      w: 1,
      h: 1,
    };
  }

  function layout() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    visH = 2 * EYE * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    visW = visH * camera.aspect;
    const narrow = camera.aspect < 0.8;
    // the dock takes the bottom of the page, so the card sits a little above centre
    stageY = visH * (record ? 0 : lift);
    for (const item of items) {
      // the whole print fits as a card would; the card itself is the part of it that's its body
      const { w: pw, h: ph } = item.def;
      const [bx, by, bw, bh] = item.body;
      const k = Math.min(visH * (narrow ? 0.52 : 0.62), (visW * (narrow ? 0.78 : 0.5)) / (pw / ph)) / ph;
      item.w = bw * k;
      item.h = bh * k;
      item.size.set(item.w, item.h);
      item.backRect.set(0, -item.h / 2, item.w, item.h);
      item.topBox.set(-bx * k, item.h / 2 + (by - ph) * k, pw * k, ph * k);
      // the insert lies centred on the inside of the back, so it starts in from the fold
      const [iw, ih] = item.def.insert.size;
      item.insertSize.set(iw * item.w, ih * item.h);
      item.insert.position.set(((1 - iw) / 2) * item.w, 0, 0);
      // Open, it's twice as wide. It shrinks to fit if it can stay big enough to read; on a
      // narrow screen the inside with the message takes the middle and the cover runs off the
      // left edge, the way you'd hold a card open to read it.
      const fit = Math.min(1, (visW * 0.9) / (2 * item.w), (visH * 0.8) / item.h);
      if (fit >= 0.72) {
        item.spread = { s: fit, x: 0 };
      } else {
        const s = Math.min(1, (visW * 0.9) / item.w);
        item.spread = { s, x: (-item.w * s) / 2 };
      }
    }
  }

  // --- sequencing -------------------------------------------------------------------------

  // open: whether the current card is (or is going) open. read: it's been opened and shut this
  // visit, so it's done. beat: how long it stays shut after that before the next comes in.
  // feel: where the pointer is on the current card, if it's on one that comes alive, and how fast
  // it's moving over it
  const st = {
    t: 0,
    cur: 0,
    tr: null,
    holdStart: 0,
    count: 0,
    queue: null,
    open: false,
    read: false,
    beat: BEAT,
    feel: { item: null },
  };

  function setOpen(want, manual = false) {
    // a card turned round comes back to its front to open
    if (want && spin) turnTo('front');
    // left to whoever's looking, a card asked to open as it comes in opens once it's landed
    if (st.tr && !autoplay && !st.queue) st.later = want;
    if (st.tr || st.queue || want === st.open) return;
    st.open = want;
    st.holdStart = st.t;
    if (!want) {
      st.read = true;
      // shut by hand, the front gets a proper look before the next card
      st.beat = manual ? hold.front : BEAT;
    }
    onOpen(want);
  }

  function begin(to, opts = {}) {
    if (st.tr) {
      if (st.tr.to !== to) st.queue = { to, opts };
      return;
    }
    if (to === st.cur) {
      st.queue = null;
      return;
    }
    // an open card shuts before the next one comes in
    if (st.open || items[st.cur].th.x > 0.06) {
      if (st.open) {
        st.open = false;
        onOpen(false);
      }
      st.queue = { to, opts };
      return;
    }
    st.tr = { from: st.cur, to, start: st.t, dur: SHUFFLE, dir: Math.floor(st.count / 2) % 2 ? -1 : 1 };
    st.count++;
    onIndex(to);
  }

  const go = (delta) => begin((st.cur + delta + items.length) % items.length);

  // --- pointer ----------------------------------------------------------------------------

  const ptr = {
    nx: 0,
    ny: 0,
    sx: 0,
    sy: 0,
    over: false,
    mouse: false,
    down: false,
    mode: null,
    x0: 0,
    y0: 0,
    x: 0,
    y: 0,
    t0: 0,
    vx: 0,
    lastX: 0,
    lastT: 0,
  };
  const spring = () => ({ x: 0, v: 0 });
  const sp = { rx: spring(), ry: spring() };

  // A card that spins: how far it's turned (front at even multiples of π, back at odd), where it's
  // settling, and where a drag of it started.
  const turn = { x: 0, v: 0, target: 0, from: 0, side: 'front' };
  const showsBack = () => Math.cos(turn.x) < 0;
  function settle(target) {
    turn.target = target;
    const side = ((Math.round(target / Math.PI) % 2) + 2) % 2 ? 'back' : 'front';
    if (side !== turn.side) {
      turn.side = side;
      onSide(side);
    }
  }
  // round to a side by the shortest way
  function turnTo(side) {
    const half = Math.round((turn.x - (side === 'back' ? Math.PI : 0)) / (2 * Math.PI));
    settle((2 * half + (side === 'back' ? 1 : 0)) * Math.PI);
  }
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const inverse = new THREE.Matrix4();
  const ray = new THREE.Ray();
  const flat = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const onFlat = new THREE.Vector3();
  const lampAim = new THREE.Vector3();

  function step(s, target, k, c, dt) {
    s.v += (k * (target - s.x) - c * s.v) * dt;
    s.x += s.v * dt;
  }

  // where the pointer meets the card's (closed, flat) plane, in the spine's units: x out from the
  // fold, y up
  function localHit(item) {
    ndc.set(ptr.nx, ptr.ny);
    raycaster.setFromCamera(ndc, camera);
    item.spine.updateMatrixWorld();
    inverse.copy(item.spine.matrixWorld).invert();
    ray.copy(raycaster.ray).applyMatrix4(inverse);
    if (Math.abs(ray.direction.z) < 1e-5) return null;
    const t = -ray.origin.z / ray.direction.z;
    if (t < 0) return null;
    return { x: ray.origin.x + ray.direction.x * t, y: ray.origin.y + ray.direction.y * t };
  }

  // whether that lands on the card, open or shut
  function onCard(item, hit) {
    if (!hit) return false;
    const pad = 0.02 * item.w;
    const reach = item.w * Math.cos(item.th.x);
    return hit.x > Math.min(0, reach) - pad && hit.x < item.w + pad && Math.abs(hit.y) < item.h / 2 + pad;
  }

  // ...or near enough the cover's free edge to take hold of it, from the front (a card that comes
  // alive keeps it to its paper margin, clear of what can be tapped)
  function onEdge(item, hit) {
    if (!hit || showsBack()) return false;
    const edge = (item.def.edge ?? EDGE) * item.w;
    return Math.abs(hit.x - item.w * Math.cos(item.th.x)) < edge && Math.abs(hit.y) < item.h / 2;
  }

  // the link under the pointer on the back of a shut card, if there's one there; links are boxes
  // in shares of the back's print, which runs right to left along the spine's x, seen from behind
  function linkAt(item, hit) {
    if (!hit || !item.links.length || item.th.x > 0.3) return null;
    const u = 1 - hit.x / item.w;
    const v = 0.5 - hit.y / item.h;
    return item.links.find(({ box: [x0, y0, x1, y1] }) => u > x0 && u < x1 && v > y0 && v < y1) || null;
  }

  // where the pointer is on the front of a shut card that comes alive, in its print's pixels, or
  // null: what its life feels, and what a tap there reaches
  function feltAt(item, hit) {
    if (!hit || !item.life || item.th.x > 0.3 || showsBack() || !onCard(item, hit)) return null;
    const [bx, by, bw, bh] = item.body;
    return [bx + (hit.x / item.w) * bw, by + (0.5 - hit.y / item.h) * bh];
  }

  function toNdc(e) {
    const r = canvas.getBoundingClientRect();
    ptr.nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    ptr.ny = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  function onDown(e) {
    if (!items.length) return;
    toNdc(e);
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // synthetic or already-released pointers can't be captured; the drag still works
    }
    Object.assign(ptr, {
      down: true,
      over: true,
      mouse: e.pointerType === 'mouse',
      mode: !st.tr && !st.queue && onEdge(items[st.cur], localHit(items[st.cur])) ? 'open' : spin ? 'spin' : 'tilt',
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      t0: performance.now(),
      vx: 0,
      lastX: e.clientX,
      lastT: performance.now(),
    });
    turn.from = turn.x;
    canvas.dataset.grabbing = '';
  }

  function onMove(e) {
    toNdc(e);
    ptr.over = true;
    ptr.mouse = e.pointerType === 'mouse';
    if (!ptr.down) return;
    const now = performance.now();
    const dt = Math.max(1, now - ptr.lastT);
    ptr.vx = lerp(ptr.vx, ((e.clientX - ptr.lastX) / dt) * 1000, 0.4);
    ptr.lastX = e.clientX;
    ptr.lastT = now;
    ptr.x = e.clientX;
    ptr.y = e.clientY;
  }

  function onUp(e) {
    if (!ptr.down) return;
    const moved = Math.hypot(e.clientX - ptr.x0, e.clientY - ptr.y0);
    const quick = performance.now() - ptr.t0 < 350;
    const item = items[st.cur];
    if (moved < 6 && quick) {
      const hit = localHit(item);
      const felt = !st.tr && !st.open ? feltAt(item, hit) : null;
      if (spin && showsBack()) {
        // on the back, a tap on its link follows it, and anywhere else turns the card round again
        const link = linkAt(item, hit);
        if (link) window.open(link.href, '_blank', 'noopener,noreferrer');
        else turnTo('front');
      } else if (felt && item.life.tap(...felt)) {
        // a tap on something alive on the front (the lantern, the cat, a branch) sets it going, and
        // the card stays on its front a while longer for it
        st.holdStart = st.t;
      } else if (onCard(item, hit)) {
        // a tap on the card opens or shuts it; one beside an open card shuts it
        setOpen(!st.open, true);
      } else {
        setOpen(false, true);
      }
    } else if (ptr.mode === 'spin') {
      // let go, it carries on the way it was thrown and settles on the side it's nearer
      settle(Math.round((turn.x + ptr.vx * TURN * 0.2) / Math.PI) * Math.PI);
    } else if (ptr.mode === 'open') {
      // let go past upright and it falls open, short of that it shuts, unless it was thrown
      const thrown = Math.abs(ptr.vx) > 600 ? ptr.vx < 0 : item.th.x > Math.PI / 2;
      if (thrown !== st.open) setOpen(thrown, true);
    } else if (Math.abs(ptr.vx) > 800 && Math.abs(e.clientX - ptr.x0) > 50) {
      // swipe left for the next one, right for the one before
      go(ptr.vx < 0 ? 1 : -1);
    }
    ptr.down = false;
    ptr.mode = null;
    if (e.pointerType !== 'mouse') ptr.over = false;
    // a card someone just played with stays a moment longer
    st.holdStart = Math.max(st.holdStart, st.t - (st.open ? hold.open : hold.front) * 0.3);
    delete canvas.dataset.grabbing;
  }

  function onLeave() {
    if (!ptr.down) ptr.over = false;
  }

  if (!record) {
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
  }

  // --- frame ------------------------------------------------------------------------------

  function apply(item, p) {
    const e = item.lay.x;
    item.root.visible = true;
    item.root.position.set(p.x + item.spread.x * e, p.y + stageY, p.z);
    item.root.rotation.set(p.rx, p.ry, p.rz);
    item.root.scale.setScalar(p.s * lerp(1, item.spread.s, e));
    item.spine.position.x = -(item.w / 2) * (1 - e);
    item.hinge.rotation.y = -item.th.x;
    item.dim.value = p.dim;
    // the inside is in the cover's shadow until it lifts; the back's own shadow comes out from
    // under the cover's as it does
    item.inside.value = lerp(0.35, 1, smooth(0, 1.1, item.th.x));
    const out = smooth(0.15, 1.4, item.th.x);
    for (const [u, full] of item.backShadows) u.value = full * out;
    // a card that comes alive lives while it shows: its front's life fades as the cover turns away;
    // the one under the pointer feels it
    if (item.life) {
      item.live.value = smooth(0.1, 0.55, Math.cos(item.th.x));
      const feel = item === st.feel.item ? st.feel : {};
      item.life.step(st.dt, st.t, item.liveOut, still ? { ...feel, still } : feel);
      for (const attr of item.liveAttrs) attr.needsUpdate = true;
    }
  }

  function frame(dt) {
    st.t += dt;
    st.dt = dt;
    grain.uniforms.uTime.value = st.t;
    time.value = st.t;

    if (st.tr && st.t - st.tr.start >= st.tr.dur) {
      st.cur = st.tr.to;
      st.tr = null;
      items[st.cur].life?.greet();
      st.open = false;
      st.read = false;
      st.holdStart = st.t;
      if (st.later != null) {
        setOpen(st.later, true);
        st.later = null;
      }
    }
    const item = items[st.cur];
    if (!st.tr && st.queue && !st.open && item.th.x < 0.06) {
      const { to, opts } = st.queue;
      st.queue = null;
      begin(to, opts);
    }

    // A card under the mouse, or in hand, holds the stage: its timer stops until it's let go.
    // Left alone, a card shows its front, opens to be read, shuts, and the next comes in.
    const hit = !st.tr ? localHit(item) : null;
    const held = !st.tr && (ptr.down || (ptr.over && ptr.mouse && onCard(item, hit)));
    if (held) st.holdStart += dt;
    const since = st.t - st.holdStart;
    if (autoplay && !st.tr && !st.queue && !held && !getPaused()) {
      if (st.open) {
        if (since > hold.open) setOpen(false);
      } else if (!st.read) {
        if (since > hold.front) setOpen(true);
      } else if (item.th.x < 0.06 && since > st.beat) {
        go(1);
      }
    }

    // the cover: open or shut, lifted a little when the mouse is at its edge, or following a
    // hand that has hold of it
    let thTarget = st.open ? OPEN : 0;
    let grab = false;
    const dragging = !st.tr && ptr.down && ptr.mode === 'open';
    if (dragging && hit) {
      thTarget = clamp(Math.acos(clamp(hit.x / item.w, -1, 1)), 0, OPEN);
    } else if (!st.tr && !ptr.down && ptr.over && ptr.mouse && onEdge(item, hit)) {
      thTarget += st.open ? -0.24 : 0.24;
      grab = true;
    }
    const link = spin && !ptr.down && ptr.over && ptr.mouse && showsBack() && linkAt(item, hit);
    // The pointer over a card that comes alive is a breeze through it, and what's under it can be
    // tapped. Its speed over the card is in the print's pixels a second.
    const felt = !st.tr && ptr.over && !st.open ? feltAt(item, hit) : null;
    const was = st.feel.item === item ? st.feel.at : null;
    st.feel = felt
      ? { item, at: felt, vel: was ? [(felt[0] - was[0]) / dt, (felt[1] - was[1]) / dt] : [0, 0] }
      : { item: null };
    const reachable = felt && !ptr.down && ptr.mouse && item.life.hit(...felt);
    for (const it of items) {
      const want = it === item ? thTarget : 0;
      step(it.th, want, dragging && it === item ? 260 : 55, dragging && it === item ? 30 : 10, dt);
      // the cover can't swing through the back: shut, it lands on it with a little bounce, and
      // open, it can go no further than flat
      if (it.th.x < 0) {
        it.th.x = 0;
        it.th.v = Math.abs(it.th.v) * 0.2;
      } else if (it.th.x > Math.PI) {
        it.th.x = Math.PI;
        it.th.v = -Math.abs(it.th.v) * 0.2;
      }
      step(it.lay, it === item && st.open ? 1 : 0, 70, 15, dt);
      // stiff as it is, the stock gives a little: the free edge trails as it swings, and leads
      // when it's pulled by it
      it.bend.value = clamp(it.th.v * (dragging && it === item ? 0.035 : -0.05), -0.32, 0.32);
    }
    canvas.style.cursor = ptr.down ? '' : link || reachable ? 'pointer' : grab ? 'grab' : '';
    // a light that's flaring blooms the more
    bloom.strength = BLOOM + 0.12 * (item.life?.flare ?? 0);

    // pointer parallax and lights
    const ease = 1 - Math.exp(-dt * 4);
    ptr.sx = lerp(ptr.sx, ptr.over ? ptr.nx : 0, ease);
    ptr.sy = lerp(ptr.sy, ptr.over ? ptr.ny : 0, ease);
    light.value.set(ptr.sx * 0.14, ptr.sy * 0.09);
    if (!ptr.down) ptr.vx *= Math.exp(-dt * 6);

    // The lamp hangs in front of the card under the pointer, set out a little further than it,
    // so its reflection lands right where the pointer is. With no pointer over the page it drifts
    // across the card on its own.
    if (ptr.over) {
      ndc.set(ptr.nx, ptr.ny);
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(flat, onFlat)) lampAim.set(onFlat.x * 1.2, onFlat.y * 1.2, LAMP - EYE);
    } else if (still) {
      lampAim.set(item.root.position.x - item.w * 0.15, stageY + item.h * 0.2, LAMP - EYE);
    } else {
      const wide = item.w * lerp(1, 2 * item.spread.s, item.lay.x);
      const cx = item.root.position.x;
      lampAim.set(
        cx + wide * 0.5 * Math.sin(st.t * 0.55),
        stageY + item.h * 0.36 * Math.sin(st.t * 0.8 + 1.3),
        LAMP - EYE,
      );
    }
    lamp.value.lerp(lampAim, 1 - Math.exp(-dt * (ptr.over ? 9 : 3)));
    lampOn.value = lerp(lampOn.value, ptr.over ? 1 : 0.7, 1 - Math.exp(-dt * 4));

    const tilting = !st.tr && ptr.down && ptr.mode === 'tilt';
    const turning = !st.tr && ptr.down && ptr.mode === 'spin';
    step(sp.ry, tilting ? clamp((ptr.x - ptr.x0) * 0.005, -0.9, 0.9) : 0, 90, 9, dt);
    step(sp.rx, tilting || turning ? clamp((ptr.y - ptr.y0) * 0.004, -0.6, 0.6) : 0, 90, 9, dt);
    // a spinning card follows the hand right round, and when it's let go settles on a side
    if (turning) {
      turn.x = turn.from + (ptr.x - ptr.x0) * TURN;
      turn.v = ptr.vx * TURN;
    } else {
      step(turn, turn.target, 30, 9, dt);
    }

    for (const it of items) it.root.visible = false;

    // the side under the pointer dips away from it; less so for a card open wide
    const decorate = (p, it) => {
      const k = 1 - 0.45 * it.lay.x;
      p.ry += ptr.sx * 0.3 * k;
      p.rx -= ptr.sy * 0.22 * k;
      return p;
    };

    if (st.tr) {
      const tr = st.tr;
      const q = clamp01((st.t - tr.start) / tr.dur);
      const A = tr.from >= 0 ? items[tr.from] : null;
      const B = items[tr.to];
      if (A) {
        const pa = decorate(sway(st.t, A.seed, swayAmount), A);
        shuffleOut(pa, q, tr.dir, A.h, B.h);
        apply(A, pa);
      }
      const pb = decorate(sway(st.t, B.seed, swayAmount), B);
      shuffleIn(pb, q, tr.dir, A ? A.h : B.h, B.h);
      apply(B, pb);
      onProgress(0);
    } else {
      const p = decorate(sway(st.t, item.seed, still ? 0 : swayAmount * (1 - 0.4 * item.lay.x)), item);
      p.ry += sp.ry.x + turn.x;
      p.rx += sp.rx.x;
      apply(item, p);
      if (autoplay && !getPaused() && !ptr.down) {
        onProgress(st.open ? 0.4 + 0.6 * clamp01(since / hold.open) : st.read ? 1 : 0.4 * clamp01(since / hold.front));
      }
    }

    composer.render();
  }

  // --- boot -------------------------------------------------------------------------------

  let raf = 0;
  let last = 0;
  let disposed = false;
  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
    last = now;
    frame(dt);
  };

  const observer = new ResizeObserver(() => items.length && layout());
  observer.observe(canvas);

  // Swaps card i for a new one in place, as it's being made: no shuffle, and it stays as open as
  // the one it replaces. Only the latest asked for lands; one asked for before the stage is up
  // waits for it.
  const asked = new Map();
  const waiting = new Map();
  function replace(i, def) {
    if (!items[i]) {
      waiting.set(i, def);
      return;
    }
    const ticket = (asked.get(i) || 0) + 1;
    asked.set(i, ticket);
    loadCard(def)
      .then(([map, fx, faces, more]) => {
        if (disposed || asked.get(i) !== ticket) {
          map.dispose();
          fx.dispose();
          more.liftMask?.dispose();
          return;
        }
        const old = items[i];
        const item = build(def, i, map, fx, faces, more);
        Object.assign(item, { th: old.th, lay: old.lay, seed: old.seed });
        old.dispose();
        items[i] = item;
        layout();
      })
      .catch(() => {});
  }

  Promise.all(cards.map(loadCard))
    .then((loaded) => {
      if (disposed) return;
      loaded.forEach(([map, fx, faces, more], i) => items.push(build(cards[i], i, map, fx, faces, more)));
      layout();
      waiting.forEach((def, i) => replace(i, def));
      waiting.clear();
      // the first card comes in the way every other one does
      st.tr = { from: -1, to: 0, start: 0, dur: SHUFFLE, dir: 1 };
      onIndex(0);
      onReady();
      if (record) {
        window.__cards = {
          frame,
          ready: true,
          st,
          goTo: (i) => begin(i),
          setOpen: (v) => setOpen(v, true),
          // a tap on one of the current card's lights, or anywhere on it, in its print's pixels
          poke: (k) => items[st.cur].life?.poke(k),
          tap: (x, y) => {
            if (items[st.cur].life?.tap(x, y)) st.holdStart = st.t;
          },
          turnTo,
          // holds the card and its lamp still (true), so only what lives on it moves
          hold: (v) => {
            still = !!v;
          },
          // the current card's print, in its pixels (what live positions are in)
          size: () => ({ w: items[st.cur].def.w, h: items[st.cur].def.h }),
          // where a point on the current card's front (its print's pixels) is on the canvas
          toScreen: (x, y) => {
            const item = items[st.cur];
            const [bx, by, bw, bh] = item.body;
            item.spine.updateMatrixWorld();
            const v = new THREE.Vector3(((x - bx) / bw) * item.w, (0.5 - (y - by) / bh) * item.h, 0)
              .applyMatrix4(item.spine.matrixWorld)
              .project(camera);
            return [((v.x + 1) / 2) * canvas.width, ((1 - v.y) / 2) * canvas.height];
          },
          // stands in for the pointer: ndc x and y, or null when it's off the page
          setPointer: (nx, ny) => {
            ptr.over = nx != null;
            ptr.mouse = true;
            if (nx != null) Object.assign(ptr, { nx, ny });
          },
        };
      } else {
        raf = requestAnimationFrame(tick);
      }
    })
    .catch(() => !disposed && onFail());

  return {
    go,
    goTo: (i) => begin(i),
    setOpen: (v) => setOpen(v, true),
    toggleOpen: () => setOpen(!st.open, true),
    turnTo,
    replace,
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      for (const item of items) item.dispose();
      for (const d of disposables) d.dispose();
      composer.dispose();
      bloom.dispose();
      renderer.dispose();
      if (record) delete window.__cards;
    },
  };
}
