/**
 * A small reader for the built pages: tags with their attributes, <style> and <script> blocks,
 * and the text a visitor reads. No dependencies; it only has to understand the HTML Astro emits.
 *
 * Characters nobody can see in an editor (no-break space, soft hyphen, joiners) are written here
 * as code points or as \u{…} escapes, never literally.
 */

/** The named character references that matter to the rules (spaces, dashes, signs), as code points. 0 means "nothing visible". */
const NAMED = {
  amp: 0x26, lt: 0x3c, gt: 0x3e, quot: 0x22, apos: 0x27, num: 0x23, commat: 0x40, plus: 0x2b, sol: 0x2f,
  lpar: 0x28, rpar: 0x29, period: 0x2e, comma: 0x2c, colon: 0x3a,
  nbsp: 0xa0, ensp: 0x2002, emsp: 0x2003, numsp: 0x2007, puncsp: 0x2008, thinsp: 0x2009, hairsp: 0x200a,
  hyphen: 0x2010, dash: 0x2010, ndash: 0x2013, mdash: 0x2014, minus: 0x2212,
  shy: 0, zwj: 0, zwnj: 0,
};

const ENTITY = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,31}));/g;

const isCodePoint = (code) => code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);

function entityValue(whole, dec, hex, name) {
  if (name !== undefined) {
    if (!Object.hasOwn(NAMED, name)) return whole;
    return NAMED[name] ? String.fromCodePoint(NAMED[name]) : '';
  }
  const code = dec !== undefined ? Number(dec) : parseInt(hex, 16);
  return isCodePoint(code) ? String.fromCodePoint(code) : whole;
}

/** `&#43;7&nbsp;…` → `+7 …` (with a real no-break space). Unknown named references stay as written. */
export function decodeEntities(text) {
  return text.includes('&') ? text.replace(ENTITY, entityValue) : text;
}

/** CSS escapes (`\1F600 `, `\2197`) → the characters they stand for. */
export function decodeCssEscapes(css) {
  return css.replace(/\\([0-9a-fA-F]{1,6})[ \t\n\f\r]?/g, (whole, hex) => {
    const code = parseInt(hex, 16);
    return isCodePoint(code) ? String.fromCodePoint(code) : whole;
  });
}

const blank = (m) => m.replace(/[^\n]/g, ' ');

/**
 * Reads one HTML (or SVG) document.
 *   tags    every start tag outside comments, scripts and styles: { name, attrs: Map, index }
 *   styles  CSS found in the document: <style> blocks and style="" attributes: { css, index }
 *   scripts inline <script> bodies: { code, index, attrs }
 * `index` is always an offset into the original text, so a finding can be reported as line:column.
 */
export function readHtml(raw) {
  const styles = [];
  const scripts = [];
  let markup = raw.replace(/<!--[\s\S]*?-->/g, blank);
  markup = markup.replace(/<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi, (whole, kind, attrText, body, offset) => {
    const bodyStart = whole.indexOf('>') + 1;
    if (kind.toLowerCase() === 'style') styles.push({ css: body, index: offset + bodyStart });
    else scripts.push({ code: body, index: offset + bodyStart, attrs: readAttrs(attrText, 0).attrs });
    return whole.slice(0, bodyStart) + blank(body) + whole.slice(bodyStart + body.length);
  });

  const tags = [];
  const open = /<([a-zA-Z][\w:-]*)/g;
  for (let m = open.exec(markup); m; m = open.exec(markup)) {
    const { attrs, end, positions } = readAttrs(markup, open.lastIndex);
    const close = markup.indexOf('>', end);
    tags.push({ name: m[1].toLowerCase(), attrs, index: m.index });
    if (attrs.has('style')) styles.push({ css: attrs.get('style'), index: positions.get('style') });
    open.lastIndex = close < 0 ? markup.length : close + 1;
  }
  return { tags, styles, scripts };
}

/** Attributes starting at `from`; names are lower-cased, values have their character references decoded. */
function readAttrs(text, from) {
  const attr = /\s*([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>]+)))?/y;
  const attrs = new Map();
  const positions = new Map();
  let end = from;
  for (;;) {
    attr.lastIndex = end;
    const a = attr.exec(text);
    if (!a) break;
    const name = a[1].toLowerCase();
    if (!attrs.has(name)) {
      attrs.set(name, decodeEntities(a[2] ?? a[3] ?? a[4] ?? ''));
      positions.set(name, a.index);
    }
    end = attr.lastIndex;
  }
  return { attrs, end, positions };
}

const TAG_OR_COMMENT = String.raw`<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>`;
const ENTITY_TOKEN = String.raw`&(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});`;
/** Soft hyphen, zero-width space, non-joiner and joiner, word joiner, byte-order mark. */
const INVISIBLE = String.raw`[\u{AD}\u{200B}-\u{200D}\u{2060}\u{FEFF}]`;

/** Rewrites `raw` token by token and remembers where every character of the result came from. */
function unfold(raw, pattern, replace) {
  const out = [];
  const origin = [];
  let last = 0;
  for (let m = pattern.exec(raw); m; m = pattern.exec(raw)) {
    for (let i = last; i < m.index; i++) { out.push(raw[i]); origin.push(i); }
    const put = replace(m[0]);
    for (let i = 0; i < put.length; i++) { out.push(put[i]); origin.push(m.index); }
    last = pattern.lastIndex;
  }
  for (let i = last; i < raw.length; i++) { out.push(raw[i]); origin.push(i); }
  return { text: out.join(''), origin };
}

/**
 * The document as a visitor reads it: tags removed, character references decoded, invisible characters dropped.
 * A number split by markup or written with references (`+7&nbsp;<b>7…</b>`) becomes one run of text here.
 * `origin[i]` is the offset in the original text of character `i`.
 */
export function visibleText(raw) {
  return unfold(raw, new RegExp(`${TAG_OR_COMMENT}|${ENTITY_TOKEN}|${INVISIBLE}`, 'gu'), (token) => {
    if (token[0] === '&') return decodeEntities(token);
    if (token[0] === '<' && !/^<\/?wbr\b|^<!--/i.test(token)) return ' ';
    return '';
  });
}

/** The source with its character references decoded and everything else (tags, attributes, scripts) in place. */
export function decodedSource(raw) {
  return unfold(raw, new RegExp(ENTITY_TOKEN, 'g'), decodeEntities);
}

/** `line:column` (1-based) of an offset. */
export function position(text, index) {
  const before = text.slice(0, index);
  const line = before.split('\n').length;
  return `${line}:${index - before.lastIndexOf('\n')}`;
}

/** A short, single-line excerpt around an offset, for failure messages. */
export function excerpt(text, index, length = 80) {
  const start = Math.max(0, index - 10);
  const piece = text.slice(start, start + length).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${piece}${start + length < text.length ? '…' : ''}`;
}
