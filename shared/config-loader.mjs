/**
 * @fileoverview Config file loader for TOML and JSON project configs.
 *
 * Supports per-project configuration files in configs-cli/ directory.
 * Reads .toml files using a minimal hand-rolled parser (no dependencies)
 * and .json files natively.
 *
 * All secrets stay in the config files — never in the ux-extract source.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Minimal TOML parser — handles the subset we need:
 * - top-level key = "value" pairs
 * - [section] headers
 * - section.key = "value" pairs
 * - comments (# ...)
 * - basic strings, numbers, booleans
 *
 * Not a full TOML implementation, but sufficient for project configs.
 * For full TOML support, users can use .json instead.
 *
 * @param {string} text - TOML source
 * @returns {Object}
 */
function parseToml(text) {
  const result = {};
  let currentSection = result;
  let currentKey = null;

  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) continue;

    // Section header [name]
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      const sectionName = sectionMatch[1].trim();
      currentSection = {};
      result[sectionName] = currentSection;
      continue;
    }

    // key = value
    const kvMatch = line.match(/^([\w-]+)\s*=\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      let value = kvMatch[2].trim();

      // Remove trailing comment
      const commentIdx = value.indexOf(' #');
      if (commentIdx !== -1) value = value.slice(0, commentIdx).trim();

      // String
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        currentSection[key] = value.slice(1, -1);
      }
      // Boolean
      else if (value === 'true') {
        currentSection[key] = true;
      } else if (value === 'false') {
        currentSection[key] = false;
      }
      // Number
      else if (/^-?\d+(\.\d+)?$/.test(value)) {
        currentSection[key] = parseFloat(value);
      }
      // Raw value
      else {
        currentSection[key] = value;
      }
    }
  }

  return result;
}

/**
 * Load a project config from a .toml or .json file.
 *
 * @param {string} configPath - Path to config file
 * @returns {{project?:string, root?:string, legacyRoutes?:Object<string,string>, targetUrl?:string, db?:Object, api?:Object}}
 */
export function loadConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  const ext = path.extname(configPath).toLowerCase();

  let config;
  if (ext === '.json') {
    config = JSON.parse(content);
  } else if (ext === '.toml') {
    config = parseToml(content);
  } else {
    throw new Error(`Unsupported config format: ${ext} (use .toml or .json)`);
  }

  return config;
}

export default { loadConfig };
