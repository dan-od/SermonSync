import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";

import { isTauriRuntime } from "../libraryUtils";
import { PaneEmpty, ScriptureCellButton, ScripturePane } from "../primitives";
import { tableHeaderCellStyle } from "../styles";
import { MEDIA_CATEGORIES, fileNameFromPath, loadMediaItems, saveMediaItems, type MediaCategory, type MediaItem } from "./mediaLibrary";
import { MediaThumbnail } from "./MediaThumbnail";

export function MediaTab() {
  const [items, setItems] = useState<MediaItem[]>(() => loadMediaItems());
  const [selectedCategory, setSelectedCategory] = useState<MediaCategory>("images");
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    saveMediaItems(items);
  }, [items]);

  const countsByCategory = useMemo(() => {
    const counts: Record<MediaCategory, number> = { audio: 0, images: 0, videos: 0 };
    for (const item of items) {
      counts[item.category] += 1;
    }
    return counts;
  }, [items]);

  const visibleItems = useMemo(
    () => items.filter((item) => item.category === selectedCategory),
    [items, selectedCategory],
  );

  const handleImport = useCallback(async (category: MediaCategory) => {
    setImportError(null);
    try {
      if (!isTauriRuntime()) {
        throw new Error("Open SermonSync in Tauri to import local media files.");
      }

      const definition = MEDIA_CATEGORIES.find((entry) => entry.id === category);
      const selected = await open({
        multiple: true,
        filters: definition ? [{ name: definition.label, extensions: definition.extensions }] : undefined,
      });

      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];

      setItems((current) => {
        const existingPaths = new Set(current.map((item) => item.path));
        const additions: MediaItem[] = paths
          .filter((path) => !existingPaths.has(path))
          .map((path) => ({
            id: `${category}-${path}`,
            name: fileNameFromPath(path),
            path,
            category,
          }));
        return [...current, ...additions];
      });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Failed to import media.");
    }
  }, []);

  const handleRemove = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const activeCategoryLabel = MEDIA_CATEGORIES.find((entry) => entry.id === selectedCategory)?.label ?? "";

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Column 1: media types */}
      <ScripturePane title="Media Type" width="220px">
        {MEDIA_CATEGORIES.map((category) => {
          const isActive = selectedCategory === category.id;
          return (
            <div
              key={category.id}
              style={{ display: "flex", alignItems: "stretch" }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <ScriptureCellButton isActive={isActive} onClick={() => setSelectedCategory(category.id)}>
                  {category.label}
                  <span style={{ marginLeft: 6, color: "var(--fg-subtle)", fontWeight: 400 }}>
                    ({countsByCategory[category.id]})
                  </span>
                </ScriptureCellButton>
              </div>
              <button
                type="button"
                title={`Import ${category.label.toLowerCase()}`}
                onClick={() => void handleImport(category.id)}
                style={{
                  flexShrink: 0,
                  width: 30,
                  border: "none",
                  borderLeft: "1px solid var(--border-base)",
                  background: "transparent",
                  color: "var(--fg-muted)",
                  cursor: "pointer",
                  fontSize: "var(--text-xs)",
                  fontWeight: 700,
                }}
              >
                +
              </button>
            </div>
          );
        })}
        {importError && (
          <div style={{ padding: "10px 12px", color: "var(--color-error)", fontSize: "var(--text-xs)" }}>
            {importError}
          </div>
        )}
      </ScripturePane>

      {/* Column 2: gallery of thumbnails for the selected category */}
      <section
        style={{
          flex: 1,
          minWidth: 0,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--bg-base)",
        }}
      >
        <div style={tableHeaderCellStyle()}>{activeCategoryLabel} Gallery</div>
        <div className="scripture-scroll-pane" style={{ flex: 1, minHeight: 0, padding: "var(--space-3)" }}>
          {visibleItems.length === 0 ? (
            <PaneEmpty>No {activeCategoryLabel.toLowerCase()} imported yet — use the + button to add some.</PaneEmpty>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: "var(--space-3)",
              }}
            >
              {visibleItems.map((item) => (
                <MediaThumbnail key={item.id} item={item} onRemove={() => handleRemove(item.id)} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
