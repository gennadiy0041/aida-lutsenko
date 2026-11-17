/**
 * Entry for `node --test tests/` (the "test" script in package.json).
 *
 * Node 22 no longer expands a directory argument into the test files inside it: it runs the
 * directory as a module, and a directory module is its index.js. So this file is the directory:
 * it imports every tests/**\/*.test.mjs, sorted, and the runner reports them as usual.
 * A single file still runs on its own: node --test tests/site.test.mjs
 */
import { readdirSync } from 'node:fs';

const here = new URL('./', import.meta.url);
const tests = readdirSync(here, { recursive: true })
  .map((file) => String(file).replaceAll('\\', '/'))
  .filter((file) => file.endsWith('.test.mjs'))
  .sort();

for (const file of tests) await import(new URL(file, here).href);
