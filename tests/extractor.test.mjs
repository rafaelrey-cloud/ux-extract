/**
 * @fileoverview Tests for the UX extraction toolkit.
 * Uses Node.js built-in test runner (node --test).
 * Creates a small fixture directory for isolated testing.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UX_EXTRACT_DIR = path.resolve(__dirname, '..');

// ── Fixture helpers ────────────────────────────────────────────────────

let tmpDir;

/** Create a temporary fixture directory with sample source files. */
function setupFixture() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ux-extract-test-'));

  // Simple TSX component
  fs.writeFileSync(path.join(tmpDir, 'Button.tsx'), `
import React from 'react';
import { Link } from 'react-router-dom';

interface ButtonProps {
  label: string;
  to?: string;
}

export default function Button({ label, to }: ButtonProps) {
  return (
    <div className="btn-wrapper flex items-center">
      {to ? (
        <Link to={to} className="btn-primary">{label}</Link>
      ) : (
        <button className="btn-primary" onClick={() => {}}>{label}</button>
      )}
    </div>
  );
}
`.trimStart());

  // Component using i18n and old sala link
  fs.writeFileSync(path.join(tmpDir, 'LegacyNav.tsx'), `
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function LegacyNav() {
  const { t } = useTranslation();

  return (
    <nav>
      <Link to="/sala">Sala</Link>
      <a href="/cocina">Cocina</a>
      <Link to="/floor">{t('floor.title')}</Link>
      <a href="/kitchen">{t('kitchen.title')}</a>
      <span>sala.goDelivery</span>
    </nav>
  );
}
`.trimStart());

  // Simple Route file
  fs.writeFileSync(path.join(tmpDir, 'AppRoutes.tsx'), `
import { Routes, Route } from 'react-router-dom';
import Sala from './Sala';
import Cocina from './Cocina';
import Index from './Index';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/floor" element={<Sala />} />
      <Route path="/kitchen" element={<Cocina />} />
    </Routes>
  );
}
`.trimStart());

  // RouteHydrator-like mapping
  fs.writeFileSync(path.join(tmpDir, 'RouteHydrator.tsx'), `
const canonicalPaths = {
  Sala: "/floor",
  Cocina: "/kitchen",
};
`.trimStart());

  // Astro-style file
  fs.writeFileSync(path.join(tmpDir, 'index.astro'), `
---
import BaseLayout from '../layouts/BaseLayout.astro';
import RouteHydrator from '../components/RouteHydrator';
---
<BaseLayout title="Home" lang="en">
  <RouteHydrator page="Index" path="/" locale="en" client:load />
</BaseLayout>
`.trimStart());

  // Simple JS utility
  fs.writeFileSync(path.join(tmpDir, 'utils.js'), `
export function greet(name) {
  return "Hello, " + name;
}
`.trimStart());

  // A file with an interactive <a> missing href
  fs.writeFileSync(path.join(tmpDir, 'BrokenLink.tsx'), `
export default function BrokenLink() {
  return (
    <div>
      <a>Click me</a>
      <Link>Navigate</Link>
    </div>
  );
}
`.trimStart());

  return tmpDir;
}

function teardownFixture() {
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('UX Extractor', () => {
  let fixtureRoot;

  before(() => {
    fixtureRoot = setupFixture();
  });

  after(() => {
    teardownFixture();
  });

  // ── Scan tests ──────────────────────────────────────────────────────
  describe('scanFiles', () => {
    it('should find .tsx, .ts, .astro, .mjs, .js files', async () => {
      const { scanFiles: sf } = await import(path.join(UX_EXTRACT_DIR, 'tsx/parser.mjs'));
      const result = sf({ root: fixtureRoot });
      const relFiles = result.files.map(f => path.relative(fixtureRoot, f));
      assert.ok(relFiles.includes('Button.tsx'));
      assert.ok(relFiles.includes('LegacyNav.tsx'));
      assert.ok(relFiles.includes('AppRoutes.tsx'));
      assert.ok(relFiles.includes('RouteHydrator.tsx'));
      assert.ok(relFiles.includes('index.astro'));
      assert.ok(relFiles.includes('utils.js'));
      assert.ok(relFiles.includes('BrokenLink.tsx'));
    });
  });

  // ── Import extraction ───────────────────────────────────────────────
  describe('extractImports', () => {
    it('should extract imports from Button.tsx', async () => {
      const { extractImports } = await import(path.join(UX_EXTRACT_DIR, 'tsx/parser.mjs'));
      const filePath = path.join(fixtureRoot, 'Button.tsx');
      const imports = extractImports(filePath, fixtureRoot);
      const reactImport = imports.find(i => i.source === 'react');
      assert.ok(reactImport);
      assert.equal(reactImport.imported, 'default');
      assert.equal(reactImport.local, 'React');

      const linkImport = imports.find(i => i.source === 'react-router-dom' && i.imported === 'Link');
      assert.ok(linkImport);
      assert.equal(linkImport.local, 'Link');
    });

    it('should extract i18n t() keys from LegacyNav.tsx', async () => {
      const { extractI18nKeys } = await import(path.join(UX_EXTRACT_DIR, 'tsx/parser.mjs'));
      const filePath = path.join(fixtureRoot, 'LegacyNav.tsx');
      const keys = extractI18nKeys(filePath, fixtureRoot);
      assert.ok(keys.some(k => k.key === 'floor.title'));
      assert.ok(keys.some(k => k.key === 'kitchen.title'));
    });
  });

  // ── Route extraction ────────────────────────────────────────────────
  describe('extractRoutes', () => {
    it('should extract <Route> declarations', async () => {
      const { extractRoutes } = await import(path.join(UX_EXTRACT_DIR, 'tsx/routes.mjs'));
      const filePath = path.join(fixtureRoot, 'AppRoutes.tsx');
      const routes = extractRoutes(filePath, fixtureRoot);
      assert.ok(routes.some(r => r.path === '/' && r.component === 'Index'));
      assert.ok(routes.some(r => r.path === '/floor' && r.component === 'Sala'));
      assert.ok(routes.some(r => r.path === '/kitchen' && r.component === 'Cocina'));
    });

    it('should extract canonical path mappings', async () => {
      const { extractRoutes } = await import(path.join(UX_EXTRACT_DIR, 'tsx/routes.mjs'));
      const filePath = path.join(fixtureRoot, 'RouteHydrator.tsx');
      const routes = extractRoutes(filePath, fixtureRoot);
      assert.ok(routes.some(r => r.path === '/floor' && r.component === 'Sala'));
      assert.ok(routes.some(r => r.path === '/kitchen' && r.component === 'Cocina'));
    });
  });

  // ── Link extraction ─────────────────────────────────────────────────
  describe('extractLinks', () => {
    it('should extract href and to links', async () => {
      const { extractLinks } = await import(path.join(UX_EXTRACT_DIR, 'tsx/parser.mjs'));
      const filePath = path.join(fixtureRoot, 'LegacyNav.tsx');
      const links = extractLinks(filePath, fixtureRoot);
      assert.ok(links.some(l => l.to === '/sala' && l.tag === 'Link'));
      assert.ok(links.some(l => l.to === '/cocina' && l.tag === 'a'));
      assert.ok(links.some(l => l.to === '/floor'));
      assert.ok(links.some(l => l.to === '/kitchen'));
    });
  });

  // ── Issue detection ─────────────────────────────────────────────────
  describe('detectIssues', () => {
    it('should detect legacy route /sala and /cocina', async () => {
      const { detectIssues } = await import(path.join(UX_EXTRACT_DIR, 'tsx/issues.mjs'));
      const filePath = path.join(fixtureRoot, 'LegacyNav.tsx');
      const issues = detectIssues(filePath, fixtureRoot);
      const legacyIssues = issues.filter(i => i.code === 'LEGACY_ROUTE');
      assert.equal(legacyIssues.length, 2);
      assert.ok(legacyIssues.some(i => i.evidence === '"/sala"'));
      assert.ok(legacyIssues.some(i => i.evidence === '"/cocina"'));
      assert.equal(legacyIssues[0].severity, 'error');
    });

    it('should detect untranslated i18n key', async () => {
      const { detectIssues } = await import(path.join(UX_EXTRACT_DIR, 'tsx/issues.mjs'));
      const filePath = path.join(fixtureRoot, 'LegacyNav.tsx');
      const issues = detectIssues(filePath, fixtureRoot);
      const untranslated = issues.filter(i => i.code === 'UNTRANSLATED');
      assert.equal(untranslated.length, 1);
      assert.ok(untranslated[0].evidence.includes('sala.goDelivery'));
    });

    it('should detect missing href on interactive elements', async () => {
      const { detectIssues } = await import(path.join(UX_EXTRACT_DIR, 'tsx/issues.mjs'));
      const filePath = path.join(fixtureRoot, 'BrokenLink.tsx');
      const issues = detectIssues(filePath, fixtureRoot);
      const missingLink = issues.filter(i => i.code === 'MISSING_LINK');
      assert.equal(missingLink.length, 2);
      assert.equal(missingLink[0].severity, 'warning');
    });
  });

  // ── Output formatting ───────────────────────────────────────────────
  describe('formatOutput', () => {
    it('should produce valid JSON', async () => {
      const { formatOutput, computeSummary } = await import(path.join(UX_EXTRACT_DIR, 'shared/output.mjs'));
      const data = {
        schemaVersion: 1,
        root: '/test',
        files: ['a.tsx'],
        components: [],
        imports: [],
        routes: [],
        links: [],
        i18nKeys: [],
        classTokens: [],
        issues: [],
        summary: { files: 0, components: 0, routes: 0, issues: 0, errors: 0, warnings: 0 },
      };
      data.summary = computeSummary(data);
      const json = formatOutput(data, 'json');
      const parsed = JSON.parse(json);
      assert.equal(parsed.schemaVersion, 1);
    });

    it('should produce Markdown with sections', async () => {
      const { formatOutput, computeSummary } = await import(path.join(UX_EXTRACT_DIR, 'shared/output.mjs'));
      const data = {
        schemaVersion: 1,
        root: '/test',
        files: ['a.tsx'],
        components: [{ name: 'Test', file: 'a.tsx', jsxTags: ['div'] }],
        imports: [],
        routes: [{ path: '/test', file: 'a.tsx', source: 'route' }],
        links: [],
        i18nKeys: [],
        classTokens: [],
        issues: [{ severity: 'error', code: 'TEST', file: 'a.tsx', line: 1, message: 'test issue', evidence: 'x' }],
        summary: { files: 0, components: 0, routes: 0, issues: 0, errors: 0, warnings: 0 },
      };
      data.summary = computeSummary(data);
      const md = formatOutput(data, 'markdown');
      assert.ok(md.includes('# UX Extraction Report'));
      assert.ok(md.includes('| error |'));
      assert.ok(md.includes('`TEST`'));
      assert.ok(md.includes('**Test**'));
    });
  });

  // ── Class token extraction ──────────────────────────────────────────
  describe('extractClassTokens', () => {
    it('should extract className tokens from Button.tsx', async () => {
      const { extractClassTokens } = await import(path.join(UX_EXTRACT_DIR, 'tsx/parser.mjs'));
      const filePath = path.join(fixtureRoot, 'Button.tsx');
      const tokens = extractClassTokens(filePath, fixtureRoot);
      assert.ok(tokens.some(t => t.token === 'btn-wrapper'));
      assert.ok(tokens.some(t => t.token === 'btn-primary'));
      assert.ok(tokens.some(t => t.token === 'flex'));
      assert.ok(tokens.some(t => t.token === 'items-center'));
    });
  });

  // ── CLI integration ─────────────────────────────────────────────────
  describe('CLI', () => {
    it('should produce JSON output from fixture', async () => {
      const cliPath = path.join(UX_EXTRACT_DIR, 'cli.mjs');
      const { execSync } = await import('node:child_process');
      const result = execSync(
        `node "${cliPath}" --root "${fixtureRoot}" --format json --deterministic`,
        { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
      );
      const parsed = JSON.parse(result);
      assert.equal(parsed.schemaVersion, 1);
      assert.ok(Array.isArray(parsed.components));
      assert.ok(Array.isArray(parsed.issues));
      assert.ok(Array.isArray(parsed.routes));
      assert.ok(parsed.files.length > 5);
      assert.ok(parsed.components.length >= 4); // Button, LegacyNav, AppRoutes, BrokenLink
      // Should have LEGACY_ROUTE issues
      const legacyIssues = parsed.issues.filter(i => i.code === 'LEGACY_ROUTE');
      assert.ok(legacyIssues.length >= 2);
      // Should have UNTRANSLATED issues
      const untranslated = parsed.issues.filter(i => i.code === 'UNTRANSLATED');
      assert.ok(untranslated.length >= 1);
    });

    it('should produce Markdown output', async () => {
      const cliPath = path.join(UX_EXTRACT_DIR, 'cli.mjs');
      const { execSync } = await import('node:child_process');
      const result = execSync(
        `node "${cliPath}" --root "${fixtureRoot}" --format markdown --deterministic`,
        { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
      );
      assert.ok(result.includes('# UX Extraction Report'));
      assert.ok(result.includes('| error |'));
    });
  });
});