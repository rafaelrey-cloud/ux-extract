/**
 * @fileoverview Output formatting for the UX extraction toolkit.
 * Supports JSON (default) and Markdown output formats.
 */

/**
 * Format the extraction output according to the requested format.
 * @param {import('./types.mjs').ExtractorOutput} data
 * @param {'json'|'markdown'} format
 * @returns {string}
 */
export function formatOutput(data, format) {
  switch (format) {
    case 'markdown':
      return formatMarkdown(data);
    case 'json':
    default:
      return JSON.stringify(data, null, 2);
  }
}

/**
 * Format extraction output as Markdown.
 * @param {import('./types.mjs').ExtractorOutput} data
 * @returns {string}
 */
function formatMarkdown(data) {
  const lines = [];

  lines.push('# UX Extraction Report');
  lines.push('');
  lines.push(`- **Root:** \`${data.root}\``);
  if (data.generatedAt) lines.push(`- **Generated:** ${data.generatedAt}`);
  lines.push(`- **Schema Version:** ${data.schemaVersion}`);
  lines.push('');

  // ── Summary ─────────────────────────────────────────────────────────
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric       | Count |`);
  lines.push(`|--------------|------:|`);
  lines.push(`| Files        | ${data.summary.files} |`);
  lines.push(`| Components   | ${data.summary.components} |`);
  lines.push(`| Routes       | ${data.summary.routes} |`);
  lines.push(`| Issues       | ${data.summary.issues} |`);
  lines.push(`| Errors       | ${data.summary.errors} |`);
  lines.push(`| Warnings     | ${data.summary.warnings} |`);
  lines.push('');

  // ── Issues ──────────────────────────────────────────────────────────
  if (data.issues.length > 0) {
    lines.push('## Issues');
    lines.push('');
    lines.push('| Severity | Code | File | Line | Message |');
    lines.push('|----------|------|------|------:|---------|');
    for (const issue of data.issues) {
      const file = issue.file || '';
      const line = issue.line != null ? String(issue.line) : '';
      const msg = issue.message.replace(/\|/g, '\\|');
      lines.push(`| ${issue.severity} | \`${issue.code}\` | \`${file}\` | ${line} | ${msg} |`);
    }
    lines.push('');
  }

  // ── Components ──────────────────────────────────────────────────────
  if (data.components.length > 0) {
    lines.push('## Components');
    lines.push('');
    for (const comp of data.components) {
      lines.push(`- **${comp.name}** in \`${comp.file}\`` +
        (comp.exported ? comp.isDefault ? ' (default export)' : ' (named export)' : ''));
      if (comp.jsxTags && comp.jsxTags.length > 0) {
        lines.push(`  - JSX tags: \`${comp.jsxTags.join('`, `')}\``);
      }
      if (comp.children && comp.children.length > 0) {
        lines.push(`  - Children: \`${comp.children.join('`, `')}\``);
      }
      if (comp.routeLinks && comp.routeLinks.length > 0) {
        lines.push(`  - Route links: \`${comp.routeLinks.join('`, `')}\``);
      }
    }
    lines.push('');
  }

  // ── Routes ──────────────────────────────────────────────────────────
  if (data.routes.length > 0) {
    lines.push('## Routes');
    lines.push('');
    lines.push('| Path | File | Source | Component |');
    lines.push('|------|------|--------|-----------|');
    for (const route of data.routes) {
      lines.push(`| \`${route.path}\` | \`${route.file}\` | ${route.source} | ${route.component || '-'} |`);
    }
    lines.push('');
  }

  // ── i18n Keys ──────────────────────────────────────────────────────
  if (data.i18nKeys.length > 0) {
    lines.push('## i18n Keys');
    lines.push('');
    lines.push('| Key | File | Context |');
    lines.push('|-----|------|---------|');
    for (const key of data.i18nKeys) {
      lines.push(`| \`${key.key}\` | \`${key.file}\` | ${key.context} |`);
    }
    lines.push('');
  }

  // ── Links ──────────────────────────────────────────────────────────
  if (data.links.length > 0) {
    lines.push('## Links');
    lines.push('');
    lines.push('| To | File | Tag |');
    lines.push('|----|------|-----|');
    for (const link of data.links) {
      lines.push(`| \`${link.to}\` | \`${link.file}\` | ${link.tag || '-'} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Compute summary counts from extracted data.
 * @param {import('./types.mjs').ExtractorOutput} data
 * @returns {{files:number,components:number,routes:number,issues:number,errors:number,warnings:number}}
 */
export function computeSummary(data) {
  const uniqueFiles = new Set([
    ...data.components.map(c => c.file),
    ...data.imports.map(i => i.file),
    ...data.routes.map(r => r.file),
    ...data.links.map(l => l.file),
    ...data.i18nKeys.map(k => k.file),
  ]);
  const errors = data.issues.filter(i => i.severity === 'error').length;
  const warnings = data.issues.filter(i => i.severity === 'warning').length;
  return {
    files: uniqueFiles.size,
    components: data.components.length,
    routes: data.routes.length,
    issues: data.issues.length,
    errors,
    warnings,
  };
}

export default { formatOutput, computeSummary };