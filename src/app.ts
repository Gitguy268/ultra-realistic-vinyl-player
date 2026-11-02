import '@fontsource-variable/inter';
import './style.css';
import './styles/stage.css';
import type { Equalisation } from './audio/mix';
import { wowFlutterFor } from './audio/wowflutter';
import { CONDITIONS } from './core/wear';
import { Deck, SPEED_LABELS } from './deck';
import { Player } from './player';
import type { SpeedPreset } from './turntable/motor';
import type { MainsHz } from './turntable/strobe';
import { bindChrome } from './ui/chrome';
import { bindColours } from './ui/colours';
import { applyCoverAccent } from './ui/cover';
import { byId, formatSigned, formatTime, setAttr, setText } from './ui/dom';
import { bindDesktop } from './ui/desktop';
import { bindGraphicEq } from './ui/graphic-eq';
import { bindLibraryPanel } from './ui/library-panel';
import {
  bindMediaSession,
  showMediaMetadata,
  showPlaybackState,
  showPosition,
} from './ui/media-session';
import { Meters } from './ui/meters';
import { snapPitch } from './ui/pitch';
import { PlatterRenderer } from './ui/platter';
import { Stage } from './scene/stage';
import type { FinishName } from './scene/materials/deck-materials';
import { DECK_SPEC } from './spec/deck';
import { bindRecordInfo } from './ui/record-info';
import type { LabelContent } from './scene/materials/label';
import { parseSettings, type Condition, type VisualizerStyle } from './ui/settings';
import { describeDeck, shortcutFor, type ShortcutAction } from './ui/shortcuts';
import { bindUpdateToast } from './ui/update-toast';
import {
  createBarsVisualizer,
  createLabelVisualizer,
  createScopeVisualizer,
  visualizerSupported,
  type LabelVisualizer,
} from './ui/visualizer';
import { readStored, writeStored } from './util/storage';
import { REST_DIRECTION, directionFor } from './core/tonearm3d';
import { angleForPoint, createGeometry } from './turntable/tonearm';

const HEADSHELL_HIT_RADIUS_PX = 22;
const SEEK_STEP_S = 5;
/** Within this many seconds of a track's start, ← goes to the previous track (C6). */
const PREVIOUS_WITHIN_S = 3;
/** While the page is hidden the deck still runs (html-1): playback logic never waits for frames. */
const HIDDEN_TICK_MS = 250;
const VOLUME_STEP = 5;
const ARM_STEP = 0.01;
const fallbackGeometry = createGeometry(1);
const LABEL_INTERVAL_MS = 1000;

/** Phones and upright tablets: controls in a bottom sheet, camera pulled back (stage.css). */
const SHEET_LAYOUT = matchMedia(
  '(max-width: 760px), (orientation: portrait) and (max-width: 1100px)',
);

const deck = new Deck();
const query = new URLSearchParams(location.search);
const player = new Player(deck, query.has('demo'));
const canvas = byId<HTMLCanvasElement>('platter');
const sceneCanvas = byId<HTMLCanvasElement>('scene');
const pitch = byId<HTMLInputElement>('pitch');
const mains = byId<HTMLSelectElement>('mains');
const coverToggle = byId<HTMLButtonElement>('cover');

/** The 3D stage, or null without WebGL: then the 2D deck is shown with every control (fallback). */
function createStage(): Stage | null {
  // Asked on a canvas of its own: three.js logs an error if it finds out by itself.
  if (!document.createElement('canvas').getContext('webgl2')) return null;
  try {
    return new Stage(sceneCanvas, deck, {
      pitch: (percent) => {
        pitch.value = String(percent);
        applyPitch();
        saveSettings();
      },
      pitchPercent: () => Number(pitch.value),
      pitchRange: () => Number(pitch.max),
      cover: (open, moved) => {
        setAttr(coverToggle, 'aria-pressed', String(!open));
        if (moved !== 'none')
          deck.events.emit('mechanism', moved === 'opened' ? 'hinge-open' : 'hinge-close');
      },
      mainsHz: () => (Number(mains.value) === 60 ? 60 : 50),
    });
  } catch {
    return null;
  }
}
const stage = createStage();
document.body.classList.toggle('has-stage', stage !== null);
// With the stage, the 2D deck top hides; its strip of twins stays.
(byId('plinth-box').querySelector('.deck-top') as HTMLElement).hidden = stage !== null;
sceneCanvas.hidden = stage === null;
const renderer = stage ? null : new PlatterRenderer(canvas);
if (stage) stage.cover.grab(DECK_SPEC.cover.maxOpenDeg);
stage?.cover.release();
coverToggle.addEventListener('click', () => stage?.cover.toggle());

// Set by refreshColours, which the chrome calls during start-up.
let appliedFinish: FinishName | null = null;
let labelColour = '#e8562a';
let labelInk = '#1a1208';
const playButton = byId<HTMLButtonElement>('play');
const motorButton = byId<HTMLButtonElement>('motor');
const leverButton = byId<HTMLButtonElement>('lever');
const powerLed = byId<HTMLElement>('power-led');
const pitchValue = byId<HTMLOutputElement>('pitch-value');
const volume = byId<HTMLInputElement>('volume');
const volumeValue = byId<HTMLOutputElement>('volume-value');
const noise = byId<HTMLInputElement>('noise');
const noiseValue = byId<HTMLOutputElement>('noise-value');
const wear = byId<HTMLInputElement>('wear');
const wearValue = byId<HTMLOutputElement>('wear-value');
const status = byId<HTMLElement>('status');
const announcer = byId<HTMLElement>('announcer');
const timeCurrent = byId<HTMLElement>('time-current');
const timeTotal = byId<HTMLElement>('time-total');
const seek = byId<HTMLInputElement>('seek');
const SEEK_STEPS = Number(seek.max);

seek.addEventListener('input', () => {
  deck.seek((Number(seek.value) / SEEK_STEPS) * deck.duration);
});

const meters = new Meters(byId('meters'), deck.engine);
// The tutorial looks at what it talks about: the deck, the tonearm, the cue, the strip.
const chrome = bindChrome(
  () => refreshColours(),
  (step) => {
    // The first step waits for the intro, which ends at the same place.
    if (!stage || (step === 0 && stage.rig.introPlaying)) return;
    const tour = DECK_SPEC.camera.tour;
    const stops = [homeStop(), tour[1], DECK_SPEC.camera.control, tour[2]];
    stage.rig.goTo(step < 0 ? homeStop() : (stops[step] ?? homeStop()));
  },
);
// Focus mode moves the camera to the control view, and back out to the hero view.
let inFocus = false;
new MutationObserver(() => {
  const focus = document.body.classList.contains('focus-mode');
  if (focus === inFocus) return;
  inFocus = focus;
  byId('app').classList.toggle('focus', focus);
  resizeStage();
  stage?.rig.goTo(focus ? DECK_SPEC.camera.control : homeStop());
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });
bindColours(() => refreshColours());

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function applyReducedMotion(): void {
  if (renderer) renderer.reducedMotion = reducedMotion.matches;
  deck.reducedMotion = reducedMotion.matches;
  if (stage) stage.rig.calm = reducedMotion.matches;
  meters.reducedMotion = reducedMotion.matches;
}
reducedMotion.addEventListener('change', applyReducedMotion);
applyReducedMotion();

function announce(message: string): void {
  // Clearing first makes screen readers repeat an identical message.
  announcer.textContent = '';
  requestAnimationFrame(() => setText(announcer, message));
}

deck.events.on('status', (message) => setText(status, message));
deck.events.on('announce', announce);
player.events.on('status', (message) => setText(status, message));
player.events.on('announce', announce);
player.events.on('storage', (answer) => setText(byId('storage-note'), answer));
player.events.on('track', (track) => {
  showMediaMetadata(track);
  const cover = player.coverOf(track);
  // The accent speaks for this track only; the label may borrow the page's cover (C25).
  void applyCoverAccent(track?.coverBlob).then(() => refreshColours());
  void renderer?.setCover(cover);
  void setLabelCover(cover);
  if (track) announce(`Now on the platter: ${track.tags.title}.`);
});

bindLibraryPanel(player, announce);
byId('flip').addEventListener('click', () => player.flip());
// The ♫ twin of the Visualizer setting: one press, the next style that this browser can draw.
byId('viz-step').addEventListener('click', () => {
  const options = [...visualizerSelect.options].filter((option) => !option.disabled);
  const at = options.findIndex((option) => option.value === visualizerSelect.value);
  visualizerSelect.value = options[(at + 1) % options.length]?.value ?? 'off';
  visualizerSelect.dispatchEvent(new Event('change', { bubbles: true }));
});
bindRecordInfo(player);
bindMediaSession({
  play: () => {
    if (!deck.needleDown) deck.play();
  },
  pause: () => {
    if (deck.needleDown) deck.pause();
  },
  previous: () => player.previous(),
  next: () => player.next(),
  seekTo: (seconds) => deck.seek(seconds),
  seekBy: (seconds) =>
    deck.seek(Math.max(0, Math.min(deck.duration, deck.engine.currentTime + seconds))),
});
void player.start();
bindUpdateToast();

playButton.addEventListener('click', () => deck.togglePlay());
motorButton.addEventListener('click', () => deck.toggleMotor());
leverButton.addEventListener('click', () => deck.toggleLever());

// Settings from the last visit go into the controls first; each apply function
// below then reads its control, so the deck, the readouts and aria-valuetext agree.
const speedRadios = [...document.querySelectorAll<HTMLInputElement>('input[name="speed"]')];
const sound = byId<HTMLSelectElement>('sound');
const toneSliders = {
  bass: byId<HTMLInputElement>('bass'),
  mid: byId<HTMLInputElement>('mid'),
  treble: byId<HTMLInputElement>('treble'),
};
const wowFlutter = byId<HTMLInputElement>('wow-flutter');
const condition = byId<HTMLSelectElement>('condition');
const imperfection = byId<HTMLInputElement>('imperfection');
/** Deck settings checkboxes, by settings field. */
const deckChecks = {
  scratch: byId<HTMLInputElement>('scratch-audible'),
  effects: byId<HTMLInputElement>('effects'),
  keepSpinning: byId<HTMLInputElement>('keep-spinning'),
  autoReturn: byId<HTMLInputElement>('auto-return'),
  armReturn: byId<HTMLInputElement>('arm-return'),
  sides: byId<HTMLInputElement>('sides'),
  sizeBySpeed: byId<HTMLInputElement>('size-by-speed'),
  extendedPitch: byId<HTMLInputElement>('extended-pitch'),
  recordCharacter: byId<HTMLInputElement>('record-character'),
} as const;
const backgroundCheck = byId<HTMLInputElement>('background');
const visualizerSelect = byId<HTMLSelectElement>('visualizer');
const restored = parseSettings(readStored('settings'));
for (const radio of speedRadios) radio.checked = radio.value === restored.speed;
pitch.value = String(restored.pitch);
volume.value = String(restored.volume);
noise.value = String(restored.noise);
wear.value = String(restored.wear);
mains.value = String(restored.mains);
sound.value = restored.equalisation;
for (const key of ['bass', 'mid', 'treble'] as const)
  toneSliders[key].value = String(restored[key]);
wowFlutter.checked = restored.wowFlutter;
visualizerSelect.value = restored.visualizer;
condition.value = restored.condition;
imperfection.value = String(restored.imperfection);
for (const [key, box] of Object.entries(deckChecks))
  box.checked = restored[key as keyof typeof deckChecks];
// Unset means automatic: on for touch devices, where a locked phone should keep playing.
backgroundCheck.checked =
  restored.background ?? matchMedia('(hover: none) and (pointer: coarse)').matches;
let backgroundChosen = restored.background !== null;
backgroundCheck.addEventListener('change', () => {
  backgroundChosen = true;
  deck.engine.setBackground(backgroundCheck.checked);
});
const graphicEq = bindGraphicEq(
  restored.graphicEq,
  (eq) => {
    deck.setGraphicEq(eq);
    saveSettings();
  },
  (message) => setText(status, message),
);
deck.setGraphicEq(graphicEq());

function saveSettings(): void {
  writeStored(
    'settings',
    parseSettings({
      speed: speedRadios.find((radio) => radio.checked)?.value,
      pitch: Number(pitch.value),
      volume: Number(volume.value),
      noise: Number(noise.value),
      wear: Number(wear.value),
      mains: Number(mains.value),
      equalisation: sound.value,
      bass: Number(toneSliders.bass.value),
      mid: Number(toneSliders.mid.value),
      treble: Number(toneSliders.treble.value),
      wowFlutter: wowFlutter.checked,
      visualizer: visualizerSelect.value,
      graphicEq: graphicEq(),
      condition: condition.value,
      imperfection: Number(imperfection.value),
      ...Object.fromEntries(Object.entries(deckChecks).map(([key, box]) => [key, box.checked])),
      background: backgroundChosen ? backgroundCheck.checked : null,
    }),
  );
}
byId('settings').addEventListener('change', saveSettings);
byId('deck-settings').addEventListener('change', saveSettings);

/** The deck options follow their checkboxes; the pitch range follows Extended pitch. */
function applyDeckSettings(): void {
  const sidesBefore = deck.program.sides.length;
  deck.setOptions({
    keepSpinning: deckChecks.keepSpinning.checked,
    armReturn: deckChecks.armReturn.checked,
    sides: deckChecks.sides.checked,
    sizeBySpeed: deckChecks.sizeBySpeed.checked,
    extendedPitch: deckChecks.extendedPitch.checked,
    effects: deckChecks.effects.checked,
    scratch: deckChecks.scratch.checked,
    recordCharacter: deckChecks.recordCharacter.checked,
  });
  deck.setEndStop(deckChecks.autoReturn.checked);
  if (deck.program.sides.length !== sidesBefore) player.events.emit('change', undefined);
  const range = deckChecks.extendedPitch.checked ? 8 : 6;
  pitch.min = String(-range);
  pitch.max = String(range);
  deck.setCondition(condition.value as Condition);
  deck.setImperfection(Number(imperfection.value));
  deck.engine.setWowFlutter(wowFlutterFor(wowFlutter.checked, Number(imperfection.value)));
  deck.engine.setBackground(backgroundCheck.checked);
  setText(byId('imperfection-value'), `${Math.round(Number(imperfection.value) * 100)} %`);
  setAttr(
    imperfection,
    'aria-valuetext',
    `${Math.round(Number(imperfection.value) * 100)} percent`,
  );
}
byId('deck-settings').addEventListener('change', () => {
  applyDeckSettings();
  applyPitch();
});
imperfection.addEventListener('input', applyDeckSettings);
applyDeckSettings();

function applySpeed(): void {
  const selected = speedRadios.find((radio) => radio.checked);
  if (selected) deck.setSpeed(selected.value as SpeedPreset);
  // The plate may have refused 78; the radios follow the plate.
  syncSpeedRadios();
}

function syncSpeedRadios(): void {
  const preset = deck.motor.preset;
  for (const radio of speedRadios) radio.checked = radio.value === preset;
}
for (const radio of speedRadios) {
  radio.addEventListener('change', () => {
    applySpeed();
    // The radios sit on the strip, outside the panels whose changes are saved.
    saveSettings();
  });
}
applySpeed();

let pitchHeld = false;
pitch.addEventListener('pointerdown', () => (pitchHeld = true));
addEventListener('pointerup', () => (pitchHeld = false));
addEventListener('pointercancel', () => (pitchHeld = false));

function applyPitch(): void {
  const asked = Number(pitch.value);
  const percent = deck.setPitch(snapPitch(asked, pitchHeld));
  pitch.value = String(percent);
  setText(pitchValue, `${formatSigned(percent)} %`);
  setAttr(pitch, 'aria-valuetext', `${formatSigned(percent).replace('−', 'minus ')} percent`);
}
pitch.addEventListener('input', applyPitch);
pitch.addEventListener('dblclick', () => {
  pitch.value = '0';
  applyPitch();
  saveSettings();
});
applyPitch();

function applyVolume(): void {
  deck.engine.setVolume(Number(volume.value) / 100);
  setText(volumeValue, volume.value);
  setAttr(volume, 'aria-valuetext', `${volume.value} percent`);
}
volume.addEventListener('input', applyVolume);
applyVolume();

function applyNoise(): void {
  deck.setSurfaceNoise(Number(noise.value));
  setText(noiseValue, noise.value);
  setAttr(noise, 'aria-valuetext', `${noise.value} percent`);
}
noise.addEventListener('input', applyNoise);
applyNoise();

function applyWear(): void {
  const value = Number(wear.value);
  setText(wearValue, value.toFixed(2));
  setAttr(wear, 'aria-valuetext', `${Math.round(value * 100)} percent worn`);
}
wear.addEventListener('input', applyWear);
// Re-rendering the noise loop is not free, so apply wear when the slider is released.
wear.addEventListener('change', () => deck.setWear(Number(wear.value)));
// Choosing a condition sets how worn the surface sounds; the slider can still fine-tune it.
condition.addEventListener('change', () => {
  wear.value = String(CONDITIONS[condition.value as Condition].wear);
  applyWear();
  deck.setWear(Number(wear.value));
  saveSettings();
});
applyWear();
deck.setWear(Number(wear.value));

function applySound(): void {
  deck.setEqualisation(sound.value as Equalisation);
}
sound.addEventListener('change', applySound);
applySound();

function applyTone(): void {
  for (const [key, slider] of Object.entries(toneSliders)) {
    const text = `${formatSigned(Number(slider.value)).replace('.0', '')} dB`;
    setText(byId(`${key}-value`), text);
    setAttr(slider, 'aria-valuetext', text.replace('−', 'minus ').replace('dB', 'decibels'));
  }
  deck.setTone({
    bass: Number(toneSliders.bass.value),
    mid: Number(toneSliders.mid.value),
    treble: Number(toneSliders.treble.value),
  });
}
for (const slider of Object.values(toneSliders)) slider.addEventListener('input', applyTone);
applyTone();

function applyWowFlutter(): void {
  deck.engine.setWowFlutter(wowFlutterFor(wowFlutter.checked, Number(imperfection.value)));
}
wowFlutter.addEventListener('change', applyWowFlutter);
applyWowFlutter();

// A style is in the map once it has been asked for; its value arrives when it has loaded.
const visualizers = new Map<VisualizerStyle, LabelVisualizer | null>();

/** Butterchurn needs WebGL 2 and may still refuse a browser; the bars only need a canvas. */
function dropMilkdrop(): void {
  const option = visualizerSelect.querySelector<HTMLOptionElement>('option[value="milkdrop"]');
  if (option) option.disabled = true;
  if (visualizerSelect.value === 'milkdrop') visualizerSelect.value = 'bars';
}
if (!visualizerSupported()) dropMilkdrop();

/** The visualizer's canvas with a fresh frame on it, or null while the printed label shows. */
function visualizerFrame(): HTMLCanvasElement | null {
  const style = visualizerSelect.value as VisualizerStyle;
  if (style === 'off' || reducedMotion.matches || !deck.needleDown) return null;
  if (!visualizers.has(style)) {
    visualizers.set(style, null);
    // The needle is down, so the audio graph already exists; init() only hands it over.
    void deck.engine
      .init()
      .then(({ ctx, gain }) => {
        if (style === 'milkdrop') return createLabelVisualizer(ctx, gain);
        if (style === 'bars') return createBarsVisualizer(ctx, gain);
        return createScopeVisualizer(style, ctx, gain);
      })
      .then((created) => visualizers.set(style, created))
      .catch(() => {
        if (style === 'milkdrop') {
          dropMilkdrop();
          setText(status, 'MilkDrop is not available in this browser.');
        } else {
          visualizerSelect.value = 'off';
          setText(status, 'This visualizer is not available in this browser.');
        }
      });
  }
  const visualizer = visualizers.get(style);
  if (!visualizer) return null;
  visualizer.render();
  return visualizer.canvas;
}

function applyMains(): void {
  deck.mainsHz = Number(mains.value) as MainsHz;
}
mains.addEventListener('change', applyMains);
applyMains();

function canvasPoint(event: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

/** Direction of a canvas point as seen from the spindle, in radians. */
function spindleAngle(point: { x: number; y: number }): number {
  if (!renderer) return 0;
  const { centerX, centerY } = renderer.geometry;
  return Math.atan2(point.y - centerY, point.x - centerX);
}

// The 2D fallback deck's pointer: the same Deck actions as the 3D picks.
canvas.addEventListener('pointerdown', (event) => {
  if (!renderer) return;
  const point = canvasPoint(event);
  const geometry = renderer.geometry;
  const stylus = renderer.stylusAt(deck.snapshot().armAngle);
  const onHeadshell = Math.hypot(point.x - stylus.x, point.y - stylus.y) <= HEADSHELL_HIT_RADIUS_PX;
  const onRecord =
    Math.hypot(point.x - geometry.centerX, point.y - geometry.centerY) <= geometry.recordRadius;
  const grabbed = onHeadshell
    ? deck.beginDrag()
    : onRecord && deck.beginScratch((spindleAngle(point) * 180) / Math.PI);
  if (!grabbed) return;
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add('is-dragging');
  event.preventDefault();
});

canvas.addEventListener('pointermove', (event) => {
  if (!renderer) return;
  const point = canvasPoint(event);
  if (deck.scratching) deck.scratchTo((spindleAngle(point) * 180) / Math.PI);
  else if (deck.arm.mode === 'drag') {
    // Map the 2D drag onto the real arm: the share of the way from rest to the inner groove.
    const size = renderer.geometry.size;
    const angle = angleForPoint(fallbackGeometry, { x: point.x / size, y: point.y / size });
    const share =
      (angle - fallbackGeometry.restAngle) /
      (fallbackGeometry.innerAngle - fallbackGeometry.restAngle);
    deck.dragTo(REST_DIRECTION + share * (directionFor(0.056) - REST_DIRECTION));
  }
});

function endPointer(event: PointerEvent): void {
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  canvas.classList.remove('is-dragging');
  if (deck.scratching) deck.endScratch();
  else if (deck.arm.mode === 'drag') deck.endDrag();
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

function runShortcut(action: ShortcutAction): void {
  const nudgeVolume = (delta: number): void => {
    volume.value = String(Number(volume.value) + delta);
    applyVolume();
    saveSettings();
  };
  switch (action) {
    case 'play':
      return deck.togglePlay();
    case 'lever':
      return deck.toggleLever();
    case 'motor':
      return deck.toggleMotor();
    case 'seekBack':
      // Near a track's start, ← goes to the previous track (html-1, C6).
      if (deck.engine.currentTime <= PREVIOUS_WITHIN_S) return player.previous();
      return deck.seek(deck.engine.currentTime - SEEK_STEP_S);
    case 'seekForward':
      return deck.seek(deck.engine.currentTime + SEEK_STEP_S);
    case 'volumeUp':
      return nudgeVolume(VOLUME_STEP);
    case 'volumeDown':
      return nudgeVolume(-VOLUME_STEP);
    case 'shuffle':
      return byId('shuffle').click();
    case 'repeat':
      return byId('repeat').click();
    case 'focus':
      return chrome.toggleFocusMode();
    case 'help':
      return chrome.openShortcuts();
    case 'armInward':
      return deck.nudgeArm(ARM_STEP);
    case 'armOutward':
      return deck.nudgeArm(-ARM_STEP);
    case 'cover':
      if (stage) stage.cover.toggle();
      else coverToggle.click();
      return;
    case 'tour':
      return nextTourStop();
    case 'escape':
      if (tourStop >= 0) return endTour();
      chrome.escape();
  }
}

document.addEventListener('keydown', (event) => {
  // An open modal dialog owns the keyboard, including Escape.
  if (document.querySelector('dialog:modal')) return;
  const target = event.target instanceof HTMLElement ? event.target : document.body;
  const action = shortcutFor({
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    inFormField: target.matches('input, select, textarea') || target.isContentEditable,
    // Safari does not focus a button on click, so the open desktop answers for its own buttons.
    onButton: target.matches('button, summary') || !byId('desktop').hidden,
    onRaisedLever: target === leverButton && deck.leverRaised,
  });
  if (!action) return;
  if (action !== 'escape') event.preventDefault();
  runShortcut(action);
});

let labelUpdatedAt = 0;

const flipButton = byId<HTMLButtonElement>('flip');
let positionClock = 0;

function syncUi(): void {
  const { sides } = deck.program;
  flipButton.hidden = sides.length < 2;
  if (!flipButton.hidden) setText(flipButton, `Side ${deck.program.letter()}: flip`);
  // Lock screens interpolate between these, so once a second is plenty.
  if (performance.now() - positionClock > 1000) {
    positionClock = performance.now();
    showPosition(deck.duration, deck.engine.currentTime, deck.targetUnits / deck.cutUnits);
  }
  const down = deck.needleDown || deck.dropping;
  setAttr(playButton, 'aria-pressed', String(down));
  showPlaybackState(down);
  setAttr(motorButton, 'aria-pressed', String(deck.plates.motorOn));
  powerLed.classList.toggle('is-on', deck.plates.motorOn);
  setAttr(leverButton, 'aria-pressed', String(deck.leverRaised));
  syncSpeedRadios();
  setText(timeCurrent, formatTime(deck.engine.currentTime));
  setText(timeTotal, formatTime(deck.duration));
  const duration = deck.duration;
  seek.disabled = !deck.hasTrack;
  // While the slider is being dragged it leads; otherwise it follows playback.
  if (!seek.matches(':active') && duration > 0) {
    seek.value = String(Math.round((deck.engine.currentTime / duration) * SEEK_STEPS));
  }
  setAttr(
    seek,
    'aria-valuetext',
    `${formatTime(deck.engine.currentTime)} of ${formatTime(duration)}`,
  );
  // Screen readers re-read a changed label, so refresh it at most once a second.
  const now = performance.now();
  if (now - labelUpdatedAt < LABEL_INTERVAL_MS) return;
  labelUpdatedAt = now;
  const description = describeDeck({
    title: deck.title,
    state: deckState(),
    timeText: formatTime(deck.engine.currentTime),
    durationText: formatTime(deck.duration),
    motorOn: deck.plates.motorOn,
    speedLabel: SPEED_LABELS[deck.motor.preset],
  });
  // Both canvases carry it: the 3D scene, and the 2D deck that stands in without WebGL.
  setAttr(sceneCanvas, 'aria-label', description);
  setAttr(canvas, 'aria-label', description);
}

// ─── The tour: four close-ups, stepped with T or the caption's button ──
let tourStop = -1;
const tourCaption = byId<HTMLElement>('tour-caption');
function nextTourStop(): void {
  if (!stage) return;
  const stops = DECK_SPEC.camera.tour;
  tourStop = (tourStop + 1) % (stops.length + 1);
  if (tourStop === stops.length) return endTour();
  const stop = stops[tourStop]!;
  stage.rig.goTo(stop, 2);
  tourCaption.hidden = false;
  setText(
    tourCaption,
    `Tour ${tourStop + 1} of ${stops.length}: ${stop.name}. Press T for the next, Esc to leave.`,
  );
}
function endTour(): void {
  tourStop = -1;
  tourCaption.hidden = true;
  stage?.rig.goTo(homeStop());
}
byId('open-tour').addEventListener('click', () => {
  (byId('help-menu') as HTMLDetailsElement).open = false;
  nextTourStop();
});

/** The deck as the screen-reader description names it. */
function deckState(): 'rest' | 'dragging' | 'lifted' | 'playing' | 'returning' {
  if (deck.arm.mode === 'drag') return 'dragging';
  if (deck.needleDown || deck.dropping) return 'playing';
  if (deck.arm.mode === 'rest') return 'rest';
  return deck.plates.tripped ? 'returning' : 'lifted';
}

// ─── The label: cover art and Record Info printed on the record ──────
let labelCover: ImageBitmap | null = null;
let labelCoverVersion = 0;
async function setLabelCover(blob: Blob | undefined): Promise<void> {
  const version = ++labelCoverVersion;
  const bitmap = blob ? await createImageBitmap(blob).catch(() => null) : null;
  if (version !== labelCoverVersion) {
    bitmap?.close();
    return;
  }
  labelCover?.close();
  labelCover = bitmap;
}

/** Page mode and plinth select the scene's lighting and finish (materials, not CSS). */
function applyLook(): void {
  if (!stage) return;
  const root = document.documentElement;
  const mode =
    root.dataset.mode ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const lighting = mode === 'light' ? 'daylight' : 'dusk';
  if (stage.world.lighting.preset !== lighting) stage.world.setLighting(lighting);
  const finish = (root.dataset.plinth ?? 'anthracite') as FinishName;
  // html-1's themes, mirrored on the root container for whatever styles or tests read them.
  const app = byId('app');
  app.classList.toggle('theme-wood', finish === 'walnut');
  app.classList.toggle('theme-clear', finish === 'clear');
  if (finish in DECK_SPEC.finishes && finish !== appliedFinish) {
    appliedFinish = finish;
    stage.world.setFinish(finish);
  }
  // A custom background colour is set inline on the root; it paints the wall (DECISIONS.md).
  const wall = root.style.getPropertyValue('--bg').trim();
  stage.world.lighting.setWallColour(wall || null);
}

function refreshColours(): void {
  renderer?.refreshColors();
  applyLook();
  const style = getComputedStyle(document.documentElement);
  labelColour = style.getPropertyValue('--label').trim() || labelColour;
  labelInk = style.getPropertyValue('--label-ink').trim() || labelInk;
}

function labelText(): { top: string; bottom: string } {
  const track = player.current;
  const p = deck.program;
  const side = p.sides.length > 1 ? `SIDE ${p.letter()}` : '';
  const year = track?.tags.year ? String(track.tags.year) : '';
  return {
    top:
      [track?.tags.artist, track?.tags.album].filter(Boolean).join('  ·  ') ||
      (track ? 'LONG PLAY' : ''),
    bottom: [side, year, track?.tags.genre, `${SPEED_LABELS[deck.motor.preset]} RPM`, 'STEREO']
      .filter(Boolean)
      .join('  ·  '),
  };
}

let frame = 0;
let last = performance.now();
let hiddenTimer = 0;

/** The rectangle the floating panels leave open (viewport px), for framing the deck. */
function freeArea(): { left: number; top: number; right: number; bottom: number } {
  const topbar = document.querySelector('.topbar')?.getBoundingClientRect();
  const drawer = document.querySelector('.controls')?.getBoundingClientRect();
  const strip = document.querySelector('.deck .strip')?.getBoundingClientRect();
  const narrow = SHEET_LAYOUT.matches;
  return {
    left: 0,
    top: topbar && !document.body.classList.contains('focus-mode') ? topbar.bottom : 0,
    right:
      drawer && !narrow && !document.body.classList.contains('focus-mode')
        ? drawer.left
        : innerWidth,
    bottom: Math.min(strip?.top ?? innerHeight, narrow && drawer ? drawer.top : innerHeight),
  };
}

/** Where the camera rests: pulled back on narrow screens. */
function homeStop(): (typeof DECK_SPEC.camera)['hero' | 'mobile'] {
  return SHEET_LAYOUT.matches ? DECK_SPEC.camera.mobile : DECK_SPEC.camera.hero;
}
let wasNarrow: boolean | null = null;

function resizeStage(): void {
  stage?.resize(innerWidth, innerHeight, Math.min(2, devicePixelRatio || 1), freeArea());
  const narrow = SHEET_LAYOUT.matches;
  if (stage && narrow !== wasNarrow) {
    stage.rig.home = homeStop();
    if (!stage.rig.introPlaying) stage.rig.goTo(homeStop(), wasNarrow === null ? 0 : 1.2);
  }
  wasNarrow = narrow;
}
addEventListener('resize', resizeStage);
resizeStage();

/** Reused every frame. */
const labelContent: LabelContent = {
  title: '',
  top: '',
  bottom: '',
  speedLabel: '',
  colour: '',
  ink: '',
  cover: null,
  coverVersion: 0,
  hole: 0,
};

function loop(timestamp: number): void {
  // rAF timestamps can precede performance.now(), so clamp both ends.
  // Up to a quarter second: slow frames (software rendering) must not slow the animations down.
  const dt = Math.max(0, Math.min((timestamp - last) / 1000, 0.25));
  last = timestamp;
  deck.tick();
  const live = visualizerFrame();
  if (stage) {
    const text = labelText();
    labelContent.title = deck.title;
    labelContent.top = text.top;
    labelContent.bottom = text.bottom;
    labelContent.speedLabel = SPEED_LABELS[deck.motor.preset];
    labelContent.colour = labelColour;
    labelContent.ink = labelInk;
    labelContent.cover = labelCover;
    labelContent.coverVersion = labelCoverVersion;
    stage.frame(dt, timestamp / 1000, labelContent, live);
  } else if (renderer) {
    renderer.labelSource = live;
    renderer.update(dt, deck.snapshot());
  }
  meters.update(dt);
  syncUi();
  frame = requestAnimationFrame(loop);
}

function startLoop(): void {
  cancelAnimationFrame(frame);
  clearInterval(hiddenTimer);
  last = performance.now();
  frame = requestAnimationFrame(loop);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(frame);
    hiddenTimer = window.setInterval(() => deck.tick(), HIDDEN_TICK_MS);
  } else startLoop();
});
if (stage && !reducedMotion.matches && sessionStorage.getItem('ultra-vinyl.intro-seen') === null) {
  stage.rig.playIntro();
  try {
    sessionStorage.setItem('ultra-vinyl.intro-seen', '1');
  } catch {
    // Storage refused: the intro may play again next time, which is harmless.
  }
}
stage?.world.warmUp();
refreshColours();
startLoop();

const redrawDesktop = bindDesktop({
  toggle: byId<HTMLButtonElement>('desktop-toggle'),
  overlay: byId('desktop'),
  entries: () =>
    player.queue.ids.flatMap((id) => {
      const track = player.tracks.get(id);
      return track
        ? [
            {
              id,
              title: track.tags.title,
              artist: track.tags.artist,
              album: track.tags.album,
              durationSec: track.durationSec,
            },
          ]
        : [];
    }),
  play: (id) => player.select(id, true),
});
player.events.on('change', redrawDesktop);

// `?debug`: the deck's state for the browser checks (src/debug/deck-api.ts).
if (query.has('debug')) {
  void import('./debug/deck-api').then((m) => m.exposeDeck(deck, player, stage));
}
if (query.has('selftest')) {
  void import('./selftest').then((m) => {
    // The verdict is this mode's contract with html-1's tests (H37).
    // eslint-disable-next-line no-console
    console.log(m.selfTest() ? 'selftest ok' : 'selftest FAILED');
  });
}
