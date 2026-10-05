// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OverlaysTab } from "../Overlays/OverlaysTab";
import { useOverlayStore } from "../../stores/overlayStore";
import { useProjectorStore } from "../../stores/projectorStore";
import { createOverlayDraft } from "../../types/overlays";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Overlays tab", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    window.localStorage.clear();
    useOverlayStore.setState({ overlays: [] });
    useProjectorStore.getState().reset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("creates a timer in the focused canvas studio and activates its thumbnail", () => {
    act(() => root.render(<OverlaysTab />));
    const addButton = container.querySelector<HTMLButtonElement>('button[aria-label="Add overlay"]');
    expect(addButton?.style.position).toBe("absolute");
    expect(addButton?.style.bottom).toBe("16px");
    act(() => addButton?.click());

    const studio = document.querySelector('[role="dialog"][aria-label="Overlay Canvas Studio"]');
    expect(studio).not.toBeNull();
    expect(studio?.textContent).not.toContain("Background Media");
    expect(studio?.textContent).not.toContain("Add Text");
    expect(studio?.querySelectorAll("[data-overlay-widget-id]")).toHaveLength(0);
    act(() => [...studio!.querySelectorAll("button")].find((entry) => entry.textContent?.trim() === "+ Add timer")?.click());
    expect(studio?.querySelector('[data-overlay-guides]')).not.toBeNull();
    expect(studio?.querySelector('[aria-label="Resize timer se"]')).not.toBeNull();
    const setInput = (label: string, value: string) => act(() => {
      const input = studio?.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    setInput("Countdown hours", "1");
    setInput("Countdown minutes", "2");
    setInput("Countdown seconds", "3");
    act(() => {
      const input = studio?.querySelector<HTMLTextAreaElement>('textarea[aria-label="Element text"]');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(input, "Service starts in {time}");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => studio?.querySelector<HTMLButtonElement>('button[aria-label="Add rectangle"]')?.click());
    expect(studio?.querySelector('[aria-label="Shape fill"]')).not.toBeNull();
    expect(studio?.querySelector('[aria-label="Resize shape se"]')).not.toBeNull();
    setInput("Shape fill", "#ff3300");

    const stage = studio?.querySelector<HTMLElement>('[data-overlay-stage]');
    vi.spyOn(stage!, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1920, bottom: 1080, width: 1920, height: 1080, toJSON: () => ({}) });
    const handle = studio?.querySelector<HTMLElement>('[aria-label="Resize shape se"]');
    act(() => handle?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 100, clientY: 100 })));
    act(() => handle?.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 292, clientY: 208 })));
    act(() => handle?.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 292, clientY: 208 })));
    expect(Number(studio?.querySelector<HTMLInputElement>('input[aria-label="width position or size"]')?.value)).toBeGreaterThan(26);
    act(() => [...studio!.querySelectorAll("button")].find((entry) => entry.textContent?.trim() === "Save Overlay")?.click());

    const overlay = useOverlayStore.getState().overlays[0];
    expect(overlay.kind).toBe("timer");
    const timer = overlay.elements?.find((element) => element.type === "timer");
    const shape = overlay.elements?.find((element) => element.type === "shape");
    expect(timer?.type === "timer" && timer.durationSeconds).toBe(3723);
    expect(timer?.type === "timer" && timer.text).toBe("Service starts in {time}");
    expect(shape?.type === "shape" && shape.fill).toBe("#ff3300");
    expect(shape?.width).toBeGreaterThan(26);
    expect(container.querySelector(`[data-overlay-id="${overlay.id}"]`)).not.toBeNull();
    expect(container.querySelector(`[data-overlay-widget-id="${timer?.id}"]`)?.textContent).toBe("Service starts in 01:02:03");
    expect(container.querySelector(`[data-overlay-shape-id="${shape?.id}"]`)).not.toBeNull();
    act(() => container.querySelector<HTMLButtonElement>(`button[aria-label="Show ${overlay.name} on LIVE"]`)?.click());
    expect(useProjectorStore.getState().activeOverlays[0].definition.id).toBe(overlay.id);
    expect(container.querySelector<HTMLButtonElement>(`button[aria-label="Hide ${overlay.name} on LIVE"]`)?.getAttribute("aria-pressed")).toBe("true");
  });

  it("deletes timer, alert, and shape elements from the canvas", () => {
    act(() => root.render(<OverlaysTab />));
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Add overlay"]')?.click());
    const studio = document.querySelector('[role="dialog"][aria-label="Overlay Canvas Studio"]');
    const clickButton = (label: string) => act(() => [...studio!.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === label)?.click());
    clickButton("+ Add timer");
    clickButton("+ Add quick alert");
    act(() => studio?.querySelector<HTMLButtonElement>('button[aria-label="Add ellipse"]')?.click());
    expect(studio?.querySelectorAll("[data-overlay-widget-id]")).toHaveLength(2);
    expect(studio?.querySelectorAll("[data-overlay-shape-id]")).toHaveLength(1);

    clickButton("Delete element");
    expect(studio?.querySelectorAll("[data-overlay-shape-id]")).toHaveLength(0);
    clickButton("Delete element");
    expect(studio?.querySelectorAll("[data-overlay-widget-id]")).toHaveLength(1);
    clickButton("Delete element");
    expect(studio?.querySelectorAll("[data-overlay-widget-id]")).toHaveLength(0);
    clickButton("Save Overlay");
    expect(studio?.querySelector('[role="alert"]')?.textContent).toContain("Add at least one element");
  });

  it("saves and reopens a shape with no fill or border", () => {
    act(() => root.render(<OverlaysTab />));
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Add overlay"]')?.click());
    const studio = document.querySelector('[role="dialog"][aria-label="Overlay Canvas Studio"]')!;
    act(() => studio.querySelector<HTMLButtonElement>('button[aria-label="Add triangle"]')?.click());
    act(() => studio.querySelector<HTMLButtonElement>('button[aria-label="No shape fill"]')?.click());
    act(() => studio.querySelector<HTMLButtonElement>('button[aria-label="No shape border color"]')?.click());
    expect(studio.querySelector('button[aria-label="No shape fill"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(studio.querySelector('[data-overlay-shape-id] polygon')?.getAttribute("fill")).toBe("none");
    expect(studio.querySelector('[data-overlay-shape-id] polygon')?.getAttribute("stroke")).toBe("none");
    act(() => [...studio.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Save Overlay")?.click());

    const saved = useOverlayStore.getState().overlays[0];
    expect(saved.elements?.find((element) => element.type === "shape")).toMatchObject({ fill: "", stroke: "" });
    act(() => container.querySelector(`button[aria-label="Show ${saved.name} on LIVE"]`)?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    act(() => [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((button) => button.textContent === "Edit")?.click());
    expect(document.querySelector('button[aria-label="No shape fill"]')?.getAttribute("aria-pressed")).toBe("true");
  });

  it("replaces the active overlay when another thumbnail is clicked", () => {
    const first = { ...createOverlayDraft("timer"), id: "timer-a", name: "Timer A" };
    const second = { ...createOverlayDraft("alert"), id: "alert-b", name: "Alert B" };
    useOverlayStore.setState({ overlays: [first, second] });
    act(() => root.render(<OverlaysTab />));

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Show Timer A on LIVE"]')?.click());
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Show Alert B on LIVE"]')?.click());

    expect(useProjectorStore.getState().activeOverlays.map((entry) => entry.definition.id)).toEqual(["alert-b"]);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Show Timer A on LIVE"]')?.getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Hide Alert B on LIVE"]')?.getAttribute("aria-pressed")).toBe("true");
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Hide Alert B on LIVE"]')?.click());
    expect(useProjectorStore.getState().activeOverlays).toHaveLength(0);
  });

  it("opens Edit, Rename, and Delete from a thumbnail's right-click menu", () => {
    const overlay = { id: "alert-1", name: "Notice", kind: "alert" as const, x: 25, y: 75, width: 45, message: "Service begins soon", durationSeconds: 300, backgroundColor: "#15151e", foregroundColor: "#ffffff", accentColor: "#913eff", createdAt: 1, updatedAt: 1 };
    useOverlayStore.setState({ overlays: [overlay] });
    act(() => root.render(<OverlaysTab />));
    const thumbnail = container.querySelector('button[aria-label="Show Notice on LIVE"]')!;
    act(() => thumbnail.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    expect(container.querySelector('[role="menu"]')?.textContent).toContain("Edit");
    expect(container.querySelector('[role="menu"]')?.textContent).toContain("Rename");
    expect(container.querySelector('[role="menu"]')?.textContent).toContain("Delete");
    const editOption = container.querySelector<HTMLButtonElement>('[role="menuitem"]');
    act(() => editOption?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(editOption?.style.background).toBe("var(--color-primary-muted)");
    act(() => container.querySelector<HTMLButtonElement>('[role="menuitem"]')?.click());
    const studio = document.querySelector('[role="dialog"][aria-label="Overlay Canvas Studio"]');
    expect(studio).not.toBeNull();
    act(() => studio?.querySelector<HTMLButtonElement>('button[aria-label="Close overlay studio"]')?.click());

    const openMenu = () => act(() => container.querySelector('button[aria-label="Show Notice on LIVE"]')?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    openMenu();
    act(() => [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((entry) => entry.textContent === "Rename")?.click());
    const renameDialog = document.querySelector('[role="dialog"][aria-label="Rename overlay"]');
    const input = renameDialog?.querySelector<HTMLInputElement>("input");
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "Updated notice");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => [...renameDialog!.querySelectorAll("button")].find((entry) => entry.textContent === "Save")?.click());
    expect(useOverlayStore.getState().overlays[0].name).toBe("Updated notice");

    act(() => container.querySelector('button[aria-label="Show Updated notice on LIVE"]')?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    act(() => [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((entry) => entry.textContent === "Delete")?.click());
    const deleteDialog = document.querySelector('[role="alertdialog"][aria-label="Delete overlay"]');
    act(() => [...deleteDialog!.querySelectorAll("button")].find((entry) => entry.textContent === "Delete")?.click());
    expect(useOverlayStore.getState().overlays).toHaveLength(0);
  });

  it("creates a Name overlay with editable speaker fields, shapes, and resize handles", () => {
    act(() => root.render(<OverlaysTab />));
    act(() => [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Names"))?.click());
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Add overlay"]')?.click());
    const studio = document.querySelector('[role="dialog"][aria-label="Overlay Canvas Studio"]')!;
    expect(studio.querySelector('[data-overlay-widget-id]')).not.toBeNull();
    expect(studio.querySelector('[aria-label="Resize name se"]')).not.toBeNull();
    const edit = (label: string, value: string) => act(() => {
      const input = studio.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    edit("Name", "Rev. Ada Okoro");
    edit("Speaker Title", "Guest Speaker");
    act(() => studio.querySelector<HTMLButtonElement>('button[aria-label="Add rectangle"]')?.click());
    expect(studio.querySelector('[aria-label="Shape fill"]')).not.toBeNull();
    act(() => [...studio.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Save Overlay")?.click());
    const saved = useOverlayStore.getState().overlays[0];
    expect(saved.kind).toBe("name");
    expect(saved.elements?.find((element) => element.type === "name")).toMatchObject({ text: "Rev. Ada Okoro", speakerTitle: "Guest Speaker" });
    expect(saved.elements?.some((element) => element.type === "shape")).toBe(true);
    expect(container.textContent).toContain("Rev. Ada Okoro");
    expect(container.textContent).toContain("Guest Speaker");
  });

  it("accepts a PNG watermark, preserves it in the gallery, and offers resize handles", async () => {
    act(() => root.render(<OverlaysTab />));
    act(() => [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Watermarks"))?.click());
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Add overlay"]')?.click());
    const studio = document.querySelector('[role="dialog"][aria-label="Overlay Canvas Studio"]')!;
    expect(studio.querySelector('[aria-label="Resize watermark se"]')).not.toBeNull();
    act(() => [...studio.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Save Overlay")?.click());
    expect(studio.querySelector('[role="alert"]')?.textContent).toContain("Choose a PNG");
    act(() => [...studio.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Choose PNG")?.click());
    const input = studio.querySelector<HTMLInputElement>('input[aria-label="Choose watermark PNG"]')!;
    const file = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "mark.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(studio.querySelector<HTMLImageElement>('[data-overlay-watermark-id] img')?.src).toContain("data:image/png;base64,");
    const stage = studio.querySelector<HTMLElement>('[data-overlay-stage]')!;
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1920, bottom: 1080, width: 1920, height: 1080, toJSON: () => ({}) });
    const handle = studio.querySelector<HTMLElement>('[aria-label="Resize watermark se"]')!;
    act(() => handle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 100, clientY: 100 })));
    act(() => handle.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 292, clientY: 208 })));
    act(() => handle.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 292, clientY: 208 })));
    expect(Number(studio.querySelector<HTMLInputElement>('input[aria-label="width position or size"]')?.value)).toBeGreaterThan(12);
    act(() => [...studio.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Save Overlay")?.click());
    const saved = useOverlayStore.getState().overlays[0];
    expect(saved.kind).toBe("watermark");
    expect(saved.elements?.find((element) => element.type === "watermark")).toMatchObject({ src: expect.stringContaining("data:image/png;base64,") });
    expect(saved.elements?.find((element) => element.type === "watermark")?.width).toBeGreaterThan(12);
    expect(container.querySelector('[data-overlay-watermark-id] img')).not.toBeNull();
  });

  it("selects, deselects, hides, and reorders layers from the panel and canvas", () => {
    act(() => root.render(<OverlaysTab />));
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Add overlay"]')?.click());
    const studio = document.querySelector('[role="dialog"][aria-label="Overlay Canvas Studio"]')!;
    const click = (label: string) => act(() => [...studio.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === label)?.click());
    click("+ Add name");
    act(() => studio.querySelector<HTMLButtonElement>('button[aria-label="Add rectangle"]')?.click());
    const name = studio.querySelector<HTMLElement>('[data-overlay-widget-id]')!;
    const shape = studio.querySelector<HTMLElement>('[data-overlay-shape-id]')!;
    const nameId = name.dataset.overlayWidgetId!;
    const shapeId = shape.dataset.overlayShapeId!;
    expect(studio.querySelector('[data-overlay-selection]')?.getAttribute("data-overlay-selection")).toBe(shapeId);
    expect(studio.querySelectorAll('[data-overlay-layer]')[0]?.getAttribute("data-overlay-layer")).toBe(nameId);

    act(() => studio.querySelector<HTMLButtonElement>('button[aria-label="Select Name 1"]')?.click());
    expect(studio.querySelector('[data-overlay-selection]')?.getAttribute("data-overlay-selection")).toBe(nameId);
    expect(studio.querySelector<HTMLButtonElement>('button[aria-label="Deselect Name 1"]')?.getAttribute("aria-pressed")).toBe("true");
    act(() => studio.querySelector<HTMLButtonElement>('button[aria-label="Deselect layer"]')?.click());
    expect(studio.querySelector('[data-overlay-selection]')).toBeNull();

    act(() => shape.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    expect(studio.querySelector('[data-overlay-selection]')?.getAttribute("data-overlay-selection")).toBe(shapeId);
    act(() => studio.querySelector<HTMLElement>('[data-overlay-stage]')?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    expect(studio.querySelector('[data-overlay-selection]')).toBeNull();

    act(() => studio.querySelector<HTMLButtonElement>('button[aria-label="Hide Name 1"]')?.click());
    expect(studio.querySelector('[data-overlay-widget-id]')).toBeNull();
    act(() => studio.querySelector<HTMLButtonElement>('button[aria-label="Bring Rectangle 1 forward"]')?.click());
    expect(studio.querySelectorAll('[data-overlay-layer]')[0]?.getAttribute("data-overlay-layer")).toBe(shapeId);
    click("Save Overlay");
    const saved = useOverlayStore.getState().overlays[0];
    expect(saved.elements?.map((element) => element.id)).toEqual([nameId, shapeId]);
    expect(saved.elements?.find((element) => element.id === nameId)?.visible).toBe(false);
    expect(container.querySelector('[data-overlay-widget-id]')).toBeNull();

    act(() => container.querySelector<HTMLButtonElement>(`button[aria-label="Show ${saved.name} on LIVE"]`)?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    act(() => container.querySelector<HTMLButtonElement>('[role="menuitem"]')?.click());
    const reopened = document.querySelector('[role="dialog"][aria-label="Overlay Canvas Studio"]')!;
    expect(reopened.querySelectorAll('[data-overlay-layer]')[0]?.getAttribute("data-overlay-layer")).toBe(shapeId);
    act(() => reopened.querySelector<HTMLButtonElement>('button[aria-label="Show Name 1"]')?.click());
    expect(reopened.querySelector('[data-overlay-widget-id]')).not.toBeNull();
  });
});
