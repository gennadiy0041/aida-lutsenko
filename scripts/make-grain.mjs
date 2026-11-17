// Generates the film-grain tile used by the fixed overlay (src/assets/grain.webp).
// Speckles are white or black with a small alpha, so plain alpha compositing is enough
// (no mix-blend-mode over the whole page).
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const SIZE = 220;
let seed = 20261117;
const rnd = () => {
  // mulberry32: deterministic, so the tile does not change between builds
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gauss = () => {
  const u = Math.max(rnd(), 1e-9), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const px = Buffer.alloc(SIZE * SIZE * 4);
for (let i = 0; i < SIZE * SIZE; i++) {
  const g = gauss();
  const a = Math.min(255, Math.round(Math.abs(g) * 30));
  const c = g > 0 ? 255 : 0;
  px[i * 4] = c; px[i * 4 + 1] = c; px[i * 4 + 2] = c; px[i * 4 + 3] = a;
}
const out = await sharp(px, { raw: { width: SIZE, height: SIZE, channels: 4 } })
  .webp({ quality: 50, alphaQuality: 50, effort: 6 })
  .toBuffer();
writeFileSync(new URL('../src/assets/grain.webp', import.meta.url), out);
console.log('src/assets/grain.webp', out.length, 'bytes');
