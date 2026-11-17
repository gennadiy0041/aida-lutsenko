/**
 * Frame manifest. Every frame is a graded 2.39:1 master in src/assets/frames (made by
 * scripts/grade-frames.mjs from the original photos, which never enter the repository).
 * A frame id without a file renders as a film-leader slate, so the site builds at any stage.
 */
import type { ImageMetadata } from 'astro';
import type { L } from './copy';

export type CameraMove = 'push' | 'pull' | 'pan-left' | 'pan-right' | 'tilt-up' | 'tilt-down';

export interface FrameDef {
  id: string;
  alt: L;
  /** CSS object-position inside the gate, e.g. "50% 40%". */
  pos?: string;
  /** Horizontal focal point 0..1, used by the mobile pan window when motion is off. */
  focusX?: number;
  move?: CameraMove;
}

export interface Frame extends FrameDef {
  src?: ImageMetadata;
}

const files = import.meta.glob<{ default: ImageMetadata }>('../assets/frames/*.{jpg,jpeg,png,webp}', {
  eager: true,
});

const byId = new Map<string, ImageMetadata>(
  Object.entries(files).map(([path, mod]) => [path.split('/').pop()!.replace(/\.\w+$/, ''), mod.default]),
);

/** Filled in once the photos are selected: order = order of appearance in the film. */
export const frameDefs: FrameDef[] = [];

const defs = new Map(frameDefs.map((d) => [d.id, d]));

export function getFrame(id: string): Frame {
  const def = defs.get(id) ?? { id, alt: { en: '', ru: '' } };
  return { ...def, src: byId.get(id) };
}

export const hasFrames = byId.size > 0;
