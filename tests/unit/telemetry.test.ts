import { describe, it, expect } from 'vitest';
import {
  createRunRecord,
  appendRecord,
  summarizeRecords,
  filterBySource,
  parseRecords,
  recordRun,
  loadRecords,
  TELEMETRY_SCHEMA,
  MAX_RECORDS,
  type RunRecordInput,
} from '../../src/systems/telemetry';

const base: RunRecordInput = {
  milestone: 'region',
  source: 'play',
  regionId: 'greybridge',
  regionName: 'Greybridge Region',
  difficulty: 'standard',
  coins: 340,
  deliveries: 5,
  distanceTiles: 120.4,
  wagonWearTotal: 88.2,
  wagonCondition: 60,
  strandEvents: 0,
  upgradesOwned: 2,
  totalReputation: 30,
};

describe('createRunRecord', () => {
  it('stamps the schema version and timestamp', () => {
    const r = createRunRecord(base, 1_000);
    expect(r.schema).toBe(TELEMETRY_SCHEMA);
    expect(r.at).toBe(1_000);
    expect(r.regionName).toBe('Greybridge Region');
  });

  it('coerces non-finite and negative numbers to a clean value', () => {
    const r = createRunRecord(
      { ...base, coins: Number.NaN, deliveries: -3, wagonWearTotal: Infinity },
      -50,
    );
    expect(r.at).toBe(0);
    expect(r.coins).toBe(0);
    expect(r.deliveries).toBe(0);
    expect(r.wagonWearTotal).toBe(0);
  });

  it('normalizes an unknown milestone to region', () => {
    const r = createRunRecord({ ...base, milestone: 'nonsense' as 'region' }, 1);
    expect(r.milestone).toBe('region');
  });

  it('records the run source', () => {
    expect(createRunRecord({ ...base, source: 'auto' }, 1).source).toBe('auto');
    expect(createRunRecord({ ...base, source: 'play' }, 1).source).toBe('play');
  });

  it('normalizes an unknown source to play', () => {
    const r = createRunRecord({ ...base, source: 'nonsense' as 'play' }, 1);
    expect(r.source).toBe('play');
  });

  it('preserves a negative reputation (it can legitimately be below zero)', () => {
    const r = createRunRecord({ ...base, totalReputation: -12 }, 1);
    expect(r.totalReputation).toBe(-12);
  });
});

describe('appendRecord', () => {
  it('appends newest last', () => {
    const a = createRunRecord({ ...base, coins: 1 }, 1);
    const b = createRunRecord({ ...base, coins: 2 }, 2);
    const list = appendRecord(appendRecord([], a), b);
    expect(list.map((r) => r.coins)).toEqual([1, 2]);
  });

  it('caps to the newest max, dropping the oldest', () => {
    let list = [createRunRecord({ ...base, coins: 0 }, 0)];
    for (let i = 1; i <= 3; i++) {
      list = appendRecord(list, createRunRecord({ ...base, coins: i }, i), 3);
    }
    expect(list).toHaveLength(3);
    expect(list.map((r) => r.coins)).toEqual([1, 2, 3]);
  });

  it('defaults the cap to MAX_RECORDS', () => {
    let list: ReturnType<typeof createRunRecord>[] = [];
    for (let i = 0; i < MAX_RECORDS + 5; i++) {
      list = appendRecord(list, createRunRecord(base, i));
    }
    expect(list).toHaveLength(MAX_RECORDS);
  });
});

describe('summarizeRecords', () => {
  it('reports totals and arc completions', () => {
    const records = [
      createRunRecord({ ...base, milestone: 'region' }, 1),
      createRunRecord({ ...base, milestone: 'region', regionId: 'fenmarch', regionName: 'Fenmarch' }, 2),
      createRunRecord({ ...base, milestone: 'arc' }, 3),
    ];
    const s = summarizeRecords(records);
    expect(s.totalRecords).toBe(3);
    expect(s.arcCompletions).toBe(1);
    expect(s.regions).toHaveLength(2);
  });

  it('averages per region and sums strands', () => {
    const records = [
      createRunRecord({ ...base, coins: 100, strandEvents: 1 }, 1),
      createRunRecord({ ...base, coins: 300, strandEvents: 2 }, 2),
    ];
    const s = summarizeRecords(records);
    const gb = s.regions[0]!;
    expect(gb.records).toBe(2);
    expect(gb.avgCoins).toBe(200);
    expect(gb.strandEvents).toBe(3);
  });

  it('rounds averages to one decimal', () => {
    const records = [
      createRunRecord({ ...base, coins: 1 }, 1),
      createRunRecord({ ...base, coins: 2 }, 2),
    ];
    expect(summarizeRecords(records).regions[0]!.avgCoins).toBe(1.5);
  });

  it('orders regions by first appearance', () => {
    const records = [
      createRunRecord({ ...base, regionId: 'saltreach', regionName: 'Saltreach' }, 1),
      createRunRecord({ ...base, regionId: 'greybridge' }, 2),
    ];
    expect(summarizeRecords(records).regions.map((r) => r.regionId)).toEqual([
      'saltreach',
      'greybridge',
    ]);
  });

  it('returns an empty summary for no records', () => {
    const s = summarizeRecords([]);
    expect(s.totalRecords).toBe(0);
    expect(s.arcCompletions).toBe(0);
    expect(s.regions).toEqual([]);
  });
});

describe('filterBySource', () => {
  const play = createRunRecord({ ...base, source: 'play', coins: 10 }, 1);
  const auto = createRunRecord({ ...base, source: 'auto', coins: 20 }, 2);

  it('narrows to one source', () => {
    expect(filterBySource([play, auto], 'play')).toEqual([play]);
    expect(filterBySource([play, auto], 'auto')).toEqual([auto]);
  });

  it('passes everything through for all', () => {
    expect(filterBySource([play, auto], 'all')).toEqual([play, auto]);
  });

  it('keeps bot runs out of real-play averages', () => {
    // The point of the field: 20 coins from the bot must not move the play mean.
    const s = summarizeRecords(filterBySource([play, auto], 'play'));
    expect(s.regions[0]!.avgCoins).toBe(10);
  });

  it('returns an empty list when no record matches', () => {
    expect(filterBySource([play], 'auto')).toEqual([]);
  });
});

describe('parseRecords', () => {
  it('returns [] for non-array input', () => {
    expect(parseRecords(null)).toEqual([]);
    expect(parseRecords({})).toEqual([]);
    expect(parseRecords('nope')).toEqual([]);
  });

  it('round-trips created records', () => {
    const records = [createRunRecord(base, 1), createRunRecord({ ...base, milestone: 'arc' }, 2)];
    const json = JSON.parse(JSON.stringify(records));
    expect(parseRecords(json)).toEqual(records);
  });

  it('defaults missing fields and skips non-object entries', () => {
    const parsed = parseRecords([{ regionId: 'x' }, 5, null, 'str']);
    expect(parsed).toHaveLength(1);
    const r = parsed[0]!;
    expect(r.regionId).toBe('x');
    expect(r.regionName).toBe('Unknown');
    expect(r.difficulty).toBe('standard');
    expect(r.coins).toBe(0);
    expect(r.milestone).toBe('region');
    expect(r.source).toBe('play');
  });

  it('reads a stored source and defaults an unknown one to play', () => {
    const parsed = parseRecords([
      { schema: TELEMETRY_SCHEMA, source: 'auto' },
      { schema: TELEMETRY_SCHEMA, source: 'bogus' },
    ]);
    expect(parsed.map((r) => r.source)).toEqual(['auto', 'play']);
  });

  it('drops records from an older schema rather than mislabelling their source', () => {
    // A v1 record predates `source`; defaulting it to 'play' would label the
    // hand-seeded bot arc as human play, the exact confusion #264 fixes.
    const parsed = parseRecords([
      { schema: 1, regionId: 'old' },
      { schema: TELEMETRY_SCHEMA, regionId: 'new' },
    ]);
    expect(parsed.map((r) => r.regionId)).toEqual(['new']);
  });

  it('drops negative numeric fields to 0', () => {
    const parsed = parseRecords([{ ...base, at: -1, coins: -5 }]);
    expect(parsed[0]!.at).toBe(0);
    expect(parsed[0]!.coins).toBe(0);
  });
});

describe('storage wrapper without localStorage (node env)', () => {
  it('loadRecords returns [] when storage is unavailable', () => {
    expect(loadRecords()).toEqual([]);
  });

  it('recordRun degrades gracefully and still returns the appended record', () => {
    const list = recordRun(base, 42);
    expect(list).toHaveLength(1);
    expect(list[0]!.coins).toBe(340);
    expect(list[0]!.at).toBe(42);
  });
});
