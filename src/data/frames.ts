/**
 * Frame manifest. Every frame is a graded 2.39:1 master in src/assets/frames (made by
 * scripts/grade-frames.mjs from the original photographs, which never enter the repository).
 * A frame may also have an upright companion in src/assets/stills/<id>-tall.jpg: portrait
 * phones show that one instead of a thin slice of the wide frame.
 * A frame id without a file renders as a film-leader slate, so the site builds at any stage.
 */
import type { ImageMetadata } from 'astro';
import type { L } from './copy';

export type CameraMove = 'push' | 'pull' | 'pan-left' | 'pan-right' | 'tilt-up' | 'tilt-down';

export interface FrameDef {
  id: string;
  alt: L;
  /** CSS object-position of the wide frame inside the gate, e.g. "50% 40%". */
  pos?: string;
  /** CSS object-position of the upright companion inside a phone window. */
  posTall?: string;
  /** Horizontal focal point 0..1 of the wide frame, used when a phone has no upright companion. */
  focusX?: number;
  move?: CameraMove;
}

export interface Frame extends FrameDef {
  src?: ImageMetadata;
  tall?: ImageMetadata;
}

const files = import.meta.glob<{ default: ImageMetadata }>('../assets/frames/*.{jpg,jpeg,png,webp}', {
  eager: true,
});
const tallFiles = import.meta.glob<{ default: ImageMetadata }>('../assets/stills/*-tall.{jpg,jpeg,png,webp}', {
  eager: true,
});

const name = (path: string) => path.split('/').pop()!.replace(/\.\w+$/, '');
const byId = new Map<string, ImageMetadata>(Object.entries(files).map(([p, m]) => [name(p), m.default]));
const tallById = new Map<string, ImageMetadata>(
  Object.entries(tallFiles).map(([p, m]) => [name(p).replace(/-tall$/, ''), m.default]),
);

/** Order = order of appearance in the film. */
export const frameDefs: FrameDef[] = [
  {
    id: 'f01',
    alt: {
      en: 'Aida in a black abaya walks out of a sandstone canyon into the light',
      ru: 'Аида в чёрной абайе выходит из каньона из песчаника на свет',
    },
    move: 'push',
  },
  {
    id: 'f02',
    alt: {
      en: 'A wall of red sandstone cliffs under a clear sky',
      ru: 'Стена красных скал из песчаника под ясным небом',
    },
    move: 'pan-right',
  },
  {
    id: 'f03',
    alt: {
      en: 'Aida in a black abaya, seen from behind, on open sand',
      ru: 'Аида в чёрной абайе, со спины, на открытом песке',
    },
    posTall: '50% 62%',
    move: 'push',
  },
  {
    id: 'f04',
    alt: {
      en: 'Aida in sunglasses beside a mirrored wall that reflects the desert cliffs',
      ru: 'Аида в тёмных очках у зеркальной стены, в которой отражаются скалы пустыни',
    },
    posTall: '48% 50%',
    move: 'pan-left',
  },
  {
    id: 'f05',
    alt: {
      en: 'Aida in a headscarf and sunglasses, desert cliffs behind',
      ru: 'Аида в платке и тёмных очках, позади — скалы пустыни',
    },
    posTall: '38% 50%',
    move: 'push',
  },
  {
    id: 'f06',
    alt: {
      en: 'A station clock and a departure board: 14:20, Madinah',
      ru: 'Вокзальные часы и табло отправления: 14:20, Медина',
    },
    posTall: '32% 40%',
    move: 'tilt-up',
  },
  {
    id: 'f07',
    alt: {
      en: 'A city street between tall buildings at dusk',
      ru: 'Городская улица между высотными зданиями в сумерках',
    },
    move: 'push',
  },
  {
    id: 'f08',
    alt: {
      en: 'Aida at a glass railing under a ceiling of small lights, the night city below',
      ru: 'Аида у стеклянного ограждения под потолком из огней, внизу ночной город',
    },
    posTall: '48% 50%',
    move: 'pull',
  },
  {
    id: 'f09',
    alt: {
      en: 'Aida, seen from behind, looks down at the lights of a city at night',
      ru: 'Аида со спины смотрит вниз на огни ночного города',
    },
    move: 'push',
  },
  {
    id: 'f10',
    alt: {
      en: 'Aida walks away down a stone path into a desert valley, scarf in the wind',
      ru: 'Аида уходит по каменной дорожке в долину, платок развевается на ветру',
    },
    posTall: '50% 42%',
    move: 'pull',
  },
];

const defs = new Map(frameDefs.map((d) => [d.id, d]));

export function getFrame(id: string): Frame {
  const def = defs.get(id) ?? { id, alt: { en: '', ru: '' } };
  const src = byId.get(id);
  if (src && !(def.alt.en.trim() && def.alt.ru.trim())) {
    throw new Error(`frames: "${id}" has a photograph but no alt text. Add it to frameDefs in src/data/frames.ts`);
  }
  return { ...def, src, tall: tallById.get(id) };
}

export const hasFrames = byId.size > 0;
