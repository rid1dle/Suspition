---
name: Suspition
description: A party mystery game for one room. Phones for private play, a shared table screen for the show, and a look that each story world relights.
colors:
  lamplight-amber: "#e0a85a"
  burnt-ink: "#1b1408"
  ember-warning: "#e0715a"
  night-room: "#141217"
  smoke-card: "#1d1a21"
  raised-smoke: "#26222b"
  candle-paper: "#f1ebe3"
  ash-note: "#a49c92"
  tension-ember: "#e0603a"
  right-green: "#36d097"
  hidden-violet: "#a58af6"
  whisper-violet: "#8b5ef3"
  public-sky: "#3abaf4"
  qr-white: "#ffffff"
  shell-black: "#0a0a0a"
  shell-card: "#171717"
  shell-text: "#fafafa"
  shell-muted: "#a1a1a1"
typography:
  display-hero:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "3.75rem"
    fontWeight: 400
    lineHeight: 1.25
  display:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "3rem"
    fontWeight: 400
    lineHeight: 1.25
  headline:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.333
  title:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.375
  body-reading:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.625
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body-small:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  action:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.43
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.7rem"
    fontWeight: 500
    letterSpacing: "0.12em"
  timer:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "2.25rem"
    fontWeight: 400
    fontFeature: "tnum"
rounded:
  md: "8px"
  lg: "10px"
  xl: "14px"
  2xl: "18px"
  3xl: "22px"
  4xl: "26px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
  phone-gutter: "20px"
  table-gutter: "24px"
  phone-column: "28rem"
  table-column: "80rem"
components:
  button-primary:
    backgroundColor: "{colors.lamplight-amber}"
    textColor: "{colors.burnt-ink}"
    typography: "{typography.action}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-primary-large:
    backgroundColor: "{colors.lamplight-amber}"
    textColor: "{colors.burnt-ink}"
    typography: "{typography.action}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "36px"
  button-hero:
    backgroundColor: "{colors.lamplight-amber}"
    textColor: "{colors.burnt-ink}"
    typography: "{typography.body-reading}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.raised-smoke}"
    textColor: "{colors.candle-paper}"
    typography: "{typography.action}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-ghost:
    textColor: "{colors.candle-paper}"
    typography: "{typography.action}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-small:
    typography: "{typography.action}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "28px"
  choice-pill:
    backgroundColor: "{colors.raised-smoke}"
    textColor: "{colors.candle-paper}"
    typography: "{typography.body-small}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  choice-pill-selected:
    backgroundColor: "{colors.lamplight-amber}"
    textColor: "{colors.burnt-ink}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  vote-option:
    backgroundColor: "{colors.raised-smoke}"
    textColor: "{colors.candle-paper}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "12px 16px"
  vote-option-selected:
    backgroundColor: "{colors.lamplight-amber}"
    textColor: "{colors.burnt-ink}"
    rounded: "{rounded.xl}"
    padding: "12px 16px"
  input:
    textColor: "{colors.candle-paper}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
  input-large:
    textColor: "{colors.candle-paper}"
    typography: "{typography.body-reading}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "48px"
  panel:
    backgroundColor: "{colors.smoke-card}"
    textColor: "{colors.candle-paper}"
    rounded: "{rounded.2xl}"
    padding: "20px"
  panel-table:
    backgroundColor: "{colors.smoke-card}"
    textColor: "{colors.candle-paper}"
    rounded: "{rounded.2xl}"
    padding: "24px"
  inset-box:
    rounded: "{rounded.xl}"
    padding: "16px"
  label:
    textColor: "{colors.ash-note}"
    typography: "{typography.label}"
  alert-banner:
    backgroundColor: "{colors.lamplight-amber}"
    textColor: "{colors.burnt-ink}"
    rounded: "{rounded.2xl}"
    padding: "20px"
  chat-bubble:
    backgroundColor: "{colors.smoke-card}"
    textColor: "{colors.candle-paper}"
    typography: "{typography.body}"
    rounded: "{rounded.2xl}"
    padding: "12px"
  bottom-sheet:
    backgroundColor: "{colors.night-room}"
    textColor: "{colors.candle-paper}"
    rounded: "{rounded.3xl}"
    padding: "16px"
  tab-trigger:
    textColor: "{colors.ash-note}"
    typography: "{typography.body-small}"
    padding: "8px 12px"
  tab-trigger-active:
    textColor: "{colors.candle-paper}"
    padding: "8px 12px"
  badge:
    backgroundColor: "{colors.lamplight-amber}"
    textColor: "{colors.burnt-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.4xl}"
    padding: "2px 8px"
    height: "20px"
---

# Design System: Suspition

## 1. Overview

**Creative North Star: "The Lamplit Room"**

Suspition is played in a real living room at night: friends on sofas, a TV or laptop across the room, a phone in every hand. The design is a lamp in that room. It gives just enough warm light to read by, then gets out of the way so the talk can be the game. Before a story exists the room is the house look: a near-black plum dark with one lamplight amber. Once the GM writes a world, the GM picks a new seed colour, font pair, texture and ambient effect, and the whole room is relit in that world's mood. The layout, the type scale, the shapes and the reading surfaces never change. Only the light does.

The system has two registers, set by screen. The **phone** is product: one narrow column (28rem), solid surfaces, short lines, the chat as the spine and everything else one tap away in a bottom sheet. It is read in two-second glances. The **table screen** is the shared show: a wide two-column grid (up to 80rem), big display titles, a living background at the edges, and text sized to read from the sofa. Both are always dark (the root element carries the `dark` class), because the room is dim.

This system rejects what PRODUCT.md rejects: a SaaS dashboard of settings, stats and pills; a wall of text on a phone; a turn-based board app with greyed-out screens; cheap horror or neon gamer looks with blood-splatter fonts, RGB glow and skulls.

**How the room overrides the tokens.** The colour tokens above are the house room (`src/lib/house-room.ts`). Every screen is wrapped in the world room component, which writes the room's eight colours into the CSS variables that the shadcn components read: background, card, popover, muted, secondary, accent, primary, destructive, plus a border at 12% text and an input stroke at 16% text. A world's palette is built in OKLCH from one seed hex (`server/room.ts`): background at 17% lightness, card at 21.5%, raised surface at 26%, all with at most 0.04 chroma of the seed hue; text at 95%; muted text at 76%; the accent at 78% lightness with chroma held between 0.09 and 0.17; text on the accent at 20%; danger always at hue 30. Every palette must pass 4.5:1 contrast on seven pairs: text on all three surfaces, muted text on the background and the card, text on the accent, and the accent on the background. If it fails after two small lifts, the house palette is used instead. A grey seed keeps the house amber. So the shapes, spacing and type in this file are fixed, and the colours are a contract: any world colour lands in the same role with the same contrast.

**Key Characteristics:**
- Dark, warm, low-chroma surfaces; one accent per world, used for "this is yours" and "act now".
- Solid reading surfaces in one clean body font (Inter); character fonts on titles only.
- Mood lives at the screen edges: texture, ambient effect, a vignette that deepens with tension, a single edge glow on a story turn.
- Tonal layering, not shadows. Rings and fills mark state.
- Phone: narrow, private, quick. Table: wide, public, big.
- All motion respects reduce-motion; heavy table effects switch off on slow screens or in Calm mode.

## 2. Colors: The House Palette

A warm night palette: plum-tinted near-black surfaces, parchment text, and one lamplight amber. Each world replaces these values with its own seed-built set in the same roles.

### Primary
- **Lamplight Amber** (#e0a85a): the one accent. Primary buttons, the selected chip, the chosen vote, hot seat and meeting banners, the active tab underline, speaker names in the novel lines, timeline times, your own map chip, and the ring around anything that needs you now. It also tints at low strength: 5% to 20% fills for "this is yours" or "new" (your intro step, a fresh feed row, your private chat bubble, a selected art tile).
- **Burnt Ink** (#1b1408): text and icons on amber. Never used anywhere else.

### Secondary
- **Ember Warning** (#e0715a): the danger role. Wrong answers, an "End game" ghost button, the low-time countdown, Point-at buttons (60% border, 15% hover fill), the far end of the suspicion meter, the culprit badge, error notes at 15% fill. In a world it is always rebuilt at hue 30.

### Tertiary
These fixed hues do not follow the room. They mark meaning, not mood.
- **Right Green** (#36d097, Tailwind emerald-400): the tick on a right answer in the feed and the chat.
- **Hidden Violet** (#a58af6, Tailwind violet-400 at 70%): the left stripe on "You don't know yet", "What drives you" when locked, and "What you never knew" or "They never knew" at the reveal.
- **Whisper Violet** (#8b5ef3, Tailwind violet-500 at 15%): the fill behind a secret note in the private chat.
- **Public Sky** (#3abaf4, Tailwind sky-400 at 70%): the left stripe on card sections everyone can see ("Everyone knows", "How to play").
- **Tension Ember** (#e0603a): the warm tint mixed into the screen edges as tension rises, up to 60% of the mix with the world accent and at most 25% opacity.

### Neutral
- **Night Room** (#141217): the page background and the bottom sheet.
- **Smoke Card** (#1d1a21): every panel, chat bubble, banner card and the map ground.
- **Raised Smoke** (#26222b): muted fills, secondary buttons, unselected chips and vote options (at 40% to 60%), skill bar tracks, popovers.
- **Candle Paper** (#f1ebe3): body text and titles.
- **Ash Note** (#a49c92): helper lines, labels, inactive tabs, timestamps, minor characters.
- **QR White** (#ffffff): the only pure white surface, behind QR codes so phones can scan them.
- **Shell neutrals** (#0a0a0a, #171717, #fafafa, #a1a1a1): the stock shadcn dark greys. They show only on screens outside the world room (Saved games, Music lab). Borders are always text at 12%, inputs text at 16%, scrims black at 50% (sheets) and 60% (the intro).

### Named Rules
**The One Lamp Rule.** A screen has one accent, the world's. It marks what is yours or what needs you now. If amber is on more than a fifth of a phone screen outside a banner, it has stopped meaning anything.

**The Same Role Rule.** Never pick a colour by its look. Pick its role (background, card, raised, text, muted, accent, on-accent, danger) and let the room fill it. A hard-coded hex will be wrong in the next world.

**The Contrast Contract Rule.** Every world palette passes 4.5:1 or falls back to the house palette. New colour pairs must be added to that check, not trusted.

## 3. Typography

**Display Font:** the world's display face (house: Playfair Display, with Georgia, serif)
**Heading Font:** the world's heading face (house: Playfair Display, with Georgia, serif)
**Body Font:** Inter (with system-ui, sans-serif) in every world
**Label/Mono Font:** Inter for labels; the system monospace stack for clocks and times

**Character:** each world gets a font pair from a fixed list of fourteen, so the titles carry the setting while the body never changes. The pairs (display / heading): noir-serif (Playfair / Playfair, the house pair), royal-deco (Cinzel / Cormorant Garamond), cozy-rounded (Fredoka / Fredoka), old-typewriter (Special Elite / Courier Prime), neon-grotesk (Unbounded / Space Grotesk), gothic-ink (Pirata One / EB Garamond), storybook (Fraunces / Fraunces), modern-clean (Geist / Geist), tropical-script (Pacifico / Karla), vintage-press (Abril Fatface / Libre Baskerville), handwritten-note (Caveat / Karla), poster-bold (Bebas Neue / Oswald), terminal (JetBrains Mono / JetBrains Mono), marquee (Rozha One / Marcellus). All are self-hosted at build time with no preload, so play never waits on a font request. Geist is the shadcn sans; it shows only off-world and as the modern-clean titles.

### Hierarchy
- **Display Hero** (400, 3.75rem, 1.25): the full-screen round title on the table. Display face. Once per round, for six seconds.
- **Display** (400, 3rem, 1.25): page titles on the table and the join screen; 2.25rem on phone waiting and final screens; 1.875rem for your character's name on the card. Display face. Big titles only, since a display face may be a script or deco face.
- **Headline** (400, 1.5rem, 1.333): section titles (setup groups, sheet titles, briefing step titles); 1.875rem for the hot seat name and the intro name. Heading face.
- **Title** (400, 1.25rem, 1.375): the case question, this round's job, the quick question, music direction names. Heading face. This is "readable emphasis", so the heading face must stay legible.
- **Body Reading** (400, 1.125rem to 1.25rem, 1.625): the table's read-aloud text (briefing, reveal story) and the phone's moment and whisper lines.
- **Body** (400, 1rem, 1.5): phone default for chat, cards and answers. Inputs are 1rem on phones so iOS does not zoom, 0.875rem from the md breakpoint.
- **Body Small** (400, 0.875rem, 1.43): the most used size. Feed rows, alibis, results, panel details, chips.
- **Micro** (400, 0.75rem): "only you see this" notes, helper lines under a field, counts.
- **Label** (500, 0.7rem, 0.12em, uppercase): the small caps line above every panel ("This round, your job", "Your secret goal"). Ash Note colour.
- **Timer** (400, 2.25rem on the table, 3rem in the hot seat banner, 1rem on phones; tabular figures): countdowns and timeline times, always monospace so digits do not jump.

### Named Rules
**The Character At The Edges Rule.** The display face is for page and round titles only. The heading face is for section titles and the one-line case or job. Body text, buttons, chips, labels and inputs are always Inter. If a paragraph is set in Pirata One, it is broken.

**The Glance Rule.** A phone line is read in two seconds while someone is talking. Keep phone body at 1rem or above for anything the player must act on, and never set a paragraph wider than the 28rem column.

## 4. Elevation

The system is flat and tonal. Depth comes from three surface steps (Night Room, Smoke Card, Raised Smoke, each a little lighter) and from rings and fills that mark state: a 1px amber ring at 40% for a prompt that asks you something, a 2px amber ring for the vote you must answer, your moment, or the best play. Shadows appear only on things that float over the page: alert banners, the reminder card, the rejoin panel and the front of your character card. Glass blur is used only on sticky bars and the round title overlay so the content under them stays legible. The table adds atmosphere behind everything (a slow mesh gradient from the room's four colours, particles, a blurred world picture at 22% opacity), always at z-index below the content and masked out of the central reading column.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`): banners that interrupt (the story turns to you, hot seat, meeting), the rejoin panel, the character card faces.
- **Notice** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`): the sticky call banner on phones and the reminder card.
- **Lift** (`box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)`): the selected half of the "To the room / Private" switch and the pinned vote tray.
- **Drag** (`box-shadow: 0 6px 20px rgb(0 0 0 / 0.5)`): a map place while the host drags it.
- **Here Ring** (`box-shadow: 0 0 0 2px` accent at 35%): the map place you are in.
- **Story Beat** (`box-shadow: inset 0 0 140px 24px` accent at 35%): the edge glow on a story turn. Fades in and out once over 2.5s.

### Named Rules
**The Flat Reading Rule.** Reading surfaces never float. A panel is a solid card on the background, with no shadow. If a panel needs a shadow to stand out, the surface steps are wrong.

**The Edges Only Rule.** Every atmospheric layer (texture, ambient, vignette, tint, backdrop picture) is either very faint or masked out of the middle 34rem to 52rem of the screen. On screens under 40rem the ambient drops to 35% opacity. The reading column never changes with mood.

## 5. Components

Components are shadcn primitives (Radix, the "radix-nova" style) styled only through the CSS variables the room writes, plus a small set of game components. Their character is calm and roomy: soft corners, generous padding, one clear action per prompt.

### Buttons
- **Shape:** gently curved (10px radius); small buttons 8px.
- **Primary:** amber fill, burnt ink text, 0.875rem medium, 32px tall with 10px side padding. Large is 36px. The hero action on a screen ("Make our mystery", "Join") is 48px with 1.125rem text and spans the column.
- **Hover / Focus:** primary hover drops the fill to 80%. Focus shows the room's accent as the border plus a 3px ring at 50%. Press moves the button down 1px. Disabled is 50% opacity with no pointer.
- **Secondary:** raised fill, candle text; hover mixes in 5% text. Used for "Back", "No", "Show everyone", "Go to …".
- **Ghost:** no fill; hover shows raised at 50%. Used for "Not now", "Close", "Say it my way" and host tools.
- **Destructive:** danger at 20% fill with danger text. In practice the app uses a ghost with danger text for "End game".
- **Confirm pattern:** anything that cannot be undone ("End game", "Next round") needs a second tap within 3 seconds; the label changes to "Tap again".

### Chips
- **Style:** fully round pills. Unselected is raised at 40% with a 12% border; hover turns the border amber. Small chips are 4px by 10px at 0.875rem; full chips 6px by 14px.
- **State:** selected is a solid amber fill with burnt ink text. Pressing scales to 95%. Setup choices are a Radix toggle group so they work as a radio set. Read-only status pills (players ready, players here) use a plain raised fill; ready players turn amber.
- **Tip chips:** round pills that drop a suggested action into the composer ("Try: …"); hover turns border and text amber.

### Cards / Containers
- **Corner Style:** panels 18px; boxes inside panels 14px; small rows 10px or 8px.
- **Background:** panels on Smoke Card; inside a panel, boxes use Raised Smoke at 40% to 60% or an accent tint at 5% to 15%.
- **Shadow Strategy:** none at rest (see The Flat Reading Rule).
- **Border:** usually none. A case box uses an amber border at 30% over a 5% amber fill. Character card sections use a 4px left stripe: amber for private, Public Sky for public, Hidden Violet for hidden.
- **Internal Padding:** 16px or 20px on phones; 20px to 24px on the table; 32px for the table's read-aloud briefing.

### Inputs / Fields
- **Style:** 1px stroke at text 16%, fill at 30% of that, 10px radius, 32px tall by default. Key fields grow: the setup "Where is it?" field is 44px, the join name is 48px at 1.125rem. Textareas size to their content from 64px. The phone composer and notes set the fill to Smoke Card.
- **Focus:** the border turns to the accent with a 3px accent ring at 50%.
- **Error / Disabled:** invalid shows a danger border and a 3px danger ring at 20% to 40%. Disabled is 50% opacity.
- **Field label:** the uppercase Label above, a Micro helper line below.

### Navigation
- **Phone top bar:** solid background (no blur), round name in the heading face and amber on the left, the clock in monospace on the right, then a row of round outline pills (Me, Goals, Clues, Map, People, Case file) that open bottom sheets. A small amber dot on a pill means something new.
- **Bottom sheets:** slide up 40px with a black 50% scrim, top corners 22px, Night Room fill, max 85% of the screen tall, a headline title and a ghost "Close".
- **Line tabs:** the table's side panel (Map, Timeline, Alibis, Clues, People) and the phone's reading tabs (Story, My card). Inactive text is Ash Note; active is candle (table) or amber (phone), with a 2px amber underline that slides between tabs. Counts show in amber when new.
- **Sticky bars:** the table header and media bar are background at 85% with blur; the phone composer bar is solid.

### Chat Stream (signature)
The phone's main surface. Public lines are small rows with a 20px icon column. Private exchanges are bubbles (18px radius, 12px padding, at most 88% wide): your own lines sit right on amber at 15%, the GM's on Smoke Card, secret notes on Whisper Violet at 15%, system notes on danger at 15%. Replies render as a page of a novel: narration in italics, speech with the speaker named once in the heading face and amber. Round starts are a centred amber uppercase divider between two hairlines. A "+1 Searching" chip floats up and fades over 2.4s from a scoring reply.

### Alert Banners (signature)
Moments that need the room. A solid amber banner with burnt ink text, 18px radius, 20px padding and the Float shadow: "the story turns to you", the hot seat (name in the heading face at 1.875rem, clock in monospace at 3rem), a meeting. On phones the same moments pin into the bottom tray above the composer with an amber fill at 15% to 20% and a 2px amber ring. A point ("X suspects Y!") is a card with a 2px danger border instead. The phone's call banner sticks to the top and pulses unless reduce-motion is on.

### Character Card (signature)
A two-sided card that flips in 3D over 0.6s (ease cubic-bezier(0.2, 0.7, 0.2, 1)). The front is a diagonal wash from amber at 25% into Smoke Card with the name in the display face; the back is plain Smoke Card. Sections below follow the stripe colours in Cards. A culprit's card uses the same layout, colours and length as an innocent's.

### Map (signature)
Drawn as HTML and SVG. The ground is the card colour lightly mixed with a terrain hue; ink, paths and water are mixes of the text colour and a fixed water blue at low strength, so terrain is always quieter than the place names. Places are small solid cards (background fill, 1px border, about 10px radius) with people as round chips: players outlined in amber, you filled amber, GM characters muted, minor ones dashed. A moved chip glows amber for 2.4s. The map is 16:10 on wide screens and 3:4 on phones.

### Motion
Short and soft. Entrances fade and rise 6px to 24px over about 0.25s to 0.35s; choices scale to 95% to 97% on press; status pills spring in. The reveal is the one staged sequence (verdict, story, then each card turning over with a 0.35s stagger, confetti on the table only when the detectives win, and on a phone only for a right pick or the best play). Ambient layers drift on long loops (0.7s rain to 55s dust) and speed up by at most half again with tension. With reduce-motion, ambient layers, film grain, shimmer and the beat animation all switch off, and motion components follow the user setting.

## 6. Do's and Don'ts

### Do:
- **Do** take every colour from a role (background, card, raised, text, muted, accent, on-accent, danger) so the room can relight it. The house values are only the default.
- **Do** keep reading text on solid surfaces (Night Room or Smoke Card) in Inter, and keep the world's character fonts to display and heading roles.
- **Do** keep mood at the edges: texture, ambient, vignette and tint stay masked out of the central reading column, and the story beat glows the edges once, never the content.
- **Do** use the 18px panel, 14px inner box, 10px control and full pill radii. Nothing else.
- **Do** mark state with an amber ring or a 5% to 20% amber fill, not a shadow.
- **Do** size the table for the sofa: titles at 3rem, read-aloud text at 1.125rem or more, clocks at 2.25rem or more.
- **Do** make a culprit's phone look exactly like an innocent's: same sections, same colours, same lengths. No screen may reveal a side by its layout.
- **Do** respect reduce-motion and the Calm switch on every new effect, and drop heavy table effects when the screen runs under 40 fps.

### Don't:
- **Don't** build "a SaaS dashboard: cards of settings, stats and pills everywhere; a tool, not a game." Show only what can change this game; fold rare choices into "More options".
- **Don't** put "a wall of text: long paragraphs on a phone during a loud room." One idea per line, one action per prompt.
- **Don't** make "a turn-based board app: waiting for your turn, greyed-out screens, nothing to do." A choice that cannot change anything is hidden, not shown disabled.
- **Don't** use "cheap horror or neon gamer: blood-splatter fonts, RGB glow, skulls, mystery-game clichés." The neon-grotesk and gothic-ink pairs are for titles in those worlds, never for body text.
- **Don't** add new Tailwind palette hues (emerald, violet, sky, white) or raw hex in components. They ignore the room and skip the contrast check. Add a role instead.
- **Don't** put text on the danger colour in pure white. Pair a danger fill with a defined on-danger role, as amber pairs with Burnt Ink.
- **Don't** use glass blur on reading panels. Blur is for sticky bars and overlays only.
- **Don't** hand-roll a new pill or panel style. Reuse the chip, panel and label patterns above, with their paddings.
- **Don't** let any effect become louder than a place name or a line of text. If you notice the ambient while reading, it is too strong.
