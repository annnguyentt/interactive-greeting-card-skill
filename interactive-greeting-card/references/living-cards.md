# Making a card come alive

A card's `live` settings make its picture behave like a paper-craft painting come to life: lights
glow, flicker and blaze up; creatures breathe, blink and swish their tails; branches sway; things
stand off the paper on their own shadows; and a tap sets things going. All of it is placed on the
picture, so it takes a little work: read positions off a grid, write them down, build, look.

## Contents

- [How to work](#how-to-work)
- [Lights: glows](#lights-glows)
- [Moving parts: movers](#moving-parts-movers)
- [What a tap does: taps, notice, greet](#what-a-tap-does-taps-notice-greet)
- [Pieces off the paper: lifted](#pieces-off-the-paper-lifted)
- [Things that drift over it](#things-that-drift-over-it)
- [A worked example](#a-worked-example)
- [Pitfalls](#pitfalls)

## How to work

**Positions are card pixels**: the picture cut to the card's shape and scaled so its long side is
1280 (a portrait card is 914 x 1280). x runs right, y runs down. Every number below is in these
pixels unless it says otherwise.

1. Draw the grid: `python scripts/grid.py front.jpg --shape portrait` writes `front-grid.png`, the
   card with labelled lines every 50 pixels. Look at it and note where things are.
2. Zoom in where precision matters (a tail, an ear, an eye):
   `python scripts/grid.py front.jpg --zoom 300,700,260,240` enlarges that region with lines every
   10 pixels.
3. Write `live` in the card data, starting with the lights and one or two moving parts. Build,
   check (below), then add more. A few things done well beat many done roughly.
4. Shapes: an **oval** patch is `[centre x, centre y, radius x, radius y]`; a **box** is
   `[left x, top y, width, height]`; a **point** is `[x, y]`.

`make_card.py` checks that every name a tap or a light refers to exists, and warns about positions
off the card.

**Check what moves** with `node scripts/snapshot.mjs card.html shots/ --live` (Node and Playwright;
a few minutes in software rendering). Besides the usual shots it writes:

- `<name>-live-motion.png`: the card held still, with everything that moves by itself over a few
  seconds in magenta. Each mover should show as magenta on its own part (the tail, not the snow
  beside it), and each light as a soft glow round it. Snow, fireflies and other drifting things
  are held still for the check. A mover with no magenta is too small to see, or its patch misses
  the part.
- `<name>-live-taps.png`: a panel for each light and each tap spot (ringed in blue), with what
  changes when it's tapped in magenta: the flare and its rays, the parts it kicks, the hearts or
  snow it sends. A panel without magenta means that tap does nothing; magenta somewhere else means
  a patch or a position is off. A reaction from the panel before can still be settling.

## Lights: glows

Up to four lights painted on the picture: a candle, a lantern, a fire, the sun, the moon, a star,
lit windows. Each lights the paint round it from the side (so the strokes stand up), comes up
bright where it's painted as giving light, can throw rays, and warms the whole picture.

```json
"glows": [
  { "at": [529, 872], "r": 19, "reach": 311, "color": [1, 0.69, 0.34], "kind": "flame",
    "rake": 1.1, "halo": 0.55, "emit": 1, "wash": 0.05,
    "rays": 5, "raysIdle": 0, "rayLight": 0.5,
    "glint": { "size": 0.034, "points": 0.25, "rest": 0.25 },
    "tap": [531, 849, 66] }
]
```

| Field | What it does |
| --- | --- |
| `at`, `r`, `reach` | The light's middle; the size of its bright core; how far its light carries. |
| `color` | Its light, 0 to 1: candle `[1, 0.69, 0.34]`, sun `[1, 0.78, 0.5]`, moon `[1, 0.9, 0.62]`, star `[1, 0.84, 0.52]`. |
| `kind` | `flame` flickers (candles, lanterns, fire); `breathe` swells and settles slowly (sun, moon); `steady` holds. |
| `level` | How bright it burns as a rule (1). 0.65 to 0.8 for a sun or star that flares. |
| `rake` | How hard it lights the strokes round it from the side. 0 for lights with no paint to rake. |
| `halo` | The soft glow round its core. |
| `emit` | How bright the bright paint at it comes up (0 turns that off). |
| `emitBox` | A box for that bright paint instead of the core (lit windows across a town). |
| `twinkle` | 0 to 1: the painted light flickers from place to place (rows of lit windows). |
| `wash` | How much it warms the whole picture (0.02 to 0.08); a flare warms it more. |
| `rays`, `raysIdle`, `rayLight` | How many rays (5 to 8), how much they show as a rule, and how much more when it flares. |
| `flare` | `{ "every": 7, "size": 1 }`: it blazes up on its own every so often (a sun or a star). Without it, it flares only when tapped. |
| `glint` | `{ "size", "points", "rest" }`: a star of light on its core: size as a share of the card's height, points 0 (round) to 1 (four long points), brightness as a rule. |
| `tap` | `[x, y, radius]`: tapping there makes it flare and throw sparks (a flame's sparks rise as embers). |
| `kick` | Names of movers a tap on it also sets going (the star it's painted on). |

Recipes (card pixels for a 1280-tall card):

- **Candle or lantern**: as in the example above. Keep `r` to the flame itself (15 to 22).
- **Setting sun or bright star**: `kind: "breathe"` (sun) or `"steady"` (star), `r` 26 to 40,
  `reach` 420, `level` 0.7, `halo` 0.5 to 0.7, `wash` 0.06 to 0.08, `rays` 7 or 8, `raysIdle`
  0.12, `rayLight` 0.9, `flare: { "every": 7, "size": 1 }`, `glint: { "size": 0.11, "points": 1,
  "rest": 0.1 }`, `tap` radius about 100.
- **Moon**: `kind: "breathe"`, `r` 34, `reach` 200, `rake` 0.35, `halo` 0.1, `emit` 0.4, `wash` 0.015.
- **Lit windows across a town**: one light, `kind: "steady"`, `emitBox` round the windows,
  `rake` 0, `halo` 0, `emit` 1, `twinkle` 1, `level` 0.7, `reach` large (900).

## Moving parts: movers

Named parts of the picture that move: a tail, an ear, an eye, a scarf, a branch, a tree, a flame,
a wreath, a gift. Each moves the paint in a patch round it about a pivot, fully in the patch's
middle and less toward its edge, so nothing tears.

The patch is an **oval** `area`, or a **capsule** from the pivot to a `tip` with a `width` (its
radius). Use a capsule for anything long that swings from one end (tails, ears, arms, scarves,
curtains, trees), so its free end moves as much as the rest; use an oval for blobs (a body that
breathes, an eye, a gift, a bushy branch).

```json
"movers": {
  "tail": { "pivot": [342, 971], "tip": [210, 949], "width": 34, "soft": 0.45,
            "sway": [4, 0.3], "kick": 14, "wind": 1 },
  "ear":  { "pivot": [341, 736], "tip": [339, 709], "width": 19, "soft": 0.5,
            "twitch": [20, 4, 9], "react": "twitch", "wind": 0.5 },
  "eye":  { "pivot": [432, 753], "area": [432, 753, 10, 10], "soft": 0.5,
            "blink": [2.5, 6], "react": "blink" },
  "moon": { "pivot": [288, 302], "area": [288, 302, 87, 96], "cut": true,
            "sway": [3, 0.12], "kick": 8 }
}
```

| Field | What it does |
| --- | --- |
| `pivot` | The point it turns about: where a tail joins the body, an ear its head, a branch its trunk. |
| `area` or `tip` + `width` | Its patch (see above). The whole part must be inside it, with room to spare. |
| `soft` | The share of the patch that eases out at its edge (0.3 to 0.5). |
| `cut` | `true`: it moves whole, as a cut-out, and the paint behind it slides into the gap it leaves. For things that stand out clearly against plain surroundings (a moon on the sky, a wreath on a window, a cloud). Its outline is found from the colour round its patch's edge. |
| `sway` | `[degrees, hz]`: it sways about its pivot, all the time. |
| `drift` | `[pixels, hz]`: it drifts to and fro (clouds). |
| `twitch` | `[degrees, min s, max s]`: it flicks, twice quickly, every so often (ears). |
| `blink` | `[min s, max s]`: it shuts for a moment every so often (eyes). |
| `breathe` | `[share, hz]`: it swells and settles upward from its pivot (a sleeping animal: `[0.035, 0.22]`). |
| `flutter` | `[pixels, hz, heading]`: a ripple runs along it from its pivot. Heading is the way it hangs, in degrees: 0 right, 90 down, 180 left, 270 up. |
| `flicker` | A share (0.16): it stretches and leans like a flame. |
| `react` | What a tap or greeting does: `spring` (it swings, `kick` degrees, the default), `twitch`, `blink`, `wave` (an arm waving), `jiggle` (a squash and bounce, for gifts and such), `flutter`, `sigh` (a deep breath). |
| `kick` | How far a kick swings it (degrees), or how hard a jiggle is. A breeze from the pointer leans it about as far. |
| `wind` | 0 to 1: how much the pointer's breeze moves it. 1 for cloth and tails, 0.3 to 0.5 for branches and trees, 0 for things that shouldn't. |

Amplitudes that read well:

| Part | Settings |
| --- | --- |
| Tail | capsule, `sway: [4, 0.3]`, `kick: 14`, `wind: 1` |
| Ear | capsule (width 16 to 22), `twitch: [18, 4, 10]`, `react: "twitch"` |
| Eye | small oval, `blink: [2.5, 6]`, `react: "blink"` |
| Scarf or ribbon end | capsule, `flutter: [5, 0.6, heading]`, `react: "flutter"`, `wind: 1` |
| Sleeping animal's body | oval, `breathe: [0.035, 0.22]`, `react: "sigh"` |
| Waving arm | capsule, `sway: [3, 0.35]`, `react: "wave"`, `kick: 24` |
| Branch or bough | oval, pivot at the trunk, `sway: [0.7, 0.18]`, `kick: 3`, `wind: 0.5` |
| Tree | capsule base to top, `sway: [0.6, 0.16]`, `kick: 3`, `wind: 0.5` |
| Flame | small oval, `flicker: 0.16`, `wind: 0.6` |
| Gift, cup, little object | oval, pivot at its base, `react: "jiggle"` |
| Hanging wreath or ornament | `cut: true`, pivot at the hook, `sway: [0.8, 0.22]`, `kick: 4` |
| Moon, cloud, star (cut-out) | `cut: true`, `sway: [2.5, 0.1]` or `drift: [7, 0.06]` |
| Curtain | capsule top to bottom, `flutter: [5, 0.15, 90]`, `react: "flutter"`, `wind: 0.6` |

Small idle motion, big reactions: let things sway and breathe gently on their own, and save the
big swings for taps.

## What a tap does: taps, notice, greet

`taps` are places on the card that do something when tapped, instead of opening it. Each is an
oval `area`, and does any of:

```json
"taps": [
  { "area": [388, 863, 99, 174], "kick": ["tail", "ear", "eye"], "hearts": [388, 712] },
  { "area": [595, 306, 208, 179], "kick": ["branch"], "snow": [[463, 235], [539, 188], [623, 164]] },
  { "area": [650, 924, 71, 62], "kick": ["gift"], "sparkle": [[652, 877]] }
]
```

| Field | What it does |
| --- | --- |
| `kick` | Sets these movers going, each in its own `react` way. |
| `hearts` | `[x, y]`: a handful of painted hearts pop up there and float away (petting a creature). |
| `snow` | `[[x, y], ...]`: snow falls off those spots (the snowy boughs of a shaken branch). |
| `sparkle` | `[[x, y], ...]`: a burst of sparkles from each (a gift). |
| `twinkle` | `[[x, y], ...]`: each spot glints (baubles on a tree). |
| `flurry` | `true`: the snow behind glass comes down thick for a while (with `snowfall`). |
| `leaf` | `true`: a leaf comes loose and falls (with `leaves`). |

The first matching tap wins, so list small areas before big ones that overlap them. Lights' own
`tap` spots are checked before any of these.

`notice` makes something happen when the pointer comes near, at most every so often:
`[{ "area": [420, 760, 80, 60], "kick": ["ear"], "every": 2 }]` (an ear turns to the pointer).

`greet` names movers that say hello as the card lands: `["tail", "ear"]`, or `["arm"]` for a
snowman's wave. This shows people the card can be played with, so add one whenever there are
movers.

The pointer also blows a breeze through the card as it moves over it, which moves every part by
its `wind`. Nothing to set.

## Pieces off the paper: lifted

`lifted` pieces stand off the paper on their own soft shadows, like paper-craft: the moon, stars,
clouds, a sign. Each is a `box` round the piece; its outline is found from the colour round the
box's edge, so it works for things on plain surroundings.

```json
"lifted": [
  { "box": [222, 226, 133, 154], "lift": 0.007, "bob": 0.0025, "ride": "moon" },
  { "box": [194, 209, 26, 26], "lift": 0.006, "bob": 0.002, "twinkle": true }
]
```

| Field | What it does |
| --- | --- |
| `box` | `[x, y, w, h]` round the piece, snug, with a little plain surroundings inside. |
| `lift`, `bob` | How far it stands off (a share of the card's height: 0.006 to 0.009), and how much it bobs. |
| `twinkle` | `true`: it lights up now and then with a glint (stars). |
| `ride` | A mover it moves with: the moon piece rides a moon that rocks, a star rides the tree it sits on. Without it, a lifted piece over a moving part would leave a ghost behind. |

`cutouts`: `[[x, y, w, h], ...]` cuts extra outlines into the lift mask without lifting them (for
`inside` pieces with `"use": "lift"`).

## Things that drift over it

| Setting | What it does |
| --- | --- |
| `snow` | `{ "area": [x, y, w, h], "count": 26, "size": [0.5, 0.95], "fall": [22, 46], "lift": [0.012, 0.04] }`: painted flakes falling over it, with shadows. (`effects.snow` sets this for the whole card.) |
| `smoke` | `{ "from": [x, y], "box": [x, y, w, h], "every": 1.7, "life": 5.2, "drift": [10, -42], "curl": 2.2, "size": [0.18, 0.42], "lift": [0.008, 0.032], "max": 4 }`: puffs off a chimney, each a small copy of the painted smoke in `box`, rising and growing. |
| `leaves` | `{ "box": [x, y, w, h], "from": [[x, y], ...], "every": [3.5, 6.5], "fall": 48, "to": 960, "size": [0.7, 0.95], "max": 3 }`: a leaf (the one in `box`, on a plain ground) falls now and then from one of the `from` spots, tumbling, down to `to`. |
| `fireflies` | `{ "area": [x, y, w, h], "count": 12, "color": [1, 0.8, 0.38], "size": 0.04 }` |
| `shooting` | `{ "area": [x, y, w, h], "every": [6, 12] }`: shooting stars across the area. |
| `floatingHearts` | `{ "area": [x, y, w, h], "every": [1.3, 2.8] }`: hearts rise off the area now and then. |
| `twinkles` | `{ "at": [[x, y], ...], "every": [1.5, 5], "size": 0.045 }`: glints at those points. |
| `snowfall` | `{ "areas": [[x, y, w, h], ...], "darkOnly": true }`: snow falling behind glass, where the picture is dark inside each area (the night through a window). The pointer's breeze blows it about. |

## A worked example

A painting of a white cat in a red scarf by a lantern under a crescent moon, 914 x 1280:

```json
"live": {
  "glows": [
    { "at": [529, 872], "r": 19, "reach": 311, "color": [1, 0.69, 0.34], "kind": "flame",
      "rake": 1.1, "halo": 0.55, "emit": 1, "wash": 0.05, "rays": 5, "raysIdle": 0,
      "rayLight": 0.5, "glint": { "size": 0.034, "points": 0.25, "rest": 0.25 },
      "tap": [531, 849, 66] },
    { "at": [277, 310], "r": 32, "reach": 189, "color": [1, 0.9, 0.62], "kind": "breathe",
      "rake": 0.35, "halo": 0.1, "emit": 0.4, "wash": 0.015 }
  ],
  "movers": {
    "tail": { "pivot": [342, 971], "tip": [210, 949], "width": 34, "soft": 0.45, "sway": [4, 0.3], "kick": 14, "wind": 1 },
    "earL": { "pivot": [341, 736], "tip": [339, 709], "width": 19, "soft": 0.5, "twitch": [20, 4, 9], "react": "twitch", "wind": 0.5 },
    "eye":  { "pivot": [432, 753], "area": [432, 753, 10, 10], "soft": 0.5, "blink": [2.5, 6], "react": "blink" },
    "scarf": { "pivot": [336, 830], "tip": [232, 877], "width": 66, "soft": 0.4, "flutter": [5.7, 0.6, 160], "react": "flutter", "wind": 1 },
    "branch": { "pivot": [807, 155], "area": [595, 306, 245, 208], "soft": 0.35, "sway": [0.8, 0.18], "kick": 3, "wind": 0.5 },
    "moon": { "pivot": [288, 302], "area": [288, 302, 87, 96], "cut": true, "sway": [3, 0.12], "kick": 8 },
    "gift": { "pivot": [650, 987], "area": [650, 924, 76, 66], "soft": 0.3, "react": "jiggle" }
  },
  "taps": [
    { "area": [388, 863, 99, 174], "kick": ["tail", "earL", "eye"], "hearts": [388, 712] },
    { "area": [595, 306, 208, 179], "kick": ["branch"], "snow": [[463, 235], [539, 188], [623, 164], [586, 278]] },
    { "area": [288, 302, 76, 87], "kick": ["moon"], "twinkle": [[207, 222], [355, 214]] },
    { "area": [650, 924, 71, 62], "kick": ["gift"], "sparkle": [[652, 877]] }
  ],
  "greet": ["tail", "earL"],
  "lifted": [ { "box": [222, 226, 133, 154], "lift": 0.007, "bob": 0.0025, "ride": "moon" } ],
  "snow": { "area": [114, 136, 679, 906], "count": 30, "size": [0.5, 0.95], "fall": [22, 46], "lift": [0.012, 0.04] },
  "shooting": { "area": [142, 155, 311, 245], "every": [6, 12] }
}
```

## Pitfalls

- **A part's free end at its patch's edge barely moves.** The patch eases out toward its edge, so
  a tail tip on the edge of an oval stays put while its middle swings. Use a capsule from pivot
  to tip, or make the oval reach well past the end.
- **Everything in a patch moves**, the paint round the part included. Keep patches snug, keep
  idle motion small, and keep patches off faces and text you want still.
- **A cut-out needs plain surroundings.** Its outline is told from the colour round its patch; a
  wreath on a dark window cuts cleanly, a cat on a busy rug doesn't (move it as a soft patch
  instead).
- **Leave room to open the card.** A tap on a `taps` area or a light does that thing instead of
  opening the card, so don't cover the whole picture with taps. The paper margin, the dock's open
  button and the O key always open it.
- **A lifted piece over a moving part** must `ride` that part, or the piece and the paint under it
  part company.
- **Up to 4 lights and 16 movers.** Past that it's busy anyway.
- **Positions belong to the card's shape.** Changing `shape` re-cuts the picture and moves
  everything; redraw the grid and re-read positions after changing it.
