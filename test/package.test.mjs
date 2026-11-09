import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('lockfile dependencies use public HTTPS and immutable integrity checks', async () => {
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (!name) continue;
    const resolved = new URL(entry.resolved);
    assert.equal(resolved.origin, 'https://registry.npmjs.org');
    assert.match(entry.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/u);
    assert.match(entry.version, /^\d+\.\d+\.\d+$/u);
  }
});

test('packed runtime contains exact native assets, licenses and provenance but no pristine baselines', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const [pack] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--offline', '--ignore-scripts', '--json', '--cache', `${root}artifacts/integration/npm-cache`], {
    cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, npm_config_update_notifier: 'false', npm_config_audit: 'false' },
  }));
  const paths = new Set(pack.files.map(f => f.path));
  const native = JSON.parse(await readFile(new URL('../ui/vendor/magpie/static-manifest.json', import.meta.url), 'utf8'));
  const uiFiles = new Set(['ui/index.html', 'ui/app.js', 'ui/bridge.js', 'ui/style.css', ...native.files.map(f => `ui/${f}`),
    ...['static-manifest.json', 'source-manifest.json', 'extraction-manifest.json', 'source-grouping-patch.json'].map(f => `ui/vendor/magpie/${f}`)]);
  assert.deepEqual(new Set([...paths].filter(f => f.startsWith('ui/'))), uiFiles);
  assert(paths.has('docs/native-copy-provenance.md')); assert(paths.has('lib/native-routing.mjs'));
  assert(![...paths].some(p => /upstream|test-only|native-lifecycle|^test\/|^artifacts\//.test(p)));
  assert(pack.unpackedSize < 6 * 1024 * 1024);
  assert.equal(pack.version, '0.3.2', 'native nested sub-agent release version');
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(lock.version, pack.version); assert.equal(lock.packages[''].version, pack.version);
});

test('published observer manifest leaves original routing and gateway hooks alone', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.magpie.page.replaces, undefined);
  assert.equal(manifest.magpie.hooks, undefined);
  assert.equal(manifest.magpie.permissions, undefined);
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.scripts.postinstall, undefined);
  assert.equal(manifest.scripts.preinstall, undefined);
  assert.equal(manifest.magpie.page.service.option, 'port');
  assert.equal(manifest.engines.magpie, '>=0.1.3124');
});
