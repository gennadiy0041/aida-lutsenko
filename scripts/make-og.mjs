// Renders the link-preview picture (Open Graph) that Telegram, Instagram and iMessage show: public/og.jpg.
//
//   node scripts/make-og.mjs [--frame src/assets/frames/f01.jpg] [--pos 50,40] [--veil 0.22] [--out public/og.jpg]
//                            [--title "AIDA LUTSENKO"] [--line "A TRUE STORY IN FOUR CHAPTERS"]
//
// 1200 x 630, progressive JPEG under 300 kB. With --frame: the graded frame covers the canvas (--pos is the
// focal point in percent, like CSS object-position), under a flat 22% veil of ink. Without it: flat ink.
// On top, centred: the name in Noto Serif Display Light capitals, ivory, and one small tracked line in
// Inter Tight (sand on flat ink, ivory over a frame). --frame takes a graded master from src/assets/frames.
//
// The text is drawn from the real font files, as outlines, so it looks the same on every machine.
// sharp's SVG renderer cannot load a .woff2, and the one font parser in node_modules (fontkitten, a
// dependency of Astro) cannot produce the Light instance of a variable WOFF2. So the first half of this
// file is a small reader for exactly what is needed: the WOFF2 container, cmap, the transformed glyf
// table, the variation tables (fvar, avar, gvar, HVAR) and pair kerning from GPOS. Checked against
// fontTools and HarfBuzz: outlines within half a font unit, advances and kerning exact.
import sharp from 'sharp';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FONTS = path.join(ROOT, 'node_modules', '@fontsource-variable');
const SERIF = path.join(FONTS, 'noto-serif-display', 'files', 'noto-serif-display-latin-wght-normal.woff2');
const GROTESQUE = path.join(FONTS, 'inter-tight', 'files', 'inter-tight-latin-wght-normal.woff2');

const WIDTH = 1200;
const HEIGHT = 630;
const INK = '#0b0a09';
const IVORY = '#f1eadc';
const SAND = '#c7ad85';
const VEIL = 0.22;
const MAX_BYTES = 300_000;
/** When to warn about what the name stands on (see groundUnder): too light for ivory, or too busy for thin strokes. */
const LIMITS = { light: 0.1, busy: 12 };
/**
 * The card. Sizes in pixels, tracking in em (as CSS letter-spacing), weight on the font's wght axis.
 * The small line follows the site's title card: sand where it stands on ink, ivory where it stands on a picture.
 */
const CARD = {
  name: { text: 'AIDA LUTSENKO', size: 88, tracking: 0.2, weight: 300 },
  line: { text: 'A TRUE STORY IN FOUR CHAPTERS', size: 17, tracking: 0.32, weight: 400, onInk: SAND, onFrame: IVORY, opacityOnFrame: 0.9 },
  gap: 40, // from the baseline of the name to the top of the small capitals
  maxWidth: 0.82, // of the canvas; a longer title is set smaller
  lift: 4, // the block sits this much above the geometric centre, where the eye puts the middle
};

// ---------- reading a variable WOFF2 ----------

const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT',
  'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH',
  'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
  'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
];

class Reader {
  constructor(buf, pos = 0) {
    this.b = buf;
    this.p = pos;
  }
  u8() { return this.b[this.p++]; }
  i8() { return this.b.readInt8(this.p++); }
  u16() { const v = this.b.readUInt16BE(this.p); this.p += 2; return v; }
  i16() { const v = this.b.readInt16BE(this.p); this.p += 2; return v; }
  u32() { const v = this.b.readUInt32BE(this.p); this.p += 4; return v; }
  i32() { const v = this.b.readInt32BE(this.p); this.p += 4; return v; }
  f2dot14() { return this.i16() / 16384; }
  fixed() { return this.i32() / 65536; }
  tag() { const s = this.b.toString('latin1', this.p, this.p + 4); this.p += 4; return s; }
  skip(n) { this.p += n; return this; }
  /** UIntBase128 of the WOFF2 directory. */
  base128() {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const byte = this.u8();
      v = v * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return v;
    }
    throw new Error('bad UIntBase128');
  }
  /** 255UInt16 of the WOFF2 glyf streams. */
  u255() {
    const code = this.u8();
    if (code === 253) return this.u16();
    if (code === 255) return this.u8() + 253;
    if (code === 254) return this.u8() + 506;
    return code;
  }
}

/** WOFF2 container -> Map of tag -> { data, transformed }. */
function readWoff2(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not a WOFF2 file');
  if (buf.toString('latin1', 4, 8) === 'ttcf') throw new Error('font collections are not supported');
  const count = buf.readUInt16BE(12);
  const compressed = buf.readUInt32BE(20);
  const r = new Reader(buf, 48);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const flags = r.u8();
    const tag = (flags & 63) === 63 ? r.tag() : KNOWN_TAGS[flags & 63];
    const version = flags >> 6;
    const original = r.base128();
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    entries.push({ tag, transformed, length: transformed ? r.base128() : original });
  }
  const data = brotliDecompressSync(buf.subarray(r.p, r.p + compressed));
  const tables = new Map();
  let offset = 0;
  for (const e of entries) {
    tables.set(e.tag, { data: data.subarray(offset, offset + e.length), transformed: e.transformed });
    offset += e.length;
  }
  return tables;
}

/** cmap -> Map of code point -> glyph id (formats 12 and 4). */
function readCmap(d) {
  const r = new Reader(d, 2);
  let best = null;
  for (let n = r.u16(); n > 0; n--) {
    const platform = r.u16();
    const encoding = r.u16();
    const offset = r.u32();
    const format = d.readUInt16BE(offset);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    const score = !unicode ? 0 : format === 12 ? 2 : format === 4 ? 1 : 0;
    if (score > (best?.score ?? 0)) best = { score, offset, format };
  }
  if (!best) throw new Error('no Unicode cmap (format 4 or 12)');
  const map = new Map();
  if (best.format === 12) {
    const g = new Reader(d, best.offset + 12);
    for (let n = g.u32(); n > 0; n--) {
      const start = g.u32();
      const end = g.u32();
      const gid = g.u32();
      for (let c = start; c <= end; c++) map.set(c, gid + c - start);
    }
    return map;
  }
  const segments = d.readUInt16BE(best.offset + 6) / 2;
  const ends = best.offset + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const ranges = deltas + segments * 2;
  for (let s = 0; s < segments; s++) {
    const start = d.readUInt16BE(starts + s * 2);
    const end = d.readUInt16BE(ends + s * 2);
    const delta = d.readInt16BE(deltas + s * 2);
    const range = d.readUInt16BE(ranges + s * 2);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let gid;
      if (range === 0) gid = (c + delta) & 0xffff;
      else {
        gid = d.readUInt16BE(ranges + s * 2 + range + (c - start) * 2);
        if (gid !== 0) gid = (gid + delta) & 0xffff;
      }
      if (gid !== 0) map.set(c, gid);
    }
  }
  return map;
}

/** The transformed glyf table of WOFF2 -> per glyph { xs, ys, on, ends }, null if empty. */
function readGlyphs(table) {
  if (!table.transformed) throw new Error('the glyf table is not in the WOFF2 transformed form');
  const d = table.data;
  const r = new Reader(d, 4);
  const count = r.u16();
  r.skip(2);
  const sizes = [r.u32(), r.u32(), r.u32(), r.u32(), r.u32(), r.u32(), r.u32()];
  let at = r.p;
  const stream = (i) => {
    const s = new Reader(d, at);
    at += sizes[i];
    return s;
  };
  const contours = stream(0);
  const pointCounts = stream(1);
  const flags = stream(2);
  const coords = stream(3);
  const composites = stream(4); // the bounding-box and instruction streams are not needed
  const sign = (bit, v) => (bit ? v : -v);
  const glyphs = [];
  for (let g = 0; g < count; g++) {
    const n = contours.i16();
    if (n === 0) {
      glyphs.push(null);
      continue;
    }
    if (n < 0) {
      // a composite: step over its records so the streams stay in step
      let f;
      let instructions = false;
      do {
        f = composites.u16();
        composites.skip(2 + (f & 1 ? 4 : 2) + (f & 8 ? 2 : f & 0x40 ? 4 : f & 0x80 ? 8 : 0));
        if (f & 0x100) instructions = true;
      } while (f & 0x20);
      if (instructions) coords.u255();
      glyphs.push({ composite: true });
      continue;
    }
    const ends = [];
    let total = 0;
    for (let c = 0; c < n; c++) {
      total += pointCounts.u255();
      ends.push(total - 1);
    }
    const xs = new Float64Array(total);
    const ys = new Float64Array(total);
    const on = new Uint8Array(total);
    let x = 0;
    let y = 0;
    for (let i = 0; i < total; i++) {
      const flag = flags.u8();
      const b = flag & 0x7f;
      let dx;
      let dy;
      if (b < 10) {
        dx = 0;
        dy = sign(flag & 1, ((b & 14) << 7) + coords.u8());
      } else if (b < 20) {
        dx = sign(flag & 1, (((b - 10) & 14) << 7) + coords.u8());
        dy = 0;
      } else if (b < 84) {
        const b0 = b - 20;
        const b1 = coords.u8();
        dx = sign(flag & 1, 1 + (b0 & 0x30) + (b1 >> 4));
        dy = sign(flag & 2, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f));
      } else if (b < 120) {
        const b0 = b - 84;
        dx = sign(flag & 1, 1 + (Math.floor(b0 / 12) << 8) + coords.u8());
        dy = sign(flag & 2, 1 + (((b0 % 12) >> 2) << 8) + coords.u8());
      } else if (b < 124) {
        const b1 = coords.u8();
        const b2 = coords.u8();
        dx = sign(flag & 1, (b1 << 4) + (b2 >> 4));
        dy = sign(flag & 2, ((b2 & 0x0f) << 8) + coords.u8());
      } else {
        dx = sign(flag & 1, coords.u16());
        dy = sign(flag & 2, coords.u16());
      }
      x += dx;
      y += dy;
      xs[i] = x;
      ys[i] = y;
      on[i] = flag & 0x80 ? 0 : 1;
    }
    coords.u255(); // length of the hinting instructions, which live in their own stream
    glyphs.push({ xs, ys, on, ends });
  }
  return glyphs;
}

/** How much a variation region contributes at one axis position (OpenType "scalar"). */
function axisScalar(coord, start, peak, end) {
  if (peak === 0 || start > peak || peak > end || (start < 0 && end > 0)) return 1;
  if (coord < start || coord > end) return 0;
  if (coord === peak) return 1;
  return coord < peak ? (coord - start) / (peak - start) : (end - coord) / (end - peak);
}

/** fvar + avar -> normalised axis positions for the requested settings, e.g. { wght: 300 }. */
function readCoords(tables, settings) {
  const fvar = tables.get('fvar')?.data;
  if (!fvar) return [];
  const r = new Reader(fvar, 4);
  const axes = r.u16();
  r.skip(2);
  const count = r.u16();
  const size = r.u16();
  const avar = tables.get('avar')?.data;
  const maps = avar ? new Reader(avar, 8) : null;
  const coords = [];
  for (let i = 0; i < count; i++) {
    const a = new Reader(fvar, axes + i * size);
    const tag = a.tag();
    const min = a.fixed();
    const def = a.fixed();
    const max = a.fixed();
    const value = Math.min(max, Math.max(min, settings[tag.trim()] ?? def));
    let n = value < def ? (value - def) / (def - min) : value > def ? (value - def) / (max - def) : 0;
    n = Math.round(n * 16384) / 16384;
    if (maps) {
      // avar: a piecewise-linear remap of the axis
      const pairs = [];
      for (let k = maps.u16(); k > 0; k--) pairs.push([maps.f2dot14(), maps.f2dot14()]);
      for (let k = 1; k < pairs.length; k++) {
        if (n <= pairs[k][0]) {
          const [f0, t0] = pairs[k - 1];
          const [f1, t1] = pairs[k];
          n = f1 === f0 ? t1 : t0 + ((n - f0) * (t1 - t0)) / (f1 - f0);
          break;
        }
      }
    }
    coords.push(n);
  }
  return coords;
}

/** An ItemVariationStore (HVAR, GDEF) -> (outer, inner) => delta at the current axis positions. */
function readVariationStore(d, offset, coords) {
  const r = new Reader(d, offset + 2);
  const regions = new Reader(d, offset + r.u32());
  const dataOffsets = [];
  for (let n = r.u16(); n > 0; n--) dataOffsets.push(offset + r.u32());
  const axisCount = regions.u16();
  const scalars = [];
  for (let n = regions.u16(); n > 0; n--) {
    let s = 1;
    for (let a = 0; a < axisCount; a++) s *= axisScalar(coords[a] ?? 0, regions.f2dot14(), regions.f2dot14(), regions.f2dot14());
    scalars.push(s);
  }
  return (outer, inner) => {
    if (outer >= dataOffsets.length) return 0;
    const item = new Reader(d, dataOffsets[outer]);
    const items = item.u16();
    const wordField = item.u16();
    const columns = item.u16();
    if (inner >= items) return 0;
    const long = wordField & 0x8000;
    const words = wordField & 0x7fff;
    const regionIndex = [];
    for (let c = 0; c < columns; c++) regionIndex.push(item.u16());
    item.skip(inner * (long ? words * 4 + (columns - words) * 2 : words * 2 + (columns - words)));
    let delta = 0;
    for (let c = 0; c < columns; c++) {
      const v = c < words ? (long ? item.i32() : item.i16()) : long ? item.i16() : item.i8();
      delta += v * scalars[regionIndex[c]];
    }
    return delta;
  };
}

/** HVAR -> (glyph id) => change of the advance width. */
function readAdvanceDeltas(d, coords) {
  const store = readVariationStore(d, d.readUInt32BE(4), coords);
  const mapOffset = d.readUInt32BE(8);
  if (!mapOffset) return (gid) => store(0, gid);
  const r = new Reader(d, mapOffset);
  const format = r.u8();
  const entryFormat = r.u8();
  const count = format === 1 ? r.u32() : r.u16();
  const entrySize = ((entryFormat & 0x30) >> 4) + 1;
  const innerBits = (entryFormat & 0x0f) + 1;
  const entries = r.p;
  return (gid) => {
    let e = 0;
    const at = entries + Math.min(gid, count - 1) * entrySize;
    for (let i = 0; i < entrySize; i++) e = e * 256 + d[at + i];
    return store(Math.floor(e / 2 ** innerBits), e % 2 ** innerBits);
  };
}

/** gvar -> (glyph, glyph id) => { xs, ys, advanceDelta }: the outline moved to the current axis positions. */
function readGlyphVariations(d, coords) {
  const r = new Reader(d, 4);
  const axisCount = r.u16();
  const sharedCount = r.u16();
  const sharedOffset = r.u32();
  const glyphCount = r.u16();
  const long = r.u16() & 1;
  const dataStart = r.u32();
  const offsets = r.p;
  const tuple = (reader) => {
    const t = [];
    for (let a = 0; a < axisCount; a++) t.push(reader.f2dot14());
    return t;
  };
  const sharedReader = new Reader(d, sharedOffset);
  const shared = [];
  for (let i = 0; i < sharedCount; i++) shared.push(tuple(sharedReader));

  const packedPoints = (reader) => {
    let count = reader.u8();
    if (count === 0) return null; // every point
    if (count & 0x80) count = ((count & 0x7f) << 8) | reader.u8();
    const points = [];
    let p = 0;
    while (points.length < count) {
      const control = reader.u8();
      for (let run = (control & 0x7f) + 1; run > 0 && points.length < count; run--) {
        p += control & 0x80 ? reader.u16() : reader.u8();
        points.push(p);
      }
    }
    return points;
  };
  const packedDeltas = (reader, count) => {
    const out = new Float64Array(count);
    let i = 0;
    while (i < count) {
      const control = reader.u8();
      for (let run = (control & 0x3f) + 1; run > 0 && i < count; run--) {
        out[i++] = control & 0x80 ? 0 : control & 0x40 ? reader.i16() : reader.i8();
      }
    }
    return out;
  };
  /** Deltas of points a tuple does not mention, interpolated from its neighbours on the same contour. */
  const between = (c, c1, c2, d1, d2) => {
    if (c1 === c2) return d1 === d2 ? d1 : 0;
    if (c1 > c2) return between(c, c2, c1, d2, d1);
    if (c <= c1) return d1;
    if (c >= c2) return d2;
    return d1 + ((c - c1) * (d2 - d1)) / (c2 - c1);
  };
  const infer = (glyph, has, ex, ey) => {
    let first = 0;
    for (const end of glyph.ends) {
      const touched = [];
      for (let i = first; i <= end; i++) if (has[i]) touched.push(i);
      const next = (i) => (i === end ? first : i + 1);
      if (touched.length === 1) {
        for (let i = first; i <= end; i++) {
          ex[i] = ex[touched[0]];
          ey[i] = ey[touched[0]];
        }
      } else {
        for (let k = 0; k < touched.length; k++) {
          const a = touched[k];
          const b = touched[(k + 1) % touched.length];
          for (let i = next(a); i !== b; i = next(i)) {
            ex[i] = between(glyph.xs[i], glyph.xs[a], glyph.xs[b], ex[a], ex[b]);
            ey[i] = between(glyph.ys[i], glyph.ys[a], glyph.ys[b], ey[a], ey[b]);
          }
        }
      }
      first = end + 1;
    }
  };

  return (glyph, gid) => {
    const n = glyph.xs.length;
    const total = n + 4; // the outline and four phantom points; the first two carry the advance
    const dx = new Float64Array(total);
    const dy = new Float64Array(total);
    const from = gid < glyphCount ? (long ? d.readUInt32BE(offsets + gid * 4) : d.readUInt16BE(offsets + gid * 2) * 2) : 0;
    const to = gid < glyphCount ? (long ? d.readUInt32BE(offsets + gid * 4 + 4) : d.readUInt16BE(offsets + gid * 2 + 2) * 2) : 0;
    if (to > from) {
      const base = dataStart + from;
      const head = new Reader(d, base);
      const tupleField = head.u16();
      const data = new Reader(d, base + head.u16());
      const sharedPoints = tupleField & 0x8000 ? packedPoints(data) : null;
      for (let t = tupleField & 0x0fff; t > 0; t--) {
        const size = head.u16();
        const index = head.u16();
        const peak = index & 0x8000 ? tuple(head) : shared[index & 0x0fff];
        const start = index & 0x4000 ? tuple(head) : null;
        const end = index & 0x4000 ? tuple(head) : null;
        const after = data.p + size;
        let scalar = 1;
        for (let a = 0; a < axisCount; a++) {
          scalar *= start ? axisScalar(coords[a], start[a], peak[a], end[a]) : axisScalar(coords[a], Math.min(peak[a], 0), peak[a], Math.max(peak[a], 0));
        }
        if (scalar !== 0) {
          const points = index & 0x2000 ? packedPoints(data) : sharedPoints;
          const count = points ? points.length : total;
          const tx = packedDeltas(data, count);
          const ty = packedDeltas(data, count);
          if (!points) {
            for (let i = 0; i < total; i++) {
              dx[i] += tx[i] * scalar;
              dy[i] += ty[i] * scalar;
            }
          } else {
            const ex = new Float64Array(total);
            const ey = new Float64Array(total);
            const has = new Uint8Array(total);
            for (let i = 0; i < points.length; i++) {
              if (points[i] >= total) continue;
              ex[points[i]] = tx[i];
              ey[points[i]] = ty[i];
              has[points[i]] = 1;
            }
            infer(glyph, has, ex, ey);
            for (let i = 0; i < total; i++) {
              dx[i] += ex[i] * scalar;
              dy[i] += ey[i] * scalar;
            }
          }
        }
        data.p = after;
      }
    }
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = glyph.xs[i] + dx[i];
      ys[i] = glyph.ys[i] + dy[i];
    }
    return { xs, ys, on: glyph.on, ends: glyph.ends, advanceDelta: dx[n + 1] - dx[n] };
  };
}

/** GPOS 'kern' (pair positioning, formats 1 and 2) -> (left glyph, right glyph) => adjustment in font units. */
function readKerning(tables, coords) {
  const d = tables.get('GPOS')?.data;
  if (!d) return () => 0;
  const gdef = tables.get('GDEF')?.data;
  const hasStore = gdef && gdef.readUInt16BE(2) >= 3 && gdef.readUInt32BE(14) !== 0;
  const store = hasStore ? readVariationStore(gdef, gdef.readUInt32BE(14), coords) : null;
  const scriptList = d.readUInt16BE(4);
  const featureList = d.readUInt16BE(6);
  const lookupList = d.readUInt16BE(8);

  // the default language of Latin (or of the default script)
  const sr = new Reader(d, scriptList);
  const scripts = new Map();
  for (let n = sr.u16(); n > 0; n--) scripts.set(sr.tag(), scriptList + sr.u16());
  const script = scripts.get('latn') ?? scripts.get('DFLT') ?? [...scripts.values()][0];
  if (script == null) return () => 0;
  const s = new Reader(d, script);
  let language = s.u16();
  if (language === 0) {
    if (s.u16() === 0) return () => 0;
    language = s.skip(4).u16();
  }
  const l = new Reader(d, script + language + 2);
  const required = l.u16();
  const features = required === 0xffff ? [] : [required];
  for (let n = l.u16(); n > 0; n--) features.push(l.u16());

  const lookupIndexes = new Set();
  for (const index of features) {
    const record = new Reader(d, featureList + 2 + index * 6);
    if (record.tag() !== 'kern') continue;
    const feature = new Reader(d, featureList + record.u16() + 2);
    for (let n = feature.u16(); n > 0; n--) lookupIndexes.add(feature.u16());
  }
  const lookups = [...lookupIndexes].sort((a, b) => a - b).map((index) => {
    const base = lookupList + d.readUInt16BE(lookupList + 2 + index * 2);
    const lookup = new Reader(d, base);
    const type = lookup.u16();
    lookup.skip(2);
    const subtables = [];
    for (let n = lookup.u16(); n > 0; n--) {
      let offset = base + lookup.u16();
      let kind = type;
      if (kind === 9) {
        // an extension record points at the real subtable
        kind = d.readUInt16BE(offset + 2);
        offset += d.readUInt32BE(offset + 4);
      }
      if (kind === 2) subtables.push(offset);
    }
    return subtables;
  });

  const bits = (v) => {
    let n = 0;
    for (let x = v; x; x >>= 1) n += x & 1;
    return n;
  };
  const coverage = (offset, gid) => {
    const c = new Reader(d, offset);
    const format = c.u16();
    for (let n = c.u16(), i = 0; i < n; i++) {
      if (format === 1) {
        if (c.u16() === gid) return i;
      } else {
        const start = c.u16();
        const end = c.u16();
        const index = c.u16();
        if (gid >= start && gid <= end) return index + gid - start;
      }
    }
    return -1;
  };
  const classOf = (offset, gid) => {
    const c = new Reader(d, offset);
    if (c.u16() === 1) {
      const start = c.u16();
      const n = c.u16();
      return gid >= start && gid < start + n ? d.readUInt16BE(c.p + (gid - start) * 2) : 0;
    }
    for (let n = c.u16(); n > 0; n--) {
      const start = c.u16();
      const end = c.u16();
      const cls = c.u16();
      if (gid >= start && gid <= end) return cls;
    }
    return 0;
  };
  /** xAdvance of the value record at `at`, with its variation delta; device offsets count from `base`. */
  const advance = (format, at, base) => {
    if (!(format & 4)) return 0;
    let v = d.readInt16BE(at + bits(format & 3) * 2);
    if (format & 0x40 && store) {
      const device = d.readUInt16BE(at + bits(format & 0x3f) * 2);
      if (device && d.readUInt16BE(base + device + 4) === 0x8000) {
        v += store(d.readUInt16BE(base + device), d.readUInt16BE(base + device + 2)); // kept fractional, as HarfBuzz does
      }
    }
    return v;
  };

  return (left, right) => {
    let total = 0;
    for (const subtables of lookups) {
      for (const offset of subtables) {
        const p = new Reader(d, offset);
        const format = p.u16();
        const index = coverage(offset + p.u16(), left);
        const format1 = p.u16();
        const format2 = p.u16();
        if (index < 0) continue;
        const record = bits(format1 & 0xff) * 2 + bits(format2 & 0xff) * 2;
        if (format === 1) {
          const set = offset + d.readUInt16BE(p.p + 2 + index * 2);
          let found = false;
          for (let n = d.readUInt16BE(set), i = 0; i < n && !found; i++) {
            const at = set + 2 + i * (2 + record);
            if (d.readUInt16BE(at) === right) {
              total += advance(format1, at + 2, set);
              found = true;
            }
          }
          if (found) break;
        } else if (format === 2) {
          const class1 = classOf(offset + p.u16(), left);
          const class2 = classOf(offset + p.u16(), right);
          const count1 = p.u16();
          const count2 = p.u16();
          if (class1 < count1 && class2 < count2) total += advance(format1, p.p + (class1 * count2 + class2) * record, offset);
          break;
        }
      }
    }
    return total;
  };
}

/**
 * Opens a variable WOFF2 at the given axis settings, e.g. openFont(file, { wght: 300 }).
 * Returns { unitsPerEm, capHeight, glyph(char) -> { xs, ys, on, ends, advance } | null, kern(charA, charB) }.
 */
export function openFont(file, settings = {}) {
  const tables = readWoff2(readFileSync(file));
  const need = (tag) => {
    const t = tables.get(tag);
    if (!t) throw new Error(`${path.basename(file)} has no ${tag} table`);
    return t;
  };
  const unitsPerEm = need('head').data.readUInt16BE(18);
  const metricCount = need('hhea').data.readUInt16BE(34);
  const os2 = tables.get('OS/2')?.data;
  const cmap = readCmap(need('cmap').data);
  const glyphs = readGlyphs(need('glyf'));
  const coords = readCoords(tables, settings);
  const varied = coords.some((c) => c !== 0);
  const vary = varied && tables.has('gvar') ? readGlyphVariations(tables.get('gvar').data, coords) : null;
  const advanceDelta = varied && tables.has('HVAR') ? readAdvanceDeltas(tables.get('HVAR').data, coords) : null;
  const kerning = readKerning(tables, coords);

  const hmtx = need('hmtx');
  const advances = [];
  const m = new Reader(hmtx.data, hmtx.transformed ? 1 : 0);
  for (let g = 0, last = 0; g < glyphs.length; g++) {
    if (g < metricCount) {
      last = m.u16();
      if (!hmtx.transformed) m.skip(2);
    }
    advances.push(last);
  }

  const gidOf = (char) => {
    const gid = cmap.get(char.codePointAt(0));
    if (gid == null) throw new Error(`${path.basename(file)} has no glyph for "${char}"`);
    return gid;
  };
  const cache = new Map();
  const glyph = (char) => {
    if (cache.has(char)) return cache.get(char);
    const gid = gidOf(char);
    const base = glyphs[gid];
    if (base?.composite) throw new Error(`"${char}" is a composite glyph in ${path.basename(file)}, which this reader does not draw`);
    const outline = base && vary ? vary(base, gid) : base;
    const delta = advanceDelta ? advanceDelta(gid) : (outline?.advanceDelta ?? 0);
    const result = { advance: advances[gid] + Math.sign(delta) * Math.round(Math.abs(delta)), outline: outline ?? null };
    cache.set(char, result);
    return result;
  };
  return {
    unitsPerEm,
    capHeight: os2 && os2.readUInt16BE(0) >= 2 ? os2.readInt16BE(88) : null,
    coords,
    glyph,
    kern: (a, b) => kerning(gidOf(a), gidOf(b)),
  };
}

// ---------- setting a line of type ----------

const fmt = (v) => String(Math.round(v * 100) / 100);

/** A TrueType outline (quadratic, with implied on-curve points) as SVG path data, y pointing down. */
function outlinePath({ xs, ys, on, ends }, x0, baseline, scale) {
  const P = (x, y) => `${fmt(x0 + x * scale)} ${fmt(baseline - y * scale)}`;
  let d = '';
  let first = 0;
  for (const end of ends) {
    const n = end - first + 1;
    if (n >= 2) {
      let start = -1;
      for (let i = 0; i < n && start < 0; i++) if (on[first + i]) start = i;
      const at = (i) => first + (i % n);
      // a contour without on-curve points starts halfway between its last and first control points
      const sx = start >= 0 ? xs[at(start)] : (xs[first] + xs[end]) / 2;
      const sy = start >= 0 ? ys[at(start)] : (ys[first] + ys[end]) / 2;
      d += `M${P(sx, sy)}`;
      let control = null;
      for (let k = 1; k <= n; k++) {
        const i = start >= 0 ? at(start + k) : at(k - 1);
        if (on[i]) {
          d += control ? `Q${P(control[0], control[1])} ${P(xs[i], ys[i])}` : `L${P(xs[i], ys[i])}`;
          control = null;
        } else {
          if (control) d += `Q${P(control[0], control[1])} ${P((control[0] + xs[i]) / 2, (control[1] + ys[i]) / 2)}`;
          control = [xs[i], ys[i]];
        }
      }
      if (control) d += `Q${P(control[0], control[1])} ${P(sx, sy)}`;
      d += 'Z';
    }
    first = end + 1;
  }
  return d;
}

/**
 * Sets one line. Returns { path(x, baseline) -> SVG path data, left, right, capHeight } in pixels:
 * `left` and `right` are the edges of the ink, measured from the pen's start.
 */
export function setLine(font, text, size, tracking) {
  const scale = size / font.unitsPerEm;
  const chars = [...text];
  const placed = [];
  let pen = 0;
  let left = Infinity;
  let right = -Infinity;
  chars.forEach((char, i) => {
    const g = font.glyph(char);
    if (g.outline) {
      placed.push({ outline: g.outline, x: pen });
      for (const x of g.outline.xs) {
        left = Math.min(left, pen + x * scale);
        right = Math.max(right, pen + x * scale);
      }
    }
    pen += g.advance * scale;
    if (i < chars.length - 1) pen += font.kern(char, chars[i + 1]) * scale + tracking * size;
  });
  if (!placed.length) throw new Error(`nothing to draw in "${text}"`);
  let capHeight = font.capHeight;
  if (capHeight == null) capHeight = Math.max(...font.glyph('H').outline.ys);
  return {
    left,
    right,
    width: right - left,
    capHeight: capHeight * scale,
    path: (x, baseline) => placed.map((p) => outlinePath(p.outline, x + p.x, baseline, scale)).join(''),
  };
}

// ---------- the card ----------

function parseArgs(argv) {
  const args = { pos: [50, 50], veil: VEIL, out: path.join(ROOT, 'public', 'og.jpg'), title: CARD.name.text, line: CARD.line.text };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--frame') args.frame = path.resolve(argv[++i]);
    else if (a === '--out') args.out = path.resolve(argv[++i]);
    else if (a === '--title') args.title = argv[++i];
    else if (a === '--line') args.line = argv[++i];
    else if (a === '--veil') {
      args.veil = Number(argv[++i]);
      if (!Number.isFinite(args.veil) || args.veil < 0 || args.veil > 0.9) throw new Error('--veil wants a number from 0 to 0.9, for example 0.35');
    } else if (a === '--pos') {
      args.pos = String(argv[++i]).split(',').map(Number);
      if (args.pos.length !== 2 || args.pos.some((v) => !Number.isFinite(v) || v < 0 || v > 100)) throw new Error('--pos wants two percentages, for example 50,40');
    } else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`unknown argument "${a}"`);
  }
  return args;
}

/** The frame cut to the canvas: cover, with the focal point given in percent. */
async function background(frame, pos) {
  if (!frame) return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: INK } });
  if (!existsSync(frame)) throw new Error(`frame not found: ${frame}`);
  const { data, info } = await sharp(frame).autoOrient().flatten({ background: INK }).toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  const scale = Math.max(WIDTH / info.width, HEIGHT / info.height);
  if (scale > 1) console.warn(`make-og: the frame is ${info.width}x${info.height}, smaller than the card: it is stretched x${scale.toFixed(2)}`);
  const width = Math.min(info.width, Math.round(WIDTH / scale));
  const height = Math.min(info.height, Math.round(HEIGHT / scale));
  const region = {
    left: Math.round(((info.width - width) * pos[0]) / 100),
    top: Math.round(((info.height - height) * pos[1]) / 100),
    width,
    height,
  };
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .extract(region)
    .resize(WIDTH, HEIGHT, { fit: 'fill', kernel: 'lanczos3' });
}

/**
 * What the name stands on, measured on the veiled picture inside `box`:
 *   light  the share of the area where the contrast against ivory falls under 3:1 (the least a large title needs)
 *   busy   how much the brightness jumps over 3 px, the width of a thin stroke (root mean square, in 8-bit codes):
 *          about 2 for a clear sky, 5 for rippled sand, 25 and more for a facade of lit windows
 */
function groundUnder(pixels, box, veil) {
  const linear = (v) => (v <= 10.31475 ? v / 3294.6 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  const ivory = 0.2126 * linear(241) + 0.7152 * linear(234) + 0.0722 * linear(220);
  const under = (v, ink) => v * (1 - veil) + ink * veil;
  const x0 = Math.max(0, Math.floor(box.left));
  const x1 = Math.min(WIDTH, Math.ceil(box.right));
  const y0 = Math.max(0, Math.floor(box.top));
  const y1 = Math.min(HEIGHT, Math.ceil(box.bottom));
  const w = x1 - x0;
  const luma = new Float32Array(Math.max(0, w * (y1 - y0)));
  let light = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * WIDTH + x) * 3;
      const r = under(pixels[i], 11);
      const g = under(pixels[i + 1], 10);
      const b = under(pixels[i + 2], 9);
      luma[(y - y0) * w + x - x0] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if ((ivory + 0.05) / (0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b) + 0.05) < 3) light++;
    }
  }
  let jumps = 0;
  let pairs = 0;
  for (let y = 0; y < y1 - y0; y++) {
    for (let x = 0; x < w; x++) {
      const here = luma[y * w + x];
      if (x + 3 < w) {
        jumps += (luma[y * w + x + 3] - here) ** 2;
        pairs++;
      }
      if (y + 3 < y1 - y0) {
        jumps += (luma[(y + 3) * w + x] - here) ** 2;
        pairs++;
      }
    }
  }
  return { light: luma.length ? light / luma.length : 0, busy: pairs ? Math.sqrt(jumps / pairs) : 0 };
}

/** The veil (a number, 0 = none) and the type, as one SVG the size of the card. `onFrame`: a picture lies underneath. */
export function overlay({ title, line, veil = 0, onFrame = veil > 0 }) {
  const serif = openFont(SERIF, { wght: CARD.name.weight });
  const grotesque = openFont(GROTESQUE, { wght: CARD.line.weight });
  const limit = WIDTH * CARD.maxWidth;
  let nameSize = CARD.name.size;
  let name = setLine(serif, title.toUpperCase(), nameSize, CARD.name.tracking);
  if (name.width > limit) {
    nameSize = (nameSize * limit) / name.width;
    name = setLine(serif, title.toUpperCase(), nameSize, CARD.name.tracking);
  }
  const small = line ? setLine(grotesque, line.toUpperCase(), CARD.line.size, CARD.line.tracking) : null;
  const block = name.capHeight + (small ? CARD.gap + small.capHeight : 0);
  const nameBaseline = (HEIGHT - block) / 2 - CARD.lift + name.capHeight;
  const centred = (set) => (WIDTH - set.width) / 2 - set.left; // centre the ink, not the advance widths
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`];
  if (veil > 0) parts.push(`<rect width="${WIDTH}" height="${HEIGHT}" fill="${INK}" fill-opacity="${veil}"/>`);
  parts.push(`<path fill="${IVORY}" d="${name.path(centred(name), nameBaseline)}"/>`);
  if (small) {
    const baseline = nameBaseline + CARD.gap + small.capHeight;
    const fill = onFrame ? `fill="${CARD.line.onFrame}" fill-opacity="${CARD.line.opacityOnFrame}"` : `fill="${CARD.line.onInk}"`;
    parts.push(`<path ${fill} d="${small.path(centred(small), baseline)}"/>`);
  }
  parts.push('</svg>');
  const left = (WIDTH - name.width) / 2;
  return {
    svg: parts.join(''),
    nameSize,
    nameWidth: name.width,
    lineWidth: small?.width ?? 0,
    nameBox: { left, right: left + name.width, top: nameBaseline - name.capHeight, bottom: nameBaseline },
  };
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`make-og: ${error.message}`);
    process.exit(1);
  }
  if (args.help) {
    console.log('usage: node scripts/make-og.mjs [--frame src/assets/frames/f01.jpg] [--pos 50,40] [--veil 0.22] [--out public/og.jpg] [--title "..."] [--line "..."]');
    return;
  }
  const raw = { raw: { width: WIDTH, height: HEIGHT, channels: 3 } };
  const veil = args.frame ? args.veil : 0;
  const card = overlay({ title: args.title, line: args.line, veil, onFrame: Boolean(args.frame) });
  const ground = await (await background(args.frame, args.pos)).removeAlpha().raw().toBuffer();
  const under = args.frame ? groundUnder(ground, card.nameBox, veil) : { light: 0, busy: 0 };
  const composed = await sharp(ground, raw)
    .composite([{ input: Buffer.from(card.svg), left: 0, top: 0 }])
    .removeAlpha()
    .raw()
    .toBuffer();

  // The best quality that fits the budget, with full-resolution colour so the type stays crisp.
  // It matters: at q90 the edges of the letters ring 14 codes past ivory, at q100 they do not (measured).
  let jpeg;
  let used;
  for (const chromaSubsampling of ['4:4:4', '4:2:0']) {
    for (let quality = 100; quality >= 60; quality -= 2) {
      jpeg = await sharp(composed, raw).jpeg({ quality, chromaSubsampling, mozjpeg: true, progressive: true }).toBuffer();
      used = `q${quality} ${chromaSubsampling}`;
      if (jpeg.length < MAX_BYTES) break;
    }
    if (jpeg.length < MAX_BYTES) break;
  }
  if (jpeg.length >= MAX_BYTES) throw new Error(`cannot get under ${MAX_BYTES} bytes (${jpeg.length} at ${used})`);
  await mkdir(path.dirname(args.out), { recursive: true });
  await writeFile(args.out, jpeg);
  console.log(
    `${args.out}  ${WIDTH}x${HEIGHT}, ${jpeg.length.toLocaleString('en-US')} bytes, ${used}, progressive` +
      `\n  ${args.frame ? `frame ${path.basename(args.frame)} at ${args.pos.join('% ')}%, veil ${Math.round(veil * 100)}%` : 'no frame: flat ink'}` +
      `\n  name ${Math.round(card.nameWidth)} px wide at ${fmt(card.nameSize)} px, line ${Math.round(card.lineWidth)} px wide` +
      (args.frame ? `\n  under the name: ${Math.round(under.light * 100)}% of the ground is too light for ivory (limit ${LIMITS.light * 100}%), busyness ${under.busy.toFixed(1)} (limit ${LIMITS.busy})` : ''),
  );
  const why = [under.light > LIMITS.light && 'light', under.busy > LIMITS.busy && 'busy'].filter(Boolean);
  if (why.length) {
    console.warn(
      `make-og: WARNING the name stands on a ${why.join(' and ')} part of the picture and may be hard to read in a small preview. ` +
        'Look at the result; try another --pos, another frame, or a stronger veil, for example --veil 0.4',
    );
  }
}

const direct = process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (direct) {
  main().catch((error) => {
    console.error(`make-og: ${error.message}`);
    process.exit(1);
  });
}
