// Writes the film's grade (scripts/grade.mjs) as a .cube 3D LUT, so a video loop gets exactly the
// same look as the photographs, and prints the ffmpeg commands that make the loop.
//
//   node scripts/make-lut.mjs --out <look.cube> [--size 33] [--exposure 0] [--warmth 0] [--strength 1]
//                             [--seconds 8] [--width 1920]
//
// --exposure / --warmth / --strength are the same per-picture adjustments as in the frames config.
// --seconds and --width only shape the printed commands (length of the loop, width of the video).
// Keep the .cube next to the phone video, outside the repository.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildLut } from './grade.mjs';

const BUDGET_BYTES = 3_000_000; // "under 3 MB"
const TARGET = 0.9; // aim below the budget: rate control and the container overshoot a little

function parseArgs(argv) {
  const args = { size: 33, exposure: 0, warmth: 0, strength: 1, seconds: 8, width: 1920 };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i].startsWith('--') && key in args) args[key] = Number(argv[++i]);
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
    else throw new Error(`unknown argument "${argv[i]}"`);
  }
  for (const key of ['size', 'exposure', 'warmth', 'strength', 'seconds', 'width']) {
    if (!Number.isFinite(args[key])) throw new Error(`--${key} needs a number`);
  }
  if (!Number.isInteger(args.size) || args.size < 2 || args.size > 129) throw new Error('--size must be a whole number from 2 to 129');
  if (args.seconds <= 0) throw new Error('--seconds must be above 0');
  return args;
}

/**
 * The LUT as .cube text: one "r g b" line per entry, red changing fastest.
 * ffmpeg's lut3d truncates when it writes 8-bit values (measured: half a code darker than rounding),
 * so every entry is lifted by a quarter of a code: ink and ivory then land exactly on #0b0a09 and
 * #f1eadc whether a reader truncates or rounds, and the rest is off by a quarter code at most.
 */
function toCube(lut, size, title) {
  const lift = 0.25 / 255;
  const lines = [
    '# Aida Lutsenko - a film in four chapters. One grade for every picture: warm sand and deep black.',
    '# Made by scripts/make-lut.mjs from scripts/grade.mjs. Input and output are display sRGB / Rec.709.',
    `TITLE "${title}"`,
    `LUT_3D_SIZE ${size}`,
    'DOMAIN_MIN 0.0 0.0 0.0',
    'DOMAIN_MAX 1.0 1.0 1.0',
    '',
  ];
  for (let i = 0; i < lut.length; i += 3) {
    lines.push(`${(lut[i] + lift).toFixed(6)} ${(lut[i + 1] + lift).toFixed(6)} ${(lut[i + 2] + lift).toFixed(6)}`);
  }
  return `${lines.join('\n')}\n`;
}

/** A file path as ffmpeg wants it inside a filter: forward slashes, the drive colon escaped, in single quotes. */
function filterPath(file) {
  const rel = path.relative(process.cwd(), file);
  const local = rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  const p = (local ? rel : file).split(path.sep).join('/');
  return `'${p.replace(/:/g, '\\:').replace(/'/g, "\\'")}'`;
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`make-lut: ${error.message}`);
  process.exit(1);
}
if (args.help || !args.out) {
  console.log('usage: node scripts/make-lut.mjs --out <look.cube> [--size 33] [--exposure 0] [--warmth 0] [--strength 1] [--seconds 8] [--width 1920]');
  process.exit(args.help ? 0 : 1);
}

const out = path.resolve(args.out);
const adjust = { exposure: args.exposure, warmth: args.warmth, strength: args.strength };
const cube = toCube(buildLut(args.size, adjust), args.size, 'Aida - warm sand and deep black');
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, cube);
console.log(`${out}  ${args.size}x${args.size}x${args.size}, ${cube.length.toLocaleString('en-US')} bytes`);

// ---------- the loop ----------
const kbps = Math.floor((BUDGET_BYTES * TARGET * 8) / args.seconds / 1000);
// Both colour conversions are spelled out with exact rounding: left to ffmpeg's defaults, the step
// from the phone's YUV to RGB alone makes the picture 1-1.5 codes darker and slightly magenta (measured).
const exact = 'flags=accurate_rnd+full_chroma_int';
const filters = [
  'crop=iw:trunc(iw/2.39/2)*2:0:(ih-oh)*0.5', // the 2.39:1 band; 0.5 = centred, 0 = top, 1 = bottom
  `scale='min(${args.width},iw)':-2:flags=lanczos`, // never upscaled
  'hqdn3d=1.5:1.5:5:5', // phone noise costs bitrate; the site lays its own grain on top
  `scale=in_color_matrix=bt709:${exact}`,
  'format=gbrp',
  `lut3d=${filterPath(out)}`,
  `scale=out_color_matrix=bt709:out_range=tv:${exact}`,
  'format=yuv420p',
  // tags the stream; the -colorspace / -color_trc output options alone leave the transfer "unknown"
  'setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv',
].join(',');
const input = `-ss 0 -t ${args.seconds} -i IN.mp4`;
const common = `-vf "${filters}" -an -fpsmax 30`;
const twoPass = (codec, file) => [
  `ffmpeg -y ${input} ${common} ${codec} -pass 1 -passlogfile hero-pass -f null -`,
  `ffmpeg -y ${input} ${common} ${codec} -pass 2 -passlogfile hero-pass ${file}`,
];
const h264 = `-c:v libx264 -preset slower -profile:v high -b:v ${kbps}k -maxrate ${Math.round(kbps * 1.5)}k -bufsize ${kbps * 2}k`;
const vp9 = `-c:v libvpx-vp9 -b:v ${kbps}k -deadline good -cpu-used 1 -row-mt 1`;
const av1 = `-c:v libaom-av1 -b:v ${kbps}k -cpu-used 4 -row-mt 1`;

console.log(`
A muted 2.39:1 loop under 3 MB from a phone video (${args.seconds} s at ${kbps} kbit/s, at most ${args.width} px wide).
Replace IN.mp4 and set -ss to where the loop starts. Run the commands from the folder you are in now:
the paths in them are relative to it.

H.264 / MP4 (plays everywhere):
${twoPass(h264, '-movflags +faststart hero.mp4').join('\n')}

VP9 / WebM (fewer artefacts at the same size; the page offers it first):
${twoPass(vp9, 'hero.webm').join('\n')}

AV1 / WebM instead of VP9, if you can wait (libaom is slow; with an ffmpeg that has it, use -c:v libsvtav1 -preset 5):
${twoPass(av1, 'hero-av1.webm').join('\n')}

Notes:
- Put hero.mp4 and hero.webm into src/assets/video/: the opening titles pick them up. To use the AV1 file, name it hero.webm.
- (ih-oh)*0.5 centres the band; change 0.5 to move it up (0) or down (1). A vertical video gives a narrow band: prefer a horizontal one.
- A shorter loop may be sharper: --seconds 6 prints the commands for 6 s. An HDR (HLG / Dolby Vision) clip must be converted to SDR first.
- Check the result: every file must be below ${BUDGET_BYTES.toLocaleString('en-US')} bytes.`);
