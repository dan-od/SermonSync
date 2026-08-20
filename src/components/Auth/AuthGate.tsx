import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { MAC_TRAFFIC_LIGHT_INSET, USE_NATIVE_WINDOW_CONTROLS, isMacOS } from "../../lib/platform";
import { IconLogIn, IconPlusCircle } from "./icons";
import { LoginPane } from "./LoginPane";
import { RegisterPane } from "./RegisterPane";
import { INITIAL_BRANCH_DIRECTORY, type BranchAccount } from "./types";

type AuthTab = "login" | "register";

function AuthTitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const isTauriWindow = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const showCustomControls = isTauriWindow && !USE_NATIVE_WINDOW_CONTROLS;
  const macInset = isTauriWindow && isMacOS();

  const handleWindowAction = async (action: "minimize" | "maximize" | "close") => {
    if (!isTauriWindow) return;
    const appWindow = getCurrentWindow();
    if (action === "minimize") await appWindow.minimize();
    if (action === "maximize") {
      await appWindow.toggleMaximize();
      setIsMaximized(await appWindow.isMaximized());
    }
    if (action === "close") await appWindow.close();
  };

  return (
    <header
      onMouseDown={(event) => {
        if (isTauriWindow && event.button === 0 && !(event.target as HTMLElement).closest("button")) {
          void getCurrentWindow().startDragging();
        }
      }}
      onDoubleClick={(event) => {
        if (isTauriWindow && !(event.target as HTMLElement).closest("button")) {
          void handleWindowAction("maximize");
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "34px",
        padding: `0 8px 0 ${macInset ? MAC_TRAFFIC_LIGHT_INSET : 12}px`,
        background: "var(--bg-base)",
        borderBottom: "1px solid var(--border-base)",
        color: "var(--fg-base)",
        userSelect: "none",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em" }}>
        SermonSync
      </span>
      {showCustomControls ? (
        <div style={{ display: "flex", gap: "2px" }}>
          {([
            ["minimize", "−"],
            ["maximize", isMaximized ? "❐" : "□"],
            ["close", "×"],
          ] as const).map(([action, glyph]) => (
            <button
              key={action}
              type="button"
              aria-label={action}
              onClick={() => void handleWindowAction(action)}
              className={`auth-window-button${action === "close" ? " auth-window-button--close" : ""}`}
            >
              {glyph}
            </button>
          ))}
        </div>
      ) : null}
    </header>
  );
}

export interface AuthGateProps {
  onAuthenticated: (branch: BranchAccount) => void;
}

export function AuthGate({ onAuthenticated }: AuthGateProps) {
  const [activeTab, setActiveTab] = useState<AuthTab>("login");
  const [transitionDirection, setTransitionDirection] = useState<"forward" | "backward">("forward");
  const [directory, setDirectory] = useState<BranchAccount[]>(INITIAL_BRANCH_DIRECTORY);

  const handleRegistered = (branch: BranchAccount) => {
    setDirectory((prev) => [branch, ...prev]);
  };

  const handleProceedToLogin = (branch: BranchAccount) => {
    switchTab("login");
    // LoginPane re-mounts with the freshly registered directory already
    // containing this branch, so the operator only needs to type the
    // password they just set.
    setDirectory((prev) => (prev.some((b) => b.id === branch.id) ? prev : [branch, ...prev]));
  };

  const switchTab = (tab: AuthTab) => {
    if (tab === activeTab) return;
    setTransitionDirection(tab === "register" ? "forward" : "backward");
    setActiveTab(tab);
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-base)",
        color: "var(--fg-base)",
      }}
    >
      <AuthTitleBar />
      {/* Main content */}
      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 32px 48px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "980px",
            display: "grid",
            gridTemplateColumns: "0.85fr 1.15fr",
            gap: "64px",
            alignItems: "center",
          }}
        >
          {/* Left: pitch */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--color-primary)",
              }}
            >
              Church Branch Access
            </span>
            <h1 style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: "var(--text-2xl)", fontWeight: 700, lineHeight: 1.2, color: "var(--fg-base)" }}>
              One Church ID.
              <br />
              <span style={{ color: "var(--color-primary)" }}>Your Branch's Console.</span>
            </h1>
            <div style={{ height: "1px", background: "var(--border-base)" }} />
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)", lineHeight: 1.6 }}>
              Sign in with your Church ID and branch password to detect scripture live, run presentation slides, and
              manage this branch's local media — fully offline, with zero cost.
            </p>
          </div>

          {/* Right: form panel */}
          <div
            className="auth-form-panel"
            style={{
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-lg)",
              padding: "28px 32px",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-4)",
            }}
          >
            {/* Tabs */}
            <div style={{ display: "flex", gap: "24px" }}>
              <button
                type="button"
                onClick={() => switchTab("login")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "0 0 10px",
                  background: "none",
                  border: "none",
                  outline: "none",
                  borderBottom: `2px solid ${activeTab === "login" ? "var(--color-primary)" : "transparent"}`,
                  color: activeTab === "login" ? "var(--color-primary)" : "var(--fg-subtle)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                <IconLogIn />
                <span>Branch Sign In</span>
              </button>
              <button
                type="button"
                onClick={() => switchTab("register")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "0 0 10px",
                  background: "none",
                  border: "none",
                  outline: "none",
                  borderBottom: `2px solid ${activeTab === "register" ? "var(--color-primary)" : "transparent"}`,
                  color: activeTab === "register" ? "var(--color-primary)" : "var(--fg-subtle)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                <IconPlusCircle />
                <span>Register Branch</span>
              </button>
            </div>

            <div key={activeTab} className={`auth-pane-enter auth-pane-enter--${transitionDirection}`}>
              {activeTab === "login" ? (
                <LoginPane directory={directory} onSuccess={onAuthenticated} />
              ) : (
                <RegisterPane directory={directory} onRegistered={handleRegistered} onProceedToLogin={handleProceedToLogin} />
              )}
            </div>
          </div>
        </div>
      </main>

      <footer
        style={{
          padding: "12px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "10px",
          color: "var(--fg-subtle)",
          fontFamily: "var(--font-mono)",
          flexShrink: 0,
        }}
      >
        <span>SermonSync — Free Forever, Open Source</span>
        <span>v0.1.0-native</span>
      </footer>
    </div>
  );
}
