import { lazy } from "react";

export const AppView = lazy(() => import("../App.tsx"));
export const ProjectorOutputView = lazy(() => import("../components/ProjectorOutput.tsx").then((module) => ({ default: module.ProjectorOutput })));
