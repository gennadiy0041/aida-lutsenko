/**
 * Small typographic pass applied to every line of copy at build time:
 * no dash at the start of a line, no number torn from its unit, no initial torn from a surname,
 * and (in Russian) no short preposition left hanging at the end of a line.
 */
const NBSP = ' ';

export function typoEn(s: string): string {
  return s
    .replace(/\s+—/g, `${NBSP}—`)
    .replace(/(\d\+?)\s+(?=(?!(?:of|in|on|to|and|or|at|for|from)\b)[a-z])/g, `$1${NBSP}`)
    .replace(
      /\b(\d{1,2})\s+(?=(?:January|February|March|April|May|June|July|August|September|October|November|December)\b)/g,
      `$1${NBSP}`,
    )
    .replace(/\((in)\s+(Russian)\)/g, `($1${NBSP}$2)`)
    .replace(/\b(top|Top|Cup|Kazakhstan|March|September|Chapter)\s+(?=\d|[IVX]+\b)/g, `$1${NBSP}`)
    .replace(/\b([A-Z]\.)\s+(?=[A-Z])/g, `$1${NBSP}`);
}

export function typoRu(s: string): string {
  return s
    .replace(/\s+—/g, `${NBSP}—`)
    .replace(/(\d\+?)\s+(?=[а-яё])/g, `$1${NBSP}`)
    .replace(/(Cup|Kazakhstan|Глава|Top)\s+(?=\d|[IVX]+(?![A-Za-z]))/g, `$1${NBSP}`)
    .replace(/(^|[\s(«])([А-ЯЁA-Z]\.)\s+(?=[А-ЯЁA-Z])/g, `$1$2${NBSP}`)
    .replace(/(^|[\s(«])(в|во|на|с|со|и|а|но|из|за|к|ко|о|об|у|по|не|для|от|до|при|им\.)\s+/giu, `$1$2${NBSP}`);
}
