import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { DEFAULT_PORT } from './contracts.mjs';

export const PLUGIN_ID = 'magpie-session-routing';
const MAX_CONFIG_BYTES = 1024 * 1024;
const OPTION_KEYS = new Set(['port', 'showFolders', 'showProjectNames', 'installationId', 'apiToken']);

export class ConfigurationError extends Error {
  constructor() {
    super('Invalid Session Routing configuration. Check the plugin options and local gateway address.');
    this.name = 'ConfigurationError';
  }
}

export function canonicalSecret(value, bytes) {
  return typeof value === 'string' && value.length === Math.ceil(bytes * 4 / 3) &&
    /^[A-Za-z0-9_-]+$/u.test(value) && Buffer.from(value, 'base64url').length === bytes &&
    Buffer.from(value, 'base64url').toString('base64url') === value;
}

function portNumber(value) {
  if (typeof value === 'string' && /^(?:[1-9][0-9]{0,4})$/u.test(value)) value = Number(value);
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new ConfigurationError();
  return value;
}

export function validateOptions(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      Object.keys(options).some((key) => !OPTION_KEYS.has(key))) throw new ConfigurationError();
  const port = portNumber(options.port ?? DEFAULT_PORT);
  const showFolders = options.showFolders ?? false;
  const showProjectNames = options.showProjectNames === undefined ? true : options.showProjectNames;
  if (typeof showFolders !== 'boolean' || typeof showProjectNames !== 'boolean') throw new ConfigurationError();
  const { installationId, apiToken } = options;
  // Only a completely unprovisioned installation may wait for the page's setup.
  const provisioned = installationId !== undefined || apiToken !== undefined;
  if (provisioned && (!canonicalSecret(installationId, 16) || !canonicalSecret(apiToken, 32))) {
    throw new ConfigurationError();
  }
  return Object.freeze({ port, showFolders, showProjectNames, installationId, apiToken, provisioned });
}

export function parseGatewayAddress(value = '127.0.0.1:3425') {
  // MAGPIE_ADDR is a bind address, not a URL. No DNS, credentials, paths, or
  // alternate numeric-IP spelling can redirect privileged trace access.
  if (typeof value !== 'string' || value.length > 128) throw new ConfigurationError();
  const match = /^(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\]|\[::\]|):([1-9][0-9]{0,4})$/u.exec(value);
  if (!match) throw new ConfigurationError();
  const port = portNumber(match[2]);
  const host = match[1] === '[::1]' ? '[::1]' : '127.0.0.1';
  return Object.freeze({ address: `${host}:${port}`, port });
}

export function createConfig(input, options, { env = process.env } = {}) {
  const settings = validateOptions(options);
  if (!input || typeof input.directory !== 'string' || !isAbsolute(input.directory) ||
      input.directory.includes('\0')) throw new ConfigurationError();
  const gateway = parseGatewayAddress(env.MAGPIE_ADDR === undefined || env.MAGPIE_ADDR === ''
    ? undefined : env.MAGPIE_ADDR);
  if (settings.port === gateway.port) throw new ConfigurationError();
  const directory = resolve(input.directory);
  return Object.freeze({ ...settings, directory, configPath: join(directory, 'plugins.json'),
    gatewayAddress: gateway.address, host: '127.0.0.1' });
}

async function readConfig(path, { signal } = {}) {
  signal?.throwIfAborted();
  // Nonblocking open also fails safely for special files. A single bounded read
  // cannot allocate arbitrarily if a file grows between stat and read.
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > MAX_CONFIG_BYTES) return null;
    const buffer = Buffer.alloc(stat.size + 1);
    let used = 0;
    while (used < buffer.length) {
      signal?.throwIfAborted();
      const { bytesRead } = await file.read(buffer, used, buffer.length - used, used);
      if (!bytesRead) break;
      used += bytesRead;
    }
    if (used !== stat.size) return null;
    signal?.throwIfAborted();
    return JSON.parse(buffer.toString('utf8', 0, used));
  } finally {
    await file.close();
  }
}

export async function inspectInstallation(config, { read = readConfig, signal } = {}) {
  if (!config.provisioned || signal?.aborted) return null;
  try {
    const list = await read(config.configPath, { signal });
    if (signal?.aborted || !list || !Array.isArray(list.plugins) || list.plugins.length > 4096) return null;
    const matches = list.plugins.filter((entry) => entry?.options?.installationId === config.installationId);
    if (matches.length !== 1) return null;
    const entry = matches[0];
    if ((entry.off !== undefined && entry.off !== false) || typeof entry.spec !== 'string' ||
        !entry.spec.trim() || entry.spec.length > 4096 || /[\u0000-\u001f\u007f]/u.test(entry.spec)) return null;
    const current = validateOptions(entry.options);
    if (!current.provisioned || current.apiToken !== config.apiToken || current.showFolders !== config.showFolders ||
        current.showProjectNames !== config.showProjectNames) return null;
    return Object.freeze({ spec: entry.spec, port: current.port });
  } catch {
    // No last-good fallback: this file is the revocation authority.
    return null;
  }
}

export function createInstallationAuthorizer(config, { read = readConfig, signal, installation } = {}) {
  // Pin the saved port separately from the effective port supplied by Magpie.
  // A CLI host gets a temporary service port, but never collection privileges.
  const expectedPort = installation?.port ?? config.port;
  const expectedSpec = installation?.spec;
  return async function authorizeInstallation() {
    const current = await inspectInstallation(config, { read, signal });
    return current !== null && current.port === expectedPort &&
      (expectedSpec === undefined || current.spec === expectedSpec);
  };
}
