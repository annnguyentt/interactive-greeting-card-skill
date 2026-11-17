// Draws the faces a render of the front doesn't have: the inside of the cover, the inside of
// the back, the back, and the insert laid inside with the message written on it. Each is a pair
// of canvases read the same way as the front: the print, and its masks (R foil, G pearl,
// B relief).

export const IVORY = [251, 248, 240]; // the insert's paper
const RELIEF_BASE = 20; // what bare paper reads as in the relief channel, as on the fronts
const PEN = 'rgba(22, 20, 26, 0.92)'; // the black the message is written in
const SMALL_PRINT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// The biggest piece in a box (anything with a > 24), grown by a pixel to keep its soft edge,
// so a neighbour that strays into the box doesn't come along cut in half.
function largestPiece(alpha, w, h) {
  const label = new Int32Array(w * h).fill(-1);
  const stack = [];
  const around = (i, visit) => {
    const x = i % w;
    const y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) visit(yy * w + xx);
      }
    }
  };
  let best = -1;
  let bestSize = 0;
  for (let i = 0, n = 0; i < alpha.length; i++) {
    if (alpha[i] < 24 || label[i] >= 0) continue;
    let size = 0;
    label[i] = n;
    stack.push(i);
    while (stack.length) {
      size++;
      around(stack.pop(), (k) => {
        if (label[k] < 0 && alpha[k] >= 24) {
          label[k] = n;
          stack.push(k);
        }
      });
    }
    if (size > bestSize) {
      bestSize = size;
      best = n;
    }
    n++;
  }
  const keep = new Uint8Array(w * h);
  for (let i = 0; i < keep.length; i++) {
    if (label[i] === best) around(i, (k) => (keep[k] = 1));
  }
  return keep;
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// the front's bare paper, from the card's top corner, where nothing's printed
function paperOf(front, [x, y] = [0, 0]) {
  const g = canvasOf(24, 24).getContext('2d', { willReadFrequently: true });
  g.drawImage(front, x + 8, y + 8, 24, 24, 0, 0, 24, 24);
  const d = g.getImageData(0, 0, 24, 24).data;
  const sum = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += d[i + c];
  return sum.map((v) => v / (d.length / 4));
}

// A box of the front lifted off the paper: the print and the masks, each with an alpha that's
// wherever there's foil or pearl (or only pearl, or, for 'art', anything printed at all, told
// from the paper by how far it is from its colour, or, for 'lift', whatever a painted card's lift
// mask cuts out there), so the paper around it stays behind.
function spriteOf(front, fx, paper, { from: [x, y, w, h], largest, use }, lift) {
  const print = canvasOf(w, h);
  const masks = canvasOf(w, h);
  const pg = print.getContext('2d', { willReadFrequently: true });
  const mg = masks.getContext('2d', { willReadFrequently: true });
  pg.drawImage(front, x, y, w, h, 0, 0, w, h);
  mg.drawImage(fx, x, y, w, h, 0, 0, w, h);
  const p = pg.getImageData(0, 0, w, h);
  const m = mg.getImageData(0, 0, w, h);
  let cut = null;
  // a card without a lift mask takes what's painted instead
  if (use === 'lift' && !lift) use = 'art';
  if (use === 'lift') {
    const lg = canvasOf(w, h).getContext('2d', { willReadFrequently: true });
    lg.drawImage(lift, x, y, w, h, 0, 0, w, h);
    cut = lg.getImageData(0, 0, w, h).data;
  }
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i++) {
    const k = i * 4;
    if (cut) {
      alpha[i] = cut[k];
    } else if (use === 'pearl') {
      alpha[i] = m.data[k + 1];
    } else {
      alpha[i] = Math.max(m.data[k], m.data[k + 1]);
      if (use === 'art') {
        const far = Math.hypot(p.data[k] - paper[0], p.data[k + 1] - paper[1], p.data[k + 2] - paper[2]);
        alpha[i] = Math.max(alpha[i], 255 * smoothstep(14, 50, far));
      }
    }
  }
  const keep = largest ? largestPiece(alpha, w, h) : null;
  for (let i = 0; i < alpha.length; i++) {
    const a = keep && !keep[i] ? 0 : alpha[i];
    p.data[i * 4 + 3] = a;
    m.data[i * 4 + 3] = a;
  }
  pg.putImageData(p, 0, 0);
  mg.putImageData(m, 0, 0);
  return { print, masks, w, h };
}

// A blank sheet: bare paper, and masks that say there's nothing on it.
function blank(w, h, paper) {
  const print = canvasOf(w, h);
  const masks = canvasOf(w, h);
  const pg = print.getContext('2d', { willReadFrequently: true });
  const mg = masks.getContext('2d', { willReadFrequently: true });
  pg.fillStyle = `rgb(${paper.join(',')})`;
  pg.fillRect(0, 0, w, h);
  mg.fillStyle = `rgb(0, 0, ${RELIEF_BASE})`;
  mg.fillRect(0, 0, w, h);
  return { print, masks, pg, mg, w, h };
}

const keyOf = (m) => [m.from.join(), m.largest, m.use].join(' ');

// lays motifs onto a sheet, placed and sized in shares of it
function place(face, sprites, motifs = []) {
  for (const m of motifs) {
    const s = sprites.get(keyOf(m));
    const w = m.width * face.w;
    const h = (w * s.h) / s.w;
    const x = m.at[0] * face.w - w / 2;
    const y = m.at[1] * face.h - h / 2;
    for (const [g, src] of [
      [face.pg, s.print],
      [face.mg, s.masks],
    ]) {
      g.save();
      g.translate(x + w / 2, y + h / 2);
      if (m.turn) g.rotate((m.turn * Math.PI) / 180);
      if (m.flip) g.scale(-1, 1);
      g.drawImage(src, -w / 2, -h / 2, w, h);
      g.restore();
    }
  }
}

// Writes the message by hand on the sheet in plain black ink: no foil and no stamp, so it's only
// on the print. Each line sits a little off level and off centre, the way a hand puts it down.
// `middle` is where the block centres, as a share of the sheet's height.
function write(sheet, lines, { font, size, middle }) {
  const leading = size * 1.18;
  const top = sheet.h * middle - ((lines.length - 1) * leading) / 2;
  const g = sheet.pg;
  g.save();
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = PEN;
  lines.forEach((line, i) => {
    // a made-up wobble, but a steady one, so the card reads the same every time
    g.save();
    g.translate(sheet.w / 2 + Math.sin(i * 1.7 + 0.6) * size * 0.12, top + i * leading);
    g.rotate(Math.sin(i * 2.3 + sheet.w) * 0.018);
    g.fillText(line, 0, 0);
    g.restore();
  });
  g.restore();
}

// A letter someone wrote, broken into lines that fit the sheet in the biggest hand that holds it
// all, and no smaller than a floor; a letter too long even then loses its end to an ellipsis.
// Their own line breaks stay.
function fitLetter(sheet, text, family, cardW) {
  const g = sheet.pg;
  const maxW = sheet.w * 0.8;
  const maxH = sheet.h * 0.82;
  const floor = cardW * 0.03;
  const paragraphs = text.replace(/\r/g, '').trim().split('\n');
  const wrap = () => {
    const lines = [];
    for (const p of paragraphs) {
      let line = '';
      for (const word of p.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (g.measureText(next).width <= maxW) {
          line = next;
          continue;
        }
        if (line) lines.push(line);
        // a word wider than the sheet breaks where it has to
        line = '';
        for (const ch of word) {
          if (g.measureText(line + ch).width > maxW && line) {
            lines.push(line);
            line = '';
          }
          line += ch;
        }
      }
      lines.push(line);
    }
    return lines;
  };
  g.save();
  let size = cardW * 0.088;
  let lines;
  for (;;) {
    g.font = `500 ${size}px ${family}`;
    lines = wrap();
    if (lines.length * size * 1.18 <= maxH || size <= floor) break;
    size = Math.max(floor, size * 0.94);
  }
  g.restore();
  const room = Math.max(1, Math.floor(maxH / (size * 1.18)));
  if (lines.length > room) lines = [...lines.slice(0, room - 1), `${lines[room - 1]}…`];
  return { lines, size };
}

// the soft shadow the insert throws on the card it lies on, drawn into the card's print round
// where it lies (the insert itself covers the rest)
function underInsert(face, def) {
  const [sw, sh] = def.insert.size;
  const g = face.pg;
  g.save();
  g.shadowColor = 'rgba(48, 36, 28, 0.3)';
  g.shadowBlur = def.w * 0.018;
  g.shadowOffsetY = def.w * 0.006;
  g.fillStyle = `rgb(${def.paper.join(',')})`;
  g.fillRect(((1 - sw) / 2) * def.w, ((1 - sh) / 2) * def.h, sw * def.w, sh * def.h);
  g.restore();
}

// A signature stamped small in the card's foil at the foot of the back: def.signature gives its
// two lines (a small capitalised one over a name in the hand), the foil's ink, whether it's
// holographic, and where it links. Returns that link, with the box the signature fills (in shares
// of the back) for the stage to take taps in.
function sign(face, def, fonts) {
  const {
    lines: [by, name],
    ink,
    holo,
    href,
  } = def.signature;
  const small = def.w * 0.017;
  const big = def.w * 0.056;
  const cx = def.w / 2;
  const yBy = def.h * 0.875 - big * 0.62;
  const yName = def.h * 0.875 + big * 0.12;
  const draw = (g, fill, soft) => {
    g.save();
    g.fillStyle = fill;
    g.shadowColor = fill;
    g.shadowBlur = soft;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `600 ${small}px ${SMALL_PRINT}`;
    g.letterSpacing = `${small * 0.32}px`;
    g.fillText(by.toUpperCase(), cx, yBy);
    const wBy = g.measureText(by.toUpperCase()).width;
    g.letterSpacing = '0px';
    g.font = `500 ${big}px ${fonts.hand}`;
    g.fillText(name, cx, yName);
    const wName = g.measureText(name).width;
    g.restore();
    return Math.max(wBy, wName);
  };
  // printed in the foil's colour, and stamped: all foil, raised well off the stock, its edge soft
  const wide = draw(face.pg, `rgb(${ink.join(',')})`, 0);
  draw(face.mg, `rgb(255, ${holo ? 215 : 0}, 150)`, def.w * 0.003);
  const pad = def.w * 0.05; // room round it for a fingertip
  return {
    href,
    box: [
      (cx - wide / 2 - pad) / def.w,
      (yBy - small - pad) / def.h,
      (cx + wide / 2 + pad) / def.w,
      (yName + big * 0.6 + pad) / def.h,
    ],
  };
}

// small print on the back, in plain ink, or pale on a dark stock
function caption(face, def, lines) {
  if (!lines.length) return;
  const g = face.pg;
  const size = def.w * 0.019;
  const [r, gr, b] = def.paper;
  g.save();
  g.font = `500 ${size}px ${SMALL_PRINT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 0.299 * r + 0.587 * gr + 0.114 * b < 110 ? 'rgba(255, 252, 246, 0.6)' : 'rgba(40, 32, 36, 0.55)';
  lines.forEach((line, i) => g.fillText(line, def.w / 2, def.h * 0.76 + i * size * 1.7));
  g.restore();
}

// def.message is the made cards' lines, as they break; def.letter, instead, is whatever someone
// wrote, fitted to the insert here. The faces are the card's own size, which is the part of the
// print that's its body if anything's printed past it. lift is a painted card's lift mask, for
// its motifs cut out by it.
export async function drawFaces(print, front, fx, fonts, lift) {
  const def = print.body ? { ...print, w: print.body[2], h: print.body[3] } : print;
  const motifs = def.motifs || {};
  try {
    await document.fonts.load(`500 ${def.w * 0.088}px ${fonts.hand}`);
  } catch {
    // the faces still draw, in whatever the browser falls back to
  }

  const paper = paperOf(front, print.body);
  const sprites = new Map();
  for (const list of Object.values(motifs)) {
    for (const m of list) {
      if (!sprites.has(keyOf(m))) sprites.set(keyOf(m), spriteOf(front, fx, paper, m, lift));
    }
  }

  const left = blank(def.w, def.h, def.paper);
  place(left, sprites, motifs.left);

  const right = blank(def.w, def.h, def.paper);
  place(right, sprites, motifs.right);
  underInsert(right, def);

  const insert = blank(Math.round(def.insert.size[0] * def.w), Math.round(def.insert.size[1] * def.h), IVORY);
  place(insert, sprites, motifs.insert);
  const { lines, size } =
    def.letter != null ? fitLetter(insert, def.letter, fonts.hand, def.w) : { lines: def.message, size: def.w * 0.088 };
  write(insert, lines, { font: `500 ${size}px ${fonts.hand}`, size, middle: def.insert.messageAt });

  const back = blank(def.w, def.h, def.paper);
  place(back, sprites, motifs.back);
  // a signed card has only the signature on its back; any other, its small print (def.back)
  const links = def.signature ? [sign(back, def, fonts)] : [];
  if (!def.signature) caption(back, def, def.back ?? []);

  const pack = ({ print, masks }) => ({ print, masks });
  return { left: pack(left), right: pack(right), back: pack(back), insert: pack(insert), links };
}
