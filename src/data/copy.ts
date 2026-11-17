/** Bilingual copy. English is the default language, Russian is the switch. */
export type L = { en: string; ru: string };

export type ChapterId = 'quarry' | 'science' | 'commercialization' | 'code';

export const person = {
  name: { en: 'Aida Lutsenko', ru: 'Аида Луценко' } as L,
  first: { en: 'Aida', ru: 'Аида' } as L,
  last: { en: 'Lutsenko', ru: 'Луценко' } as L,
  email: 'aidalutsenko@gmail.com',
  instagram: { handle: '@aida.luts', url: 'https://www.instagram.com/aida.luts/' },
};

export const meta = {
  title: {
    en: 'Aida Lutsenko — a true story in four chapters',
    ru: 'Аида Луценко — реальная история в четырёх главах',
  } as L,
  description: {
    en: 'Six years running a stone quarry, a PhD, a commercialization office, an MVP built in 24 hours. The true story of Aida Lutsenko, cut as a film.',
    ru: 'Шесть лет во главе карьера, PhD, офис коммерциализации, MVP за 24 часа. Реальная история Аиды Луценко, смонтированная как фильм.',
  } as L,
};

export const titles = {
  kicker: { en: 'A true story in four chapters', ru: 'Реальная история в четырёх главах' } as L,
  place: { en: 'Kazakhstan', ru: 'Казахстан' } as L,
  years: '2018 — 2026',
  cue: { en: 'Roll film', ru: 'Мотор' } as L,
};
