# UX Extract — Source-based UX Extraction Toolkit

A reusable, zero-dependency source-only UX analysis tool that extracts structured data from React/TSX/Astro codebases using the TypeScript compiler API. No browser, no screenshots, no runtime dependencies — just `typescript` (already a devDependency).

## Quick Start

```bash
# Scan a project from its root, output JSON report
node cli.mjs --root /path/to/project --format json

# Use a project config file
node cli.mjs --config configs-cli/my-project.toml --format markdown

# Generate ASCII wireframe from a component
node cli.mjs --root /path/to/project --layout LoginPage --format ascii
```

Or via npm scripts:

```bash
npm run ux:extract
npm run ux:validate
```

## CLI Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--root` | path | `cwd` | Scan root directory |
| `--format` | `json`\|`markdown` | `json` | Output format |
| `--out` | path | stdout | Write output to file |
| `--include` | string[] | `**/*.tsx,**/*.ts,**/*.astro,**/*.mjs,**/*.js` | Source patterns (repeatable or comma-separated) |
| `--deterministic` | flag | `false` | Omit timestamp; sort all arrays stably |
| `--fail-on` | `error`\|`warning`\|`never` | `never` | Exit code threshold |
| `--legacy-map` | JSON string | `{}` | Custom legacy route mapping (e.g. `{"/old":"/new"}`) |
| `--help` | flag | | Show help |

## Output Schema

### JSON Output

```json
{
  "schemaVersion": 1,
  "root": ".",
  "generatedAt": "2025-07-10T...",
  "files": ["src/App.tsx", ...],
  "components": [
    {
      "name": "Dashboard",
      "file": "src/pages/Dashboard.tsx",
      "exported": true,
      "isDefault": true,
      "line": 10,
      "jsxTags": ["div", "Link", "h1"],
      "children": ["DashboardCard", "StatsPanel"],
      "classTokens": ["dashboard-container", "p-4"],
      "textSnippets": ["Dashboard View"],
      "routeLinks": ["/dashboard"]
    }
  ],
  "imports": [
    { "source": "react-router-dom", "imported": "Link", "local": "Link", "file": "src/App.tsx", "line": 3 }
  ],
  "routes": [
    { "path": "/dashboard", "file": "src/App.tsx", "source": "route", "component": "Dashboard", "line": 15 }
  ],
  "links": [
    { "to": "/dashboard", "file": "src/Nav.tsx", "line": 5, "tag": "Link", "text": "Dashboard" }
  ],
  "i18nKeys": [
    { "key": "dashboard.title", "file": "src/Nav.tsx", "line": 6, "context": "t()" }
  ],
  "classTokens": [
    { "token": "btn-primary", "file": "src/Button.tsx", "count": 2 }
  ],
  "issues": [
    {
      "severity": "error",
      "code": "LEGACY_ROUTE",
      "file": "src/LegacyNav.tsx",
      "line": 8,
      "message": "Link or reference to legacy path \"/old\" (canonical: \"/new\")",
      "evidence": "\"/old\"",
      "suggestion": "Replace with \"/new\""
    }
  ],
  "summary": {
    "files": 42,
    "components": 18,
    "routes": 12,
    "issues": 3,
    "errors": 2,
    "warnings": 1
  }
}
```

## Issue Codes

| Code | Severity | Description |
|------|----------|-------------|
| `LEGACY_ROUTE` | error | Link points to old path; canonical version exists |
| `MISSING_ROUTE` | error | Route declared in Astro wrappers but missing from RouteHydrator |
| `UNTRANSLATED` | error | Text matches i18n key pattern (`section.word`) — likely hardcoded |
| `MISSING_LINK` | warning | Interactive element (`<a>`, `<Link>`) without `href`/`to` |

## Architecture

```
src/ux-extract/
├── cli.mjs                  # CLI entry point (executable)
├── README.md                # This file
├── shared/
│   ├── types.mjs            # Shared type definitions (JSDoc)
│   └── output.mjs           # JSON and Markdown formatters
├── tsx/
│   ├── parser.mjs           # TSX/TS/Astro parser (TypeScript compiler API)
│   ├── routes.mjs           # Route declaration extraction
│   └── issues.mjs           # Deterministic issue detection
└── tests/
    └── extractor.test.mjs   # Test suite (Node built-in test runner)
```

## Reusability

The toolkit is designed to be:

1. **Standalone** — No npm install needed beyond `typescript` (already in devDependencies).
2. **Configurable** — `--root` argument lets it scan any project.
3. **Deterministic** — `--deterministic` flag ensures reproducible output (no timestamps, stable sort).
4. **Extensible** — Add new issue checks in `issues.mjs`, new formatters in `output.mjs`, new AST extractors in `parser.mjs`.

## Future Layers

- **html/** — DOM-based extraction from rendered HTML (for SSR pages)
- **runtime/** — Runtime instrumentation for dynamic route discovery
- **db/** — Persistence of extraction results across runs (diff tracking)
- **visual/** — Screenshot-based visual regression detection (requires Playwright/Puppeteer)

## Development

```bash
# Run tests
node --test src/ux-extract/tests/extractor.test.mjs

# Run against the project
node src/ux-extract/cli.mjs --root . --format json --deterministic

# Run with custom legacy map
node src/ux-extract/cli.mjs --root . --legacy-map '{"\/old":"\/new"}'
```