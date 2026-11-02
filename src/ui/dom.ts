export function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

/** Writes text or an attribute only when it changed, so per-frame syncing stays cheap. */
export function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}

export function setAttr(element: HTMLElement, name: string, value: string): void {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

export function formatTime(seconds: number): string {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** "+2.0" style text for a signed percentage. */
export function formatSigned(value: number): string {
  const text = Math.abs(value).toFixed(1);
  if (value > 0) return `+${text}`;
  return value < 0 ? `−${text}` : text;
}
