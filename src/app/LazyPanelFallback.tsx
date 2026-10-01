export function LazyPanelFallback() {
  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "grid",
        placeItems: "center",
        color: "var(--fg-subtle)",
        fontFamily: "var(--font-mono)",
        fontSize: "12px",
      }}
    >
      Loading panel...
    </div>
  );
}
