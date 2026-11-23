import { resolveRelative } from "./links.js";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

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

/** How many bytes of images one document may still load. */
export class ImageBudget {
  private left: number;
  constructor(maxBytes = 20 * 1024 * 1024) {
    this.left = maxBytes;
  }
  get remaining(): number {
    return this.left;
  }
  take(bytes: number): boolean {
    if (bytes > this.left) return false;
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
 * Makes the images of a rendered document safe to show: remote ones are replaced by a note,
 * relative ones are read from disk (allowed types only, within `budget`) and inlined as data
 * URLs. Runs one image at a time so the budget is spent in document order.
 */
export async function enhanceImages(
  root: ParentNode,
  docPath: string,
  load: (path: string) => Promise<Uint8Array>,
  budget: ImageBudget,
): Promise<void> {
  for (const img of [...root.querySelectorAll("img")]) {
    const src = img.getAttribute("src") ?? "";
    const alt = img.getAttribute("alt") ?? "";
    const doc = img.ownerDocument;
    if (src.startsWith("data:")) continue;
    if (/^(https?:)?\/\//i.test(src)) {
      img.replaceWith(placeholder(doc, `Remote image blocked: ${alt}`));
      continue;
    }
    const ext = extension(src);
    if (!src || !(ext in MIME) || budget.remaining <= 0) {
      img.replaceWith(placeholder(doc, `Image not shown: ${alt || src}`));
      continue;
    }
    try {
      const bytes = await load(resolveRelative(docPath, src));
      if (!budget.take(bytes.length)) throw new Error("image budget spent");
      img.setAttribute("src", bytesToDataUrl(bytes, ext));
    } catch {
      img.replaceWith(placeholder(doc, `Image not shown: ${alt || src}`));
    }
  }
}
