// A document from a cloned repo is untrusted input. These tags and attributes never reach the panel.
const FORBID_TAGS = [
  "style", "script", "iframe", "form", "object", "embed",
  // Anything that loads or navigates by itself (image maps, media, inline SVG, srcset sources),
  // and every form control: Markdown needs none of them, and the CSP should not be the only wall.
  "map", "area", "source", "track", "video", "audio", "svg", "image", "math", "canvas",
  "button", "textarea", "select", "option", "optgroup", "datalist", "fieldset", "link", "meta", "base",
];
const FORBID_ATTR = ["style", "srcset", "sizes", "poster", "background", "usemap", "formaction", "ping"];
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
    FORBID_ATTR,
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
