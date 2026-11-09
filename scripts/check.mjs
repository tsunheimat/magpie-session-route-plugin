import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(manifest.name, 'magpie-session-routing');
assert.equal(manifest.type, 'module');
assert.equal(manifest.main, './index.mjs');
assert.equal(manifest.magpie.page.title, 'Session Routing');
assert.equal(manifest.magpie.page.replaces, undefined, 'Keep the built-in Routing page and Groups editor.');
assert.equal(manifest.magpie.page.service.option, 'port');
assert.equal(manifest.magpie.page.service.port, 3496);
assert.ok(Number.isInteger(manifest.magpie.options.port));
assert.equal(manifest.magpie.options.showFolders, false);
assert.equal(manifest.magpie.options.apiToken, undefined, 'Never ship installation credentials.');
assert.equal(manifest.magpie.options.installationId, undefined, 'Installation identity is provisioned per install.');
const required = [
  'index.mjs', 'lib/contracts.mjs', 'lib/config.mjs', 'lib/lifecycle.mjs',
  'lib/server.mjs', 'lib/gateway.mjs', 'lib/collector.mjs', 'lib/privacy.mjs',
  'lib/aggregator.mjs', 'lib/metrics.mjs', 'lib/history.mjs', 'lib/native-routing.mjs',
  'page/index.html', 'page/boot.js', 'page/icon.svg',
  'ui/index.html', 'ui/app.js', 'ui/bridge.js', 'ui/style.css',
  'README.md', 'docs/compatibility.md', 'docs/validation.md', 'docs/native-copy-provenance.md',
  ...JSON.parse(readFileSync(path.join(root, 'ui/vendor/magpie/static-manifest.json'), 'utf8')).files.map(file => `ui/${file}`),
  ...['static-manifest.json', 'source-manifest.json', 'extraction-manifest.json', 'source-grouping-patch.json']
    .map(file => `ui/vendor/magpie/${file}`),
];
const generated = spawnSync(process.execPath, [path.join(root, 'scripts/vendor-native-routing.mjs'), '--check'], { encoding: 'utf8' });
assert.equal(generated.status, 0, `Native extraction is not deterministic\n${generated.stdout}\n${generated.stderr}`);
for (const file of required) assert.ok(existsSync(path.join(root, file)), `Missing package file: ${file}`);
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (e.name.startsWith('.') || ['node_modules', 'artifacts', 'coverage'].includes(e.name)) return [];
    const f = path.join(dir, e.name);
    return e.isDirectory() ? walk(f) : [f];
  });
}
const scripts = walk(root).filter(f => /\.(?:mjs|cjs|js)$/.test(f));
for (const file of scripts) {
  // This exact generator input is a function-body include (it returns the
  // native host API), not a standalone script. Parse it in its real context;
  // generated client.js is also checked independently and compared above.
  const fragment = file === path.join(root, 'ui/native-lifecycle.inc.js');
  const checked = spawnSync(process.execPath, fragment ? ['--check', '--input-type=commonjs'] : ['--check', file], {
    encoding: 'utf8', ...(fragment ? { input: `(function () {\n${readFileSync(file, 'utf8')}\n});\n` } : {}),
  });
  assert.equal(checked.status, 0, `Syntax error in ${path.relative(root, file)}\n${checked.stderr}`);
}
for (const html of ['page/index.html', 'ui/index.html']) {
  const source = readFileSync(path.join(root, html), 'utf8');
  for (const [, url] of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    assert.ok(!/^(?:https?:)?\/\//.test(url), `${html} references an external resource: ${url}`);
    if (url.startsWith('#') || url.startsWith('data:') || url.startsWith('_magpie/')) continue;
    const target = path.resolve(path.dirname(path.join(root, html)), url.split(/[?#]/)[0]);
    assert.ok(target.startsWith(root), `Asset escapes the package: ${url}`);
    assert.ok(existsSync(target), `Missing ${html} asset: ${url}`);
  }
}
const packed = spawnSync('npm', ['pack', '--dry-run', '--offline', '--ignore-scripts', '--json', '--cache', path.join(root, 'artifacts/integration/npm-cache')], {
  cwd: root, encoding: 'utf8', env: { ...process.env, npm_config_update_notifier: 'false', npm_config_audit: 'false' }, maxBuffer: 4 * 1024 * 1024,
});
assert.equal(packed.status, 0, packed.stderr);
const [pack] = JSON.parse(packed.stdout);
const paths = new Set(pack.files.map(f => f.path));
for (const file of ['package.json', ...required]) assert.ok(paths.has(file), `npm pack omits ${file}`);
const allowed = new Set(['package.json', ...required]);
for (const file of paths) {
  assert.ok(allowed.has(file), `Unexpected packaged file: ${file}`);
  assert.ok(!/(?:^|\/)(?:node_modules|test|artifacts|\.git|\.env(?:\.[^/]+)?)(?:\/|$)|\.(?:log|tgz|pem|key)$/.test(file), `Development or credential file in package: ${file}`);
}
assert.ok(pack.unpackedSize < 6 * 1024 * 1024, 'Unexpectedly large package; inspect pinned native assets.');
console.log(`Checked ${scripts.length} JavaScript files; npm pack includes ${paths.size} files (${pack.unpackedSize} bytes).`);
