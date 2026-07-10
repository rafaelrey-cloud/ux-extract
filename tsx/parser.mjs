/**
 * @fileoverview TypeScript/TSX source parser using the TypeScript compiler API.
 * Recursively scans source files, parses AST, and extracts structural data.
 */

import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Default glob patterns for source files.
 */
const DEFAULT_INCLUDE = ['**/*.tsx', '**/*.ts', '**/*.astro', '**/*.mjs', '**/*.js'];

/**
 * Default exclusion patterns.
 */
const DEFAULT_EXCLUDE = ['node_modules', 'dist', '.git', '.astro', 'cdk.out'];

/**
 * Configuration for the parser.
 * @typedef {Object} ParserConfig
 * @property {string}   root        - Absolute path to scan root
 * @property {string[]} [include]   - Glob-like patterns (simple suffix match)
 * @property {string[]} [exclude]   - Directory/file names to skip
 */

/**
 * Result of scanning.
 * @typedef {Object} ScanResult
 * @property {string[]} files  - Absolute file paths
 */

/**
 * Find all source files under root matching include/exclude.
 * @param {ParserConfig} config
 * @returns {ScanResult}
 */
export function scanFiles(config) {
  const root = config.root;
  const include = config.include || DEFAULT_INCLUDE;
  const exclude = new Set(config.exclude || DEFAULT_EXCLUDE);
  const files = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (exclude.has(entry.name)) continue;
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const matches = include.some(pattern => {
          if (pattern.startsWith('**/*.')) {
            const ext = '.' + pattern.slice(5);
            return entry.name.endsWith(ext);
          }
          return entry.name === pattern;
        });
        if (matches) {
          files.push(fullPath);
        }
      }
    }
  }

  walk(root);
  files.sort();
  return { files };
}

/**
 * Create a TypeScript program and get type-checker for deeper analysis.
 * @param {string[]} filePaths - Absolute paths to source files
 * @returns {{program:ts.Program,checker:ts.TypeChecker}|null}
 */
export function createProgram(filePaths) {
  if (filePaths.length === 0) return null;
  const compilerOptions = {
    noEmit: true,
    allowJs: true,
    jsx: ts.JsxEmit.Preserve,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    strict: false,
    skipLibCheck: true,
    resolveJsonModule: true,
    isolatedModules: true,
  };
  const program = ts.createProgram(filePaths, compilerOptions);
  return { program, checker: program.getTypeChecker() };
}

/**
 * Parse a single source file and return AST-based extractions.
 * @param {string} filePath    - Absolute path to source file
 * @param {string} root        - Scan root (for relative paths)
 * @returns {import('../shared/types.mjs').ComponentRecord[]}
 */
export function parseFile(filePath, root) {
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

  const components = [];
  const visited = new Set();

  function visit(node, parentName) {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
      const name = node.name ? node.name.text : (parentName || '(anonymous)');
      if (!visited.has(name)) {
        visited.add(name);
        const comp = extractComponentInfo(node, sourceFile, relativePath, name);
        if (comp) components.push(comp);
      }
    }

    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (decl.initializer &&
            (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) &&
            ts.isIdentifier(decl.name)) {
          const name = decl.name.text;
          if (!visited.has(name)) {
            visited.add(name);
            const comp = extractComponentInfo(decl.initializer, sourceFile, relativePath, name);
            if (comp) components.push(comp);
          }
        }
      }
    }

    if (ts.isExportAssignment(node)) {
      // export default expression
      if (ts.isIdentifier(node.expression)) {
        const name = node.expression.text;
        if (!visited.has(name)) {
          visited.add(name);
          components.push({
            name,
            file: relativePath,
            exported: true,
            isDefault: true,
          });
        }
      }
    }

    // Handle top-level export declarations
    if (ts.isExportDeclaration(node) && node.exportClause) {
      // Named export { ... }
    }

    ts.forEachChild(node, (child) => visit(child, ''));
  }

  // First pass: collect declarations & exports
  for (const stmt of sourceFile.statements) {
    visit(stmt, '');
  }

  // Second pass: look for JSX in the entire file to fill in component detail
  // This handles default exports of arrow functions
  ts.forEachChild(sourceFile, (node) => walkJsx(node, components, relativePath, sourceFile));

  return components;
}

/**
 * Walk a node looking for JSX elements and component details.
 */
function walkJsx(node, components, relativePath, sourceFile) {
  if (!node) return;
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
    const tagName = ts.isJsxFragment(node)
      ? 'Fragment'
      : ts.isJsxSelfClosingElement(node)
        ? node.tagName.getText(sourceFile)
        : node.openingElement.tagName.getText(sourceFile);
    // We'll collect JSX tags globally — handled in parseComponentDetails
  }
  ts.forEachChild(node, (child) => walkJsx(child, components, relativePath, sourceFile));
}

/**
 * Extract component info from a function/arrow node, checking if it returns JSX.
 */
function extractComponentInfo(node, sourceFile, relativePath, name) {
  const result = {
    name,
    file: relativePath,
    line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
    jsxTags: [],
    children: [],
    classTokens: [],
    textSnippets: [],
    routeLinks: [],
  };

  // Check if this is likely a React component (returns JSX)
  const body = node.body;
  if (!body) return null;

  let hasJSX = false;

  function searchNode(n) {
    if (!n) return;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) {
      hasJSX = true;
      const tagName = ts.isJsxFragment(n)
        ? 'Fragment'
        : ts.isJsxSelfClosingElement(n)
          ? n.tagName.getText(sourceFile)
          : n.openingElement.tagName.getText(sourceFile);
      if (!result.jsxTags.includes(tagName)) {
        result.jsxTags.push(tagName);
      }

      // Check for className
      const attrs = ts.isJsxFragment(n) ? [] :
        ts.isJsxSelfClosingElement(n) ? n.attributes.properties :
        n.openingElement.attributes.properties;
      for (const attr of attrs) {
        if (ts.isJsxAttribute(attr) && attr.name.text === 'className' && attr.initializer) {
          if (ts.isStringLiteral(attr.initializer)) {
            const tokens = attr.initializer.text.split(/\s+/).filter(Boolean);
            for (const t of tokens) {
              if (!result.classTokens.includes(t)) result.classTokens.push(t);
            }
          }
        }
        // Check for href or to (route links)
        if (ts.isJsxAttribute(attr) && (attr.name.text === 'href' || attr.name.text === 'to') && attr.initializer) {
          if (ts.isStringLiteral(attr.initializer)) {
            const val = attr.initializer.text;
            if (val.startsWith('/') && !result.routeLinks.includes(val)) {
              result.routeLinks.push(val);
            }
          }
        }
      }

      // Extract text content
      if (!ts.isJsxSelfClosingElement(n) && !ts.isJsxFragment(n)) {
        for (const child of n.children) {
          if (ts.isJsxText(child)) {
            const txt = child.text.trim();
            if (txt && !result.textSnippets.includes(txt)) {
              result.textSnippets.push(txt);
            }
          }
        }
      }

      // Identify uppercase tag names as child components
      if (tagName[0] === tagName[0]?.toUpperCase() && tagName !== 'Fragment') {
        if (!result.children.includes(tagName)) {
          result.children.push(tagName);
        }
      }
    }
    ts.forEachChild(n, searchNode);
  }

  searchNode(body);

  if (!hasJSX) return null;

  result.jsxTags.sort();
  result.children.sort();
  result.classTokens.sort();
  result.textSnippets.sort();
  result.routeLinks.sort();

  return result;
}

/**
 * Extract import records from a source file.
 * @param {string} filePath - Absolute path
 * @param {string} root     - Scan root
 * @returns {import('../shared/types.mjs').ImportRecord[]}
 */
export function extractImports(filePath, root) {
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

  const imports = [];

  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const source = stmt.moduleSpecifier.text;
      const line = sourceFile.getLineAndCharacterOfPosition(stmt.getStart()).line + 1;

      if (stmt.importClause) {
        // Default import (e.g., import React from 'react')
        if (stmt.importClause.name) {
          imports.push({
            source,
            imported: 'default',
            local: stmt.importClause.name.text,
            file: relativePath,
            line,
          });
        }
        // Named imports (e.g., import { useState } from 'react')
        if (stmt.importClause.namedBindings && ts.isNamedImports(stmt.importClause.namedBindings)) {
          for (const spec of stmt.importClause.namedBindings.elements) {
            imports.push({
              source,
              imported: spec.name.text,
              local: spec.propertyName ? spec.propertyName.text : spec.name.text,
              file: relativePath,
              line,
            });
          }
        }
        // Namespace import (e.g., import * as X from 'y')
        if (stmt.importClause.namedBindings && ts.isNamespaceImport(stmt.importClause.namedBindings)) {
          imports.push({
            source,
            imported: '*',
            local: stmt.importClause.namedBindings.name.text,
            file: relativePath,
            line,
          });
        }
      }
    }
  }

  return imports;
}

/**
 * Extract i18n `t()` calls from a source file.
 * Looks for patterns like `t("key")`, `t('key')`, or `t(`key`)`.
 * @param {string} filePath
 * @param {string} root
 * @returns {import('../shared/types.mjs').I18nKeyRecord[]}
 */
export function extractI18nKeys(filePath, root) {
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

  const keys = [];

  function visit(node) {
    if (ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        (node.expression.text === 't' || node.expression.text === '_') &&
        node.arguments.length > 0 &&
        ts.isStringLiteral(node.arguments[0])) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      keys.push({
        key: node.arguments[0].text,
        file: relativePath,
        line,
        context: 't()',
      });
    }
    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
  return keys;
}

/**
 * Extract class tokens from JSX className attributes.
 * @param {string} filePath
 * @param {string} root
 * @returns {import('../shared/types.mjs').ClassTokenRecord[]}
 */
export function extractClassTokens(filePath, root) {
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

  const tokenMap = new Map();

  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.text === 'className' && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) {
        const tokens = node.initializer.text.split(/\s+/).filter(Boolean);
        for (const t of tokens) {
          tokenMap.set(t, (tokenMap.get(t) || 0) + 1);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);

  return Array.from(tokenMap.entries())
    .map(([token, count]) => ({ token, file: relativePath, count }))
    .sort((a, b) => a.token.localeCompare(b.token));
}

/**
 * Extract link records (href or to attributes) from JSX elements.
 * @param {string} filePath
 * @param {string} root
 * @returns {import('../shared/types.mjs').LinkRecord[]}
 */
export function extractLinks(filePath, root) {
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

  const links = [];

  function visit(node) {
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && !ts.isJsxFragment(node)) {
      const tagName = ts.isJsxSelfClosingElement(node)
        ? node.tagName.getText(sourceFile)
        : node.openingElement.tagName.getText(sourceFile);

      const attrs = ts.isJsxSelfClosingElement(node)
        ? node.attributes.properties
        : node.openingElement.attributes.properties;

      let to = null;
      let line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      let text = '';

      // Extract link text for <a> tags
      if (!ts.isJsxSelfClosingElement(node)) {
        for (const child of node.children) {
          if (ts.isJsxText(child)) {
            text = child.text.trim();
          }
        }
      }

      for (const attr of attrs) {
        if (ts.isJsxAttribute(attr) && (attr.name.text === 'href' || attr.name.text === 'to') && attr.initializer) {
          if (ts.isStringLiteral(attr.initializer)) {
            to = attr.initializer.text;
          }
        }
      }

      if (to && (to.startsWith('/') || to.startsWith('http'))) {
        links.push({ to, file: relativePath, line, tag: tagName, text: text || undefined });
      }
    }
    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
  return links;
}

export default {
  scanFiles,
  createProgram,
  parseFile,
  extractImports,
  extractI18nKeys,
  extractClassTokens,
  extractLinks,
};