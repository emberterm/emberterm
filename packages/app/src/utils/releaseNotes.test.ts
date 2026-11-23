import { describe, it, expect } from "vitest";
import type { ReleaseNote } from "../ipc/client.js";
import {
  buildEntries, compareUrl, compareVersions, formatReleaseDate, parseVersion, releasesBetween, trimNotes,
} from "./releaseNotes.js";

// The body of the v1.2.0 release, as published.
const V120 = `## 1.2.0

### Highlights

- **Your commands come back:** a reopened tab remembers its last 10 commands.
- **Right-click menu fix:** the terminal menu is no longer hidden.

### Changes

- **Command history per tab:** a reopened tab remembers its last 10 commands. (#50)

### Fixes

- The terminal right-click menu is no longer hidden behind the status bar.

### Pull requests

- **PR #47** ci(release): rebuild the site after a stable release. Thanks @arifintahu.

### Contributors

Thanks @arifintahu.

**Full changelog**: https://github.com/emberterm/emberterm/compare/v1.1.0...v1.2.0`;

const rel = (version: string, body = `### Highlights\n\n- ${version}`): ReleaseNote => ({
  tag: `v${version}`, version, published_at: "2026-11-24T10:00:00Z", body,
  url: `https://github.com/emberterm/emberterm/releases/tag/v${version}`,
});

describe("parseVersion and compareVersions", () => {
  it("reads x.y.z with or without a v", () => {
    expect(parseVersion("v1.10.2")).toEqual([1, 10, 2]);
    expect(parseVersion("0.4.0")).toEqual([0, 4, 0]);
  });

  it.each(["1.2", "1.2.3-rc.1", "x", "", "v1.2.3.4", "1.2.x"])("rejects %j", (v) => {
    expect(parseVersion(v)).toBeNull();
  });

  it("compares numbers, not text", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.2.0", "1.2.0")).toBe(0);
    expect(compareVersions("0.9.9", "1.0.0")).toBeLessThan(0);
  });

  it("treats an unparseable version as equal rather than guessing", () => {
    expect(compareVersions("junk", "1.0.0")).toBe(0);
  });
});

describe("trimNotes", () => {
  it("keeps Highlights, Changes and Fixes and drops the rest", () => {
    const out = trimNotes(V120);
    expect(out).toContain("### Highlights");
    expect(out).toContain("### Changes");
    expect(out).toContain("### Fixes");
    expect(out).toContain("Your commands come back");
    for (const gone of ["Pull requests", "PR #47", "Contributors", "Thanks @", "Full changelog", "## 1.2.0"]) {
      expect(out).not.toContain(gone);
    }
  });

  it("keeps the sections in their original order", () => {
    const out = trimNotes(V120);
    expect(out.indexOf("### Highlights")).toBeLessThan(out.indexOf("### Changes"));
    expect(out.indexOf("### Changes")).toBeLessThan(out.indexOf("### Fixes"));
  });

  it("returns an empty string when no known section is there", () => {
    expect(trimNotes("just some text")).toBe("");
    expect(trimNotes("### Pull requests\n\n- a")).toBe("");
    expect(trimNotes("")).toBe("");
  });

  it("copes with CRLF line endings", () => {
    const out = trimNotes(V120.replace(/\n/g, "\r\n"));
    expect(out).toContain("### Highlights");
    expect(out).not.toContain("Contributors");
    expect(out).not.toContain("\r");
  });

  it("does not treat a ### line inside a code fence as a heading", () => {
    const body = "### Highlights\n\n```md\n### Pull requests\n```\n\n### Fixes\n\n- a";
    const out = trimNotes(body);
    expect(out).toContain("### Pull requests");
    expect(out).toContain("### Fixes");
  });
});

describe("releasesBetween", () => {
  const all = [rel("1.1.0"), rel("1.4.0"), rel("1.2.0"), rel("1.3.0")];

  it("returns the releases after the installed one up to the new one, newest first", () => {
    expect(releasesBetween(all, "1.2.0", "1.4.0").map((r) => r.version)).toEqual(["1.4.0", "1.3.0"]);
    expect(releasesBetween(all, "1.2.0", "1.3.0").map((r) => r.version)).toEqual(["1.3.0"]);
  });

  it("ignores versions it cannot read, and returns nothing for unreadable bounds", () => {
    const odd = [...all, { ...rel("1.3.5"), version: "nightly" }];
    expect(releasesBetween(odd, "1.2.0", "1.4.0")).toHaveLength(2);
    expect(releasesBetween(all, "junk", "1.4.0")).toEqual([]);
  });

  it("returns nothing when the installed version is not older", () => {
    expect(releasesBetween(all, "1.4.0", "1.4.0")).toEqual([]);
  });
});

describe("buildEntries", () => {
  it("uses the releases in range, newest first, trimmed", () => {
    const entries = buildEntries([rel("1.4.0"), rel("1.3.0")], { version: "1.4.0", body: "ignored" });
    expect(entries.map((e) => e.version)).toEqual(["1.4.0", "1.3.0"]);
    expect(entries[0].markdown).toContain("### Highlights");
    expect(entries[0].url).toBe("https://github.com/emberterm/emberterm/releases/tag/v1.4.0");
    expect(entries[0].date).toBe("2026-11-24T10:00:00Z");
  });

  it("always has the newest release, built from the update's own notes when the list lacks it", () => {
    const entries = buildEntries([rel("1.3.0")], { version: "1.4.0", date: "2026-11-30T09:00:00Z", body: V120 });
    expect(entries.map((e) => e.version)).toEqual(["1.4.0", "1.3.0"]);
    expect(entries[0].markdown).toContain("Your commands come back");
    expect(entries[0].date).toBe("2026-11-30T09:00:00Z");
    expect(entries[0].url).toBeNull();
  });

  it("builds one entry from an empty list, and copes with no body", () => {
    expect(buildEntries([], { version: "1.4.0", body: V120 })).toHaveLength(1);
    expect(buildEntries([], { version: "1.4.0" })[0].markdown).toBe("");
  });
});

describe("compareUrl", () => {
  it("finds the Full changelog link", () => {
    expect(compareUrl(V120)).toBe("https://github.com/emberterm/emberterm/compare/v1.1.0...v1.2.0");
  });

  it("is null without one", () => {
    expect(compareUrl(undefined)).toBeNull();
    expect(compareUrl("no link here")).toBeNull();
  });
});

describe("formatReleaseDate", () => {
  it("shows month and day, and the year only when it is not this year", () => {
    expect(formatReleaseDate("2026-11-30T10:00:00Z", new Date("2026-12-01T00:00:00Z"))).toBe("Nov 30");
    expect(formatReleaseDate("2026-11-30T10:00:00Z", new Date("2027-01-05T00:00:00Z"))).toBe("Nov 30, 2026");
  });

  it("is empty for a missing or invalid date", () => {
    expect(formatReleaseDate(null)).toBe("");
    expect(formatReleaseDate(undefined)).toBe("");
    expect(formatReleaseDate("not a date")).toBe("");
  });
});
