#!/usr/bin/env python3
"""Shows which parts of the picture turn to foil, worked out the way the card works it out, so the
foil can be judged and tuned before building: is it the lettering and lines, stamped in clean
shapes, or a speckle over everything?

    python foil_preview.py card.json                          # the card's own foil settings
    python foil_preview.py card.json --amount 0.08,0.12,0.2   # side by side, to compare amounts
    python foil_preview.py card.json --on colour --pick-at 457,320 --amount 0.2,0.3,0.4
    python foil_preview.py card.json --area 180,160,560,360   # foil only in this box
    python foil_preview.py card.json --zoom 180,160,560,360   # a region, enlarged
    python foil_preview.py front.jpg --on darks               # a picture, without card data yet

Writes a PNG (default: next to the card data, <name>-foil.png) with the foil in magenta over the
faded picture, one panel per amount, and prints how much of the card is foil and in how many
pieces. Options given here override the card data's own, so you can try settings first and then
copy the ones you like into the JSON.

Needs Pillow and numpy (scipy makes it faster, but isn't needed).
"""

import argparse
import base64
import io
import json
import os
import sys

sys.dont_write_bytecode = True  # leave no __pycache__ in the skill's folder
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_card import (  # noqa: E402
    FINISHES, FOIL_ON, FOILS, MAX_SIDE, SHAPES, CardError, card_size, cut_box, js_round, picture,
)

try:
    import numpy as np
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit('error: foil_preview.py needs numpy and Pillow (pip install numpy pillow)')

AMOUNT = {'details': 0.12, 'darks': 0.15, 'colour': 0.3}  # the renderer's defaults (page.js)
SHOW = np.array([214, 0, 120], np.float32)  # the foil, shown in magenta to stand out from any picture


# --- the picture, as the page has it ------------------------------------------------------------


def cover_of(path, shape):
    """The picture as the page embeds it (shrunk, JPEG), cut to the card: an RGB array, float32."""
    url, _ = picture(path, MAX_SIDE)
    im = Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1]))).convert('RGB')
    iw, ih = im.size
    w, h = card_size(iw, ih, shape)
    x, y, sw, sh = cut_box(iw, ih, shape)
    card = im.resize((w, h), Image.LANCZOS, box=(x, y, x + sw, y + sh))
    return np.asarray(card, np.float32)


# --- the filters the renderer uses (studio.js), on whole arrays -----------------------------------


def _box(a, r, axis):
    pad = [(0, 0), (0, 0)]
    pad[axis] = (r, r)
    c = np.cumsum(np.pad(a, pad, mode='edge'), axis=axis, dtype=np.float64)
    c = np.concatenate([np.zeros_like(c.take([0], axis=axis)), c], axis=axis)
    n = a.shape[axis]
    hi = c.take(np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
    lo = c.take(np.arange(0, n), axis=axis)
    return ((hi - lo) / (2 * r + 1)).astype(np.float32)


def blur(a, r, passes=3):
    """A box blur run `passes` times, the edges holding their value."""
    for _ in range(passes):
        a = _box(_box(a, r, 1), r, 0)
    return a


def rank(a, pick):
    """The least (np.minimum) or most (np.maximum) in each 3 x 3."""
    p = np.pad(a, ((0, 0), (1, 1)), mode='edge')
    a = pick(pick(p[:, :-2], p[:, 1:-1]), p[:, 2:])
    p = np.pad(a, ((1, 1), (0, 0)), mode='edge')
    return pick(pick(p[:-2], p[1:-1]), p[2:])


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def oklab(rgb):
    c = rgb / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    r, g, b = lin[..., 0], lin[..., 1], lin[..., 2]
    l = np.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    m = np.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    s = np.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    return np.stack([
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ], -1)


def labels(mask):
    """Pieces of the mask joined at their sides or corners: (label per pixel, -1 off it; sizes)."""
    try:
        from scipy import ndimage

        lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
        return lab - 1, np.bincount(lab.ravel(), minlength=n + 1)[1:]
    except ImportError:
        pass
    # without scipy: join the runs of each row to the runs they touch in the row above
    parent = []

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    runs = []
    above = []
    for y in range(mask.shape[0]):
        row = np.concatenate([[False], mask[y], [False]])
        edges = np.flatnonzero(row[1:] != row[:-1])
        here = []
        for x0, x1 in zip(edges[::2], edges[1::2]):
            k = len(parent)
            parent.append(k)
            for ax0, ax1, j in above:
                if ax0 <= x1 and x0 <= ax1:  # touching, corners included
                    ra, rb = find(j), find(k)
                    if ra != rb:
                        parent[rb] = ra
            here.append((x0, x1, k))
            runs.append((y, x0, x1, k))
        above = here
    lab = np.full(mask.shape, -1, np.int64)
    roots = {}
    for y, x0, x1, k in runs:
        lab[y, x0:x1] = roots.setdefault(find(k), len(roots))
    sizes = np.bincount(lab[lab >= 0], minlength=len(roots))
    return lab, sizes


# --- the foil (studio.js scoreOf and maskOf) ------------------------------------------------------


def score_of(px, lum, mode, pick):
    h, w = lum.shape
    if mode == 'details':
        fine = blur(lum, 2, 2)
        around = blur(lum, max(2, round(max(w, h) * 0.009)))
        return np.maximum(0, around - fine)
    if mode == 'darks':
        return 1 - blur(lum, max(2, round(max(w, h) * 0.004)), 3)
    near = oklab(np.asarray(pick, np.float32)[None, None, :])[0, 0]
    s = 1 - np.sqrt(((oklab(px) - near) ** 2).sum(-1))
    return blur(s.astype(np.float32), 1, 1)


def quantile(s, share, within=None):
    """The score above which `share` of the picture lies (of the part `within`, if given)."""
    s = s[within] if within is not None else s.ravel()
    top = max(1e-6, float(s.max())) if s.size else 1e-6
    bins = np.minimum(2047, np.floor(np.maximum(0, s) / top * 2047).astype(np.int64))
    over = np.cumsum(np.bincount(bins, minlength=2048)[::-1])
    hit = np.flatnonzero(over >= share * s.size)
    return ((2047 - hit[0]) / 2047 * top if len(hit) else 0.0), top


def area_of(w, h, boxes):
    """True inside any of the boxes ([x, y, w, h] in card pixels)."""
    within = np.zeros((h, w), bool)
    for bx, by, bw, bh in boxes:
        x0, y0 = max(0, js_round(bx)), max(0, js_round(by))
        x1, y1 = min(w, js_round(bx + bw)), min(h, js_round(by + bh))
        within[y0:max(y0, y1), x0:max(x0, x1)] = True
    return within


def rim_of(w, h):
    """The fine double rule a foil border stamps round the edge."""
    im = Image.new('L', (w, h), 0)
    g = ImageDraw.Draw(im)
    s = min(w, h)
    inset, lw = s * 0.045, s * 0.0075
    in2 = inset + lw * 2.4
    for at, width in ((inset, lw), (in2, lw * 0.4)):
        half = width / 2
        g.rectangle([at - half, at - half, w - at + half, h - at + half], outline=255, width=max(1, round(width)))
    return np.asarray(im, np.float32) / 255


def mask_of(px, mode, amount, pick, border, area=None):
    h, w = px.shape[:2]
    lum = (0.299 * px[..., 0] + 0.587 * px[..., 1] + 0.114 * px[..., 2]) / 255
    within = area_of(w, h, area) if area else None
    if mode == 'none' or (mode == 'colour' and pick is None):
        foil = np.zeros((h, w), np.float32)
    else:
        s = score_of(px, lum, mode, pick)
        if mode == 'colour':
            near = 1 - (0.03 + amount * 0.32)
            foil = smoothstep(near - 0.025, near + 0.025, s)
        else:
            at, top = quantile(s, amount, within)
            faint = 0.07 * max(0, 1 - amount / 0.4) if mode == 'details' else 0
            cut = max(at, top * 0.03, faint)
            soft = cut * 0.04 + top * 0.002
            foil = smoothstep(cut - soft, cut + soft, s)
        if within is not None:
            foil = np.where(within, foil, 0).astype(np.float32)
        foil = rank(rank(foil, np.minimum), np.maximum)
        lab, sizes = labels(foil >= 0.5)
        big = sizes >= w * h * 0.00012
        kept = np.zeros(foil.shape, np.float32)
        kept[lab >= 0] = big[lab[lab >= 0]]
        keep = rank(rank(kept, np.maximum), np.maximum) > 0  # and the soft rim round what stays
        foil = blur(np.where(keep, foil, 0).astype(np.float32), 1, 1)
    if border:
        foil = np.maximum(foil, rim_of(w, h))
    return foil


# --- the card's settings ------------------------------------------------------------------------


def settings_of(args):
    """(picture path, shape, finish, foil spec) from the card data or the picture, with overrides."""
    if args.source.lower().endswith('.json'):
        with open(args.source, encoding='utf-8') as f:
            config = json.load(f)
        cards = config.get('cards') or [config]
        if not 1 <= args.card <= len(cards):
            sys.exit(f'error: there are {len(cards)} cards; --card {args.card} is not one of them')
        card = cards[args.card - 1]
        if not card.get('image'):
            sys.exit(f'error: card {args.card} has no "image"')
        base = os.path.dirname(os.path.abspath(args.source))
        image = card['image'] if os.path.isabs(card['image']) else os.path.join(base, card['image'])
    else:
        card, image = {}, args.source
    finish = card.get('finish', 'foil')
    f = card.get('foil')
    spec = {'on': 'none'} if f is False or f == 'none' else {'colour': f} if isinstance(f, str) else dict(f or {})
    if args.on:
        spec['on'] = args.on
    if args.pick:
        spec['pick'] = [int(float(v)) for v in args.pick.split(',')]
        spec.pop('pickAt', None)
    if args.pick_at:
        spec['pickAt'] = [int(float(v)) for v in args.pick_at.split(',')]
        spec.pop('pick', None)
    if args.border:
        spec['border'] = True
    if args.area:
        spec['area'] = [[int(float(v)) for v in box.split(',')] for box in args.area.split(';') if box.strip()]
    spec.setdefault('on', 'details' if finish == 'foil' else 'none')
    if spec['on'] == 'color':
        spec['on'] = 'colour'
    if 'color' in spec:
        spec.setdefault('colour', spec.pop('color'))
    return image, args.shape or card.get('shape', 'portrait'), finish, spec


def main(argv=None):
    ap = argparse.ArgumentParser(description='Show which parts of the picture turn to foil.')
    ap.add_argument('source', help='the card data (JSON), or a picture')
    ap.add_argument('--card', type=int, default=1, help='which card, with several (1 is the first)')
    ap.add_argument('--amount', help='one amount, or several to compare: 0.08,0.12,0.2')
    ap.add_argument('--on', choices=FOIL_ON, help='what turns to foil, instead of the card data\'s')
    ap.add_argument('--pick', help='r,g,b: the colour for --on colour')
    ap.add_argument('--pick-at', help='x,y: where to take the colour for --on colour, in card pixels')
    ap.add_argument('--border', action='store_true', help='add the foil border')
    ap.add_argument('--area', help='x,y,w,h: keep the foil to this box (several: x,y,w,h;x,y,w,h)')
    ap.add_argument('--shape', choices=list(SHAPES), help="the card's shape, instead of the card data's")
    ap.add_argument('--zoom', help='x,y,w,h: just this region of the card, enlarged')
    ap.add_argument('-o', '--out', help='the PNG to write (default: <card data or picture>-foil.png)')
    args = ap.parse_args(argv)

    image, shape, finish, spec = settings_of(args)
    if shape not in SHAPES:
        sys.exit(f'error: shape must be one of {", ".join(SHAPES)}')
    if finish not in FINISHES:
        sys.exit(f'error: finish must be one of {", ".join(FINISHES)}')
    on = spec['on']
    if on not in FOIL_ON:
        sys.exit(f'error: foil.on must be one of {", ".join(FOIL_ON)}')
    try:
        px = cover_of(image, shape)
    except CardError as err:
        sys.exit(f'error: {err}')
    h, w = px.shape[:2]
    area = spec.get('area')
    if area and isinstance(area[0], (int, float)):
        area = [area]
    if area and not all(isinstance(b, list) and len(b) == 4 for b in area):
        sys.exit('error: foil.area is a box [x, y, w, h], or a list of them')

    pick = spec.get('pick')
    if on == 'colour' and not pick:
        if not spec.get('pickAt'):
            sys.exit('error: foil.on "colour" needs the colour: --pick r,g,b or --pick-at x,y')
        x, y = spec['pickAt']
        if not (0 <= x < w and 0 <= y < h):
            sys.exit(f'error: pickAt {x},{y} is off the card, which is {w} x {h}')
        near = px[max(0, y - 3):y + 4, max(0, x - 3):x + 4].reshape(-1, 3)
        pick = [int(v) for v in np.floor(near.mean(0) + 0.5)]
    if args.amount:
        amounts = [float(v) for v in args.amount.split(',') if v.strip()]
    else:
        amounts = [spec.get('amount', AMOUNT.get(on, 0.12))]
    colour = spec.get('colour', 'gold')
    colour = colour if isinstance(colour, str) else (colour.get('name') or 'its own colour')
    if isinstance(colour, str) and colour not in FOILS and not isinstance(spec.get('colour'), dict):
        print(f'warning: {colour!r} is not a foil colour ({", ".join(FOILS)})', file=sys.stderr)

    box = (0, 0, w, h)
    if args.zoom:
        zx, zy, zw, zh = (int(float(v)) for v in args.zoom.split(','))
        zx, zy = max(0, zx), max(0, zy)
        box = (zx, zy, max(1, min(w - zx, zw)), max(1, min(h - zy, zh)))
    bx, by, bw, bh = box
    # the panels fit about 2000 pixels across between them, enlarged up to 4 times for a zoom
    scale = min(4.0, 2000 / (bw * len(amounts)), 1300 / bh)
    if not args.zoom:
        scale = min(scale, 1.0)
    pw, ph = max(1, round(bw * scale)), max(1, round(bh * scale))
    head = 34
    sheet = Image.new('RGB', (pw * len(amounts) + 12 * (len(amounts) - 1), ph + head), 'white')
    draw = ImageDraw.Draw(sheet)

    what = {'details': 'lines and dark detail', 'darks': 'the darkest shapes', 'none': 'no foil'}
    print(f'card {args.card}: {w} x {h} pixels, {finish} finish, {colour} foil on '
          + (f'the colour {pick}' if on == 'colour' else what[on])
          + (', with a border' if spec.get('border') else '')
          + (f', kept to {len(area)} box' + ('es' if len(area) > 1 else '') if area else ''))
    for n, amount in enumerate(amounts):
        if on in ('details', 'darks', 'colour') and not 0 < amount <= 1:
            sys.exit(f'error: an amount is a share between 0 and 1, not {amount}')
        foil = mask_of(px, on, amount, pick, bool(spec.get('border')), area)
        lab, sizes = labels(foil >= 0.5)
        share = float(foil.mean())
        side = round((w * h * 0.0006) ** 0.5)
        small = int((sizes < side * side).sum())
        biggest = sorted(sizes.tolist(), reverse=True)[:3]
        label = f'{on} {amount:g}' if on != 'none' else 'border'
        print(f'  {label}: {share:.1%} of the card is foil, in {len(sizes)} pieces'
              + (f' ({small} of them smaller than {side} x {side} px)' if small else '')
              + (f'; the biggest {", ".join(f"{b / (w * h):.1%}" for b in biggest)}' if biggest else ''))
        view = px * 0.32 + 255 * 0.68
        view = view * (1 - foil[..., None]) + SHOW * foil[..., None]
        for ax, ay, aw, ah in area or []:  # the boxes, dotted
            x0, y0 = max(0, js_round(ax)), max(0, js_round(ay))
            x1, y1 = min(w - 1, js_round(ax + aw) - 1), min(h - 1, js_round(ay + ah) - 1)
            for line in (view[y0, x0:x1:6], view[y1, x0:x1:6], view[y0:y1:6, x0], view[y0:y1:6, x1]):
                line[:] = (60, 60, 200)
        panel = Image.fromarray(view.clip(0, 255).astype(np.uint8)).crop((bx, by, bx + bw, by + bh))
        panel = panel.resize((pw, ph), Image.LANCZOS)
        x = n * (pw + 12)
        sheet.paste(panel, (x, head))
        draw.text((x + 6, 9), f'{label}: {share:.1%} foil, {len(sizes)} pieces', fill=(0, 0, 0))

    default = os.path.splitext(args.source)[0] + ('-foil-zoom.png' if args.zoom else '-foil.png')
    out = args.out or default
    sheet.save(out)
    print(f'wrote {out} (the foil is magenta)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
