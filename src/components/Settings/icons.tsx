/**
 * Minimal inline SVG icon set for the Settings panel.
 *
 * Matches the stroke-based style already used in HeaderBar.tsx (24x24
 * viewBox, currentColor stroke, no external icon library dependency).
 */
import type { SVGProps } from "react";

function Base(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      width="16"
      height="16"
      {...props}
    />
  );
}

export function IconGeneral(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="8" cy="6" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="10" cy="18" r="1.6" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconMic(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </Base>
  );
}

export function IconSparkles(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />
    </Base>
  );
}

export function IconBook(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5A1.5 1.5 0 0 1 18.5 20H6.5A2.5 2.5 0 0 1 4 17.5v-12Z" />
      <path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20" />
    </Base>
  );
}

export function IconMonitor(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <line x1="8" y1="20" x2="16" y2="20" />
      <line x1="12" y1="16" x2="12" y2="20" />
    </Base>
  );
}

export function IconLayout(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="9" y1="9" x2="9" y2="20" />
    </Base>
  );
}

export function IconPalette(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-.9.7-1.5 1.5-1.5H16a4 4 0 0 0 4-4c0-4.4-3.6-8-8-8Z" />
      <circle cx="7.5" cy="10.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="11" cy="7" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconTerminal(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <polyline points="7,9 10,12 7,15" />
      <line x1="12" y1="15" x2="16" y2="15" />
    </Base>
  );
}

export function IconUserCircle(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6 19a6 6 0 0 1 12 0" />
    </Base>
  );
}

export function IconHelp(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.2a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 1.6-2.4 3.5" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconArchive(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v10a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18V8" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </Base>
  );
}

export function IconX(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </Base>
  );
}

export function IconEye(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </Base>
  );
}

export function IconEyeOff(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a15.6 15.6 0 0 1-3.2 4.1M6.6 6.6C4 8.3 2 12 2 12s3.5 7 10 7c1.2 0 2.4-.2 3.4-.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </Base>
  );
}

export function IconPlus(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Base>
  );
}

export function IconUpload(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </Base>
  );
}

export function IconDownload(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M12 4v12M7 11l5 5 5-5" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </Base>
  );
}

export function IconRefresh(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M3 12a9 9 0 0 1 15.4-6.4L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.4 6.4L3 16" />
      <path d="M3 21v-5h5" />
    </Base>
  );
}

export function IconCheckCircle(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="8.5,12.5 11,15 15.5,9" />
    </Base>
  );
}

export function IconAlertCircle(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <circle cx="12" cy="16.2" r="0.9" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconInfo(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="10.5" x2="12" y2="16" />
      <circle cx="12" cy="7.5" r="0.9" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconTrash(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <path d="M6 7l1 13a1.5 1.5 0 0 0 1.5 1.4h7a1.5 1.5 0 0 0 1.5-1.4L18 7" />
      <line x1="9.5" y1="4" x2="14.5" y2="4" />
    </Base>
  );
}
