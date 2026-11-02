import { Matrix4, Vector3 } from 'three';
import { DECODE_MAX_SECONDS } from '../audio/playback-mode';
import { recordGeometry } from '../core/program';
import { directionFor, radiusFor, stylusAt } from '../core/tonearm3d';
import { RECORD_SURFACE } from '../scene/deck/build';
import type { Deck } from '../deck';
import type { Player } from '../player';
import type { Stage } from '../scene/stage';

/**
 * `?debug`: the deck's state for the browser checks, as `window.__deck`. Read-only views of the
 * owners, plus `project`, which turns a part of the 3D deck (a marker name or a world point in
 * metres) into page pixels, so a check can aim the pointer at the real arm, record or plate.
 */
/**
 * html-1's tests read its state through `window.__deck.Deck`, `.Arm` and so on. These are the same
 * facts under those names (docs/PARITY.md §7). Test support only: nothing in the page reads them.
 */
function html1Shape(deck: Deck, player: Player, stage: Stage | null): Record<string, unknown> {
  const engine = deck.engine as unknown as {
    motion: { rate: number; angle: number; time: number } | null;
    sink: HTMLAudioElement | null;
    graph: { graphicEq: BiquadFilterNode[]; trim: GainNode } | null;
    currentRoute: string | null;
  };
  const failed = new Set<string>();
  const real = new Map<string, number>();
  const ids = (): string[] => player.queue.ids;
  deck.events.on('status', (message) => {
    const id = player.queue.currentId;
    if (id !== null && message.startsWith("Can't play")) failed.add(id);
  });
  const row = (id: string): Record<string, unknown> | null => {
    const t = player.tracks.get(id);
    if (!t) return null;
    return {
      id,
      name: t.tags.title,
      artist: t.tags.artist,
      album: t.tags.album,
      year: t.tags.year ? String(t.tags.year) : '',
      genre: t.tags.genre,
      notes: t.notes ?? '',
      rms: t.levels ?? null,
      get pcm() {
        if (failed.has(id)) return 'failed';
        return t.durationSec > DECODE_MAX_SECONDS ? 'long' : null;
      },
      get duration() {
        return t.durationSec;
      },
      set duration(v: number) {
        t.durationSec = v;
      },
      get real() {
        return real.get(id);
      },
      set real(v: number | undefined) {
        if (v !== undefined) real.set(id, v);
      },
    };
  };
  return {
    Deck: {
      motorState: () => deck.motorState,
      stylusR: () => deck.groove.stylusR(),
      get wr() {
        return deck.spin.wr;
      },
      get contact() {
        return deck.groove.contact;
      },
      get seg() {
        return deck.groove.seg;
      },
    },
    Arm: {
      get mode() {
        return deck.arm.mode;
      },
      get th() {
        return deck.arm.direction;
      },
    },
    Geo: {
      radiusFor: (direction: number) =>
        radiusFor(direction) / recordGeometry(deck.recordSize).radius,
      angleFor: (rn: number) => directionFor(rn * recordGeometry(deck.recordSize).radius),
    },
    Engine: {
      pos: () => deck.engine.currentTime,
      dur: () => deck.duration,
      get wAng() {
        const m = engine.motion;
        return m ? { r: m.rate, a: m.angle, t: m.time } : null;
      },
      get wOn() {
        return deck.engine.mode === 'decode' && deck.engine.duration > 0;
      },
    },
    Program: {
      locate: (rn: number) => deck.program.locate(rn),
      get bands() {
        return deck.program.bands;
      },
      get sides() {
        return deck.program.sides;
      },
      get side() {
        return deck.program.side;
      },
      get flipping() {
        return stage?.flipping ?? false;
      },
      // In px of a 300 px platter's worth of record: only the ratio between sizes is ever read.
      get recordDiameter() {
        return Math.round(302 * recordGeometry(deck.recordSize).scale);
      },
    },
    State: {
      get currentIdx() {
        return player.queue.currentId === null ? -1 : ids().indexOf(player.queue.currentId);
      },
      get playing() {
        return deck.needleDown || deck.dropping;
      },
      get playlist() {
        return ids().flatMap((id) => row(id) ?? []);
      },
      get sink() {
        return engine.sink;
      },
      get routed() {
        return engine.currentRoute;
      },
      // The App's bag draws at random: what html-1 kept as an order is here the set to draw from.
      get shuffleQueue() {
        const q = player.queue as unknown as { bag: string[] };
        return [player.queue.currentId, ...q.bag].map((id) => ids().indexOf(id ?? ''));
      },
      get eqBands() {
        return engine.graph?.graphicEq ?? [];
      },
      // The App's trim also makes room for the noise; html-1's only ever held the EQ's part.
      get eqTrim() {
        const gain = engine.graph?.trim.gain.value ?? 1;
        return { gain: { value: gain / deck.noiseRoom } };
      },
      set trackLoaded(_: boolean) {
        // html-1 flag; a restored track here simply goes on the platter again.
      },
    },
    Player: {
      jumpTo: (index: number, play: boolean) => {
        const id = ids()[index];
        if (id !== undefined) player.select(id, play);
      },
      seekTo: (seconds: number) => deck.seek(seconds),
      stop: () => deck.pause(),
      // A record restored at start-up is simply on that side: no turnover to see.
      loadTrack: (index: number) => {
        const id = ids()[index];
        if (id === undefined) return;
        player.select(id, false);
        deck.restored();
      },
    },
    Settings: {
      v: {
        get background() {
          return (document.getElementById('background') as HTMLInputElement).checked;
        },
      },
    },
    Viz: {
      modes: () =>
        [...(document.getElementById('visualizer') as HTMLSelectElement).options]
          .filter((o) => !o.disabled)
          .map((o) => o.value),
      live: () => {
        const label = stage?.label as unknown as { live: boolean } | undefined;
        return label?.live
          ? (document.getElementById('visualizer') as HTMLSelectElement).value
          : null;
      },
      colours: () => {
        const label = stage?.label as unknown as { liveSource: HTMLCanvasElement | null };
        const source = label.liveSource;
        const ctx = source?.getContext('2d');
        if (!source || !ctx) return 0;
        const data = ctx.getImageData(0, 0, source.width, source.height).data;
        const seen = new Set<number>();
        for (let i = 0; i < data.length; i += 4)
          seen.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
        return seen.size;
      },
    },
    Geq: {
      get trim() {
        return (engine.graph?.trim.gain.value ?? 1) / deck.noiseRoom;
      },
    },
  };
}

export function exposeDeck(deck: Deck, player: Player, stage: Stage | null): void {
  const frames: number[] = [];
  let last = performance.now();
  let tap: AudioWorkletNode | null = null;
  const connectTap = (): void => {
    const ctx = deck.engine.context;
    const output = deck.engine.outputNode;
    if (tap || !ctx || !output) return;
    tap = new AudioWorkletNode(ctx, 'tap');
    const mute = ctx.createGain();
    mute.gain.value = 0;
    output.connect(tap).connect(mute).connect(ctx.destination);
  };
  const stamps: number[] = [];
  const count = (now: number): void => {
    // html-1 counts frames it drew, and it draws none in a hidden tab.
    if (document.hidden) {
      last = now;
      requestAnimationFrame(count);
      return;
    }
    stamps.push(now);
    if (stamps.length > 1200) stamps.shift();
    frames.push(now - last);
    if (frames.length > 1200) frames.shift();
    last = now;
    connectTap();
    requestAnimationFrame(count);
  };
  requestAnimationFrame(count);

  const point = (target: string | [number, number, number]): Vector3 => {
    if (typeof target !== 'string') return new Vector3(...target);
    const marker = stage?.world.deck.markers.get(target);
    if (!marker) throw new Error(`no marker ${target}`);
    return marker.getWorldPosition(new Vector3());
  };

  Object.assign(window, {
    __deck: {
      deck,
      player,
      stage,
      frames,
      ...html1Shape(deck, player, stage),
      Debug: {
        frames: stamps,
        /** The last `seconds` of what went to the speakers (mono), from the tap in the worklet. */
        capture(seconds: number): Promise<{ samples: Float32Array; sr: number }> {
          return new Promise((resolve, reject) => {
            connectTap();
            if (!tap) {
              reject(new Error('no audio yet'));
              return;
            }
            tap.port.onmessage = (event: MessageEvent<{ samples: Float32Array; sr: number }>) =>
              resolve(event.data);
            tap.port.postMessage({ seconds });
          });
        },
      },
      /** Page pixels of a marker or a world point; null without the 3D stage. */
      project(target: string | [number, number, number]): [number, number] | null {
        if (!stage) return null;
        const rect = stage.canvas.getBoundingClientRect();
        const [x, y] = stage.world.project(point(target));
        return [rect.left + x, rect.top + y];
      },
      /** Page pixels of a spot on the record: `rn` record radii from the spindle, at `angleDeg`. */
      projectRecord(rn: number, angleDeg = 90): [number, number] | null {
        if (!stage) return null;
        const record = stage.world.deck.record;
        const r = rn * 0.151 * record.scale.x;
        const a = (angleDeg * Math.PI) / 180;
        const centre = point('spindleBase');
        const p = new Vector3(
          centre.x + r * Math.cos(a),
          centre.y + 0.0015,
          centre.z + r * Math.sin(a),
        );
        const rect = stage.canvas.getBoundingClientRect();
        const [x, y] = stage.world.project(p);
        return [rect.left + x, rect.top + y];
      },
      /** Page pixels where the stylus would be over record radius `rn` (on the arm's arc). */
      projectArm(rn: number): [number, number] | null {
        if (!stage) return null;
        const r = rn * recordGeometry(deck.recordSize).radius;
        const p = stylusAt(directionFor(r));
        const rect = stage.canvas.getBoundingClientRect();
        const [x, y] = stage.world.project(new Vector3(p.x, RECORD_SURFACE, p.z));
        return [rect.left + x, rect.top + y];
      },
      /** The moving parts' transforms, for check-parts. */
      parts() {
        if (!stage) return null;
        const d = stage.world.deck;
        d.root.updateMatrixWorld(true);
        const world = (name: string): number[] => point(name).toArray();
        const shown = (() => {
          let n = 0;
          const m = new Matrix4();
          for (let i = 0; i < d.slots.count; i++) {
            d.slots.getMatrixAt(i, m);
            if (m.determinant() !== 0) n++;
          }
          return n;
        })();
        return {
          platterY: d.platter.rotation.y,
          recordY: d.record.rotation.y,
          recordScale: d.record.scale.x,
          armYawY: d.armYaw.rotation.y,
          armPitchZ: d.armPitch.rotation.z,
          cueLeverX: d.cueLever.rotation.x,
          coverX: d.cover.rotation.x,
          plateX: {
            speed: d.speedPlate.position.x,
            start: d.startPlate.position.x,
            cue: d.cuePlate.position.x,
          },
          pinY: d.unlockPin.position.y,
          wheelY: d.pitchWheel.rotation.y,
          slots: shown,
          neon: stage.world.materials.neon.emissiveIntensity,
          stylus: world('stylusTip'),
          spindleTip: world('spindleTip'),
          recordSurface: RECORD_SURFACE,
        };
      },
      state() {
        return {
          motor: deck.motorState,
          wr: deck.spin.wr,
          wp: deck.spin.wp,
          contact: deck.needleDown,
          dropping: deck.dropping,
          seg: deck.groove.seg?.kind ?? null,
          idx:
            player.queue.currentId === null ? -1 : player.queue.ids.indexOf(player.queue.currentId),
          pos: deck.engine.currentTime,
          arm: deck.arm.mode,
          armRadius: radiusFor(deck.arm.direction),
          lift: deck.arm.lift,
          plates: deck.plates.toState(),
          cover: stage?.cover.angle ?? null,
          inRoom: stage?.rig.insideRoom ?? null,
          camera: stage ? stage.world.camera.position.toArray() : null,
        };
      },
    },
  });
}
