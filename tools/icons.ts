#!/usr/bin/env node
/**
 * icons.ts — rasterise the SVG sources into the PNGs Chrome loads.
 *
 * The PNGs are committed, so nobody needs this to build or run the extension.
 * It exists so the artwork has one source of truth: edit the SVG, re-run this,
 * commit what changed. Hand-edited PNGs would drift from the vectors within a
 * release or two.
 *
 * 16px is drawn from its own file rather than scaled from the master. At that
 * size the dash — which is the entire point of the mark — blurs into a smear.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, 'icons');

interface Target {
  size: number;
  source: string;
  out: string;
}

const ICONS: readonly Target[] = [
  { size: 16, source: 'assets/icon-16.svg', out: 'icon-16.png' },
  { size: 32, source: 'assets/icon.svg', out: 'icon-32.png' },
  { size: 48, source: 'assets/icon.svg', out: 'icon-48.png' },
  { size: 128, source: 'assets/icon.svg', out: 'icon-128.png' },
];

/** Wider than they are tall, and used nowhere in the extension itself. */
const PROMOS: readonly Target[] = [
  { size: 0, source: 'assets/promo-small.svg', out: '../assets/promo-440x280.png' },
  { size: 0, source: 'assets/social-preview.svg', out: '../assets/social-1280x640.png' },
];

function render(source: string, out: string, width?: number, height?: number): void {
  const args = ['--keep-aspect-ratio'];
  if (width) args.push('-w', String(width));
  if (height) args.push('-h', String(height));
  args.push(join(ROOT, source), '-o', join(OUT, out));
  execFileSync('rsvg-convert', args, { stdio: 'inherit' });
  console.log(`${source} -> ${out}`);
}

try {
  execFileSync('rsvg-convert', ['--version'], { stdio: 'ignore' });
} catch {
  console.error('rsvg-convert is not installed. `brew install librsvg`, or edit');
  console.error('the committed PNGs in icons/ by hand — they are the shipped artwork.');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
for (const icon of ICONS) render(icon.source, icon.out, icon.size, icon.size);
for (const promo of PROMOS) {
  if (existsSync(join(ROOT, promo.source))) render(promo.source, promo.out);
}
