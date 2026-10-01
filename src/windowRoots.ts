import { lazy } from "react";

// One bundle, two windows (SS-036). Each root is its own chunk so the
// congregation output window never loads the operator app, the sidecar
// bridge or audio.
export const OperatorApp = lazy(() => import("./App.tsx"));
export const ProjectorOutputWindow = lazy(() => import("./components/ProjectorOutputWindow"));
