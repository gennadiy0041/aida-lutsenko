// Turns the original photographs into graded masters for the site.
//
//   node scripts/grade-frames.mjs --config <frames.json> --src <dir with originals> [--only id,id] [--dry-run]
//
// The originals never enter the repository; only what this script writes does:
//   kind "scope" -> src/assets/frames/<name or id>.jpg   a 2.39:1 frame, at most 2560 px wide
//   kind "still" -> src/assets/stills/<name or id>.jpg   the whole picture, at most 2200 px on the long side
// Every output is decoded to bare sRGB pixels (EXIF orientation applied, colour profile converted),
// graded with scripts/grade.mjs and encoded from those pixels, so no EXIF, GPS or ICC data can survive.
// The config format is documented in scripts/frames.config.example.json.
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyLut, buildLut } from './grade.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIRS = {
  scope: path.join(ROOT, 'src', 'assets', 'frames'),
  still: path.join(ROOT, 'src', 'assets', 'stills'),
};
const SCOPE = 2.39; // the cinema gate
const SCOPE_MAX_WIDTH = 2560;
const STILL_MAX_SIDE = 2200;
const SCREEN = 1920; // a frame fills at least this many pixels
const MAX_UPSCALE = 1.3; // ... and may be stretched by the browser no more than this
const LUT_SIZE = 65;
const INK = '#0b0a09';
const JPEG = { quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true, progressive: true };
const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fail = (message) => {
  console.error(`grade-frames: ${message}`);
  process.exit(1);
};

// ---------- arguments and config ----------

function parseArgs(argv) {
  const args = { only: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config') args.config = argv[++i];
    else if (a === '--src') args.src = argv[++i];
    else if (a === '--only') args.only = String(argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else fail(`unknown argument "${a}" (see --help)`);
  }
  return args;
}

const num = (value, fallback, lo, hi, label) => {
  if (value == null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < lo || value > hi) {
    throw new Error(`${label} must be a number from ${lo} to ${hi}, got ${JSON.stringify(value)}`);
  }
  return value;
};

/** Checks one config entry and resolves where each of its outputs goes. Throws on anything doubtful. */
function readFrame(entry, srcDir) {
  if (typeof entry?.id !== 'string' || !NAME.test(entry.id)) {
    throw new Error(`"id" must be letters, digits, "-" or "_", got ${JSON.stringify(entry?.id)}`);
  }
  if (typeof entry.file !== 'string' || !entry.file) throw new Error('"file" is missing');
  const file = path.resolve(srcDir, entry.file);
  if (!existsSync(file)) throw new Error(`original not found: ${file}`);
  if (!Array.isArray(entry.outputs) || entry.outputs.length === 0) throw new Error('"outputs" is empty');
  const outputs = entry.outputs.map((o, i) => {
    const dir = DIRS[o?.kind];
    if (!dir) throw new Error(`outputs[${i}].kind must be "scope" or "still", got ${JSON.stringify(o?.kind)}`);
    const name = o.name ?? entry.id;
    if (typeof name !== 'string' || !NAME.test(name)) {
      throw new Error(`outputs[${i}].name must be letters, digits, "-" or "_", got ${JSON.stringify(name)}`);
    }
    const target = path.join(dir, `${name}.jpg`);
    if (path.dirname(target) !== dir) throw new Error(`outputs[${i}] would be written outside ${dir}`);
    const crop = o.crop ?? {};
    for (const key of ['x', 'y', 'w', 'h']) num(crop[key], 0, 0, 1, `outputs[${i}].crop.${key}`);
    return { kind: o.kind, name, target, crop };
  });
  return {
    id: entry.id,
    file,
    outputs,
    rotate: num(entry.rotate, 0, -360, 360, '"rotate"'),
    adjust: {
      exposure: num(entry.exposure, 0, -3, 3, '"exposure"'),
      warmth: num(entry.warmth, 0, -1, 1, '"warmth"'),
      strength: num(entry.strength, 1, 0, 1, '"strength"'),
    },
  };
}

// ---------- pixels ----------

/**
 * Decodes an original to bare 8-bit sRGB pixels: EXIF orientation applied, embedded profile converted,
 * alpha flattened. `rotate` turns the picture (multiples of 90) or straightens it (small angles); a
 * straightened picture is trimmed to the largest clean rectangle of the same proportions.
 */
async function load(file, rotate) {
  const meta = await sharp(file).metadata();
  const input = sharp(file, { failOn: 'error' }).autoOrient();
  if (rotate) input.rotate(rotate, { background: INK });
  const { data, info } = await input
    .flatten({ background: INK })
    .withIccProfile('srgb') // also brings 16-bit wide-gamut files home; a no-op for plain sRGB
    .toColourspace('srgb')
    .raw({ depth: 'uchar' })
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) throw new Error(`expected 3 channels after decoding, got ${info.channels}`);

  let rect = { left: 0, top: 0, width: info.width, height: info.height };
  const quarter = Math.round(rotate / 90);
  const rest = rotate - quarter * 90;
  if (Math.abs(rest) > 1e-6) {
    const sideways = (meta.orientation ?? 1) >= 5;
    const ow = meta.autoOrient?.width ?? (sideways ? meta.height : meta.width);
    const oh = meta.autoOrient?.height ?? (sideways ? meta.width : meta.height);
    const [w, h] = quarter % 2 ? [oh, ow] : [ow, oh];
    const r = (Math.abs(rest) * Math.PI) / 180;
    const k = 1 / (Math.cos(r) + Math.max(w / h, h / w) * Math.sin(r));
    const width = Math.floor(w * k) - 2;
    const height = Math.floor(h * k) - 2;
    rect = { left: Math.round((info.width - width) / 2), top: Math.round((info.height - height) / 2), width, height };
  }
  return { data, canvas: { width: info.width, height: info.height, channels: 3 }, rect, source: `${meta.width}x${meta.height}` };
}

/** The 2.39:1 region of a scope output, in pixels of the decoded canvas. */
function scopeRegion(pic, crop, notes) {
  const { width: W, height: H } = pic.rect;
  const widest = Math.min(W, Math.floor(H * SCOPE));
  const asked = Math.round((crop.w ?? 1) * W);
  const width = clamp(asked, 2, widest);
  const height = Math.min(H, Math.round(width / SCOPE));
  const x = crop.x != null ? Math.round(crop.x * W) : Math.round((W - width) / 2);
  const y = crop.y != null ? Math.round(crop.y * H) : Math.round((H - height) / 2);
  const left = clamp(x, 0, W - width);
  const top = clamp(y, 0, H - height);
  if (left !== x || top !== y || width !== asked) notes.push('crop clamped to the picture');

  const needed = Math.ceil(SCREEN / MAX_UPSCALE);
  if (width < needed) {
    const stretch = (SCREEN / width).toFixed(2);
    if (widest < needed) {
      notes.push(`WARNING source is small: the frame is ${width} px wide, a ${SCREEN} px screen stretches it x${stretch}`);
    } else {
      throw new Error(
        `crop is only ${width} px wide: a ${SCREEN} px screen would stretch it x${stretch} (limit x${MAX_UPSCALE}). ` +
          `Widen crop.w to ${(needed / W).toFixed(3)} or more`,
      );
    }
  } else if (width < SCREEN) {
    notes.push(`x${(SCREEN / width).toFixed(2)} on a ${SCREEN} px screen`);
  }
  const outWidth = Math.min(SCOPE_MAX_WIDTH, width);
  return {
    region: { left: pic.rect.left + left, top: pic.rect.top + top, width, height },
    outWidth,
    outHeight: outWidth === width ? height : Math.round(outWidth / SCOPE),
  };
}

/** The region of a still: the whole picture, or crop { x, y, w, h } as fractions of it. */
function stillRegion(pic, crop, notes) {
  const { width: W, height: H } = pic.rect;
  const left = clamp(Math.round((crop.x ?? 0) * W), 0, W - 2);
  const top = clamp(Math.round((crop.y ?? 0) * H), 0, H - 2);
  const askedW = Math.round((crop.w ?? 1) * W);
  const askedH = Math.round((crop.h ?? 1) * H);
  const width = clamp(askedW, 2, W - left);
  const height = clamp(askedH, 2, H - top);
  if (width !== askedW || height !== askedH) notes.push('crop clamped to the picture');
  const scale = Math.min(1, STILL_MAX_SIDE / Math.max(width, height));
  return {
    region: { left: pic.rect.left + left, top: pic.rect.top + top, width, height },
    outWidth: Math.max(1, Math.round(width * scale)),
    outHeight: Math.max(1, Math.round(height * scale)),
  };
}

/** Crop, resize (never up), grade, encode. Returns the JPEG as a Buffer. */
async function render(pic, { region, outWidth, outHeight }, lut) {
  let image = sharp(pic.data, { raw: pic.canvas }).extract(region);
  if (outWidth !== region.width || outHeight !== region.height) {
    image = image.resize(outWidth, outHeight, { fit: 'fill', kernel: 'lanczos3' });
  }
  const pixels = await image.raw().toBuffer();
  applyLut(pixels, 3, lut, LUT_SIZE);
  return sharp(pixels, { raw: { width: outWidth, height: outHeight, channels: 3 } }).jpeg(JPEG).toBuffer();
}

// ---------- run ----------

function printTable(rows) {
  const head = ['id', 'source', 'output', 'size', 'bytes', 'ms', 'notes'];
  const all = [head, ...rows];
  const widths = head.map((_, c) => Math.max(...all.map((r) => String(r[c]).length)));
  const right = new Set([4, 5]);
  for (const [i, r] of all.entries()) {
    console.log(r.map((v, c) => (right.has(c) ? String(v).padStart(widths[c]) : String(v).padEnd(widths[c]))).join('  ').trimEnd());
    if (i === 0) console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.config || !args.src) {
    console.log('usage: node scripts/grade-frames.mjs --config <frames.json> --src <dir with originals> [--only id,id] [--dry-run]');
    console.log('       config format: scripts/frames.config.example.json');
    process.exit(args.help ? 0 : 1);
  }
  const srcDir = path.resolve(args.src);
  if (!existsSync(srcDir)) fail(`--src directory not found: ${srcDir}`);
  let config;
  try {
    config = JSON.parse(await readFile(path.resolve(args.config), 'utf8'));
  } catch (error) {
    fail(`cannot read config ${args.config}: ${error.message}`);
  }
  if (!Array.isArray(config.frames)) fail('config must have a "frames" array');

  // check the whole config before touching anything: every entry, and no two outputs on one file
  const problems = [];
  const frames = [];
  const taken = new Map();
  for (const [i, entry] of config.frames.entries()) {
    const label = typeof entry?.id === 'string' ? entry.id : `frames[${i}]`;
    if (args.only && !args.only.includes(entry?.id)) continue;
    try {
      const frame = readFrame(entry, srcDir);
      for (const o of frame.outputs) {
        const key = o.target.toLowerCase();
        if (taken.has(key)) {
          throw new Error(`${path.relative(ROOT, o.target).split(path.sep).join('/')} is already written by "${taken.get(key)}"`);
        }
        taken.set(key, frame.id);
      }
      frames.push(frame);
    } catch (error) {
      problems.push(`${label}: ${error.message}`);
    }
  }
  for (const id of args.only ?? []) {
    if (!config.frames.some((f) => f?.id === id)) problems.push(`--only: no frame with id "${id}" in the config`);
  }
  if (problems.length) {
    for (const p of problems) console.error(`grade-frames: ${p}`);
    process.exit(1);
  }
  if (frames.length === 0) fail('nothing to do');

  const luts = new Map();
  const lutFor = (adjust) => {
    const key = JSON.stringify(adjust);
    if (!luts.has(key)) luts.set(key, buildLut(LUT_SIZE, adjust));
    return luts.get(key);
  };

  const rows = [];
  const errors = [];
  let written = 0;
  for (const frame of frames) {
    const started = Date.now();
    let pic;
    try {
      pic = await load(frame.file, frame.rotate);
    } catch (error) {
      const hint = /\.hei[cf]$/i.test(frame.file) ? ' (HEIC is not supported here: export the photo as JPEG first)' : '';
      errors.push(`${frame.id}: cannot read ${path.basename(frame.file)}: ${error.message}${hint}`);
      rows.push([frame.id, '?', '-', '-', '-', '-', 'ERROR cannot read the original']);
      continue;
    }
    const lut = lutFor(frame.adjust);
    for (const [i, output] of frame.outputs.entries()) {
      const t0 = i === 0 ? started : Date.now();
      const notes = [];
      const where = path.relative(ROOT, output.target).split(path.sep).join('/');
      try {
        const job = output.kind === 'scope' ? scopeRegion(pic, output.crop, notes) : stillRegion(pic, output.crop, notes);
        let bytes = '-';
        if (!args.dryRun) {
          const jpeg = await render(pic, job, lut);
          await mkdir(path.dirname(output.target), { recursive: true });
          await writeFile(output.target, jpeg);
          bytes = jpeg.length.toLocaleString('en-US');
          written += 1;
        }
        rows.push([i === 0 ? frame.id : '', i === 0 ? pic.source : '', where, `${job.outWidth}x${job.outHeight}`, bytes, Date.now() - t0, notes.join('; ')]);
      } catch (error) {
        errors.push(`${frame.id}: ${where}: ${error.message}`);
        rows.push([i === 0 ? frame.id : '', i === 0 ? pic.source : '', where, '-', '-', '-', 'ERROR not written']);
      }
    }
  }

  printTable(rows);
  console.log(args.dryRun ? '\ndry run: nothing written' : `\n${written} file${written === 1 ? '' : 's'} written, JPEG q${JPEG.quality} 4:4:4, no metadata`);
  for (const row of rows) {
    const warning = String(row[6]).split('; ').find((n) => n.startsWith('WARNING'));
    if (warning) console.warn(`grade-frames: ${row[2]}: ${warning}`);
  }
  if (errors.length) {
    for (const e of errors) console.error(`grade-frames: ERROR ${e}`);
    process.exitCode = 1;
  }
}

await main();
