import type { AudioEngine } from '../audio/engine';
import { NeedleBallistics, PeakLatch, levelToDeflection, measure } from './vu';

const SWING_DEGREES = 45;
const REDUCED_MOTION_INTERVAL_S = 0.25;

const METER_SVG = `
<svg viewBox="0 0 100 60" aria-hidden="true" focusable="false">
  <rect class="meter-face" x="1" y="1" width="98" height="58" rx="6" />
  <path class="meter-scale" d="M 18.9 24.9 A 44 44 0 0 1 81.1 24.9" />
  <path class="meter-red" d="M 68.6 16.1 A 44 44 0 0 1 81.1 24.9" />
  <line class="meter-needle" x1="50" y1="56" x2="50" y2="14" />
  <circle class="meter-hub" cx="50" cy="56" r="4" />
  <circle class="meter-led" cx="89" cy="11" r="4" />
</svg>`;

interface Meter {
  needle: SVGLineElement;
  led: SVGCircleElement;
  ballistics: NeedleBallistics;
  latch: PeakLatch;
  /** Last transform written, so an unchanged needle does not touch the DOM. */
  transform: string;
}

/** Two VU meters driven by the engine's left and right level taps. */
export class Meters {
  reducedMotion = false;
  private readonly engine: AudioEngine;
  private readonly meters: Meter[];
  private readonly samples = new Float32Array(1024);
  private sinceUpdate = 0;

  constructor(container: HTMLElement, engine: AudioEngine) {
    this.engine = engine;
    this.meters = ['Left', 'Right'].map((side) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'meter';
      wrapper.innerHTML = METER_SVG;
      const caption = document.createElement('span');
      caption.textContent = side;
      wrapper.append(caption);
      container.append(wrapper);
      return {
        needle: wrapper.querySelector('.meter-needle') as SVGLineElement,
        led: wrapper.querySelector('.meter-led') as SVGCircleElement,
        ballistics: new NeedleBallistics(),
        latch: new PeakLatch(),
        transform: '',
      };
    });
  }

  update(dt: number): void {
    // With reduced motion the needles jump a few times a second instead of swinging.
    this.sinceUpdate += dt;
    if (this.reducedMotion && this.sinceUpdate < REDUCED_MOTION_INTERVAL_S) return;
    const elapsed = this.sinceUpdate;
    this.sinceUpdate = 0;
    this.meters.forEach((meter, channel) => {
      const live = this.engine.readMeter(channel as 0 | 1, this.samples);
      const { rms, peak } = live ? measure(this.samples) : { rms: 0, peak: 0 };
      const target = levelToDeflection(rms);
      const deflection = this.reducedMotion ? target : meter.ballistics.step(target, elapsed);
      const angle = (deflection * 2 - 1) * SWING_DEGREES;
      const transform = `rotate(${angle.toFixed(1)} 50 56)`;
      if (transform !== meter.transform) {
        meter.transform = transform;
        meter.needle.setAttribute('transform', transform);
      }
      meter.led.classList.toggle('is-on', meter.latch.update(peak, elapsed));
    });
  }
}
