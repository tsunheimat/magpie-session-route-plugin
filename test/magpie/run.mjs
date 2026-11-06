// npm run test:magpie -- [--probe]
// Build separately: node test/magpie/build.mjs [--online]. Runtime is always offline.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sandboxArgs } from './sandbox.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = join(root, 'artifacts/integration');
const probe = process.argv.includes('--probe');
const source = resolve(process.env.MAGPIE_SOURCE || join(root, '../../git-open/magpie'));
function git(args) {
  const result = spawnSync('/usr/bin/git', ['-c', `safe.directory=${source}`, '-C', source, ...args], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } });
  assert.equal(result.status, 0, 'Cannot verify the read-only reference checkout');
  return result.stdout.trim();
}
assert.ok(process.argv.slice(2).every(arg => arg === '--probe'), 'Only --probe is accepted; no containment bypass');
assert.equal(process.platform, 'linux', 'This harness requires Linux bubblewrap; it never runs uncontained');
await mkdir(out, { recursive: true });
const runDirectory = await mkdtemp(join(out, 'run-'));
for (const directory of ['home', 'work']) await mkdir(join(runDirectory, directory));
let child;
let timer;
let result = { status: 'blocked', runtime: 'not started' };
try {
  let bun = process.env.MAGPIE_BUN;
  const binary = resolve(process.env.MAGPIE_BIN || join(out, 'magpie-v0.1.3124'));
  if (!probe) {
    await access(binary);
    if (!bun) {
      for (const entry of await readdir(out)) {
        if (!entry.startsWith('bun-runtime-')) continue;
        const candidate = join(out, entry, 'bun-linux-x64-baseline/bun');
        try { await access(candidate); bun = candidate; break; } catch { /* try the next extracted runtime */ }
      }
    }
    assert.ok(bun, 'Set MAGPIE_BUN to the genuine pinned Bun 1.4.2 executable (not a PATH shim)');
    bun = await realpath(bun);
    const build = JSON.parse(await readFile(join(out, 'build.json'), 'utf8'));
    assert.equal(build.commit, '3f53fa1f316330b77e5ff6d065a7a56980cafda2');
    assert.equal(git(['rev-parse', 'HEAD']), build.commit);
    assert.equal(git(['status', '--porcelain']), '', 'Reference checkout must be clean');
    assert.equal(createHash('sha256').update(await readFile(binary)).digest('hex'), build.sha256,
      'Magpie executable must match test/magpie/build.mjs provenance');
    // Pinned Linux x64 baseline executable extracted from the official 1.4.2
    // ZIP (ZIP SHA256 c678040f14fe0440eb839d37cbd0ce4c051a32da72806ac97de6a6aab6bf728f).
    assert.equal(createHash('sha256').update(await readFile(bun)).digest('hex'),
      'a83d263767d839e4d2649ca8e35d07159c7afc99afdc96d731ced29e056dda0c',
      'Bun must match the SHA-verified official 1.4.2 Linux x64 baseline release');
    for (const file of ['index.mjs', 'lib/lifecycle.mjs', 'lib/gateway.mjs', 'lib/collector.mjs', 'lib/aggregator.mjs', 'lib/history.mjs']) {
      await access(join(root, file));
    }
  }
  const args = sandboxArgs({ root, runDirectory, script: join(root, 'test/magpie/scenario.mjs'),
    args: probe ? ['--probe'] : [], env: probe ? {} : { MAGPIE_BIN: binary, MAGPIE_BUN: bun } });
  child = spawn('bwrap', args, { stdio: 'inherit', env: { PATH: '/usr/bin:/bin' } });
  const stop = () => child?.kill('SIGTERM');
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  timer = setTimeout(() => { stop(); }, probe ? 15_000 : 180_000);
  const status = await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolveExit({ code, signal }));
  });
  clearTimeout(timer);
  process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  try { result = JSON.parse(await readFile(join(runDirectory, 'result.json'), 'utf8')); }
  catch { throw new Error(`Contained test did not produce a result (exit ${status.code}, signal ${status.signal})`); }
  assert.equal(status.code, 0, result.error || 'Contained test failed');
  assert.equal(result.status, 'passed');
  if (!probe) {
    assert.equal(git(['status', '--porcelain']), '', 'Reference checkout changed during integration');
    result.referenceUnchanged = true;
  }
} catch (error) {
  result = { ...result, status: result.status === 'failed' ? 'failed' : 'blocked', error: error.message };
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  child?.kill('SIGTERM');
  // Keep only redacted diagnostics and machine-readable results, never synthetic
  // credential stores, SQLite ledgers, raw trace responses or browser state.
  await rm(join(runDirectory, 'home'), { recursive: true, force: true });
  await rm(join(runDirectory, 'work'), { recursive: true, force: true });
  result.completedAt = new Date().toISOString();
  result.runDirectory = runDirectory;
  await writeFile(join(runDirectory, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  await writeFile(join(out, probe ? 'containment-result.json' : 'latest-result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
