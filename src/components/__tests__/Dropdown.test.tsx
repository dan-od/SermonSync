// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Dropdown } from "../Settings/primitives";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Dropdown", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("uses compact shared trigger, menu, and option dimensions", () => {
    act(() => root.render(
      <Dropdown
        value="a"
        options={[{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }]}
        onChange={vi.fn()}
        triggerStyle={{ height: 40, padding: 12, border: "1px solid red", borderRadius: 8 }}
        optionStyle={{ padding: 12, borderRadius: 8 }}
        menuStyle={{ padding: 16, borderRadius: 8 }}
      />,
    ));

    const trigger = container.querySelector("button");
    expect(trigger?.style.height).toBe("25px");
    expect(trigger?.style.gap).toBe("4px");
    expect(trigger?.style.padding).toBe("0px 8px");
    expect(trigger?.style.borderRadius).toBe("0");
    expect(trigger?.getAttribute("style")).not.toContain("1px solid red");

    act(() => trigger?.click());
    const menu = document.body.querySelector<HTMLElement>('[role="listbox"]');
    const option = menu?.querySelector<HTMLElement>('[role="option"]');
    expect(menu?.style.padding).toBe("4px");
    expect(menu?.style.borderRadius).toBe("0");
    expect(menu?.getAttribute("style")).not.toContain("border:");
    expect(option?.style.height).toBe("25px");
    expect(option?.style.padding).toBe("0px 8px");
    expect(option?.style.borderRadius).toBe("0");
    expect(option?.getAttribute("style")).not.toContain("border:");
  });

  it("supports one-pixel corners for scoped dropdowns", () => {
    act(() => root.render(
      <Dropdown
        value="a"
        options={[{ value: "a", label: "Alpha" }]}
        onChange={vi.fn()}
        cornerRadius={1}
      />,
    ));

    const trigger = container.querySelector("button");
    expect(trigger?.style.borderRadius).toBe("1px");
    act(() => trigger?.click());

    const menu = document.body.querySelector<HTMLElement>('[role="listbox"]');
    const option = menu?.querySelector<HTMLElement>('[role="option"]');
    expect(menu?.style.borderRadius).toBe("1px");
    expect(option?.style.borderRadius).toBe("1px");
  });
});