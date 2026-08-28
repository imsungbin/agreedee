import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, extname } from 'node:path';

/**
 * The safety contract, stated once, in one file.
 *
 * S1 never click a submit button      — behavioural tests live in apply/run/goldenset,
 *                                       plus the static guarantee below.
 * S2 when uncertain, uncheck          — decide.test.ts
 * S3 payment: detect and report       — context/decide/run/goldenset
 * S4 check only required + essential+quote — decide.test.ts (including the exhaustive invariant)
 * S5 Claude never decides law         — decide/run/claude tests
 *
 * This file adds the guarantees that no single unit test can give: that the
 * shipped source contains no way to click or submit anything, that the badge
 * never injects page-derived HTML, and that no key is committed.
 */

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function sourceFiles(dir: string = join(ROOT, 'src'), out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (extname(full) === '.ts') out.push(full);
  }
  return out;
}

const SOURCES = sourceFiles();
const rel = (f: string): string => f.slice(ROOT.length);

/**
 * Scan code, not prose. Block comments and whole-line comments are stripped;
 * trailing `//` is left alone so URLs in string literals survive intact.
 */
const code = (file: string): string =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

test('the source tree is where we think it is', () => {
  assert.ok(SOURCES.length >= 12, `found ${SOURCES.length} source files`);
});

// --- S1a: nothing submits, anywhere ------------------------------------
test('S1a: no shipped module can submit a form', () => {
  for (const file of SOURCES) {
    const src = code(file);
    assert.doesNotMatch(src, /\.submit\s*\(/, `${rel(file)} calls .submit()`);
    assert.doesNotMatch(src, /requestSubmit/, `${rel(file)} calls requestSubmit()`);
    assert.doesNotMatch(src, /\.form\.\w+\s*\(/, `${rel(file)} calls a form method`);
  }
});

/**
 * S1b. Pressing a control is a new capability and it lives in exactly one
 * file, the way writing .checked lives in exactly one file. Everywhere else
 * the old absolute rule still holds.
 */
test('S1b: only activate.ts may press a control on a page', () => {
  for (const file of SOURCES) {
    if (rel(file) === 'src/content/activate.ts') continue;
    // The options page owns its own buttons; it never touches a site.
    if (rel(file).startsWith('src/options/')) continue;
    assert.doesNotMatch(code(file), /\.click\s*\(/, `${rel(file)} calls .click()`);
  }
});

test('S1b: the one press is guarded by the refusal check in the same file', () => {
  const src = code(join(ROOT, 'src/content/activate.ts'));
  const presses = [...src.matchAll(/\.click\s*\(/g)];
  assert.equal(presses.length, 1, 'activate.ts should press in exactly one place');
  const guard = src.indexOf('refuseToPress(control)');
  assert.ok(guard >= 0 && guard < (presses[0] as RegExpMatchArray).index!, 'the press is unguarded');
});

test('S1: only apply.ts is allowed to write checkbox state on a page', () => {
  for (const file of SOURCES) {
    // The options page owns its own form controls; it never touches a site.
    if (rel(file) === 'src/content/apply.ts' || rel(file).startsWith('src/options/')) continue;
    assert.doesNotMatch(code(file), /\.checked\s*=[^=]/, `${rel(file)} assigns .checked`);
  }
});

// --- hostile pages -----------------------------------------------------
test('no module builds DOM from a page-derived string', () => {
  for (const file of SOURCES) {
    const src = code(file);
    assert.doesNotMatch(src, /innerHTML/, `${rel(file)} uses innerHTML`);
    assert.doesNotMatch(src, /outerHTML/, `${rel(file)} uses outerHTML`);
    assert.doesNotMatch(src, /insertAdjacentHTML/, `${rel(file)} uses insertAdjacentHTML`);
    assert.doesNotMatch(src, /document\.write/, `${rel(file)} uses document.write`);
  }
});

// --- keys --------------------------------------------------------------
test('no API key is committed anywhere in the repository', () => {
  const files = [...SOURCES, join(ROOT, 'manifest.json'), join(ROOT, 'package.json')];
  for (const file of files) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /sk-ant-[A-Za-z0-9]{10,}/, `${rel(file)} looks like it contains a key`);
  }
});

test('.gitignore keeps keys and env files out of the repository', () => {
  const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
  for (const pattern of ['.env', '*.key', 'secrets.*', 'node_modules/']) {
    assert.ok(ignore.includes(pattern), `.gitignore is missing ${pattern}`);
  }
});

test('the key is never written to a log or a URL', () => {
  for (const file of SOURCES) {
    const src = code(file);
    if (/console\.(log|info|warn|error)/.test(src)) {
      assert.doesNotMatch(src, /console\.\w+\([^)]*apiKey/, `${rel(file)} logs the key`);
    }
    assert.doesNotMatch(src, /\?[^'"`]*api[_-]?key=/i, `${rel(file)} puts a key in a URL`);
  }
});

// --- the extension actually loads --------------------------------------
/** The IHDR of a PNG is fixed-offset, so its dimensions need no decoder. */
function pngSize(file: string): { width: number; height: number } {
  const head = readFileSync(file).subarray(0, 24);
  assert.equal(head.subarray(1, 4).toString('latin1'), 'PNG', `${file} is not a PNG`);
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

interface Manifest {
  manifest_version: number;
  icons: Record<string, string>;
  background: { service_worker: string; type: string };
  options_page: string;
  content_scripts: Array<{ js: string[] }>;
  web_accessible_resources: Array<{ resources: string[]; matches: string[] }>;
  permissions: string[];
  host_permissions: string[];
  optional_host_permissions: string[];
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')) as Manifest;

/**
 * Manifest paths are relative to dist/, which only exists after a build. The
 * source each one is emitted from does exist, so the check runs against that
 * and stays honest without making the test suite depend on the build.
 */
const sourceOf = (distPath: string): string => {
  const compiled = join(ROOT, 'src', distPath.replace(/\.js$/, '.ts'));
  // boot.js is copied verbatim rather than compiled, so it has no .ts source.
  return existsSync(compiled) ? compiled : join(ROOT, 'src', distPath);
};

test('the manifest is MV3 and points at files that exist', () => {
  assert.equal(manifest.manifest_version, 3);
  const referenced = [
    manifest.background.service_worker,
    manifest.options_page,
    ...manifest.content_scripts.flatMap((cs) => cs.js),
  ];
  for (const path of referenced) {
    assert.ok(existsSync(sourceOf(path)), `manifest references missing file ${path}`);
  }
});

test('the content script entry point is a classic script, not a module', () => {
  const entry = manifest.content_scripts[0].js[0];
  assert.ok(entry.endsWith('boot.js'), 'the entry point is boot.js');
  // It must be shipped verbatim: compiling it would add an `export {}` marker,
  // which is a syntax error for a classic content script.
  assert.ok(
    existsSync(join(ROOT, 'src/content/boot.js')),
    'boot.js must stay hand-written JavaScript, never compiled from .ts'
  );
  const boot = readFileSync(sourceOf(entry), 'utf8');
  assert.doesNotMatch(boot, /^\s*export\b/m, 'a classic script cannot contain export');
  assert.doesNotMatch(boot, /^\s*import\s+[^(]/m, 'MV3 content scripts cannot use static imports');
  assert.match(boot, /import\(/, 'it should dynamically import the module entry point');
});

test('every module the content script pulls in is web-accessible', () => {
  const patterns = manifest.web_accessible_resources.flatMap((r) => r.resources);
  // Manifest patterns are dist-relative; the walk happens over sources.
  const shipped = (sourcePath: string): string =>
    sourcePath.replace(/^src\//, '').replace(/\.ts$/, '.js');
  const allowed = (path: string): boolean =>
    patterns.some((p) =>
      new RegExp(`^${p.replace(/[.]/g, '\\.').replace(/\*/g, '[^/]*')}$`).test(shipped(path))
    );

  const seen = new Set<string>();
  const walk = (path: string): void => {
    if (seen.has(path)) return;
    seen.add(path);
    assert.ok(allowed(path), `${path} is imported at runtime but not web-accessible`);
    const src = readFileSync(join(ROOT, path), 'utf8');
    // `import type` is erased entirely under verbatimModuleSyntax, so it
    // creates no runtime dependency. Every other import form does.
    for (const match of src.matchAll(/import\s+(?!type\s)[\s\S]*?from\s+'(\.[^']+)'/g)) {
      const specifier = match[1];
      if (!specifier) continue;
      const dir = path.slice(0, path.lastIndexOf('/'));
      const resolved = new URL(specifier, `file:///${dir}/`).pathname.slice(1);
      walk(resolved.replace(/\.js$/, '.ts'));
    }
  };
  walk('src/content/main.ts');
  assert.ok(seen.size > 5, `only walked ${seen.size} modules`);
});

test('the extension asks for no permission it does not use', () => {
  const source = SOURCES.map((f) => code(f)).join('\n');
  for (const permission of manifest.permissions) {
    assert.match(
      source,
      new RegExp(`\\bchrome\\.${permission}\\.`),
      `${permission} is requested but never used`
    );
  }
  // Only the endpoints the defaults actually use. localhost covers Ollama and
  // a local OpenAI-compatible server on whatever port the user runs it on.
  assert.deepEqual(manifest.host_permissions, [
    'https://api.anthropic.com/*',
    'https://api.openai.com/*',
    'http://localhost/*',
    'http://127.0.0.1/*',
  ]);
});

/**
 * Any other OpenAI-compatible endpoint is asked for at the moment the user
 * names it, from a click on the settings page. Declaring those hosts up front
 * would mean every install grants access to every site on the web to serve a
 * case most users never reach.
 */
test('access to arbitrary hosts is optional, not granted at install', () => {
  assert.deepEqual(manifest.optional_host_permissions, ['https://*/*', 'http://*/*']);
  for (const origin of manifest.optional_host_permissions) {
    assert.ok(
      !manifest.host_permissions.includes(origin),
      `${origin} is both required and optional`
    );
  }
});

test('the extension uses no chrome API it did not ask for', () => {
  // tabs.sendMessage, tabs.onActivated and tabs.onRemoved all work without the
  // "tabs" permission; it only unlocks url/title, which this never reads.
  // chrome.permissions itself needs no declaration; it operates on what
  // optional_host_permissions already lists.
  const FREE = new Set(['runtime', 'i18n', 'tabs', 'permissions']);
  const declared = new Set(manifest.permissions);
  for (const file of SOURCES) {
    for (const match of code(file).matchAll(/\bchrome\.(\w+)\./g)) {
      const api = match[1] as string;
      assert.ok(
        FREE.has(api) || declared.has(api),
        `${rel(file)} uses chrome.${api} but the manifest does not request it`
      );
    }
  }
});

test('the tabs API is only used in ways that need no permission', () => {
  const ALLOWED = /^(sendMessage|onActivated|onRemoved)$/;
  for (const file of SOURCES) {
    for (const match of code(file).matchAll(/\bchrome\.tabs\.(\w+)/g)) {
      assert.match(match[1] as string, ALLOWED, `${rel(file)} needs the tabs permission`);
    }
  }
});

// --- module hygiene ----------------------------------------------------
test('the deterministic core never touches chrome or the network', () => {
  for (const file of SOURCES.filter((f) => rel(f).startsWith('src/core/'))) {
    const src = code(file);
    assert.doesNotMatch(src, /\bchrome\./, `${rel(file)} uses the chrome API`);
    assert.doesNotMatch(src, /\bfetch\s*\(/, `${rel(file)} makes a network call`);
  }
});

test('no module has grown past the size where it stops being reviewable', () => {
  for (const file of SOURCES) {
    const lines = readFileSync(file, 'utf8').split('\n').length;
    assert.ok(lines <= 210, `${rel(file)} is ${lines} lines`);
  }
});

// --- artwork -----------------------------------------------------------
/**
 * The PNGs are committed, so a missing one is a broken extension rather than
 * a missing build step. Chrome silently falls back to a generic puzzle piece,
 * which is exactly the kind of failure nobody notices until the store rejects
 * the upload.
 */
test('the manifest points at icons that exist and are the size they claim', () => {
  const icons = manifest.icons;
  assert.deepEqual(Object.keys(icons).sort((a, b) => Number(a) - Number(b)), ['16', '32', '48', '128']);
  for (const [size, path] of Object.entries(icons)) {
    const file = join(ROOT, path);
    assert.ok(existsSync(file), `manifest references missing icon ${path}`);
    assert.deepEqual(pngSize(file), { width: Number(size), height: Number(size) }, path);
  }
});

test('every icon has an SVG it can be regenerated from', () => {
  for (const source of ['assets/icon.svg', 'assets/icon-16.svg']) {
    assert.ok(existsSync(join(ROOT, source)), `${source} is missing`);
  }
});
