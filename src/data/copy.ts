/** Bilingual copy. English is the default language, Russian is the switch. */
export type L = { en: string; ru: string };

export const person = {
  name: { en: 'Aida Lutsenko', ru: 'Аида Луценко' } as L,
  first: { en: 'Aida', ru: 'Аида' } as L,
  last: { en: 'Lutsenko', ru: 'Луценко' } as L,
  email: 'aidalutsenko@gmail.com',
  instagram: { handle: '@aida.luts', url: 'https://www.instagram.com/aida.luts/' },
};

export const titles = {
  kicker: { en: 'A film in four chapters', ru: 'Фильм в четырёх главах' } as L,
  place: { en: 'Kazakhstan', ru: 'Казахстан' } as L,
  years: '2018 — 2026',
  cue: { en: 'Scroll', ru: 'Листайте' } as L,
  begin: { en: 'Begin', ru: 'Начать' } as L,
};

export type ChapterId = 'quarry' | 'science' | 'commercialization' | 'code';

export const chapters: { id: ChapterId; numeral: string; title: L }[] = [
  { id: 'quarry', numeral: 'I', title: { en: 'Quarry', ru: 'Карьер' } },
  { id: 'science', numeral: 'II', title: { en: 'Science', ru: 'Наука' } },
  { id: 'commercialization', numeral: 'III', title: { en: 'Commercialization', ru: 'Коммерциализация' } },
  { id: 'code', numeral: 'IV', title: { en: 'Code', ru: 'Код' } },
];

export const ui = {
  langLabel: { en: 'Language', ru: 'Язык' } as L,
  openingTitles: { en: 'Opening titles', ru: 'Вступительные титры' } as L,
};
