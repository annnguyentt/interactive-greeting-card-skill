#!/usr/bin/env python3
"""Draws a labelled pixel grid over a picture, cut exactly as the card will cut it, so places on the
card can be read off it: where a light is, a tail's pivot and tip, a box round the moon. Every
coordinate in a card's "live" settings (and foil.pickAt, and inside motifs) is in these pixels.

    python grid.py front.jpg [--shape portrait] [-o grid.png]
    python grid.py front.jpg --zoom 300,700,260,240 -o zoom.png    # a region, enlarged, finer ticks
    python grid.py front.jpg --pick 452,318                         # the colour there, for foil.pick

Needs Pillow.
"""

import argparse
import os
import sys

sys.dont_write_bytecode = True  # leave no __pycache__ in the skill's folder
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_card import SHAPES, CardError, card_size, cut_box, open_upright  # noqa: E402


def cut_card(path, shape):
    try:
        from PIL import Image
    except ImportError:
        sys.exit('error: grid.py needs Pillow (pip install pillow)')
    im = open_upright(path)
    iw, ih = im.size
    w, h = card_size(iw, ih, shape)
    x, y, sw, sh = cut_box(iw, ih, shape)
    return im.resize((w, h), Image.LANCZOS, box=(x, y, x + sw, y + sh))


def ticks(draw, size, box, scale, step, label_every, colour):
    """Lines and labels for the card's pixels in `box` (x, y, w, h), drawn at `scale`."""
    bx, by, bw, bh = box
    W, H = size
    for x in range((bx // step + 1) * step if bx % step else bx, bx + bw + 1, step):
        X = (x - bx) * scale
        major = x % label_every == 0
        draw.line([(X, 0), (X, H)], fill=colour if major else colour[:3] + (90,), width=2 if major else 1)
        if major:
            draw.text((X + 3, 3), str(x), fill=(0, 0, 0, 255), stroke_width=2, stroke_fill=(255, 255, 255, 255))
    for y in range((by // step + 1) * step if by % step else by, by + bh + 1, step):
        Y = (y - by) * scale
        major = y % label_every == 0
        draw.line([(0, Y), (W, Y)], fill=colour if major else colour[:3] + (90,), width=2 if major else 1)
        if major:
            draw.text((3, Y + 3), str(y), fill=(0, 0, 0, 255), stroke_width=2, stroke_fill=(255, 255, 255, 255))


def main(argv=None):
    ap = argparse.ArgumentParser(description='A labelled pixel grid over a picture, cut as the card cuts it.')
    ap.add_argument('image')
    ap.add_argument('--shape', default='portrait', choices=list(SHAPES))
    ap.add_argument('-o', '--out', help='the grid to write (default: <picture>-grid.png)')
    ap.add_argument('--step', type=int, default=50, help='pixels between lines (labels every other line)')
    ap.add_argument('--zoom', help='x,y,w,h: just this region of the card, enlarged, with finer lines')
    ap.add_argument('--pick', help="x,y: print the card's colour there, for foil.pick")
    args = ap.parse_args(argv)

    from PIL import Image, ImageDraw

    try:
        card = cut_card(args.image, args.shape)
    except CardError as err:
        sys.exit(f'error: {err}')
    W, H = card.size

    if args.pick:
        x, y = (int(float(v)) for v in args.pick.split(','))
        if not (0 <= x < W and 0 <= y < H):
            sys.exit(f'error: {x},{y} is off the card, which is {W} x {H}')
        px = card.load()
        near = [px[i, j] for i in range(max(0, x - 3), min(W, x + 4)) for j in range(max(0, y - 3), min(H, y + 4))]
        rgb = [round(sum(p[c] for p in near) / len(near)) for c in range(3)]
        print(f'the card is {W} x {H}; the colour at {x},{y} is [{rgb[0]}, {rgb[1]}, {rgb[2]}]')
        return 0

    if args.zoom:
        zx, zy, zw, zh = (int(float(v)) for v in args.zoom.split(','))
        zx, zy = max(0, zx), max(0, zy)
        zw, zh = min(W - zx, zw), min(H - zy, zh)
        scale = max(1, min(4, round(900 / max(zw, zh))))
        region = card.crop((zx, zy, zx + zw, zy + zh)).resize((zw * scale, zh * scale), Image.LANCZOS)
        layer = Image.new('RGBA', region.size, (0, 0, 0, 0))
        ticks(ImageDraw.Draw(layer), region.size, (zx, zy, zw, zh), scale, 10, 50, (255, 0, 160, 210))
        out_im = Image.alpha_composite(region.convert('RGBA'), layer)
        default = os.path.splitext(args.image)[0] + f'-zoom-{zx}-{zy}.png'
    else:
        layer = Image.new('RGBA', card.size, (0, 0, 0, 0))
        ticks(ImageDraw.Draw(layer), card.size, (0, 0, W, H), 1, args.step, args.step * 2, (255, 0, 160, 200))
        out_im = Image.alpha_composite(card.convert('RGBA'), layer)
        default = os.path.splitext(args.image)[0] + '-grid.png'
    out = args.out or default
    out_im.convert('RGB').save(out)
    print(f'the card is {W} x {H} pixels; wrote {out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
