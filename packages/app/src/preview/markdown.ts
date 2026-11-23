// A document from a cloned repo is untrusted input. These tags and attributes never reach the panel.
const FORBID_TAGS = ["style", "script", "iframe", "form", "object", "embed"];
// http, https, "#anchor" and relative URLs only. (`data:` on an <img> is allowed separately by DOMPurify.)
const ALLOWED_URI = /^(?:https?:|#|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i;

/**
 * Markdown to a sanitized DOM fragment. `marked` and `dompurify` are loaded on first use, so none
 * of this is in the startup bundle. The result is inserted with `replaceChildren`, never `{@html}`.
 */
export async function renderMarkdown(source: string): Promise<DocumentFragment> {
  const [{ marked }, { default: DOMPurify }] = await Promise.all([import("marked"), import("dompurify")]);
  const html = marked.parse(source, { gfm: true, async: false });
  const fragment = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    FORBID_TAGS,
    FORBID_ATTR: ["style"],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: ALLOWED_URI,
  });
  limitInputs(fragment);
  return fragment;
}

/** Task lists need checkboxes; no other form control may appear, and a checkbox is never live. */
function limitInputs(root: ParentNode): void {
  for (const input of root.querySelectorAll("input")) {
    if (input.getAttribute("type")?.toLowerCase() !== "checkbox") input.remove();
    else input.setAttribute("disabled", "");
  }
}
