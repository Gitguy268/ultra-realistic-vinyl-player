/**
 * Every dimension, material, timing and camera keyframe of the deck, in one place.
 *
 * Units: metres, kilograms, seconds, degrees where named. World axes: +X to the right,
 * +Y up, +Z toward the listener (the control strip faces +Z). The origin is the centre of
 * the plinth's footprint on the credenza top.
 *
 * Sources are named per value: W1–W3 and v-numbers refer to docs/REFERENCE.md. "overhead"
 * is the rectified overhead PNG (grade B, proportion only); measurements from it went
 * through the homography in scripts/check-overlay.js. The single-file build inlines this
 * object as JSON (`#deck-spec`), and check-spec asserts the two builds carry the same values.
 */

const mm = (value: number): number => value / 1000;

export const DECK_SPEC = {
  version: 1,

  plinth: {
    /** W3: 445 × 355 mm. */
    width: mm(445),
    depth: mm(355),
    /** W1 + W3: 130 mm is the height with the cover closed. */
    heightWithCover: mm(130),
    /** v15, v17 elevations scaled by the plinth width: top plate 62 mm, cover 68 mm. */
    topHeight: mm(62),
    /** v14, v17: a recessed dark skirt carries the deck; feet sit under its corners (v15). */
    skirtHeight: mm(12),
    skirtInset: mm(9),
    footDiameter: mm(22),
    footInset: mm(28),
    /** v13, v16: soft 1.5 mm radius on every outer edge. */
    edgeRadius: mm(1.5),
    massKg: 7,
    /** overhead: raised hinge band along the rear edge. */
    rearBandDepth: mm(21),
    rearBandHeight: mm(2),
  },

  /** Brushed-aluminium control strip with plinth-coloured end blocks (v13, v16, overhead). */
  strip: {
    /** overhead, solved camera: the strip's top face runs from z = 136.9 to 177.5 mm. */
    topDepth: mm(40.6),
    /** v17: the front face holds the wordmark band (19 mm) above an 11 mm grey band. */
    frontFaceHeight: mm(19),
    lowerBandHeight: mm(11),
    /** Height of the strip's front top edge above the credenza (v17). */
    frontTopHeight: mm(48),
    /** The top face rises toward the rear to meet the top plate (v13 profile). */
    rearTopHeight: mm(56),
    endBlockWidth: mm(14),
  },

  /**
   * Plate centres across the strip at the centre of each plate's travel. The overhead shows the
   * speed plate on OFF, the start plate on its centre and the cue plate on raise.
   */
  plates: {
    width: mm(55.5),
    depth: mm(22),
    thickness: mm(3),
    /** Rise of a plate above the strip face (v13: a visible shadow line). */
    standoff: mm(1.2),
    /** Polished bevel on the plate's top edges (v16). */
    bevel: mm(0.8),
    speed: {
      x: mm(-164.05),
      /** Detents left to right: 78 · 45 · OFF · 33 (silkscreen v16, v11). Travel per detent. */
      detents: ['78', '45', 'off', '33'] as const,
      detentPitch: mm(4.5),
      /** The plate rests on OFF; 78 needs the unlock pin (v11). */
      rest: 'off' as const,
    },
    /** v11: one clear domed pin above "78" (overhead x = −200.6 mm). There is no power LED. */
    unlockPin: { x: mm(-200.6), diameter: mm(3.2), depth: mm(1.4) },
    /** M · (centre) · START ▸▸ (v72, v13). */
    start: { x: mm(65.2), detents: ['m', 'centre', 'start'] as const, detentPitch: mm(5) },
    /** Cue: left lowers, right raises, damped (W1, v13). */
    cue: { x: mm(152.4), detents: ['lower', 'raise'] as const, detentPitch: mm(5) },
    pitchWheel: {
      x: mm(-105.7),
      diameter: mm(17),
      /** Proud of the strip face inside its round recess (v16). */
      exposedHeight: mm(2.2),
      knurlCount: 48,
      /** Degrees of wheel rotation for the full ±6 % range. */
      sweepDeg: 300,
    },
  },

  platter: {
    /**
     * overhead, through the solved camera (docs/REFERENCE.md, Plan measurements): the spindle's
     * base and tip land 0.9 mm apart around (−46.2, −10.6) mm; the rim's widest row is centred
     * at z = −12.2 mm. The mean is used.
     */
    centreX: mm(-46.2),
    centreZ: mm(-11.0),
    /** brief, W1; v68 (A) gives about 296 mm, the overhead (B) 291–293 mm. */
    diameter: mm(300),
    massKg: 1.3,
    /** Height of the platter's top face above the plinth top plate (v11 profile). */
    topAbovePlate: mm(14),
    /** Depth of the slotted rim face below the top face (v11, v13). */
    rimDepth: mm(22),
    /** Bright machined lip on the top outer edge (v13, v16). */
    lipWidth: mm(3.5),
    slots: {
      /** Neon strobe through the rim: 90 slots stand still at 33⅓ rpm on 50 Hz, 108 on 60 Hz. */
      count50Hz: 90,
      count60Hz: 108,
      /** Fraction of the slot pitch that is open (overhead: slots narrower than the bars). */
      dutyCycle: 0.42,
      depth: mm(11),
    },
    /** The well around the platter in the top plate (overhead, v16). */
    wellClearance: mm(6),
  },

  mat: {
    /** overhead: mat edge at radius 136–137 mm; rings at 63, 82, 101, 121 mm. */
    diameter: mm(274),
    /** Open question 1: 3 mm. */
    thickness: mm(3),
    ringRadii: [mm(63), mm(82), mm(101), mm(121)],
    ringHeight: mm(0.6),
    ringWidth: mm(1.6),
    /** Plain centre with an embossed THORENS (v16, v68). */
    centreRadius: mm(55),
  },

  spindle: {
    /** Standard 7.24 mm centre hole spindle. */
    diameter: mm(7.2),
    heightAboveMat: mm(19),
    chamfer: mm(1.2),
  },

  /** W3: TP 30 with TP 70 wand. */
  tonearm: {
    effectiveLength: mm(222),
    overhang: mm(15.5),
    offsetDeg: 23,
    effectiveMassKg: 0.0075,
    /**
     * Pivot 222 − 15.5 = 206.5 mm from the spindle (W3), in the direction the overhead's solved
     * camera gives (−27.8° from +X). The photo alone would put it about 4 mm closer at a
     * realistic cap height; the published geometry wins (REFERENCE.md, Plan measurements).
     */
    pivotX: mm(136.5),
    pivotZ: mm(-106.7),
    /**
     * Wand axis to stylus tip: a 17 mm cartridge under a 5 mm headshell. The wand axis height
     * follows from it: level with the stylus on the record (scene/deck/build.ts › ARM_AXIS_HEIGHT).
     */
    stylusDrop: mm(22),
    /** The ringed gimbal cap sits this far above the wand axis (v16 arm-pivot crop). */
    capAboveAxis: mm(9),
    /** Octagonal base plate (overhead: 64 × 94 mm). */
    basePlate: { width: mm(64), depth: mm(94), height: mm(3) },
    wandDiameter: mm(9),
    /** Rear stub carrying the counterweight, pointing toward the rear hinge (v11). */
    counterweight: { diameter: mm(30), length: mm(24), stubLength: mm(48) },
    /**
     * Parked: plan direction of the pivot→stylus line, atan2(z, x) in degrees (overhead, solved
     * camera: stylus tip at (142.1, 121.4) mm with the arm parked).
     */
    restDirectionDeg: 88.6,
    /**
     * Headshell from the wand joint to the stylus. With the 23° offset this puts the straight wand
     * 5.6° off the pivot→stylus line, as on the TP 30 (v13, v16).
     */
    headshellLength: mm(45),
    /** Cue lift height at the headshell. */
    cueLift: mm(6),
    /** The stylus never passes the locked groove; beyond is the end-stop trip. */
    tripRadius: mm(52),
  },

  cover: {
    /** v17, v12: the cover spans the full width and closes on the strip's front edge. */
    width: mm(443),
    depth: mm(352),
    height: mm(68),
    /** Open question 3: 3 mm acrylic. */
    wall: mm(3),
    /** How wide an edge of the lid reads, seen end-on (v16, v65). */
    edgeLine: mm(1.1),
    /** W1: 400 mm overall height when open. */
    openHeight: mm(400),
    /** Medium smoke, about 55 % transmission (REFERENCE.md, Disagreements). */
    transmission: 0.55,
    tint: '#4a4c50',
    /** Spring-balanced hinges hold above this angle and fall closed below it (W1, v15). */
    holdAboveDeg: 12,
    maxOpenDeg: 82,
    /** overhead, v53: the hinge blocks sit at the plinth's outer edges. */
    hingeInsetX: mm(13),
  },

  /** Record sizes in mm, from html-1's table: diameter, lead-in, outer, inner, locked, label. */
  records: {
    lp: {
      diameter: mm(302),
      leadIn: mm(149.5),
      outer: mm(146),
      inner: mm(60.5),
      locked: mm(57),
      label: mm(108.7),
      hole: mm(7.24),
    },
    single: {
      diameter: mm(175),
      leadIn: mm(86),
      outer: mm(84),
      inner: mm(54),
      locked: mm(51),
      label: mm(89),
      hole: mm(38.2),
    },
    shellac: {
      diameter: mm(250),
      leadIn: mm(123),
      outer: mm(120.5),
      inner: mm(53),
      locked: mm(50),
      label: mm(76),
      hole: mm(7.24),
    },
    thickness: mm(1.5),
    /** Gaps between bands: 2.6 mm, at most 15 % of the span; the needle lands 1 mm inside the lead-in. */
    gap: mm(2.6),
    maxGapShare: 0.15,
    dropInset: mm(1),
    leadInSeconds: 2,
    gapSeconds: 1.5,
    runOutTurns: 1.5,
    sideSeconds: 1320,
    unknownDurationSeconds: 180,
    adapter: { diameter: mm(38), colour: '#e8b923', spokes: 3 },
  },

  motor: {
    /** rpm */
    speeds: { lp: 100 / 3, single: 45, shellac: 78 },
    /** brief, html-1: 95 % of speed in about 1.4 s; coasts to a stop in about 3 s (C1). */
    spinUpTau: 0.45,
    coastTau: 1.0,
    /** ±6 % (W3); ±8 % with "Extended pitch" (C2). */
    pitchRange: 0.06,
    extendedPitchRange: 0.08,
    /** Soft detent: |pitch| below this snaps to 0 (html-1, open question 2). */
    pitchDetent: 0.0035,
    /** Turns in the locked groove before the end stop trips in START (C5). */
    tripTurns: 3,
  },

  mechanism: {
    /** Plate slide time between neighbouring detents. */
    plateTravelS: 0.09,
    /** Cue: damped lift and fall, landing bounce at 80 % of the fall (html-1). */
    cueLiftS: 0.14,
    cueLowerS: 0.6,
    cueLowerFastS: 0.42,
    cueBounce: 0.08,
    armSwingMaxS: 0.34,
    armGlideTau: 0.12,
    armReturnS: 2.2,
    /** Hand friction and record slip (html-1). */
    handTau: 0.025,
    slipTau: 0.08,
    /** Drawn record angle locks to the heard angle (html-1). */
    syncTau: 0.3,
    /** Sub-chassis on four springs: natural frequency and damping ratio. */
    suspensionHz: 4.5,
    suspensionDamping: 0.18,
    /** Cover hinge: friction torque as a fraction of the cover's weight torque. */
    coverFriction: 0.35,
  },

  /** Physical base colours (linear-ready sRGB hex) and surface values. Finishes swap some. */
  materials: {
    plinthGrey: { colour: '#3d3e40', roughness: 0.62, metalness: 0.35, sparkle: 0.18 },
    plinthBlack: { colour: '#1b1b1c', roughness: 0.6, metalness: 0.2, sparkle: 0.1 },
    aluminium: { colour: '#c9cacb', roughness: 0.32, metalness: 1, anisotropy: 0.85 },
    plateTop: { colour: '#d4d5d6', roughness: 0.28, metalness: 1, anisotropy: 0.8 },
    zamak: { colour: '#9a9b9c', roughness: 0.48, metalness: 1 },
    machinedLip: { colour: '#e2e3e4', roughness: 0.16, metalness: 1, anisotropy: 0.6 },
    rubber: { colour: '#141414', roughness: 0.86, metalness: 0 },
    steel: { colour: '#d8d9da', roughness: 0.12, metalness: 1 },
    blackAnodised: { colour: '#121212', roughness: 0.4, metalness: 0.6 },
    silverCollar: { colour: '#c0c1c2', roughness: 0.22, metalness: 1 },
    vinyl: { colour: '#0b0b0c', roughness: 0.3, metalness: 0, clearcoat: 0.6 },
    labelPaper: { colour: '#efe7d6', roughness: 0.88, metalness: 0 },
    foot: { colour: '#161616', roughness: 0.9, metalness: 0 },
    silkscreen: { colour: '#1a1a1a' },
    walnut: { colour: '#5a3a22', roughness: 0.55, metalness: 0 },
    acrylicClear: { colour: '#f4f6f7', roughness: 0.04, metalness: 0, transmission: 0.92 },
    credenzaWalnut: { colour: '#4a2e1a', roughness: 0.45, metalness: 0, clearcoat: 0.35 },
    wallPaint: { colour: '#b9a58a', roughness: 0.92, metalness: 0 },
  },

  /** App finishes (and html-1 themes mapped onto them). Each is a material and lighting preset. */
  finishes: {
    anthracite: {
      plinth: 'plinthGrey',
      strip: 'aluminium',
      label: 'Anthracite (TD 115 MK II grey)',
    },
    black: { plinth: 'plinthBlack', strip: 'aluminium', label: 'Black (TD 115 MK II)' },
    walnut: { plinth: 'walnut', strip: 'aluminium', label: 'Walnut' },
    aluminium: { plinth: 'aluminium', strip: 'aluminium', label: 'Aluminium' },
    gloss: { plinth: 'plinthBlack', strip: 'aluminium', label: 'Gloss black', clearcoat: 1 },
    clear: { plinth: 'acrylicClear', strip: 'aluminium', label: 'Clear acrylic' },
  },
  themes: { minimal: 'anthracite', wood: 'walnut', clear: 'clear' },

  /**
   * The listening room, around the deck's origin on the credenza top. The credenza stands against
   * the back wall with the deck set 20 mm back from its front edge. The window is in the left
   * wall, so overcast light falls across the deck from the left; the tungsten lamp stands on the
   * credenza to the right. Nothing here is copied from a real room.
   */
  room: {
    credenza: { width: 1.6, depth: 0.5, height: 0.66, top: 0.025, centreX: 0.12, frontZ: 0.2 },
    wallZ: -0.32,
    bounds: { left: -1.45, right: 2.1, front: 3.2, ceiling: 1.95 },
    /** In the left wall: centre z, height of its centre above the credenza top, size. */
    window: { z: 0.45, y: 0.75, width: 1.1, height: 1.25 },
    lamp: { x: 0.66, z: -0.14, shadeY: 0.42, shadeRadius: 0.13, kelvin: 2700 },
    /** Light bounced by walls, ceiling and furniture, as a share of the direct light on the deck. */
    bounce: 0.3,
    /** EV100 of the camera (incident: log2(lux / 2.5)); window light in lux on the deck; lamp in lumens. */
    lighting: {
      dusk: {
        exposureEV: 6.4,
        windowKelvin: 7400,
        windowLux: 190,
        lampLumens: 520,
        wall: '#a69e92',
      },
      daylight: {
        exposureEV: 9.6,
        windowKelvin: 6300,
        windowLux: 1400,
        lampLumens: 0,
        wall: '#c4b49c',
      },
    },
  },

  /** 36 × 24 mm equivalent focal lengths; positions in metres, targets on the deck. */
  camera: {
    filmGauge: 36,
    hero: { focal: 40, position: [-0.42, 0.52, 0.78], target: [-0.01, 0.07, 0.0] },
    control: { focal: 45, position: [0.0, 0.44, 0.62], target: [0.0, 0.05, 0.08] },
    mobile: { focal: 35, position: [0.0, 0.92, 0.92], target: [0.0, 0.05, 0.02] },
    intro: {
      durationS: 7,
      keyframes: [
        { t: 0, focal: 35, position: [-1.15, 1.2, 2.2], target: [-0.6, 0.8, -0.3] },
        { t: 0.45, focal: 38, position: [-0.9, 0.8, 1.35], target: [-0.05, 0.1, -0.05] },
        { t: 1, focal: 40, position: [-0.42, 0.52, 0.78], target: [-0.01, 0.07, 0.0] },
      ],
    },
    tour: [
      {
        name: 'Platter and strobe',
        focal: 50,
        position: [-0.2, 0.2, 0.38],
        target: [-0.12, 0.08, 0.1],
        dof: true,
      },
      {
        name: 'Tonearm',
        focal: 50,
        position: [0.32, 0.3, 0.2],
        target: [0.14, 0.11, -0.08],
        dof: true,
      },
      {
        name: 'Control strip',
        focal: 50,
        position: [-0.02, 0.21, 0.44],
        target: [-0.05, 0.045, 0.15],
        dof: true,
      },
      {
        name: 'Cover and hinges',
        focal: 35,
        position: [0.5, 0.42, 0.12],
        target: [0.08, 0.12, -0.16],
        dof: false,
      },
    ],
    limits: {
      minDistance: 0.28,
      maxDistance: 2.4,
      /** Polar angle from straight up, degrees: never below the credenza top. */
      minPolarDeg: 8,
      maxPolarDeg: 82,
    },
  },
} as const;

export type DeckSpec = typeof DECK_SPEC;
