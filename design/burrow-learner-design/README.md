# Burrow learner screens: design brief

These three files are the approved designs from the "Burrow screens" canvas.
They are design references, not code to copy. They use a design-canvas format:
`<sc-for list="{{x}}" as="y">` is a loop, `{{...}}` is a value, and the
`class Component extends DCLogic` script at the bottom holds the sample data.
Build the real screens in the app's own React code and styles.

| File | Screen | Size |
|---|---|---|
| portfolio.design.html | Learner: my portfolio | desktop, 1440 wide |
| add-evidence.design.html | Learner: add evidence | desktop, 1440 wide |
| phone-quick-capture.design.html | Learner on a phone: quick capture | phone, 390 wide |

The sample data (Alex Testlearner01, ST0072, 11 of 18 KSBs, the K/S/B titles,
the two feedback notes) is placeholder only. Real screens use real data.

## Look and feel (Burrow = Rarebit fonts and palette, in Burrow's clay colour)

- Fonts: Fraunces 600 for headings, DM Sans 400/500/700 for everything else.
- Page background #F6EEDC (cream). Cards #FFFBF2 with a 1px #E4D6BA border, 20px corners.
- Text #2A1F17 (ink); secondary text #4A3A2C; muted #6B5440.
- Burrow accent (clay) #B4532A: primary buttons, the logo arch, checkbox accent.
  Links and the active nav pill text #8E3F1F on #F6DDD2.
- Inputs: 48px high, 1.5px #D9C7A4 border, 12px corners, #FFFBF2 fill.
- Buttons: pill shaped (999px). Primary = clay fill, cream text. Secondary = 1.5px ink outline.
- Burrow logo: the arch SVG in the header of each design file. Use it as-is.
- Footer: Skills England logo and the Open Government Licence line, as already used in Warren.

## KSB status colours (one set, used everywhere)

| Status | Bar / swatch | Chip background | Chip text |
|---|---|---|---|
| Signed off | #2E5A4C | #DDEBE3 | #1F4238 |
| Awaiting review | #E9A23B | #FBE7C2 | #6B4410 |
| Needs changes | #B4532A | #F6DDD2 | #8E3F1F |
| Not started | #E4D6BA | transparent, 1px #B8A27E border | #6B5440 |

## Screen 1: my portfolio

- Header: Burrow logo, nav pills (My portfolio, Add evidence, Feedback (n)), learner name and initials.
- "Hello, {first name}", then the standard's reference, name and level.
- Progress card: "{x} of {y} KSBs signed off", "{n} waiting for your assessor",
  a stacked bar in the four status colours, and a legend.
- Three columns: Knowledge, Skills, Behaviours. Each lists every KSB with its
  ref, short title and a status chip, and "{x} of {y} signed off" at the top.
- Right sidebar: big clay "Add evidence" button; "Feedback for you" (evidence
  that needs changes, with the assessor's comment); "Recent evidence" (title,
  type, KSB refs, status).

## Screen 2: add evidence

- Title; kind of evidence (Photo, Video, Document, Witness statement,
  Reflection only); when it happened (date); file drop area with "Choose a file";
  "What did you do, and what did you learn?".
- "Which KSBs does this show?": a checkbox for every KSB on the learner's
  standard, grouped Knowledge / Skills / Behaviours.
- Primary button counts ticks: "Send for review (3 KSBs)". Secondary: "Save as draft".
- Sidebar: green (#2E5A4C) "What makes good evidence" tips card; "Still to
  evidence" listing KSBs with no evidence yet.

## Screen 3: phone quick capture

- The phone version of adding evidence: four big tiles (Take a photo, Record a
  video, Upload a file, Write a reflection), a small progress card, a "needs
  changes" card, and a bottom nav (Portfolio, Add, Feedback).
- "Capture it now, add the details later": on a phone, a capture can be saved
  as a draft first and finished (KSBs ticked, sent) later.
- Photo and video tiles open the phone camera (file input with `capture`).
