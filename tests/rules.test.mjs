/**
 * Proof that the detectors in tests/lib work: each rule must catch what it is for and leave
 * ordinary site copy alone. It needs no build.
 *
 * Every sample is made up. Numbers are assembled from repeated digits (area code 000 does not
 * exist), the street is «Примерная» ("Example"), the year is 1900. Characters that cannot be told
 * apart on screen are built from their code points with cp().
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeCssEscapes, decodeEntities, decodedSource, position, readHtml, visibleText } from './lib/html.mjs';
import { documentKind, emoji, gradients, hiddenMetadata, mask, privateData, suspectName, textOf } from './lib/rules.mjs';

const d = (count, digit = '0') => String(digit).repeat(count);
const counting = (count) => Array.from({ length: count }, (_, i) => (i + 1) % 10).join('');
const cp = (...codes) => String.fromCodePoint(...codes);
const NBSP = cp(0xa0);
const NB_HYPHEN = cp(0x2011);
const NUL = cp(0);

/** The rules that fire on a sample. */
const rulesIn = (text, markup = false) => [...new Set(privateData(text, { markup }).map((f) => f.rule))];
const each = (samples) => samples.map((s) => (Array.isArray(s) ? s : [s, false]));

/** Every sample must trip the rule. A sample is a string, or [string, true] when it is markup. */
function catches(rule, samples) {
  for (const [sample, markup] of each(samples)) assert.ok(rulesIn(sample, markup).includes(rule), `the ${rule} rule must catch: ${sample}`);
}

/** No sample may trip the rule. */
function ignores(rule, samples) {
  for (const [sample, markup] of each(samples)) assert.ok(!rulesIn(sample, markup).includes(rule), `the ${rule} rule must not fire on: ${sample}`);
}

/** Copy the site really uses, or easily could. No rule may fire on it. */
const SITE_COPY = [
  'Kazrosresurs LLP, 2018 — 2024',
  'In the press: 7152.kz, 8 March 2024',
  'В прессе: 7152.kz, 8 марта 2024',
  'https://www.7152.kz/news/3744549/v-sko-devuska-rukovodit-prakticeski-polnostu-muzskim-kollektivom',
  'Fifteen-plus publications. Some of them in Scopus. 15+ публикаций',
  'Enactus Kazakhstan 2026: TOP-5 Best Advisors.',
  'Int. Hackathon — Business Cup 2.0 — 24 hours',
  'Novosibirsk State Technical University, 2017 · Kozybayev University, 2019 · Satbayev University, 2022',
  'Доцент, СКУ им. М. Козыбаева, 2023 — 2025',
  'Letter of Gratitude · Благодарность · Akim of North Kazakhstan Region, 2025',
  'Frame 01 · 2.39 : 1',
  'Overrule was born in 2026, in twenty-four hours.',
  'aidalutsenko@gmail.com · https://www.instagram.com/aida.luts/',
  '<a href="https://overrule-production.up.railway.app">Open Overrule</a>',
  '.v1-fade{transition:opacity .8s cubic-bezier(.2,.8,.2,1) 2.90s;aspect-ratio:2.39/1}',
  '<img srcset="/_astro/p01.DQ1i-xNl_Z2rMAx9.avif 640w, /_astro/p01.DQ1i-xNl_QuvgN.avif 1280w" sizes="(min-width: 768px) 50vw, 100vw" width="2400" height="1004">',
];

describe('private data', () => {
  test('ordinary site copy trips no rule', () => {
    for (const line of SITE_COPY) assert.deepEqual(rulesIn(line, true), [], `no rule may fire on: ${line}`);
  });

  test('phone numbers: +7 and 8 with ten digits, in any grouping', () => {
    const [a, b, c, e] = [d(3), d(3, 1), d(2), d(2, 1)];
    catches('phone', [
      `+7 ${a} ${b} ${c} ${e}`,
      `+7 (${a}) ${b}-${c}-${e}`,
      `+7${a}${b}${c}${e}`,
      `+7${NBSP}${a}${NBSP}${b}${NB_HYPHEN}${c}${NB_HYPHEN}${e}`,
      `+7.${a}.${b}.${c}.${e}`,
      `+7 (${d(4)}) ${c}-${e}-${c}`,
      `8 (${a}) ${b}-${c}-${e}`,
      `8${a}${b}${c}${e}`,
      `8-${a}-${b}-${c}-${e}`,
      `8 ${a} ${b}${c}${e}`,
      `тел.8 ${a} ${b} ${c} ${e}`,
      `{"telephone":"+7${a}${b}${c}${e}"}`,
      [`<span>+7</span> <b>${a}</b> ${b}<wbr>-${c}-${e}`, true],
      [`+7&nbsp;${a}&nbsp;${b}&#8209;${c}&#8209;${e}`, true],
      [`&#43;7 ${a} ${b} ${c} ${e}`, true],
      `<a href="tel:+7${a}${b}${c}${e}">`,
      `<a href="tel:8${a}${b}${c}${e}">`,
      `<a href="tel:+1${d(10)}">`, // a link that dials is a phone number, whatever the country
      `<a href='sms:${d(6, 1)}'>`,
      `https://wa.me/7${a}${b}${c}${e}`,
      `https://api.whatsapp.com/send?phone=7${a}${b}${c}${e}`,
    ]);
  });

  test('phone numbers: years, prices, paper IDs, CSS and vector geometry are not phone numbers', () => {
    ignores('phone', [
      '2018 — 2024',
      '7152.kz, 8 March 2024',
      'UTC+5, 15+ publications, TOP-5',
      `eid=2-s2.0-85${d(9, 1)}`,
      `authorId=57${d(9, 1)}`,
      `opacity:.8${d(9)}1`,
      'rotate(0.8660254037844386turn)',
      '8 100 000 000 тенге',
      'stroke-dasharray="8 12 16 20 24 28 32"',
      'Hotel: 5 stars',
      `{email:1,tel:${d(5, 2)}}`,
      'calc(100% + 7px)',
      'x=a+7-b',
      'c0-4.93847 4.00624-8.9419 8.94818-8.9419h49.21475c4.9424 0 8.9486 4.00343 8.9486 8.9419',
      '1.00072 68.731 8.67377 68.731Z',
      ['<svg viewBox="0 0 8 705"><path d="M10 8 705-123 45 67 8 705 123 45 67z"/><polygon points="8 705 123 45 67"/></svg>', true],
      'x+7.25-1.5-(2.5)-3.75-1.25*y',
    ]);
  });

  test('a 12-digit number standing alone is an ID', () => {
    catches('id', [`ИИН ${counting(12)}`, `IIN: ${counting(12)}.`, `{"iin":"${counting(12)}"}`, `(${d(12)})`]);
    ignores('id', [
      `0.${counting(12)}`,
      counting(13),
      counting(11),
      `#${counting(12)}`,
      `/_astro/${counting(12)}.DZCd2g7q.webp`,
      `?v=${counting(12)}`,
      `a${counting(12)}b`,
      `width:${counting(12)}px`,
    ]);
  });

  test('dates of birth: a date in 19xx, the words, "born" with a year', () => {
    catches('birth', [
      '01.01.1900',
      '1.1.1900',
      '31/12/1900',
      'от 01.01.1900.',
      '1900-01-01',
      'Date of birth',
      'Дата рождения',
      '"birthDate"',
      'DOB',
      'born in 1900',
      ['<dt>Born</dt><dd>1 January 1900</dd>', true],
      'родилась в 1900 году',
      '1900 г.р.',
      '1900 года рождения',
    ]);
    ignores('birth', [
      '8 March 2024',
      '01.01.2024',
      'Overrule was born in 2026',
      'born to lead',
      'a stubborn 1900 habit',
      'new Date("1970-01-01T00:00:00Z")',
      'Satbayev University, 2022',
      'gsap 3.12.5',
      'M12.5.1900h3',
      '0-5.1074.41596-7.1543 1.03.1949.81213.4679 2.45617',
    ]);
  });

  test('street addresses: a street marker and a house number', () => {
    catches('address', [
      'ул. Примерная, 1',
      'ул.Примерная 12',
      'проспект Примерный, д. 5',
      'на проспекте Примерном, 5',
      'пр-т Примерный 7/8',
      'мкр. Примерный, 3',
      'Example Avenue 12',
      'Example street, 86',
      'example avenue 5a',
      'EXAMPLE STREET 7',
      '12 Example Avenue',
      '221B Example Street',
      '76 Example str., Kokshetau',
    ]);
    ignores('address', [
      'аул. 15 человек',
      'Forty-five men on the street. 45 of them stay.',
      'Wall Street, 2026',
      'new avenues for research in 2026',
      'Top 10 of the final',
      'проспекты развития',
      'ул. Примерная',
    ]);
  });

  test('the patronymic, in any case form, Cyrillic or transliterated', () => {
    // the samples use another first name on purpose: the full name is not spelled out in this repository
    catches('patronymic', ['Мария Александровна', 'Марии Александровне', 'МАРИЯ АЛЕКСАНДРОВНА', 'Maria Aleksandrovna', 'Maria Alexandrovna']);
    ignores('patronymic', ['Александр Пушкин', 'Александров', 'Alexander', 'Alexandria']);
  });

  test('gmail.ru and recommendation letters', () => {
    catches('gmail.ru', ['aidalutsenko@gmail.ru', 'mailto:someone@GMAIL.RU']);
    ignores('gmail.ru', ['aidalutsenko@gmail.com', 'gmail.rules']);
    catches('letter', ['Recommendation letter', 'a letter of recommendation', 'Рекомендательное письмо', 'reference letters']);
    ignores('letter', ['Letter of Gratitude', 'Благодарственное письмо', 'the letters of her name']);
  });

  test('a finding is shown masked, never in full', () => {
    assert.equal(mask(`+7 ${d(3, 1)} ${d(3, 2)} ${d(2, 3)} 45`, { head: 1, tail: 2 }), '+7 ••• ••• •• 45');
    assert.equal(mask('ул. Примерная, 12', { letters: true, head: 2, tail: 0 }), 'ул. •••••••••, ••');
    const samples = [`+7 ${counting(3)} ${counting(3)} ${counting(2)} ${counting(2)}`, `ИИН ${counting(12)}`, '21.11.1900', 'ул. Примерная, 123', '12 Example Avenue'];
    for (const sample of samples) {
      const findings = privateData(sample);
      assert.ok(findings.length > 0, `nothing found in: ${sample}`);
      for (const finding of findings) {
        const kept = (finding.shown.match(/\d/g) ?? []).length;
        assert.ok(kept <= 3, `"${finding.shown}" shows ${kept} digits of a ${finding.what}`);
        assert.ok(!/Примерная|Example/.test(finding.shown), `"${finding.shown}" shows the street name`);
      }
    }
  });

  test('a finding points at its place in the file', () => {
    const page = `<p>one</p>\n<p>two <b>+7</b>&nbsp;${d(3)} ${d(3, 1)}-${d(2)}-${d(2, 1)}</p>`;
    const [finding] = privateData(page, { markup: true });
    assert.equal(finding.rule, 'phone');
    assert.equal(position(page, finding.index), '2:11');
  });
});

describe('files', () => {
  test('names that suggest a recommendation letter or an identity document', () => {
    for (const rel of [
      '_astro/recommendation-letter.DZCd2g7q.webp',
      'letters/a.jpg',
      'rec_letter_2.jpg',
      '_astro/letter1.Bx2.avif.br',
      'Passport.png',
      'id-card.jpg',
      'scans/idCard.jpg',
      'udostoverenie-1.webp',
      'rekomendatelnoe-pismo.jpg',
      'рекомендательное-письмо.jpg',
    ]) assert.ok(suspectName(rel), `must be flagged: ${rel}`);
    for (const rel of [
      '_astro/letterbox.DZCd2g7q.webp',
      '_astro/Letters.astro_astro_type_script_index_0_lang.Cx1.js',
      '_astro/Letters.BX1.css.br',
      '_astro/newsletter.x.webp',
      '_astro/akim-sko-2025.I_TMUjEF_ZOOGT2.avif',
      '_astro/minister-2026.DQ1i-xNl_Z2rMAx9.webp',
      '_astro/grain.UPhL5qVV.webp',
      '_astro/inter-tight-latin-wght-normal.DX-nOvPD.woff2',
      '_astro/idea.x.jpg',
      'moodboard/index.html',
      'favicon.svg',
      'og.jpg',
    ]) assert.equal(suspectName(rel), null, `must pass: ${rel}`);
  });

  test('documents, by name or by content', () => {
    const html = Buffer.from('<!DOCTYPE html><html lang="en">');
    for (const rel of ['cv.pdf', 'docs/Resume.PDF', 'cv.pdf.br', 'scan.docx', 'awards.zip']) assert.ok(documentKind(rel, html), `must be flagged: ${rel}`);
    assert.equal(documentKind('file.bin', Buffer.from('%PDF-1.7\n')), 'PDF');
    assert.equal(documentKind('index.html', html), null);
    assert.equal(documentKind('_astro/a.webp', Buffer.from(`RIFF${d(4, NUL)}WEBPVP8 `, 'latin1')), null);
  });

  test('text is read as text, pictures are not', () => {
    assert.equal(textOf('index.html', Buffer.from('<p>Аида</p>')), '<p>Аида</p>');
    assert.equal(textOf('notes.txt', Buffer.from([0xc0, 0xe8, 0xe4, 0xe0])), 'Аида', 'a Windows-1251 file is still read');
    assert.equal(textOf('humans', Buffer.from('no extension, still text')), 'no extension, still text');
    assert.equal(textOf('_astro/a.webp', Buffer.from('RIFF')), null);
    assert.equal(textOf('blob', Buffer.from([0x00, 0x01, 0x02])), null);
  });
});

describe('metadata hidden in pictures and video', () => {
  /** A minimal EXIF block inside a JPEG header: one harmless tag, optionally a GPS directory and a thumbnail directory. */
  function exif({ gps = false, thumbnail = false, bigEndian = false } = {}) {
    const bytes = Buffer.alloc(128);
    const u16 = (value, at) => (bigEndian ? bytes.writeUInt16BE(value, at) : bytes.writeUInt16LE(value, at));
    const u32 = (value, at) => (bigEndian ? bytes.writeUInt32BE(value, at) : bytes.writeUInt32LE(value, at));
    const entry = (at, tag, type, count, value) => { u16(tag, at); u16(type, at + 2); u32(count, at + 4); u32(value, at + 8); };
    bytes.write(bigEndian ? 'MM' : 'II', 0, 'latin1');
    u16(42, 2);
    u32(8, 4); // the first directory starts at offset 8
    u16(gps ? 2 : 1, 8);
    entry(10, 0x0112, 3, 1, 1); // Orientation
    if (gps) entry(22, 0x8825, 4, 1, 64); // pointer to the GPS directory
    u32(thumbnail ? 96 : 0, gps ? 34 : 22); // offset of the next directory
    if (gps) { u16(1, 64); entry(66, 0x0002, 5, 3, 112); u32(0, 78); } // GPSLatitude
    if (thumbnail) { u16(1, 96); entry(98, 0x0201, 4, 1, 120); u32(0, 110); } // JPEGInterchangeFormat
    return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x86]), Buffer.from(`Exif${NUL}${NUL}`, 'latin1'), bytes]);
  }
  /** The QuickTime location atom (0xA9 "xyz"), its length and language bytes, then whatever follows. */
  const quickTime = (after) => Buffer.concat([Buffer.from('moov'), Buffer.from([0xa9, 0x78, 0x79, 0x7a, 0x00, 0x12, 0x15, 0xc7]), Buffer.from(after)]);

  test('a clean picture gives nothing away', () => {
    assert.deepEqual(hiddenMetadata(exif()), []);
    assert.deepEqual(hiddenMetadata(Buffer.from(`RIFF${d(4, NUL)}WEBPVP8 II*${NUL} not a directory`, 'latin1')), []);
  });

  test('GPS position: EXIF, XMP, QuickTime', () => {
    assert.match(hiddenMetadata(exif({ gps: true })).join(), /GPS position \(EXIF\)/);
    assert.match(hiddenMetadata(exif({ gps: true, bigEndian: true })).join(), /GPS position \(EXIF\)/);
    assert.match(hiddenMetadata(Buffer.from('<x:xmpmeta><rdf:Description exif:GPSLatitude="0,0.0N"/></x:xmpmeta>')).join(), /GPS position \(XMP\)/);
    assert.match(hiddenMetadata(quickTime('+00.0000+000.0000/')).join(), /QuickTime/);
    assert.match(hiddenMetadata(Buffer.from('mdtacom.apple.quicktime.location.ISO6709')).join(), /QuickTime/);
    assert.deepEqual(hiddenMetadata(quickTime('and nothing like a coordinate after it')), []);
  });

  test('an embedded thumbnail can still show the frame before the crop', () => {
    assert.match(hiddenMetadata(exif({ thumbnail: true })).join(), /thumbnail/);
    assert.equal(hiddenMetadata(exif({ gps: true, thumbnail: true })).length, 2);
  });
});

describe('house style', () => {
  test('gradients', () => {
    for (const css of [
      'background:linear-gradient(#0b0a09,#f1eadc)',
      'mask-image: radial-gradient( circle, #000, transparent)',
      'background:conic-gradient(from 0deg,#000,#fff)',
      'background:repeating-linear-gradient(45deg,#000 0 1px,transparent 1px 4px)',
      'background:-webkit-gradient(linear,left top,left bottom,from(#000),to(#fff))',
    ]) assert.equal(gradients(css).length, 1, `must be flagged: ${css}`);
    for (const css of ['--tw-gradient-from:#0b0a09', '.gradient{color:#c7ad85}', 'background:url(/_astro/grain.UPhL5qVV.webp)']) {
      assert.deepEqual(gradients(css), [], `must pass: ${css}`);
    }
    assert.deepEqual(gradients('a{background:repeating-linear-gradient(red,blue)}'), [{ index: 13, name: 'repeating-linear-gradient' }]);
  });

  test('emoji', () => {
    const emojiSelector = cp(0xfe0f);
    const textSelector = cp(0xfe0e);
    for (const [what, text] of [
      ['grinning face', cp(0x1f600)],
      ['star', cp(0x2b50)],
      ['heavy check mark', cp(0x2714)],
      ['north-east arrow (phones draw it as an emoji)', cp(0x2197)],
      ['play triangle', cp(0x25b6)],
      ['copyright sign asked to be an emoji', cp(0xa9) + emojiSelector],
      ['keycap 1', `1${emojiSelector}${cp(0x20e3)}`],
      ['flag', cp(0x1f1f0, 0x1f1ff)],
    ]) assert.ok(emoji(`a ${text} b`).length > 0, `must be flagged: ${what}`);
    for (const [what, text] of [
      ['signs of the site copy', 'Zimran × AIESEC, 15+, TOP-5, N° I, #1 *'],
      ['plain arrows', 'Scroll ↓ · → ← ↑'],
      ['copyright, trade mark, registered', `${cp(0xa9)} 2026 Aida Lutsenko ${cp(0x2122)} ${cp(0xae)}`],
      ['Russian typography', '«Казросресурс» — «ёлочки», № 5'],
      ['black star, multiplication x, check mark, four-pointed star', `${cp(0x2605)} ${cp(0x2715)} ${cp(0x2713)} ${cp(0x2726)}`],
      ['north-east arrow with the text selector', cp(0x2197) + textSelector],
    ]) assert.deepEqual(emoji(text), [], `must pass: ${what}`);
  });
});

describe('reading HTML', () => {
  test('tags, attributes, styles and scripts', () => {
    const html = readHtml([
      '<!doctype html><html lang="en"><head><title>T</title>',
      '<style>h1{color:red}</style><script>const s = "<h1>not a tag</h1>";</script></head>',
      '<body><!-- <h1>not a tag either</h1> -->',
      `<h1 class="a b" data-x='1 > 0'>Aida</h1><img src=/a.webp alt><p style="color:#000">x &amp; y</p>`,
      '<a href="/v1?x=1&amp;y=2">v1</a></body></html>',
    ].join('\n'));
    assert.equal(html.tags.filter((t) => t.name === 'h1').length, 1);
    assert.equal(html.tags.find((t) => t.name === 'html').attrs.get('lang'), 'en');
    assert.equal(html.tags.find((t) => t.name === 'h1').attrs.get('data-x'), '1 > 0');
    assert.equal(html.tags.find((t) => t.name === 'img').attrs.get('src'), '/a.webp');
    assert.ok(html.tags.find((t) => t.name === 'img').attrs.has('alt'));
    assert.equal(html.tags.find((t) => t.name === 'a').attrs.get('href'), '/v1?x=1&y=2');
    assert.deepEqual(html.styles.map((s) => s.css), ['h1{color:red}', 'color:#000']);
    assert.equal(html.scripts.length, 1);
  });

  test('visible text, character references, positions', () => {
    const raw = `<p>+7&nbsp;<b>${d(3)}</b></p>\n<p>line&shy; two</p>`;
    const seen = visibleText(raw);
    assert.equal(seen.text.replace(/\s+/g, ' ').trim(), `+7 ${d(3)} line two`);
    assert.equal(raw[seen.origin[seen.text.indexOf('+7')]], '+');
    const trailing = visibleText('<p>a</p> after &amp; the last tag');
    assert.equal(trailing.text, ' a  after & the last tag');
    assert.equal(trailing.origin[trailing.text.indexOf('last')], '<p>a</p> after &amp; the '.length);
    assert.equal(visibleText('<dt>Born</dt><dd>1900</dd>').text.trim().replace(/\s+/g, ' '), 'Born 1900', 'a tag separates words');
    assert.equal(visibleText('Алек<wbr>сандр').text, 'Александр', 'a line-break opportunity does not');
    assert.equal(decodeEntities('&#43;&#x37;&nbsp;&amp;&unknown;'), `+7${NBSP}&&unknown;`);
    assert.equal(decodedSource('<i title="&#x2197;">').text, `<i title="${cp(0x2197)}">`);
    assert.equal(decodeCssEscapes(String.raw`content:"\2197 \FE0E"`), `content:"${cp(0x2197)}${cp(0xfe0e)}"`);
    assert.equal(position(raw, raw.indexOf('line')), '2:4');
  });
});
