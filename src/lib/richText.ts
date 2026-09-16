const TOKEN_PATTERN = /\{[a-zA-Z0-9_]+\}/g;
const HTML_PATTERN = /<\/?[a-z][\s\S]*>/i;

const ALLOWED_TAGS = new Set(["BR", "DIV", "P", "SPAN", "B", "STRONG", "I", "EM", "U", "SUP", "SUB"]);
const ALLOWED_STYLE_PROPS = new Set([
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "line-height",
  "text-decoration",
  "background-color",
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

export type RichTextScript = "superscript" | "subscript";

export function resolveRichTextTokens(content: string, replacements: Record<string, string>, scriptStyles: Record<string, RichTextScript> = {}, backgroundStyles: Record<string, string> = {}) {
  if (!isRichTextHtml(content)) {
    return resolvePlainTokensWithStyles(content, replacements, scriptStyles, backgroundStyles);
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

function resolvePlainTokensWithStyles(content: string, replacements: Record<string, string>, scriptStyles: Record<string, RichTextScript>, backgroundStyles: Record<string, string>) {
  if (Object.keys(scriptStyles).length === 0 && Object.keys(backgroundStyles).length === 0) {
    return escapeHtml(resolvePlainTokens(content, replacements)).replace(/\n/g, "<br>");
  }

  const tokenPattern = /\{([a-zA-Z0-9_]+)\}/g;
  let output = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(content)) !== null) {
    output += renderStyledCharacters(content.slice(cursor, match.index), cursor, scriptStyles, backgroundStyles);
    const replacement = replacements[match[1]] ?? match[0];
    output += renderReplacement(replacement, match.index, match.index + match[0].length, scriptStyles, backgroundStyles);
    cursor = match.index + match[0].length;
  }
  output += renderStyledCharacters(content.slice(cursor), cursor, scriptStyles, backgroundStyles);
  return output;
}

function renderReplacement(text: string, sourceStart: number, sourceEnd: number, scriptStyles: Record<string, RichTextScript>, backgroundStyles: Record<string, string>) {
  const modes = Object.entries(scriptStyles)
    .filter(([index]) => Number(index) >= sourceStart && Number(index) < sourceEnd)
    .map(([, mode]) => mode);
  const mode = modes[0];
  const replacementStyles = mode
    ? Object.fromEntries(Array.from({ length: text.length }, (_, index) => [String(index), mode]))
    : {};
  const backgrounds = Object.entries(backgroundStyles)
    .filter(([index]) => Number(index) >= sourceStart && Number(index) < sourceEnd)
    .map(([, color]) => color);
  const replacementBackgrounds = backgrounds.length > 0
    ? Object.fromEntries(Array.from({ length: text.length }, (_, index) => [String(index), backgrounds[0]]))
    : {};
  return renderStyledCharacters(text, 0, replacementStyles, replacementBackgrounds);
}

function renderStyledCharacters(text: string, sourceStart: number, scriptStyles: Record<string, RichTextScript>, backgroundStyles: Record<string, string>) {
  let output = "";
  let run = "";
  let runMode: RichTextScript | undefined;
  let runBackground: string | undefined;
  const flush = () => {
    if (!run) return;
    const escaped = escapeHtml(run).replace(/\n/g, "<br>");
    const styled = runBackground ? `<span style="background-color: ${escapeHtml(runBackground)}">${escaped}</span>` : escaped;
    output += runMode ? `<${runMode === "superscript" ? "sup" : "sub"} style="font-size: 0.6em">${styled}</${runMode === "superscript" ? "sup" : "sub"}>` : styled;
    run = "";
  };

  for (let offset = 0; offset < text.length; offset += 1) {
    const mode = scriptStyles[String(sourceStart + offset)];
    const background = backgroundStyles[String(sourceStart + offset)];
    if (mode !== runMode || background !== runBackground) {
      flush();
      runMode = mode;
      runBackground = background;
    }
    run += text[offset];
  }
  flush();
  return output;
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
