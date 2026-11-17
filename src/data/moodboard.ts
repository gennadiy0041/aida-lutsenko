/**
 * Moodboard manifest: the ten plates of /moodboard, in order, and every word on that page.
 *
 * PHOTOGRAPHS
 * Drop the files into src/assets/stills/ as p01.jpg … p10.jpg (jpeg, png and webp work too).
 * Nothing else has to change: a plate without a file shows a coal slate, a plate with a file
 * shows the photograph, optimised to AVIF and WebP at build time.
 *
 * SLOTS
 * The layout gives every plate a slot of fixed proportion, the same on phones and on desktop.
 * The photograph covers its slot (object-fit: cover), so pick a picture that survives the crop
 * and steer the crop with `pos` (CSS object-position: '50% 30%' keeps the upper part,
 * '20% 50%' the left part).
 *
 *   id    slot                                           proportion
 *   p01   opening plate, edge to edge                    2.39 : 1
 *   p02   tall portrait, runs off the left edge          4 : 5
 *   p03   small plate, right page, top                   1 : 1
 *   p04   small plate, right page, bottom                3 : 2
 *   p05   small plate in white space, by the pull-line   4 : 5
 *   p06   small plate, left page                         1 : 1
 *   p07   large plate, runs off the right edge           3 : 2
 *   p08   diptych, left                                  4 : 5
 *   p09   diptych, right                                 4 : 5
 *   p10   closing plate, edge to edge                    2.39 : 1
 *
 * To move a photograph to another slot, rename the file; the list below stays p01 … p10.
 */
import type { ImageMetadata } from 'astro';
import type { L } from './copy';

export interface PlateDef {
  /** 'p01' … 'p10': the slot, and the file name in src/assets/stills. */
  id: string;
  /** A few words, set as tiny tracked capitals after the plate number. Two empty strings: the number alone. */
  caption: L;
  /** What the picture shows, for screen readers. Write it together with the caption. */
  alt?: L;
  /** CSS object-position inside the slot. Default: centre. */
  pos?: string;
}

export interface Plate extends PlateDef {
  /** 1 … 10 */
  n: number;
  /** '01' … '10' */
  no: string;
  /** The photograph, when its file exists. */
  src?: ImageMetadata;
}

const defs: PlateDef[] = [
  {
    id: 'p01',
    caption: { en: 'Sandstone, AlUla', ru: 'Песчаник, Аль-Ула' },
    alt: {
      en: 'Aida walks along a wooden deck by a pool, under a wall of red sandstone',
      ru: 'Аида идёт по деревянному настилу у бассейна, под стеной красного песчаника',
    },
  },
  {
    id: 'p02',
    caption: { en: 'Veil and glass', ru: 'Платок и стекло' },
    alt: {
      en: 'Aida in a pale abaya, headscarf and sunglasses; desert cliffs behind her',
      ru: 'Аида в светлой абайе, платке и тёмных очках; за ней скалы пустыни',
    },
    pos: '40% 40%',
  },
  {
    id: 'p03',
    caption: { en: 'Dark stone', ru: 'Тёмный камень' },
    alt: { en: 'A wall of dark stone tiles beside a lit doorway', ru: 'Стена из тёмных каменных плит у освещённого проёма' },
  },
  {
    id: 'p04',
    caption: { en: 'Dusk', ru: 'Сумерки' },
    alt: { en: 'Palm trees in silhouette against the evening sky', ru: 'Силуэты пальм на фоне вечернего неба' },
  },
  {
    id: 'p05',
    caption: { en: 'Black on sand', ru: 'Чёрное на песке' },
    alt: {
      en: 'Aida in a black abaya that opens in the wind, on desert sand',
      ru: 'Аида в чёрной абайе, которую раскрывает ветер, на песке пустыни',
    },
    pos: '50% 60%',
  },
  {
    id: 'p06',
    caption: { en: '14:20', ru: '14:20' },
    alt: { en: 'A station clock and a departure board', ru: 'Вокзальные часы и табло отправления' },
  },
  {
    id: 'p07',
    caption: { en: 'City, evening', ru: 'Город, вечер' },
    alt: { en: 'A city street between tall buildings at dusk', ru: 'Городская улица между высотными зданиями в сумерках' },
  },
  {
    id: 'p08',
    caption: { en: 'Mirror in the desert', ru: 'Зеркало в пустыне' },
    alt: {
      en: 'Aida in a long dress beside a mirrored wall that reflects the canyon',
      ru: 'Аида в длинном платье у зеркальной стены, в которой отражается каньон',
    },
    pos: '50% 45%',
  },
  {
    id: 'p09',
    caption: { en: 'Portrait in black', ru: 'Портрет в чёрном' },
    alt: { en: 'A black-and-white portrait of Aida in a black turtleneck', ru: 'Чёрно-белый портрет Аиды в чёрной водолазке' },
    pos: '50% 30%',
  },
  {
    id: 'p10',
    caption: { en: 'Last light', ru: 'Последний свет' },
    alt: {
      en: 'Aida stands on rocks by the sea at sunset',
      ru: 'Аида стоит на камнях у моря на закате',
    },
  },
];

const SLOTS = 10;
if (defs.length !== SLOTS || defs.some((def, i) => def.id !== `p${String(i + 1).padStart(2, '0')}`)) {
  throw new Error('moodboard: the layout has exactly ten slots, so the list must be p01 … p10, in that order');
}

const files = import.meta.glob<{ default: ImageMetadata }>('../assets/stills/*.{jpg,jpeg,png,webp}', {
  eager: true,
});

const byId = new Map<string, ImageMetadata>(
  Object.entries(files).map(([path, mod]) => [path.split('/').pop()!.replace(/\.\w+$/, ''), mod.default]),
);

/** The ten plates, in order, each with its photograph when the file exists. */
export const plates: Plate[] = defs.map((def, i) => ({
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

/** Every word on the page. */
export const board = {
  title: { en: 'Moodboard', ru: 'Мудборд' } as L,
  /** The issue line. The numero sign differs between the two languages. */
  issue: { en: 'N° 01 — MMXXVI', ru: '№ 01 — MMXXVI' } as L,
  issueShort: { en: 'N° 01', ru: '№ 01' } as L,
  /** The deck, one item per sentence (each sentence is a line of its own on phones). */
  deck: {
    en: ['Desert, architecture, evening light.', 'Black on sand.'],
    ru: ['Пустыня, архитектура, вечерний свет.', 'Чёрное на песке.'],
  },
  count: { en: 'Ten plates', ru: 'Десять кадров' } as L,
  /** In front of a plate number: Pl. 01 / Кадр 01. */
  plate: { en: 'Pl.', ru: 'Кадр' } as L,
  /** The pull-line beside plate 05, one item per line. */
  pull: {
    en: ['And black,', 'worn like a signature.'],
    ru: ['И чёрный —', 'как подпись.'],
  },
  /** The way back to the film: beside the name in the top row, and above the closing link. */
  film: { en: 'The film', ru: 'Фильм' } as L,
  next: { en: 'Next', ru: 'Дальше' } as L,
  /** Browser tab and link preview. */
  pageTitle: { en: 'Moodboard — Aida Lutsenko', ru: 'Мудборд — Аида Луценко' } as L,
  description: {
    en: 'Desert, architecture, evening light. Black on sand. Ten plates from Aida Lutsenko.',
    ru: 'Пустыня, архитектура, вечерний свет. Чёрное на песке. Десять кадров Аиды Луценко.',
  } as L,
};
