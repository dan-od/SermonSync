/** Textbox formatting: superscript/subscript, auto-size and selection styles. */
import { Textbox } from "fabric";

export type StudioAutoSize = "None" | "Grow to fit" | "Shrink to fit";
type StudioScript = "none" | "superscript" | "subscript";
type TextRange = { start: number; end: number };

const SCRIPT_SCHEMAS: Record<Exclude<StudioScript, "none">, { size: number; baseline: number }> = {
  superscript: { size: 0.6, baseline: -0.35 },
  subscript: { size: 0.6, baseline: 0.11 },
};

export function normalizeStudioScript(value: unknown): StudioScript {
  return value === "superscript" || value === "subscript" ? value : "none";
}

export function scriptRange(textbox: Textbox): TextRange {
  return { start: 0, end: textbox.text.length };
}

export function applyTextScript(textbox: Textbox, mode: StudioScript, range: TextRange): void {
  const start = Math.max(0, Math.min(range.start, textbox.text.length));
  const end = Math.max(start, Math.min(range.end, textbox.text.length));
  const schema = mode === "none" ? null : SCRIPT_SCHEMAS[mode];

  for (let index = start; index < end; index += 1) {
    const style = textbox.getSelectionStyles(index, index + 1, true)[0] as Record<string, unknown> | undefined;
    const currentMode = normalizeStudioScript(style?.studioScript);
    if (currentMode === mode) continue;

    const currentFontSize = Number(style?.fontSize ?? textbox.fontSize);
    const currentDeltaY = Number(style?.deltaY ?? 0);
    let baseFontSize = Number(style?.studioScriptBaseFontSize);
    let baseDeltaY = Number(style?.studioScriptBaseDeltaY);

    if (!Number.isFinite(baseFontSize) || baseFontSize <= 0) {
      baseFontSize = currentMode === "none" ? currentFontSize : currentFontSize / SCRIPT_SCHEMAS[currentMode].size;
    }
    if (!Number.isFinite(baseDeltaY)) {
      baseDeltaY = currentMode === "none"
        ? currentDeltaY
        : currentDeltaY - baseFontSize * SCRIPT_SCHEMAS[currentMode].baseline;
    }

    if (!schema) {
      textbox.setSelectionStyles({
        fontSize: baseFontSize,
        deltaY: baseDeltaY,
        studioScript: "none",
        studioScriptBaseFontSize: null,
        studioScriptBaseDeltaY: null,
      }, index, index + 1);
    } else {
      textbox.setSelectionStyles({
        fontSize: baseFontSize * schema.size,
        deltaY: baseDeltaY + baseFontSize * schema.baseline,
        studioScript: mode,
        studioScriptBaseFontSize: baseFontSize,
        studioScriptBaseDeltaY: baseDeltaY,
      }, index, index + 1);
    }
  }
}

export function updateScriptFontSize(textbox: Textbox, range: TextRange, fontSize: number): void {
  if (!Number.isFinite(fontSize) || fontSize <= 0) return;
  const start = Math.max(0, Math.min(range.start, textbox.text.length));
  const end = Math.max(start, Math.min(range.end, textbox.text.length));
  for (let index = start; index < end; index += 1) {
    const style = textbox.getSelectionStyles(index, index + 1, true)[0] as Record<string, unknown> | undefined;
    const mode = normalizeStudioScript(style?.studioScript);
    if (mode === "none") continue;
    textbox.setSelectionStyles({
      fontSize,
      studioScriptBaseFontSize: fontSize / SCRIPT_SCHEMAS[mode].size,
    }, index, index + 1);
  }
}

function textRangeBounds(textbox: Textbox, range: TextRange): { width: number; height: number } {
  const start = Math.max(0, Math.min(range.start, textbox.text.length));
  const end = Math.max(start, Math.min(range.end, textbox.text.length));
  if (end <= start) return { width: 0, height: 0 };

  if (start === 0 && end >= textbox.text.length) {
    let height = 0;
    let width = 0;
    textbox._textLines.forEach((_line, lineIndex) => {
      width = Math.max(width, textbox.getLineWidth(lineIndex));
      height += textbox.getHeightOfLine(lineIndex);
    });
    return { width, height };
  }

  const first = textbox.get2DCursorLocation(start);
  const last = textbox.get2DCursorLocation(end - 1);
  const charBounds = textbox.__charBounds;
  let top = 0;
  let firstTop = 0;
  let left = Number.POSITIVE_INFINITY;
  let right = 0;
  let bottom = 0;

  for (let lineIndex = 0; lineIndex < textbox._textLines.length; lineIndex += 1) {
    const line = textbox._textLines[lineIndex];
    const lineStart = lineIndex === first.lineIndex ? first.charIndex : 0;
    const lineEnd = lineIndex === last.lineIndex ? Math.min(last.charIndex + 1, line.length) : line.length;
    if (lineIndex === first.lineIndex) firstTop = top;
    if (lineIndex >= first.lineIndex && lineIndex <= last.lineIndex && lineEnd > lineStart) {
      const bounds = charBounds[lineIndex];
      const firstChar = bounds?.[lineStart];
      const lastChar = bounds?.[lineEnd - 1];
      if (firstChar && lastChar) {
        left = Math.min(left, firstChar.left);
        right = Math.max(right, lastChar.left + lastChar.width);
        bottom = Math.max(bottom, top + textbox.getHeightOfLine(lineIndex));
      }
    }
    top += textbox.getHeightOfLine(lineIndex);
  }

  return {
    width: Number.isFinite(left) ? Math.max(0, right - left) : 0,
    height: Math.max(0, bottom - firstTop),
  };
}

function scaleTextRange(textbox: Textbox, range: TextRange, factor: number): void {
  const start = Math.max(0, Math.min(range.start, textbox.text.length));
  const end = Math.max(start, Math.min(range.end, textbox.text.length));
  for (let index = start; index < end; index += 1) {
    const style = textbox.getSelectionStyles(index, index + 1, true)[0] as Record<string, unknown> | undefined;
    const fontSize = Number(style?.fontSize ?? textbox.fontSize);
    if (!Number.isFinite(fontSize)) continue;
    const nextFontSize = Math.max(6, Math.min(512, Math.round(fontSize * factor * 100) / 100));
    const mode = normalizeStudioScript(style?.studioScript);
    textbox.setSelectionStyles({
      fontSize: nextFontSize,
      ...(mode !== "none" ? { studioScriptBaseFontSize: nextFontSize / SCRIPT_SCHEMAS[mode].size } : {}),
    }, index, index + 1);
  }
}

export function applyAutoSize(textbox: Textbox, mode: StudioAutoSize, range: TextRange): void {
  if (mode === "None" || !textbox.text || range.end <= range.start) return;
  const fullText = range.start === 0 && range.end >= textbox.text.length;
  const targetWidth = Math.max(1, textbox.width);
  const targetHeight = Math.max(1, textbox.studioBoxHeight ?? textbox.height);

  // Recalculate after every pass because changing font size can change line
  // wrapping, which changes the amount of space the text needs.
  for (let pass = 0; pass < 5; pass += 1) {
    textbox.initDimensions();
    const bounds = textRangeBounds(textbox, range);
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const widthFactor = targetWidth / bounds.width;
    const heightFactor = targetHeight / bounds.height;
    const factor = mode === "Grow to fit"
      ? Math.min(widthFactor, heightFactor)
      : Math.min(1, widthFactor, heightFactor);
    if (!Number.isFinite(factor) || Math.abs(factor - 1) < 0.01) return;

    if (fullText) {
      const styles = textbox.getSelectionStyles(0, textbox.text.length, true);
      const fontSizes = styles.map((style) => Number(style.fontSize ?? textbox.fontSize));
      const firstFontSize = fontSizes[0] ?? textbox.fontSize;
      const uniformFontSize = fontSizes.length > 0
        && fontSizes.every((size) => Number.isFinite(size) && Math.abs(size - firstFontSize) < 0.01);
      if (uniformFontSize) {
        textbox.cleanStyle("fontSize");
        textbox.set({ fontSize: Math.max(6, Math.min(512, Math.round(firstFontSize * factor * 100) / 100)) });
      } else {
        scaleTextRange(textbox, range, factor);
      }
    } else {
      scaleTextRange(textbox, range, factor);
    }
    textbox.dirty = true;
  }
  textbox.initDimensions();
  textbox.dirty = true;
}

// These are Fabric's character-level text properties. Properties such as
// textAlign and verticalAlign belong to the textbox as a whole because they
// describe the paragraph/container, not individual characters.
const TEXT_SELECTION_STYLE_KEYS = new Set([
  "fill",
  "stroke",
  "strokeWidth",
  "fontSize",
  "fontFamily",
  "fontWeight",
  "fontStyle",
  "underline",
  "overline",
  "linethrough",
  "textDecorationThickness",
  "textDecorationColor",
  "textBackgroundColor",
]);

export function selectionStylesFrom(props: Record<string, unknown>): Record<string, unknown> {
  const styles: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    // The inspector calls this field backgroundColor, while Fabric's
    // character-level equivalent is textBackgroundColor.
    const styleKey = key === "backgroundColor" ? "textBackgroundColor" : key;
    if (TEXT_SELECTION_STYLE_KEYS.has(styleKey)) styles[styleKey] = value;
  }
  return styles;
}

export function selectionStyleSummary(textbox: Textbox, start: number, end: number): Record<string, unknown> {
  const styles = textbox.getSelectionStyles(start, end, true);
  if (styles.length === 0) return {};
  const keys = ["fill", "stroke", "strokeWidth", "fontSize", "fontFamily", "fontWeight", "fontStyle", "underline", "overline", "linethrough", "studioScript", "textBackgroundColor"];
  return Object.fromEntries(keys.flatMap((key) => {
    const first = styles[0][key as keyof typeof styles[number]];
    return styles.every((style) => style[key as keyof typeof style] === first) ? [[key, first]] : [];
  }));
}
