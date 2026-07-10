# configs-cli/ — Per-project configuration files (NOT versioned)

This directory holds per-project configuration files for ux-extract.
**Contents are git-ignored and will never be pushed to the public repository.**

## Supported formats

- `.toml` (preferred for human-edited configs with secrets)
- `.json`

## File naming

One file per project/client:

```
configs-cli/
├── .gitkeep
├── README.md            # this file (versioned)
├── client-a.toml        # git-ignored
├── client-b.toml        # git-ignored
└── ...
```

## TOML schema

```toml
# ── Project identity ──────────────────────────────────
project = "my-project"
root    = "/absolute/path/to/project"

# ── Legacy route mappings ─────────────────────────────
# Routes that were renamed; ux-extract will flag links
# pointing to old paths and suggest the canonical version.
[legacyRoutes]
"/old-dashboard" = "/dashboard"
"/old-settings"  = "/settings"

# ── Target URL (for future html/runtime layers) ───────
targetUrl = "https://my-project.example.com"

# ── Database adapter (for future db layer) ────────────
# Minimal-privilege access for querying real state.
# NEVER commit real credentials — this section is git-ignored.
[db]
type         = "cloudflare-d1"
binding      = "DB"
databaseId   = "[REDACTED]"
accountId    = "[REDACTED]"
apiToken     = "[REDACTED]"

# ── API endpoints (for future runtime layer) ──────────
[api]
baseUrl      = "https://my-project.example.com/api"
healthPath   = "/health"
authToken    = "[REDACTED]"
```

## Usage

```bash
# Use a TOML config file
node cli.mjs --config configs-cli/client-a.toml --format markdown

# Use a JSON config file
node cli.mjs --config configs-cli/client-b.json --format json

# Or pass options directly via CLI
node cli.mls --root /path/to/project --legacy-map '{"\/old":"\/new"}' --format json
```

## Security

- All files in this directory are git-ignored except `.gitkeep` and `README.md`.
- Never paste real tokens, database IDs, or passwords into the ux-extract source code.
- Each project config is self-contained and can be shared securely out-of-band.
- The db section is designed for read-only diagnostic queries with minimum privilege.
