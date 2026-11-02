import { DECK_SPEC } from '../../spec/deck';

/**
 * Where each printed area sits in the silkscreen atlas. Geometry and painter share this, so the
 * layout loads in the deck's unit tests, which have no canvas.
 */
export interface AtlasRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

const S = DECK_SPEC.strip;
const W = DECK_SPEC.plinth.width;

export const ATLAS_SIZE = { width: 4096, height: 1024 };
export const STRIP_ATLAS = { topWidth: W - 2 * S.endBlockWidth };
/** The front-face print: the right part of the strip, where the wordmark is (v65, v13). */
export const FRONT_DECAL = { width: 0.17, height: S.frontFaceHeight, x: 0.1 };
export const HEAD_DECAL = { width: 0.02, height: 0.005 };

const rect = (x0: number, y0: number, x1: number, y1: number): AtlasRect => ({
  u0: x0 / ATLAS_SIZE.width,
  u1: x1 / ATLAS_SIZE.width,
  // Canvas y runs down, texture v runs up.
  v0: 1 - y1 / ATLAS_SIZE.height,
  v1: 1 - y0 / ATLAS_SIZE.height,
});

export const ATLAS_TOP = rect(0, 0, 4096, 400);
export const ATLAS_FRONT = rect(0, 400, 3200, 800);
export const ATLAS_HEAD = rect(3300, 400, 4096, 600);
export const ATLAS_MAT = rect(3300, 600, 4096, 800);
export const ATLAS_RATING = rect(3200, 800, 4096, 1024);
/** The mat's embossed name, in its plain centre (v16, v68). */
export const MAT_DECAL = { width: 0.042, height: 0.0105 };
/** The rating plate on the rear (v15). */
export const RATING_DECAL = { width: 0.1, height: 0.025 };
