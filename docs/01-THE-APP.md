# The app

A small web app that runs on your own computer. No install, no account, no internet. Nothing you type leaves your device.

## Open it

- **Easiest**: double click `app/index.html`. It opens in your browser.
- **With a local server**: run `python3 tools/serve.py`. It opens http://localhost:8765 in your browser.

The first time, choose **Load the sample workflows** to explore with 3 fictional workflows, or **Start empty** to add your own.

## What you see

- **The dashboard header**: total revenue, delivery cost, gross profit and your portfolio margin with a gauge.
- **The workflow list**: one card per workflow, with its status colour, margin and profit. A card under your warning margin pulses
  softly in red so you cannot miss it.
- **The workflow editor**: everything for one workflow, in the 5 parts of the math:
  1. Agent costs (runs, calls, tokens, prices, the optional model cost override, infrastructure, tools)
  2. Hidden costs (retries, human review, upkeep)
  3. Cost per outcome (up to 3 outcomes)
  4. Profit and pricing (margin, break even price, the price that reaches your target)
  5. Recommendations (what to fix first)

## What you can do

- **Add workflow**, duplicate it, or delete it.
- **Settings**: change your target margin, warning margin and currency label.
- **Load sample**: bring back the 3 fictional workflows.
- **Import** and **Export JSON**: move your numbers between devices, or into `data/workflows.json` for the command line tool.
- **Export CSV**: one row per workflow for any spreadsheet.
- **Print summary**: a clean one page summary. Choose "Save as PDF" in the print window to keep a PDF.

The app saves on your device after every change. It recalculates on every key you type. If a number is not valid, the field tells you
and keeps the last good value.

## The look and the colour reasoning

The app is meant to feel like a calm, warm money tool: quiet space, soft light, one clear number at a time. The colours follow a 60, 30,
10 split.

| Role | Share | Colours | Used for |
| --- | --- | --- | --- |
| Warm neutrals | 60 | cream `#F4EEE4`, oat `#EAE0D0`, sand `#DDCDB5` | page, cards, inputs |
| Coffee browns | 30 | espresso `#2A1C14`, mocha `#5B4031`, muted `#735A48`, latte `#9C7B60` | text, borders, buttons, the cost bar |
| Accent | 10 | deep teal `#2D6A62` | healthy status, focus rings, the profit part of every chart |
| Warning | small | terracotta `#A9502B` | under your target margin |
| Alarm | tiny | red `#B42318` | under your warning margin only |

Why these colours:

- The creams and browns share one warm hue family at different lightness. One hue with many tones looks calm and expensive.
- Teal sits almost opposite brown on the colour wheel, so a small amount of it stands out without being bright. It is toned down, more
  like a ceramic glaze than a screen colour.
- Terracotta is a close warm neighbour, so "under target" feels like a gentle nudge that still fits the palette.
- True red appears only for the under 50 percent alarm. Because nothing else is red, the alarm needs no extra noise.
- Every text colour meets WCAG AA contrast (4.5 to 1 or more) on its background. Latte is used only for lines and chart parts, never for
  small text.

**Type**: a bookish serif for headings and big numbers, and your system font for everything you read or click. Both come from your
computer, so the app works with no network.

**Glass and motion**: cards are frosted glass over softly blurred warm shapes that drift slowly. Buttons lift on hover, press in on click,
show a short spinner, then a tick. Numbers count to their new value and the margin gauge fills. If your computer is set to reduce motion,
the drifting, pulsing and counting turn off and changes show at once.

The spreadsheet uses the same palette, so both feel like one product. Full design notes for builders: `app/DESIGN-NOTES.md`.

## Keyboard and screen readers

Every control can be reached with the keyboard and shows a clear teal focus ring. Arrow keys move between workflow cards. Sections open
and close with Enter or Space.
