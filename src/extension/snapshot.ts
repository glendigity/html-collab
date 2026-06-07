const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

export function serializeReviewSnapshot(documentRef: Document, pageHref: string): string {
  return serializeDoctype(documentRef.doctype) + serializeElementSnapshot(documentRef.documentElement, snapshotBaseHref(pageHref));
}

export function snapshotBaseHref(pageHref: string): string | null {
  if (!pageHref) {
    return null;
  }

  try {
    const url = new URL(pageHref);
    if (url.protocol === "file:") {
      return null;
    }
    return pageHref;
  } catch {
    return null;
  }
}

function serializeElementSnapshot(element: Element, baseHref: string | null): string {
  const tagName = element.tagName.toLowerCase();
  if (shouldSkipSnapshotElement(element, tagName)) {
    return "";
  }

  const attributes = serializeSnapshotAttributes(element);
  const openTag = attributes ? `<${tagName} ${attributes}>` : `<${tagName}>`;
  if (VOID_ELEMENTS.has(tagName)) {
    return openTag;
  }

  const children = Array.from(element.childNodes)
    .map((child) => serializeSnapshotNode(child, baseHref))
    .join("");
  const injectedBase = tagName === "head" && baseHref ? `<base href="${escapeAttribute(baseHref)}">` : "";
  return `${openTag}${injectedBase}${children}</${tagName}>`;
}

function serializeSnapshotNode(node: Node, baseHref: string | null): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeText(node.textContent || "");
  }
  if (node.nodeType !== Node.ELEMENT_NODE || !(node instanceof Element)) {
    return "";
  }
  return serializeElementSnapshot(node, baseHref);
}

function shouldSkipSnapshotElement(element: Element, tagName: string): boolean {
  if (tagName === "script" || tagName === "base") {
    return true;
  }
  if (tagName === "meta" && element.getAttribute("http-equiv")?.toLowerCase() === "content-security-policy") {
    return true;
  }
  return false;
}

function serializeSnapshotAttributes(element: Element): string {
  return Array.from(element.attributes)
    .filter((attribute) => shouldKeepSnapshotAttribute(attribute))
    .map((attribute) => `${attribute.name}="${escapeAttribute(attribute.value)}"`)
    .join(" ");
}

function shouldKeepSnapshotAttribute(attribute: Attr): boolean {
  const name = attribute.name.toLowerCase();
  const value = attribute.value.trim().toLowerCase();
  if (name.startsWith("on")) {
    return false;
  }
  if (name === "srcdoc") {
    return false;
  }
  if ((name === "href" || name === "src" || name === "xlink:href" || name === "action") && value.startsWith("javascript:")) {
    return false;
  }
  return true;
}

function escapeText(value: string): string {
  return value.replace(/[&<>]/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    return "&gt;";
  });
}

function escapeAttribute(value: string): string {
  return value.replace(/[&"]/g, (character) => (character === "&" ? "&amp;" : "&quot;"));
}

function serializeDoctype(doctype: DocumentType | null): string {
  if (!doctype) {
    return "";
  }

  const publicId = doctype.publicId ? ` PUBLIC "${doctype.publicId}"` : "";
  const systemId = doctype.systemId ? `${publicId ? "" : " SYSTEM"} "${doctype.systemId}"` : "";
  return `<!doctype ${doctype.name}${publicId}${systemId}>\n`;
}
