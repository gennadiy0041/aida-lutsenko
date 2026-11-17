/**
 * The lane that guards the built site: what must never go wrong on aida-lutsenko.
 *
 * It reads dist/ and never builds it. Build first, then test:
 *
 *   npm run build && npm test
 *
 * Privacy    no phone number, national ID, date of birth, street address or patronymic in any text
 *            file; no documents; nothing hidden in picture metadata
 * Style      no gradients, no emoji
 * Structure  every page has its language, one <h1>, a title and a link preview; every link resolves
 * Bilingual  every English string has its Russian twin
 * Contact    the only e-mail address and the only Instagram account are the public ones
 *
 * The rules live in tests/lib/rules.mjs. SITE_DIST=<dir> points the lane at another build output.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { decodeCssEscapes, decodeEntities, decodedSource, excerpt, position, readHtml, visibleText } from './lib/html.mjs';
import { documentKind, emoji, gradients, hiddenMetadata, isMarkup, privateData, suspectName, textOf } from './lib/rules.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OWN_DIST = !process.env.SITE_DIST;
const DIST = OWN_DIST ? path.join(ROOT, 'dist') : path.resolve(process.env.SITE_DIST);
const LABEL = path.basename(DIST);

/** The public contacts. Everything else about Aida stays off the site. */
const EMAIL = 'aidalutsenko@gmail.com';
const INSTAGRAM = 'aida.luts';

/* ------------------------------------------------------------------------------ the site ---- */

/** Every file of the build, read once: { rel, bytes, text (null for binary files), html (pages and SVG) }. */
function load() {
  if (!fs.existsSync(DIST) || !fs.statSync(DIST).isDirectory()) return { missing: `${DIST} does not exist.` };
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(abs); continue; }
      if (!entry.isFile()) continue;
      const rel = path.relative(DIST, abs).split(path.sep).join('/');
      const bytes = fs.readFileSync(abs);
      const text = textOf(rel, bytes);
      files.push({ rel, bytes, text, html: text !== null && isMarkup(rel) ? readHtml(text) : null });
    }
  };
  try { walk(DIST); } catch (error) { return { missing: `${DIST} changed while it was being read (${error.code ?? error.message}). Is a build running?` }; }
  if (!files.some((f) => f.rel === 'index.html')) return { missing: `${DIST} has no index.html.` };
  return { files, byRel: new Map(files.map((f) => [f.rel, f])), pages: files.filter((f) => /\.html?$/i.test(f.rel) && f.html) };
}

const site = load();
const name = (file) => `${LABEL}/${file.rel}`;
const at = (file, index) => `${name(file)}:${position(file.text, index)}`;

/** Fails with one line per problem: file, place, what is wrong. The list is the whole story, so no stack trace follows it. */
function expectNone(problems, fix) {
  if (problems.length === 0) return;
  const lines = problems.slice(0, 30).map((p) => `  ${p}`);
  if (problems.length > 30) lines.push(`  … and ${problems.length - 30} more`);
  const error = new Error(`${problems.length} problem${problems.length === 1 ? '' : 's'}. ${fix}\n${lines.join('\n')}`);
  error.stack = error.message;
  throw error;
}

/** `content` of the first <meta property|name="key">, trimmed; undefined when the page has none. */
function meta(page, key) {
  const tag = page.html.tags.find((t) => t.name === 'meta' && (t.attrs.get('property') === key || t.attrs.get('name') === key));
  return tag?.attrs.get('content')?.trim();
}

const canonicalOf = (page) => page.html.tags.find((t) => t.name === 'link' && /\bcanonical\b/i.test(t.attrs.get('rel') ?? ''))?.attrs.get('href')?.trim();

/** Where a URL path lands on the server (Caddy: try_files {path} {path}/index.html {path}.html). */
function served(pathname) {
  let p = pathname.split('#')[0].split('?')[0];
  try { p = decodeURIComponent(p); } catch { /* keep it as written */ }
  p = path.posix.normalize(p).replace(/^\/+/, '');
  if (p === '' || p === '.') return site.byRel.has('index.html');
  if (p.endsWith('/')) return site.byRel.has(`${p}index.html`);
  return site.byRel.has(p) || site.byRel.has(`${p}.html`) || site.byRel.has(`${p}/index.html`);
}

/**
 * The path a reference asks this site for, or null when it leaves the site (or stays on the page).
 * Internal means: it starts with "/", or it is an absolute URL on the site's own origin. A relative
 * reference is resolved only where its base is certain (`dir`, for stylesheets).
 */
function internalPath(url, origin, dir) {
  const ref = url.trim();
  if (ref === '' || ref.startsWith('#') || ref.startsWith('?') || ref.startsWith('//')) return null;
  if (ref.startsWith('/')) return ref;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(ref);
  if (!scheme) return dir === undefined ? null : path.posix.join('/', dir, ref);
  if (!/^https?$/i.test(scheme[1]) || !origin) return null;
  try { const u = new URL(ref); return u.origin === origin ? u.pathname : null; } catch { return null; }
}

const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^'")\s]+))\s*\)/gi;

/** The newest source file that is younger than the build, or null. A warning, not a failure: file times are not proof. */
function youngerSource() {
  const built = fs.statSync(path.join(DIST, 'index.html')).mtimeMs;
  let newest = null;
  const look = (abs) => {
    const stat = fs.statSync(abs, { throwIfNoEntry: false });
    if (!stat) return;
    if (stat.isDirectory()) { for (const entry of fs.readdirSync(abs)) look(path.join(abs, entry)); return; }
    if (stat.mtimeMs > built && (!newest || stat.mtimeMs > newest.mtimeMs)) newest = { abs, mtimeMs: stat.mtimeMs };
  };
  for (const source of ['src', 'public', 'astro.config.mjs', 'package.json']) look(path.join(ROOT, source));
  return newest && path.relative(ROOT, newest.abs).split(path.sep).join('/');
}

/* ------------------------------------------------------------------------------- the lane ---- */

if (site.missing) {
  test('the site is built', () => {
    assert.fail(`${site.missing}\nThis lane checks the built site and does not build it. Run:  npm run build`);
  });
} else {
  const { files, pages } = site;
  const textFiles = files.filter((f) => f.text !== null);
  const home = site.byRel.get('index.html');
  let origin = null;
  try { origin = new URL(canonicalOf(home)).origin; } catch { /* no absolute canonical on the home page: only "/…" counts as internal */ }

  test('the site is built', (t) => {
    assert.ok(pages.length > 0, `${LABEL}/ has no pages`);
    const younger = OWN_DIST ? youngerSource() : null;
    if (younger) t.diagnostic(`${younger} is newer than ${LABEL}/index.html: run "npm run build" so the lane sees the current sources`);
  });

  describe('privacy', () => {
    const found = textFiles.flatMap((file) => privateData(file.text, { markup: isMarkup(file.rel) }).map((f) => ({ ...f, file })));
    const none = (rule, fix) => expectNone(found.filter((f) => f.rule === rule).map((f) => `${at(f.file, f.index)}  ${f.what}  ${f.shown}`), fix);

    test('no phone number and no link that dials one', () => none('phone', 'The phone number is never published: remove it from the source and rebuild.'));
    test('no 12-digit number (the shape of a national ID)', () => none('id', 'An ID never belongs on the site: remove it from the source and rebuild.'));
    test('no date of birth', () => none('birth', 'The date of birth is never published: remove it from the source and rebuild.'));
    test('no street address', () => none('address', 'The address is never published: remove it from the source and rebuild.'));
    test('no patronymic in page text (it may only appear inside the award scans)', () => none('patronymic', 'Write "Aida Lutsenko" / «Аида Луценко» without the patronymic.'));
    test('no "gmail.ru"', () => none('gmail.ru', `The address is ${EMAIL}.`));
    test('no recommendation letter in page text', () => none('letter', 'Recommendation letters are not published: remove the letter and its caption.'));

    test('no PDF, office document or archive in the build', () => {
      expectNone(files.flatMap((file) => {
        const kind = documentKind(file.rel, file.bytes);
        return kind ? [`${name(file)}  ${kind}`] : [];
      }), 'The CV and the scans are sources, not deliverables: publish pictures of the awards only.');
    });

    test('no file name suggests a recommendation letter or an identity document', () => {
      expectNone(files.flatMap((file) => {
        const why = suspectName(file.rel);
        return why ? [`${name(file)}  ${why}`] : [];
      }), 'Do not publish such a file. If it is something else (an award, a frame), give it a name that says so.');
    });

    test('no GPS position and no hidden thumbnail in picture or video metadata', () => {
      expectNone(files.filter((f) => f.text === null).flatMap((file) => hiddenMetadata(file.bytes).map((what) => `${name(file)}  ${what}`)),
        'Strip the metadata (pictures imported from src/ lose it in the build; a file in public/ is copied as it is).');
    });

    test('precompressed copies (.br, .gz) are the files that were checked', () => {
      const problems = [];
      for (const file of files) {
        const kind = /\.(br|gz|zst)$/.exec(file.rel)?.[1];
        if (!kind) continue;
        const original = site.byRel.get(file.rel.slice(0, -kind.length - 1));
        if (!original) { problems.push(`${name(file)}  has no original beside it`); continue; }
        let plain = null;
        try {
          if (kind === 'br') plain = zlib.brotliDecompressSync(file.bytes);
          else if (kind === 'gz') plain = zlib.gunzipSync(file.bytes);
          else if (zlib.zstdDecompressSync) plain = zlib.zstdDecompressSync(file.bytes);
        } catch (error) { problems.push(`${name(file)}  cannot be decompressed (${error.code ?? error.message})`); continue; }
        if (plain && !plain.equals(original.bytes)) problems.push(`${name(file)}  is not ${name(original)} compressed: the server would send other content than the lane read`);
      }
      expectNone(problems, 'Rebuild: "npm run build" writes the copies after the pages.');
    });
  });

  describe('house style', () => {
    test('no gradients: not in CSS, not in SVG', () => {
      const problems = [];
      for (const file of files) {
        if (file.text === null) continue;
        if (/\.css$/i.test(file.rel)) for (const g of gradients(file.text)) problems.push(`${at(file, g.index)}  ${g.name}()  ${excerpt(file.text, g.index)}`);
        if (!file.html) continue;
        for (const style of file.html.styles) for (const g of gradients(style.css)) problems.push(`${at(file, style.index + g.index)}  ${g.name}()  ${excerpt(style.css, g.index)}`);
        for (const tag of file.html.tags) if (/gradient$/.test(tag.name)) problems.push(`${at(file, tag.index)}  <${tag.name}>  ${excerpt(file.text, tag.index)}`);
      }
      expectNone(problems, 'The palette is flat: black, ivory, sand. Use a solid colour, an image or opacity.');
    });

    test('no emoji in pages and stylesheets', () => {
      const problems = [];
      for (const file of files) {
        if (file.text === null || !(/\.(?:html?|css)$/i.test(file.rel))) continue;
        const source = decodedSource(file.text);
        for (const e of emoji(source.text)) problems.push(`${at(file, source.origin[e.index] ?? 0)}  ${e.code} ${e.char}  ${excerpt(source.text, e.index, 50)}`);
        const sheets = file.html ? file.html.styles : [{ css: file.text, index: 0 }];
        for (const sheet of sheets) {
          const css = decodeCssEscapes(sheet.css);
          const written = new Set(emoji(sheet.css).map((e) => e.char));
          for (const e of emoji(css)) if (!written.has(e.char)) problems.push(`${at(file, sheet.index)}  ${e.code} ${e.char}  written as a CSS escape: ${excerpt(css, e.index, 50)}`);
        }
      }
      expectNone(problems, 'Use type, not emoji. A symbol phones draw as an emoji (↗ ▶ ✔) needs the text selector after it: &#xFE0E;');
    });
  });

  describe('structure', () => {
    const everyPage = (check, fix) => expectNone(pages.flatMap((page) => check(page).map((problem) => `${name(page)}  ${problem}`)), fix);

    test('404.html and robots.txt exist', () => {
      expectNone(['404.html', 'robots.txt'].filter((rel) => !site.byRel.has(rel)).map((rel) => `${LABEL}/${rel}  is missing`),
        'src/pages/404.astro builds the first, public/robots.txt is the second.');
    });

    test('every page is <html lang="en">', () => {
      everyPage((page) => {
        const lang = page.html.tags.find((t) => t.name === 'html')?.attrs.get('lang');
        return lang === 'en' ? [] : [`<html lang="${lang ?? ''}">`];
      }, 'English is the default language; the Russian switch changes lang in the browser.');
    });

    test('every page has exactly one <h1>', () => {
      everyPage((page) => {
        const count = page.html.tags.filter((t) => t.name === 'h1').length;
        return count === 1 ? [] : [`${count} <h1> elements`];
      }, 'One page, one title: make the others <h2> or <p>.');
    });

    test('every page has a title and a meta description', () => {
      everyPage((page) => {
        const title = decodeEntities(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(page.text)?.[1] ?? '').trim();
        return [...(title ? [] : ['empty or missing <title>']), ...(meta(page, 'description') ? [] : ['empty or missing <meta name="description">'])];
      }, 'Pass title and description to the Base layout.');
    });

    test('every page has a canonical link, og:title, og:image and twitter:card', () => {
      everyPage((page) => [
        ...(canonicalOf(page) ? [] : ['no <link rel="canonical">']),
        ...['og:title', 'og:image', 'twitter:card'].filter((key) => !meta(page, key)).map((key) => `no ${key}`),
      ], 'The Base layout writes them: render the page through it.');
    });

    test('the link preview picture exists (og:image, twitter:image)', () => {
      everyPage((page) => ['og:image', 'twitter:image'].flatMap((key) => {
        const url = meta(page, key);
        if (!url) return [];
        if (!/^https?:\/\//i.test(url)) return [`${key}="${url}" is not an absolute URL: messengers cannot fetch it`];
        const wanted = internalPath(url, origin);
        return wanted === null || served(wanted) ? [] : [`${key} → ${wanted} is not in ${LABEL}/`];
      }), 'Telegram and Instagram show this picture with the link: put the file in public/ and rebuild.');
    });

    test('every <img> has an alt attribute', () => {
      expectNone(pages.flatMap((page) => page.html.tags.filter((t) => t.name === 'img' && !t.attrs.has('alt')).map((t) => `${at(page, t.index)}  ${excerpt(page.text, t.index)}`)),
        'Describe the picture, or write alt="" when it is decoration.');
    });

    test('every internal link and asset resolves to a file in the build', () => {
      const problems = [];
      const check = (file, index, url, from, dir) => {
        const wanted = internalPath(url, origin, dir);
        if (wanted !== null && !served(wanted)) problems.push(`${at(file, index)}  ${from} → ${wanted}`);
      };
      for (const page of pages) {
        for (const tag of page.html.tags) {
          // the canonical link names the page itself (for 404.html, an address that is meant not to exist)
          const canonical = tag.name === 'link' && /\bcanonical\b/i.test(tag.attrs.get('rel') ?? '');
          for (const attr of ['href', 'src', 'poster']) if (tag.attrs.has(attr) && !canonical) check(page, tag.index, tag.attrs.get(attr), `<${tag.name} ${attr}>`);
          for (const attr of ['srcset', 'imagesrcset']) {
            for (const candidate of (tag.attrs.get(attr) ?? '').split(',')) {
              const url = candidate.trim().split(/\s+/)[0];
              if (url) check(page, tag.index, url, `<${tag.name} ${attr}>`);
            }
          }
        }
        for (const style of page.html.styles) for (const m of style.css.matchAll(CSS_URL)) check(page, style.index + m.index, m[1] ?? m[2] ?? m[3], 'CSS url()');
      }
      for (const sheet of textFiles.filter((f) => /\.css$/i.test(f.rel))) {
        for (const m of sheet.text.matchAll(CSS_URL)) check(sheet, m.index, m[1] ?? m[2] ?? m[3], 'CSS url()', path.posix.dirname(sheet.rel));
      }
      expectNone(problems, 'A path that starts with "/" must be a file in the build ("/x" is x, x.html or x/index.html).');
    });
  });

  describe('bilingual', () => {
    test('every page carries the same number of English and Russian strings (data-l)', () => {
      expectNone(pages.flatMap((page) => {
        const count = (lang) => page.html.tags.filter((t) => t.attrs.get('data-l') === lang).length;
        const [en, ru] = [count('en'), count('ru')];
        return en > 0 && en === ru ? [] : [`${name(page)}  data-l="en": ${en}, data-l="ru": ${ru}`];
      }), 'Write every string through <T t={{ en, ru }} />.');
    });
  });

  describe('contact', () => {
    test(`the home page shows only ${EMAIL} and instagram.com/${INSTAGRAM}`, (t) => {
      const sources = [home.text, visibleText(home.text).text, ...home.html.tags.flatMap((tag) => [...tag.attrs.values()])];
      const addresses = new Set(sources.flatMap((s) => s.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g) ?? [])
        .map((a) => a.toLowerCase())
        .filter((a) => !/\.(?:png|jpe?g|webp|avif|gif|svg|css|js|mjs|json|woff2?)$/.test(a)));
      const accounts = home.html.tags.flatMap((tag) => {
        const href = tag.attrs.get('href') ?? '';
        if (!/instagram\.com|instagr\.am/i.test(href)) return [];
        try { return [{ href, url: new URL(href, 'https://site.invalid/') }]; } catch { return [{ href, url: null }]; }
      });
      if (addresses.size === 0 && accounts.length === 0) { t.skip('no e-mail address and no Instagram link on the home page yet'); return; }
      expectNone([
        ...[...addresses].filter((a) => a !== EMAIL).map((a) => `${name(home)}  e-mail address ${a.replace(/^(.).*(@.*)$/, '$1…$2')}`),
        ...accounts.filter(({ url }) => !url || !/^(?:www\.)?instagram\.com$/i.test(url.hostname) || url.pathname.replace(/\/+$/, '').toLowerCase() !== `/${INSTAGRAM}`).map(({ href }) => `${name(home)}  Instagram link ${href}`),
      ], `The contacts are ${EMAIL} and https://www.instagram.com/${INSTAGRAM}/.`);
    });
  });
}
