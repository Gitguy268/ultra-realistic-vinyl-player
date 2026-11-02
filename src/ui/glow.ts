const ATTACK_S = 0.03;
const RELEASE_S = 0.25;
/** Below this the glow is treated as off, so a resting deck stops redrawing. */
const FLOOR = 0.01;

/** Bass energy 0..1 from the lowest bins of an analyser's byte spectrum. */
export function bassLevel(bins: ArrayLike<number>, count = 6): number {
  const n = Math.min(count, bins.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += bins[i] ?? 0;
  return sum / n / 255;
}

/** Follows the bass: rises almost at once, falls back over a quarter of a second. */
export class GlowEnvelope {
  value = 0;

  step(target: number, dt: number): number {
    if (!(dt > 0)) return this.value;
    const goal = Math.max(0, Math.min(1, Number.isFinite(target) ? target : 0));
    const tau = goal > this.value ? ATTACK_S : RELEASE_S;
    this.value += (goal - this.value) * (1 - Math.exp(-dt / tau));
    if (goal === 0 && this.value < FLOOR) this.value = 0;
    return this.value;
  }
}
