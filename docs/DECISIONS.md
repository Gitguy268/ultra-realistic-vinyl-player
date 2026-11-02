# Decisions

Each entry records a choice, what it rests on, and what it costs. "User" means the user decided
it on 2026-10-25. PARITY.md's conflicts table (C1–C18) holds the choices between the two
originals; this file holds everything else and the reasons behind the larger ones.

## Made with the user

**Hero files.** The overhead PNG has no SOURCES.md row, and v19 carries a REHIFI.SE watermark.
Both are grade B and used for proportion only. The overhead is rectified by a homography from
the four plinth corners before any measurement, and the 2 % overlay gate uses it. v19 is used
with its watermark masked. Every grade-A claim cites v4, v13 or another grade-A photo.

**Pitch.** The wheel's range is the real ±6 %. Deck setting "Extended pitch (±8 %)" restores
the originals' range, and a saved ±8 % value is kept when it is on (and clamped to ±6 % when it
is off). Cost: the originals' default range shrinks; nothing is lost.

**Motor plate.** The speed plate is the real one: 78 · 45 · OFF · 33, with 78 reachable only
while the recessed unlock pin is held (or latched by a click on it). The App's `M` key and
H1's ⏻ button stay, as shortcuts that slide the plate to OFF and back to the last speed. The
App's three speed keys become twins of the plate's detents.

**One source, two outputs.** html-2's `index.html` is built from the app's source by
`vite.single.config.ts`. The html-2 repository holds the built file, its tests and its docs;
`npm run sync` in the app copies the file across and does nothing else.

**Storage profiles.** Each output keeps its original's storage, chosen at build time by
`PROFILE` (PARITY.md §5). The app profile keeps IndexedDB `vinyl-library` and
`realistic-vinyl-player.*`; the html profile keeps `vinyl-db` v2 and `vinyl-prefs` /
`vinyl-tracks` / `vinyl-deck`, which the original Vinyl-Player also reads. The Winamp EQ uses
the App's settings field in the app profile and the shared `vinyl-eq` / `vinyl-eq-presets`
keys in the html profile, because every single-file player on `file://` shares one
localStorage. Data is never migrated between profiles.

## Parity

**Pinned originals.** Parity is measured against the stamp in `docs/reference-stamp.json`
(written 2026-10-25 22:53 UTC). The originals are still changing: H1 is due to get the Winamp
EQ round. `scripts/reference-stamp.js --check` runs at every gate. When it reports drift, the
new behaviour gets PARITY rows and is ported before that gate closes.

**One DOM, two test suites.** Both builds have one DOM, with the App's element ids. html-2's
ported `test/verify.js` and `test/extra.js` keep every assertion. Three things change in how
they reach the page, and nothing else:

- `test/ids.js` maps H1's ids to the new ones (`#playBtn` → `#play` and so on);
- drags aim through `__deck.project(worldPoint)` instead of H1's turntable-box pixels;
- record sizes are read from `__deck` scene getters instead of `offsetWidth`.

PARITY.md §7 lists every such contract. The App's `check-deck` also aimed its drags with the 2D
geometry of `#platter`; it aims through `__deck.project` as well.

**App checks that change.** `check-deck`'s "motor off lifts the needle" becomes "motor off
leaves the needle down and the music winds down" (C15: a real deck does that, and H1's verify
pins it). `motor.test.ts` asserts against the exported time constant instead of 0.9 s (C1).
`check-deck`'s natural-end wait grows by the run-out and the three locked-groove turns that the
merged record model adds. `check-library` stops playback with Start before its queue checks, where it used to wait for a
two-second track to end and the arm to return: the stylus now rides on into the next track
(C19). `check-loading` waits 5 s instead of 2.5 s before checking that a track started from its
side's beginning: the stylus first rides the 2 s lead-in groove (H21). These are the only App
assertions that change; how the drags are aimed changes, as above.

**End of side (C5).**

- **START.** The optoelectronic end stop trips after three turns in the locked groove (H1's
  tested timing; the real trip point is not documented). The arm lifts and the motor stops.
  The arm then swings back to its rest, as both originals do and test.
- **M.** Nothing happens: the stylus rides the locked groove, thumping each turn, until the
  user acts.
- **New Deck setting "Return the arm after the end stop"** (default on). Off gives the real
  MK II: the arm stays lifted over the run-out.
- **H1's "Auto-return" checkbox** stays, as the twin of the M/START plate (on = START).

## Fidelity

**Plates travel along X, not Z.** The brief's §4 lists "plates (Z travel)". The grade-A photos
show each plate's detent labels side by side along the strip: "78 45 OFF 33" under the speed
plate (v16, v11), and "M" and "START ▸▸" either side of the second plate (v13). So the plates
slide along the strip, which is the world X axis. The photo decides visible form, as the brief's
§3 asks.

**Strobe.** The slotted platter rim is the strobe: 90 slots for 33⅓ rpm at 50 Hz, and 108 when
Mains is set to 60 Hz. The 45 adapter carries its own marks. There is no strobe at 78 rpm. The
neon lamp sits under the platter edge behind the pitch wheel and flickers at twice the mains
frequency, which is what makes the slots stand still in the render. Both originals drew a
strobe that stood still at every speed. That look is kept only in the 2D fallback deck, where
there is no real lamp.

**No power LED.** The App drew a power LED. The real strip has none: the one dot left of the
speed plate is the clear 78 unlock pin (v11). Power shows the way it does on the deck, as the
neon strobe glowing through the rim slots, and the ⏻ twin's pressed state.

**Fixed highlights → real reflections.** H1's "two fixed highlights" were a world-fixed conic
gradient. Here they are the actual reflections of the window and the lamp on the record and
the cover. They stay fixed in the room because the lights do.

**Wow and flutter.** The audio keeps the App's model (0.12 % wow at 0.73 Hz, 0.05 % flutter at
6.7 Hz) and H1's in-worklet model under the Imperfection setting. The deck's published 0.045 %
is recorded in REFERENCE.md. The audible character is a feature the brief requires to survive,
so it is not tuned down to the spec.

**Motor time constants (C1).** τ 0.45 s for spin-up (95 % of speed in about 1.4 s) and 1.0 s for
the coast (under 5 % after 3 s). The brief and H1 agree on these, and H1's verify pins them. The
App's 0.9 s / 1.6 s are replaced.

**Pitch wheel.** No mechanical centre detent is evidenced, so the wheel has none. H1's software
snap (|pitch| < 0.35 % → 0) is kept as a soft detent, and double-click resets.

**Plinth heights.** W1 gives 130 mm with the cover closed, and W3's 445 × 355 × 130 mm agrees.
The v15 and v17 elevations, scaled by the plinth's width, give a 62 mm top plate and a 68 mm
cover. The 12 mm recessed skirt and feet sit under that. Gate 2 checks these against side
views.

**Plan layout from a solved camera.** The overhead is a perspective view, so positions come
from a camera solved on its plinth corners. Each raised part is located at its own height
(REFERENCE.md, Plan measurements). A flat homography had put the platter 13 mm too far back.
The arm pivot sits 206.5 mm from the spindle, as W3's geometry requires; the photo agrees when
the pivot cap is 39 mm above the top plate. The platter keeps its published 300 mm.

## Deck state: who owns what

One owner per quantity. Everything else reads it.

| Quantity                                                                  | Owner                                       | Notes                                                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Plate detents, motor power, the end-stop trip                             | `core/plates.ts` › `Plates`                 | the speed radios, M and ⏻ are its twins                                                  |
| Speed settings: preset, pitch, power                                      | `turntable/motor.ts` › `Motor`              | powered = `Plates.motorOn`; the 2D fallback reads its rpm                                |
| Platter speed and angle, record angle, slip, hand, strobe                 | `core/spin.ts` › `Spin`                     | integrates toward the motor's target with the spec's τ (C1), closed-form in elapsed time |
| Arm direction and lift, cue states, return                                | `core/arm.ts` › `Arm`                       | replaces the App's 2D `CueMechanism`; works in plan radians and record radii             |
| Record layout, what lies under the stylus                                 | `core/program.ts` › `Program`               | built from the queue order, sides and record size                                        |
| Which track is current; the order                                         | `player.ts` › `Player` + `library/queue.ts` | unchanged                                                                                |
| Audio position within the current track                                   | `audio/engine.ts` › `AudioEngine`           | one track at a time, as in the App                                                       |
| Mapping stylus ↔ (track, time), track changes as the stylus crosses a gap | `deck.ts` › `Deck`                          | the only module that talks to all of the above                                           |
| Part transforms in the scene                                              | `scene/deck/pose.ts`                        | reads the owners each frame; owns nothing                                                |

The App's tonearm geometry (`turntable/tonearm.ts`) stays only for the 2D fallback deck.

**Twins of the plates.**

- **Speed radios.** With the speed plate on OFF, a radio presets the speed the plate returns to.
  It does not start the motor; neither original's speed keys did. With the plate on a speed, the
  radio slides the plate there.
- **The 78 twin.** It presses the unlock pin and slides the plate, the whole gesture in one
  click. html-1's tests click a "78" button directly. On the 3D plate the interlock is real:
  without the pin, 78 is refused at 45 with the interlock sound.
- **Transport and cue plate.** Play lowers the cue plate. Pause lifts the stylus without moving
  the plate, as the App's START never touched the lever, so a drag after a pause still plays.
  Only the cue plate and L raise it; with it raised, a dragged arm hovers where it is let go.
- **Cue plate default.** It starts lowered, as both originals' levers did.

**Scratch default.** The App's scratching was always audible; html-1's Scratch checkbox started
off (a silent scrub with a whoosh). The merged checkbox starts on, the App's documented
behaviour, and off gives html-1's scrub.

**The camera stays in the room.** Orbit and dolly are clamped to the polar limits, to an
azimuth in front of the back wall, and to the room's bounds less 8 cm. The clamp applies to the
goal and to every frame of a move, because an eased path between two valid poses can swing past
a wall. The intro's first keyframe and the fourth tour stop were moved inside the room for the
same reason. Narrow screens (≤ 760 px) rest at the pulled-back mobile stop.

**Framing around the floating panels.** The camera's principal point is moved to the centre of
the rectangle the drawer, top bar and strip leave open (`setViewOffset`). The deck is then
framed in the visible part of the page at every size, without changing the lens.

## Look and themes

**Finishes and themes are presets, not CSS.** Each finish swaps the plinth material and, where
it needs one, the lighting. H1's themes map onto finishes: Minimal → Anthracite (the hero
grey), Wood → Walnut, Clear → Clear acrylic. A sixth finish, "Black (TD 115 MK II)", adds the
black production colour (v74, v75, v76, v92). It is never blended into the hero.

**Light and dark.** Dark mode is the dusk preset: the tungsten lamp on, the window low and
blue. Light mode is the daylight preset: the window bright and the lamp off. "Auto" follows the
system.

**Custom colours.**

- **Background** paints the wall. It goes through the renderer's colour pipeline, so it shows
  lit, not flat.
- **Panel** and **Text** colour the floating DOM surface.
- **Accent** colours the UI and the bass glow, and is the fallback label ink.

The App's low-contrast warning and Reset apply to all four.

**Room.** A warm late-1970s room at dusk: wall, window with overcast light, a tungsten lamp, a
walnut credenza, a few LP spines and the deck's cables. Every texture is procedural. No real
room is copied.

**Room layout.** The window is in the left wall, so its overcast light falls across the deck
from the left. The tungsten lamp stands on the credenza to the right. The credenza stands against
the back wall, with the deck 20 mm back from its front edge. A first layout put the window in the
back wall, which only backlit the deck and left the strip reflecting a dark room.

**Exposure in EV, light in physical units.** The window gives lux and the lamp lumens, and the
camera exposes at EV100 = log2(incident lux / 2.5): 6.4 at dusk, 9.6 in daylight. Bounced light
is a hemisphere fill at 30 % of the direct light on the deck. The room is captured into a PMREM
environment from the deck's position, with the deck hidden, so every reflection on the deck is
this room.

**Textures are baked once on the GPU and kept.** Each procedural surface is a fragment shader
rendered into a target, read back into an ordinary texture, then tiled per part. A render
target's texture cannot be cloned for tiling: a clone uploads an empty image, which showed up as
sparkle and black walnut. The baked surfaces take 33.9 MB with mipmaps. The record's three maps
(2048² roughness, 1024² anisotropy and albedo) add 33 MB and are redrawn only when the program
changes.

**Grooves are anisotropy, not geometry.** The record's anisotropy map points along each groove,
so the highlights form the two wedges a real record shows, and they stay put while it turns. The
roughness map holds one ring per texel, shaded by each track's loudness. Gaps, the lead-in, the
run-out and the locked groove are smoother land.

**Brushed metal without a normal map.** At viewing distance a normal map of brush strokes
aliases into sparkle. The brushing is carried by the anisotropy and by streaks in the roughness.

**The cover casts no shadow.** Shadow maps treat transmissive meshes as opaque, and a full
shadow from smoked acrylic that passes about half the light looks wrong. No shadow is closer to
what the acrylic does.

**Contact shadow.** A soft darkening under the plinth, baked once from its footprint, stands in
for the light the skirt and feet block. The key light's shadow map handles everything else and
is rendered only when the lighting changes.

**Moved from Gate 3 to Gate 6 (detail passes).** These belong to materials and environment but
are detail, so they are built in the detail passes and checked off there:

- the cover's black-tinted edges (v65) and the edge glow where light pipes through the acrylic;
- dust in the air, caught in the window light;
- the silkscreen, wordmark and model lettering (painted onto the strip as textures);
- dust in the seams, swirl on the plate tops at macro distance, and the belt witness mark.

**What the budgets count.** `scripts/check-perf.js` reports every figure separately.

- **Draw calls < 150** counts the scene pass, which includes three.js's transmission pre-pass
  (it redraws the opaque objects behind the cover). The post chain's ten fullscreen passes and
  the shadow update are reported apart: the post passes cost no geometry, and the shadow update
  runs only when something moves.
- **Texture memory < 100 MB** counts what the scene samples: baked surfaces, the record's maps,
  the shadow map and the environment.
- **Render targets** (the HDR scene buffer, the half-resolution transmission buffer and the
  bloom chain) scale with the canvas and are reported beside the budget, not inside it.
- **Measured at Gate 3** (Apple GPU, Chromium through Metal): 109 scene calls; 90.5 MB of
  textures; 159 MB of render targets at 1440×900, before the transmission buffer was halved.
  With vsync off, the median frame was 6.8–9.7 ms at 1440×900 DPR 1 and 6.2–9.2 ms at
  390×844 DPR 2 across runs.
- **Room meshes are merged.** Static room pieces that share a material are one mesh: window
  frame, credenza, legs, sleeves and leads. The one-mesh-per-part rule applies to the deck.

**Shadows follow the parts.** The key light's shadow map is redrawn only when something moves:
a lighting change, the cover, the arm or a plate. It runs as its own pass before the frame. Run
inside the post pipeline's scene pass instead, the update raised WebGL sampler errors in Chromium.

**Wordmark.** THORENS is drawn from the vector paths traced from v65 (`src/spec/wordmark.ts`).
"TD 115 MKII" is set in Inter at weight 600 with 0.08 em tracking. Inter is the closest
grotesque already shipped by the App, and adding a second font family for eleven glyphs would
cost more than it gives.

## Engineering

**Three.js 0.186.1**, imported from `three` and `three/examples/jsm` only. No other 3D library.

**Single-file feasibility (checked 2026-10-25, before any product code).** A throwaway build of
three.js with PMREM, a transmission material and butterchurn came to 926 kB (219 kB gzipped).
It opened from `file://` in Chromium, Firefox and WebKit with no request beyond the file
itself and no console errors. WebGL 2 came up in all three, and an AudioWorklet inlined as a
string rendered audio in all three: Firefox accepted the Blob URL, while Chromium and WebKit
needed the `data:` fallback, exactly as H1 found.
Running html-1's `lint.js` rules over it found three problems, and `vite.single.config.ts` fixes
each one:

- **Vite's module-preload polyfill calls `fetch`.** Fix: `build.modulePreload.polyfill = false`.
- **Two URL comments sit inside three.js GLSL strings** (`jcgt.org`). Fix: a pre-transform
  strips comment lines that hold only a URL from `node_modules/three`.
- **three.js's `log` helper calls `console.log`.** Fix: the same transform rewrites it to
  `console.warn`. The messages still appear; lint bans only log, debug and info.

After the build, a scrub step fails the build if any outside URL, `fetch(` or `console.log(`
remains. The same step leaves the licence headers' URLs alone, because NOTICE carries them.

**Worklet in the single file.** As in H1: the worklet source is a string, loaded through a Blob
URL, with a `data:` URL as the fallback that `file://` needs in Chromium and WebKit.

**Hidden tab.** Rendering stops when the page is hidden. As in H1, a 250 ms `setInterval` keeps
the deck physics and the playback logic running.

**No framework, no backend, no network.** The app's service worker precaches everything. The
single file makes no request beyond itself.
