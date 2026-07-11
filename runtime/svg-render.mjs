/**
 * @fileoverview SVG Render Engine — generates editable SVG wireframes from
 * component layout data, with stable IDs and data attributes for visual diffing.
 *
 * Every UI element gets:
 *   - A stable id (e.g. "card-a1", "btn-deliver-a1", "text-title")
 *   - data-type: "header" | "card" | "button" | "badge" | "text" | "stat" | "banner"
 *   - data-label: human-readable name
 *   - data-original-text: the text content at generation time (for diff)
 *   - data-component: the React component name
 *
 * The user edits the SVG in any vector editor, then ux-extract diffs it
 * against the original to produce code changes.
 *
 * SVG viewport: 375px wide (mobile portrait), height auto-calculated.
 */

/**
 * Color palette matching Pronto's Tailwind tokens.
 */
const COLORS = {
  bg: '#F9F7F4',
  foreground: '#0D1B2A',
  card: '#FFFFFF',
  cardBorder: '#E5E0D8',
  text: '#0D1B2A',
  muted: '#8B847A',
  accent: '#FF5436',
  warning: '#FFCD3C',
  success: '#15C26B',
  successBg: '#E9FBF1',
  successBorder: '#BDEFD2',
  warningBg: '#FFF8E0',
  warningText: '#B98900',
  delivery: '#0E7A42',
  deliveryBg: '#E9FBF1',
  counter: '#B98900',
  counterBg: '#FFF8E0',
  bannerBg: '#FFFBEE',
  bannerBorder: '#FFCD3C',
  bannerText: '#B98900',
  urgent: '#FFF1ED',
  urgentText: '#FF5436',
  neutral: '#F1ECE4',
};

/** Incrementing ID counter for uniqueness */
let idCounter = 0;

function uid(prefix) {
  return `${prefix}-${++idCounter}`;
}

function resetIds() {
  idCounter = 0;
}

/**
 * Escape text for SVG content.
 */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Build SVG attributes string from an object.
 */
function attrs(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}="${esc(v)}"`)
    .join(' ');
}

/**
 * SVG <rect> element.
 */
function rect(x, y, w, h, extra = {}) {
  return `<rect ${attrs({ x, y, width: w, height: h, rx: extra.rx ?? 8, ...extra })}/>\n`;
}

/**
 * SVG <text> element.
 */
function text(x, y, content, extra = {}) {
  const fontSize = extra.fontSize ?? 13;
  const fill = extra.fill ?? COLORS.text;
  const anchor = extra.anchor ?? 'start';
  return `  <text ${attrs({
    x, y, fill,
    'font-family': extra.fontFamily ?? 'system-ui, sans-serif',
    'font-size': fontSize,
    'font-weight': extra.fontWeight ?? 'normal',
    'text-anchor': anchor,
    ...extra,
    // Remove style props from attrs
    fill: undefined,
    'font-family': undefined,
    'font-size': undefined,
    'font-weight': undefined,
    'text-anchor': undefined,
    rx: undefined,
  })} font-family="system-ui, sans-serif" font-size="${fontSize}" font-weight="${extra.fontWeight ?? 'normal'}" text-anchor="${anchor}" fill="${fill}">${esc(content)}</text>\n`;
}

/**
 * SVG <g> wrapper with data attributes.
 */
function groupOpen(id, attrs_ = {}) {
  return `  <g id="${esc(id)}" ${Object.entries(attrs_).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}>\n`;
}
function groupClose() {
  return '  </g>\n';
}

/**
 * Render a card with type badge, code, items, and action.
 */
function renderTicketCard(x, y, w, ticket) {
  const h = 110; // compact card height
  const pad = 10;
  const isDelivery = ticket.source === 'delivery';
  const isReady = ticket.status === 'ready';
  const isPrep = ticket.status === 'prep';

  let parts = '';

  const cardId = `card-${ticket.id}`;
  parts += groupOpen(cardId, {
    type: 'card',
    label: `Ticket ${ticket.code}`,
    component: 'DeliveryTicketCard',
  });

  // Card background
  if (isReady) {
    parts += rect(x, y, w, h, { rx: 12, fill: COLORS.successBg, stroke: COLORS.successBorder });
  } else {
    parts += rect(x, y, w, h, { rx: 12, fill: COLORS.card, stroke: COLORS.cardBorder });
  }

  // Type badge
  const badgeY = y + pad + 12;
  parts += rect(x + pad, y + pad, 70, 18, { rx: 9, fill: isDelivery ? COLORS.deliveryBg : COLORS.counterBg });
  parts += text(x + pad + 8, badgeY, isDelivery ? 'Delivery' : 'Banco', {
    fontSize: 9, fontWeight: '800', fill: isDelivery ? COLORS.delivery : COLORS.counter, anchor: 'start',
    id: `badge-${ticket.id}`,
    'data-type': 'badge',
    'data-label': 'source badge',
    'data-original-text': isDelivery ? 'Delivery' : 'Banco',
    'data-component': 'DeliveryTicketCard',
  });

  // Code
  parts += text(x + w - pad, badgeY, ticket.code, {
    fontSize: 10, fontWeight: '700', fill: COLORS.muted, anchor: 'end',
    id: `code-${ticket.id}`,
    'data-type': 'text',
    'data-label': 'order code',
    'data-original-text': ticket.code,
    'data-component': 'DeliveryTicketCard',
  });

  // Table / counter label
  const table = ticket.table === '__counter__' ? 'Banco' : ticket.table;
  parts += text(x + pad, y + pad + 32, table, {
    fontSize: 13, fontWeight: '800', fill: COLORS.text, anchor: 'start',
    id: `table-${ticket.id}`,
    'data-type': 'text',
    'data-label': 'table label',
    'data-original-text': table,
    'data-component': 'DeliveryTicketCard',
  });

  // Items (max 2)
  let itemY = y + pad + 48;
  const items = ticket.items || [];
  for (let i = 0; i < Math.min(items.length, 2); i++) {
    const item = items[i];
    parts += text(x + pad + 4, itemY, item.qty + 'x', {
      fontSize: 10, fontWeight: '600', fill: COLORS.muted, anchor: 'start',
      id: `item-qty-${ticket.id}-${i}`,
      'data-type': 'text',
      'data-label': `item ${i} quantity`,
      'data-original-text': item.qty + 'x',
      'data-component': 'DeliveryTicketCard',
    });
    parts += text(x + pad + 24, itemY, item.name, {
      fontSize: 10, fontWeight: 'normal', fill: COLORS.text, anchor: 'start',
      id: `item-name-${ticket.id}-${i}`,
      'data-type': 'text',
      'data-label': `item ${i} name`,
      'data-original-text': item.name,
      'data-component': 'DeliveryTicketCard',
    });
    itemY += 14;
  }
  if (items.length > 2) {
    parts += text(x + pad, itemY, `+${items.length - 2} más`, {
      fontSize: 9, fontWeight: 'normal', fill: COLORS.muted, anchor: 'start',
      id: `item-overflow-${ticket.id}`,
      'data-type': 'text',
      'data-label': 'overflow items',
      'data-original-text': `+${items.length - 2} más`,
      'data-component': 'DeliveryTicketCard',
    });
  }

  // Action row
  const actionY = y + h - pad - 6;
  if (isReady) {
    // Green deliver button
    const btnW = w - 2 * pad;
    parts += rect(x + pad, y + pad + 78, btnW, 24, {
      rx: 12, fill: COLORS.success, id: `btn-deliver-${ticket.id}`,
      'data-type': 'button',
      'data-label': 'deliver button',
      'data-action': 'deliver',
      'data-component': 'DeliveryTicketCard',
    });
    parts += text(x + w / 2, y + pad + 94, '✓ Marca come consegnato', {
      fontSize: 10, fontWeight: '700', fill: '#FFFFFF', anchor: 'middle',
      id: `btn-deliver-text-${ticket.id}`,
      'data-type': 'text',
      'data-label': 'deliver button text',
      'data-original-text': '✓ Marca come consegnato',
      'data-component': 'DeliveryTicketCard',
    });
  } else {
    // Timer chip
    const timerText = '--:--';
    parts += rect(x + pad, actionY - 10, 56, 18, {
      rx: 9, fill: isPrep ? COLORS.warningBg : COLORS.neutral,
      id: `timer-${ticket.id}`,
      'data-type': 'badge',
      'data-label': 'timer',
      'data-component': 'DeliveryTicketCard',
    });
    parts += text(x + pad + 6, actionY + 2, '⏱ ' + timerText, {
      fontSize: 9, fontWeight: '700',
      fill: isPrep ? COLORS.warningText : COLORS.muted, anchor: 'start',
      id: `timer-text-${ticket.id}`,
      'data-type': 'text',
      'data-label': 'timer text',
      'data-original-text': '⏱ ' + timerText,
      'data-component': 'DeliveryTicketCard',
    });
  }

  // Customer name (if delivery)
  if (ticket.customer) {
    parts += text(x + w - pad, actionY + 2, ticket.customer, {
      fontSize: 9, fontWeight: 'normal', fill: COLORS.muted, anchor: 'end',
      id: `customer-${ticket.id}`,
      'data-type': 'text',
      'data-label': 'customer name',
      'data-original-text': ticket.customer,
      'data-component': 'DeliveryTicketCard',
    });
  }

  parts += groupClose();
  return { svg: parts, height: h };
}


/**
 * Render the DeliveryModule page as an editable SVG.
 *
 * @param {Object} opts
 * @param {Object} opts.data - { stats, tickets }
 * @param {number} [opts.width] - viewport width (default 375)
 * @returns {string} SVG string
 */
export function renderDeliverySVG(opts = {}) {
  resetIds();
  const W = opts.width || 375;
  const d = opts.data || {};
  const stats = d.stats || { pending: 0, inProgress: 0, delivered: 0, totalOrders: 0 };
  const tickets = d.tickets || [];
  const pad = 12; // page padding
  const gap = 8;

  const queueTickets = tickets.filter(t => t.status === 'queue');
  const prepTickets = tickets.filter(t => t.status === 'prep');
  const readyTickets = tickets.filter(t => t.status === 'ready');

  // Calculate height
  const headerH = 56;
  const statsH = 52;
  const filterH = 32;
  const colHeaderH = 20;
  const emptyH = 24;
  const bannerH = 72;
  const sectionGap = 12;

  const queueCardsH = queueTickets.length > 0
    ? queueTickets.reduce((sum, t) => sum + renderTicketCard(0, 0, 0, t).height + gap, 0)
    : emptyH;
  const prepCardsH = prepTickets.length > 0
    ? prepTickets.reduce((sum, t) => sum + renderTicketCard(0, 0, 0, t).height + gap, 0)
    : emptyH;
  const readyCardsH = readyTickets.length > 0
    ? readyTickets.reduce((sum, t) => sum + renderTicketCard(0, 0, 0, t).height + gap, 0)
    : emptyH;

  const totalH = pad + headerH + sectionGap + statsH + sectionGap + filterH + sectionGap
    + colHeaderH + queueCardsH + sectionGap
    + colHeaderH + prepCardsH + sectionGap
    + colHeaderH + readyCardsH + sectionGap + bannerH + pad;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${totalH}" width="${W}" height="${totalH}">
  <style>
    text { font-family: system-ui, -apple-system, sans-serif; }
  </style>\n`;

  // Background
  svg += rect(0, 0, W, totalH, { rx: 0, fill: COLORS.bg, id: null });

  let y = pad;

  // ── 1. Header ──
  svg += groupOpen('box-header', {
    type: 'header',
    label: 'Delivery header',
    component: 'DeliveryModule',
  });
  svg += rect(pad, y, W - 2 * pad, headerH, { rx: 16, fill: COLORS.foreground });
  svg += text(pad + 12, y + 18, 'Delivery', {
    fontSize: 11, fontWeight: '800', fill: 'rgba(255,255,255,0.65)', anchor: 'start',
    id: 'text-eyebrow',
    'data-type': 'text',
    'data-label': 'eyebrow text',
    'data-original-text': 'Delivery',
    'data-component': 'DeliveryModule',
  });
  svg += text(pad + 12, y + 36, 'Delivery', {
    fontSize: 18, fontWeight: '800', fill: '#FFFFFF', anchor: 'start',
    id: 'text-title',
    'data-type': 'text',
    'data-label': 'page title',
    'data-original-text': 'Delivery',
    'data-component': 'DeliveryModule',
  });
  svg += text(pad + 12, y + 50, `${stats.totalOrders} ordini`, {
    fontSize: 11, fontWeight: 'normal', fill: 'rgba(255,255,255,0.55)', anchor: 'start',
    id: 'text-counter',
    'data-type': 'text',
    'data-label': 'order count',
    'data-original-text': `${stats.totalOrders} ordini`,
    'data-component': 'DeliveryModule',
  });
  // + button
  svg += rect(W - pad - 12 - 100, y + 14, 100, 28, {
    rx: 14, fill: COLORS.accent,
    id: 'btn-create',
    'data-type': 'button',
    'data-label': 'create order button',
    'data-action': 'create-order',
    'data-component': 'DeliveryModule',
  });
  svg += text(W - pad - 12 - 50, y + 33, '+ Nuovo ordine', {
    fontSize: 11, fontWeight: '700', fill: '#FFFFFF', anchor: 'middle',
    id: 'btn-create-text',
    'data-type': 'text',
    'data-label': 'create button text',
    'data-original-text': '+ Nuovo ordine',
    'data-component': 'DeliveryModule',
  });
  svg += groupClose();
  y += headerH + sectionGap;

  // ── 2. Stats cards ──
  const statW = Math.floor((W - 2 * pad - 3 * gap) / 4);
  const statData = [
    { label: 'In attesa', value: stats.pending, color: COLORS.urgentText },
    { label: 'In preparaz.', value: stats.inProgress, color: COLORS.warningText },
    { label: 'Pronti', value: stats.delivered, color: COLORS.success },
    { label: 'Totale', value: stats.totalOrders, color: COLORS.text },
  ];

  svg += groupOpen('box-stats', {
    type: 'stat-grid',
    label: 'Stats cards',
    component: 'DeliveryModule',
  });

  for (let i = 0; i < 4; i++) {
    const sx = pad + i * (statW + gap);
    const stat = statData[i];
    svg += groupOpen(`stat-${i}`, {
      type: 'stat',
      label: stat.label,
      component: 'DeliveryModule',
    });
    svg += rect(sx, y, statW, statsH, { rx: 12, fill: COLORS.card, stroke: COLORS.cardBorder });
    svg += text(sx + 8, y + 16, stat.label, {
      fontSize: 8, fontWeight: '800', fill: COLORS.muted, anchor: 'start',
      id: `stat-label-${i}`,
      'data-type': 'text',
      'data-label': 'stat label',
      'data-original-text': stat.label,
      'data-component': 'DeliveryModule',
    });
    svg += text(sx + 8, y + 38, String(stat.value), {
      fontSize: 22, fontWeight: '800', fill: stat.color, anchor: 'start',
      id: `stat-value-${i}`,
      'data-type': 'text',
      'data-label': 'stat value',
      'data-original-text': String(stat.value),
      'data-component': 'DeliveryModule',
    });
    svg += groupClose();
  }
  svg += groupClose();
  y += statsH + sectionGap;

  // ── 3. Filters ──
  svg += groupOpen('box-filters', {
    type: 'filter-bar',
    label: 'Filter buttons',
    component: 'DeliveryModule',
  });
  svg += text(pad + 4, y + 16, 'Filtra:', {
    fontSize: 9, fontWeight: '700', fill: COLORS.muted, anchor: 'start',
    id: 'text-filter-label',
    'data-type': 'text',
    'data-label': 'filter label',
    'data-original-text': 'Filtra:',
    'data-component': 'DeliveryModule',
  });
  const filters = [
    { id: 'filter-todos', label: 'Tutti', active: true },
    { id: 'filter-delivery', label: 'Delivery', active: false },
    { id: 'filter-counter', label: 'Banco', active: false },
  ];
  let fx = pad + 48;
  for (const f of filters) {
    const fw = f.label === 'Tutti' ? 44 : 60;
    svg += rect(fx, y + 4, fw, 22, {
      rx: 11, fill: f.active ? COLORS.foreground : COLORS.card,
      stroke: f.active ? 'none' : COLORS.cardBorder,
      id: f.id,
      'data-type': 'filter',
      'data-label': f.label,
      'data-active': f.active ? 'true' : 'false',
      'data-component': 'DeliveryModule',
    });
    svg += text(fx + fw / 2, y + 18, f.label, {
      fontSize: 8, fontWeight: '700',
      fill: f.active ? '#FFFFFF' : COLORS.muted, anchor: 'middle',
      id: `${f.id}-text`,
      'data-type': 'text',
      'data-label': 'filter text',
      'data-original-text': f.label,
      'data-component': 'DeliveryModule',
    });
    fx += fw + 6;
  }
  svg += groupClose();
  y += filterH + sectionGap;

  // ── 4. Kanban columns (stacked vertically for mobile) ──
  const colW = W - 2 * pad;
  const columns = [
    { key: 'queue', label: 'In attesa', dot: '#5B6B7B', tickets: queueTickets, className: 'queue' },
    { key: 'prep', label: 'In preparazione', dot: '#FFCD3C', tickets: prepTickets, className: 'prep' },
    { key: 'ready', label: 'Pronti da consegnare', dot: '#15C26B', tickets: readyTickets, className: 'ready' },
  ];

  for (const col of columns) {
    const colId = `kanban-${col.key}`;
    svg += groupOpen(colId, {
      type: 'kanban-column',
      label: col.label,
      'kanban-status': col.key,
      component: 'DeliveryModule',
    });

    // Column header
    svg += `  <circle cx="${pad + 8}" cy="${y + 8}" r="4" fill="${col.dot}"/>\n`;
    svg += text(pad + 18, y + 14, `${col.label} (${col.tickets.length})`, {
      fontSize: 11, fontWeight: '700', fill: COLORS.text, anchor: 'start',
      id: `col-header-${col.key}`,
      'data-type': 'text',
      'data-label': 'column header',
      'data-original-text': `${col.label} (${col.tickets.length})`,
      'data-component': 'DeliveryModule',
    });
    y += colHeaderH;

    if (col.tickets.length === 0) {
      svg += text(pad + colW / 2, y + emptyH / 2 + 4, '—', {
        fontSize: 12, fontWeight: 'normal', fill: 'rgba(139,132,122,0.4)', anchor: 'middle',
        id: `empty-${col.key}`,
        'data-type': 'text',
        'data-label': 'empty state',
        'data-original-text': '—',
        'data-component': 'DeliveryModule',
      });
      y += emptyH;
    } else {
      for (const ticket of col.tickets) {
        const result = renderTicketCard(pad, y, colW, ticket);
        svg += result.svg;
        y += result.height + gap;
      }
    }

    svg += groupClose();
    y += sectionGap;
  }

  // ── 5. Construction banner ──
  y += 4;
  svg += groupOpen('banner-construction', {
    type: 'banner',
    label: 'Construction banner',
    component: 'DeliveryModule',
  });
  svg += rect(pad, y, W - 2 * pad, bannerH, { rx: 12, fill: COLORS.bannerBg, stroke: COLORS.bannerBorder, 'stroke-dasharray': '4,3' });
  svg += text(pad + colW / 2, y + 22, '🚧', {
    fontSize: 18, fontWeight: 'normal', fill: COLORS.bannerText, anchor: 'middle',
    id: 'banner-icon',
    'data-type': 'text',
    'data-label': 'banner icon',
    'data-original-text': '🚧',
    'data-component': 'DeliveryModule',
  });
  svg += text(pad + colW / 2, y + 40, 'In arrivo', {
    fontSize: 14, fontWeight: '800', fill: COLORS.bannerText, anchor: 'middle',
    id: 'banner-title',
    'data-type': 'text',
    'data-label': 'banner title',
    'data-original-text': 'In arrivo',
    'data-component': 'DeliveryModule',
  });
  svg += text(pad + colW / 2, y + 56, 'Tracking in tempo reale e gestione rider in arrivo.', {
    fontSize: 9, fontWeight: 'normal', fill: '#8d6900', anchor: 'middle',
    id: 'banner-body',
    'data-type': 'text',
    'data-label': 'banner body',
    'data-original-text': 'Tracking in tempo reale e gestione rider in arrivo.',
    'data-component': 'DeliveryModule',
  });
  svg += groupClose();

  svg += '\n</svg>';
  return svg;
}

/**
 * Generate SVG from a generic component layout tree.
 * @param {Object} tree - { type:'root'|'box'|'text'|'button', ... }
 * @param {Object} [opts]
 * @returns {string}
 */
export function renderGenericSVG(tree, opts = {}) {
  resetIds();
  const W = opts.width || 375;
  // Recursive render — to be extended
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 100" width="${W}" height="100">
  <rect width="${W}" height="100" fill="#F9F7F4"/>
  <text x="${W/2}" y="50" text-anchor="middle" font-family="system-ui" font-size="12" fill="#8B847A">[Generic tree renderer — extend for other pages]</text>
</svg>`;
}

export default { renderDeliverySVG, renderGenericSVG };