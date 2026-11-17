// The card stage's shaders. A card's panels are drawn by PANEL_VERT and PANEL_FRAG; the defines
// below switch on what a painted card that comes alive needs, and leave the foil cards as they were.
//
//   PAINT     the print is impasto paint, not foil on stock: its relief comes from the print's own
//             light and dark, and its masks' G is wet paint's gloss (where a foil card has pearl)
//   LIVE      it has a lift mask (uLift): R pieces that stand off the face, G what gives off light,
//             B glass that snow falls behind
//   GLOWS     how many lights are painted on it (a flame, the moon, a star): each lights the paint
//             round it, warms the whole picture, and can throw rays
//   SNOWFALL  snow falls behind the glass (the lift mask's B)
//   MOVERS    how many of its parts move (a tail, a scarf, a branch): the face reads its print through
//             a warp that turns, stretches, shifts or ripples each one in a soft patch round it
//   PIECE     an instanced piece of a print, standing off the cover's face (a star, a puff of smoke,
//             a snowflake), placed by aHome, aAt and aLook

export const PROUD = 0.0006; // how far the pieces stuck on a cover stand off its face

// Every panel is a box of stock hinged at the fold: x runs out from the fold, y up, z through the
// stock. The cover bows as it swings, all of it bent through uBend from its fold to its free edge.
// What a card's print has past its edges (TOPPER: flowers that spill over) is a sheet stuck on the
// cover's face, the whole print in size (uTopBox, on the cover), bowing with it.
export const PANEL = /* glsl */ `
  uniform vec2 uSize;  // the panel's width and height, world units
  uniform float uThick;
  uniform float uZ0;   // where the stock starts through its thickness
  uniform float uBend;

  vec3 bow(vec3 p, out float th) {
    th = uBend * p.x / uSize.x;
    if (abs(uBend) < 1e-4) return p;
    float k = uBend / uSize.x;
    float s = sin(th);
    float c = cos(th);
    return vec3(s / k - s * p.z, p.y, (1.0 - c) / k + c * p.z);
  }
`;

// A piece stands off the cover's face: aHome is the box of its print it shows (corner and size,
// v up), aAt where its middle sits on the card's print (v up) with its scale and turn, and aLook
// how far it stands off the face (as a share of the card's height), its opacity, how much it
// shines, and its width's sign and squash (a leaf tumbling). Its size on the card is its box's
// size in pixels, at the card's pixels, scaled.
const PIECE_PLACE = /* glsl */ `
  uniform vec4 uMapBox;
  uniform vec2 uCardPx; // the card's print, in its pixels
  uniform vec2 uHomePx; // the print the pieces are cut from, in its pixels
  attribute vec4 aHome;
  attribute vec4 aAt;
  attribute vec4 aLook;

  // where on the panel a corner of the piece lands (before the bow), and its print's u there
  vec2 piece(vec2 corner, out vec2 along) {
    vec2 px = uSize / (uMapBox.zw * uCardPx);
    vec2 size = aHome.zw * uHomePx * px * aAt.z;
    float cs = cos(aAt.w);
    float sn = sin(aAt.w);
    vec2 o = corner * size * vec2(abs(aLook.w), 1.0);
    o.x *= sign(aLook.w);
    along = vec2(cs, sn) * sign(aLook.w);
    return (aAt.xy - uMapBox.xy) * uCardPx * px - vec2(0.0, uSize.y * 0.5) + vec2(o.x * cs - o.y * sn, o.x * sn + o.y * cs);
  }
  // and back from the panel to the card's print
  vec2 onPrint(vec2 p) {
    vec2 px = uSize / (uMapBox.zw * uCardPx);
    return uMapBox.xy + (p + vec2(0.0, uSize.y * 0.5)) / (uCardPx * px);
  }
`;

export const PANEL_VERT = /* glsl */ `
  ${PANEL}
  uniform vec4 uTopBox;
#ifdef PIECE
  ${PIECE_PLACE}
  varying vec2 vAt;      // where on the card's print it is
  varying vec3 vLook;    // its opacity, its shine, its width's sign
  varying vec3 vCardTangent;
#endif
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vTangent;
  varying vec3 vViewPos;
  void main() {
    vUv = uv;
    float th;
    vec2 along = vec2(1.0, 0.0); // the print's u, on the face
  #ifdef PIECE
    vec2 q = piece(position.xy, along);
    vec3 P = bow(vec3(q, uZ0 + uThick + ${PROUD} + aLook.x * uSize.y), th);
    vUv = aHome.xy + (position.xy + 0.5) * aHome.zw;
    vAt = onPrint(q);
    vLook = vec3(aLook.yz, sign(aLook.w));
  #elif defined(TOPPER)
    vec3 P = bow(vec3(uTopBox.xy + (position.xy + 0.5) * uTopBox.zw, uZ0 + uThick + ${PROUD}), th);
  #else
    vec3 P = bow(vec3((position.x + 0.5) * uSize.x, position.y * uSize.y, (position.z + 0.5) * uThick + uZ0), th);
  #endif
    float c = cos(th);
    float s = sin(th);
    vec3 n = vec3(normal.x * c - normal.z * s, normal.y, normal.x * s + normal.z * c);
    // the print's u runs along +x on the face toward +z, and along -x on the one toward -z
    vec3 t = vec3(along.x * c, along.y, along.x * s) * (normal.z < 0.0 ? -1.0 : 1.0);
    vec4 mv = modelViewMatrix * vec4(P, 1.0);
    vViewPos = mv.xyz;
    vNormal = normalMatrix * n;
    vTangent = normalMatrix * t;
  #ifdef PIECE
    vCardTangent = normalMatrix * vec3(c, 0.0, s);
  #endif
    gl_Position = projectionMatrix * mv;
  }
`;

// Lighting is in view space, so the studio stays put while the card turns under it. The lights
// sit close to the camera's own line, so the sway and a hover sweep their reflections across the
// foil.
export const STUDIO = /* glsl */ `
  uniform vec2 uLight; // the pointer nudges the lights a little

  float box(vec2 a, vec2 c, vec2 hs, float soft) {
    vec2 d = abs(a - c) - hs;
    return 1.0 - smoothstep(-soft, soft, max(d.x, d.y));
  }
  // a softbox up and to the left, a strip light right, a bounce card low
  float studio(vec3 r) {
    vec2 a = vec2(atan(r.x, r.z), asin(clamp(r.y, -1.0, 1.0))) - uLight;
    float e = 0.25;
    vec2 k = (a - vec2(-0.34, 0.27)) / vec2(0.26, 0.15);
    e += 2.4 * box(a, vec2(-0.34, 0.27), vec2(0.26, 0.15), 0.12) * (1.0 - 0.45 * dot(k, k));
    e += 1.9 * box(a, vec2(0.4, -0.02), vec2(0.045, 0.55), 0.06);
    e += 0.7 * box(a, vec2(0.0, -0.5), vec2(0.9, 0.06), 0.18);
    return e;
  }
`;

export const NOISE = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
               mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  vec3 spectrum(float x) {
    return 0.5 + 0.5 * cos(6.2831853 * (x + vec3(0.0, 0.33, 0.67)));
  }
`;

// Snow falling past the glass, far off: three layers of flakes, the nearer bigger and quicker, each
// drifting on its own breeze. p is a place on the card's print, in shares of its height; s is how
// thick it falls, and how far it's drifted across and fallen so far (a gust can push it about).
const SNOWFALL_AT = /* glsl */ `
  float snowfall(vec2 p, vec4 s, float t) {
    float snow = 0.0;
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float cells = 70.0 - fk * 18.0;
      vec2 q = p * cells;
      q.y += s.z * (1.4 + fk * 0.4);
      q.x += sin(q.y * 0.21 + fk * 2.0 + t * 0.6) * 0.45 - s.y * (1.0 + fk * 0.5);
      vec2 cell = floor(q);
      vec2 f = fract(q) - 0.5;
      vec2 o = (vec2(hash12(cell + 5.3 + fk), hash12(cell + 9.1 - fk)) - 0.5) * 0.55;
      float r = (0.07 + 0.07 * hash12(cell + 2.9)) * (1.0 + fk * 0.25);
      snow += step(hash12(cell + fk * 31.7), s.x) * smoothstep(r, r * 0.35, length(f - o));
    }
    return min(snow, 1.0);
  }
`;

// Where in the painting to look for a place on the card, its moving parts moved. Each turns,
// stretches and shifts about its pivot, and ripples along its length. A part moves in a soft patch
// round it, the paint round it giving a little: fully in the patch's middle (or along its spine, a
// capsule from the pivot to its tip), less toward its edge, not at all past it, so it tears nothing.
// A cut-out moves whole instead, by its outline in the lift mask's red, and the paint behind it
// slides into the gap it leaves. All in the card's height as the unit, v up.
const MOVED = /* glsl */ `
  uniform vec4 uMoveA[MOVERS]; // its pivot; how far it's turned; 1 if it's a cut-out
  uniform vec4 uMoveB[MOVERS]; // its patch: an oval's middle and radii, or a capsule's tip and radius, and -1
  uniform vec4 uMoveC[MOVERS]; // how far it's stretched, either way, and shifted
  uniform vec4 uMoveD[MOVERS]; // how soft its patch's edge is; its ripple, how far that's run, and which way it runs

  // how far into a mover's patch a place is: 0 in its middle, or on its spine, and 1 at its edge
  float patchAt(vec2 p, vec4 a, vec4 b) {
    if (b.w < 0.0) {
      vec2 ab = b.xy - a.xy;
      float h = clamp(dot(p - a.xy, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
      return length(p - a.xy - ab * h) / b.z;
    }
    return length((p - b.xy) / b.zw);
  }

  // where in the painting a place on a mover comes from, as far as w moves it
  vec2 unmove(vec2 p, vec4 a, vec4 b, vec4 c, vec4 d, float w) {
    vec2 r = p - a.xy - c.zw * w;
    float th = -a.z * w;
    float cs = cos(th);
    float sn = sin(th);
    r = vec2(r.x * cs - r.y * sn, r.x * sn + r.y * cs) / mix(vec2(1.0), c.xy, w);
    if (d.y != 0.0) {
      // a ripple out along it from the pivot, swelling toward its free end, a wave its length long
      vec2 dir = vec2(cos(d.w), sin(d.w));
      float span = b.w < 0.0 ? length(b.xy - a.xy) : max(b.z, b.w) * 1.2;
      float along = dot(r, dir) / span;
      r -= vec2(-dir.y, dir.x) * d.y * w * sin(along * 6.2831853 - d.z) * clamp(along, 0.0, 1.0);
    }
    return a.xy + r;
  }

  // how much of a cut-out's outline is at a place
  float cutAt(vec2 p, vec4 a, vec4 b, float aspect) {
    float inside = 1.0 - step(1.0, patchAt(p, a, b));
    return inside * smoothstep(0.2, 0.7, textureLod(uLift, vec2(p.x / aspect, p.y), 0.0).r);
  }

  vec2 moved(vec2 at) {
    float aspect = uCardPx.x / uCardPx.y;
    vec2 p = vec2(at.x * aspect, at.y);
    vec2 q = p;
    for (int i = 0; i < MOVERS; i++) {
      vec4 a = uMoveA[i];
      vec4 b = uMoveB[i];
      float e = patchAt(p, a, b);
      if (e >= 1.4) continue;
      vec4 c = uMoveC[i];
      vec4 d = uMoveD[i];
      if (a.w > 0.5) {
        // where it is now, and where it was: the gap it's left shows what was behind it, shifted
        vec2 from = unmove(p, a, b, c, d, 1.0);
        q += (from - p) * max(cutAt(p, a, b, aspect), cutAt(from, a, b, aspect));
      } else if (e < 1.0) {
        q += unmove(p, a, b, c, d, smoothstep(1.0, 1.0 - d.x, e)) - p;
      }
    }
    return vec2(q.x / aspect, q.y);
  }
`;

// One face of a panel (FACE 0), or the stock's cut edge (FACE 1). TINT_PRINT: the card's stamped in
// more than one foil, and each throws back its own colour, taken from the print round it. A card's
// face shows the part of its print that's the card (uMapBox); the pieces past its edges show the
// rest, cut to their outline in the print's alpha, and from behind, their bare backs.
export const PANEL_FRAG = /* glsl */ `
  uniform vec4 uMapBox;  // where the card lies on its print: its corner and size, v up
  uniform sampler2D uMap;
  uniform sampler2D uFx;
  uniform vec2 uFxTexel;
  uniform vec2 uSize;
  uniform vec3 uTint;    // what the foil throws back
  uniform vec3 uPaper;   // the stock, for its cut edge
  uniform float uRelief;
  uniform float uTooth;  // paper fibre, for the faces drawn here; the renders have their own
  uniform float uShade;  // how much light gets in: the cover shades the inside as it shuts
  uniform vec3 uLamp;    // the lamp that follows the pointer, view space
  uniform float uLampOn;
  uniform float uDim;
#ifdef LIVE
  uniform sampler2D uLift;
  uniform float uTime;
  uniform float uLive;   // how much of its life shows: none once the cover's turned away
  uniform vec2 uCardPx;
#endif
#ifdef SNOWFALL
  uniform vec4 uSnow;    // how thick the snow falls behind the glass, how far it's drifted and fallen
#endif
#ifdef GLOWS
  // each light, as it is this moment: where it is on the card's print (v up), and its core's
  // radius and its light's reach, as shares of the print's height; its colour, and how many rays
  // it throws; how hard it rakes the paint round it, its halo, how bright what's painted as giving
  // its light comes up, and how much that twinkles; how much it warms the picture, its rays, and
  // how far they've turned
  uniform vec4 uGlowAt[GLOWS];
  uniform vec4 uGlowCol[GLOWS];
  uniform vec4 uGlowLight[GLOWS];
  uniform vec4 uGlowWarm[GLOWS];
#endif
#ifdef PIECE
  varying vec2 vAt;
  varying vec3 vLook;
  varying vec3 vCardTangent;
#endif
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vTangent;
  varying vec3 vViewPos;
  ${STUDIO}
  ${NOISE}
#ifdef SNOWFALL
  ${SNOWFALL_AT}
#endif
#ifdef MOVERS
  ${MOVED}
#endif

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(-vViewPos);
    vec3 L = normalize(vec3(-0.45 + uLight.x, 0.55 + uLight.y, 0.7));
  #if FACE == 1
    vec3 edge = uPaper * (0.5 + 0.42 * max(dot(N, L), 0.0) + 0.1 * max(dot(N, V), 0.0));
    gl_FragColor = vec4(mix(vec3(1.0), edge * uShade, uDim), 1.0);
  #else
  #ifdef PIECE
    // a piece of a print, cut to its outline in the lift mask's red, and only where it's over the card
    vec2 uv = vUv;
    vec2 at = vAt;
    vec4 lift = texture2D(uLift, uv);
    vec2 over = step(uMapBox.xy, at) * step(at, uMapBox.xy + uMapBox.zw);
    float cover = lift.r * vLook.x * uLive * over.x * over.y;
    if (cover < 0.004) discard;
  #elif defined(TOPPER)
    vec2 uv = vUv;
    vec2 on = step(uMapBox.xy + uFxTexel, uv) * step(uv, uMapBox.xy + uMapBox.zw - uFxTexel);
    float a = texture2D(uMap, uv).a;
    // kept to about a pixel at the outline, for the multisampling to smooth (alpha to coverage)
    float cover = clamp((a - 0.5) / max(fwidth(a), 1e-3) + 0.5, 0.0, 1.0) * (1.0 - on.x * on.y);
    if (cover < 0.01) discard;
    if (!gl_FrontFacing) {
      // once the card's open, the pieces' backs stand out past the cover's edges: bare stock, and
      // in the cover's shade
      vec3 Nk = -N;
      float lit = 0.6 + 0.25 * max(dot(Nk, L), 0.0) + 0.08 * max(dot(Nk, V), 0.0);
      gl_FragColor = vec4(mix(vec3(1.0), uPaper * lit, uDim), cover);
      return;
    }
  #else
    vec2 uv = uMapBox.xy + vUv * uMapBox.zw;
    float cover = 1.0;
  #endif
  #if defined(LIVE) && !defined(PIECE)
    // where this is on the card (the lights and the snow behind glass stay put), and where in the
    // painting to look for it, its moving parts moved
    vec2 at = uv;
  #ifdef MOVERS
    uv = moved(at);
  #endif
    vec4 lift = texture2D(uLift, uv);
  #endif
    vec3 base = texture2D(uMap, uv).rgb;
    vec3 fx = texture2D(uFx, uv).rgb;
    float foil = fx.r;

    // the stamp's relief, the paper's tooth, and the foil's own fine crinkle
    vec3 T = normalize(vTangent);
    vec3 B = normalize(cross(N, T));
  #ifdef PIECE
    B *= vLook.z; // a piece turned over runs its print the other way
    vec3 Tc = normalize(vCardTangent);
    vec3 Bc = normalize(cross(N, Tc));
  #else
    vec3 Tc = T;
    vec3 Bc = B;
  #endif
    // the paper's grain is the card's, so it runs on unbroken into the pieces past its edges
    vec2 q = (uv - uMapBox.xy) / uMapBox.zw * uSize / max(uSize.x, uSize.y);
    vec2 tooth = vec2(noise(q * vec2(420.0, 160.0)), noise(q * vec2(160.0, 420.0) + 7.3)) - 0.5;
    vec2 crinkle = vec2(noise(q * 180.0), noise(q * 180.0 + 11.1)) - 0.5;
  #ifdef PAINT
    // Impasto: a ridge of paint is lit on one side and shaded on the other, so the way the print's
    // light and dark run across a stroke stands in for its slope. fx.b says how much relief there is.
    float pearl = 0.0;
    float gloss = fx.g;
    vec3 Y = vec3(0.299, 0.587, 0.114);
    float hx = dot(texture2D(uMap, uv + vec2(uFxTexel.x, 0.0)).rgb - texture2D(uMap, uv - vec2(uFxTexel.x, 0.0)).rgb, Y);
    float hy = dot(texture2D(uMap, uv + vec2(0.0, uFxTexel.y)).rgb - texture2D(uMap, uv - vec2(0.0, uFxTexel.y)).rgb, Y);
    vec2 bump = vec2(hx, hy) * uRelief * fx.b + tooth * 0.08 * uTooth + crinkle * 0.3 * foil;
  #else
    float pearl = fx.g;
    float gloss = 0.0;
    float hx = texture2D(uFx, uv + vec2(uFxTexel.x, 0.0)).b - texture2D(uFx, uv - vec2(uFxTexel.x, 0.0)).b;
    float hy = texture2D(uFx, uv + vec2(0.0, uFxTexel.y)).b - texture2D(uFx, uv - vec2(0.0, uFxTexel.y)).b;
    vec2 bump = vec2(hx, hy) * uRelief + tooth * 0.08 * (1.0 - foil) + crinkle * 0.3 * foil;
  #endif
    vec3 Nb = normalize(N - T * bump.x - B * bump.y);
    base *= 1.0 + uTooth * 0.06 * (noise(q * vec2(700.0, 260.0)) - 0.5);

    float ndl = max(dot(Nb, L), 0.0);
    float caught = smoothstep(0.35, 2.4, studio(reflect(-V, Nb)));
    vec3 Lp = normalize(uLamp - vViewPos);
    float nh = max(dot(Nb, normalize(Lp + V)), 0.0);
    float hot = pow(nh, 220.0) * uLampOn;
    float glow = pow(nh, 28.0) * uLampOn;

    // the paper: matte stock under a soft key, with a breath of sheen where the lamp is
    vec3 paper = base * (0.8 + 0.26 * ndl) + glow * 0.03;
  #ifdef PAINT
    // wet paint: a tight white glint off each ridge that faces the lamp, and the studio faint in it
    paper += gloss * (vec3(1.0, 0.98, 0.94) * (hot * 0.8 + pow(nh, 90.0) * uLampOn * 0.12 + glow * 0.025) + 0.03 * caught * caught);
  #endif

    // The foil is a mirror: what it shows is the studio and the lamp. The print already has the
    // foil's colour and the shading of its emboss in it, so that sits low where the foil reflects
    // nothing bright and comes up, shading and all, where it catches a light; where it looks
    // straight back at one it flashes white-hot in the foil's own colour.
  #ifdef TINT_PRINT
    vec3 near = texture2D(uMap, uv, 3.0).rgb;
    vec3 tint = mix(near / max(max(near.r, near.g), max(near.b, 0.05)), vec3(1.0), 0.2);
  #else
    vec3 tint = uTint;
  #endif
    vec3 metal = base * (mix(0.42, 1.0, caught) + glow * 0.95) + tint * (0.6 * pow(caught, 3.0) + hot * 2.4);

    // the pearl ink: a satin sheen, with a faint shift of colour as it turns
    float phase = dot(Nb.xy, vec2(1.7, 1.1)) * 1.4 + dot(V.xy, vec2(0.9, -0.6)) + uv.y * 0.8;
    vec3 satin = mix(vec3(1.0), spectrum(phase), 0.35) * (hot * 0.7 + glow * 0.22 + 0.12 * caught);

    vec3 col = (mix(paper, metal, foil) + satin * pearl) * uShade;
  #ifdef PIECE
    // a piece that twinkles (a star) comes up bright enough to bloom
    col += base * vLook.y * 1.6;
  #endif
  #ifdef SNOWFALL
    float snow = snowfall(at * vec2(uCardPx.x / uCardPx.y, 1.0), uSnow, uTime) * lift.b * uLive;
    col = mix(col, vec3(0.93, 0.95, 1.0) * (0.86 + 0.2 * ndl), snow * 0.85);
  #endif
  #ifdef GLOWS
    vec3 lit = vec3(0.0);
    vec3 warm = vec3(0.0);
    vec2 aspect = vec2(uCardPx.x / uCardPx.y * uMapBox.z / uMapBox.w, 1.0);
    for (int i = 0; i < GLOWS; i++) {
      vec4 g = uGlowAt[i];
      vec4 c = uGlowCol[i];
      vec4 on = uGlowLight[i];
      vec4 sky = uGlowWarm[i];
      vec2 d = (at - g.xy) * aspect;
      float r = length(d);
      float fall = 1.0 / (1.0 + r * r / (g.w * g.w));
      // its light, from just above the paint, rakes across the strokes round it and glints in
      // what's wet or gilt
      vec3 Lg = normalize(-Tc * d.x - Bc * d.y + N * g.z * 1.5);
      float rake = max(dot(Nb, Lg), 0.0);
      float sheen = pow(max(dot(Nb, normalize(Lg + V)), 0.0), 36.0);
      lit += c.rgb * on.x * fall * (base * rake * 0.45 + (gloss + foil) * sheen * 0.4);
      // what's painted as giving its light (the flame, the lit glass) comes up bright enough to
      // bloom; a twinkle sets each lit window going on its own
      float flick = mix(1.0, 0.35 + 1.3 * noise(at * 46.0 + vec2(uTime * 0.35, -uTime * 0.2)), on.w);
      lit += c.rgb * on.z * lift.g * flick * smoothstep(g.w, g.w * 0.25, r) * (0.5 + 1.2 * base);
      // a soft halo round it, laid on with the warmth so it goes gold, not blank white
      warm += c.rgb * on.y * exp(-r * r / (g.z * g.z * 5.0));
      // its rays: shafts of light out across the picture, with gaps between, turning slowly
      if (c.a > 0.5) {
        float a = atan(d.y, d.x);
        float beams = pow(0.5 + 0.5 * cos(a * c.a + sky.z), 24.0)
          + 0.5 * pow(0.5 + 0.5 * cos(a * (c.a + 3.0) - sky.z * 1.7 + 1.3), 40.0);
        warm += c.rgb * sky.y * beams * smoothstep(g.z * 0.6, g.z * 2.2, r) * exp(-1.3 * r / g.w);
      }
      // and it warms the whole picture, a little rosier than the light itself, the way a low sun
      // turns a blue sky pink
      warm += mix(c.rgb, vec3(1.0, 0.66, 0.6), 0.45) * sky.x * fall;
    }
    col += lit * uLive;
    // the warmth goes on as a screen: it lifts the darks and leaves the lights
    col += clamp(warm * uLive, 0.0, 1.0) * (1.0 - min(col, vec3(1.0)));
  #endif
    gl_FragColor = vec4(mix(vec3(1.0), col, uDim), cover);
  #endif
  }
`;

// Each panel throws two soft shadows onto a white backdrop behind it: one cast by the key light,
// falling below it, and a faint one straight back along the view, which rings the card so its
// edge still reads against the white page. Both are the panel itself, swung and bowed as it is,
// projected onto the backdrop, so they soften and fade as it lifts away. The cover's take in the
// pieces stuck on it (TOPPER): their outline, blurred by reading the mips of a small copy of them
// with a clear margin round it.
export const SHADOW_VERT = /* glsl */ `
  ${PANEL}
  uniform vec4 uRect;     // what's casting it, on the panel: its corner and size
  uniform float uPad;     // room round the panel for the shadow to soften into
  uniform float uFromEye; // 0: cast along the key light, 1: along the view ray
  varying vec2 vLocal;
  varying float vLift;
  const vec3 LIGHT = vec3(0.05, -0.16, -1.0); // the way the key light travels
  const float BACKDROP = -1.2;
  void main() {
    vec3 p = vec3(uRect.xy - uPad + (position.xy + 0.5) * (uRect.zw + 2.0 * uPad), uZ0);
    vLocal = p.xy;
    float th;
    vec4 world = modelMatrix * vec4(bow(p, th), 1.0);
    vLift = world.z - BACKDROP;
    vec3 dir = mix(LIGHT, world.xyz - cameraPosition, uFromEye);
    vec3 hit = world.xyz + dir * (vLift / -dir.z);
    gl_Position = projectionMatrix * viewMatrix * vec4(hit, 1.0);
  }
`;

export const SHADOW_FRAG = /* glsl */ `
  uniform vec2 uSize;
  uniform float uStrength;
  uniform float uDim;
  uniform vec4 uRect;
  uniform sampler2D uPieces;
  uniform vec4 uPiecesBox; // where the print lies in that copy, as shares of it
  varying vec2 vLocal;
  varying float vLift;
  float soft(vec2 d, float r) {
    vec2 s = 1.0 - smoothstep(-r, r, d);
    return s.x * s.y;
  }
  float pieces(vec2 at, float r) {
    float texel = uRect.w / (uPiecesBox.w * float(textureSize(uPieces, 0).y));
    vec2 q = at * 2.0 - 1.0;
    return textureLod(uPieces, at, log2(max(1.0, 2.0 * r / texel))).a * step(max(abs(q.x), abs(q.y)), 1.0);
  }
  void main() {
    vec2 d = abs(vLocal - vec2(uSize.x * 0.5, 0.0)) - uSize * 0.5;
    float blur = 0.025 + 0.07 * max(vLift - 1.1, 0.0);
    float a = min(1.0, soft(d, blur) * 0.55 + soft(d, blur * 4.0 + 0.04) * 0.6);
  #ifdef TOPPER
    vec2 at = uPiecesBox.xy + (vLocal - uRect.xy) / uRect.zw * uPiecesBox.zw;
    a = max(a, min(1.0, pieces(at, blur) * 0.55 + pieces(at, blur * 4.0 + 0.04) * 0.6));
  #endif
    float strength = uStrength * min(1.8, pow(1.2 / max(vLift, 0.2), 1.5));
    gl_FragColor = vec4(0.05, 0.05, 0.08, a * strength * uDim);
  }
`;

// The shadow a piece standing off the cover throws on its face: its own outline, blurred more the
// higher it stands (by reading further down the lift mask's mips), and pushed away from the key
// light, which the pointer nudges, so the shadows swing a little as it moves. Each piece's box
// keeps a clear margin, so the blur is all its own.
export const PIECE_SHADOW_VERT = /* glsl */ `
  ${PANEL}
  ${PIECE_PLACE}
  uniform vec2 uLight;
  varying vec2 vUv;
  varying vec4 vBox;
  varying vec2 vAt;
  varying float vLod;
  varying float vOpacity;
  void main() {
    vec2 along;
    vec2 q = piece(position.xy, along);
    float lift = aLook.x * uSize.y;
    // cast away from the key light (up and to the left), and further for a higher piece
    vec2 away = vec2(0.64 - uLight.x * 1.6, -0.79 - uLight.y * 1.6) * lift;
    float th;
    vec3 P = bow(vec3(q + away, uZ0 + uThick + ${PROUD * 0.5}), th);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(P, 1.0);
    vUv = aHome.xy + (position.xy + 0.5) * aHome.zw;
    vBox = vec4(aHome.xy, aHome.xy + aHome.zw);
    vAt = onPrint(q + away);
    // blurred by about a third of its height off the face, in texels of the print it's cut from
    // (one of which covers aAt.z of the card's pixels)
    vec2 px = uSize / (uMapBox.zw * uCardPx);
    float blur = (0.0015 * uSize.y + lift * 0.22) / (px.y * aAt.z);
    vLod = clamp(log2(max(blur * 0.7, 1.0)), 0.0, 3.0);
    vOpacity = aLook.y;
  }
`;

export const PIECE_SHADOW_FRAG = /* glsl */ `
  uniform sampler2D uLift;
  uniform vec4 uMapBox;
  uniform float uStrength;
  uniform float uDim;
  uniform float uLive;
  varying vec2 vUv;
  varying vec4 vBox;
  varying vec2 vAt;
  varying float vLod;
  varying float vOpacity;
  void main() {
    // faded out toward the box's edge, so a wide blur never shows where it's cut off
    vec2 e = min(vUv - vBox.xy, vBox.zw - vUv) / (vBox.zw - vBox.xy);
    vec2 over = step(uMapBox.xy, vAt) * step(vAt, uMapBox.xy + uMapBox.zw);
    float a = textureLod(uLift, vUv, vLod).r * smoothstep(0.0, 0.12, min(e.x, e.y)) * over.x * over.y;
    a *= uStrength * vOpacity * uDim * uLive;
    if (a < 0.002) discard;
    gl_FragColor = vec4(0.06, 0.05, 0.07, a);
  }
`;

// A glint: a point of light over the cover (a star twinkling, a firefly, a spark off a flame), as
// a soft core and halo with, as much as aShape.x says, the four long points of a star; or a
// shooting star, a bright head on a long thin tail behind it, along its turn. Added on, bright
// enough to bloom.
export const GLINT_VERT = /* glsl */ `
  ${PANEL}
  uniform vec4 uMapBox;
  uniform vec2 uCardPx;
  attribute vec4 aAt;    // where (u, v up, on the card's print); its size, as a share of the card's height; its turn
  attribute vec4 aGlint; // its colour, and how bright it is
  attribute vec4 aShape; // its points; how far it stands off the face, as a share of the card's height; how soft it is; 1 for a shooting star
  varying vec2 vC;
  varying vec4 vGlint;
  varying vec3 vShape;
  void main() {
    vec2 px = uSize / (uMapBox.zw * uCardPx);
    float cs = cos(aAt.w);
    float sn = sin(aAt.w);
    vec2 o = position.xy * aAt.z * uSize.y;
    o = vec2(o.x * cs - o.y * sn, o.x * sn + o.y * cs);
    vec2 mid = (aAt.xy - uMapBox.xy) * uCardPx * px - vec2(0.0, uSize.y * 0.5);
    float th;
    vec3 P = bow(vec3(mid + o, uZ0 + uThick + ${PROUD * 2} + aShape.y * uSize.y), th);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(P, 1.0);
    vC = position.xy * 2.0;
    vGlint = aGlint;
    vShape = aShape.xzw;
  }
`;

export const GLINT_FRAG = /* glsl */ `
  uniform float uDim;
  uniform float uLive;
  varying vec2 vC;
  varying vec4 vGlint;
  varying vec3 vShape; // its points, how soft it is (a firefly's glow, not a star's spark), a shooting star
  void main() {
    float k = vGlint.a * uDim * uLive;
    if (k < 0.002) discard;
    float r2 = dot(vC, vC);
    vec2 a = abs(vC);
    float points = (exp(-a.y * 46.0) * (1.0 - a.x) + exp(-a.x * 46.0) * (1.0 - a.y)) * vShape.x;
    float light = exp(-r2 * mix(30.0, 7.0, vShape.y)) * 1.3 + exp(-r2 * 9.0) * 0.12 + points * 0.8;
    if (vShape.z > 0.5) {
      float x = vC.x - 0.8;
      float head = exp(-(x * x * 90.0 + vC.y * vC.y * 400.0)) * 2.2;
      float tail = smoothstep(-1.0, 0.8, vC.x) * step(vC.x, 0.8) * exp(-vC.y * vC.y * 900.0);
      light = head + tail * tail;
    }
    gl_FragColor = vec4(vGlint.rgb * light * k * (1.0 - smoothstep(0.85, 1.0, max(a.x, a.y))), 1.0);
  }
`;

// Film grain, laid on last; it stays off the pure white backdrop and the deepest blacks.
export const GRAIN = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAmount: { value: 0.03 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAmount;
    varying vec2 vUv;
    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      float n = hash12(gl_FragCoord.xy + fract(uTime * 7.13) * 917.0) - 0.5;
      c.rgb += n * uAmount * smoothstep(0.02, 0.3, l) * (1.0 - smoothstep(0.85, 1.0, l));
      gl_FragColor = c;
    }
  `,
};
