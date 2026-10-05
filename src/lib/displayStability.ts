export interface DisplayStabilityState {
  confirmedFingerprint: string | null;
  missingReads: number;
  changedFingerprint: string | null;
  changedReads: number;
}

export const EMPTY_DISPLAY_STABILITY: DisplayStabilityState = {
  confirmedFingerprint: null,
  missingReads: 0,
  changedFingerprint: null,
  changedReads: 0,
};

/** Ignore one-off monitor read failures and geometry jitter while output is live. */
export function observeConnectedDisplay(
  state: DisplayStabilityState,
  fingerprint: string | null,
  requiredReads = 3,
): { state: DisplayStabilityState; action: "none" | "disconnect" | "reposition" } {
  if (!fingerprint) {
    const missingReads = state.missingReads + 1;
    return missingReads >= requiredReads
      ? { state: EMPTY_DISPLAY_STABILITY, action: "disconnect" }
      : { state: { ...state, missingReads, changedFingerprint: null, changedReads: 0 }, action: "none" };
  }

  if (!state.confirmedFingerprint) {
    return { state: { ...EMPTY_DISPLAY_STABILITY, confirmedFingerprint: fingerprint }, action: "none" };
  }
  if (fingerprint === state.confirmedFingerprint) {
    return { state: { ...state, missingReads: 0, changedFingerprint: null, changedReads: 0 }, action: "none" };
  }

  const changedReads = state.changedFingerprint === fingerprint ? state.changedReads + 1 : 1;
  return changedReads >= requiredReads
    ? { state: { ...EMPTY_DISPLAY_STABILITY, confirmedFingerprint: fingerprint }, action: "reposition" }
    : { state: { ...state, missingReads: 0, changedFingerprint: fingerprint, changedReads }, action: "none" };
}
