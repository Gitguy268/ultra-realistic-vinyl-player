import { MeshBasicMaterial } from 'three';
import type { PartMaterials } from '../src/scene/deck/build';

const ROLES = [
  'plinth',
  'aluminium',
  'plate',
  'zamak',
  'lip',
  'rubber',
  'steel',
  'black',
  'silver',
  'vinyl',
  'label',
  'foot',
  'cover',
  'silkscreen',
  'neon',
  'ivory',
  'glow',
  'coverEdge',
  'wire',
] as const;

/** A plain material for every role, so the deck can be built without a GPU. */
export function plainMaterials(): PartMaterials {
  const out = {} as PartMaterials;
  for (const role of ROLES) out[role] = new MeshBasicMaterial({ name: role });
  return out;
}
