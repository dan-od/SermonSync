interface EngineFailureBannerProps {
  error: string;
}

// The failure is otherwise invisible during a service: capture keeps running and
// the transcript just stays empty. The sidecar remembers a failed load for the
// whole process, so only a restart can clear this.
export function EngineFailureBanner({ error }: EngineFailureBannerProps) {
  return (
    <div
      role="alert"
      style={{
        flexShrink: 0,
        padding: "var(--space-2) var(--space-3)",
        background: "var(--color-error-muted)",
        borderBottom: "1px solid var(--color-error-border)",
        color: "var(--fg-base)",
        fontSize: "13px",
        lineHeight: 1.4,
      }}
    >
      <strong style={{ color: "var(--color-error)" }}>Transcription is not running.</strong>{" "}
      Live speech won&apos;t be transcribed or suggest scriptures. Manual search and projection still
      work. Restart SermonSync to try again.
      <div
        title={error}
        style={{ color: "var(--fg-muted)", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {error}
      </div>
    </div>
  );
}
