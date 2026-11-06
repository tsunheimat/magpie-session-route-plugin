// Dependency acquisition is deliberately separate from the contained runtime test.
// Offline by default. --online allows the pinned go.sum dependencies from Go's proxy.
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = resolve(process.env.MAGPIE_SOURCE || join(root, '../../git-open/magpie'));
const out = join(root, 'artifacts/integration');
const expected = '3f53fa1f316330b77e5ff6d065a7a56980cafda2';
const go = process.env.MAGPIE_GO;
assert.ok(go && isAbsolute(go), 'Set MAGPIE_GO to the absolute path of a supported Go toolchain (tested with Go 1.26.10).');
const online = process.argv.includes('--online');
function run(command, args, options = {}) {
  const p = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  if (p.error || p.status !== 0) throw new Error(`${command} failed (${p.status}): ${p.error?.message || p.stderr || p.stdout}`);
  return p.stdout.trim();
}
const commit = run('git', ['-C', source, 'rev-parse', 'HEAD']);
assert.equal(commit, expected, 'The integration build is pinned to Magpie v0.1.3124');
const before = run('git', ['-C', source, 'status', '--porcelain']);
assert.equal(before, '', 'Use a clean reference checkout; the harness never edits it');
await mkdir(out, { recursive: true });
for (const dir of ['go-cache', 'go-mod', 'go-home', 'go-tmp']) await mkdir(join(out, dir), { recursive: true });
const seed = process.env.MAGPIE_GO_PROXY_CACHE;
const proxy = [seed ? `file://${resolve(seed)}` : '', online ? 'https://proxy.golang.org' : 'off'].filter(Boolean).join(',');
const env = {
  PATH: '/usr/bin:/bin', HOME: join(out, 'go-home'), TMPDIR: join(out, 'go-tmp'),
  GOTOOLCHAIN: 'local', GOENV: 'off', GOWORK: 'off', CGO_ENABLED: '1',
  GOPATH: join(out, 'go-home'), GOCACHE: join(out, 'go-cache'), GOMODCACHE: join(out, 'go-mod'),
  GOPROXY: proxy, GOSUMDB: online ? 'sum.golang.org' : 'off',
};
const version = run(go, ['version'], { env });
const binary = join(out, 'magpie-v0.1.3124');
console.log(`Building ${commit} with ${version}; ${online ? 'pinned dependency downloads enabled' : 'offline'}`);
const sumBefore = await readFile(join(source, 'go.sum'), 'utf8');
try {
  const p = spawnSync(go, ['-C', source, 'build', '-mod=readonly', '-p=4', '-tags=nogui', '-buildvcs=false', '-ldflags=-X main.version=v0.1.3124', '-o', binary, '.'], {
    env, stdio: 'inherit', timeout: 20 * 60_000,
  });
  if (p.error || p.status !== 0) throw new Error(`Headless build failed (${p.status}): ${p.error?.message || 'see dependency/compiler output'}`);
  const sha256 = createHash('sha256').update(await readFile(binary)).digest('hex');
  await writeFile(join(out, 'build.json'), JSON.stringify({ commit, magpieVersion: 'v0.1.3124', go: version, binary, sha256, online }, null, 2) + '\n');
  console.log(`MAGPIE_BIN=${binary}`);
} finally {
  assert.equal(await readFile(join(source, 'go.sum'), 'utf8'), sumBefore, 'Reference go.sum was modified');
  assert.equal(run('git', ['-C', source, 'status', '--porcelain']), before, 'Reference checkout was modified');
}
