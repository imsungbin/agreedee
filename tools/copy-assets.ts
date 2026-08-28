/**
 * copy-assets.ts — everything the extension needs that `tsc` will not emit.
 *
 * `tsc` moves .ts files and nothing else, so the manifest, the options markup
 * and (from phase 2) the locale files are copied here. Paths inside the
 * manifest are relative to dist/, which is the folder Chrome loads.
 */

import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIST = join(ROOT, 'dist');

const ASSETS: ReadonlyArray<{ from: string; to: string }> = [
  { from: 'manifest.json', to: 'manifest.json' },
  { from: 'src/options/options.html', to: 'options/options.html' },
  { from: 'src/content/boot.js', to: 'content/boot.js' },
  { from: 'icons', to: 'icons' },
  { from: '_locales', to: '_locales' },
];

if (!existsSync(DIST)) {
  throw new Error('dist/ does not exist — run the TypeScript build first');
}

for (const asset of ASSETS) {
  const source = join(ROOT, asset.from);
  if (!existsSync(source)) continue; // _locales arrives in phase 2
  const target = join(DIST, asset.to);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
  console.log(`copied ${asset.from} -> dist/${asset.to}`);
}
