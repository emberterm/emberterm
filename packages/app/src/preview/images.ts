import { resolveRelative } from "./links.js";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

/** Where a local image's path waits until it is read; the img has no `src` meanwhile. */
const PENDING = "data-pending-src";

/** `data:` URL for an image; the CSP allows `data:` images but not blob: or file: ones. */
export function bytesToDataUrl(bytes: Uint8Array, ext: string): string {
  const mime = MIME[ext.toLowerCase()] ?? "application/octet-stream";
  let binary = "";
  // String.fromCharCode(...bytes) overflows the call stack on large images, so go in chunks.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

/** How many bytes of images one document may still load. Once one does not fit, nothing more is read. */
export class ImageBudget {
  private left: number;
  constructor(maxBytes = 20 * 1024 * 1024) {
    this.left = maxBytes;
  }
  get remaining(): number {
    return this.left;
  }
  take(bytes: number): boolean {
    if (bytes > this.left) {
      this.left = 0;
      return false;
    }
    this.left -= bytes;
    return true;
  }
}

function placeholder(doc: Document, text: string): HTMLElement {
  const span = doc.createElement("span");
  span.className = "blocked-image";
  span.textContent = text;
  return span;
}

function extension(src: string): string {
  return /\.([a-z0-9]+)$/i.exec(src.split(/[?#]/)[0])?.[1].toLowerCase() ?? "";
}

/**
 * First pass, synchronous: remote images become a note, images that cannot be shown become a
 * note, and local ones lose their `src` so the webview does not request them from its own
 * origin. The document can be shown right after this; `loadImages` fills the rest in.
 */
export function deferImages(root: ParentNode): void {
  for (const img of [...root.querySelectorAll("img")]) {
    const src = img.getAttribute("src") ?? "";
    const alt = img.getAttribute("alt") ?? "";
    const doc = img.ownerDocument;
    if (src.startsWith("data:")) continue;
    if (/^(https?:)?\/\//i.test(src)) {
      img.replaceWith(placeholder(doc, `Remote image blocked: ${alt}`));
    } else if (!src || !(extension(src) in MIME)) {
      img.replaceWith(placeholder(doc, `Image not shown: ${alt || src}`));
    } else {
      img.removeAttribute("src");
      img.setAttribute(PENDING, src);
    }
  }
}

/** Reads one local image as a data URL; null if it is refused, fails to read, or does not fit. */
async function read(
  path: string,
  load: (path: string) => Promise<Uint8Array>,
  budget: ImageBudget,
): Promise<string | null> {
  if (budget.remaining <= 0) return null;
  try {
    const bytes = await load(path);
    return budget.take(bytes.length) ? bytesToDataUrl(bytes, extension(path)) : null;
  } catch {
    return null;
  }
}

/**
 * Second pass: reads the images `deferImages` set aside, one at a time and in document order, within
 * `budget`. An image used several times is read once. `isCancelled` is checked before each read and
 * after it, so a render that was replaced stops costing IO.
 */
export async function loadImages(
  root: ParentNode,
  docPath: string,
  load: (path: string) => Promise<Uint8Array>,
  budget: ImageBudget,
  isCancelled: () => boolean = () => false,
): Promise<void> {
  const cache = new Map<string, string | null>();
  for (const img of [...root.querySelectorAll(`img[${PENDING}]`)]) {
    if (isCancelled()) return;
    const src = img.getAttribute(PENDING) ?? "";
    const path = resolveRelative(docPath, src);
    let url = cache.get(path);
    if (url === undefined) {
      url = await read(path, load, budget);
      if (isCancelled()) return;
      cache.set(path, url);
    }
    if (url) {
      img.setAttribute("src", url);
      img.removeAttribute(PENDING);
    } else {
      img.replaceWith(placeholder(img.ownerDocument, `Image not shown: ${img.getAttribute("alt") || src}`));
    }
  }
}

/** Both passes at once, for a document that is not on screen yet. */
export async function enhanceImages(
  root: ParentNode,
  docPath: string,
  load: (path: string) => Promise<Uint8Array>,
  budget: ImageBudget,
): Promise<void> {
  deferImages(root);
  await loadImages(root, docPath, load, budget);
}
