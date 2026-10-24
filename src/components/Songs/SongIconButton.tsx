

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
      disabled={disabled}
      onClick={onClick}
      style={{
        border: "none",
        background: "transparent",
        color: danger ? "var(--color-error)" : "var(--fg-subtle)",
        borderRadius: "4px",
        width: "18px",
        height: "18px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.3 : 0.8,
        fontSize: "11px",
        padding: 0,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.opacity = "1";
          e.currentTarget.style.background = danger ? "rgba(255, 75, 96, 0.15)" : "var(--bg-elevated)";
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.opacity = "0.8";
          e.currentTarget.style.background = "transparent";
        }
      }}
    >
      {children}
    </button>
  );
}
