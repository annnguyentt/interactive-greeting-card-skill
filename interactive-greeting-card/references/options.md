# Card settings

Everything `make_card.py` reads from the card data. Only `image` is required; everything else has
a default. Positions (in `foil.pickAt`, `inside` and `live`) are in the card's own pixels: the
picture cut to the card's shape and scaled so its long side is 1280. `make_card.py --check` and
`grid.py` both print the card's size.

## Contents

- [The page](#the-page)
- [A card](#a-card)
- [The message](#the-message)
- [Foil](#foil)
- [Effects](#effects)
- [Inside the card](#inside-the-card)
- [Examples](#examples)

## The page

| Setting | Default | What it does |
| --- | --- | --- |
| `title` | the first card's name | The browser tab's title, and the link preview's. |
| `description` | "An interactive greeting card…" | The link preview's description. |
| `lang` | `"en"` | The page's language, for screen readers. |
| `page.heading` | none | A line in the hand above the card ("Happy birthday, Mum!"). Leave it out when the card speaks for itself. |
| `page.subheading` | none | A small line under the heading. |
| `page.hint` | `true` | `false` hides "Tap the card to open it…" under the card. |
| `page.hintText` | depends on `turnOver` | Your own hint, in the person's language say. |
| `page.turnOver` | `true` | `false` stops the card turning over to its back. |
| `page.autoplay` | `false` | With several cards, `true` tours them: each shows its front, opens, shuts, and the next comes in. |
| `page.holdFront`, `page.holdOpen` | 6.5, 6 | Seconds the tour holds each front, and each open card. |
| `cards` | (one card from the top level) | A list of cards, each with the settings below. |

With one card, its settings can sit at the top level next to `title`. With several, put each in
`cards`.

## A card

| Setting | Default | What it does |
| --- | --- | --- |
| `image` | required | The front picture: a path relative to the JSON file, or absolute. JPEG, PNG, WebP or GIF (anything Pillow reads, if it's installed). |
| `alt` | none | A sentence describing the front, read out by screen readers. Always write one. |
| `name` | "Card 1"… | The card's name: for screen readers, the dock, and the back's small print. |
| `shape` | `"portrait"` | `portrait` (5:7), `square`, `landscape` (7:5), or `original` (the picture's own shape, kept between 0.62 and 1.5 wide to high). The picture is cut from its middle. |
| `finish` | `"foil"` | `foil`, `paint` or `print`. See the table in SKILL.md. |
| `foil` | depends on finish | What turns to foil, and in what colour. See [Foil](#foil). |
| `paper` | the picture's own paper, or cream | The card stock (inside, back and cut edges, and the bare paper of a picture drawn on paper): `white`, `cream`, `blush`, `sage`, `sky`, `midnight`, `"#rrggbb"`, or `[r, g, b]`. |
| `message` | none | What's handwritten inside. `\n` starts a new line. See [The message](#the-message). |
| `messageAt` | 0.5 | Where the message sits on the inside sheet, top to bottom (0.4 is a little high, which suits a short message). |
| `back` | `[name]`, if it has one | Up to three short lines of small print on the back. `[]` leaves it bare. |
| `signature` | none | Two lines stamped in the card's foil on the back instead of small print: `["Made by", "Nora"]`. The second is written in the hand. |
| `link` | none | A web address the signature opens when it's tapped. |
| `relief` | 3 | With the paint finish: how hard the paint's strokes catch the light. 2 is gentler, 4 stronger. |
| `effects` | none | Simple life that needs no positions. See [Effects](#effects). |
| `live` | none | Lights, moving parts, taps and more, placed on the picture. See `living-cards.md`. |
| `inside` | none | Pieces of the front repeated inside the card. See [Inside the card](#inside-the-card). |

### The message

It's written by hand in the middle of the inside sheet, each line centred. Your own line breaks
(`\n`) stay, and a blank line (`\n\n`) leaves a gap. A line too long for the sheet wraps at a space
by itself; at the biggest hand about 20 letters fit on a line, so a greeting like "Happy birthday
Theo!" holds one line and a longer sentence takes two. The hand is as big as it can be with the
whole message fitting: a short one is written large, a long one smaller, down to a floor, and past
that the end is cut off with "…". Up to about 60 words reads comfortably.

## Foil

`foil` is a colour's name (`"gold"`), `"none"`, `false`, or an object:

| Setting | Default | What it does |
| --- | --- | --- |
| `colour` | `"gold"` | One of the inks below, or your own: `{ "name": "Deep gold", "ink": [210, 150, 40], "tint": [1, 0.68, 0.22] }` (ink is the printed colour, 0 to 255; tint what it throws back in the light, 0 to 1). |
| `on` | `"details"` with the foil finish, else `"none"` | What turns to foil: `details` (lines and dark detail), `darks` (the darkest shapes), `colour` (one colour, picked), or `none`. |
| `amount` | 0.12 details, 0.15 darks, 0.3 colour | For `details` and `darks`: the share of the picture (or of the `area`) that turns to foil. 0.05 to 0.3 looks stamped; more starts to look like a coat of paint. For `colour`: how far a colour may be from the one picked and still turn to foil. 0.2 takes close shades only, 0.3 also the picture's own lighter and darker touches of it, 0.4 and more starts to reach neighbouring colours. |
| `pick` | none | With `on: "colour"`: the colour, `[r, g, b]`. |
| `pickAt` | none | Or the place to take the colour from: `[x, y]` in card pixels (averaged over 7 x 7 pixels). `grid.py --pick x,y` prints the colour there. |
| `area` | the whole card | Keeps the foil to a box, `[x, y, w, h]` in card pixels, or to several, `[[x, y, w, h], ...]`. Use it when what you want in foil shares its colour or darkness with things you don't, such as gold lettering above flowers with gold centres. Leave a margin round what you want: a box's edge cuts straight through anything it crosses. |
| `border` | `false` | `true` stamps a fine double rule round the edge, in the foil's ink. Works with any finish and any `area`, and with `on: "none"` for a border alone. |

The inks:

| `colour` | Ink (as printed, RGB) | Suits |
| --- | --- | --- |
| `gold` | [214, 170, 92] | Most things: warm palettes, Christmas, birthdays |
| `silver` | [200, 203, 210] | Winter, weddings, cool palettes |
| `rose` | [226, 162, 142] | Romance, blush and peach palettes |
| `copper` | [200, 122, 80] | Autumn, rustic |
| `pink` | [228, 128, 168] | Playful |
| `holo` | [206, 210, 220] | Holographic, running through the rainbow in the light: birthdays, parties |

With the `foil` and `print` finishes, the foil is printed in its ink, whatever colour the picture
had there. The stock gold is a pale, classic gold; if the picture's own gold is much deeper
(lettering in an orange or olive gold), give your own `colour` with that gold as its `ink`, so the
foil matches the art. With the `paint` finish, the foil keeps the picture's own colours (gold
paint stays its gold) and only makes it shine.

### Checking the foil before building

`scripts/foil_preview.py` works out the foil exactly as the card does and shows it in magenta over
the faded picture, so you can see what turns to foil and tune it before building:

```bash
python scripts/foil_preview.py card.json                          # the card's own settings
python scripts/foil_preview.py card.json --amount 0.2,0.3,0.4     # amounts side by side
python scripts/foil_preview.py card.json --area 130,150,660,360   # kept to a box
python scripts/foil_preview.py card.json --zoom 120,140,680,380   # a region, enlarged
```

Its options (`--on`, `--pick`, `--pick-at`, `--amount`, `--area`, `--border`) override the card's
own, so try settings there and copy the ones you like into the JSON. It needs numpy. Look for:
everything meant to be foil comes out solid (letters whole, not broken where they're lighter),
nothing else is caught, and there's no dust of tiny specks.

## Effects

`effects` turns on simple life. Each is `true`, or an object to adjust it:

| Effect | What it does | Adjust with |
| --- | --- | --- |
| `snow` | Painted flakes drift down over the front. | `count` (26), `area` `[x, y, w, h]` (the whole card), `fall` speed range in px/s (`[22, 46]`) |
| `hearts` | Little painted hearts rise off the picture now and then and float away. | `area` where they start (`[0.15w, 0.5h, 0.7w, 0.4h]`), `every` seconds range (`[1.3, 2.8]`) |
| `fireflies` | Soft lights wander, pulse, and keep away from the pointer. | `area`, `count` (12), `color` `[r, g, b]` 0 to 1, `size` (0.04 of the card's height) |
| `shootingStars` | A star streaks across now and then. | `area` (the top third), `every` (`[6, 12]`) |
| `sparkle` | Points of the foil (or the brightest paint) catch the light and twinkle. | `count` (14), `every` (`[1.5, 5]`), `size` (0.045) |

Areas are `[x, y, width, height]` in card pixels.

## Inside the card

`inside` repeats pieces of the front inside the card, the way a printed card carries a motif from
its front. It has up to three lists: `left` (the inside of the cover), `insert` (the sheet the
message is on, under the message) and `back`. Each piece:

| Setting | What it does |
| --- | --- |
| `from` | `[x, y, w, h]`: the box on the front (card pixels) to take it from. |
| `use` | What of the box to take: left out, its foil; `"art"`, everything painted (told from the paper's colour, so best on a plain ground); `"lift"`, what the lift mask cuts out (a card with `live` only). |
| `largest` | `true` keeps only the biggest piece in the box. |
| `at` | `[u, v]`: where its middle goes on that panel, as shares of the panel's width and height. |
| `width` | Its width, as a share of the panel's width. |
| `turn`, `flip` | Degrees to turn it clockwise; `true` to mirror it. |

For example, a gold star from the front, scattered small inside the cover:

```json
"inside": {
  "left": [
    { "from": [410, 220, 60, 60], "largest": true, "at": [0.3, 0.3], "width": 0.08, "turn": 12 },
    { "from": [410, 220, 60, 60], "largest": true, "at": [0.7, 0.62], "width": 0.06, "turn": -8 }
  ]
}
```

## Examples

A painting, its gold paint shining, snow falling:

```json
{
  "image": "lantern.jpg",
  "alt": "A white cat in a red scarf beside a glowing lantern in the snow.",
  "name": "Lantern Light",
  "finish": "paint",
  "foil": { "on": "colour", "pickAt": [512, 860], "amount": 0.25 },
  "message": "Wishing you a cozy glow\nall winter long.\nLove, Nora",
  "effects": { "snow": true }
}
```

A photo, printed, framed in silver:

```json
{
  "image": "us-at-the-beach.jpg",
  "alt": "Two friends laughing on a windy beach.",
  "shape": "landscape",
  "finish": "print",
  "foil": { "colour": "silver", "border": true },
  "paper": "white",
  "message": "Happy anniversary!\nTen years of you,\nand I'd do every one again."
}
```

Three cards on one page, toured one after another:

```json
{
  "title": "Thank you!",
  "page": { "heading": "Thank you!", "autoplay": true },
  "cards": [
    { "image": "card-1.png", "finish": "foil", "foil": "gold", "message": "Thank you for everything." },
    { "image": "card-2.png", "finish": "foil", "foil": "silver", "message": "You made it all easy." },
    { "image": "card-3.png", "finish": "paint", "message": "With love and gratitude." }
  ]
}
```
