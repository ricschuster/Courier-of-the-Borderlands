// Standalone telemetry dashboard (#220). Reads the same-origin localStorage the
// game writes (see src/systems/telemetry.ts) and renders a rolling history of
// run milestones plus per-region averages. No framework, no build coupling to
// the game bundle beyond the shared pure telemetry module.

import {
  loadRecords,
  summarizeRecords,
  clearRecords,
  TELEMETRY_KEY,
  type RunRecord,
  type RegionRollup,
} from '../systems/telemetry';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) {
    node.textContent = text;
  }
  if (className !== undefined) {
    node.className = className;
  }
  return node;
}

function statCard(value: string | number, label: string): HTMLElement {
  const card = el('div', undefined, 'card');
  card.append(el('div', String(value), 'n'), el('div', label, 'l'));
  return card;
}

function fmtDate(ms: number): string {
  if (ms <= 0) {
    return '-';
  }
  const d = new Date(ms);
  return d.toLocaleString();
}

function table(headers: readonly string[], rows: readonly (readonly (string | number)[])[]): HTMLElement {
  const scroll = el('div', undefined, 'scroll');
  const t = el('table');
  const thead = el('thead');
  const htr = el('tr');
  for (const h of headers) {
    htr.append(el('th', h));
  }
  thead.append(htr);
  const tbody = el('tbody');
  for (const row of rows) {
    const tr = el('tr');
    for (const cell of row) {
      tr.append(el('td', String(cell)));
    }
    tbody.append(tr);
  }
  t.append(thead, tbody);
  scroll.append(t);
  return scroll;
}

function regionTable(regions: readonly RegionRollup[]): HTMLElement {
  return table(
    ['Region', 'Records', 'Avg coins', 'Avg wear', 'Avg condition', 'Avg deliveries', 'Strands'],
    regions.map((r) => [
      r.regionName,
      r.records,
      r.avgCoins,
      r.avgWear,
      r.avgWagonCondition,
      r.avgDeliveries,
      r.strandEvents,
    ]),
  );
}

function recentTable(records: readonly RunRecord[]): HTMLElement {
  // Newest first, capped so the page stays readable.
  const rows = [...records]
    .reverse()
    .slice(0, 40)
    .map((r) => [
      fmtDate(r.at),
      r.milestone,
      r.regionName,
      r.difficulty,
      r.coins,
      r.deliveries,
      Math.round(r.wagonWearTotal),
      Math.round(r.wagonCondition),
      r.strandEvents,
    ]);
  return table(
    ['When', 'Milestone', 'Region', 'Difficulty', 'Coins', 'Deliv', 'Wear', 'Cond', 'Strands'],
    rows,
  );
}

function download(records: readonly RunRecord[]): void {
  const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a');
  a.href = url;
  a.download = 'courier-telemetry.json';
  a.click();
  URL.revokeObjectURL(url);
}

function render(): void {
  const app = document.getElementById('app');
  if (app === null) {
    return;
  }
  app.replaceChildren();

  const records = loadRecords();
  const summary = summarizeRecords(records);

  app.append(el('h1', 'Courier Telemetry'));
  app.append(
    el(
      'p',
      `Reading ${TELEMETRY_KEY} on this origin. Play the game in this browser to populate it.`,
      'sub',
    ),
  );

  if (records.length === 0) {
    app.append(el('p', 'No runs recorded yet. Clear a region or finish the arc to capture one.', 'empty'));
    return;
  }

  const cards = el('div', undefined, 'cards');
  cards.append(
    statCard(summary.totalRecords, 'records'),
    statCard(summary.arcCompletions, 'arc completions'),
    statCard(summary.regions.length, 'regions seen'),
  );
  app.append(cards);

  app.append(el('h2', 'Per region (averages)'));
  app.append(regionTable(summary.regions));

  app.append(el('h2', 'Recent milestones'));
  app.append(recentTable(records));

  const actions = el('div', undefined, 'actions');
  const dl = el('button', 'Download JSON');
  dl.addEventListener('click', () => download(records));
  const clear = el('button', 'Clear history');
  clear.addEventListener('click', () => {
    if (confirm('Delete all recorded telemetry on this origin?')) {
      clearRecords();
      render();
    }
  });
  actions.append(dl, clear);
  app.append(actions);
}

render();
