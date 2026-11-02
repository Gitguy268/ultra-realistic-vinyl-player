// Solves the camera of the overhead photo (grade B, proportion only) from the four plinth
// corners, then locates raised features on the plan with their heights taken into account.
// A flat homography would put raised parts too far back: the spindle's tip and base land
// 13 mm apart that way, and on the same point with this camera.
// `node scripts/overhead-camera.js` prints the fit and writes docs/reference/overhead-camera.json,
// which check-overlay uses to project the 3D deck into the photo.
import { writeFileSync } from 'node:fs';

const SIZE = 1254; // the photo is 1254 × 1254 px; the principal point is taken at its centre
const C = [SIZE / 2, SIZE / 2];

/** Pixel → world mm (x right, y up from the credenza, z toward the front). */
const CORNERS = [
  [
    [162, 377],
    [-222.5, 64, -177.5],
  ], // rear-left, top of the rear band
  [
    [1090, 377],
    [222.5, 64, -177.5],
  ],
  [
    [94, 1052],
    [-222.5, 48, 177.5],
  ], // front-left, top edge of the strip
  [
    [1167, 1052],
    [222.5, 48, 177.5],
  ],
];

/** Raised features: pixel, height in mm, what it is. */
const FEATURES = {
  spindleBase: [[524.5, 640], 79, 'spindle at the mat'],
  spindleTip: [[524.5, 616], 98, 'spindle tip'],
  rimLeft: [[193, 660], 62, 'platter rim, left extreme of the widest row'],
  rimRight: [[847, 660], 62, 'platter rim, right extreme of the widest row'],
  pivotCap: [[927.5, 441.5], 101, 'ringed pivot cap'],
  stripRear: [[627, 957], 56, 'rear edge of the strip top face'],
  stylusAtRest: [[972, 893], 82, 'stylus tip (front of the cartridge) with the arm parked'],
};

function rotation([a, b, c]) {
  const [ca, sa, cb, sb, cc, sc] = [
    Math.cos(a),
    Math.sin(a),
    Math.cos(b),
    Math.sin(b),
    Math.cos(c),
    Math.sin(c),
  ];
  return [
    [cc * cb, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa],
    [sc * cb, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa],
    [-sb, cb * sa, cb * ca],
  ];
}

export function project(p, [f, a, b, c, tx, ty, tz]) {
  const R = rotation([a, b, c]);
  const x = R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2] + tx;
  const y = R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2] + ty;
  const z = R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2] + tz;
  return [C[0] + (f * x) / -z, C[1] - (f * y) / -z];
}

function nelderMead(fn, x0, step, iterations) {
  const n = x0.length;
  let S = [x0.slice(), ...x0.map((_, i) => x0.map((v, j) => v + (i === j ? step[i] : 0)))];
  let F = S.map(fn);
  for (let k = 0; k < iterations; k++) {
    const order = F.map((_, i) => i).sort((a, b) => F[a] - F[b]);
    S = order.map((i) => S[i]);
    F = order.map((i) => F[i]);
    const centre = Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centre[j] += S[i][j] / n;
    const along = (t) => centre.map((v, j) => v + t * (S[n][j] - v));
    const reflected = along(-1);
    const fr = fn(reflected);
    if (fr < F[0]) {
      const expanded = along(-2);
      const fe = fn(expanded);
      [S[n], F[n]] = fe < fr ? [expanded, fe] : [reflected, fr];
    } else if (fr < F[n - 1]) {
      [S[n], F[n]] = [reflected, fr];
    } else {
      const contracted = along(0.5);
      const fc = fn(contracted);
      if (fc < F[n]) [S[n], F[n]] = [contracted, fc];
      else {
        S = S.map((x) => x.map((v, j) => S[0][j] + 0.5 * (v - S[0][j])));
        F = S.map(fn);
      }
    }
  }
  return S[0];
}

const residual = (q) =>
  CORNERS.reduce((sum, [px, world]) => {
    const [u, v] = project(world, q);
    return sum + (u - px[0]) ** 2 + (v - px[1]) ** 2;
  }, 0);

let camera = [1500, -1, 0, 0, 0, 0, -1100];
for (let round = 0; round < 6; round++)
  camera = nelderMead(residual, camera, [200, 0.2, 0.1, 0.05, 50, 50, 200], 20000);

export function locate(px, height) {
  return nelderMead(
    ([x, z]) => {
      const [u, v] = project([x, height, z], camera);
      return (u - px[0]) ** 2 + (v - px[1]) ** 2;
    },
    [0, 0],
    [20, 20],
    3000,
  );
}

const rms = Math.sqrt(residual(camera) / CORNERS.length);
const located = Object.fromEntries(
  Object.entries(FEATURES).map(([name, [px, h, what]]) => [
    name,
    { px, height: h, what, plan: locate(px, h).map((v) => +v.toFixed(1)) },
  ]),
);
const spindle = [0, 1].map((i) => (located.spindleBase.plan[i] + located.spindleTip.plan[i]) / 2);
const pivot = located.pivotCap.plan;
const summary = {
  focalPx: +camera[0].toFixed(1),
  cornerRmsPx: +rms.toFixed(2),
  spindleTipToBaseMm: +Math.hypot(
    located.spindleTip.plan[0] - located.spindleBase.plan[0],
    located.spindleTip.plan[1] - located.spindleBase.plan[1],
  ).toFixed(2),
  platterDiameterMm: +(located.rimRight.plan[0] - located.rimLeft.plan[0]).toFixed(1),
  pivotToSpindleMm: +Math.hypot(pivot[0] - spindle[0], pivot[1] - spindle[1]).toFixed(1),
  pivotDirectionDeg: +(
    (Math.atan2(pivot[1] - spindle[1], pivot[0] - spindle[0]) * 180) /
    Math.PI
  ).toFixed(1),
};
console.log(summary);
for (const [name, f] of Object.entries(located))
  console.log(name.padEnd(14), f.plan, `(${f.what}, ${f.height} mm)`);
if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(
    new URL('../docs/reference/overhead-camera.json', import.meta.url),
    JSON.stringify(
      { image: 'Thorens TD 115 MKII Turntable Overhead.png', size: SIZE, camera, summary, located },
      null,
      2,
    ) + '\n',
  );
}
