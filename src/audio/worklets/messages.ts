import type { Equalisation } from '../mix';
import type { WowFlutterParams } from '../wowflutter';

export const VINYL_PROCESSOR_NAME = 'vinyl-processor';

export interface ConfigMessage {
  type: 'config';
  wowFlutter: WowFlutterParams;
  equalisation: Equalisation;
}

/** Decoded channel data for hand scratching. The buffers are transferred, not copied again. */
export interface PcmMessage {
  type: 'pcm';
  channels: Float32Array[];
}

export interface ClearPcmMessage {
  type: 'clearPcm';
}

export interface ScratchMessage {
  type: 'scratch';
  active: boolean;
  /** Start position in frames and the rate to start from; used when `active` is true. */
  position: number;
  rate: number;
}

export interface ScratchRateMessage {
  type: 'scratchRate';
  rate: number;
}

/**
 * The record under the stylus, sent every tick. The worklet integrates the record's true angle
 * from this speed (with wow and flutter), so it owns what is heard; the drawn record locks to it.
 */
export interface MotionMessage {
  type: 'motion';
  /** Record speed in units of 33⅓ rpm; negative under a hand turning it back. */
  rate: number;
  /** Stylus in the groove. */
  contact: boolean;
  /** Stylus radius in record radii, and its place round the spindle in degrees. */
  radius: number;
  phi: number;
}

/** Sets the record's angle, when the record is placed or a hand lets it go. */
export interface AngleMessage {
  type: 'angle';
  angle: number;
}

/** A scratch on the record; the same list draws it (core/wear.ts). */
export interface DefectData {
  a: number;
  m: number;
  s: number;
  r0: number;
  r1: number;
  amp: number;
  f: number;
  tau: number;
  pan: number;
  low: number;
}

/** What the surface adds beyond the noise bed. */
export interface SurfaceMessage {
  type: 'surface';
  defects?: DefectData[];
  /** Pops per second at full speed. */
  pops?: number;
  /** Level of ticks and pops. */
  gain?: number;
  /** Once-per-turn speed wobble of an off-centre hole, as a fraction of speed. */
  eccentric?: number;
}

export type WorkletMessage =
  | ConfigMessage
  | PcmMessage
  | ClearPcmMessage
  | ScratchMessage
  | ScratchRateMessage
  | MotionMessage
  | AngleMessage
  | SurfaceMessage;

/** Sent by the worklet while scratching; `final` marks the hand-back to normal playback. */
export interface PositionReply {
  type: 'position';
  frames: number;
  final: boolean;
}

/** Sent every few blocks, always: the record as the audio thread has it. */
export interface MotionReply {
  type: 'motion';
  /** Record angle, degrees. */
  angle: number;
  /** Record speed including wow and flutter, units of 33⅓. */
  rate: number;
  /** Audio-clock time of this report. */
  time: number;
}

export type WorkletReply = PositionReply | MotionReply;
