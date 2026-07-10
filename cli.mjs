#!/usr/bin/env node
/**
 * @fileoverview CLI entry point for the UX extraction toolkit.
 *
 * Usage:
 *   node src/ux-extract/cli.mjs --root . --format json
 *   node src/ux-extract/cli.mjs --root . --format markdown
 *   node src/ux-extract/cli.mjs --root . --out report.json
 *
 * Options:
 *   --root <path>         Scan root directory (default: process.cwd())
 *   --format <json|markdown> Output format (default: json)
 *   --out <file>          Write output to file instead of stdout
 *   --include <pattern>   Include pattern (can be repeated or comma-separated)
 *   --deterministic       Omit unstable timestamp; sort all arrays deterministically
 *   --fail-on <level>     Exit nonzero on: error, warning, never (default: never)
 *   --legacy-map <json>   JSON string of legacy route map (optional)
 *   --help                Show this help
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanFiles, parseFile, extractImports, extractI18nKeys, extractClassTokens, extractLinks } from './tsx/parser.mjs';
import { extractRoutes, extractGeneratorRoutes } from './tsx/routes.mjs';
import { detectIssues, checkRouteDiscrepancy } from './tsx/issues.mjs';
import { formatOutput, computeSummary } from './shared/output.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function showHelp() {
  console.log(`
UX Extract — Source-based UX extraction toolkit

USAGE:
  node src/ux-extract/cli.mjs --root <path> [options]

OPTIONS:
  --root <path>         Scan root directory (default: cwd)
  --format <fmt>        Output format: json | markdown (default: json)
  --out <file>          Write output to file
  --include <pattern>   Source include pattern (repeatable or comma-separated)
  --deterministic       Omit generatedAt timestamp; stable sort arrays
  --fail-on <level>     Exit code: error | warning | never (default: never)
  --legacy-map <json>   JSON string of { "/old": "/new" } mapping
  --help                Show this help
  `);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    root: null,
    format: 'json',
    out: null,
    include: [],
    deterministic: false,
    failOn: 'never',
    legacyMap: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--help':
        showHelp();
        process.exit(0);
      case '--root':
        opts.root = args[++i];
        break;
      case '--format':
        opts.format = args[++i];
        if (!['json', 'markdown'].includes(opts.format)) {
          console.error(`Invalid format: ${opts.format}. Use json or markdown.`);
          process.exit(1);
        }
        break;
      case '--out':
        opts.out = args[++i];
        break;
      case '--include':
        opts.include.push(args[++i]);
        break;
      case '--deterministic':
        opts.deterministic = true;
        break;
      case '--fail-on':
        opts.failOn = args[++i];
        if (!['error', 'warning', 'never'].includes(opts.failOn)) {
          console.error(`Invalid fail-on: ${opts.failOn}. Use error, warning, or never.`);
          process.exit(1);
        }
        break;
      case '--legacy-map':
        try {
          opts.legacyMap = JSON.parse(args[++i]);
        } catch {
          console.error('Invalid JSON for --legacy-map');
          process.exit(1);
        }
        break;
      default:
        if (args[i].startsWith('--')) {
          console.error(`Unknown option: ${args[i]}`);
          process.exit(1);
        }
        break;
    }
  }

  if (!opts.root) opts.root = process.cwd();
  opts.root = path.resolve(opts.root);

  // Handle comma-separated includes
  opts.include = opts.include.flatMap(i => i.split(','));

  return opts;
}

/**
 * Main extraction pipeline.
 */
async function main() {
  const opts = parseArgs();
  const root = opts.root;

  // ── 1. Scan files ─────────────────────────────────────────────────────
  const scanResult = scanFiles({
    root,
    include: opts.include.length > 0 ? opts.include : undefined,
  });
  const filePaths = scanResult.files;

  // ── 2. Extract data from each file ────────────────────────────────────
  const allComponents = [];
  const allImports = [];
  const allRoutes = [];
  const allLinks = [];
  const allI18nKeys = [];
  const allClassTokens = [];
  const allIssues = [];

  // Build canonical route set from generator routes
  const generatorScriptPath = path.join(root, 'astro/scripts/generate-route-wrappers.mjs');
  let generatorRoutes = [];
  let generatorRedirects = [];
  if (fs.existsSync(generatorScriptPath)) {
    const gen = extractGeneratorRoutes(generatorScriptPath);
    generatorRoutes = gen.routes;
    generatorRedirects = gen.redirects;
    allRoutes.push(...generatorRoutes);
  }

  const canonicalRouteSet = new Set(generatorRoutes.map(r => r.path));

  // Parse RouteHydrator separately for route discrepancy checks
  const hydratorPath = filePaths.find(f => f.includes('RouteHydrator'));
  let hydratorRoutes = [];

  for (const filePath of filePaths) {
    // Skip node_modules and dist explicitly
    if (filePath.includes('node_modules') || filePath.includes('/dist/') || filePath.includes('/dist-local/')) {
      continue;
    }

    try {
      const relPath = path.relative(root, filePath);

      // Skip generated .astro files (contain GENERATED HEADER)
      if (filePath.endsWith('.astro')) {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (content.startsWith('<!-- GENERATED FILE.')) continue;
      }

      // Components
      const components = parseFile(filePath, root);
      allComponents.push(...components);

      // Imports
      const imports = extractImports(filePath, root);
      allImports.push(...imports);

      // Routes (from React Router <Route> tags)
      const routes = extractRoutes(filePath, root);
      allRoutes.push(...routes);

      if (filePath.includes('RouteHydrator')) {
        hydratorRoutes = routes;
      }

      // Links
      const links = extractLinks(filePath, root);
      allLinks.push(...links);

      // i18n keys
      const i18nKeys = extractI18nKeys(filePath, root);
      allI18nKeys.push(...i18nKeys);

      // Class tokens
      const classTokens = extractClassTokens(filePath, root);
      allClassTokens.push(...classTokens);

      // Issues
      const issues = detectIssues(filePath, root, {
        legacyRouteMap: opts.legacyMap || undefined,
        canonicalRouteSet,
      });
      allIssues.push(...issues);
    } catch (err) {
      // Skip files that can't be parsed
    }
  }

  // ── 3. Cross-file checks ──────────────────────────────────────────────
  const discrepancyIssues = checkRouteDiscrepancy(generatorRoutes, hydratorRoutes);
  allIssues.push(...discrepancyIssues);

  // ── 4. Build output ───────────────────────────────────────────────────
  // Sort deterministically
  const sortBy = (arr, ...keys) => {
    return arr.slice().sort((a, b) => {
      for (const key of keys) {
        const va = a[key] ?? '';
        const vb = b[key] ?? '';
        const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
  };

  const output = {
    schemaVersion: 1,
    root: path.relative(process.cwd(), root) || '.',
    generatedAt: opts.deterministic ? undefined : new Date().toISOString(),
    files: sortBy(filePaths.map(f => path.relative(root, f)).filter(f => {
      // Filter out generated astro files that got through
      return !f.startsWith('astro/src/pages/') || !fs.readFileSync(path.join(root, f), 'utf-8').startsWith('<!-- GENERATED FILE.');
    })),
    components: sortBy(allComponents, 'file', 'name'),
    imports: sortBy(allImports, 'file', 'source', 'imported'),
    routes: sortBy(allRoutes, 'file', 'path'),
    links: sortBy(allLinks, 'file', 'to'),
    i18nKeys: sortBy(allI18nKeys, 'file', 'key'),
    classTokens: sortBy(allClassTokens, 'file', 'token'),
    issues: sortBy(allIssues, 'severity', 'file', 'code'),
    summary: {},
  };

  output.summary = computeSummary(output);

  // ── 5. Output ─────────────────────────────────────────────────────────
  const formatted = formatOutput(output, opts.format);
  if (opts.out) {
    fs.writeFileSync(opts.out, formatted, 'utf-8');
    console.error(`Written to ${opts.out}`);
  } else {
    console.log(formatted);
  }

  // ── 6. Exit code ──────────────────────────────────────────────────────
  const hasErrors = output.issues.some(i => i.severity === 'error');
  const hasWarnings = output.issues.some(i => i.severity === 'warning');

  if (opts.failOn === 'error' && hasErrors) process.exit(1);
  if (opts.failOn === 'warning' && (hasErrors || hasWarnings)) process.exit(1);
  process.exit(0);
}

main().catch(err => {
  console.error('UX Extract error:', err);
  process.exit(1);
});