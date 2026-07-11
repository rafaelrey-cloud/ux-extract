/**
 * @fileoverview Auto-authentication for protected pages.
 *
 * Reads credentials from configs-cli/<project>.toml (never committed),
 * calls the target's login endpoint, and returns a JWT for page fetching.
 *
 * Token caching: the JWT is saved to configs-cli/.token-cache.json
 * (git-ignored) so subsequent runs reuse it until expiry.
 *
 * Usage:
 *   import { authenticate } from './runtime/auth.mjs';
 *   const auth = await authenticate('configs-cli/pronto.toml');
 *   // ^ uses cached token if still valid; re-logs-in silently if expired
 *   const html = await fetchPage(url, auth.token);
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../shared/config-loader.mjs';

/** Where token cache lives (git-ignored, per-project) */
const CACHE_DIR = 'configs-cli';
const CACHE_FILE = '.token-cache.json';
/** Refresh 5 minutes before real expiry to avoid edge-case 401s */
const EXPIRE_BUFFER_MS = 5 * 60 * 1000;

/**
 * Read the token cache from configs-cli/.token-cache.json.
 * @returns {Object|null} cached data or null
 */
function readCache() {
  const cachePath = path.join(CACHE_DIR, CACHE_FILE);
  try {
    if (!fs.existsSync(cachePath)) return null;
    const raw = fs.readFileSync(cachePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Write token data to cache.
 * @param {Object} entry - { project, token, user, expiresAt }
 */
function writeCache(entry) {
  const cachePath = path.join(CACHE_DIR, CACHE_FILE);
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(entry, null, 2), 'utf-8');
  } catch {
    // Non-fatal — cache write failure just means re-login next time
  }
}

/**
 * Check whether a cached token is still valid.
 * @param {Object} cache - parsed cache object
 * @param {string} configPath - identifies the project
 * @returns {{token: string, user: Object, expiresAt: string}|null}
 */
export function getCachedToken(configPath) {
  const cache = readCache();
  if (!cache || cache.configPath !== configPath) return null;
  if (!cache.token || !cache.expiresAt) return null;

  const expiry = new Date(cache.expiresAt).getTime();
  if (Date.now() + EXPIRE_BUFFER_MS >= expiry) return null; // expired or too close

  return {
    token: cache.token,
    user: cache.user,
    expiresAt: cache.expiresAt,
  };
}

/**
 * Log out — remove the cached token so the next authenticate() forces a fresh login.
 */
export function clearCache() {
  const cachePath = path.join(CACHE_DIR, CACHE_FILE);
  try { fs.unlinkSync(cachePath); } catch { /* ok if missing */ }
}

/**
 * Authenticate using credentials from config.
 * @param {Object|string} config - Parsed config object, or path to config file
 * @returns {Promise<{token: string, user: Object, expiresAt: string}>}
 */
export async function authenticate(config) {
  const configPath = typeof config === 'string' ? config : null;
  let cfg;

  if (typeof config === 'string') {
    // ── 1. Try cache first ──
    const cached = getCachedToken(config);
    if (cached) return cached;

    cfg = loadConfig(config);
  } else {
    cfg = config;
  }

  const auth = cfg.auth;
  if (!auth || !auth.type || !auth.loginUrl) {
    throw new Error('Missing [auth] section in config. Add type, loginUrl, and credentials.');
  }

  let body;

  if (auth.type === 'admin') {
    if (!auth.email || !auth.password) {
      throw new Error('Admin auth requires email and password');
    }
    body = JSON.stringify({
      tipo: 'admin',
      email: auth.email,
      password: auth.password,
    });
  } else if (auth.type === 'operative') {
    if (!auth.slug || !auth.pin) {
      throw new Error('Operative auth requires slug and pin');
    }
    body = JSON.stringify({
      tipo: 'operativo',
      slug: auth.slug,
      pin: auth.pin,
    });
  } else {
    throw new Error(`Unknown auth type: ${auth.type}. Use "admin" or "operative".`);
  }

  const resp = await fetch(auth.loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Auth failed (${resp.status}): ${text.slice(0, 200)}`);
  }

  const data = await resp.json();

  if (!data.token) {
    throw new Error('Auth response missing token');
  }

  const result = {
    token: data.token,
    user: data.user,
    expiresAt: data.expiresAt,
  };

  // ── 2. Save to cache ──
  if (configPath) {
    writeCache({
      configPath,
      token: data.token,
      user: data.user,
      expiresAt: data.expiresAt,
    });
  }

  return result;
}

/**
 * Fetch a protected page using a JWT token.
 * @param {string} url - Full URL of the page
 * @param {string} token - JWT token from authenticate()
 * @param {Object} [opts]
 * @param {string} [opts.userAgent] - Custom User-Agent (default: mobile iPhone)
 * @returns {Promise<{html: string, status: number}>}
 */
export async function fetchPage(url, token, opts = {}) {
  const ua = opts.userAgent
    || 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

  const resp = await fetch(url, {
    headers: {
      'User-Agent': ua,
      'Authorization': `Bearer ${token}`,
    },
    redirect: 'follow',
  });

  return {
    html: await resp.text(),
    status: resp.status,
  };
}

export default { authenticate, fetchPage, getCachedToken, clearCache };