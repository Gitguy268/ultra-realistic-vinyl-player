/**
 * The THORENS wordmark as vector paths, traced by hand from the grade-A crop
 * docs/reference/crops/wordmark_v65.jpg (enlarged 8×, straight-on view). Units are
 * pixels of that 8× enlargement: cap height 192, the R leg runs into the swash
 * under "ENS" that ends in an upturned tail beside the S.
 *
 * Every path is filled with the even-odd rule, so counters are inner sub-paths.
 */
export const WORDMARK_BOX = { x: 40, y: 88, width: 1740, height: 285 } as const;

export const WORDMARK_PATHS: readonly string[] = [
  // T
  'M50,100 H245 V140 H166 V292 H128 V140 H50 Z',
  // H
  'M300,100 H345 V178 H470 V100 H515 V292 H470 V215 H345 V292 H300 Z',
  // O (outer ellipse, inner counter)
  'M570,197 C570,138 622,98 690,98 C758,98 810,138 810,197 C810,256 758,296 690,296 C622,296 570,256 570,197 Z ' +
    'M618,197 C618,232 650,256 690,256 C730,256 762,232 762,197 C762,162 730,139 690,139 C650,139 618,162 618,197 Z',
  // R (stem and bowl, counter); the leg is the start of the swash
  'M840,100 H960 C1008,100 1032,124 1032,155 C1032,188 1008,210 968,212 L930,212 L885,212 V292 H840 Z ' +
    'M885,138 H955 C976,138 986,146 986,157 C986,168 976,176 955,176 H885 Z',
  // E
  'M1120,100 H1283 V138 H1165 V178 H1270 V215 H1165 V254 H1285 V292 H1120 Z',
  // N
  'M1345,100 H1390 L1495,232 V100 H1538 V292 H1495 L1390,160 V292 H1345 Z',
  // S
  'M1770,128 C1746,106 1717,95 1680,95 C1630,95 1593,120 1593,152 C1593,186 1624,199 1680,208 ' +
    'C1723,215 1734,225 1734,240 C1734,256 1713,262 1682,262 C1647,262 1621,252 1600,236 L1586,272 ' +
    'C1611,288 1644,297 1682,297 C1742,297 1777,272 1777,238 C1777,203 1746,189 1692,180 ' +
    'C1650,173 1637,166 1637,152 C1637,139 1652,130 1680,130 C1709,130 1732,138 1750,152 Z',
  // swash: from the R leg, under E N S, rising to a tapered tail right of the S
  'M925,212 C1050,298 1250,338 1420,336 C1580,334 1700,290 1738,212 C1755,175 1760,135 1762,102 ' +
    'L1774,108 C1786,190 1750,308 1600,354 C1450,380 1200,370 1050,310 C990,284 955,260 925,240 Z',
];

/** Model lettering, set (not traced) in a wide grotesque with open tracking. */
export const MODEL_LETTERING = {
  text: 'TD 115 MKII',
  trackingEm: 0.08,
  gapToWordmarkEm: 1.1,
} as const;
