/**
 * renderDeliveryLayout - Mobile portrait ASCII layout for the delivery admin page.
 *
 * Structure (mobile, 42 cols wide):
 * ┌─ Header (dark bg, title + stats)
 * ├─ Stats cards
 * ├─ Filter bar
 * ├─ Kanban columns (stacked vertically)
 * └─ Construction banner
 */


const G = {
  TL: '┌', TR: '┐', BL: '└', BR: '┘',
  H: '─', V: '│',
  LT: '├', RT: '┤', TT: '┬', BT: '┴',
  CR: '┼',
};

function wcwidth(cp) {
  if (cp === 0) return 0;
  if (cp >= 0x200B && cp <= 0x200D) return 0;
  if (cp >= 0xFE00 && cp <= 0xFE0F) return 0;
  if (cp >= 0x0300 && cp <= 0x036F) return 0;
  if (cp >= 0x1F000 && cp <= 0x1FFFF) return 2;
  if (cp >= 0x2600 && cp <= 0x27BF) return 2;
  if (cp >= 0x2300 && cp <= 0x23FF) return 2;
  if (cp >= 0x2B50 && cp <= 0x2B55) return 2;
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

function vw(s) {
  let w = 0;
  for (const ch of s) w += wcwidth(ch.codePointAt(0));
  return w;
}

function write(g, x, y, s) {
  let col = x;
  for (const ch of s) {
    if (col >= g[y].length) break;
    const cp = ch.codePointAt(0);
    const cw = wcwidth(cp);
    if (cw === 2 && ch.length === 2) {
      g[y][col] = ch[0];
      if (col + 1 < g[y].length) g[y][col + 1] = ch[1];
    } else {
      g[y][col] = ch;
    }
    col += cw;
  }
}

function writeCenter(g, x, y, w, s, margin = 0) {
  const maxW = w - 2 * margin;
  const visualW = vw(s);
  let text = s;
  if (visualW > maxW) {
    let tw = 0; let i = 0;
    for (const ch of s) {
      const cw = wcwidth(ch.codePointAt(0));
      if (tw + cw > maxW - 1) break;
      tw += cw; i++;
    }
    text = s.slice(0, i) + '\u2026';
  }
  const start = x + margin + Math.floor((maxW - vw(text)) / 2);
  write(g, start, y, text);
}

function padVisual(line, targetWidth) {
  const current = vw(line);
  if (current >= targetWidth) return line;
  return line + ' '.repeat(targetWidth - current);
}

function grid(cols, rows) {
  return Array.from({ length: rows }, () => Array(cols).fill(' '));
}

function render(g, cols) {
  return g.map(row => padVisual(row.join(''), cols)).join('\n');
}

function box(g, x, y, w, h, title = '', lines = []) {
  // Top border
  g[y][x] = G.TL;
  for (let c = 1; c < w - 1; c++) g[y][x + c] = G.H;
  g[y][x + w - 1] = G.TR;

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
      t = title.slice(0, i) + '\u2026';
    }
    const start = x + Math.floor((w - vw(t)) / 2);
    write(g, start, y, t);
  }

  for (let r = 1; r < h - 1; r++) {
    g[y + r][x] = G.V;
    g[y + r][x + w - 1] = G.V;
  }

  for (let i = 0; i < lines.length && y + 2 + i < y + h - 2; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      const btnText = line.slice(1, -1);
      const bw = btnText.length + 2;
      const bx = x + Math.floor((w - bw) / 2);
      const by = y + 2 + i;
      g[by][bx] = '[';
      g[by][bx + bw - 1] = ']';
      write(g, bx + 1, by, btnText);
    } else if (line.startsWith('>')) {
      write(g, x + 3, y + 2 + i, line.slice(1));
    } else if (line.startsWith('_') && line.endsWith('_')) {
      const inner = line.slice(1, -1);
      const pad = 2;
      g[y + 2 + i][x + pad] = G.TL;
      g[y + 2 + i][x + w - 1 - pad] = G.TR;
      for (let c = pad + 1; c < w - 1 - pad; c++) g[y + 2 + i][x + c] = G.H;
      writeCenter(g, x, y + 2 + i, w, inner, pad);
    } else if (line.startsWith('*')) {
      // Accent/colored line (e.g. yellow banner)
      writeCenter(g, x, y + 2 + i, w, line.slice(1));
    } else if (line.startsWith('^')) {
      // Icon-prefixed line
      write(g, x + 3, y + 2 + i, line.slice(1));
    } else {
      writeCenter(g, x, y + 2 + i, w, line);
    }
  }

  g[y + h - 1][x] = G.BL;
  for (let c = 1; c < w - 1; c++) g[y + h - 1][x + c] = G.H;
  g[y + h - 1][x + w - 1] = G.BR;
}

function darkBar(g, x, y, w, title) {
  for (let c = 0; c < w; c++) g[y][x + c] = '\u2592';
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
 * Render a pill-shaped stat chip in the header bar.
 */
function pill(g, x, y, label, count, accent) {
  const text = `${count} ${label}`;
  const pw = text.length + 4;
  if (x + pw > g[y].length) return;
  g[y][x] = '(';
  g[y][x + pw - 1] = ')';
  write(g, x + 2, y, text);
  return pw;
}

/**
 * Render delivery admin page in mobile portrait layout.
 * @param {Object} opts
 * @param {number} opts.cols — viewport width (default 42)
 * @param {Object} opts.data
 * @param {Object} opts.data.stats — { pending, inProgress, delivered, totalOrders }
 * @param {Object[]} opts.data.tickets — array of { id, table, code, status, source, items, customer }
 */
export function renderDeliveryLayout(opts = {}) {
  const cols = opts.cols || 42;
  const d = opts.data || {};
  const stats = d.stats || { pending: 0, inProgress: 0, delivered: 0, totalOrders: 0 };
  const tickets = d.tickets || [];

  const headerH = 5;       // dark bar with title, subtitle, pills
  const statsH = 2;        // stats section header
  const statsCardsH = 7;   // 2x2 card grid
  const filterH = 3;       // filter bar
  const kanbanHeaderH = 1; // "Kanban" label

  // Each kanban column: header + ticket cards
  const queueTickets = tickets.filter(t => t.status === 'queue');
  const prepTickets = tickets.filter(t => t.status === 'prep');
  const readyTickets = tickets.filter(t => t.status === 'ready');

  const queueH = 2 + Math.max(queueTickets.length, 1) * 5; // header + cards
  const prepH = 2 + Math.max(prepTickets.length, 1) * 5;
  const readyH = 2 + Math.max(readyTickets.length, 1) * 5;

  const bannerH = 7;       // construction banner
  const gap = 1;

  const totalRows = headerH + gap + statsH + statsCardsH + gap + filterH + gap + kanbanHeaderH + gap + queueH + gap + prepH + gap + readyH + gap + bannerH;
  const g = grid(cols, totalRows);

  let row = 0;

  // ── 1. Header (dark) ──
  darkBar(g, 0, row, cols, 'DELIVERY');
  row++;
  writeCenter(g, 0, row, cols, 'Gestion de pedidos y reparto');
  row++;
  // Stats pills row — simulate compact mobile layout
  const pillData = [
    { label: 'ord', count: stats.totalOrders },
    { label: 'pend', count: stats.pending, accent: true },
    { label: 'prep', count: stats.inProgress },
    { label: 'listo', count: stats.delivered, accent: true },
  ];
  let px = 2;
  for (const p of pillData) {
    const pw = pill(g, px, row, p.label, p.count);
    px += (pw || 10) + 2;
  }
  row++;
  // "New order" button
  writeCenter(g, 0, row, cols, '[+ Nuevo Pedido]');
  row += 1 + gap;

  // ── 2. Stats cards ──
  bar(g, 0, row, cols, 'ESTADISTICAS');
  row++;
  const cardW = Math.floor((cols - 6) / 2);
  const cards = [
    { label: 'Pendientes', value: stats.pending, color: '!' },
    { label: 'Preparando', value: stats.inProgress, color: '~' },
    { label: 'Listos', value: stats.delivered, color: '+' },
    { label: 'Total noche', value: stats.totalOrders, color: '=' },
  ];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const card = cards[i * 2 + j];
      const cx = 2 + j * (cardW + 2);
      const cy = row + i * 3;
      box(g, cx, cy, cardW, 3, card.label, [
        String(card.value)
      ]);
    }
  }
  row += statsCardsH + gap;

  // ── 3. Filters ──
  write(g, 2, row, 'Filtro:');
  write(g, 10, row, '[Todos]');
  write(g, 19, row, '[Delivery]');
  write(g, 31, row, '[Mostrador]');
  row += 2 + gap;

  // ── 4. Kanban — stacked vertically on mobile ──
  const columns = [
    { label: 'PENDIENTES', dot: '\u25CF', color: 'o', tickets: queueTickets },
    { label: 'PREPARANDO', dot: '\u25CF', color: '~', tickets: prepTickets },
    { label: 'LISTOS', dot: '\u25CF', color: '+', tickets: readyTickets },
  ];

  for (const col of columns) {
    bar(g, 0, row, cols, `${col.dot} ${col.label} (${col.tickets.length})`);
    row++;
    if (col.tickets.length === 0) {
      writeCenter(g, 0, row, cols, '(vacio)');
      row++;
      // Empty state box
      box(g, 2, row, cols - 4, 3, '', ['Sin pedidos']);
      row += 3;
    } else {
      for (const ticket of col.tickets.slice(0, 3)) { // max 3 cards shown
        const cardH = 5;
        const sourceIcon = ticket.source === 'delivery' ? '\uD83D\uDE9A' : '\uD83C\uDFEA';
        const table = ticket.table && ticket.table !== '__counter__' ? ticket.table : 'Mostrador';
        box(g, 2, row, cols - 4, cardH, `${sourceIcon} ${table}`, [
          ticket.code || '#000000',
          ...((ticket.items || []).slice(0, 2).map(it => `${it.qty}x ${it.name}`)),
          ticket.customer ? `^${ticket.customer}` : null,
        ].filter(Boolean));
        row += cardH;
      }
    }
    row += gap;
  }

  // ── 5. Construction banner ──
  row++;
  box(g, 1, row, cols - 2, bannerH, '\uD83D\uDEB2 EN CONSTRUCCION', [
    '*Esta seccion esta en desarrollo.',
    '*Proximamente: tracking en',
    '*tiempo real y notificaciones',
    '*push para riders.',
  ]);

  return render(g, cols);
}

export default { renderDeliveryLayout };