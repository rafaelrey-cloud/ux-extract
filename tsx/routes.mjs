/**
 * @fileoverview Route extraction from TSX/Astro source files.
 * Discovers React Route declarations and Astro wrapper route patterns.
 */

import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Extract route declarations from source files.
 * Looks for:
 *   - <Route path="..." element={...} /> in React Router
 *   - RouteHydrator usage in Astro wrappers
 *   - Canonical path mappings in objects like `{ Sala: "/floor" }`
 *
 * @param {string} filePath - Absolute path to source file
 * @param {string} root     - Scan root
 * @returns {import('../shared/types.mjs').RouteRecord[]}
 */
export function extractRoutes(filePath, root) {
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

  const routes = [];

  function visit(node) {
    // <Route path="..." element={...} />
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = ts.isJsxSelfClosingElement(node)
        ? node.tagName.getText(sourceFile)
        : node.openingElement.tagName.getText(sourceFile);

      if (tagName === 'Route' || tagName === 'route') {
        const attrs = ts.isJsxSelfClosingElement(node)
          ? node.attributes.properties
          : node.openingElement.attributes.properties;

        let routePath = null;
        let component = null;
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

        for (const attr of attrs) {
          if (ts.isJsxAttribute(attr)) {
            if (attr.name.text === 'path' && attr.initializer && ts.isStringLiteral(attr.initializer)) {
              routePath = attr.initializer.text;
            }
            if (attr.name.text === 'element' && attr.initializer) {
              // Extract component name from JSX expression like {<Component />}
              if (ts.isJsxExpression(attr.initializer)) {
                const expr = attr.initializer.expression;
                if (expr && ts.isJsxElement(expr)) {
                  const innerTag = expr.openingElement.tagName;
                  if (ts.isIdentifier(innerTag)) {
                    component = innerTag.text;
                  }
                } else if (expr && ts.isJsxSelfClosingElement(expr)) {
                  const innerTag = expr.tagName;
                  if (ts.isIdentifier(innerTag)) {
                    component = innerTag.text;
                  }
                }
              }
            }
          }
        }

        if (routePath) {
          routes.push({
            path: routePath,
            file: relativePath,
            source: 'route',
            component: component || undefined,
            line,
          });
        }
      }
    }

    // Detect canonical path mapping objects like { Sala: "/floor", Cocina: "/kitchen" }
    if (ts.isPropertyAssignment(node) &&
        node.initializer && ts.isStringLiteral(node.initializer) &&
        node.initializer.text.startsWith('/')) {
      const propName = node.name.getText(sourceFile);
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

      // Only if it looks like a route mapping (e.g., Sala: "/floor")
      if (propName[0] === propName[0]?.toUpperCase()) {
        routes.push({
          path: node.initializer.text,
          file: relativePath,
          source: 'wrapper',
          component: propName,
          line,
        });
      }
    }

    // Detect RouteHydrator usage (Astro wrappers) — page="Name" path="/foo"
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = ts.isJsxSelfClosingElement(node)
        ? node.tagName.getText(sourceFile)
        : node.openingElement.tagName.getText(sourceFile);

      if (tagName === 'RouteHydrator') {
        const attrs = ts.isJsxSelfClosingElement(node)
          ? node.attributes.properties
          : node.openingElement.attributes.properties;

        let routePath = null;
        let component = null;
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

        for (const attr of attrs) {
          if (ts.isJsxAttribute(attr) && attr.name.text === 'path' && attr.initializer && ts.isStringLiteral(attr.initializer)) {
            routePath = attr.initializer.text;
          }
          if (ts.isJsxAttribute(attr) && attr.name.text === 'page' && attr.initializer && ts.isStringLiteral(attr.initializer)) {
            component = attr.initializer.text;
          }
        }

        if (routePath) {
          routes.push({
            path: routePath,
            file: relativePath,
            source: 'route',
            component: component || undefined,
            line,
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);

  return routes;
}

/**
 * Extract the set of canonical routes declared in Astro generation scripts.
 * @param {string} filePath - Path to generate-route-wrappers.mjs
 * @returns {{routes: import('../shared/types.mjs').RouteRecord[], redirects: {from:string, to:string}[]}}
 */
export function extractGeneratorRoutes(filePath) {
  const relativePath = path.basename(filePath);
  const content = fs.readFileSync(filePath, 'utf-8');

  // Simple regex-based extraction for the generator script
  const routes = [];
  const seen = new Set();

  // Match publicRoutes entries: { page: "Name", path: "/foo", ... }
  const routeRegex = /page:\s*["'](\w+)["']\s*,\s*path:\s*["']([^"']+)["']/g;
  let match;
  while ((match = routeRegex.exec(content)) !== null) {
    const routePath = match[2];
    const component = match[1];
    const key = `${routePath}:${component}`;
    if (!seen.has(key)) {
      seen.add(key);
      routes.push({
        path: routePath,
        file: relativePath,
        source: 'wrapper',
        component,
      });
    }
  }

  // Match redirects: { fromPath: "/sala", toPath: "/floor" }
  const redirectRegex = /fromPath:\s*["']([^"']+)["']\s*,\s*toPath:\s*["']([^"']+)["']/g;
  const redirects = [];
  const seenRedir = new Set();
  while ((match = redirectRegex.exec(content)) !== null) {
    const key = `${match[1]}->${match[2]}`;
    if (!seenRedir.has(key)) {
      seenRedir.add(key);
      redirects.push({ from: match[1], to: match[2] });
    }
  }

  return { routes, redirects };
}

export default { extractRoutes, extractGeneratorRoutes };