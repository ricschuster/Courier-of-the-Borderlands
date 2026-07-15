// Standalone telemetry dashboard (#220). Reads the same-origin localStorage the
// game writes (see src/systems/telemetry.ts) and renders a rolling history of
// run milestones plus per-region averages. No framework, no build coupling to
// the game bundle beyond the shared pure telemetry module.

import {
  loadRecords,
  summarizeRecords,
  filterBySource,
  clearRecords,
  TELEMETRY_KEY,
  type RunRecord,
  type RegionRollup,
  type SourceFilter,
} from '../systems/telemetry';
import { loadErrors, clearErrors, type ErrorRecord } from '../systems/error-log';

/**
 * Which runs the page is reporting on. Defaults to real play: an automated
 * driver's wear is a lower bound and its condition an upper bound, so mixing it
 * into the averages flatters the travel sink (#264).
 */
let sourceFilter: SourceFilter = 'play';

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
      r.source === 'auto' ? 'automated' : 'play',
      r.regionName,
      r.difficulty,
      r.coins,
      r.deliveries,
      Math.round(r.wagonWearTotal),
      Math.round(r.wagonCondition),
      r.strandEvents,
    ]);
  return table(
    [
      'When',
      'Milestone',
      'Source',
      'Region',
      'Difficulty',
      'Coins',
      'Deliv',
      'Wear',
      'Cond',
      'Strands',
    ],
    rows,
  );
}

/**
 * Runtime error log (#221). Newest first, each entry expandable to its stack.
 * A table would not do: a stack is multi-line and the point is being able to read
 * it. Rendered whether or not any runs exist, since an error that stopped the
 * game is exactly the case where no milestone was ever captured.
 */
function errorSection(errors: readonly ErrorRecord[]): HTMLElement {
  const wrap = el('div');
  wrap.append(el('h2', 'Runtime errors'));

  if (errors.length === 0) {
    wrap.append(el('p', 'No errors recorded on this origin. Good.', 'empty'));
    return wrap;
  }

  for (const e of [...errors].reverse()) {
    const details = el('details', undefined, 'err');
    const summary = el('summary');
    summary.append(el('span', e.source, 'pill err-source'));
    summary.append(el('span', e.message || '(no message)', 'msg'));
    if (e.count > 1) {
      summary.append(el('span', `x${e.count}`, 'pill'));
    }
    summary.append(el('span', fmtDate(e.at), 'when'));
    details.append(summary);
    details.append(el('pre', e.stack === '' ? '(no stack captured)' : e.stack));
    wrap.append(details);
  }
  return wrap;
}

/** Source picker. Each button re-renders the page against that filter. */
function filterBar(all: readonly RunRecord[]): HTMLElement {
  const bar = el('div', undefined, 'filters');
  const options: readonly (readonly [SourceFilter, string])[] = [
    ['play', 'Real play'],
    ['auto', 'Automated'],
    ['all', 'Both'],
  ];
  for (const [value, label] of options) {
    const n = filterBySource(all, value).length;
    const b = el('button', `${label} (${n})`, value === sourceFilter ? 'active' : undefined);
    b.addEventListener('click', () => {
      sourceFilter = value;
      render();
    });
    bar.append(b);
  }
  return bar;
}

/** Export the records currently shown, so a filtered view exports what it reports. */
function download(records: readonly RunRecord[]): void {
  const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a');
  a.href = url;
  a.download = `courier-telemetry-${sourceFilter}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function render(): void {
  const app = document.getElementById('app');
  if (app === null) {
    return;
  }
  app.replaceChildren();

  const all = loadRecords();
  const errors = loadErrors();

  app.append(el('h1', 'Courier Telemetry'));
  app.append(
    el(
      'p',
      `Reading ${TELEMETRY_KEY} on this origin. Play the game in this browser to populate it.`,
      'sub',
    ),
  );

  if (all.length === 0) {
    app.append(el('p', 'No runs recorded yet. Clear a region or finish the arc to capture one.', 'empty'));
    // Still show errors: a crash is the likeliest reason no run was ever recorded.
    app.append(errorSection(errors));
    app.append(actionBar([], errors));
    return;
  }

  app.append(filterBar(all));

  const records = filterBySource(all, sourceFilter);
  const summary = summarizeRecords(records);

  if (sourceFilter === 'all') {
    app.append(
      el(
        'p',
        'Showing bot and human runs together. An automated driver routes near-optimally and repairs at every home visit, so its wear reads low and its condition high.',
        'sub',
      ),
    );
  }

  if (records.length === 0) {
    app.append(
      el(
        'p',
        sourceFilter === 'play'
          ? 'No real-play runs recorded yet. Only automated runs are stored on this origin.'
          : 'No automated runs recorded yet.',
        'empty',
      ),
    );
  } else {
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
  }

  app.append(errorSection(errors));
  app.append(actionBar(records, errors));
}

/** Export and clear controls. Clearing runs and clearing errors are separate. */
function actionBar(records: readonly RunRecord[], errors: readonly ErrorRecord[]): HTMLElement {
  const actions = el('div', undefined, 'actions');

  if (records.length > 0) {
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
  }

  if (errors.length > 0) {
    const clearErr = el('button', 'Clear errors');
    clearErr.addEventListener('click', () => {
      if (confirm('Delete the recorded runtime errors on this origin?')) {
        clearErrors();
        render();
      }
    });
    actions.append(clearErr);
  }
  return actions;
}

render();
