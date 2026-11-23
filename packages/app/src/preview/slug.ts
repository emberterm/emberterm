/** GitHub-style heading anchor: lowercase, no punctuation, spaces to hyphens, repeats numbered. */
export function slugify(text: string, seen: Map<string, number>): string {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-");
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

/** Gives every h1–h6 under `root` an id so `#anchor` links can scroll to it. */
export function assignHeadingIds(root: ParentNode): void {
  const seen = new Map<string, number>();
  for (const h of root.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    const id = slugify(h.textContent ?? "", seen);
    if (id) h.id = id;
  }
}
