import type { PreviewError } from "../ipc/client.js";
import { formatSize } from "./format.js";

const FALLBACK = "Could not open the preview";

/** Plain-words text for a rejected preview command (see `PreviewError` in preview.rs). */
export function previewErrorMessage(e: unknown): string {
  if (typeof e !== "object" || e === null) return FALLBACK;
  const err = e as Partial<PreviewError>;
  switch (err.code) {
    case "not_found": return "File not found";
    case "too_large": return `File is over ${formatSize(err.limit ?? 0)}, too large to preview`;
    case "not_markdown": return "Only Markdown files (.md, .markdown) can be previewed";
    case "not_an_image": return "Not a supported image";
    case "not_a_file": return "That is not a file";
    case "unresolvable": return err.reason ?? "Could not resolve that path";
    case "io": return err.message ?? "Could not read the file";
    default: return FALLBACK;
  }
}
