#!/usr/bin/env python3
"""Builds an interactive 3D greeting card page: one self-contained HTML file.

    python make_card.py card.json -o card.html
    python make_card.py --image front.jpg --message "Happy birthday!" -o card.html [options]
    python make_card.py card.json --check        # check the card data and print each card's size

The page embeds everything it needs (the pictures, the handwriting font and the WebGL renderer),
so it opens from a file, works offline, and can be put on any web host as it is.

Needs only Python 3.8+. With Pillow installed, pictures are turned the right way up (phone photos)
and big ones are shrunk to keep the page small; without it they're embedded as they are.

The card data is JSON. One card can be written at the top level; several go in "cards". See
references/options.md for every setting, and references/living-cards.md for "live".
"""

import argparse
import base64
import html
import io
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, '..', 'assets'))

LONG = 1280  # a card's long side, in its own pixels (the renderer's too)
SHAPES = {'portrait': 5 / 7, 'square': 1.0, 'landscape': 7 / 5, 'original': None}
FINISHES = ('foil', 'paint', 'print')
FOILS = ('gold', 'silver', 'rose', 'copper', 'pink', 'holo')
PAPERS = ('white', 'cream', 'blush', 'sage', 'sky', 'midnight')
FOIL_ON = ('details', 'darks', 'colour', 'none')
FOIL_KEYS = ('colour', 'color', 'on', 'amount', 'pick', 'pickAt', 'border', 'area')
EFFECTS = ('snow', 'hearts', 'fireflies', 'shootingStars', 'sparkle')
PAGE_KEYS = ('title', 'description', 'lang', 'page', 'cards')
CARD_KEYS = (
    'image', 'alt', 'name', 'shape', 'finish', 'foil', 'paper', 'message', 'messageAt', 'back',
    'signature', 'link', 'inside', 'effects', 'live', 'relief',
)
MAX_SIDE = 1800  # pictures are shrunk to this on their long side (with Pillow)


class CardError(Exception):
    pass


def js_round(x):
    """Math.round, as the renderer rounds (Python's round() goes to even on .5)."""
    return int(math.floor(x + 0.5))


def card_size(iw, ih, shape):
    """The card's size in its own pixels, as the renderer cuts it (studio.js coverOf)."""
    own = iw / ih
    aspect = SHAPES.get(shape) or min(1.5, max(0.62, own))
    if aspect >= 1:
        return LONG, js_round(LONG / aspect)
    return js_round(LONG * aspect), LONG


def cut_box(iw, ih, shape):
    """The part of the picture the card shows: centred, cut to the card's shape. (x, y, w, h)"""
    own = iw / ih
    aspect = SHAPES.get(shape) or min(1.5, max(0.62, own))
    sw = ih * aspect if own > aspect else iw
    sh = ih if own > aspect else iw / aspect
    return (iw - sw) / 2, (ih - sh) / 2, sw, sh


def open_upright(path):
    """The picture as Pillow sees it the right way up, flattened onto white, or None without Pillow."""
    try:
        from PIL import Image, ImageOps
    except ImportError:
        return None
    try:
        im = Image.open(path)
        im = ImageOps.exif_transpose(im)
    except Exception as err:  # Pillow can't read it (HEIC without a plugin, a broken file)
        raise CardError(f"couldn't read the picture {path!r} ({err}). Convert it to JPEG or PNG first.")
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA')
        white = Image.new('RGBA', im.size, (255, 255, 255, 255))
        im = Image.alpha_composite(white, im)
    return im.convert('RGB')


def sniff(data):
    if data[:3] == b'\xff\xd8\xff':
        return 'image/jpeg'
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return 'image/png'
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'image/webp'
    if data[:6] in (b'GIF87a', b'GIF89a'):
        return 'image/gif'
    return None


def picture(path, max_side):
    """The picture as a data URL, and its size the right way up."""
    if not os.path.isfile(path):
        raise CardError(f"there's no picture at {path!r}")
    im = open_upright(path)
    if im is not None:
        w, h = im.size
        k = min(1.0, max_side / max(w, h))
        if k < 1:
            from PIL import Image

            im = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
        out = io.BytesIO()
        im.save(out, 'JPEG', quality=90, optimize=True, progressive=True)
        return 'data:image/jpeg;base64,' + base64.b64encode(out.getvalue()).decode(), im.size
    data = open(path, 'rb').read()
    mime = sniff(data)
    if not mime:
        raise CardError(f"{path!r} isn't a JPEG, PNG, WebP or GIF (install Pillow, or convert it first)")
    size = image_size(data, mime)
    return f'data:{mime};base64,' + base64.b64encode(data).decode(), size


def image_size(data, mime):
    """A picture's width and height from its header, without Pillow (EXIF rotation not applied)."""
    import struct

    try:
        if mime == 'image/png':
            return struct.unpack('>II', data[16:24])
        if mime == 'image/gif':
            return struct.unpack('<HH', data[6:10])
        if mime == 'image/webp':
            chunk = data[12:16]
            if chunk == b'VP8 ':
                w, h = struct.unpack('<HH', data[26:30])
                return w & 0x3FFF, h & 0x3FFF
            if chunk == b'VP8L':
                b = data[21:25]
                bits = b[0] | b[1] << 8 | b[2] << 16 | b[3] << 24
                return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
            if chunk == b'VP8X':
                return 1 + int.from_bytes(data[24:27], 'little'), 1 + int.from_bytes(data[27:30], 'little')
        if mime == 'image/jpeg':
            i = 2
            while i < len(data):
                if data[i] != 0xFF:
                    i += 1
                    continue
                marker = data[i + 1]
                if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                    h, w = struct.unpack('>HH', data[i + 5 : i + 9])
                    return w, h
                i += 2 + struct.unpack('>H', data[i + 2 : i + 4])[0]
    except Exception:
        pass
    return None


# --- checking the card data --------------------------------------------------------------------


def check_card(card, i, size, warn):
    """Raises CardError for what would break the card; warns about what would look wrong."""
    where = f'card {i + 1}' if i is not None else 'the card'
    for key in card:
        if key not in CARD_KEYS and not key.startswith('_'):
            warn(f'{where}: "{key}" is not a card setting, so it does nothing')
    shape = card.get('shape', 'portrait')
    if shape not in SHAPES:
        raise CardError(f'{where}: shape must be one of {", ".join(SHAPES)}, not {shape!r}')
    finish = card.get('finish', 'foil')
    if finish not in FINISHES:
        raise CardError(f'{where}: finish must be one of {", ".join(FINISHES)}, not {finish!r}')
    foil = card.get('foil')
    if isinstance(foil, str) and foil not in FOILS + ('none',):
        raise CardError(f'{where}: foil must be one of {", ".join(FOILS)} or "none", not {foil!r}')
    if isinstance(foil, dict):
        for key in foil:
            if key not in FOIL_KEYS:
                warn(f'{where}: foil.{key} is not a foil setting ({", ".join(FOIL_KEYS)}), so it does nothing')
        colour = foil.get('colour', foil.get('color', 'gold'))
        if isinstance(colour, str) and colour not in FOILS:
            raise CardError(f'{where}: foil.colour must be one of {", ".join(FOILS)}, not {colour!r}')
        if isinstance(colour, dict) and not (isinstance(colour.get('ink'), list) and len(colour['ink']) == 3):
            raise CardError(f'{where}: a foil.colour of its own needs "ink": [r, g, b] (0-255)')
        on = foil.get('on', 'details' if finish == 'foil' else 'none')
        on = 'colour' if on == 'color' else on
        if on not in FOIL_ON:
            raise CardError(f'{where}: foil.on must be one of {", ".join(FOIL_ON)}, not {on!r}')
        if on == 'colour' and not (foil.get('pick') or foil.get('pickAt')):
            raise CardError(f'{where}: foil.on "colour" needs the colour: "pick": [r, g, b] or "pickAt": [x, y]')
        amount = foil.get('amount')
        if amount is not None and not (0 < amount <= 1):
            raise CardError(f'{where}: foil.amount is a share, between 0 and 1, not {amount!r}')
        if on in ('details', 'darks') and amount is not None and amount > 0.5 and not foil.get('area'):
            warn(f'{where}: foil.amount {amount} turns over half the picture to foil; 0.05 to 0.3 reads as stamped')
        area = foil.get('area')
        if area is not None:
            boxes = [area] if isinstance(area, list) and area and isinstance(area[0], (int, float)) else area
            if not (
                isinstance(boxes, list) and boxes
                and all(isinstance(b, list) and len(b) == 4 and all(isinstance(v, (int, float)) for v in b) for b in boxes)
            ):
                raise CardError(f'{where}: foil.area is a box [x, y, w, h] in card pixels, or a list of boxes')
            W, H = size
            for b in boxes:
                if b[2] <= 0 or b[3] <= 0 or b[0] >= W or b[1] >= H or b[0] + b[2] <= 0 or b[1] + b[3] <= 0:
                    warn(f'{where}: foil.area box {b} holds nothing of the card, which is {W} x {H} pixels')
    paper = card.get('paper')
    if isinstance(paper, str) and not paper.startswith('#') and paper not in PAPERS:
        raise CardError(f'{where}: paper must be one of {", ".join(PAPERS)}, a #rrggbb colour or [r, g, b], not {paper!r}')
    message = card.get('message', '')
    if not isinstance(message, str):
        raise CardError(f'{where}: message must be text (use \\n for a new line)')
    if not message.strip():
        warn(f'{where}: there is no message, so the inside will be blank')
    words = len(message.split())
    if words > 90 or message.count('\n') > 14:
        warn(f'{where}: the message is long ({words} words); it will be written small to fit, and anything past what fits is cut')
    for key in ('back', 'signature'):
        if key in card and not (isinstance(card[key], list) and all(isinstance(s, str) for s in card[key])):
            raise CardError(f'{where}: {key} must be a list of short lines of text')
    for key in card.get('effects', {}) or {}:
        if key not in EFFECTS:
            warn(f'{where}: effects.{key} is not an effect ({", ".join(EFFECTS)}), so it does nothing')
    live = card.get('live')
    if live:
        check_live(live, where, size, warn)


def check_live(live, where, size, warn):
    W, H = size
    glows = live.get('glows', [])
    if len(glows) > 4:
        raise CardError(f'{where}: live.glows can have at most 4 lights, not {len(glows)}')
    movers = live.get('movers', {})
    if len(movers) > 16:
        raise CardError(f'{where}: live.movers can have at most 16 parts, not {len(movers)}')

    def inside(point, what):
        x, y = point[0], point[1]
        if not (-0.05 * W <= x <= 1.05 * W and -0.05 * H <= y <= 1.05 * H):
            warn(f'{where}: {what} [{x}, {y}] is off the card, which is {W} x {H} pixels')

    for k, g in enumerate(glows):
        if not isinstance(g.get('at'), list) or len(g['at']) != 2:
            raise CardError(f'{where}: live.glows[{k}] needs "at": [x, y]')
        inside(g['at'], f'live.glows[{k}].at')
        for name in g.get('kick', []):
            if name not in movers:
                raise CardError(f'{where}: live.glows[{k}] kicks "{name}", but there is no mover called that')
    for name, m in movers.items():
        if 'pivot' not in m:
            raise CardError(f'{where}: live.movers.{name} needs a "pivot": [x, y]')
        inside(m['pivot'], f'live.movers.{name}.pivot')
        if 'tip' in m:
            if 'width' not in m:
                raise CardError(f'{where}: live.movers.{name} has a tip, so it needs a "width" (its radius, in pixels)')
            inside(m['tip'], f'live.movers.{name}.tip')
        elif not (isinstance(m.get('area'), list) and len(m['area']) == 4):
            raise CardError(f'{where}: live.movers.{name} needs "area": [x, y, rx, ry] or "tip" and "width"')
        react = m.get('react', 'spring')
        if react not in ('spring', 'twitch', 'blink', 'wave', 'jiggle', 'flutter', 'sigh'):
            raise CardError(f'{where}: live.movers.{name}.react {react!r} is not a reaction')
    for k, z in enumerate(live.get('taps', [])):
        if not (isinstance(z.get('area'), list) and len(z['area']) == 4):
            raise CardError(f'{where}: live.taps[{k}] needs "area": [x, y, rx, ry]')
        for name in z.get('kick', []):
            if name not in movers:
                raise CardError(f'{where}: live.taps[{k}] kicks "{name}", but there is no mover called that')
    for list_name in ('notice',):
        for k, z in enumerate(live.get(list_name, [])):
            for name in z.get('kick', []):
                if name not in movers:
                    raise CardError(f'{where}: live.{list_name}[{k}] kicks "{name}", but there is no mover called that')
    for name in live.get('greet', []):
        if name not in movers:
            raise CardError(f'{where}: live.greet names "{name}", but there is no mover called that')
    for k, p in enumerate(live.get('lifted', [])):
        if not (isinstance(p.get('box'), list) and len(p['box']) == 4):
            raise CardError(f'{where}: live.lifted[{k}] needs "box": [x, y, w, h]')
        if p.get('ride') and p['ride'] not in movers:
            raise CardError(f'{where}: live.lifted[{k}] rides "{p["ride"]}", but there is no mover called that')


# --- the page ----------------------------------------------------------------------------------


def font_css():
    manifest = json.load(open(os.path.join(ASSETS, 'fonts', 'caveat.json')))
    rules = []
    for face in manifest['faces']:
        data = base64.b64encode(open(os.path.join(ASSETS, 'fonts', face['file']), 'rb').read()).decode()
        rules.append(
            "@font-face { font-family: 'Caveat'; font-style: normal; font-weight: %s; font-display: block; "
            "src: url(data:font/woff2;base64,%s) format('woff2'); unicode-range: %s; }"
            % (manifest['weight'], data, face['unicodeRange'])
        )
    return '\n'.join(rules)


def script_safe(text):
    """Script that can sit inside a <script> without ending it."""
    return text.replace('</', '<\\/').replace('<!--', '<\\!--')


def json_safe(text):
    """JSON that can sit inside a <script> without ending it, and still parses: any < is escaped."""
    return text.replace('<', '\\u003c')


def build(config, base_dir, out, max_side=MAX_SIDE, check_only=False):
    warnings = []
    warn = warnings.append
    for key in config:
        if key not in PAGE_KEYS and key not in CARD_KEYS and not key.startswith('_'):
            warn(f'"{key}" is not a page or card setting, so it does nothing')
    if 'cards' in config:
        cards = config['cards']
        if not isinstance(cards, list) or not cards:
            raise CardError('"cards" must be a list with at least one card')
    else:
        cards = [{k: v for k, v in config.items() if k in CARD_KEYS or k.startswith('_')}]
    if not all(isinstance(c, dict) for c in cards):
        raise CardError('each card must be an object of settings')

    embedded = []
    sizes = []
    for i, card in enumerate(cards):
        if not card.get('image'):
            raise CardError(f'card {i + 1} has no "image"')
        path = card['image'] if os.path.isabs(card['image']) else os.path.join(base_dir, card['image'])
        data_url, (iw, ih) = picture(path, max_side) if not check_only else (None, picture_size(path))
        size = card_size(iw, ih, card.get('shape', 'portrait'))
        sizes.append(size)
        check_card(card, i if len(cards) > 1 else None, size, warn)
        embedded.append({**card, 'image': data_url})

    if check_only:
        return None, sizes, warnings

    page = dict(config.get('page') or {})
    title = config.get('title') or cards[0].get('name') or 'A card for you'
    description = config.get('description') or 'An interactive greeting card. Tap it to open it.'
    turn = page.get('turnOver', True) is not False
    hint = page.get('hintText') or ('Tap the card to open it · drag it to turn it over' if turn else 'Tap the card to open it')
    label = (
        'A greeting card in 3D. Tap it, or press O, to open it and read inside'
        + ('; drag it sideways, or press T, to turn it over' if turn else '')
        + ('; the arrow keys go between the cards.' if len(cards) > 1 else '.')
    )
    data = {'page': page, 'cards': embedded}
    template = open(os.path.join(ASSETS, 'template.html'), encoding='utf-8').read()
    renderer = open(os.path.join(ASSETS, 'greeting-card.js'), encoding='utf-8').read()
    page_html = (
        template.replace('__LANG__', html.escape(config.get('lang', 'en')))
        .replace('__TITLE__', html.escape(title))
        .replace('__DESCRIPTION__', html.escape(description))
        .replace('__HINT__', html.escape(hint))
        .replace('__CANVAS_LABEL__', html.escape(label))
        .replace('/*__FONTS__*/', font_css())
        .replace('__CARD_DATA__', json_safe(json.dumps(data, ensure_ascii=False)))
        .replace('__RENDERER__', script_safe(renderer))
    )
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(page_html)
    return out, sizes, warnings


def picture_size(path):
    if not os.path.isfile(path):
        raise CardError(f"there's no picture at {path!r}")
    im = open_upright(path)
    if im is not None:
        return im.size
    data = open(path, 'rb').read()
    size = image_size(data, sniff(data))
    if not size:
        raise CardError(f"couldn't read the size of {path!r}")
    return size


def main(argv=None):
    ap = argparse.ArgumentParser(description='Build an interactive 3D greeting card page (one HTML file).')
    ap.add_argument('config', nargs='?', help='the card data, as JSON (or use --image and --message)')
    ap.add_argument('-o', '--out', help='the page to write (default: next to the card data, or greeting-card.html)')
    ap.add_argument('--check', action='store_true', help="only check the card data, and print each card's size")
    ap.add_argument('--max-side', type=int, default=MAX_SIDE, help='shrink pictures to this on their long side (with Pillow)')
    quick = ap.add_argument_group('one card without a JSON file')
    quick.add_argument('--image', help='the picture for the front')
    quick.add_argument('--message', help='what is written inside (\\n for a new line)')
    quick.add_argument('--name', help="the card's name, for its back and for screen readers")
    quick.add_argument('--finish', choices=FINISHES, help='foil (default), paint or print')
    quick.add_argument('--foil', help=f'the foil colour: {", ".join(FOILS)}, or none')
    quick.add_argument('--paper', help=f'the paper: {", ".join(PAPERS)} or #rrggbb')
    quick.add_argument('--shape', choices=list(SHAPES), help='portrait (default), square, landscape or original')
    quick.add_argument('--effects', help=f'comma-separated: {", ".join(EFFECTS)}')
    quick.add_argument('--title', help="the page's title")
    args = ap.parse_args(argv)

    try:
        if args.config:
            base_dir = os.path.dirname(os.path.abspath(args.config))
            with open(args.config, encoding='utf-8') as f:
                config = json.load(f)
            out = args.out or os.path.splitext(os.path.abspath(args.config))[0] + '.html'
        elif args.image:
            base_dir = os.getcwd()
            config = {'image': args.image, 'message': (args.message or '').replace('\\n', '\n')}
            for key in ('name', 'finish', 'paper', 'shape', 'title'):
                if getattr(args, key):
                    config[key] = getattr(args, key)
            if args.foil:
                config['foil'] = args.foil
            if args.effects:
                config['effects'] = {e.strip(): True for e in args.effects.split(',') if e.strip()}
            out = args.out or os.path.abspath('greeting-card.html')
        else:
            ap.error('give the card data (a JSON file), or --image and --message')
        written, sizes, warnings = build(config, base_dir, out, args.max_side, args.check)
    except json.JSONDecodeError as err:
        print(f'error: the card data is not valid JSON: {err}', file=sys.stderr)
        return 2
    except CardError as err:
        print(f'error: {err}', file=sys.stderr)
        return 2

    for w in warnings:
        print(f'warning: {w}', file=sys.stderr)
    for i, (w, h) in enumerate(sizes):
        print(f'card {i + 1}: {w} x {h} pixels (live coordinates are in these)')
    if written:
        kb = os.path.getsize(written) / 1024
        print(f'wrote {written} ({kb:.0f} KB)')
    else:
        print('the card data is fine' if not warnings else 'the card data works, with the warnings above')
    return 0


if __name__ == '__main__':
    sys.exit(main())
