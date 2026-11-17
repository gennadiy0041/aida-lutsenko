// The look of the film: WARM SAND AND DEEP BLACK.
// One grade for every picture on the site, as pure functions with no I/O.
//
//   import { grade, buildLut, applyLut, LOOK } from './grade.mjs';
//   grade(120, 170, 230)                       -> [r, g, b]   0..255 sRGB in, 0..255 sRGB out
//   grade(120, 170, 230, { exposure: 0.3 })    per-picture adjustments
//   buildLut(33)                               -> Float32Array, 33*33*33*3 values 0..1, red fastest
//
// What happens to a pixel, in order:
//   1  exposure and warmth (per picture): gains in linear light that keep black and white in place
//   2  hue-selective saturation: cool hues go almost grey, warm hues stay, the rest is halved
//   3  a filmic tone curve: deep toe, a little more contrast, rolled-off highlights
//   4  split tone: the picture is pulled towards the ramp ink -> sand -> ivory
//   5  paper and ink: the result is printed between #0b0a09 and #f1eadc, channel by channel,
//      so nothing is whiter than the paper and nothing is blacker than the ink
//
// Tune the numbers in LOOK by eye; everything else follows from them.

export const INK = [11, 10, 9]; // #0b0a09
export const SAND = [199, 173, 133]; // #c7ad85
export const IVORY = [241, 234, 220]; // #f1eadc

export const LOOK = {
  /**
   * (a) How much saturation a hue keeps. Knots are [hue in degrees, keep 0..1], hue as in any
   * colour picker (0 red, 60 yellow, 120 green, 180 cyan, 240 blue, 300 magenta). Two knots with
   * the same value make a plateau, two different values make a smooth transition; the list wraps.
   */
  hueKeep: [
    [8, 0.86], // warm band: skin, sand, stone, evening light
    [64, 0.86],
    [96, 0.45], // yellow-greens, foliage
    [128, 0.45],
    [158, 0.2], // cool band: sea greens, cyans, blues, violets
    [282, 0.2],
    [312, 0.5], // magentas, pinks, deep reds
    [344, 0.5],
  ],
  /** Global saturation multiplier on top of the hue bands. */
  saturation: 1,
  /**
   * Soft ceiling for colourfulness (OKLab chroma): below `knee` nothing changes, above it colour is
   * compressed towards `max`. Skin and sand sit at 0.04-0.09 and pass untouched; a traffic cone does not.
   */
  chroma: { knee: 0.09, max: 0.16 },
  /**
   * A saturated colour looks brighter than a grey of the same lightness, so a drained sky would turn
   * leaden. This gives back lightness in proportion to the colour removed (0 = off).
   */
  lift: 0.4,

  /**
   * (c) The tone curve, as points [input, output] on 0..1 (display values, like a Curves tool).
   * A monotone cubic runs through them. Black stays black and white stays white here; the range
   * ink..ivory is applied afterwards.
   */
  curve: [
    [0, 0],
    [0.06, 0.02],
    [0.13, 0.062],
    [0.25, 0.185],
    [0.5, 0.505],
    [0.75, 0.81],
    [0.9, 0.94],
    [1, 1],
  ],

  /**
   * (b) Split tone: how far a pixel is pulled towards the ramp ink -> sand -> ivory at its own
   * lightness. Stronger in the shadows and highlights than in the midtones, so skin stays skin.
   * `apex` rounds the corner of the ramp at the sand stop (0 = a sharp three-stop ramp).
   */
  tone: { shadows: 0.3, mids: 0.2, highlights: 0.3, apex: 0.12 },

  /** Base bias of the whole film, same units as the per-picture adjustments. */
  exposure: 0,
  warmth: 0,
  /** What warmth = 1 means, in stops per channel (red up, blue down, green holds the brightness). */
  warmthStops: [0.3, -0.06, -0.45],
};

/** Per-picture adjustments. exposure in stops, warmth -1..1, strength 0..1 (0 = no look, only paper and ink). */
export const NEUTRAL = { exposure: 0, warmth: 0, strength: 1 };

// ---------- colour maths ----------

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toDisplay = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
/** A gain that keeps 0 and 1 where they are: shadows and midtones move by `g`, white stays white. */
const gain = (x, g) => (g * x) / (1 + (g - 1) * x);

/** Hue of display RGB in degrees, 0..360 (HSV hexagon). */
function hueOf(r, g, b) {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d <= 0) return 0;
  let h;
  if (max === r) h = (g - b) / d;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** Periodic lookup through [hue, value] knots with smoothstep transitions. */
function hueTable(knots) {
  const k = [...knots].sort((a, b) => a[0] - b[0]);
  const n = k.length;
  return (h) => {
    let i = n - 1;
    for (let j = 0; j < n; j++) {
      if (h < k[j][0]) break;
      i = j;
    }
    const [h0, v0] = k[i];
    const [h1raw, v1] = k[(i + 1) % n];
    if (v0 === v1) return v0;
    const span = (h1raw - h0 + 360) % 360 || 360;
    const u = ((h - h0 + 360) % 360) / span;
    return v0 + (v1 - v0) * u * u * (3 - 2 * u);
  };
}

/** Monotone cubic through points [x, y] (Fritsch-Carlson): never overshoots, never turns back. */
function monotoneCurve(points) {
  const p = [...points].sort((a, b) => a[0] - b[0]);
  const n = p.length;
  const xs = p.map((q) => q[0]);
  const ys = p.map((q) => q[1]);
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1]
    );
  };
}

// ---------- the grade ----------

/**
 * Builds the grade for a set of look parameters.
 * Returns { unit, grade, buildLut }: `unit` works on 0..1 floats and writes into `out`,
 * `grade` on 0..255 values, `buildLut` samples the grade into a 3D LUT.
 */
export function createGrade(look = LOOK) {
  const ink = INK.map((v) => v / 255);
  const span = IVORY.map((v, i) => v / 255 - ink[i]);
  // sand in "print" units (0 = ink, 1 = ivory), split into its lightness and its colour
  const sand = SAND.map((v, i) => (v / 255 - ink[i]) / span[i]);
  const sandY = luma(sand[0], sand[1], sand[2]);
  const tint = sand.map((v) => v - sandY);

  const keep = hueTable(look.hueKeep);
  const curve = monotoneCurve(look.curve);
  const { shadows, mids, highlights, apex } = look.tone;
  const { knee, max: chromaMax } = look.chroma ?? {};

  /** Weight of the sand tint at lightness y: 0 at ink, 1 at sand, 0 at ivory. */
  const sandWeight = (y) => {
    if (apex > 0 && y > sandY - apex && y < sandY + apex) {
      const u = (y - (sandY - apex)) / (2 * apex);
      const a = (sandY - apex) / sandY;
      const b = 1 - apex / (1 - sandY);
      return (1 - u) * (1 - u) * a + 2 * u * (1 - u) + u * u * b;
    }
    return y <= sandY ? y / sandY : (1 - y) / (1 - sandY);
  };
  /** How hard the pull towards the ramp is at lightness y. */
  const pull = (y) => {
    const x = 2 * y - 1;
    return mids + ((x < 0 ? shadows : highlights) - mids) * x * x;
  };

  function unit(r, g, b, adjust, out) {
    const exposure = look.exposure + (adjust?.exposure ?? 0);
    const warmth = look.warmth + (adjust?.warmth ?? 0);
    const strength = clamp01(adjust?.strength ?? 1);

    // 1  exposure and warmth, in linear light
    let lr = toLinear(clamp01(r));
    let lg = toLinear(clamp01(g));
    let lb = toLinear(clamp01(b));
    if (exposure !== 0 || warmth !== 0) {
      lr = gain(lr, 2 ** (exposure + warmth * look.warmthStops[0]));
      lg = gain(lg, 2 ** (exposure + warmth * look.warmthStops[1]));
      lb = gain(lb, 2 ** (exposure + warmth * look.warmthStops[2]));
    }
    // the corrected picture without the look, for `strength`
    const br = toDisplay(lr);
    const bg = toDisplay(lg);
    const bb = toDisplay(lb);

    // 2  hue-selective saturation, in OKLab so lightness and hue hold while colour drains
    const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
    let L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
    let A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
    let B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
    const chroma = Math.hypot(A, B);
    let k = keep(hueOf(br, bg, bb)) * look.saturation;
    if (knee != null && chroma * k > knee) {
      const over = chroma * k - knee;
      k *= (knee + over / (1 + over / (chromaMax - knee))) / (chroma * k);
    }
    A *= k;
    B *= k;
    if (k < 1) L += (look.lift ?? 0) * chroma * (1 - k) * (1 - L);
    const l3 = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m3 = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s3 = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    lr = clamp01(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3);
    lg = clamp01(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3);
    lb = clamp01(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3);

    // 3  tone curve, channel by channel
    let tr = curve(toDisplay(lr));
    let tg = curve(toDisplay(lg));
    let tb = curve(toDisplay(lb));

    // 4  split tone: pull towards the ramp at the same lightness
    const y = luma(tr, tg, tb);
    const a = pull(y);
    const w = sandWeight(y);
    tr += a * (y + w * tint[0] - tr);
    tg += a * (y + w * tint[1] - tg);
    tb += a * (y + w * tint[2] - tb);

    if (strength < 1) {
      tr = br + (tr - br) * strength;
      tg = bg + (tg - bg) * strength;
      tb = bb + (tb - bb) * strength;
    }

    // 5  paper and ink
    out[0] = ink[0] + span[0] * clamp01(tr);
    out[1] = ink[1] + span[1] * clamp01(tg);
    out[2] = ink[2] + span[2] * clamp01(tb);
    return out;
  }

  const tmp = [0, 0, 0];
  /** sRGB 0..255 in, sRGB 0..255 out (rounded). */
  function grade(r, g, b, adjust) {
    unit(r / 255, g / 255, b / 255, adjust, tmp);
    return [Math.round(tmp[0] * 255), Math.round(tmp[1] * 255), Math.round(tmp[2] * 255)];
  }

  /**
   * The grade as a 3D LUT: size^3 RGB triplets on 0..1, red changing fastest, then green, then blue
   * (the order of a .cube file). Index of an entry: ((b * size + g) * size + r) * 3.
   */
  function buildLut(size = 33, adjust) {
    const lut = new Float32Array(size * size * size * 3);
    const o = [0, 0, 0];
    const n = size - 1;
    let i = 0;
    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          unit(r / n, g / n, b / n, adjust, o);
          lut[i++] = o[0];
          lut[i++] = o[1];
          lut[i++] = o[2];
        }
      }
    }
    return lut;
  }

  return { unit, grade, buildLut };
}

const film = createGrade(LOOK);

/** grade(r, g, b[, { exposure, warmth, strength }]) -> [r, g, b], all on 0..255 sRGB. */
export const grade = film.grade;
/** buildLut(size = 33[, { exposure, warmth, strength }]) -> Float32Array (see createGrade). */
export const buildLut = film.buildLut;

/**
 * Applies a 3D LUT to 8-bit pixels in place, with trilinear interpolation.
 * `data` is a Buffer / Uint8Array of interleaved pixels, `channels` is 3 or 4 (alpha is left alone).
 */
export function applyLut(data, channels, lut, size) {
  const n = size - 1;
  const cell = new Uint8Array(256);
  const frac = new Float32Array(256);
  for (let v = 0; v < 256; v++) {
    const p = (v / 255) * n;
    const c = Math.min(n - 1, Math.floor(p));
    cell[v] = c;
    frac[v] = p - c;
  }
  const dr = 3;
  const dg = size * 3;
  const db = size * size * 3;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const fr = frac[r];
    const fg = frac[g];
    const fb = frac[b];
    const base = ((cell[b] * size + cell[g]) * size + cell[r]) * 3;
    for (let c = 0; c < 3; c++) {
      const p = base + c;
      const c00 = lut[p] + (lut[p + dr] - lut[p]) * fr;
      const c10 = lut[p + dg] + (lut[p + dg + dr] - lut[p + dg]) * fr;
      const c01 = lut[p + db] + (lut[p + db + dr] - lut[p + db]) * fr;
      const c11 = lut[p + db + dg] + (lut[p + db + dg + dr] - lut[p + db + dg]) * fr;
      const c0 = c00 + (c10 - c00) * fg;
      const c1 = c01 + (c11 - c01) * fg;
      const v = (c0 + (c1 - c0) * fb) * 255 + 0.5;
      data[i + c] = v < 0 ? 0 : v > 255 ? 255 : v | 0;
    }
  }
  return data;
}
