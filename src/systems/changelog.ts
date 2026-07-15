// Pure changelog parser and renderer: turns CHANGELOG.md into the "What's new"
// page. No Phaser imports, no side effects, no file IO. The caller reads the
// file; this module only transforms the string.
//
// This runs at build time (see the changelogPage plugin in vite.config.ts), not
// in the game bundle. It lives here anyway because it is exactly the kind of
// thing this repo unit tests: a pure transform with fiddly parsing rules.
//
// It parses the subset of Markdown that release-please actually emits, not
// Markdown in general:
//
//   ## [0.2.0](compare-url) (2026-07-15)     <- generated release heading
//   ## [0.1.0] - 2026-07-14                  <- the hand-written first entry
//   ### Features                             <- section
//   * add per-PR preview deploys ([#219](url)) ([32b8ed9](url))
//
// Anything before the first release heading (the file preamble) is ignored.

/** A link lifted out of an entry, for example an issue or commit reference. */
export interface ChangelogLink {
  readonly text: string;
  readonly url: string;
}

/** One bullet under a section, with its trailing references pulled out. */
export interface ChangelogEntry {
  /** The entry text with its trailing reference links removed. */
  readonly text: string;
  readonly links: readonly ChangelogLink[];
}

/** A "### Features"-style group of entries. */
export interface ChangelogSection {
  readonly title: string;
  readonly entries: readonly ChangelogEntry[];
}

/** One released version. */
export interface ChangelogRelease {
  readonly version: string;
  /** The compare URL from the heading, when release-please generated one. */
  readonly url?: string;
  readonly date?: string;
  readonly sections: readonly ChangelogSection[];
}

const RELEASE_HEADING = /^##\s+(.+?)\s*$/;
const SECTION_HEADING = /^###\s+(.+?)\s*$/;
const ENTRY = /^[*-]\s+(.+?)\s*$/;

// A trailing "([text](url))" reference group, anchored to the end of the line.
const TRAILING_LINK = /\s*\(\[([^\]]*)\]\(([^)\s]+)\)\)$/;

// "[0.2.0](url)" or "[0.1.0]" or a bare "0.2.0", followed by an optional date
// as either "(2026-07-15)" or "- 2026-07-14".
const LINKED_VERSION = /^\[([^\]]+)\]\(([^)\s]+)\)\s*(.*)$/;
const BRACKETED_VERSION = /^\[([^\]]+)\]\s*(.*)$/;
const BARE_VERSION = /^(\S+)\s*(.*)$/;
const DATE_TAIL = /^(?:\((.+)\)|-\s*(.+))$/;

interface Heading {
  readonly version: string;
  readonly url?: string;
  readonly date?: string;
}

/** Pull the date out of whatever trails the version in a release heading. */
function parseDateTail(tail: string): string | undefined {
  const match = DATE_TAIL.exec(tail.trim());
  if (match === null) {
    return undefined;
  }
  const date = match[1] ?? match[2];
  return date === undefined || date.trim() === '' ? undefined : date.trim();
}

/**
 * Build a Heading, leaving absent parts off the object entirely rather than
 * setting them to undefined, which exactOptionalPropertyTypes forbids.
 */
function makeHeading(version: string, url?: string, date?: string): Heading {
  return {
    version,
    ...(url === undefined ? {} : { url }),
    ...(date === undefined ? {} : { date }),
  };
}

/** Parse the text after "## " into a version, an optional URL, and a date. */
function parseHeading(rest: string): Heading | null {
  const linked = LINKED_VERSION.exec(rest);
  if (linked !== null) {
    return makeHeading(linked[1] ?? '', linked[2] ?? '', parseDateTail(linked[3] ?? ''));
  }
  const bracketed = BRACKETED_VERSION.exec(rest);
  if (bracketed !== null) {
    return makeHeading(bracketed[1] ?? '', undefined, parseDateTail(bracketed[2] ?? ''));
  }
  const bare = BARE_VERSION.exec(rest);
  if (bare !== null) {
    return makeHeading(bare[1] ?? '', undefined, parseDateTail(bare[2] ?? ''));
  }
  return null;
}

/** Strip trailing "([#12](url))" reference groups off an entry, keeping them. */
function parseEntry(raw: string): ChangelogEntry {
  let text = raw;
  const links: ChangelogLink[] = [];
  for (;;) {
    const match = TRAILING_LINK.exec(text);
    if (match === null) {
      break;
    }
    // Walk right to left, so unshift keeps the source order.
    links.unshift({ text: match[1] ?? '', url: match[2] ?? '' });
    text = text.slice(0, match.index);
  }
  return { text: text.trim(), links };
}

/**
 * Parse a release changelog into structured releases, newest first (source
 * order). Returns an empty array when there are no release headings at all.
 */
export function parseChangelog(markdown: string): ChangelogRelease[] {
  const releases: { version: string; url?: string; date?: string; sections: ChangelogSection[] }[] =
    [];
  let sections: ChangelogSection[] | null = null;
  let entries: ChangelogEntry[] | null = null;

  for (const line of markdown.split('\n')) {
    const release = RELEASE_HEADING.exec(line);
    if (release !== null) {
      const heading = parseHeading(release[1] ?? '');
      if (heading === null) {
        continue;
      }
      sections = [];
      entries = null;
      releases.push({ ...heading, sections });
      continue;
    }

    // Everything before the first release heading is preamble.
    if (sections === null) {
      continue;
    }

    const section = SECTION_HEADING.exec(line);
    if (section !== null) {
      entries = [];
      sections.push({ title: section[1] ?? '', entries });
      continue;
    }

    const entry = ENTRY.exec(line);
    if (entry !== null && entries !== null) {
      entries.push(parseEntry(entry[1] ?? ''));
    }
  }

  return releases;
}

/** Escape text for interpolation into HTML body content or an attribute. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Only http(s) links are rendered as links. The changelog is generated from our
// own commit messages so this is not a live threat, but a commit subject is
// still attacker-adjacent text flowing into a page, and "javascript:" in an href
// is one bad day away.
function safeUrl(url: string): string | null {
  return /^https?:\/\//i.test(url) ? url : null;
}

/** Render "**bold**" and `code` spans, escaping everything else. */
function renderInline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function renderLink(link: ChangelogLink): string {
  const url = safeUrl(link.url);
  const text = escapeHtml(link.text);
  return url === null ? text : `<a href="${escapeHtml(url)}">${text}</a>`;
}

function renderEntry(entry: ChangelogEntry): string {
  const refs = entry.links.map(renderLink).join(', ');
  const suffix = refs === '' ? '' : ` <span class="refs">${refs}</span>`;
  return `<li>${renderInline(entry.text)}${suffix}</li>`;
}

function renderSection(section: ChangelogSection): string {
  const entries = section.entries.map(renderEntry).join('\n');
  return `<h3>${renderInline(section.title)}</h3>\n<ul>\n${entries}\n</ul>`;
}

function renderRelease(release: ChangelogRelease): string {
  const version = escapeHtml(release.version);
  const url = release.url === undefined ? null : safeUrl(release.url);
  const heading = url === null ? version : `<a href="${escapeHtml(url)}">${version}</a>`;
  const date = release.date === undefined ? '' : `<p class="date">${escapeHtml(release.date)}</p>`;
  const body = release.sections.map(renderSection).join('\n');
  return `<section class="release">\n<h2>${heading}</h2>\n${date}\n${body}\n</section>`;
}

/** Render parsed releases into the HTML injected into the What's new page. */
export function renderChangelogHtml(releases: readonly ChangelogRelease[]): string {
  if (releases.length === 0) {
    return '<p class="lead">No releases yet.</p>';
  }
  return releases.map(renderRelease).join('\n');
}
