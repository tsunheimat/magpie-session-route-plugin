// The real Magpie/Bun process tree must never inherit the caller's network,
// credentials, agent files, or writable home. No uncontained fallback exists.
import assert from 'node:assert/strict';
import { networkInterfaces } from 'node:os';
import { readFileSync, readlinkSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { connect } from 'node:net';

export function sandboxArgs({ root, runDirectory, node = process.execPath, script, args = [], env = {} }) {
  const out = resolve(root, 'artifacts/integration');
  const run = resolve(runDirectory);
  assert.ok(run.startsWith(out + sep), 'Only the fresh integration run directory may be writable');
  const nodeRoot = dirname(dirname(node));
  const cleanEnv = {
    PATH: '/run/integration-node/bin:/usr/bin:/bin',
    HOME: join(run, 'home'), XDG_CONFIG_HOME: join(run, 'home/.config'),
    XDG_CACHE_HOME: join(run, 'home/.cache'), XDG_DATA_HOME: join(run, 'home/.local/share'),
    XDG_STATE_HOME: join(run, 'home/.local/state'), TMPDIR: '/tmp',
    LANG: 'C.UTF-8', TZ: 'UTC', NO_COLOR: '1', TERM: 'dumb',
    MAGPIE_NO_ACCOUNTS: '1', MAGPIE_TEST_RUN: run,
    MAGPIE_TEST_OUTER_NET: readlinkSync('/proc/self/ns/net'),
    MAGPIE_TEST_OUTER_PID: readlinkSync('/proc/self/ns/pid'), ...env,
  };
  // The ordinary filesystem is read-only; hide real homes and local IPC. A
  // separate PID namespace guarantees cleanup of even orphaned plugin hosts.
  return ['--unshare-net', '--unshare-pid', '--die-with-parent', '--new-session',
    '--ro-bind', '/', '/', '--proc', '/proc', '--dev', '/dev',
    '--tmpfs', '/home', '--tmpfs', '/root', '--tmpfs', '/tmp', '--tmpfs', '/run',
    '--ro-bind', nodeRoot, '/run/integration-node', '--bind', run, run,
    '--chdir', join(run, 'work'), '--clearenv',
    ...Object.entries(cleanEnv).flatMap(([key, value]) => ['--setenv', key, String(value)]),
    '/run/integration-node/bin/node', script, ...args];
}

export async function assertContained() {
  assert.ok(process.env.MAGPIE_TEST_RUN, 'Run through test/magpie/run.mjs; direct execution is refused');
  assert.notEqual(readlinkSync('/proc/self/ns/net'), process.env.MAGPIE_TEST_OUTER_NET,
    'An independent network namespace is required');
  assert.notEqual(readlinkSync('/proc/self/ns/pid'), process.env.MAGPIE_TEST_OUTER_PID,
    'An independent process namespace is required for complete descendant cleanup');
  const interfaces = networkInterfaces();
  assert.deepEqual(Object.keys(interfaces), ['lo'], 'Only loopback may exist');
  assert.ok(interfaces.lo.every(address => address.internal));
  const routes = readFileSync('/proc/net/route', 'utf8').trim().split('\n').slice(1).filter(Boolean);
  assert.equal(routes.length, 0, 'IPv4 namespace must have no egress routes');
  const ipv6 = readFileSync('/proc/net/ipv6_route', 'utf8').trim().split('\n').filter(Boolean);
  assert.ok(ipv6.every(line => line.trim().split(/\s+/).at(-1) === 'lo'), 'IPv6 must be loopback-only');
  assert.ok(process.env.HOME.startsWith(process.env.MAGPIE_TEST_RUN + sep));
  assert.ok(!Object.keys(process.env).some(key => /(?:ANTHROPIC|OPENAI|AWS_|GOOGLE_|PROXY|AUTH_TOKEN|API_KEY)/i.test(key)),
    'Ambient provider credentials and proxies must not be inherited');
  // Reserved documentation address: the kernel must reject it immediately,
  // before any application or credential-bearing process starts.
  await new Promise((resolvePromise, reject) => {
    const socket = connect({ host: '198.51.100.1', port: 9 });
    socket.setTimeout(1000, () => { socket.destroy(); reject(new Error('Egress probe timed out instead of being blocked')); });
    socket.once('connect', () => { socket.destroy(); reject(new Error('External network is reachable')); });
    socket.once('error', error => {
      socket.destroy();
      if (['ENETUNREACH', 'EHOSTUNREACH', 'EACCES', 'EPERM'].includes(error.code)) resolvePromise();
      else reject(new Error(`Unexpected containment probe result: ${error.code}`));
    });
  });
  return { network: 'loopback-only', homes: 'hidden; synthetic HOME only', environment: 'allowlisted', pidNamespace: true };
}
