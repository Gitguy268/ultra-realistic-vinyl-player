/** The wheel's centre detent (X25): a hand that lets it near zero lands on zero. */
export const PITCH_DETENT = 0.35;

/** Only a hand: arrow keys step 0.1 at a time, and would never get out of the detent. */
export function snapPitch(percent: number, held: boolean): number {
  return held && Math.abs(percent) < PITCH_DETENT ? 0 : percent;
}
