---
name: interactive-greeting-card
description: Turns a picture and a message into an interactive 3D greeting card, a folded card in WebGL whose foil or thick paint catches the light as you move, that opens to the message handwritten inside and turns over to its back, and can come alive with glowing lights, falling snow, floating hearts and parts that sway and react to a tap. Makes one self-contained HTML file that works offline and can be sent or hosted anywhere. Use it whenever someone wants a greeting card, e-card or digital card (birthday, Christmas, holiday, Valentine, Mother's Day, thank-you, wedding, anniversary, congratulations, get well), or wants to turn their own artwork, painting, illustration or photo into a card with a message inside, even if they never say interactive or 3D.
compatibility: Needs Python 3.8+ (Pillow recommended, numpy for the foil preview). Node with Playwright is optional, for screenshots and a check of what moves.
---

# Interactive greeting card

Make a card someone will want to play with: their picture on the front of a folded card that sways
on the page, catches a moving light in its foil or paint, opens with a tap to their message in
handwriting, and turns over to show its back. A short build turns a picture and a few settings
into **one HTML file** with everything inside it (picture, font, renderer), so it opens straight
from a file, works offline, and goes on any web host unchanged.

What's in this skill:

- `scripts/make_card.py` builds the page from the card data (JSON). It checks the data and explains
  any mistake before writing anything.
- `scripts/grid.py` draws a labelled pixel grid over the picture, cut exactly as the card cuts it,
  for reading positions off it (only needed for living effects and colour picks).
- `scripts/foil_preview.py` shows exactly what turns to foil, in magenta, so you can tune the foil
  before building (needs numpy).
- `scripts/snapshot.mjs` (optional, needs Node and Playwright) screenshots the front, inside and
  back, and with `--live` shows what moves on a living card and what each tap does.
- `references/options.md` lists every setting. `references/living-cards.md` explains how to make a
  card come alive. Read them when you need them, not before.

## How to make a card

### 1. Get the picture and the message

The two things you need from the person are the picture for the front and what to write inside.
If either is missing, ask for it, or offer to write the message for them (ask who it's for, and
from whom). Everything else has a sensible default, so don't make them answer a questionnaire;
pick well and mention the choices you made so they can change them.

Take the message as they give it. Don't polish their words unless they ask, but do put in line
breaks where a handwritten card would have them (a greeting on its own line, the sign-off at the
end); a line too long for the sheet wraps by itself, at about 20 letters. Up to about 60 words
reads large and comfortable; longer letters are written smaller, and past what fits, the end is
cut, so suggest trimming a very long one.

Several pictures make several cards on one page, dealt one after another with a dock to switch
between them. That suits a set of cards, or one card in a few designs to choose from.

### 2. Look at the picture and choose the finish

The finish decides how the front catches the light. Look at the picture before choosing:

| The picture | Finish | Notes |
| --- | --- | --- |
| A painting with brush texture (oils, gouache, acrylic, thick watercolour) | `paint` | The paint's own strokes stand up and glisten under the light. If it has gold paint, make that shine too: `foil.on: "colour"` with the gold picked. |
| An illustration, line art, lettering or flat design, especially on plain paper | `foil` | `on: "details"` stamps the lines and dark detail in foil; `"colour"` stamps one colour you pick (gold lettering, say); `"darks"` stamps the darkest shapes (silhouettes). |
| A photo | `print` | Printed on matte card. A thin foil `border` frames it nicely. Foil on a photo's details tends to look noisy. |

Foil colours: `gold` (classic, warm), `silver` (winter, weddings, cool palettes), `rose` (romance),
`copper` (autumn, rustic), `pink` (playful), `holo` (holographic, birthdays). Match the picture's
own palette and the occasion.

Check the foil with `foil_preview.py` before building (once the card data is written, step 5). What
you meant to be foil should come out solid, and nothing else caught. Two things often need it:

- What you want in foil shares its colour or darkness with things you don't, say gold lettering
  above flowers with gold centres. Keep the foil to a box round it with `foil.area`.
- The stock gold is pale and classic. Art drawn in a much deeper gold can have its own ink, so the
  foil matches it.

The Foil section of `references/options.md` has the inks, what `amount` does in each mode, and
`area`.

Paper (the inside, back and edges): `white`, `cream`, `blush`, `sage`, `sky`, `midnight`, or any
`#rrggbb`. If the picture is drawn on plain paper, the card takes that paper by default, which
usually looks best.

The card is cut from the picture's middle to its shape: `portrait` (5:7, the default), `square`,
`landscape` (7:5), or `original` (the picture's own shape, within limits). Use `landscape` for wide
pictures. If the subject sits near an edge, run `grid.py` to see what the cut keeps.

### 3. Add effects for the occasion (optional)

These need no positions, so add them freely when they suit the card:

- `snow`: flakes drift down over the front (winter, Christmas)
- `hearts`: little painted hearts float up off the picture now and then (love, Valentine's, Mother's Day, weddings)
- `fireflies`: soft lights wander over the lower part (summer nights, dreamy scenes)
- `shootingStars`: a star streaks across the top now and then (night skies)
- `sparkle`: points of the foil catch the light and twinkle (any foil card)

One or two effects is plenty; more gets busy.

### 4. Bring it alive (optional, and the best part)

A card can do much more: the lantern in the picture glows and flickers and flares when tapped, the
sun throws rays, a cat's tail swishes and hearts rise off it when it's petted, branches sway and
drop their snow, scarves flutter in the breeze of the pointer. That needs positions on the
picture, which you read off `grid.py`'s grid. Read `references/living-cards.md` and follow it.

Do it when the person asks for the card to be alive, animated or interactive, or when the picture
has obvious lights (candles, lanterns, the sun, the moon, lit windows) or characters. It takes a
while, so for a quick card offer it as a next step instead.

### 5. Write the card data

Save it as JSON next to the picture. One card:

```json
{
  "title": "Happy birthday, Ellie",
  "image": "ellie-birthday.jpg",
  "alt": "A watercolour of a fox in a meadow of poppies.",
  "name": "Fox and Poppies",
  "finish": "foil",
  "foil": { "colour": "rose", "on": "details", "amount": 0.12 },
  "paper": "cream",
  "message": "Dear Ellie,\nHappy birthday to my favourite person.\nHere's to your best year yet!\nLove, Nora",
  "signature": ["Made with love by", "Nora"],
  "effects": { "hearts": true, "sparkle": true }
}
```

`alt` describes the front for screen readers; always write one. `name` goes on the back as small
print unless `back` or `signature` says otherwise. Several cards go in `"cards": [ {...}, {...} ]`,
with `title` and `page` at the top. Every setting is in `references/options.md`.

### 6. Build it

```bash
python scripts/make_card.py card.json --check      # checks the data, prints the card's pixel size
python scripts/make_card.py card.json -o card.html
```

Paths in the JSON are relative to the JSON file. For a quick card there's also a one-line form:

```bash
python scripts/make_card.py --image front.jpg --message "Happy birthday!" --finish foil --foil gold -o card.html
```

If the script reports an error, it says what's wrong and how to fix it. Warnings (a missing
message, a setting it doesn't know, a position off the card) still build, but fix them.

### 7. Check it

If Node and Playwright are available, look at the card before handing it over:

```bash
node scripts/snapshot.mjs card.html shots/
node scripts/snapshot.mjs card.html shots/ --live   # a card that comes alive: also checks what moves
```

This writes the front, the front with the light held over it (`front-lit`: the foil or paint
catching the light), the inside and the back as PNGs. Look at them: is the message easy to read,
does the foil look stamped rather than speckled, is the picture cut where you expected? Adjust and
rebuild; each round is quick. Without a browser, say plainly that you couldn't preview it (the foil
preview still works).

### 8. Hand it over

Give the person the HTML file and tell them how to use it:

- Open it in any browser to see the card. Tap it (or press O) to open it; drag it sideways (or
  press T) to turn it over.
- To send it, put it online and share the link: GitHub Pages, Netlify Drop or any static host
  takes the file as it is. Or send the file itself; it works offline.
- It's one to two megabytes, almost all of it the picture.

Mention what you chose (finish, foil, paper, effects) in a sentence, so they can ask for changes.

## Good to know

- Phone photos are turned the right way up and big pictures are shrunk (with Pillow). Transparent
  areas become white. HEIC photos need converting to JPEG first unless Pillow can read them.
- The handwriting is Caveat, embedded in the page. It covers Latin, extended Latin and Cyrillic;
  other scripts (Vietnamese, Greek, CJK) fall back to the device's own handwriting font.
- Without WebGL, the page still shows the picture and the message, flat.
- The page is light-themed by design: the card sits on white with soft shadows.
- To change how the cards look or behave beyond these settings, the renderer's source is in the
  skill's GitHub repository (`renderer/`), and rebuilding it replaces `assets/greeting-card.js`.
