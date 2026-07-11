/**
 * @fileoverview ASCII Layout Engine — renders DOM/component trees as
 * aligned box-drawing diagrams. Grid-based, mathematically precise.
 *
 * Output guaranteed aligned because every char position is calculated,
 * never hand-placed.
 */

// ── Glyphs ──────────────────────────────────────────────────────────
const G = {
  TL: '┌', TR: '┐', BL: '└', BR: '┘',
  H: '─', V: '│',
  LT: '├', RT: '┤', TT: '┬', BT: '┴',
  CR: '┼',
};

/**
 * wcwidth-style: return display width of a Unicode codepoint.
 * Emojis, CJK, and wide symbols → 2. Combining marks → 0. Rest → 1.
 */
function wcwidth(cp) {
  if (cp === 0) return 0;
  // Zero-width joiners, variation selectors, combining marks
  if (cp >= 0x200B && cp <= 0x200D) return 0; // ZWJ, ZWNJ, etc
  if (cp >= 0xFE00 && cp <= 0xFE0F) return 0; // variation selectors
  if (cp >= 0x0300 && cp <= 0x036F) return 0; // combining diacritics
  // Emoji range
  if (cp >= 0x1F000 && cp <= 0x1FFFF) return 2;
  if (cp >= 0x2600 && cp <= 0x27BF) return 2; // Misc symbols (includes many emoji)
  if (cp >= 0x2300 && cp <= 0x23FF) return 2; // Misc technical
  if (cp >= 0x2B50 && cp <= 0x2B55) return 2; // Star, etc
  // CJK
  if (cp >= 0x1100 && cp <= 0x115F) return 2;
  if (cp >= 0x2E80 && cp <= 0xA4CF) return 2;
  if (cp >= 0xAC00 && cp <= 0xD7A3) return 2;
  if (cp >= 0xF900 && cp <= 0xFAFF) return 2;
  if (cp >= 0xFE30 && cp <= 0xFE6F) return 2;
  if (cp >= 0xFF01 && cp <= 0xFF60) return 2;
  if (cp >= 0xFFE0 && cp <= 0xFFE6) return 2;
  if (cp >= 0x20000 && cp <= 0x2FFFD) return 2;
  if (cp >= 0x30000 && cp <= 0x3FFFD) return 2;
  return 1;
}

/**
 * Visual display width of a string — sum of wcwidth for each codepoint.
 */
function vw(s) {
  let w = 0;
  for (const ch of s) w += wcwidth(ch.codePointAt(0));
  return w;
}

/**
 * Write a string at grid position, tracking visual column width.
 * Wide characters (cw=2) are split across two grid cells so
 * each cell contributes exactly 1 JS char to the final join.
 */
function write(g, x, y, s) {
  let col = x;
  for (const ch of s) {
    if (col >= g[y].length) break;
    const cp = ch.codePointAt(0);
    const cw = wcwidth(cp);
    if (cw === 2 && ch.length === 2) {
      // Surrogate pair emoji: write high surrogate to cell[col],
      // low surrogate to cell[col+1] so join produces correct 2-char sequence
      g[y][col] = ch[0];
      if (col + 1 < g[y].length) g[y][col + 1] = ch[1];
    } else {
      g[y][col] = ch;
    }
    col += cw;
  }
}

/**
 * Write centered text accounting for visual width.
 */
function writeCenter(g, x, y, w, s, margin = 0) {
  const maxW = w - 2 * margin;
  const visualW = vw(s);
  let text = s;
  if (visualW > maxW) {
    // Truncate by visual width
    let tw = 0; let i = 0;
    for (const ch of s) {
      const cw = wcwidth(ch.codePointAt(0));
      if (tw + cw > maxW - 1) break;
      tw += cw; i++;
    }
    text = s.slice(0, i) + '…';
  }
  const start = x + margin + Math.floor((maxW - vw(text)) / 2);
  write(g, start, y, text);
}

/**
 * Pad a rendered line to a uniform visual width by appending spaces.
 */
function padVisual(line, targetWidth) {
  const current = vw(line);
  if (current >= targetWidth) return line;
  return line + ' '.repeat(targetWidth - current);
}

/**
 * Create an empty grid filled with spaces.
 * @param {number} cols
 * @param {number} rows
 * @returns {string[][]}
 */
function grid(cols, rows) {
  return Array.from({ length: rows }, () => Array(cols).fill(' '));
}

/**
 * Draw a box with optional title (centered in top border) and body lines.
 * @param {string[][]} g
 * @param {number} x - left column (0-indexed)
 * @param {number} y - top row (0-indexed)
 * @param {number} w - width in chars
 * @param {number} h - height in rows
 * @param {string} [title] - centered in top border
 * @param {string[]} [lines] - body text lines
 */
function box(g, x, y, w, h, title = '', lines = []) {
  // Top border
  g[y][x] = G.TL;
  for (let c = 1; c < w - 1; c++) g[y][x + c] = G.H;
  g[y][x + w - 1] = G.TR;

  // Title in top border — use write() for emoji width awareness
  if (title) {
    const maxTitleW = w - 4;
    const vwTitle = vw(title);
    let t = title;
    if (vwTitle > maxTitleW) {
      let tw = 0; let i = 0;
      for (const ch of title) {
        const cw = wcwidth(ch.codePointAt(0));
        if (tw + cw > maxTitleW - 1) break;
        tw += cw; i++;
      }
      t = title.slice(0, i) + '…';
    }
    const start = x + Math.floor((w - vw(t)) / 2);
    write(g, start, y, t);
  }

  // Side borders + body
  for (let r = 1; r < h - 1; r++) {
    g[y + r][x] = G.V;
    g[y + r][x + w - 1] = G.V;
  }

  // Body lines — draw inside the box, skipping the last row before bottom border
  for (let i = 0; i < lines.length && y + 2 + i < y + h - 2; i++) {
    const line = lines[i];
    if (!line) continue; // skip empty lines entirely
    if (line.startsWith('[') && line.endsWith(']')) {
      // Button: render as [Text] with tight brackets
      const btnText = line.slice(1, -1);
      const inner = btnText;
      const bw = inner.length + 2; // [ + text + ]
      const bx = x + Math.floor((w - bw) / 2);
      const by = y + 2 + i;
      g[by][bx] = '[';
      g[by][bx + bw - 1] = ']';
      write(g, bx + 1, by, inner);
    } else if (line.startsWith('>')) {
      // Left-aligned label
      const text = line.slice(1);
      write(g, x + 3, y + 2 + i, text);
    } else if (line.startsWith('_') && line.endsWith('_')) {
      // Input field
      const inner = line.slice(1, -1);
      const pad = 2;
      g[y + 2 + i][x + pad] = G.TL;
      g[y + 2 + i][x + w - 1 - pad] = G.TR;
      for (let c = pad + 1; c < w - 1 - pad; c++) g[y + 2 + i][x + c] = G.H;
      writeCenter(g, x, y + 2 + i, w, inner, pad);
    } else {
      writeCenter(g, x, y + 2 + i, w, line);
    }
  }

  // Bottom border
  g[y + h - 1][x] = G.BL;
  for (let c = 1; c < w - 1; c++) g[y + h - 1][x + c] = G.H;
  g[y + h - 1][x + w - 1] = G.BR;
}

/**
 * Draw a full-width section bar (single-line header/footer).
 */
function bar(g, x, y, w, title) {
  for (let c = 0; c < w; c++) g[y][x + c] = G.H;
  g[y][x] = G.TL;
  g[y][x + w - 1] = G.TR;
  if (title) {
    const t = ' ' + title + ' ';
    if (t.length <= w - 2) {
      const start = x + Math.floor((w - t.length) / 2);
      write(g, start, y, t);
    }
  }
}

/**
 * Draw a bottom bar.
 */
function barBottom(g, x, y, w, title) {
  for (let c = 0; c < w; c++) g[y][x + c] = G.H;
  g[y][x] = G.BL;
  g[y][x + w - 1] = G.BR;
  if (title) {
    const t = ' ' + title + ' ';
    if (t.length <= w - 2) {
      const start = x + Math.floor((w - t.length) / 2);
      write(g, start, y, t);
    }
  }
}

/**
 * Render grid to string, padding each line to uniform visual width.
 * @param {string[][]} g
 * @param {number} cols - target visual columns
 * @returns {string}
 */
function render(g, cols) {
  return g.map(row => padVisual(row.join(''), cols)).join('\n');
}

// ── Layout builder ───────────────────────────────────────────────────

/**
 * Build an ASCII layout for a login page.
 * @param {Object} opts
 * @param {number} opts.cols - viewport width (default 40 for mobile)
 * @param {Object} opts.data - component data
 * @returns {string}
 */
export function renderLoginLayout(opts = {}) {
  const cols = opts.cols || 40;
  const d = opts.data || {};

  const leftTitle = d.leftTitle || 'ADMIN';
  const leftDesc = d.leftDesc || 'Accede a tu cuenta';
  const emailPlaceholder = d.emailPlaceholder || 'admin@ejemplo.com';
  const passPlaceholder = d.passPlaceholder || '••••••••••';
  const leftBtn = d.leftBtn || 'Sign In';
  const demoBtn = d.demoBtn || 'Load Demo Credentials';

  const rightTitle = d.rightTitle || 'STAFF';
  const rightDesc = d.rightDesc || 'Ingreso operativo';
  const slugPlaceholder = d.slugPlaceholder || 'mi-sucursal';
  const pinPlaceholder = d.pinPlaceholder || '••••';
  const rightBtn = d.rightBtn || 'Enter In';

  const footer = d.footer || 'No account? Join waitlist';
  const logo = d.logo || 'LOGO';

  // Calculate rows needed — compact layout
  const logoH = 1;
  const leftH = 11;  // 1 top + 1 pad + 7 lines + 1 pad + 1 bottom
  const rightH = 10; // 1 top + 1 pad + 6 lines + 1 pad + 1 bottom
  const footerH = 1;
  const gapH = 1;

  const totalRows = logoH + gapH + leftH + gapH + rightH + gapH + footerH;
  const g = grid(cols, totalRows);

  let row = 0;

  // Logo bar
  bar(g, 0, row, cols, logo);
  row += logoH + gapH;

  // Left panel (admin)
  box(g, 1, row, cols - 2, leftH, leftTitle, [
    leftDesc,
    '>Email',
    '_' + emailPlaceholder + '_',
    '>Password',
    '_' + passPlaceholder + '_',
    '[' + leftBtn + ']',
    demoBtn,
  ]);
  row += leftH + gapH;

  // Divider
  writeCenter(g, 0, row - 1, cols, '─── or ───');

  // Right panel (staff)
  box(g, 1, row, cols - 2, rightH, rightTitle, [
    rightDesc,
    '>Location',
    '_' + slugPlaceholder + '_',
    '>PIN',
    '_' + pinPlaceholder + '_',
    '[' + rightBtn + ']',
  ]);
  row += rightH + gapH;

  // Footer bar
  barBottom(g, 0, row, cols, footer);

  return render(g, cols);
}

/**
 * Generic: build layout from a tree of boxes.
 * @param {Object} tree - {type:'root'|'box'|'section', children:[], ...}
 * @param {number} cols
 * @returns {string}
 */
export function renderTree(tree, cols = 80) {
  // Determine total height needed
  function calcHeight(node) {
    if (node.type === 'box') return node.h || 5;
    if (node.type === 'section') return node.h || 3;
    let h = 0;
    for (const ch of node.children || []) h += calcHeight(ch) + 1;
    return h;
  }

  const totalH = calcHeight(tree);
  const g = grid(cols, totalH);

  let y = 0;
  function layout(node, indent) {
    const w = cols - indent * 2;
    if (node.type === 'section') {
      section(g, indent, y, w, node.h || 3, node.title || '');
      y += (node.h || 3);
    } else if (node.type === 'box') {
      box(g, indent, y, w, node.h || 5, node.title || '', node.lines || []);
      y += (node.h || 5);
    } else {
      for (const ch of node.children || []) {
        layout(ch, indent + (node.type === 'root' ? 0 : 0));
        y += 1;
      }
    }
  }

  layout(tree, 0);
  return render(g, cols);
}

export default { renderLoginLayout, renderTree };
