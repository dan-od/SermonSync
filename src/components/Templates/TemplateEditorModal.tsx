import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { TemplateCategory } from "../../types/templates";
import type { OverlayMode } from "../../types/state";
import { createEmptyStudioDocument, type StudioDocument } from "../../types/studioDocument";
import { useTemplateStore } from "../../stores/templateStore";
import { useShortcutStore } from "../../stores/shortcutStore";
import { FabricStudioCanvas, type StudioCanvasHandle, type StudioTextSelection } from "./FabricStudioCanvas";
import { StudioLayersPanel } from "./StudioLayersPanel";
import { StudioToolbar } from "./StudioToolbar";
import { CameraCaptureDialog } from "./editor/CameraCaptureDialog";
import { SaveTemplateTitleDialog } from "./editor/SaveTemplateTitleDialog";
import { TemplateEditorFooter } from "./editor/TemplateEditorFooter";
import { TemplateEditorHeader } from "./editor/TemplateEditorHeader";
import { sceneFromStudioDocument } from "./editor/sceneFromStudioDocument";
import { studioDocumentFromLegacyTemplate } from "./editor/studioDocumentFromLegacyTemplate";
import { handleTemplateEditorKeyDown } from "./editor/templateEditorKeyboard";
import { categoryLabel } from "./editor/templateEditorLabels";

interface TemplateEditorModalProps {
  open: boolean;
  mode: "create" | "edit";
  category: TemplateCategory;
  templateId: string | null;
  onClose: () => void;
}

export function TemplateEditorModal(props: TemplateEditorModalProps) {
  const { open, mode, category, templateId, onClose } = props;
  const [document, setDocument] = useState<StudioDocument | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [textSelection, setTextSelection] = useState<StudioTextSelection | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isTitlePromptOpen, setIsTitlePromptOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [titlePromptError, setTitlePromptError] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [screenLayout, setScreenLayout] = useState<OverlayMode>("widescreen");
  const [isCameraDialogOpen, setIsCameraDialogOpen] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const templates = useTemplateStore((state) => state.templates);
  const createTemplateDraft = useTemplateStore((state) => state.createTemplateDraft);
  const upsertTemplate = useTemplateStore((state) => state.upsertTemplate);
  const shortcuts = useShortcutStore((state) => state.shortcuts);
  const canvasHandleRef = useRef<StudioCanvasHandle>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const shapeMediaInputRef = useRef<HTMLInputElement | null>(null);
  const shapeMediaTargetRef = useRef<string | null>(null);
  const shapeMediaTypeRef = useRef<"image" | "video">("image");
  const cameraPreviewRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!open) {
        setDocument(null);
        setSelectedIds([]);
        setTextSelection(null);
        setSaveError(null);
        setIsTitlePromptOpen(false);
        setTitleDraft("");
        setTitlePromptError(null);
        return;
      }
      const existing = templateId ? templates.find((entry) => entry.id === templateId) : undefined;
      const initialLayout = existing?.layout ?? "widescreen";
      setScreenLayout(initialLayout);
      setDocument(existing?.studioDocument ?? (existing
        ? studioDocumentFromLegacyTemplate(existing)
        : createEmptyStudioDocument(category, `New ${categoryLabel(category)} Template`)));
      setSelectedIds([]);
      setTextSelection(null);
      setSaveError(null);
      setIsTitlePromptOpen(false);
      setTitleDraft("");
      setTitlePromptError(null);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [category, open, templateId, templates]);

  const onDocumentChange = useCallback((patch: Partial<Pick<StudioDocument, "objects" | "background" | "backgroundMode" | "backgroundColor" | "backgroundGradientStart" | "backgroundGradientEnd" | "backgroundGradientAngle" | "backgroundGradientStyle" | "backgroundBlur" | "backgroundMedia" | "updatedAt">>) => {
    setDocument((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const defaultTextBox = useMemo(() => {
    if (!document) return { x: 0, y: 0, width: 400, height: 120 };
    const width = Math.round(document.width * 0.4);
    const height = Math.round(document.height * 0.15);
    return { x: Math.round((document.width - width) / 2), y: Math.round((document.height - height) / 2), width, height };
  }, [document]);

  const defaultShapeBox = useMemo(() => {
    if (!document) return { x: 0, y: 0, width: 200, height: 200 };
    const width = Math.round(document.width * 0.2);
    const height = Math.round(document.height * 0.2);
    return { x: Math.round((document.width - width) / 2), y: Math.round((document.height - height) / 2), width, height };
  }, [document]);

  const saveTemplate = async (titleOverride?: string) => {
    if (!document || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const currentDocument = canvasHandleRef.current?.toDocument() ?? document;
      const existing = templateId ? templates.find((entry) => entry.id === templateId) : undefined;
      const draft = existing ?? createTemplateDraft(category);
      const now = Date.now();
      const name = (titleOverride ?? currentDocument.name).trim() || draft.name;
      await upsertTemplate({
        ...draft,
        id: existing?.id ?? draft.id,
        category,
        layout: screenLayout,
        name,
        studioDocument: {
          ...currentDocument,
          id: existing?.studioDocument?.id ?? currentDocument.id,
          category,
          name,
          createdAt: existing?.studioDocument?.createdAt ?? currentDocument.createdAt,
          updatedAt: now,
        },
        scene: sceneFromStudioDocument(currentDocument, draft.scene),
        updatedAt: now,
      });
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save template");
    } finally {
      setIsSaving(false);
    }
  };

  const changeScreenLayout = (layout: OverlayMode) => {
    setScreenLayout(layout);
  };

  const closeCameraDialog = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setIsCameraDialogOpen(false);
    setCameraError(null);
  };

  useEffect(() => {
    if (!isCameraDialogOpen) return;
    let cancelled = false;
    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices.enumerateDevices) {
        setCameraError("Camera capture is unavailable in this application runtime.");
        return;
      }
      try {
        cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
        const stream = await navigator.mediaDevices.getUserMedia({ video: selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStreamRef.current = stream;
        if (cameraPreviewRef.current) {
          cameraPreviewRef.current.srcObject = stream;
          await cameraPreviewRef.current.play().catch(() => undefined);
        }
        const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
        if (!cancelled) {
          setCameraDevices(devices);
          setSelectedCameraId((current) => current || devices[0]?.deviceId || "");
          setCameraError(null);
        }
      } catch (error) {
        if (!cancelled) setCameraError(error instanceof Error ? error.message : "Unable to access the selected camera.");
      }
    };
    void startCamera();
    return () => {
      cancelled = true;
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    };
  }, [isCameraDialogOpen, selectedCameraId]);

  const captureCameraFrame = () => {
    const video = cameraPreviewRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError("Camera preview is not ready yet.");
      return;
    }
    const frame = globalThis.document.createElement("canvas");
    frame.width = video.videoWidth;
    frame.height = video.videoHeight;
    frame.getContext("2d")?.drawImage(video, 0, 0, frame.width, frame.height);
    void canvasHandleRef.current?.addImage(frame.toDataURL("image/png"), "Camera capture");
    closeCameraDialog();
  };

  const requestSave = () => {
    if (!document || isSaving) return;
    const existing = templateId ? templates.find((entry) => entry.id === templateId) : undefined;
    if (existing) {
      void saveTemplate();
      return;
    }
    setTitleDraft(document.name.trim());
    setTitlePromptError(null);
    setIsTitlePromptOpen(true);
  };

  const confirmTitleAndSave = () => {
    const title = titleDraft.trim();
    if (!title) {
      setTitlePromptError("Enter a title for this template.");
      return;
    }
    void saveTemplate(title);
  };

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => handleTemplateEditorKeyDown(event, { isTitlePromptOpen, setIsTitlePromptOpen, selectedIds, onClose, shortcuts, canvasHandleRef });

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isTitlePromptOpen, onClose, open, selectedIds, shortcuts]);

  if (!open || !document) {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Template editor"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "var(--overlay-backdrop)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        style={{
          width: "min(1180px, 96vw)",
          height: "min(760px, 92vh)",
          background: "var(--bg-base)",
          borderRadius: "12px",
          border: "1px solid var(--border-base)",
          display: "grid",
          gridTemplateRows: "auto minmax(0, 1fr) auto",
          overflow: "hidden",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <TemplateEditorHeader mode={mode} category={category} onClose={onClose} />

        <div style={{ minHeight: 0, minWidth: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 260px" }}>
          <div style={{ position: "relative", minHeight: 0, minWidth: 0 }}>
            <FabricStudioCanvas
              document={document}
              handleRef={canvasHandleRef}
              onSelectionChange={setSelectedIds}
              onTextSelectionChange={setTextSelection}
              onDocumentChange={onDocumentChange}
              onHistoryChange={setHistoryState}
            />
            <StudioToolbar
              onAddText={() => canvasHandleRef.current?.addText(defaultTextBox)}
              onAddShape={(kind) => canvasHandleRef.current?.addShape(kind, defaultShapeBox)}
              onAddMedia={() => mediaInputRef.current?.click()}
              onAddCamera={() => setIsCameraDialogOpen(true)}
            />
            <input
              ref={mediaInputRef}
              type="file"
              accept="image/*,video/*"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                const mediaType = file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|ogg)$/i.test(file.name) ? "video" : "image";
                const reader = new FileReader();
                reader.onload = () => void canvasHandleRef.current?.addImage(String(reader.result), file.name.replace(/\.[^.]+$/, ""), mediaType);
                reader.readAsDataURL(file);
              }}
            />
            <input
              ref={shapeMediaInputRef}
              type="file"
              accept="image/*,video/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                const studioId = shapeMediaTargetRef.current;
                shapeMediaTargetRef.current = null;
                if (!file || !studioId) return;
                const mediaType = file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|ogg)$/i.test(file.name) ? "video" : "image";
                const reader = new FileReader();
                reader.onload = () => void canvasHandleRef.current?.setShapeMedia(studioId, String(reader.result), file.name.replace(/\.[^.]+$/, ""), mediaType);
                reader.readAsDataURL(file);
              }}
            />
          </div>

          <StudioLayersPanel
            objects={document.objects}
            selectedIds={selectedIds}
            textSelection={textSelection}
            onSelect={(studioId) => canvasHandleRef.current?.selectById(studioId)}
            onToggleVisibility={(studioId, visible) => canvasHandleRef.current?.setVisible(studioId, visible)}
            onToggleLock={(studioId, locked) => canvasHandleRef.current?.setLocked(studioId, locked)}
            onUpdate={(studioId, props) => canvasHandleRef.current?.updateObject(studioId, props)}
            onSetShapeMedia={(studioId, mediaType = "image") => {
              shapeMediaTargetRef.current = studioId;
              shapeMediaTypeRef.current = mediaType;
              if (shapeMediaInputRef.current) shapeMediaInputRef.current.accept = mediaType === "video" ? "video/*" : "image/*";
              shapeMediaInputRef.current?.click();
            }}
            onClearShapeMedia={(studioId) => void canvasHandleRef.current?.setShapeMedia(studioId, null)}
            onReorder={(studioId, direction) => canvasHandleRef.current?.reorderObject(studioId, direction)}
            canUndo={historyState.canUndo}
            canRedo={historyState.canRedo}
            onUndo={() => void canvasHandleRef.current?.undo()}
            onRedo={() => void canvasHandleRef.current?.redo()}
            background={document.background}
            onBackgroundChange={(background) => canvasHandleRef.current?.setBackground(background)}
            backgroundMode={document.backgroundMode ?? "color"}
            backgroundColor={document.backgroundColor ?? document.background}
            backgroundGradientStart={document.backgroundGradientStart ?? "#0f1117"}
            backgroundGradientEnd={document.backgroundGradientEnd ?? "#25204a"}
            backgroundGradientAngle={document.backgroundGradientAngle ?? 135}
            backgroundGradientStyle={document.backgroundGradientStyle ?? "linear"}
            backgroundBlur={document.backgroundBlur ?? 0}
            backgroundMedia={document.backgroundMedia ?? null}
            onBackgroundConfigChange={(config) => canvasHandleRef.current?.setBackgroundConfig(config)}
            screenLayout={screenLayout}
            onScreenLayoutChange={changeScreenLayout}
            onDelete={(studioId) => {
              canvasHandleRef.current?.selectById(studioId);
              canvasHandleRef.current?.deleteSelection();
            }}
          />
        </div>

        <TemplateEditorFooter saveError={saveError} isSaving={isSaving} onClose={onClose} requestSave={requestSave} />
      </div>

      {isCameraDialogOpen ? (
        <CameraCaptureDialog
          cameraDevices={cameraDevices}
          selectedCameraId={selectedCameraId}
          setSelectedCameraId={setSelectedCameraId}
          cameraError={cameraError}
          cameraPreviewRef={cameraPreviewRef}
          closeCameraDialog={closeCameraDialog}
          captureCameraFrame={captureCameraFrame}
        />
      ) : null}

      {isTitlePromptOpen ? (
        <SaveTemplateTitleDialog
          category={category}
          isSaving={isSaving}
          titleDraft={titleDraft}
          setTitleDraft={setTitleDraft}
          titlePromptError={titlePromptError}
          setTitlePromptError={setTitlePromptError}
          setIsTitlePromptOpen={setIsTitlePromptOpen}
          confirmTitleAndSave={confirmTitleAndSave}
        />
      ) : null}
    </div>,
    globalThis.document.body,
  );
}
