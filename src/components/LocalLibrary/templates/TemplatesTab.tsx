import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTemplateStore } from "../../../stores/templateStore";
import { TemplateEditorModal } from "../../Templates/TemplateEditorModal";
import { FilterRow, LibraryEmptyState } from "../primitives";
import type { TemplateFilter } from "../types";
import { TemplateCard } from "./TemplateCard";
import { TemplateContextMenu } from "./TemplateContextMenu";
import { DeleteTemplateDialog, RenameTemplateDialog } from "./TemplateDialogs";
import { templateCategoryLabel, type TemplateMenuAction, type TemplateMenuState } from "./templateUtils";

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
        <TemplateContextMenu
          menuRef={menuRef}
          menuLeft={menuLeft}
          menuTop={menuTop}
          menuTemplate={menuTemplate}
          executeMenuAction={executeMenuAction}
        />
      ) : null}

      {renameTargetTemplate ? (
        <RenameTemplateDialog
          renameTargetTemplate={renameTargetTemplate}
          renameValue={renameValue}
          setRenameValue={setRenameValue}
          closeRename={closeRename}
          confirmRename={confirmRename}
        />
      ) : null}

      {deleteTargetTemplate ? (
        <DeleteTemplateDialog
          deleteTargetTemplate={deleteTargetTemplate}
          closeDeleteConfirmation={closeDeleteConfirmation}
          confirmDelete={confirmDelete}
        />
      ) : null}

      <TemplateEditorModal
        open={editorOpen}
        mode={editorMode}
        category={activeFilter}
        templateId={editorTemplateId}
        onClose={() => setEditorOpen(false)}
      />
    </div>
  );
}
