import { IconCheckCircle, IconHelp, IconInfo } from "../icons";
import { SectionIntro, SettingsCard, StatusPill } from "../primitives";

const ROADMAP_PHASES = [
  {
    phase: "Phase 1 — MVP",
    status: "shipped" as const,
    items: [
      "Offline scripture detection (Moonshine + algorithmic matching)",
      "EasyWorship-style display takeover with configurable idle screen",
      "Manual verse search + simple text slides",
      "Bundled Bible versions: KJV, Yoruba, Hausa, Igbo",
      "Church ID authentication",
    ],
  },
  {
    phase: "Phase 2 — Intelligence Layer",
    status: "in-progress" as const,
    items: [
      "Groq API integration (bring your own key)",
      "Key point detection + sermon memory",
      "Cross-service callback detection",
      "Post-service summary + devotional generation",
      "Middleware outputs: web canvas, green screen, NDI",
    ],
  },
  {
    phase: "Phase 3 — Growth",
    status: "planned" as const,
    items: [
      "Song lyrics display",
      "Additional Bible version downloads",
      "Sermon analytics dashboard",
      "Multi-language STT improvements (Pidgin, Yoruba)",
      "Slide templates and themes",
    ],
  },
];

const HARDWARE_SPECS = [
  { label: "CPU", value: "Any dual-core (Intel i3 / AMD equivalent) — Intel i5 / Ryzen 5 recommended" },
  { label: "RAM", value: "4GB minimum — 8GB recommended" },
  { label: "Storage", value: "500MB free (app + models + Bible DB) — 2GB recommended for transcript archive" },
  { label: "GPU", value: "Not required" },
  { label: "OS", value: "Windows 10 or later — Windows 11 recommended" },
  { label: "Internet", value: "Not required for core features — needed for intelligence layer + Bible downloads" },
];

export function HelpTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <SectionIntro title="Help & About" description="Roadmap status, hardware requirements, and version information." />

      <SettingsCard icon={<IconInfo />} title="Version">
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
          <span>SermonSync</span>
          <span style={{ fontFamily: "var(--font-mono)" }}>v0.1.0-native</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
          <span>Distribution</span>
          <span>Foursquare Gospel Church Nigeria — All Branches</span>
        </div>
      </SettingsCard>

      <SettingsCard icon={<IconCheckCircle />} title="Release Roadmap">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {ROADMAP_PHASES.map((phase) => (
            <div key={phase.phase}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <p style={{ margin: 0, fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--fg-base)" }}>{phase.phase}</p>
                <StatusPill
                  tone={phase.status === "shipped" ? "success" : phase.status === "in-progress" ? "warning" : "neutral"}
                  label={phase.status === "shipped" ? "Shipped" : phase.status === "in-progress" ? "In Progress" : "Planned"}
                />
              </div>
              <ul style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "3px" }}>
                {phase.items.map((item) => (
                  <li key={item} style={{ fontSize: "10px", color: "var(--fg-subtle)", lineHeight: 1.5 }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard icon={<IconHelp />} title="Minimum Hardware">
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {HARDWARE_SPECS.map((spec) => (
            <div key={spec.label} style={{ display: "flex", gap: "12px", fontSize: "10px" }}>
              <span style={{ width: "70px", flexShrink: 0, fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--fg-subtle)", textTransform: "uppercase" }}>
                {spec.label}
              </span>
              <span style={{ color: "var(--fg-muted)" }}>{spec.value}</span>
            </div>
          ))}
        </div>
      </SettingsCard>
    </div>
  );
}
