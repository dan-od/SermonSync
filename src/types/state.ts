/**
 * SermonSync shared state interfaces (SS-004).
 *
 * These are the canonical state shapes for the whole app. The Python sidecar's
 * WebSocket/REST payloads are designed to map onto these, so backend work can
 * reference them directly. Dee owns the store implementations that consume
 * these types.
 */

export type { SessionStatus, SessionState } from "./sessionTypes";
export type { AudioStatus, AudioInputDevice, AudioPipelineState } from "./audioTypes";
export type { TranscriptionEventType, TranscriptionEvent, TranscriptItem, TranscriptionState } from "./transcriptionTypes";
export type { ScriptureReference, PipelineStage, SuggestionStatus, SuggestionCard } from "./suggestionTypes";
export type { OverlayMode, VerseTheme, LogoFit, LogoConfig, TransitionEffect, TransitionEasing, TransitionSetting, TransitionCategory, TransitionsConfig, ProjectorSlide, ProjectorMedia, DisplayInfo, ProjectorOutputStatus, ProjectorPlaybackState, ProjectorAudioProgress, ProjectorOutputSnapshot, ProjectorState } from "./projectorTypes";
export type { UiTheme, BibleVersionSummary, ModelProviderId, SystemConfig } from "./systemTypes";
export type { SidecarAckEvent, SidecarAudioLevelEvent, SidecarVadStateEvent, SidecarAudioStateChangeEvent, SidecarAudioErrorEvent, SidecarTranscriptionEvent, SidecarSentenceEvent, SidecarSuggestionResult, SidecarSuggestionsEvent, SidecarContextUpdateEvent, StageMetrics, SidecarSystemStatusEvent, SidecarTestFeedEvent, SidecarWsEvent } from "./sidecarEventTypes";
