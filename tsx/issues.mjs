/**
 * @fileoverview Deterministic issue detection for UX sources.
 *
 * Built-in checks (can be extended or configured):
 * - LEGACY_ROUTE:   Link points to /sala or /cocina (canonical: /floor, /kitchen)
 * - MISSING_ROUTE:  Route declared by Astro wrappers but absent from RouteHydrator
 * - UNTRANSLATED:   i18n key rendered as literal text (e.g. "sala.goDelivery")
 * - MISSING_LINK:   Element looks interactive but has no href/to (warning only)
 * - HARDCODED_KEY:  Text string matching i18n key pattern (section.word)
 */

import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Legacy route mapping for redirect detection.
 * Map of old path -> canonical path.
 * @type {Object<string, string>}
 */
const DEFAULT_LEGACY_MAP = {
  '/sala': '/floor',
  '/cocina': '/kitchen',
};

/**
 * Detect issues in a source file.
 *
 * @param {string} filePath - Absolute path to source file
 * @param {string} root     - Scan root
 * @param {Object} [options]
 * @param {Object<string,string>} [options.legacyRouteMap] - Old->canonical path map
 * @param {Set<string>} [options.canonicalRouteSet] - Set of known canonical routes
 * @returns {import('../shared/types.mjs').IssueRecord[]}
 */
export function detectIssues(filePath, root, options = {}) {
  const legacyMap = options.legacyRouteMap || DEFAULT_LEGACY_MAP;
  const canonicalRoutes = options.canonicalRouteSet || new Set();
  const relativePath = path.relative(root, filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    filePath, content,
    ts.ScriptTarget.Latest,
    true,
    path.extname(filePath) === '.tsx' ? ts.ScriptKind.TSX :
      path.extname(filePath) === '.astro' ? ts.ScriptKind.TSX :
      ts.ScriptKind.TS
  );

  const issues = [];

  // ── LEGACY_ROUTE: Detect links/references to old paths ──────────────
  function checkForLegacyPath(node) {
    if (ts.isStringLiteral(node) && node.text.startsWith('/')) {
      const legacyTarget = legacyMap[node.text];
      if (legacyTarget) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        issues.push({
          severity: 'error',
          code: 'LEGACY_ROUTE',
          file: relativePath,
          line,
          message: `Link or reference to legacy path "${node.text}" (canonical: "${legacyTarget}")`,
          evidence: `"${node.text}"`,
          suggestion: `Replace with "${legacyTarget}"`,
        });
      }
    }
    ts.forEachChild(node, checkForLegacyPath);
  }
  ts.forEachChild(sourceFile, checkForLegacyPath);

  // ── MISSING_LINK: Detect interactive elements without href/to ───────
  function checkInteractiveLinks(node) {
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && !ts.isJsxFragment(node)) {
      const tagName = ts.isJsxSelfClosingElement(node)
        ? node.tagName.getText(sourceFile)
        : node.openingElement.tagName.getText(sourceFile);

      const interactiveTags = new Set(['a', 'Link', 'NavLink', 'button']);
      if (interactiveTags.has(tagName) && tagName !== 'button') {
        const attrs = ts.isJsxSelfClosingElement(node)
          ? node.attributes.properties
          : node.openingElement.attributes.properties;

        const hasHrefOrTo = attrs.some(attr =>
          ts.isJsxAttribute(attr) && (attr.name.text === 'href' || attr.name.text === 'to')
        );

        if (!hasHrefOrTo && tagName !== 'button') {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          issues.push({
            severity: 'warning',
            code: 'MISSING_LINK',
            file: relativePath,
            line,
            message: `<${tagName}> element without href or to attribute`,
            evidence: tagName === 'a'
              ? `<a>...</a>`
              : `<${tagName} ...>`,
            suggestion: tagName === 'a'
              ? 'Add href="..." or replace with <Link to="...">'
              : `Add to="..." to <${tagName}>`,
          });
        }
      }
    }
    ts.forEachChild(node, checkInteractiveLinks);
  }
  ts.forEachChild(sourceFile, checkInteractiveLinks);

  // ── HARDCODED_KEY: Text that looks like an i18n key ─────────────────
  const i18nKeyPattern = /^[a-z]+(?:\.[a-zA-Z]\w*)+$/;
  function checkHardcodedKeys(node) {
    if (ts.isJsxText(node)) {
      const text = node.text.trim();
      if (text && i18nKeyPattern.test(text)) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        issues.push({
          severity: 'error',
          code: 'UNTRANSLATED',
          file: relativePath,
          line,
          message: `Text "${text}" matches i18n key pattern — likely untranslated`,
          evidence: text,
          suggestion: `Wrap in t(${JSON.stringify(text)})`,
        });
      }
    }
    // Also check string literals passed as children
    if (ts.isStringLiteral(node)) {
      const text = node.text.trim();
      if (text && i18nKeyPattern.test(text)) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        issues.push({
          severity: 'error',
          code: 'UNTRANSLATED',
          file: relativePath,
          line,
          message: `String literal "${text}" matches i18n key pattern`,
          evidence: `"${text}"`,
          suggestion: `Wrap in t(${JSON.stringify(text)})`,
        });
      }
    }
    ts.forEachChild(node, checkHardcodedKeys);
  }
  ts.forEachChild(sourceFile, checkHardcodedKeys);

  // ── MISSING_ROUTE: Astro-declared route not in RouteHydrator (cross-file check) ──
  // This is done at the aggregate level in the CLI, not per-file here.
  // But we check if RouteHydrator itself is missing a canonical route.
  if (filePath.includes('RouteHydrator') || filePath.endsWith('RouteHydrator.tsx')) {
    // Check that all canonical routes are mapped
    const canonicalPathRegex = /\b(\w+):\s*["'](\/[^"']+)["']/g;
    let match;
    const mappedPaths = new Set();
    while ((match = canonicalPathRegex.exec(content)) !== null) {
      mappedPaths.add(match[2]);
    }
    for (const canonical of canonicalRoutes) {
      if (!mappedPaths.has(canonical)) {
        const line = 1; // file-level
        issues.push({
          severity: 'error',
          code: 'MISSING_ROUTE',
          file: relativePath,
          line,
          message: `Route "${canonical}" is declared by Astro wrappers but not mapped in RouteHydrator`,
          evidence: `Missing entry like MyPage: "${canonical}"`,
          suggestion: `Add mapping for "${canonical}" to canonicalPaths in RouteHydrator`,
        });
      }
    }
  }

  return issues;
}

/**
 * Aggregate route discrepancy check: Astro wrapper routes vs RouteHydrator routes.
 * @param {import('../shared/types.mjs').RouteRecord[]} astroRoutes
 * @param {import('../shared/types.mjs').RouteRecord[]} hydratorRoutes
 * @returns {import('../shared/types.mjs').IssueRecord[]}
 */
export function checkRouteDiscrepancy(astroRoutes, hydratorRoutes) {
  const issues = [];

  const astroPathSet = new Set(astroRoutes.map(r => r.path));
  const hydratorPathSet = new Set(hydratorRoutes.map(r => r.path));

  for (const route of astroRoutes) {
    if (!hydratorPathSet.has(route.path)) {
      issues.push({
        severity: 'error',
        code: 'MISSING_ROUTE',
        file: route.file,
        message: `Route "${route.path}" (component: ${route.component || 'unknown'}) declared by Astro wrappers but missing from RouteHydrator`,
        evidence: route.path,
        suggestion: `Add route mapping for "${route.path}" in RouteHydrator`,
      });
    }
  }

  return issues;
}

export default { detectIssues, checkRouteDiscrepancy };