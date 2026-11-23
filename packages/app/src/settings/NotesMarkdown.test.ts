// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, unmount } from "svelte";

vi.mock("../terminal/links.js", () => ({ openExternalLink: vi.fn() }));

import { openExternalLink } from "../terminal/links.js";
import NotesMarkdown from "./NotesMarkdown.svelte";

let host: HTMLElement;
let component: ReturnType<typeof mount> | undefined;

async function show(markdown: string) {
  component = mount(NotesMarkdown, { target: host, props: { markdown } });
  await vi.waitFor(() => expect(host.querySelector(".notes")?.childElementCount).toBeGreaterThan(0));
}

function click(el: Element): MouseEvent {
  const e = new MouseEvent("click", { bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  vi.mocked(openExternalLink).mockClear();
});

afterEach(() => {
  if (component) unmount(component);
  component = undefined;
  host.remove();
});

describe("NotesMarkdown", () => {
  it("renders headings and lists", async () => {
    await show("### Highlights\n\n- **Faster:** it is quick\n- Second");
    expect(host.querySelector("h3")?.textContent).toBe("Highlights");
    expect(host.querySelectorAll("li")).toHaveLength(2);
    expect(host.querySelector("strong")?.textContent).toBe("Faster:");
  });

  it("is inert for hostile release text", async () => {
    await show(
      '### Highlights\n\n<img src=x onerror="alert(1)">\n\n![t](https://example.com/p.png)\n\n[x](javascript:alert(1))\n\n<script>alert(1)</script>\n\n<a href="data:text/html,<script>1</script>">d</a>',
    );
    const html = host.innerHTML.toLowerCase();
    expect(host.querySelector("img")).toBeNull();
    for (const bad of ["onerror", "javascript:", "<script", "data:text/html"]) expect(html).not.toContain(bad);
  });

  it("opens http and https links in the system browser, and nothing else", async () => {
    await show("[site](https://example.com/x) [rel](docs/a.md) [mail](mailto:a@b.c) [hash](#top)");
    const links = [...host.querySelectorAll("a")];
    const site = links.find((a) => a.textContent === "site")!;
    const e = click(site);
    expect(e.defaultPrevented).toBe(true);
    expect(openExternalLink).toHaveBeenCalledWith(expect.anything(), "https://example.com/x");
    for (const a of links.filter((l) => l !== site)) {
      const ev = click(a);
      expect(ev.defaultPrevented).toBe(true);
    }
    expect(openExternalLink).toHaveBeenCalledTimes(1);
  });

  it("does not let a middle click on a link open anything", async () => {
    await show("[site](https://example.com)");
    const e = new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 });
    host.querySelector("a")!.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
});
