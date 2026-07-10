/**
 * @fileoverview Shared type definitions for the UX extraction toolkit.
 * All output records follow these schemas for deterministic, cross-project
 * compatibility.
 */

/**
 * @typedef {Object} ComponentRecord
 * @property {string}  name        - Component name (PascalCase identifier)
 * @property {string}  file        - Relative file path from scan root
 * @property {boolean} [exported]  - True if the component is exported (named or default)
 * @property {boolean} [isDefault] - True if export is `export default`
 * @property {number}  [line]      - Line number where component is defined
 * @property {string[]} [jsxTags]  - JSX tag names used in the component
 * @property {string[]} [children] - Child component names referenced
 * @property {string[]} [classTokens] - className string fragments
 * @property {string[]} [textSnippets] - Text content extracted from JSX
 * @property {string[]} [routeLinks] - Route path strings (<Link to="..."> or href="...")
 */

/**
 * @typedef {Object} RouteRecord
 * @property {string} path      - Route path string (e.g. "/floor", "/kitchen")
 * @property {string} file      - File where the route was declared
 * @property {string} source    - "route" (direct <Route>), "wrapper" (Astro wrapper gen), "link"
 * @property {string} [component] - Component name associated with this route
 * @property {number} [line]    - Line number
 */

/**
 * @typedef {Object} ImportRecord
 * @property {string} source    - Import module specifier
 * @property {string} imported  - Imported name (default or named)
 * @property {string} [local]   - Local alias if renamed
 * @property {string} file      - File containing the import
 * @property {number} [line]    - Line number
 */

/**
 * @typedef {Object} LinkRecord
 * @property {string} to        - Target path or URL
 * @property {string} file      - File containing the link
 * @property {number} [line]    - Line number
 * @property {string} [tag]     - Tag name (e.g. "a", "Link", "NavLink")
 * @property {string} [text]    - Visible link text if available
 */

/**
 * @typedef {Object} I18nKeyRecord
 * @property {string} key       - i18n key string (e.g. "sala.goDelivery")
 * @property {string} file      - File containing the key
 * @property {number} [line]    - Line number
 * @property {string} context   - "t()" call, "key={...}", or "text" (untranslated-looking)
 */

/**
 * @typedef {Object} ClassTokenRecord
 * @property {string} token     - Class name string
 * @property {string} file      - File containing the class
 * @property {number} [count]   - Occurrence count
 */

/**
 * @typedef {Object} IssueRecord
 * @property {"error"|"warning"|"info"} severity
 * @property {string} code      - Machine-readable issue code (e.g. "LEGACY_ROUTE", "MISSING_ROUTE")
 * @property {string} file      - File where issue was detected
 * @property {number} [line]    - Line number
 * @property {string} message   - Human-readable description
 * @property {string} evidence  - Relevant code snippet
 * @property {string} [suggestion] - Recommended fix
 */

/**
 * @typedef {Object} ExtractorOutput
 * @property {number}                   schemaVersion  - Always 1
 * @property {string}                   root          - Scan root (relative or absolute)
 * @property {string}                   [generatedAt] - ISO timestamp (omitted in deterministic mode)
 * @property {ComponentRecord[]}        components
 * @property {ImportRecord[]}           imports
 * @property {RouteRecord[]}            routes
 * @property {LinkRecord[]}             links
 * @property {I18nKeyRecord[]}          i18nKeys
 * @property {ClassTokenRecord[]}       classTokens
 * @property {IssueRecord[]}            issues
 * @property {{files:number,components:number,routes:number,issues:number,errors:number,warnings:number}} summary
 */

export default {};