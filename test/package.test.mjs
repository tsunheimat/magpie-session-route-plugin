import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
