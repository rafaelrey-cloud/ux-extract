# configs-cli/ — Project-specific configurations (NOT versioned)

This directory holds per-project configuration files for ux-extract.
**Contents are git-ignored and will never be pushed to the public repository.**

## Structure

```
configs-cli/
├── .gitkeep          # keeps dir in git
├── my-project.json   # legacy route map, DB access, target URL
├── other-project.json
└── ...
```

## Config file schema

```json
{
  "project": "my-project",
  "root": "/absolute/path/to/project",
  "legacyRoutes": {
    "/old-path": "/new-path"
  },
  "targetUrl": "https://my-project.example.com",
  "dbAdapter": {
    "type": "cloudflare-d1",
    "binding": "DB",
    "databaseId": "[REDACTED]",
    "accountId": "[REDACTED]"
  }
}
```

## Usage

```bash
# Use a config file
node cli.mjs --config configs-cli/my-project.json --format markdown

# Or pass legacy map directly
node cli.mjs --root /path/to/project --legacy-map '{"\/old":"\/new"}' --format json
```

All secrets, tokens, database IDs and credentials live here — never in the
ux-extract source code.
