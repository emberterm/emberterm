// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { ImageBudget, bytesToDataUrl, deferImages, enhanceImages, loadImages } from "./images.js";

const DOC = "D:\\code\\api\\README.md";

function html(src: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = src;
  return root;
}

describe("bytesToDataUrl", () => {
  it("encodes bytes with the extension's MIME type", () => {
    expect(bytesToDataUrl(new Uint8Array([1, 2, 3]), "png")).toBe("data:image/png;base64,AQID");
    expect(bytesToDataUrl(new Uint8Array([1]), "SVG")).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(bytesToDataUrl(new Uint8Array([1]), "jpg")).toMatch(/^data:image\/jpeg;/);
  });

  it("handles more bytes than one String.fromCharCode call takes", () => {
    const big = new Uint8Array(200_000).fill(65);
    const url = bytesToDataUrl(big, "png");
    expect(atob(url.split(",")[1])).toHaveLength(200_000);
  });
});

describe("ImageBudget", () => {
  it("accepts bytes until the limit, and once one does not fit nothing more is taken", () => {
    const b = new ImageBudget(10);
    expect(b.take(6)).toBe(true);
    expect(b.remaining).toBe(4);
    expect(b.take(6)).toBe(false);
    expect(b.remaining).toBe(0);
    expect(b.take(1)).toBe(false);
  });
});

describe("enhanceImages", () => {
  it("blocks remote images without loading anything", async () => {
    const load = vi.fn();
    const root = html('<img src="https://x.dev/a.png" alt="logo"><img src="//x.dev/b.png" alt="two">');
    await enhanceImages(root, DOC, load, new ImageBudget());
    expect(load).not.toHaveBeenCalled();
    expect(root.querySelector("img")).toBeNull();
    const notes = [...root.querySelectorAll(".blocked-image")].map((n) => n.textContent);
    expect(notes).toEqual(["Remote image blocked: logo", "Remote image blocked: two"]);
  });

  it("loads a relative image from the resolved path as a data URL", async () => {
    const load = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const root = html('<img src="img/a.png" alt="a">');
    await enhanceImages(root, DOC, load, new ImageBudget());
    expect(load).toHaveBeenCalledWith("D:\\code\\api\\img\\a.png");
    expect(root.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,AQID");
  });

  it("blocks files that are not allowed image types, and images that fail to load", async () => {
    const load = vi.fn(async (p: string) => {
      if (p.endsWith("gone.png")) throw { code: "not_found" };
      return new Uint8Array([1]);
    });
    const root = html('<img src="a.exe" alt="x"><img src="gone.png" alt="y"><img alt="z">');
    await enhanceImages(root, DOC, load, new ImageBudget());
    expect(load).toHaveBeenCalledTimes(1);
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelectorAll(".blocked-image")).toHaveLength(3);
  });

  it("leaves data: images alone", async () => {
    const load = vi.fn();
    const root = html('<img src="data:image/png;base64,AAAA" alt="d">');
    await enhanceImages(root, DOC, load, new ImageBudget());
    expect(load).not.toHaveBeenCalled();
    expect(root.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,AAAA");
  });

  it("stops loading once the document's budget is spent", async () => {
    const load = vi.fn(async () => new Uint8Array(1));
    const root = html(Array.from({ length: 300 }, (_, i) => `<img src="a${i}.png" alt="a">`).join(""));
    await enhanceImages(root, DOC, load, new ImageBudget(5));
    expect(load).toHaveBeenCalledTimes(5);
    expect(root.querySelectorAll("img")).toHaveLength(5);
    expect(root.querySelectorAll(".blocked-image")).toHaveLength(295);
  });

  it("blocks an image bigger than what is left of the budget", async () => {
    const load = vi.fn(async () => new Uint8Array(6));
    const root = html('<img src="a.png" alt="a"><img src="b.png" alt="b">');
    await enhanceImages(root, DOC, load, new ImageBudget(10));
    expect(root.querySelectorAll("img")).toHaveLength(1);
    expect(root.querySelectorAll(".blocked-image")).toHaveLength(1);
  });
});

describe("deferImages and loadImages", () => {
  it("takes the src off local images at once, so nothing is requested from the app's own origin", () => {
    const root = html('<img src="a.png" alt="a"><img src="https://x.dev/r.png" alt="r"><img src="data:image/png;base64,AAAA" alt="d">');
    deferImages(root);
    const imgs = [...root.querySelectorAll("img")];
    expect(imgs).toHaveLength(2);
    expect(imgs[0].hasAttribute("src")).toBe(false);
    expect(imgs[0].getAttribute("data-pending-src")).toBe("a.png");
    expect(imgs[1].getAttribute("src")).toBe("data:image/png;base64,AAAA");
    expect(root.querySelector(".blocked-image")?.textContent).toBe("Remote image blocked: r");
  });

  it("fills the images in afterwards", async () => {
    const load = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const root = html('<img src="a.png" alt="a">');
    deferImages(root);
    await loadImages(root, DOC, load, new ImageBudget());
    const img = root.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("data:image/png;base64,AQID");
    expect(img.hasAttribute("data-pending-src")).toBe(false);
  });

  it("reads an image used several times once", async () => {
    const load = vi.fn(async () => new Uint8Array([1]));
    const root = html('<img src="a.png" alt="1"><img src="./a.png" alt="2"><img src="a.png" alt="3">');
    await enhanceImages(root, DOC, load, new ImageBudget());
    expect(load).toHaveBeenCalledTimes(1);
    expect([...root.querySelectorAll("img")].every((i) => i.getAttribute("src")?.startsWith("data:image/png"))).toBe(true);
  });

  it("stops reading once an image did not fit the budget", async () => {
    const load = vi.fn(async (p: string) => new Uint8Array(p.endsWith("big.png") ? 12 : 1));
    const root = html('<img src="big.png" alt="b"><img src="small.png" alt="s">');
    await enhanceImages(root, DOC, load, new ImageBudget(10));
    expect(load).toHaveBeenCalledTimes(1);
    expect(root.querySelectorAll("img")).toHaveLength(0);
    expect(root.querySelectorAll(".blocked-image")).toHaveLength(2);
  });

  it("stops at once when the render it belongs to was replaced", async () => {
    let cancelled = false;
    const load = vi.fn(async () => {
      cancelled = true;
      return new Uint8Array([1]);
    });
    const root = html('<img src="a.png" alt="a"><img src="b.png" alt="b"><img src="c.png" alt="c">');
    deferImages(root);
    await loadImages(root, DOC, load, new ImageBudget(), () => cancelled);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
