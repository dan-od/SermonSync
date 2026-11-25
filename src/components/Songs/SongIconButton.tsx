

export function IconButton({
  children,
  title,
  disabled,
  danger,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        border: "none",
        background: "var(--bg-elevated)",
        color: danger ? "var(--color-error)" : "var(--fg-base)",
        borderRadius: "1px",
        minWidth: "24px",
        height: "22px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        fontSize: "12px",
        fontWeight: 600,
        padding: "0 4px",
        transition: "background 120ms ease, color 120ms ease",
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = danger ? "var(--color-error-muted)" : "var(--color-primary-muted)";
          e.currentTarget.style.color = danger ? "var(--color-error)" : "var(--color-primary)";
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = "var(--bg-elevated)";
          e.currentTarget.style.color = danger ? "var(--color-error)" : "var(--fg-base)";
        }
      }}
    >
      {children}
    </button>
  );
}
