import type { useTemplateStore } from "../../../stores/templateStore";
import { templateCategoryLabel, type TemplateMenuAction } from "./templateUtils";

export function TemplateContextMenu({
  menuRef,
  menuLeft,
  menuTop,
  menuTemplate,
  executeMenuAction,
}: {
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuLeft: number;
  menuTop: number;
  menuTemplate: ReturnType<typeof useTemplateStore.getState>["templates"][number];
  executeMenuAction: (action: TemplateMenuAction) => Promise<void>;
}) {
  return (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: "fixed",
        left: `${menuLeft}px`,
        top: `${menuTop}px`,
        width: "220px",
        background: "var(--bg-surface)",
        border: "none",
        borderRadius: "8px",
        boxShadow: "var(--shadow-lg)",
        padding: "4px",
        zIndex: 90,
      }}
    >
      {([
        { id: "edit", label: "Edit" },
        { id: "makeDefault", label: `Make default ${templateCategoryLabel(menuTemplate.category)} ${menuTemplate.layout === "lower-third" ? "Lower Third" : "Widescreen"} theme` },
        { id: "rename", label: "Rename" },
        { id: "delete", label: "Delete" },
        { id: "duplicate", label: "Duplicate" },
      ] as Array<{ id: TemplateMenuAction; label: string }>).map((entry) => (
        <button
          key={entry.id}
          type="button"
          role="menuitem"
          onClick={() => executeMenuAction(entry.id)}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = entry.id === "delete" ? "rgba(255, 75, 96, 0.14)" : "var(--color-primary-muted)";
          }}
          onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
          style={{
            width: "100%",
            border: "none",
            background: "transparent",
            borderRadius: "6px",
            padding: "8px 9px",
            textAlign: "left",
            color: entry.id === "delete" ? "var(--color-error)" : "var(--fg-base)",
            fontFamily: "var(--font-sans)",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}
