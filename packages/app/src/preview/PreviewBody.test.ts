// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, unmount } from "svelte";
import { get } from "svelte/store";

vi.mock("../ipc/client.js", () => ({
  filePreviewImage: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));
vi.mock("../terminal/links.js", () => ({ openExternalLink: vi.fn() }));

import { openExternalLink } from "../terminal/links.js";
import { toasts } from "../stores/app.js";
import PreviewBody from "./PreviewBody.svelte";

const DOC = "D:\\code\\api\\README.md";
let host: HTMLElement;
let component: ReturnType<typeof mount> | undefined;

async function show(text: string, onNavigate = vi.fn()) {
  component = mount(PreviewBody, { target: host, props: { text, path: DOC, onNavigate } });
  await vi.waitFor(() => expect(host.querySelector(".md")?.childElementCount).toBeGreaterThan(0));
  return onNavigate;
}

function click(el: Element): MouseEvent {
  const e = new MouseEvent("click", { bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  toasts.set([]);
  vi.mocked(openExternalLink).mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  if (component) unmount(component);
  component = undefined;
  host.remove();
});

describe("PreviewBody", () => {
  it("renders the Markdown with heading ids", async () => {
    await show("# Hello World\n\ntext");
    expect(host.querySelector("h1")?.id).toBe("hello-world");
  });

  it("scrolls inside the panel for an #anchor link", async () => {
    const onNavigate = await show("[go](#hello-world)\n\n# Hello World");
    const e = click(host.querySelector('a[href="#hello-world"]')!);
    expect(e.defaultPrevented).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("opens a relative Markdown link in the panel", async () => {
    const onNavigate = await show("[next](docs/b.md)");
    click(host.querySelector("a")!);
    expect(onNavigate).toHaveBeenCalledWith("D:\\code\\api\\docs\\b.md");
  });

  it("sends http links to the opener", async () => {
    const onNavigate = await show("[site](https://example.com/x)");
    const e = click(host.querySelector("a")!);
    expect(e.defaultPrevented).toBe(true);
    expect(openExternalLink).toHaveBeenCalledWith(expect.anything(), "https://example.com/x");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("blocks other links with a toast and goes nowhere", async () => {
    const onNavigate = await show("[doc](manual.pdf)");
    const e = click(host.querySelector("a")!);
    expect(e.defaultPrevented).toBe(true);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(openExternalLink).not.toHaveBeenCalled();
    expect(get(toasts).map((t) => t.message)).toEqual(["Only Markdown files open in the preview"]);
  });

  it("shows a local image as a data URL and replaces a remote one", async () => {
    await show("![a](img/a.png)\n\n![r](https://example.com/r.png)");
    await vi.waitFor(() => expect(host.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,AQID"));
    expect(host.querySelector(".blocked-image")?.textContent).toBe("Remote image blocked: r");
  });
});
