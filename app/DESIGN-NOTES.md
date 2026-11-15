# Design notes for the app

Why the app looks and moves the way it does. Builder notes, kept next to the code so the next change stays in the same style.

## The feeling we want

A calm, warm money tool. Think of a good coffee shop menu or a premium skincare page: lots of quiet space, one clear number at a time,
soft light, real materials. The numbers are the hero. Nothing shouts, so the one thing that turns red is impossible to miss.

## Palette (60, 30, 10)

| Role | Share | Colours | Used for |
| --- | --- | --- | --- |
| Warm neutrals | 60 | cream `#F4EEE4`, oat `#EAE0D0`, sand `#DDCDB5`, glass fill `rgba(255,251,245,0.6)` | page, cards, inputs |
| Coffee browns | 30 | espresso `#2A1C14`, mocha `#5B4031`, muted `#735A48`, latte `#9C7B60` | text, borders, primary buttons, the cost bar |
| Accent | 10 | deep teal `#2D6A62` | healthy status, focus rings, the profit part of every chart |
| Warning | small | terracotta `#A9502B` | below your target margin |
| Alarm | tiny | red `#B42318` | under your warning margin only |

Colour theory behind it:

- The browns and creams all sit on one hue family (orange, around 25 to 35 degrees) at different lightness. One hue family with many
  tones reads as calm and expensive; many hues read as noisy.
- The accent is the complement. Teal sits almost opposite brown orange on the colour wheel, so a small amount of it pops without
  needing to be bright. It is pulled down in saturation so it looks like a painted ceramic glaze, not a screen colour.
- Terracotta is an analogous warm colour, so "below target" feels like a gentle nudge that still belongs to the palette.
- True red is kept out of the palette on purpose and only appears for the under 50 percent alarm. Because nothing else is red,
  the alarm needs no extra noise.
- Latte is decoration only (lines, chart parts): it does not reach 4.5 to 1 on cream, so it never carries small text.

Contrast (WCAG AA, measured): espresso on cream 14.3, mocha on cream 8.2, muted on cream 5.5, teal on cream 5.4, terracotta on glass 5.0,
red on cream 5.7, cream on espresso 14.3. Every text pair is 4.5 to 1 or more.

## Type

Two typefaces, both from the system, so the app works with no network:

- Serif for headings and big numbers: Iowan Old Style, then Palatino, Book Antiqua, Georgia. A bookish serif makes money numbers feel
  considered. Numbers use lining, tabular figures so columns line up and counting numbers do not wobble.
- Sans for everything you read or click: the system UI font (San Francisco, Segoe UI, Roboto).

Scale: 12, 13, 14, 16, 20, 28, 40, 56 px. Labels are small caps style (12 px, letter spacing 0.08em) in muted brown.

## Spacing and shape

- 4 px base: 4, 8, 12, 16, 20, 24, 32, 40, 56, 72.
- Radius: 10 inputs, 999 pills and buttons, 20 cards, 28 large panels.
- Glass: blur 22 px with saturation 140 percent, a translucent warm fill, a hairline brown border at 10 percent, a white inner top
  highlight, and three soft shadows (1 px, 8 px, 24 px) so cards float without a hard edge.
- Background: cream, three large blurred shapes (latte, sand, a little teal) drifting very slowly (40 to 70 s), plus a light grain so
  the glass has something to blur.

## Motion tokens

| Token | Value | Used for |
| --- | --- | --- |
| `--t-fast` | 140 ms | hover colour, press |
| `--t-base` | 240 ms | lift, focus, chips |
| `--t-slow` | 480 ms | section open and close, toasts |
| `--t-count` | 650 ms | numbers counting, rings filling |
| `--ease-out` | cubic-bezier(0.22, 1, 0.36, 1) | almost everything |
| `--ease-spring` | cubic-bezier(0.34, 1.56, 0.64, 1) | ticks and small pops |

`prefers-reduced-motion: reduce` turns off the drifting shapes, the pulse, counting and the processing delay; changes still show at once.

## Interactions

1. Cards and buttons lift 1 to 2 px with a deeper shadow on hover, scale to 0.97 on press, and show a soft glow where you clicked.
2. Every button that does something (save, export, print, load sample, add, settings) shows a spinner for about half a second, then a
   tick that draws itself, then settles back. Clicking it again while busy does nothing.
3. Numbers count from the old value to the new one. Margin rings fill to the new value.
4. Inputs recalculate on every key. A valid number shows a small teal tick for a moment; anything else turns the field terracotta with a
   plain message and the last good value is kept.
5. Toasts confirm save, export, import, reset, load sample and delete. Delete, reset, load sample and import have an Undo button.
6. A workflow under the warning margin gets a slow, soft red pulse around its card and ring.
7. The 5 sections open and close smoothly (grid row animation), keyboard and screen reader friendly (`aria-expanded`).
8. Arrow keys move between workflow cards. Focus rings are a 3 px teal halo on every control.
9. A small "Saved on this device" note ticks each time the app saves.
