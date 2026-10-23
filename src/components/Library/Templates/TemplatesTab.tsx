import { templateCategoryLabel } from "./templateHelpers";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTemplateStore } from "../../../stores/templateStore";
import type { TemplateFilter } from "../types";
import { deleteTemplateButton, renamePrimaryButton, renameSecondaryButton } from "../styles";
import { FilterRow, LibraryEmptyState } from "../shared";
import { TemplateCard, type TemplateMenuAction, type TemplateMenuState } from "./TemplateCard";

const TemplateEditorModal = lazy(() => import("../../Templates/TemplateEditorModal").then((module) => ({ default: module.TemplateEditorModal })));

export function TemplatesTab() {
  const [activeFilter, setActiveFilter] = useState<TemplateFilter>("scriptures");
  const [menuState, setMenuState] = useState<TemplateMenuState | null>(null);
  const [renameTemplateId, setRenameTemplateId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTemplateId, setEditorTemplateId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const initialized = useTemplateStore((s) => s.initialized);
  const loading = useTemplateStore((s) => s.loading);
  const templates = useTemplateStore((s) => s.templates);
  const defaults = useTemplateStore((s) => s.defaults);
  const initialize = useTemplateStore((s) => s.initialize);
  const makeDefault = useTemplateStore((s) => s.makeDefault);
  const renameTemplate = useTemplateStore((s) => s.renameTemplate);
  const deleteTemplate = useTemplateStore((s) => s.deleteTemplate);
  const duplicateTemplate = useTemplateStore((s) => s.duplicateTemplate);

  const visibleTemplates = useMemo(
    () => templates.filter((entry) => entry.category === activeFilter),
    [activeFilter, templates],
  );

  const menuTemplate = useMemo(
    () => (menuState ? templates.find((entry) => entry.id === menuState.templateId) ?? null : null),
    [menuState, templates],
  );

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (!menuState) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuState(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuState(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuState]);

  const openCreateModal = () => {
    setEditorMode("create");
    setEditorTemplateId(null);
    setEditorOpen(true);
    setMenuState(null);
  };

  const openEditModal = useCallback((templateId: string) => {
    setEditorMode("edit");
    setEditorTemplateId(templateId);
    setEditorOpen(true);
    setMenuState(null);
  }, []);

  const handleTemplateContextMenu = useCallback((event: React.MouseEvent, templateId: string) => {
    setMenuState({ templateId, x: event.clientX, y: event.clientY });
  }, []);

  const executeMenuAction = async (action: TemplateMenuAction) => {
    if (!menuTemplate) {
      setMenuState(null);
      return;
    }

    if (action === "edit") {
      openEditModal(menuTemplate.id);
      return;
    }

    if (action === "makeDefault") {
      await makeDefault(menuTemplate.category, menuTemplate.layout, menuTemplate.id);
      setMenuState(null);
      return;
    }

    if (action === "rename") {
      setRenameTemplateId(menuTemplate.id);
      setRenameValue(menuTemplate.name);
      setMenuState(null);
      return;
    }

    if (action === "delete") {
      setDeleteTemplateId(menuTemplate.id);
      setMenuState(null);
      return;
    }

    if (action === "duplicate") {
      await duplicateTemplate(menuTemplate.id);
      setMenuState(null);
    }
  };

  const menuLeft = menuState ? Math.min(menuState.x, window.innerWidth - 236) : 0;
  const menuTop = menuState ? Math.min(menuState.y, window.innerHeight - 250) : 0;
  const renameTargetTemplate = renameTemplateId ? templates.find((template) => template.id === renameTemplateId) : null;
  const deleteTargetTemplate = deleteTemplateId ? templates.find((template) => template.id === deleteTemplateId) : null;

  const closeRename = () => {
    setRenameTemplateId(null);
    setRenameValue("");
  };

  const confirmRename = async () => {
    const name = renameValue.trim();
    if (!renameTemplateId || !name) return;
    await renameTemplate(renameTemplateId, name);
    closeRename();
  };

  const closeDeleteConfirmation = () => setDeleteTemplateId(null);

  const confirmDelete = async () => {
    if (!deleteTemplateId) return;
    await deleteTemplate(deleteTemplateId);
    closeDeleteConfirmation();
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", position: "relative" }}>
      <div
        style={{
          width: 160,
          flexShrink: 0,
          borderRight: "1px solid var(--border-base)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {(["scriptures", "songs"] as TemplateFilter[]).map((filter) => (
          <FilterRow
            key={filter}
            label={filter === "scriptures" ? "Scriptures" : "Songs"}
            isActive={activeFilter === filter}
            onClick={() => setActiveFilter(filter)}
          />
        ))}

        <div
          style={{
            marginTop: "auto",
            padding: "10px",
            borderTop: "1px solid var(--border-base)",
            display: "flex",
            justifyContent: "flex-start",
          }}
        >
          <button
            type="button"
              onClick={openCreateModal}
            aria-label={`Add ${templateCategoryLabel(activeFilter).toLowerCase()} template`}
            title={`Add ${templateCategoryLabel(activeFilter)} template`}
            style={{
              width: "30px",
              height: "30px",
              border: "none",
              borderRadius: "8px",
              background: "var(--bg-elevated)",
              color: "var(--fg-base)",
              fontFamily: "var(--font-mono)",
              fontSize: "18px",
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            +
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "auto", padding: "14px" }}>
        {!initialized || loading ? (
          <LibraryEmptyState title="Loading templates..." />
        ) : visibleTemplates.length === 0 ? (
          <LibraryEmptyState title={`No ${templateCategoryLabel(activeFilter).toLowerCase()} templates yet`} />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "12px",
            }}
          >
            {visibleTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                isDefault={defaults[template.category][template.layout] === template.id}
                onOpenEdit={openEditModal}
                onContextMenu={handleTemplateContextMenu}
              />
            ))}
          </div>
        )}
      </div>

      {menuState && menuTemplate ? (
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
      ) : null}

      {renameTargetTemplate ? createPortal(
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeRename();
          }}
          style={{ position: "fixed", inset: 0, zIndex: 100, display: "grid", placeItems: "center", padding: 20, background: "rgba(8, 9, 14, 0.58)" }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="rename-template-title" style={{ width: "min(420px, 100%)", boxSizing: "border-box", padding: 18, border: "1px solid var(--border-base)", borderRadius: 10, background: "var(--bg-surface)", boxShadow: "var(--shadow-lg)" }}>
            <h2 id="rename-template-title" style={{ margin: 0, color: "var(--fg-base)", fontSize: 16 }}>Rename template</h2>
            <p style={{ margin: "6px 0 14px", color: "var(--fg-muted)", fontSize: 12 }}>{renameTargetTemplate.name}</p>
            <input
              autoFocus
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void confirmRename();
                if (event.key === "Escape") closeRename();
              }}
              aria-label="Template name"
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 11px", border: "none", borderRadius: 6, outline: "2px solid var(--color-primary)", background: "var(--bg-base)", color: "var(--fg-base)", fontSize: 13 }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button type="button" onClick={closeRename} style={renameSecondaryButton}>Cancel</button>
              <button type="button" onClick={() => void confirmRename()} disabled={!renameValue.trim()} style={{ ...renamePrimaryButton, opacity: renameValue.trim() ? 1 : 0.5 }}>Rename</button>
            </div>
          </section>
        </div>,
        globalThis.document.body,
      ) : null}

      {deleteTargetTemplate ? createPortal(
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDeleteConfirmation();
          }}
          style={{ position: "fixed", inset: 0, zIndex: 100, display: "grid", placeItems: "center", padding: 20, background: "rgba(8, 9, 14, 0.58)" }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="delete-template-title" aria-describedby="delete-template-description" style={{ width: "min(420px, 100%)", boxSizing: "border-box", padding: 18, border: "1px solid var(--border-base)", borderRadius: 10, background: "var(--bg-surface)", boxShadow: "var(--shadow-lg)" }}>
            <h2 id="delete-template-title" style={{ margin: 0, color: "var(--fg-base)", fontSize: 16 }}>Delete template?</h2>
            <p id="delete-template-description" style={{ margin: "6px 0 14px", color: "var(--fg-muted)", fontSize: 12, lineHeight: 1.5 }}>
              Delete &ldquo;{deleteTargetTemplate.name}&rdquo;? This cannot be undone.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" autoFocus onClick={closeDeleteConfirmation} style={renameSecondaryButton}>Cancel</button>
              <button type="button" onClick={() => void confirmDelete()} style={deleteTemplateButton}>Delete</button>
            </div>
          </section>
        </div>,
        globalThis.document.body,
      ) : null}

      {editorOpen ? (
        <Suspense fallback={<div role="status" style={{ position: "fixed", inset: 0, zIndex: 1300, display: "grid", placeItems: "center", background: "var(--bg-base)", color: "var(--fg-base)" }}>Opening template editor...</div>}>
          <TemplateEditorModal
            open
            mode={editorMode}
            category={activeFilter}
            templateId={editorTemplateId}
            onClose={() => setEditorOpen(false)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
