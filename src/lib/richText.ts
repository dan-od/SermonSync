const TOKEN_PATTERN = /\{[a-zA-Z0-9_]+\}/g;
const HTML_PATTERN = /<\/?[a-z][\s\S]*>/i;

const ALLOWED_TAGS = new Set(["BR", "DIV", "P", "SPAN", "B", "STRONG", "I", "EM", "U"]);
const ALLOWED_STYLE_PROPS = new Set([
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "line-height",
  "text-decoration",
  "-webkit-text-stroke-color",
  "-webkit-text-stroke-width",
]);

export function isRichTextHtml(content: string) {
  return HTML_PATTERN.test(content);
}

export function escapeHtml(content: string) {
  return content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function plainTextToHtml(content: string) {
  return escapeHtml(content).replace(/\n/g, "<br>");
}

export function contentToEditableHtml(content: string) {
  return isRichTextHtml(content) ? sanitizeRichTextHtml(content) : plainTextToHtml(content);
}

export function sanitizeRichTextHtml(content: string) {
  if (typeof document === "undefined") {
    return isRichTextHtml(content) ? content : plainTextToHtml(content);
  }

  const template = document.createElement("template");
  template.innerHTML = content;
  sanitizeNode(template.content);
  return template.innerHTML;
}

/**
 * Removes an inline style override (e.g. a prior per-word font-size) from every element in
 * rich text content, so a whole-box property change (applied while nothing is highlighted)
 * takes visible effect instead of being masked by leftover per-run formatting.
 */
export function stripInlineStyleProperties(content: string, cssProps: string[]) {
  if (typeof document === "undefined" || !isRichTextHtml(content)) {
    return content;
  }

  const template = document.createElement("template");
  template.innerHTML = content;
  Array.from(template.content.querySelectorAll<HTMLElement>("*")).forEach((element) => {
    cssProps.forEach((prop) => element.style.removeProperty(prop));
    if (!element.getAttribute("style")) {
      element.removeAttribute("style");
    }
  });
  return template.innerHTML;
}

export function resolveRichTextTokens(content: string, replacements: Record<string, string>) {
  if (!isRichTextHtml(content)) {
    return escapeHtml(resolvePlainTokens(content, replacements)).replace(/\n/g, "<br>");
  }

  const tokenized = content.replace(TOKEN_PATTERN, (token) => {
    const key = token.slice(1, -1);
    return escapeHtml(replacements[key] ?? token).replace(/\n/g, "<br>");
  });
  return sanitizeRichTextHtml(tokenized);
}

function resolvePlainTokens(content: string, replacements: Record<string, string>) {
  return content.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, token: string) => replacements[token] ?? `{${token}}`);
}

function sanitizeNode(node: Node) {
  Array.from(node.childNodes).forEach((child) => {
    if (child.nodeType === Node.ELEMENT_NODE) {
      sanitizeElement(child as HTMLElement);
      sanitizeNode(child);
    } else if (child.nodeType !== Node.TEXT_NODE) {
      child.remove();
    }
  });
}

function sanitizeElement(element: HTMLElement) {
  if (!ALLOWED_TAGS.has(element.tagName)) {
    sanitizeNode(element);
    element.replaceWith(...Array.from(element.childNodes));
    return;
  }

  Array.from(element.attributes).forEach((attribute) => {
    if (attribute.name !== "style") {
      element.removeAttribute(attribute.name);
    }
  });

  const nextStyle: string[] = [];
  Array.from(element.style).forEach((prop) => {
    if (!ALLOWED_STYLE_PROPS.has(prop)) {
      return;
    }
    const value = element.style.getPropertyValue(prop);
    if (!value || /url\s*\(|expression\s*\(/i.test(value)) {
      return;
    }
    nextStyle.push(`${prop}: ${value}`);
  });

  if (nextStyle.length > 0) {
    element.setAttribute("style", nextStyle.join("; "));
  } else {
    element.removeAttribute("style");
  }
}
