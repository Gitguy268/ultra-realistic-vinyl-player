import { Color } from 'three';

/**
 * Linear RGB of a black body at `kelvin`, normalised to its brightest channel (Tanner Helland's
 * fit, 1000–40000 K). Tungsten at 2700 K comes out warm orange, overcast daylight cool white.
 */
export function kelvinToColor(kelvin: number, target = new Color()): Color {
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g =
    t <= 66
      ? 99.4708025861 * Math.log(t) - 161.1195681661
      : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const clamp = (v: number): number => Math.min(255, Math.max(0, v)) / 255;
  return target.setRGB(clamp(r), clamp(g), clamp(b), 'srgb');
}
