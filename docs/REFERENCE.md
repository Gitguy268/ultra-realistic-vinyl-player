# Reference: Thorens TD 115 MK II

This file is the evidence behind every visible part of the 3D deck. Each claim is tied to a
grade-A photograph (and a crop of it in `docs/reference/crops/`), and to the code that implements
it. `tests/reference.test.ts` fails if a claim has no evidence or names a symbol that does not
exist in `src/`.

**No grade-C image influenced any modelling decision.** Grade-B images were used only for the
specific thing named against them below. The source photographs stay in the read-only folder
`~/thorens-to-115-mk-ii`. Only crops, contact sheets, walls and `INDEX.csv` are copied here.

## Corpus audit

The folder holds 104 images and `SOURCES.md` (23 MB; the brief estimated 48 MB). The brief's
"105 files plus SOURCES.md" counts one too many: `ls` lists 105 entries in all, `SOURCES.md`
included (v1–v103 and the overhead PNG). Each image has a
row in [`reference/INDEX.csv`](reference/INDEX.csv), and the six contact sheets are in
`reference/contact-sheets/`.

| Grade | Count | Meaning here                                                                                                                                                                                           |
| ----- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A     |    39 | Authentic photograph of a stock or lightly used TD 115 MK II (27 grey, 12 black)                                                                                                                       |
| B     |    30 | Authentic but altered: TD 115 MK I, aggregator re-hosts, modified or damaged units, brochures, cut-out backgrounds, the custom-cabinet underside, and the two hero files graded by the user's decision |
| C     |    35 | Watermarked (vintagechief, US/Canuck Audio Mart, HIFIDEALER, stereonet), other decks (Marantz, Panasonic, Micro Seiki, Onkyo), no source row, retouched silkscreen, or flagged synthetic               |

How the audit graded the files:

- **Verified traps.** These were applied as given: v2, the v49–v60 family, v102, v20, v21, v37,
  v103 (B, underside only) and v31 (B, brochure).
- **Watermarks.** Every visible watermark or corner logo made a file grade C, whatever else it
  showed. The one exception is v19, which is B by the user's decision.
- **Missing source rows.** v1, v2, v3.avif and the overhead PNG have no row in `SOURCES.md`.
  The overhead is B by the user's decision. The other three are C.
- **MK I units.** Several files show the earlier TD 115. On those strips the speed labels read
  45 / OFF / 33 only (no 78, no unlock pin) and the model badge reads "TD 115". They are B, and
  the claims below never use them.
- **Aggregator re-hosts.** v24, v38, v39 and v56 come from hifishark. They look authentic, but
  the original listing is unknown, so they are B.

### Hero unit

The hero is the **grey unit sold by Record Mart Hi-Fi**: v9, v11, v12, v13, v14, v15, v16 and v17
are one machine photographed from every side. It has a smoked cover, the black ringed mat and
the TP 30 arm with a TP 70 wand.

Two other files fill in for it:

- **v4** is the owner photo the brief names. It is the same model and finish, and it is the
  reference for a record being played and for the room-light look.
- **The overhead PNG and v19** are grade B, used for proportion only, by the user's decision on
  2026-10-25. The overhead is used after rectification, for the plan-view layout and the 2 %
  overlay gate. v19 is used with the REHIFI.SE watermark on its cover masked.

Other grey grade-A units fill only these named gaps:

| Gap                               | Filled from |
| --------------------------------- | ----------- |
| Silkscreen glyph shapes           | v72         |
| Clearest straight-on wordmark     | v65         |
| Lit strobe                        | v84         |
| Hinge blocks with the lid removed | v53         |
| Wear                              | v69, v73    |

Black units are never blended into the hero. They appear only as the optional "black plinth"
finish, which takes its colour from v74, v75, v76 and v92.

### Web references (3 of the 5 allowed)

None of these sources is shipped or traced. Each was used only to answer the open question
named against it.

| #   | Source                                                                                     | Grade                | Used for                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | stereonomono.blogspot.com, "Thorens TD 115" (it quotes a period test report of the MK I)   | B (MK I text)        | power-off at the centre detent of the speed plate; M versus START; the cue plate raising the arm when moved right and lowering it when moved left, both damped; the neon-lit slotted rim acting as the 33⅓ strobe; strobe marks on the 45 adapter; a "vernier" pitch control of ±6 %; magnetic antiskating set by a ring at the arm base; tracking force scale in mN; a cover that "remains open at intermediate settings"; four damped springs |
| W2  | hifi-classic.net TD 115 MkII review, quoted in a search summary (the page now returns 404) | B (unverified quote) | MK II end-of-side behaviour: in START the arm lifts and the motor switches off; in M nothing happens. The lift plate only latches "down" with the motor running                                                                                                                                                                                                                                                                                 |
| W3  | hifi-wiki.com, "Thorens TD 115 MK II" data sheet                                           | A for numbers        | the spec table below                                                                                                                                                                                                                                                                                                                                                                                                                            |

Two more fetches failed (vinylengine 403, manualmachine 403) and are not counted.

## Verified spec

Visible form follows the grade-A photographs; hidden dimensions follow these published numbers.
Every value lives in `src/spec/deck.ts`.

| Item            | Value                                                                                                  | Source                                  |
| --------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| Plinth          | 445 × 355 × 130 mm (W × D × H), 7 kg; black or grey                                                    | W3, brief                               |
| Platter         | 300 mm, 1.3 kg cast zinc alloy (Zamak); slotted rim; spindle                                           | brief, W1 ("2.5 pound cast zinc-alloy") |
| Mat             | rubber with raised concentric rings                                                                    | v16, v68                                |
| Drive           | belt; DC motor with 72-pole tachogenerator and electronic comparator                                   | W3                                      |
| Speeds          | 33⅓ / 45 / 78 rpm                                                                                      | W3                                      |
| Pitch           | ±6 %                                                                                                   | W3, W1                                  |
| Strobe          | integrated, neon-lit through the rim slots (33⅓); marks on the 45 adapter                              | W1, W3, v84                             |
| Wow and flutter | ≤ 0.045 % (DIN 45507); the brief rounds this to 0.05 %                                                 | W3                                      |
| Rumble          | −68 dB (DIN 45538)                                                                                     | W3                                      |
| Arm             | TP 30 with TP 70 end tube; 222 mm effective length, 15.5 mm overhang, 23° offset, 7.5 g effective mass | W3                                      |
| Shut-off        | automatic optoelectronic end stop with arm lift                                                        | W3                                      |
| Suspension      | sub-chassis on 4-point "ortho-inertial" springs                                                        | W3, W1                                  |
| Cover           | hinged; 130 mm closed / 400 mm open overall height                                                     | W1                                      |
| Built           | 1981–1984                                                                                              | W3                                      |

## Claims

Each row names a visible feature, the grade-A evidence (file and crop), and the code that
implements it. Paths are relative to `src/`.

| Feature                                                                                                              | Grade-A evidence                                                        | Implementation                                                                                |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Plinth top plate in grey metallic anthracite with a fine matte texture                                               | v16 `mat-and-label_v16`, v11                                            | `scene/deck/build.ts` › `buildPlinth`; `scene/materials/deck-materials.ts` › `applyFinish`    |
| Raised moulded arm-board area with a stepped, rounded contour around the arm, and a recessed well around the platter | v16, v68 `mat-top_v68`, v11                                             | `scene/deck/build.ts` › `mouldedTop`                                                          |
| Brushed-aluminium control strip on the top and front faces, with plinth-coloured end blocks                          | v16 `control-strip_v16`, v13 `strip-endcap_v13`                         | `scene/deck/build.ts` › `buildStrip`                                                          |
| Three flat plates with polished bevelled edges (the bevel reflects the silkscreen)                                   | v16 `plate-labels-speed_v16`, v13 `cue-lever-plate_v13`                 | `scene/deck/build.ts` › `buildStripFace`                                                      |
| Speed silkscreen "78 45 OFF 33" below the speed plate                                                                | v16 `plate-labels-speed_v16`, v11 `plate-labels-78-unlock_v11`          | `scene/materials/silkscreen.ts` › `paintSilkscreen`                                           |
| Recessed 78 unlock pin left of the speed plate, above "78"                                                           | v11 `plate-labels-78-unlock_v11`                                        | `scene/deck/build.ts` › `unlockPinDome`; `core/plates.ts` › `Plates`                          |
| Knurled pitch wheel in a round recess, with the scale "▮▮▮▮▮▮" beneath                                               | v16 `pitch-wheel_v16`, v11 `strobe-scale_v11`                           | `scene/deck/build.ts` › `pitchWheelDisc`; `scene/materials/silkscreen.ts` › `paintSilkscreen` |
| "M" left and "START ▸▸" right of the second plate                                                                    | v72, v13 `plate-labels-start-cue_v13`, v16 `plate-labels-start-cue_v16` | `scene/materials/silkscreen.ts` › `paintSilkscreen`                                           |
| Cue plate glyphs: ▼ on a bar (lower) on the left, ▼ over a bar (raise) on the right                                  | v72, v13 `cue-lever-plate_v13`                                          | `scene/materials/silkscreen.ts` › `paintSilkscreen`                                           |
| Wordmark "THORENS" with the swash under "RENS", and "TD 115 MKII", right-aligned on the strip's front face           | v65 `wordmark_v65`, v13 `wordmark_v13`                                  | `spec/wordmark.ts` › `WORDMARK_PATHS`; `scene/materials/silkscreen.ts` › `paintSilkscreen`    |
| Platter rim with one row of rectangular slots through the top outer edge and down the rim face                       | v13 `platter-edge_v13`, v11 `platter-edge-profile_v11`                  | `scene/deck/build.ts` › `buildPlatter`                                                        |
| Strobe lamp: warm orange-red neon glow seen through the rim slots                                                    | v84 `strobe-lit_v84`                                                    | `scene/deck/build.ts` › `platterSlotFloor`; `scene/materials/deck-materials.ts` › `neon`      |
| Machined bright lip on the platter's top edge                                                                        | v13, v16                                                                | `scene/deck/build.ts` › `buildPlatter`                                                        |
| Black rubber mat with raised concentric rings and a plain centre with an embossed "THORENS"                          | v16 `mat-and-label_v16`, v68 `mat-top_v68`                              | `scene/deck/build.ts` › `matName`                                                             |
| Polished steel spindle                                                                                               | v16, v13                                                                | `scene/deck/build.ts` › `spindle`                                                             |
| Arm base on an octagonal black plate                                                                                 | v16 `arm-pivot_v16`, v68 `arm-rest-and-lift_v68`                        | `scene/deck/build.ts` › `armBase`                                                             |
| Gimbal yoke: black housing with a concentric ringed top cap and side screws                                          | v16 `arm-pivot_v16`                                                     | `scene/deck/build.ts` › `gimbalYoke`                                                          |
| Silver counterweight on a rear stub behind the pivot, pointing toward the rear hinge                                 | v11 `counterweight_v11`, v16                                            | `scene/deck/build.ts` › `counterweight`                                                       |
| Straight black wand with a silver collar near the pivot (detachable TP 70)                                           | v16 `arm-pivot_v16`, v13                                                | `scene/deck/build.ts` › `wandCollar`                                                          |
| Black U-shaped arm-rest cradle with clip beside the pivot base                                                       | v16 `arm-pivot_v16`, v68 `arm-rest-and-lift_v68`                        | `scene/deck/build.ts` › `armRestCradle`                                                       |
| Arm-lift bar at the pivot base (brass adjuster visible)                                                              | v16 `arm-pivot_v16`                                                     | `scene/deck/build.ts` › `cueLeverBar`                                                         |
| Black headshell with white "THORENS" print and a bent silver finger lift                                             | v13 `headshell_v13`, v84 `headshell-cartridge_v84`                      | `scene/deck/build.ts` › `headshellBody`                                                       |
| Cartridge body with coloured tag wires                                                                               | v13 `headshell_v13`, v84 `headshell-cartridge_v84`                      | `scene/deck/build.ts` › `tagWires`                                                            |
| Smoked grey acrylic cover with thin walls and black-tinted edges                                                     | v16, v65 `strip-and-cover-edge_v65`, v12                                | `scene/deck/build.ts` › `coverEdges`                                                          |
| Two rear hinge blocks with a clear acrylic leaf                                                                      | v16 `hinge_v16`, v53                                                    | `scene/deck/build.ts` › `coverLeaves`                                                         |
| Hinge housing on the plinth with a dark circular disc on its outer face                                              | v11 `hinge-housing_v11`, v14                                            | `scene/deck/build.ts` › `hingeHousings`; `scene/deck/build.ts` › `hingeInsets`                |
| Coil springs in the hinges (spring-balanced, holds at any angle)                                                     | v15 `hinge-spring_v15` (with W1)                                        | `scene/deck/build.ts` › `hingeSprings`; `core/cover.ts` › `CoverHinge`                        |
| Rear: brushed-aluminium rear strip, rating plate, mains connector housing at right, signal cable exit at left        | v15 `rear-panel_v15`                                                    | `scene/deck/build.ts` › `rearFittings`                                                        |
| Dark cylindrical feet at the four corners                                                                            | v15 `feet_v15`                                                          | `scene/deck/build.ts` › `plinthDark`                                                          |
| Light patina: swirl on the plate tops, fine scratches on the cover                                                   | v73, v69                                                                | `scene/materials/surfaces.ts` › `plateRoughness`                                              |

## Plan measurements

The plan positions in `src/spec/deck.ts` come from the overhead PNG (grade B, proportion only,
by the user's decision). The photo is a perspective view from above and in front, so a flat
homography puts raised parts too far back: with one, the spindle's tip and base land 13 mm
apart on the plan.

`scripts/overhead-camera.js` therefore solves a pinhole camera (focal length and pose) from the
four plinth corners at their real heights. The corners fit to 0.57 px RMS. It then locates each
raised feature at its height. Results are in `reference/overhead-camera.json`.

| Feature                          | Plan position (mm from the plinth centre)  | Check                                                                                                                                       |
| -------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Spindle                          | (−46.2, −10.6)                             | tip and base land 0.9 mm apart, which validates the camera                                                                                  |
| Platter rim, widest row          | centre z = −12.2; diameter 292.7           | see the platter row in Disagreements                                                                                                        |
| Arm pivot (ringed cap)           | (136.5, −106.9) at −27.8° from the spindle | 206.5 mm from the spindle, which equals W3's 222 − 15.5 mm, when the cap is 39 mm above the top plate                                       |
| Strip, rear edge of the top face | z = 136.9                                  |                                                                                                                                             |
| Stylus tip, arm parked           | (142.1, 121.4)                             | pivot→stylus direction 88.6°; 228 mm at the assumed 20 mm tip height, against 222 mm, so the parked tip sits about 6 mm higher than assumed |

**v68 cross-check.** v68 is the grade-A near-plan photo. Its plinth corners are hidden by the
open cover and hinges, so no camera can be solved from it. A width ratio taken at the
platter's depth gives a platter of about 296 mm.

**What the 2 % gate means.** `check-overlay` projects the 3D deck through this camera into the
photo. It reports each feature's outline error as a share of the plinth width (445 mm). The
gate is a regression check that the geometry reproduces the measured layout. It is not an
independent measurement of that layout, because the layout came from this photo.

## Answers to the audit questions

**Platter rim.**

- **Construction.** Cast rectangular slots in one row, cut through the top outer edge and down
  the rim face (v13, v11), with a bright machined lip above (v13, v16).
- **Slot count.** I measured 96 ± 8 from two unwrapped arcs of the rectified overhead, which is
  grade B and counts as proportion only. The model uses **90**, the count at which the slots
  stand still at 33⅓ rpm under a 50 Hz neon lamp (W1: the rim is the 33⅓ strobe). A 60 Hz unit
  needs 108; that number is derived from the physics, not photographed. The model swaps to
  108 slots when Mains is set to 60 Hz.
- **Strobe at other speeds.** At 45 rpm the marks on the 45 adapter do the job (W1). At 78 rpm
  there is no strobe (see Disagreements).

**Mat.**

- Raised concentric rings: four ridges plus the outer edge, around a plain centre with an
  embossed "THORENS" (v16, v68).
- The edge is rounded and sits just inside the platter's bright lip (v13).
- Thickness is not documented, so the model uses 3 mm (open question 1).
- There is no label recess: the plain centre is flush (v16).

**Control strip.**

- **Plates.** Three plates (v16, v13, v72, v11) plus the pitch wheel.
- **Silkscreen.**
  - Under the speed plate: "78 45 OFF 33".
  - Under the wheel: a scale of five filled bars thinning to three hairlines.
  - Second plate: "M" to its left and "START ▸▸" to its right.
  - Cue plate: the lower and raise glyphs.
- **Plate travel.**
  - Speed plate: four detents, 78 · 45 · OFF · 33. OFF is the centre detent and turns the
    power off (W1).
  - 78: reached only past 45 while the unlock pin is held (v11 shows the pin).
  - M/START plate: three positions (M, off, START).
  - Cue plate: two positions. Right raises the arm and left lowers it, both damped (W1).
- **Pitch wheel.** Radial knurl (v16). No mechanical centre detent is evidenced, so the wheel has
  none. The software snap to 0 % from the old pitch control is kept as a soft detent (open
  question 2).

**M versus START at the end of a side** (W2, W1).

- **START.** The optoelectronic end stop lifts the arm, the motor stops and the cue plate returns
  to raised. It is shown by the arm lifting, the platter coasting down and the cue plate sliding
  right.
- **M.** Nothing happens. The stylus rides the run-out into the locked groove until the user
  acts.

**Tonearm.**

- Wand joint: a silver collar near the pivot (v16).
- Pivot: a gimbal yoke in a black housing with a ringed top cap (v16).
- Counterweight: on a rear stub, threaded, with its scale in mN (W1).
- Antiskating: magnetic, set by a ring around the arm base and marked in arbitrary units (W1).
- Arm rest: a black U cradle beside the pivot (v16, v68).
- Cue: a damped lift bar at the base, worked by the cue plate (v16, W1).

**Dust cover.**

- Smoked grey acrylic with thin walls (v16, v65).
- The modelled thickness is 3 mm, because thickness is not documented (open question 3).
- Spring-balanced hinges that hold at any angle (v15 springs, W1).
- No felt pads are evidenced, so none are modelled.

**Plinth.**

- Grey metallic for the hero; black exists (v74 and others).
- The strip is brushed aluminium with plinth-coloured end blocks (v13).
- Feet: four dark cylinders (v15).
- Rear panel and cable exit: as in v15.

**Badging.** "THORENS" with the swash, and "TD 115 MKII" in a wide grotesque, right-aligned on
the front face of the strip with a large gap between the two words (v65, v13).

**Underside.** No grade-A evidence exists.

- **What the model shows.** The underside is shown only in the stretch Inspect mode, and only
  as what v103 (B, underside only) shows: four conical springs at the corners, the motor at the
  left front, the PCB at the centre rear, and mains wiring. It is labelled "from a custom-cabinet
  build".
- **Belt.** One belt; a second belt is not evidenced.

**Wear.**

- **Typical, and modelled lightly:** swirl and dulling on the plate tops (v69), fine
  scratches on the cover (v73), dust in the mat's rings.
- **Damage, not modelled:** cracked covers (v41, v80), dirty mats (v71), added binding posts
  (v10), tape, and seller watermarks.

## Disagreements

| Topic                                    | Evidence                                                                                                | Chosen                                                                          | Why                                                                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plinth colour                            | grey (hero, v16) / black (v74, v75, v76, v92)                                                           | grey; black is an optional finish                                               | user's hero choice; the units are never blended                                                                                                                   |
| Cue-plate glyphs                         | overhead PNG shows an hourglass "⧗"; A photos v72 and v13 show ▼ on a bar and ▼ over a bar              | the A glyphs                                                                    | the overhead is B (proportion only), and its silkscreen disagrees with every A photo                                                                              |
| Round black dots on the strip end blocks | overhead PNG only; v13 shows a plain end block                                                          | no dots                                                                         | not in any A photo                                                                                                                                                |
| Overhead perspective                     | the overhead is not orthographic: vertical foreshortening ≈ 0.84 and a wider front edge                 | homography rectification before the overlay                                     | the 2 % gate must compare like with like                                                                                                                          |
| v102                                     | flagged synthetic by the user; to the eye it reads as a real platter-off photo                          | excluded (C)                                                                    | the user's verified list wins, and nothing is lost by excluding it                                                                                                |
| End-of-side motor stop                   | W2 (MK II review): motor stops in START; W1 (MK I report): the user stops the motor                     | motor stops in START                                                            | W2 describes the MK II; W3 confirms "end stop with lifting of the tone arm"                                                                                       |
| Strobe at 45 and 78                      | W1: rim slots for 33⅓, adapter marks for 45; the old apps drew a strobe that stood still at every speed | physical slots (90 / 108), a 45 adapter with its own marks, and no strobe at 78 | fidelity; the old all-speed strobe is kept in the 2D fallback deck. See DECISIONS.md                                                                              |
| Wow and flutter                          | brief 0.05 %; W3 ≤ 0.045 %                                                                              | the audio engine keeps the old 0.12 % / 0.05 % wow and flutter model            | an audible character setting that the brief requires to survive intact; the spec value is recorded                                                                |
| Platter diameter                         | published 300 mm (brief, W1); overhead (B) 292.7 mm; v68 (A) about 296 mm                               | 300 mm                                                                          | the published value, which the grade-A photo supports within 1.3 %. The overhead's 2.4 % shortfall is a radial outline error of 3.7 mm, 0.8 % of the plinth width |
| Cover tint                               | from near-clear (v21) to dark smoke (v18, v12)                                                          | medium smoke, about 55 % transmission                                           | matches the hero unit (v12, v16)                                                                                                                                  |

## Open questions (conservative choices)

1. **Mat thickness:** 3 mm (the platter lip is visible above the mat edge in v13).
2. **Pitch wheel centre detent:** none mechanically. The software snap from the old player is
   kept.
3. **Cover wall thickness:** 3 mm; the edges look thin in v65.
4. **What happens to the M/START plate after an automatic stop:** it stays where it is and only
   the electronics switch off. Moving it to centre and back restarts the motor. No spring
   return is invented.
5. **Strobe lamp position:** under the platter edge, behind the strip, centred on the pitch
   wheel. v84 shows the glow at the front of the rim; the exact lamp position is not visible.
6. **60 Hz platter:** 108 slots, derived from the physics, not photographed.
7. **Underside:** no A evidence. It is modelled only for the stretch Inspect mode, from v103 (B),
   and labelled as such.
