/**
 * The detectors behind tests/site.test.mjs. Each takes text (or bytes) and returns what it found.
 *
 * This repository is public. Every rule here is a general pattern: none of them contains a real
 * phone number, ID, date of birth or address, and failure messages mask whatever a rule matches.
 * tests/rules.test.mjs proves each rule on made-up samples.
 *
 * Characters nobody can tell apart in an editor (no-break space, the dashes, variation selectors)
 * are written as \u{…} escapes, never literally. Every pattern that uses one has the `u` flag.
 */
import { visibleText } from './html.mjs';

/* ------------------------------------------------------------------ private data in text ---- */

/** What sits between the digit groups of a phone number: any space, brackets, the hyphens and dashes (U+2010 to U+2014), the minus sign. */
const SEP = String.raw`\s()\u{2010}-\u{2014}\u{2212}-`;
const gap = `[${SEP}]{0,3}`;
const gapOrDot = `[.${SEP}]{0,3}`;

/** Not inside a longer number, a word, a hash or a URL parameter, and not the fraction of a decimal. */
const STANDS_ALONE = String.raw`(?<![\p{L}\p{N}_#%+=/-])(?<!(?:^|[^\p{L}])[.,])`;
/** The number ends here: no further digit, and no decimal fraction. */
const ENDS = String.raw`(?![.,]?\d)`;

/** Ten national digits in the groupings people write: 705 123 45 67, (7152) 46-12-34, 705 1234567 … */
const NATIONAL = [[3, 3, 2, 2], [3, 2, 2, 3], [4, 2, 2, 2], [4, 3, 3], [5, 1, 2, 2], [5, 2, 3]]
  .map(([area, ...rest]) => String.raw`\(?\d{${area}}\)?` + rest.map((n) => String.raw`${gap}\d{${n}}`).join(''))
  .join('|');

const YEAR_OF_BIRTH = String.raw`(?<!\d)(?:19\d\d|200\d)(?!\d)`;

const digits = { letters: false };
const everything = { letters: true };

/**
 * rule    which test owns the finding
 * what    how the finding is named in a failure message
 * re      the pattern
 * mask    what is hidden when the match is shown: { letters, head, tail } (see mask()); null shows it as it is
 */
const RULES = [
  // +7 and ten digits, in any grouping, dots included: +7 705 123-45-67, +7(705)1234567, +7.705.123.45.67
  { rule: 'phone', what: 'phone number', mask: { ...digits, head: 1, tail: 2 },
    re: new RegExp(String.raw`(?<![\d+])\+\s?7(?:${gapOrDot}\d){10}${ENDS}`, 'gu') },
  // 8 and ten digits, grouped the way phone numbers are (a bare 8 is everywhere in CSS and SVG, so the grouping matters)
  { rule: 'phone', what: 'phone number', mask: { ...digits, head: 1, tail: 2 },
    re: new RegExp(String.raw`${STANDS_ALONE}8${gap}(?:${NATIONAL})${ENDS}(?![ \t\u{A0}]\d)`, 'gu') },
  // links that dial or message a number
  { rule: 'phone', what: 'phone link', mask: { ...digits, head: 1, tail: 2 },
    re: /(?<=^|["'=(>\s])(?:tel|sms|callto):[\s+(]*\d(?:[\s().-]*\d){4,}/gi },
  { rule: 'phone', what: 'messenger link with a phone number', mask: { ...digits, head: 1, tail: 2 },
    re: /(?:wa\.me\/|whatsapp\.com\/send[^"'\s<>]*?phone=|whatsapp:\/\/send[^"'\s<>]*?phone=|viber:\/\/[a-z]+\?number=|t\.me\/\+)(?:%2B|\+)?\d{7,15}(?!\d)/gi },

  // twelve digits standing alone: the shape of a national ID
  { rule: 'id', what: '12-digit number (national ID?)', mask: { ...digits, head: 1, tail: 1 },
    re: /(?<![\p{L}\p{N}_#%+=\/.,-])\d{12}(?![\p{L}\p{N}_])/gu },

  // dd.mm.19yy and 19yy-mm-dd (1970-01-01 is the Unix epoch, not a birthday)
  { rule: 'birth', what: 'date with a 19xx year (date of birth?)', mask: { ...digits, head: 1, tail: 1 },
    re: new RegExp(String.raw`(?<![\dA-Za-z_./-])(?:0?[1-9]|[12]\d|3[01])\s?[./-]\s?(?:0?[1-9]|1[0-2])\s?[./-]\s?19\d\d${ENDS}`, 'gu') },
  { rule: 'birth', what: 'date with a 19xx year (date of birth?)', mask: { ...digits, head: 1, tail: 1 },
    re: /(?<![\d.\/-])19(?!70-01-01)\d\d-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?![\d-])/g },
  // the words themselves
  { rule: 'birth', what: 'date of birth', mask: { ...digits, head: 0, tail: 0 },
    re: /(?<![\p{L}])(?:date[\s_-]+of[\s_-]+birth|birth[\s_-]?date|дат[аыеу]\s+рождения|год[а-яё]{0,2}\s+рождения)(?![\p{L}])/giu },
  { rule: 'birth', what: 'date of birth', mask: { ...digits, head: 0, tail: 0 }, re: /\bDOB\b/g },
  // "born" with a year a living adult could be born in ("Overrule was born in 2026" is fine)
  { rule: 'birth', what: 'year of birth', mask: { ...digits, head: 0, tail: 0 },
    re: new RegExp(String.raw`(?<![\p{L}])(?:born|родил(?:ась|ся|ись)|рожд[её]н\p{L}*)(?![\p{L}])[^<>{}\n]{0,40}?${YEAR_OF_BIRTH}`, 'giu') },
  { rule: 'birth', what: 'year of birth', mask: { ...digits, head: 0, tail: 0 },
    re: new RegExp(String.raw`${YEAR_OF_BIRTH}\s*(?:г\.?\s*р\.|года\s+рождения)`, 'giu') },

  // a street marker followed by a house number
  { rule: 'address', what: 'street address', mask: { ...everything, head: 2, tail: 0 },
    re: /(?<![\p{L}])(?:(?:проспект\p{L}{0,3}|пр-т|пр-кт|мкр)(?![\p{L}])|просп\.|ул\.|мкр\.)[^\d<>\n]{0,40}?\d+/giu },
  // "Example Avenue 12", "example street, 86": the marker, then a house number that is not a year
  { rule: 'address', what: 'street address', mask: { ...everything, head: 0, tail: 0 },
    re: /(?<![\p{L}])(?:street|avenue|str\.|ave\.?)(?![\p{L}-]),?\s+(?:(?:house|building|bldg\.?|apt\.?|apartment|no\.?|#|№)\s*)?(?!(?:19|20)\d\d(?!\d))\d{1,4}[a-z]?(?![\p{L}\d])/giu },
  // "12 Example Avenue": the number first, then a capitalised street name
  { rule: 'address', what: 'street address', mask: { ...everything, head: 0, tail: 0 },
    re: /(?<![\p{L}\d.,])(?!(?:19|20)\d\d(?!\d))\d{1,4}[A-Za-z]?,?\s+(?:\p{Lu}[\p{L}'’.-]*\s+){1,3}(?:Street|Avenue|[Ss]tr\.|Ave\.?)(?![\p{L}])/gu },

  // the patronymic belongs to the scans, never to page text (any case form, Cyrillic or transliterated)
  { rule: 'patronymic', what: 'patronymic', mask: { ...everything, head: 1, tail: 1 },
    re: /(?<![\p{L}])(?:александровн\p{L}{0,3}|ale(?:ks|x)androvn\p{L}{0,2})/giu },

  // the address is gmail.com
  { rule: 'gmail.ru', what: 'gmail.ru', mask: null, re: /gmail\.ru(?![\p{L}])/giu },

  // recommendation letters are not published
  { rule: 'letter', what: 'recommendation letter', mask: null,
    re: /рекомендательн\p{L}*\s+письм\p{L}*|письм\p{L}*\s+(?:с\s+)?рекомендац\p{L}*|letters?\s+of\s+recommendation|recommendation\s+letters?|reference\s+letters?/giu },
];

/**
 * Vector geometry is numbers, not text, and long runs of numbers read like phone numbers and dates.
 * Path data (a quoted string that starts with a moveto and holds only path commands and numbers) and
 * coordinate attributes are blanked before the rules read a file. Offsets do not move.
 */
const GEOMETRY = [
  /(["'`])\s*[Mm]\s*-?[\d.][MmLlHhVvCcSsQqTtAaZzEe\d\s,.+-]{18,}\\?\1/g,
  /(?<=\s(?:points|viewBox|stroke-dasharray|transform|gradientTransform|values|keyTimes|keySplines)=\\?)(?:"[^"]*"|'[^']*')/gi,
];
const withoutGeometry = (text) => GEOMETRY.reduce((t, re) => t.replace(re, (m) => m.replace(/[^\n]/g, ' ')), text);

/**
 * Hides a private value but keeps its shape: `+7 ••• ••• •• 67`.
 * The first `head` and last `tail` digits stay (letters too when `letters` is set); spaces and punctuation always stay.
 */
export function mask(value, { letters = false, head = 1, tail = 1 } = {}) {
  const chars = [...value];
  const hideable = letters ? /[\p{L}\p{N}]/u : /\p{N}/u;
  const at = chars.flatMap((ch, i) => (hideable.test(ch) ? [i] : []));
  const hide = new Set(at.slice(head, Math.max(head, at.length - tail)));
  return chars.map((ch, i) => (hide.has(i) ? '•' : ch)).join('').replace(/\s+/g, ' ');
}

/**
 * Private data in one text file.
 * Markup (HTML, SVG, XML) is read twice: as written, and as a visitor reads it, so a number split
 * by tags or spelled with character references is still one number.
 * Returns [{ rule, what, index, shown }]: `index` is an offset into `text`, `shown` is already masked.
 */
export function privateData(text, { markup = false } = {}) {
  const found = new Map();
  const scan = (view, originOf) => {
    for (const { rule, what, re, mask: how } of RULES) {
      re.lastIndex = 0;
      for (let m = re.exec(view); m; m = re.exec(view)) {
        const index = originOf(m.index);
        const key = `${rule}@${index}`;
        if (!found.has(key)) found.set(key, { rule, what, index, shown: how ? mask(m[0], how) : m[0] });
        if (m[0] === '') re.lastIndex++;
      }
    }
  };
  const source = withoutGeometry(text);
  scan(source, (i) => i);
  if (markup) {
    const seen = visibleText(source);
    scan(seen.text, (i) => seen.origin[i] ?? 0);
  }
  return [...found.values()].sort((a, b) => a.index - b.index);
}

/* ------------------------------------------------------------------------- file names ---- */

const CODE_FILE = /\.(?:js|mjs|cjs|css|map)$/i;
const SIDECAR = /\.(?:br|gz|zst)$/i;

/**
 * Why a file name suggests a recommendation letter or an identity document, or null.
 * Names are read as words (`rec-letter_2.jpg` → rec, letter, 2), so `letterbox.webp` is not a letter.
 * The base name of a script or stylesheet is skipped: a bundler names chunks after source files
 * (`Letters.astro…js`), and a letter is never a .js file. Directory names always count.
 */
export function suspectName(rel) {
  const parts = rel.replace(SIDECAR, '').split('/');
  const base = parts.pop();
  const named = CODE_FILE.test(base) ? parts : [...parts, base.replace(/\.[^.]+$/, '')];
  const words = named
    .join('/')
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{L})(\p{N})/gu, '$1 $2')
    .replace(/(\p{N})(\p{L})/gu, '$1 $2')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  for (const [i, word] of words.entries()) {
    if (/^(?:letters?|pismo|pisma|письм\p{L}*)$/u.test(word)) return `"${word}": a letter`;
    if (/^(?:recommend|rekomend|рекоменд)/u.test(word)) return `"${word}": a recommendation`;
    if (/^(?:passport|pasport|паспорт)/u.test(word)) return `"${word}": a passport`;
    if (/^(?:udostover|удостовер)/u.test(word)) return `"${word}": an identity card`;
    if (word === 'idcard' || word === 'иин' || (word === 'id' && words[i + 1] === 'card')) return `"${word}": an identity document`;
  }
  return null;
}

const DOCUMENT_EXT = /\.(?:pdf|docx?|docm|rtf|odt|pages|xlsx?|xlsm|ods|pptx?|key|zip|rar|7z|tar|tgz)$/i;
const MAGIC = [
  ['PDF', Buffer.from('%PDF-')],
  ['Office document', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
  ['zip archive (or Office document)', Buffer.from([0x50, 0x4b, 0x03, 0x04])],
  ['rar archive', Buffer.from('Rar!')],
  ['7z archive', Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])],
];

/** The kind of document a file is (by extension, or by its first bytes whatever it is called), or null. */
export function documentKind(rel, bytes) {
  const ext = DOCUMENT_EXT.exec(rel.replace(SIDECAR, ''));
  if (ext) return `${ext[0].slice(1).toLowerCase()} file`;
  const head = bytes.subarray(0, 16);
  for (const [kind, magic] of MAGIC) {
    const at = head.indexOf(magic);
    if (at >= 0 && at <= 4) return kind;
  }
  return null;
}

/* --------------------------------------------------------- metadata hidden in pictures ---- */

const TIFF_LE = Buffer.from([0x49, 0x49, 0x2a, 0x00]);
const TIFF_BE = Buffer.from([0x4d, 0x4d, 0x00, 0x2a]);
/** The QuickTime location atom: the copyright sign (0xA9) and "xyz". */
const QT_LOCATION = Buffer.from([0xa9, 0x78, 0x79, 0x7a]);

/** One EXIF block starting at its TIFF header: does it carry a GPS position, an embedded thumbnail? */
function readExif(bytes, tiff) {
  const le = bytes[tiff] === 0x49;
  const u16 = (o) => (o >= 0 && o + 2 <= bytes.length ? (le ? bytes.readUInt16LE(o) : bytes.readUInt16BE(o)) : -1);
  const u32 = (o) => (o >= 0 && o + 4 <= bytes.length ? (le ? bytes.readUInt32LE(o) : bytes.readUInt32BE(o)) : -1);
  const directory = (offset) => {
    const base = tiff + offset;
    const count = u16(base);
    if (offset < 8 || count < 1 || count > 512 || base + 2 + count * 12 + 4 > bytes.length) return null;
    const tags = new Map();
    for (let i = 0; i < count; i++) tags.set(u16(base + 2 + i * 12), u32(base + 2 + i * 12 + 8));
    return { tags, next: u32(base + 2 + count * 12) };
  };
  const first = directory(u32(tiff + 4));
  if (!first) return {};
  const gps = first.tags.has(0x8825) ? directory(first.tags.get(0x8825)) : null;
  const second = first.next > 0 ? directory(first.next) : null;
  return {
    gps: !!gps && (gps.tags.has(0x0002) || gps.tags.has(0x0004)),
    thumbnail: !!second && (second.tags.has(0x0201) || second.tags.has(0x0111)),
  };
}

/**
 * What a picture or a video gives away beside its pixels: where it was taken (EXIF or XMP GPS, the
 * QuickTime location atom) and an embedded thumbnail, which can still show the frame before it was cropped.
 * Images that go through the build have none of it; a file copied into public/ as it left the phone has all of it.
 */
export function hiddenMetadata(bytes) {
  const found = new Set();
  for (const signature of [TIFF_LE, TIFF_BE]) {
    for (let at = bytes.indexOf(signature); at >= 0; at = bytes.indexOf(signature, at + 1)) {
      const exif = readExif(bytes, at);
      if (exif.gps) found.add('GPS position (EXIF)');
      if (exif.thumbnail) found.add('embedded thumbnail (EXIF), which can show the uncropped original');
    }
  }
  if (bytes.includes('GPSLatitude') || bytes.includes('GPSLongitude')) found.add('GPS position (XMP)');
  if (bytes.includes('com.apple.quicktime.location')) found.add('GPS position (QuickTime location)');
  for (let at = bytes.indexOf(QT_LOCATION); at >= 0; at = bytes.indexOf(QT_LOCATION, at + 1)) {
    if (/[+-]\d{2}\.\d+[+-]\d{2,3}\.\d+/.test(bytes.subarray(at + 4, at + 44).toString('latin1'))) found.add('GPS position (QuickTime location)');
  }
  return [...found];
}

/* ------------------------------------------------------------------------ house style ---- */

/** Every gradient function in a piece of CSS: linear-, radial-, conic-, their repeating- and prefixed forms. */
export function gradients(css) {
  return [...css.matchAll(/gradient\s*\(/gi)].map((m) => {
    let start = m.index; // walk back over the rest of the function name: repeating-linear-, -webkit-
    while (start > 0 && /[a-z-]/i.test(css[start - 1])) start--;
    return { index: start, name: css.slice(start, m.index + 'gradient'.length) };
  });
}

/**
 * Emoji: everything in the pictograph planes (U+1F000 to U+1FAFF), the keycap (U+20E3) and the emoji
 * presentation selector (U+FE0F), and every character Unicode calls an emoji. Digits, # and * are
 * emoji only as keycaps; the copyright, registered and trade mark signs only with the selector.
 * A character followed by the text selector U+FE0E is asked to stay text, so it passes: phones draw
 * a bare north-east arrow, play triangle or check mark as a colour emoji.
 */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{E0020}-\u{E007F}\u{20E3}\u{FE0F}]|(?![#*0-9\u{A9}\u{AE}\u{2122}])\p{Emoji}(?!\u{FE0E})/gu;

export function emoji(text) {
  return [...text.matchAll(EMOJI)].map((m) => ({
    index: m.index,
    char: m[0],
    code: `U+${m[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
  }));
}

/* ------------------------------------------------------------------------- reading files ---- */

const BINARY_EXT = /\.(?:png|jpe?g|webp|avif|gif|ico|bmp|tiff?|heic|heif|mp4|m4v|mov|webm|mp3|m4a|wav|ogg|woff2?|ttf|otf|eot|br|gz|zst|pdf|zip)$/i;
const TEXT_EXT = /\.(?:html?|css|m?js|cjs|json|txt|xml|svg|map|webmanifest|md|csv|vcf|ics|rss|atom|ya?ml|toml)$/i;

/** The text of a file, or null when it is not text. Unknown extensions are judged by their bytes. */
export function textOf(rel, bytes) {
  if (BINARY_EXT.test(rel)) return null;
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (!TEXT_EXT.test(rel) && bytes.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return TEXT_EXT.test(rel) ? new TextDecoder('windows-1251').decode(bytes) : null;
  }
}

export const isMarkup = (rel) => /\.(?:html?|svg|xml)$/i.test(rel);
