/** vinyl-shelf/1 messages (docs/PROTOCOL.md in the Gitguy268/vinyl-shelf repository). */
export interface ShelfLoad {
  type: 'vinyl-shelf:load';
  v: 1;
  album?: { cover?: unknown };
  tracks: { file?: unknown }[];
  autoplay?: boolean;
}

export function isShelfLoad(data: unknown): data is ShelfLoad {
  if (!data || typeof data !== 'object') return false;
  const d = data as Partial<ShelfLoad>;
  return d.type === 'vinyl-shelf:load' && d.v === 1 && Array.isArray(d.tracks);
}
