function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function noiseBurst(
  ctx: BaseAudioContext,
  destination: AudioNode,
  filter: { type: BiquadFilterType; frequency: number; q: number },
  startAt: number,
  seconds: number,
  peak: number,
): void {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, seconds);
  const biquad = ctx.createBiquadFilter();
  biquad.type = filter.type;
  biquad.frequency.value = filter.frequency;
  biquad.Q.value = filter.q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, startAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + seconds);
  source.connect(biquad).connect(gain).connect(destination);
  source.start(startAt);
  source.stop(startAt + seconds);
}

/**
 * Stylus landing in the groove. Goes into the worklet's stylus input (`sfxBus`), whose
 * RIAA curve boosts these low frequencies several times over, hence the low gain.
 */
export function playNeedleThunk(ctx: BaseAudioContext, sfxBus: AudioNode): void {
  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(120, now);
  oscillator.frequency.exponentialRampToValueAtTime(48, now + 0.08);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  oscillator.connect(gain).connect(sfxBus);
  oscillator.start(now);
  oscillator.stop(now + 0.09);
  noiseBurst(ctx, sfxBus, { type: 'highpass', frequency: 3000, q: 0.7 }, now, 0.04, 0.2);
}

/**
 * Cue lever detents. An airborne sound, so it bypasses the worklet and its RIAA
 * curve; `level` is its peak, taken from the mix plan.
 */
export function playLeverClack(ctx: BaseAudioContext, level: number): void {
  const now = ctx.currentTime;
  noiseBurst(ctx, ctx.destination, { type: 'bandpass', frequency: 1800, q: 4 }, now, 0.03, level);
  noiseBurst(
    ctx,
    ctx.destination,
    { type: 'bandpass', frequency: 1100, q: 4 },
    now + 0.055,
    0.04,
    level * 0.72,
  );
}
