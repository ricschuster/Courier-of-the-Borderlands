import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  parseChangelog,
  renderChangelogHtml,
  type ChangelogRelease,
} from '../../src/systems/changelog';

// A trimmed sample in the exact shape release-please emits, including the
// hand-written 0.1.0 entry whose heading has no compare link.
const SAMPLE = `# Changelog

All notable changes to this project are documented here.

## [0.2.0](https://example.com/compare/v0.1.0...v0.2.0) (2026-07-15)


### Features

* add per-PR preview deploys ([#219](https://example.com/issues/219)) ([32b8ed9](https://example.com/commit/32b8ed9))
* add a landing page as the site front door ([0df1479](https://example.com/commit/0df1479))

### Bug Fixes

* repair the invalid release-please workflow ([a005c33](https://example.com/commit/a005c33))

## [0.1.0] - 2026-07-14

### Features

* add fog-of-war reveal
`;

describe('parseChangelog', () => {
  it('returns releases in source order, newest first', () => {
    const releases = parseChangelog(SAMPLE);
    expect(releases.map((r) => r.version)).toEqual(['0.2.0', '0.1.0']);
  });

  it('reads the version, compare URL, and date from a generated heading', () => {
    const latest = parseChangelog(SAMPLE)[0];
    expect(latest?.version).toBe('0.2.0');
    expect(latest?.url).toBe('https://example.com/compare/v0.1.0...v0.2.0');
    expect(latest?.date).toBe('2026-07-15');
  });

  it('reads the hand-written heading form with no link and a dashed date', () => {
    const first = parseChangelog(SAMPLE)[1];
    expect(first?.version).toBe('0.1.0');
    expect(first?.url).toBeUndefined();
    expect(first?.date).toBe('2026-07-14');
  });

  it('groups entries under their section', () => {
    const latest = parseChangelog(SAMPLE)[0];
    expect(latest?.sections.map((s) => s.title)).toEqual(['Features', 'Bug Fixes']);
    expect(latest?.sections[0]?.entries).toHaveLength(2);
    expect(latest?.sections[1]?.entries).toHaveLength(1);
  });

  it('strips trailing reference links off the entry text', () => {
    const entry = parseChangelog(SAMPLE)[0]?.sections[0]?.entries[0];
    expect(entry?.text).toBe('add per-PR preview deploys');
  });

  it('keeps every trailing reference in source order', () => {
    const entry = parseChangelog(SAMPLE)[0]?.sections[0]?.entries[0];
    expect(entry?.links).toEqual([
      { text: '#219', url: 'https://example.com/issues/219' },
      { text: '32b8ed9', url: 'https://example.com/commit/32b8ed9' },
    ]);
  });

  it('handles an entry with no references at all', () => {
    const entry = parseChangelog(SAMPLE)[1]?.sections[0]?.entries[0];
    expect(entry).toEqual({ text: 'add fog-of-war reveal', links: [] });
  });

  it('ignores the preamble above the first release heading', () => {
    // "# Changelog" and the prose must not become a release or an entry.
    expect(parseChangelog(SAMPLE)).toHaveLength(2);
  });

  it('returns nothing for a file with no releases', () => {
    expect(parseChangelog('# Changelog\n\nNothing here yet.\n')).toEqual([]);
  });

  it('does not mistake a bare "## Unreleased" heading for a dated release', () => {
    const releases = parseChangelog('## Unreleased\n\n### Features\n\n* something\n');
    expect(releases).toHaveLength(1);
    expect(releases[0]?.version).toBe('Unreleased');
    expect(releases[0]?.date).toBeUndefined();
  });
});

describe('escapeHtml', () => {
  it('escapes the characters that would break out of markup', () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;',
    );
  });
});

describe('renderChangelogHtml', () => {
  it('renders a version heading that links to the compare URL', () => {
    const html = renderChangelogHtml(parseChangelog(SAMPLE));
    expect(html).toContain('<a href="https://example.com/compare/v0.1.0...v0.2.0">0.2.0</a>');
  });

  it('renders a plain version heading when there is no compare URL', () => {
    const html = renderChangelogHtml(parseChangelog(SAMPLE));
    expect(html).toContain('<h2>0.1.0</h2>');
  });

  it('renders each entry with its references as links', () => {
    const html = renderChangelogHtml(parseChangelog(SAMPLE));
    expect(html).toContain(
      '<li>add per-PR preview deploys <span class="refs">' +
        '<a href="https://example.com/issues/219">#219</a>, ' +
        '<a href="https://example.com/commit/32b8ed9">32b8ed9</a></span></li>',
    );
  });

  it('escapes entry text rather than trusting the commit subject', () => {
    const releases: ChangelogRelease[] = [
      {
        version: '1.0.0',
        sections: [{ title: 'Features', entries: [{ text: '<script>alert(1)</script>', links: [] }] }],
      },
    ];
    const html = renderChangelogHtml(releases);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders bold and code spans inside an entry', () => {
    const releases: ChangelogRelease[] = [
      {
        version: '1.0.0',
        sections: [{ title: 'Features', entries: [{ text: '**deps:** bump `phaser`', links: [] }] }],
      },
    ];
    expect(renderChangelogHtml(releases)).toContain(
      '<li><strong>deps:</strong> bump <code>phaser</code></li>',
    );
  });

  it('refuses to render a non-http link as a link', () => {
    const releases: ChangelogRelease[] = [
      {
        version: '1.0.0',
        sections: [
          {
            title: 'Features',
            entries: [{ text: 'thing', links: [{ text: 'x', url: 'javascript:alert(1)' }] }],
          },
        ],
      },
    ];
    const html = renderChangelogHtml(releases);
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<span class="refs">x</span>');
  });

  it('says so when there are no releases', () => {
    expect(renderChangelogHtml([])).toContain('No releases yet.');
  });
});
