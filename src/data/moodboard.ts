/**
 * Moodboard manifest: exactly ten plates, in order of appearance on /moodboard.
 *
 * The photographs live in src/assets/stills/<id>.jpg (jpeg, png and webp work too).
 * A plate without a file renders as a coal slate, so the page builds at any stage and
 * needs no code change when the files arrive.
 *
 * The layout gives every plate a fixed slot. The photograph covers its slot
 * (object-fit: cover), so choose pictures that survive the crop and steer the crop
 * with `pos` (CSS object-position, e.g. '50% 30%' keeps the upper part).
 *
 *   id    slot                                  proportion
 *   p01   opening plate, full bleed             2.39 : 1
 *   p02   tall portrait, left page              4 : 5
 *   p03   small plate, right page               1 : 1
 *   p04   small plate, right page               3 : 2
 *   p05   small plate beside the pull-line      4 : 5
 *   p06   small plate, left page                1 : 1
 *   p07   large plate across the fold           3 : 2
 *   p08   diptych, left                         4 : 5
 *   p09   diptych, right                        4 : 5
 *   p10   closing plate, full bleed             2.39 : 1
 */
import type { ImageMetadata } from 'astro';
import type { L } from './copy';

export interface PlateDef {
  /** 'p01' … 'p10': also the file name in src/assets/stills. */
  id: string;
  /** Short caption, set as tiny tracked capitals. Leave both strings empty for a number-only caption. */
  caption: L;
  /** What is in the picture, for screen readers. Falls back to the caption. */
  alt?: L;
  /** CSS object-position inside the slot. Default: centre. */
  pos?: string;
}

export interface Plate extends PlateDef {
  /** 1 … 10 */
  n: number;
  /** '01' … '10' */
  no: string;
  src?: ImageMetadata;
}

/** Placeholder captions until the pictures are chosen. */
const untitled: L = { en: 'Untitled', ru: 'Без названия' };

export const plateDefs: PlateDef[] = [
  { id: 'p01', caption: untitled },
  { id: 'p02', caption: untitled },
  { id: 'p03', caption: untitled },
  { id: 'p04', caption: untitled },
  { id: 'p05', caption: untitled },
  { id: 'p06', caption: untitled },
  { id: 'p07', caption: untitled },
  { id: 'p08', caption: untitled },
  { id: 'p09', caption: untitled },
  { id: 'p10', caption: untitled },
];

const files = import.meta.glob<{ default: ImageMetadata }>('../assets/stills/*.{jpg,jpeg,png,webp}', {
  eager: true,
});

const byId = new Map<string, ImageMetadata>(
  Object.entries(files).map(([path, mod]) => [path.split('/').pop()!.replace(/\.\w+$/, ''), mod.default]),
);

/** The ten plates, in order, each with its photograph when the file exists. */
export const plates: Plate[] = plateDefs.map((def, i) => ({
  ...def,
  n: i + 1,
  no: String(i + 1).padStart(2, '0'),
  src: byId.get(def.id),
}));

export function getPlate(id: string): Plate {
  const plate = plates.find((p) => p.id === id);
  if (!plate) throw new Error(`moodboard: unknown plate "${id}"`);
  return plate;
}

/** Words on the page. */
export const board = {
  title: { en: 'Moodboard', ru: 'Мудборд' } as L,
  /** Issue line. The numero sign differs between the two languages. */
  issue: { en: 'N° 01 — MMXXVI', ru: '№ 01 — MMXXVI' } as L,
  issueShort: { en: 'N° 01', ru: '№ 01' } as L,
  /** The deck, one array item per sentence (each sentence is a line on phones). */
  deck: {
    en: ['Desert, concrete, evening light.', 'Black on sand.'],
    ru: ['Пустыня, бетон, вечерний свет.', 'Чёрное на песке.'],
  },
  count: { en: 'Ten plates', ru: 'Десять кадров' } as L,
  /** Abbreviation in front of a plate number: Pl. 01 / Кадр 01. */
  plate: { en: 'Pl.', ru: 'Кадр' } as L,
  /** The pull-line, one array item per line. */
  pull: {
    en: ['The quieter the frame,', 'the longer you look.'],
    ru: ['Чем тише кадр,', 'тем дольше смотришь.'],
  },
  film: { en: 'The film', ru: 'Фильм' } as L,
  next: { en: 'Next', ru: 'Дальше' } as L,
  pageTitle: { en: 'Moodboard — Aida Lutsenko', ru: 'Мудборд — Аида Луценко' } as L,
  description: {
    en: 'Desert, concrete, evening light. Black on sand. Ten plates from Aida Lutsenko.',
    ru: 'Пустыня, бетон, вечерний свет. Чёрное на песке. Десять кадров Аиды Луценко.',
  } as L,
};
