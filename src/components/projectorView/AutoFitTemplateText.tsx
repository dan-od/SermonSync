import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { TemplateLayer } from "../../types/templates";
import { textLayerStyle } from "./slideUtils";

const autoFitSizeCache = new WeakMap<Extract<TemplateLayer, { type: "text" }>, Map<string, number>>();

export function AutoFitTemplateText({ layer, text }: { layer: Extract<TemplateLayer, { type: "text" }>; text: string }) {
  const textRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(layer.fontSize);
  const [boxSize, setBoxSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const host = textRef.current;
    if (!host) return;

    const updateBoxSize = () => {
      const nextSize = { width: host.clientWidth, height: host.clientHeight };
      setBoxSize((current) => (
        current.width === nextSize.width && current.height === nextSize.height ? current : nextSize
      ));
    };

    updateBoxSize();
    const observer = new ResizeObserver(updateBoxSize);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const host = textRef.current;
    if (!host) return;
    const contentWidth = Math.max(1, host.clientWidth - 16);
    const contentHeight = Math.max(1, host.clientHeight - 16);
    const cacheKey = `${contentWidth}:${contentHeight}:${text}`;
    const cachedSize = autoFitSizeCache.get(layer)?.get(cacheKey);
    if (cachedSize !== undefined) {
      setFontSize(cachedSize);
      return;
    }
    const probes: HTMLDivElement[] = [];

    const createProbe = (width: string) => {
      const probe = document.createElement("div");
      Object.assign(probe.style, {
        position: "absolute",
        left: "-100000px",
        top: "0",
        width,
        padding: "0",
        margin: "0",
        boxSizing: "border-box",
        visibility: "hidden",
        pointerEvents: "none",
        display: "block",
        color: "transparent",
        fontFamily: layer.fontFamily,
        fontStyle: layer.fontStyle,
        fontWeight: String(layer.fontWeight),
        lineHeight: String(layer.lineHeight),
        textAlign: layer.align,
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
        wordBreak: "break-word",
      });
      probe.innerHTML = text;
      // Keep measurement nodes outside the React-managed subtree. React 19
      // reconciles the host's children while resize/template updates are
      // happening; imperatively inserting a sibling here can make WebKit
      // throw NotFoundError during its next commit.
      document.body.appendChild(probe);
      probes.push(probe);
      return probe;
    };

    const wrappedProbe = createProbe(`${contentWidth}px`);
    const fits = (size: number) => {
      wrappedProbe.style.fontSize = `${size}px`;
      wrappedProbe.style.lineHeight = `${size * layer.lineHeight + (layer.lineSpacing ?? 0)}px`;
      const wrappedHeight = Math.ceil(wrappedProbe.getBoundingClientRect().height);
      return wrappedHeight <= contentHeight;
    };

    let low = 6;
    // The saved font size is the design ceiling. Grow-to-fit may use that
    // size when the content is short, while longer content is reduced below
    // it. This prevents a measurement glitch from ever expanding text past
    // the template's intended typography.
    let high = Math.max(6, layer.fontSize);

    let best = high;
    // Most authored text already fits at its design size. Avoid a binary
    // search (and its forced layouts) unless this particular slide overflows.
    if (!fits(high)) {
      best = low;
      for (let iteration = 0; iteration < 10 && high - low > 0.25; iteration += 1) {
        const candidate = (low + high) / 2;
        if (fits(candidate)) {
          best = candidate;
          low = candidate;
        } else {
          high = candidate;
        }
      }
    }
    const nextFontSize = Math.max(6, Math.min(512, Math.round(best * 100) / 100));
    let sizes = autoFitSizeCache.get(layer);
    if (!sizes) { sizes = new Map(); autoFitSizeCache.set(layer, sizes); }
    if (sizes.size >= 24) sizes.delete(sizes.keys().next().value ?? "");
    sizes.set(cacheKey, nextFontSize);
    setFontSize(nextFontSize);

    return () => probes.forEach((probe) => probe.remove());
  }, [boxSize.height, boxSize.width, layer, text]);

  // Verify the real rendered node as a final guard. Rich text elements and
  // browser font metrics can differ slightly from a detached measurement
  // probe, so reduce only when the actual content still overflows the box.
  useLayoutEffect(() => {
    const host = textRef.current;
    const content = host?.firstElementChild;
    if (!host || !(content instanceof HTMLElement) || host.clientHeight <= 16 || fontSize <= 6) {
      return;
    }

    const availableHeight = host.clientHeight - 16;
    const requiredHeight = content.scrollHeight;
    if (requiredHeight <= availableHeight) {
      return;
    }

    const correction = Math.max(0.5, Math.min(0.98, availableHeight / requiredHeight));
    const corrected = Math.max(6, Math.round(fontSize * correction * 100) / 100);
    if (corrected < fontSize) {
      autoFitSizeCache.get(layer)?.set(`${Math.max(1, host.clientWidth - 16)}:${Math.max(1, host.clientHeight - 16)}:${text}`, corrected);
      setFontSize(corrected);
    }
  }, [fontSize, layer, text]);

  const contentStyle: CSSProperties = {
    display: "block",
    width: "100%",
    minWidth: 0,
    backgroundColor: layer.lineBackgroundColor || "transparent",
    boxDecorationBreak: "clone",
    WebkitBoxDecorationBreak: "clone",
    animation: layer.scrollDuration && layer.scrollDuration > 0 ? `templateTextScroll ${layer.scrollDuration}s linear infinite` : "none",
    ...({ "--template-scroll-gap": `${layer.scrollGap ?? 100}px` } as CSSProperties),
  };

  return (
    <div ref={textRef} style={textLayerStyle(layer, fontSize)}>
      <span style={contentStyle} dangerouslySetInnerHTML={{ __html: text }} />
    </div>
  );
}
