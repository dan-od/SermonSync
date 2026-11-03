import { useEffect, useRef, useState } from "react";
import type { HeaderMenuEntry, HeaderMenuName } from "./headerBarUtils";

export function HeaderMenuBar({ menuEntries }: { menuEntries: Record<HeaderMenuName, HeaderMenuEntry[]> }) {
  const [openMenu, setOpenMenu] = useState<HeaderMenuName | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!menuBarRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenu]);

  return (
    <div ref={menuBarRef} style={{ display: "flex", alignItems: "center", gap: 2 }}>
      {(["File", "Edit", "View", "Help"] as const).map((menu) => (
        <div key={menu} style={{ position: "relative" }} onMouseEnter={() => {
          if (openMenu) setOpenMenu(menu);
        }}>
          <button
            type="button"
            className="ss-menubar-trigger"
            data-no-drag="true"
            aria-haspopup="menu"
            aria-expanded={openMenu === menu}
            onClick={() => setOpenMenu((current) => current === menu ? null : menu)}
          >
            {menu}
          </button>
          {openMenu === menu ? (
            <div className="ss-compact-menu ss-menubar-popup" role="menu" aria-label={menu}>
              {menuEntries[menu].map((entry, index) => entry.kind === "separator" ? (
                <div key={`${menu}-separator-${index}`} className="ss-menubar-separator" role="separator" />
              ) : (
                <button
                  key={`${menu}-${entry.label}`}
                  type="button"
                  role="menuitem"
                  className="ss-compact-menu-item ss-menubar-item"
                  data-no-drag="true"
                  onClick={() => {
                    setOpenMenu(null);
                    entry.onSelect();
                  }}
                >
                  <span className="ss-menubar-check" aria-hidden="true">{entry.checked ? "✓" : ""}</span>
                  <span>{entry.label}</span>
                  {entry.shortcut ? <span className="ss-menubar-shortcut">{entry.shortcut}</span> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
