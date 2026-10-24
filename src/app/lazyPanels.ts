import { lazy } from "react";

export const AiPanel = lazy(() => import("../components/AiPanel").then((module) => ({ default: module.AiPanel })));
export const BiblePanel = lazy(() => import("../components/BiblePanel").then((module) => ({ default: module.BiblePanel })));
export const DbInspectorPanel = lazy(() => import("../components/DbInspectorPanel").then((module) => ({ default: module.DbInspectorPanel })));
export const LocalLibraryPanel = lazy(() => import("../components/LocalLibraryPanel").then((module) => ({ default: module.LocalLibraryPanel })));
export const ProjectorDeskPanel = lazy(() => import("../components/ProjectorDeskPanel").then((module) => ({ default: module.ProjectorDeskPanel })));
export const SuggestionDeckPanel = lazy(() =>
  import("../components/SuggestionDeckPanel").then((module) => ({ default: module.SuggestionDeckPanel })),
);
export const SessionSummaryPanel = lazy(() =>
  import("../components/SessionSummaryPanel").then((module) => ({ default: module.SessionSummaryPanel })),
);
export const DownloadAppPresetsModal = lazy(() =>
  import("../components/DownloadAppPresetsModal").then((module) => ({ default: module.DownloadAppPresetsModal })),
);
export const SettingsPanel = lazy(() =>
  import("../components/Settings/SettingsPanel").then((module) => ({ default: module.SettingsPanel })),
);
export const CueProjectionModal = lazy(() =>
  import("../components/Songs/CueProjectionModal").then((module) => ({ default: module.CueProjectionModal })),
);
