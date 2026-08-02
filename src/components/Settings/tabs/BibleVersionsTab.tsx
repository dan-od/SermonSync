import { useState } from "react";

import { useConfigStore } from "../../../stores/configStore";
import type { BibleVersionSummary } from "../../../types/state";
import { IconBook, IconUpload } from "../icons";
import { InfoBanner, SectionIntro, SelectRow, SettingsCard, StatusPill } from "../primitives";

const BUNDLED_VERSIONS: BibleVersionSummary[] = [
  { abbreviation: "KJV", name: "King James Version", verse_count: 31102, available: true },
  { abbreviation: "ASV", name: "American Standard Version", verse_count: 31098, available: true },
  { abbreviation: "WEB", name: "World English Bible", verse_count: 31086, available: true },
  { abbreviation: "YOR", name: "Yoruba Bible", verse_count: 31102, available: true },
  { abbreviation: "HAU", name: "Hausa Bible", verse_count: 31102, available: true },
  { abbreviation: "IGB", name: "Igbo Bible", verse_count: 31102, available: true },
];

const DOWNLOADABLE_VERSIONS: BibleVersionSummary[] = [
  { abbreviation: "NIV", name: "New International Version", verse_count: 31103, available: false },
  { abbreviation: "NKJV", name: "New King James Version", verse_count: 31102, available: false },
  { abbreviation: "ESV", name: "English Standard Version", verse_count: 31086, available: false },
  { abbreviation: "AMP", name: "Amplified Bible", verse_count: 31103, available: false },
  { abbreviation: "NLT", name: "New Living Translation", verse_count: 31103, available: false },
  { abbreviation: "MSG", name: "The Message", verse_count: 31103, available: false },
];

export function BibleVersionsTab() {
  const bibleVersion = useConfigStore((s) => s.bibleVersion);
  const configuredVersions = useConfigStore((s) => s.bibleVersions);
  const setBibleVersion = useConfigStore((s) => s.setBibleVersion);
  const setBibleVersions = useConfigStore((s) => s.setBibleVersions);

  const versions = configuredVersions.length > 0 ? configuredVersions : BUNDLED_VERSIONS;
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleDownload = (abbreviation: string) => {
    setDownloading(abbreviation);
    setTimeout(() => {
      const downloaded = DOWNLOADABLE_VERSIONS.find((v) => v.abbreviation === abbreviation);
      if (downloaded) {
        setBibleVersions([...versions, { ...downloaded, available: true }]);
      }
      setDownloading(null);
    }, 1200);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <SectionIntro
        title="Bible Version Management"
        description="Bundled public-domain versions ship offline. Additional versions can be downloaded or imported at any time — the app is never locked down (PRD §5.6)."
      />

      <SettingsCard icon={<IconBook />} title="Default Display Version">
        <SelectRow
          label="Default Bible Version"
          value={bibleVersion}
          options={versions.map((v) => ({ value: v.abbreviation, label: `${v.abbreviation} — ${v.name}` }))}
          onChange={setBibleVersion}
          hint="The AI always pulls verse text from the local database, regardless of display version."
        />
      </SettingsCard>

      <SettingsCard icon={<IconBook />} title="Bundled Offline Versions" subtitle="No license needed, no internet required">
        <VersionList versions={versions} />
      </SettingsCard>

      <SettingsCard icon={<IconBook />} title="Download Additional Versions" subtitle="Via getBible.net API — 100+ versions, 50+ languages">
        <VersionList
          versions={DOWNLOADABLE_VERSIONS.filter((v) => !versions.some((existing) => existing.abbreviation === v.abbreviation))}
          onDownload={handleDownload}
          downloadingId={downloading}
        />
        <InfoBanner tone="warning">
          Copyrighted versions (NIV, NKJV, ESV, AMP, NLT, MSG) cannot be bundled in the installer due to publisher
          licensing — download or import only.
        </InfoBanner>
      </SettingsCard>

      <SettingsCard icon={<IconUpload />} title="Import Custom Version">
        <button
          type="button"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "12px",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-base)",
            color: "var(--fg-muted)",
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <IconUpload />
          Import from CSV, JSON, or OSIS XML
        </button>
      </SettingsCard>
    </div>
  );
}

function VersionList({
  versions,
  onDownload,
  downloadingId,
}: {
  versions: BibleVersionSummary[];
  onDownload?: (abbreviation: string) => void;
  downloadingId?: string | null;
}) {
  if (versions.length === 0) {
    return <p style={{ fontSize: "10px", color: "var(--fg-subtle)" }}>All available versions have been added.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {versions.map((version) => (
        <div
          key={version.abbreviation}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 12px",
            background: "var(--bg-base)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--fg-base)" }}>
              {version.abbreviation}
            </span>
            <span style={{ fontSize: "10px", color: "var(--fg-subtle)", marginLeft: "8px" }}>{version.name}</span>
          </div>
          {onDownload ? (
            <button
              type="button"
              disabled={downloadingId === version.abbreviation}
              onClick={() => onDownload(version.abbreviation)}
              style={{
                background: "var(--color-primary-muted)",
                border: "none",
                color: "var(--color-primary)",
                borderRadius: "var(--radius-md)",
                fontSize: "10px",
                fontWeight: 700,
                padding: "4px 10px",
                cursor: "pointer",
              }}
            >
              {downloadingId === version.abbreviation ? "Downloading..." : "Download"}
            </button>
          ) : (
            <StatusPill tone="success" label="Bundled" />
          )}
        </div>
      ))}
    </div>
  );
}
