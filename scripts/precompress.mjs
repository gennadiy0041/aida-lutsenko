// Writes .br and .gz sidecars next to text assets in dist/ so Caddy
// (`file_server { precompressed br zstd gzip }`) can serve max-ratio Brotli.
// Runs after `astro build`.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const DIST = 'dist';
const TEXT = new Set(['.html', '.css', '.js', '.mjs', '.svg', '.json', '.xml', '.txt', '.webmanifest']);
const MIN_BYTES = 1024;

let count = 0;
for (const entry of readdirSync(DIST, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !TEXT.has(extname(entry.name))) continue;
  const file = join(entry.parentPath ?? entry.path, entry.name);
  const source = readFileSync(file);
  if (source.length < MIN_BYTES) continue;
  writeFileSync(`${file}.br`, brotliCompressSync(source, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
      [constants.BROTLI_PARAM_SIZE_HINT]: source.length,
    },
  }));
  writeFileSync(`${file}.gz`, gzipSync(source, { level: 9 }));
  count += 1;
}
console.log(`precompress: wrote .br and .gz sidecars for ${count} files`);
