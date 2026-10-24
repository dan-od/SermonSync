import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { contextMenuPosition } from "../../../lib/contextMenuPosition";
import { importAudio, isManagedAudio, managedAudioUrl } from "../../../lib/audioImport";
import { MEDIA_CATEGORIES, mediaCategoryForPath } from "../../../lib/mediaLibrary";
import { importErrorMessage, importVideo, isManagedVideo, managedVideoUrl, type VideoAsset, type VideoImportProgress } from "../../../lib/videoImport";
import type { ProjectorMedia } from "../../../types/state";
import type { TemplateBackgroundMedia, TemplateCategory } from "../../../types/templates";
import { useTemplateStore } from "../../../stores/templateStore";
import { type AudioMediaSettings, DEFAULT_AUDIO_SETTINGS, DEFAULT_IMAGE_SETTINGS, DEFAULT_VIDEO_SETTINGS, type ImageMediaSettings, type MediaCategory, type MediaItem, type VideoMediaSettings } from "../../../types/media";
import { AudioStudioModal } from "../../Media/AudioStudioModal";
import { ImageStudioModal } from "../../Media/ImageStudioModal";
import { VideoStudioModal } from "../../Media/VideoStudioModal";
import { addSongButtonStyle, deleteSongButton, renameSecondaryButton, slideActionButtonStyle, songContextMenuItemStyle, tableHeaderCellStyle } from "../styles";
import { PaneEmpty } from "../shared";
import { isTauriRuntime } from "../utils";
import { ScriptureCellButton, ScripturePane } from "../Scriptures/ScripturePane";
import { failedAudioMigrations, fileNameFromPath, finishMediaVideoImport, loadMediaItems, MEDIA_CATALOG_EVENT, MEDIA_IMPORT_EVENT, type MediaContextMenuState, migratingAudio, migratingVideos, mutateSavedMediaItems, notifyMediaImports, type PendingVideo, pendingVideos, withDefaultSettings } from "./mediaStore";
import { MediaThumbnail } from "./MediaThumbnail";

export function MediaTab({ onPreviewMedia, onSendMedia, clickAction, onClickActionChange, previewMedia, liveMedia }: {
  onPreviewMedia?: (media: ProjectorMedia) => void;
  onSendMedia?: (media: ProjectorMedia) => void;
  clickAction: "preview" | "live";
  onClickActionChange: (action: "preview" | "live") => void;
  previewMedia?: ProjectorMedia | null;
  liveMedia?: ProjectorMedia | null;
}) {
  const [items, setItems] = useState<MediaItem[]>(() => loadMediaItems().map(withDefaultSettings));
  const [selectedMediaPath, setSelectedMediaPath] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<MediaCategory>("images");
  const [importError, setImportError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<MediaContextMenuState | null>(null);
  const [backgroundSubmenuOpen, setBackgroundSubmenuOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<MediaItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null);
  const [studioTarget, setStudioTarget] = useState<MediaItem | null>(null);
  const [pending, setPending] = useState<PendingVideo[]>(() => [...pendingVideos.values()]);
  const hasRecoverableVideoImports = pending.some((entry) => !entry.error && !entry.controller.signal.aborted);
  const galleryRef = useRef<HTMLElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const templateDefaults = useTemplateStore((state) => state.defaults);

  useEffect(() => {
    const refreshCatalog = () => setItems(loadMediaItems().map(withDefaultSettings));
    const refreshPending = () => setPending([...pendingVideos.values()]);
    window.addEventListener(MEDIA_CATALOG_EVENT, refreshCatalog);
    window.addEventListener(MEDIA_IMPORT_EVENT, refreshPending);
    return () => {
      window.removeEventListener(MEDIA_CATALOG_EVENT, refreshCatalog);
      window.removeEventListener(MEDIA_IMPORT_EVENT, refreshPending);
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime() || !hasRecoverableVideoImports) return;
    const timer = window.setInterval(() => {
      for (const [path, entry] of pendingVideos) {
        if (!entry.assetId || entry.error || entry.controller.signal.aborted || entry.recoveryInFlight || Date.now() - entry.startedAt < 15000) continue;
        entry.recoveryInFlight = true;
        void invoke<VideoAsset | null>("get_ready_video_asset", { assetId: entry.assetId })
          .then((asset) => { if (asset) finishMediaVideoImport(path, entry.controller, asset); })
          .catch(() => { /* The normal import request still reports the actionable error. */ })
          .finally(() => { entry.recoveryInFlight = false; });
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hasRecoverableVideoImports]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    for (const item of items) {
      if (item.category !== "videos" || isManagedVideo(item.path) || migratingVideos.has(item.id)) continue;
      migratingVideos.add(item.id);
      void importVideo(item.path, { legacy: true }).then((asset) => {
        mutateSavedMediaItems((current) => current.map((entry) =>
          entry.id === item.id && entry.path === item.path ? { ...entry, path: asset.path } : entry));
      }).catch((error) => {
        console.warn("Existing video remains on its original path until migration succeeds", importErrorMessage(error));
      }).finally(() => migratingVideos.delete(item.id));
    }
  }, [items]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    for (const item of items) {
      if (item.category !== "audio" || isManagedAudio(item.path) || migratingAudio.has(item.id) || failedAudioMigrations.has(item.id)) continue;
      migratingAudio.add(item.id);
      void importAudio(item.path).then((asset) => {
        mutateSavedMediaItems((current) => current.map((entry) =>
          entry.id === item.id && entry.path === item.path ? { ...entry, path: asset.path } : entry));
      }).catch((error: unknown) => {
        failedAudioMigrations.add(item.id);
        setImportError(`Could not prepare ${item.name}: ${importErrorMessage(error)}`);
      }).finally(() => migratingAudio.delete(item.id));
    }
  }, [items]);

  useEffect(() => {
    if (!contextMenu) return;
    const gallery = galleryRef.current;
    const handlePointerDown = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handlePointerDown);
    gallery?.addEventListener("scroll", handlePointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handlePointerDown);
      gallery?.removeEventListener("scroll", handlePointerDown, true);
    };
  }, [contextMenu]);

  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const menu = contextMenuRef.current;
    const panel = galleryRef.current?.getBoundingClientRect();
    const viewport = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const position = contextMenuPosition(
      { x: contextMenu.x, y: contextMenu.y },
      { width: menu.getBoundingClientRect().width || 168, height: menu.getBoundingClientRect().height || 112 },
      panel ?? viewport,
      viewport,
    );
    menu.style.left = `${position.x}px`;
    menu.style.top = `${position.y}px`;
    menu.style.visibility = "visible";
  }, [contextMenu]);

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
  const selectMedia = useCallback((path: string) => setSelectedMediaPath(path), []);
  const openMediaMenu = useCallback((event: React.MouseEvent, item: MediaItem) => {
    event.preventDefault();
    setBackgroundSubmenuOpen(false);
    setContextMenu({ item, x: event.clientX, y: event.clientY });
  }, []);

  const setMediaAsBackground = async (item: MediaItem, category: TemplateCategory) => {
    const video = item.category === "videos";
    const settings = video ? item.videoSettings : item.imageSettings;
    const filters = settings?.filters;
    const background: TemplateBackgroundMedia = {
      type: video ? "video" : "image",
      src: video ? item.path : convertFileSrc(item.path),
      name: item.name,
      fit: settings?.fit ?? "cover",
      loop: video ? item.videoSettings?.loop ?? true : false,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      opacity: settings?.opacity ?? 1,
      muted: video ? item.videoSettings?.muted ?? true : true,
      speed: video ? item.videoSettings?.speed ?? 1 : 1,
      flipX: settings?.flipX ?? false,
      flipY: settings?.flipY ?? false,
      brightness: filters?.brightness,
      contrast: filters?.contrast,
      saturate: filters?.saturate,
      grayscale: filters?.grayscale,
      sepia: filters?.sepia,
      invert: filters?.invert,
      hueRotate: filters?.hueRotate,
      blur: filters?.blur,
    };

    try {
      await useTemplateStore.getState().setDefaultBackground(category, background);
      setContextMenu(null);
      setBackgroundSubmenuOpen(false);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not set the media background.");
    }
  };

  const handleImport = useCallback(async () => {
    setImportError(null);
    try {
      if (!isTauriRuntime()) {
        throw new Error("Open SermonSync in Tauri to import local media files.");
      }

      const selected = await open({
        multiple: true,
      });

      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      // Let the native probe inspect unfamiliar extensions. They may still be
      // perfectly valid videos, and the engine gives a useful error if not.
      const accepted = paths.map((path) => ({ path, category: mediaCategoryForPath(path) ?? "videos" as MediaCategory }));

      mutateSavedMediaItems((current) => {
        const existingPaths = new Set(current.map((item) => item.path));
        const additions: MediaItem[] = accepted.filter((entry) => entry.category === "images").flatMap(({ path, category }) => {
          if (existingPaths.has(path)) return [];
          existingPaths.add(path);
          return [withDefaultSettings({ id: `${category}-${path}`, name: fileNameFromPath(path), path, category })];
        });
        return [...current, ...additions];
      });
      for (const { path, category } of accepted) {
        if (category !== "audio") continue;
        void importAudio(path).then((asset) => {
          mutateSavedMediaItems((current) => current.some((item) => item.category === "audio" && item.path === asset.path)
            ? current
            : [...current, withDefaultSettings({ id: `audio-${asset.id}`, name: fileNameFromPath(path), path: asset.path, category: "audio" })]);
        }).catch((error: unknown) => {
          setImportError(`Could not import ${fileNameFromPath(path)}: ${importErrorMessage(error)}`);
        });
      }
      for (const { path, category } of accepted) {
        if (category !== "videos" || pendingVideos.has(path)) continue;
        if (loadMediaItems().some((item) => item.category === "videos" && item.path === path)) continue;
        const controller = new AbortController();
        const entry: PendingVideo = { path, name: fileNameFromPath(path), state: "queued", percent: null, startedAt: Date.now(), controller };
        pendingVideos.set(path, entry);
        notifyMediaImports();
        void importVideo(path, {
          maxSourceBytes: 600 * 1024 * 1024,
          signal: controller.signal,
          onProgress: (event: VideoImportProgress) => {
            const current = pendingVideos.get(path);
            if (!current || current.controller !== controller) return;
            pendingVideos.set(path, { ...current, state: event.state, percent: event.percent, assetId: event.assetId ?? current.assetId });
            notifyMediaImports();
          },
        }).then((asset) => {
          finishMediaVideoImport(path, controller, asset);
        }).catch((error) => {
          if (pendingVideos.get(path)?.controller !== controller) return;
          if (controller.signal.aborted) {
            pendingVideos.delete(path);
            notifyMediaImports();
            return;
          }
          pendingVideos.set(path, { ...entry, state: "failed", percent: null, error: importErrorMessage(error) });
          notifyMediaImports();
        });
      }
      if (accepted.length > 0) setSelectedCategory(accepted[0].category);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Failed to import media.");
    }
  }, []);

  const handleRemove = useCallback((id: string) => {
    mutateSavedMediaItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const handleRename = useCallback((id: string, name: string) => {
    mutateSavedMediaItems((current) => current.map((item) => (item.id === id ? { ...item, name } : item)));
  }, []);

  const handleUpdateSettings = useCallback((id: string, patch: Partial<MediaItem>) => {
    mutateSavedMediaItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const activeCategoryLabel = MEDIA_CATEGORIES.find((entry) => entry.id === selectedCategory)?.label ?? "";

  const confirmRename = () => {
    if (!renameTarget || !renameValue.trim()) return;
    handleRename(renameTarget.id, renameValue.trim());
    setRenameTarget(null);
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Column 1: media types */}
      <div style={{ position: "relative", width: 220, height: "100%", flexShrink: 0 }}>
      <ScripturePane title="Media Type" width="100%">
        {MEDIA_CATEGORIES.map((category) => {
          const isActive = selectedCategory === category.id;
          return (
            <ScriptureCellButton key={category.id} isActive={isActive} onClick={() => setSelectedCategory(category.id)}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                <span>{category.label}</span>
                <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {countsByCategory[category.id]}
                </span>
              </span>
            </ScriptureCellButton>
          );
        })}
        {importError && (
          <div style={{ padding: "10px 12px", color: "var(--color-error)", fontSize: "var(--text-xs)" }}>
            {importError}
          </div>
        )}
      </ScripturePane>
      <button
        type="button"
        aria-label="Import media files"
        title="Import audio, images, or videos"
        onClick={() => void handleImport()}
        style={{ ...addSongButtonStyle, position: "absolute", right: 16, bottom: 16, zIndex: 5 }}
      >
        +
      </button>
      </div>

      {/* Column 2: gallery of thumbnails for the selected category */}
      <section
        data-media-gallery=""
        ref={galleryRef}
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
        <div style={{ ...tableHeaderCellStyle(), display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span>{activeCategoryLabel} Gallery</span>
          <div role="group" aria-label="Media click action" style={{ display: "flex", overflow: "hidden", borderRadius: "var(--radius-sm)" }}>
            <button type="button" aria-pressed={clickAction === "preview"} onClick={() => onClickActionChange("preview")} style={slideActionButtonStyle(clickAction === "preview")}>Preview First</button>
            <button type="button" aria-pressed={clickAction === "live"} onClick={() => onClickActionChange("live")} style={slideActionButtonStyle(clickAction === "live")}>Live</button>
          </div>
        </div>
        <div className="scripture-scroll-pane" style={{ flex: 1, minHeight: 0, padding: "var(--space-3)" }}>
          {visibleItems.length === 0 ? (
            selectedCategory === "videos" && pending.length > 0 ? null : <PaneEmpty>No {activeCategoryLabel.toLowerCase()} imported yet — use the + button in Media Type to add files.</PaneEmpty>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: "var(--space-3)",
              }}
            >
              {visibleItems.map((item) => (
                <MediaThumbnail
                  key={item.id}
                  item={item}
                  isSelected={item.path === (selectedMediaPath ?? (clickAction === "preview" ? previewMedia?.path : liveMedia?.path))}
                  onSelect={selectMedia}
                  onContextMenu={openMediaMenu}
                  clickAction={clickAction}
                  onPreviewMedia={onPreviewMedia}
                  onSendMedia={onSendMedia}
                />
              ))}
            </div>
          )}
          {selectedCategory === "videos" && pending.map((entry) => (
            <div key={entry.path} role="status" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, padding: 10, borderRadius: 6, background: "var(--bg-elevated)", color: "var(--fg-muted)", fontSize: 12 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={entry.name}>{entry.name}</span>
              <span>{entry.error ?? `${entry.state}${entry.percent == null ? "" : ` ${entry.percent}%`}`}</span>
              <button type="button" onClick={() => {
                if (entry.error) pendingVideos.delete(entry.path);
                else entry.controller.abort();
                notifyMediaImports();
              }} aria-label={entry.error ? `Dismiss ${entry.name}` : `Cancel import ${entry.name}`}>{entry.error ? "Dismiss" : "Cancel"}</button>
            </div>
          ))}
        </div>
      </section>

      {/* Right-click Context Menu */}
      {contextMenu ? createPortal(
        <div
          ref={contextMenuRef}
          role="menu"
          className="ss-compact-menu"
          onPointerDown={(event) => event.stopPropagation()}
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            visibility: "hidden",
            width: "160px",
            background: "var(--bg-surface)",
            boxShadow: "var(--shadow-lg)",
            zIndex: 1000,
          }}
        >
          <button
            type="button"
            role="menuitem"
            className="ss-compact-menu-item"
            onClick={() => {
              const target = contextMenu.item;
              setContextMenu(null);
              if (target.category === "audio" && !isManagedAudio(target.path)) {
                setImportError(`${target.name} is still being prepared for playback.`);
                return;
              }
              setStudioTarget(target);
            }}
            onMouseEnter={(event) => { event.currentTarget.style.background = "var(--color-primary-muted)"; }}
            onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
            style={songContextMenuItemStyle}
          >
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            className="ss-compact-menu-item"
            onClick={() => {
              const target = contextMenu.item;
              setContextMenu(null);
              setRenameTarget(target);
              setRenameValue(target.name);
            }}
            onMouseEnter={(event) => { event.currentTarget.style.background = "var(--color-primary-muted)"; }}
            onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
            style={songContextMenuItemStyle}
          >
            Rename
          </button>
          {contextMenu.item.category !== "audio" ? (
            <div
              style={{ position: "relative" }}
              onMouseEnter={() => setBackgroundSubmenuOpen(true)}
              onMouseLeave={() => setBackgroundSubmenuOpen(false)}
            >
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={backgroundSubmenuOpen}
                className="ss-compact-menu-item"
                onFocus={() => setBackgroundSubmenuOpen(true)}
                onClick={() => setBackgroundSubmenuOpen((open) => !open)}
                onMouseEnter={(event) => { event.currentTarget.style.background = "var(--color-primary-muted)"; }}
                onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
                style={{ ...songContextMenuItemStyle, justifyContent: "space-between" }}
              >
                Set as background
                <span aria-hidden="true">›</span>
              </button>
              {backgroundSubmenuOpen ? (
                <div
                  role="menu"
                  aria-label="Set as background"
                  onPointerDown={(event) => event.stopPropagation()}
                  style={{ position: "absolute", top: 0, left: contextMenu.x > window.innerWidth - 320 ? undefined : "calc(100% - 1px)", right: contextMenu.x > window.innerWidth - 320 ? "calc(100% - 1px)" : undefined, width: 160, padding: 4, borderRadius: 5, background: "var(--bg-surface)", boxShadow: "var(--shadow-md)", zIndex: 1001 }}
                >
                  {(["scriptures", "songs"] as const).map((category) => {
                    const enabled = Object.values(templateDefaults[category]).some(Boolean);
                    const label = category === "scriptures" ? "Scriptures" : "Songs";
                    return (
                      <button
                        key={category}
                        type="button"
                        role="menuitem"
                        disabled={!enabled}
                        title={enabled ? undefined : `Assign a default ${label.toLowerCase()} template first`}
                        className="ss-compact-menu-item"
                        onClick={() => void setMediaAsBackground(contextMenu.item, category)}
                        onMouseEnter={(event) => { event.currentTarget.style.background = enabled ? "var(--color-primary-muted)" : "transparent"; }}
                        onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
                        style={{ ...songContextMenuItemStyle, opacity: enabled ? 1 : 0.45, cursor: enabled ? "pointer" : "not-allowed" }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="ss-compact-menu-item"
            onClick={() => {
              const target = contextMenu.item;
              setContextMenu(null);
              setDeleteTarget(target);
            }}
            onMouseEnter={(event) => { event.currentTarget.style.background = "var(--color-error-muted)"; }}
            onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
            style={{ ...songContextMenuItemStyle, color: "var(--color-error)" }}
          >
            Delete
          </button>
        </div>,
        document.body,
      ) : null}

      {/* Delete confirmation */}
      {deleteTarget ? createPortal(
        <div
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 1200, display: "grid", placeItems: "center", padding: 20, background: "var(--overlay-backdrop)" }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-media-title"
            aria-describedby="delete-media-description"
            style={{ width: "min(400px, 94vw)", padding: 20, border: "1px solid var(--border-base)", borderRadius: "var(--radius-lg)", background: "var(--bg-surface)", boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column", gap: 14 }}
          >
            <h2 id="delete-media-title" style={{ margin: 0, color: "var(--fg-base)", fontSize: 16, fontWeight: 700 }}>Delete media?</h2>
            <p id="delete-media-description" style={{ margin: 0, color: "var(--fg-muted)", fontSize: 12, lineHeight: 1.5 }}>
              Remove &quot;{deleteTarget.name}&quot; from the library? This cannot be undone.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" autoFocus onClick={() => setDeleteTarget(null)} style={renameSecondaryButton}>Cancel</button>
              <button
                type="button"
                onClick={() => {
                  handleRemove(deleteTarget.id);
                  setDeleteTarget(null);
                }}
                style={deleteSongButton}
              >
                Delete
              </button>
            </div>
          </section>
        </div>,
        document.body,
      ) : null}

      {/* Rename dialog */}
      {renameTarget ? createPortal(
        <div
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setRenameTarget(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 1200, display: "grid", placeItems: "center", padding: 20, background: "rgba(8, 9, 14, 0.6)" }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="rename-media-title" style={{ width: "min(400px, 94vw)", padding: 20, border: "1px solid var(--border-base)", borderRadius: 10, background: "var(--bg-surface)", boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column", gap: 14 }}>
            <h2 id="rename-media-title" style={{ margin: 0, color: "var(--fg-base)", fontSize: 16, fontWeight: 700 }}>Rename media</h2>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, color: "var(--fg-muted)", fontSize: 12 }}>
              Name
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmRename();
                  if (e.key === "Escape") setRenameTarget(null);
                }}
                style={{ padding: "8px 10px", border: "1px solid var(--border-base)", borderRadius: 6, background: "var(--bg-base)", color: "var(--fg-base)", fontSize: 13, outline: "none" }}
              />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => setRenameTarget(null)} style={renameSecondaryButton}>Cancel</button>
              <button
                type="button"
                onClick={confirmRename}
                disabled={!renameValue.trim()}
                style={{ padding: "8px 14px", border: "none", borderRadius: 6, background: "var(--color-primary)", color: "var(--fg-on-accent)", cursor: "pointer", fontSize: 12, fontWeight: 600, opacity: renameValue.trim() ? 1 : 0.5 }}
              >
                Save
              </button>
            </div>
          </section>
        </div>,
        document.body,
      ) : null}

      {/* Category-specific studio editors */}
      {studioTarget?.category === "images" ? (
        <ImageStudioModal
          open
          name={studioTarget.name}
          src={studioTarget.path ? (() => { try { return managedVideoUrl(studioTarget.path) ?? convertFileSrc(studioTarget.path); } catch { return ""; } })() : ""}
          sourcePath={studioTarget.path}
          settings={studioTarget.imageSettings ?? DEFAULT_IMAGE_SETTINGS}
          onClose={() => setStudioTarget(null)}
          onSave={(name, settings: ImageMediaSettings) => {
            handleUpdateSettings(studioTarget.id, { name, imageSettings: settings });
            setStudioTarget(null);
          }}
        />
      ) : null}
      {studioTarget?.category === "videos" ? (
        <VideoStudioModal
          open
          name={studioTarget.name}
          src={studioTarget.path ? (() => { try { return managedVideoUrl(studioTarget.path) ?? convertFileSrc(studioTarget.path); } catch { return ""; } })() : ""}
          sourcePath={studioTarget.path}
          settings={studioTarget.videoSettings ?? DEFAULT_VIDEO_SETTINGS}
          onClose={() => setStudioTarget(null)}
          onSave={(name, settings: VideoMediaSettings) => {
            handleUpdateSettings(studioTarget.id, { name, videoSettings: settings });
            setStudioTarget(null);
          }}
        />
      ) : null}
      {studioTarget?.category === "audio" ? (
        <AudioStudioModal
          open
          name={studioTarget.name}
          src={studioTarget.path ? (() => { try { return managedAudioUrl(studioTarget.path) ?? convertFileSrc(studioTarget.path); } catch { return ""; } })() : ""}
          sourcePath={studioTarget.path}
          settings={studioTarget.audioSettings ?? DEFAULT_AUDIO_SETTINGS}
          onClose={() => setStudioTarget(null)}
          onSave={(name, settings: AudioMediaSettings) => {
            handleUpdateSettings(studioTarget.id, { name, audioSettings: settings });
            setStudioTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}
