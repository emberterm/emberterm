import type { ReleaseNote } from "../ipc/client.js";

export interface NoteEntry {
  version: string;
  /** ISO date of the release, when known. */
  date: string | null;
  /** The release page, when known. */
  url: string | null;
  /** Highlights, Changes and Fixes as Markdown, trimmed from the release body. */
  markdown: string;
}

type Version = [number, number, number];

/** `1.2.3` or `v1.2.3`; anything else (a suffix, two parts) is not a stable version. */
export function parseVersion(v: string): Version | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Negative, 0 or positive. Either side unreadable gives 0: no guess is better than a wrong order. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return 0;
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

const KEPT = new Set(["Highlights", "Changes", "Fixes"]);

/**
 * The release body without the parts that are noise in an update card: only the Highlights, Changes
 * and Fixes sections stay (pull requests, contributors and the compare link go). A `###` line inside
 * a code fence is text, not a heading.
 */
export function trimNotes(body: string): string {
  const sections: { heading: string; lines: string[] }[] = [];
  let current: { heading: string; lines: string[] } | null = null;
  let fenced = false;
  for (const line of body.replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = fenced ? null : /^### (.+?)\s*$/.exec(line);
    if (heading) {
      current = { heading: heading[1], lines: [] };
      sections.push(current);
    } else {
      current?.lines.push(line);
    }
  }
  return sections
    .filter((s) => KEPT.has(s.heading))
    .map((s) => ({ ...s, text: s.lines.join("\n").trim() }))
    .filter((s) => s.text)
    .map((s) => `### ${s.heading}\n\n${s.text}`)
    .join("\n\n");
}

/** The releases after `current`, up to and including `next`, newest first. */
export function releasesBetween(releases: ReleaseNote[], current: string, next: string): ReleaseNote[] {
  if (!parseVersion(current) || !parseVersion(next)) return [];
  return releases
    .filter((r) => parseVersion(r.version) && compareVersions(r.version, current) > 0 && compareVersions(r.version, next) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version));
}

/**
 * Entries for the card, newest first. The newest release is always there: when the releases list did
 * not return it, it is built from the notes the update feed itself carries.
 */
export function buildEntries(
  range: ReleaseNote[],
  update: { version: string; date?: string; body?: string },
): NoteEntry[] {
  const entries = range.map((r) => ({
    version: r.version,
    date: r.published_at,
    url: r.url,
    markdown: trimNotes(r.body),
  }));
  if (entries.some((e) => e.version === update.version)) return entries;
  const newest = { version: update.version, date: update.date ?? null, url: null, markdown: trimNotes(update.body ?? "") };
  return [newest, ...entries];
}

/** The "Full changelog" compare link of a release body. */
export function compareUrl(body: string | undefined): string | null {
  return body?.match(/\*\*Full changelog\*\*:\s*(https?:\/\/\S+)/)?.[1] ?? null;
}

/** "Nov 30", or "Nov 30, 2026" when it is not this year. Empty for a missing or invalid date. */
export function formatReleaseDate(iso: string | null | undefined, now: Date = new Date(), locale = "en-US"): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getUTCFullYear() === now.getUTCFullYear();
  return new Intl.DateTimeFormat(locale, {
    month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC",
  }).format(d);
}
