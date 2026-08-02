/**
 * Inline SVG icon set for the Auth gate, matching the icons used in the
 * reference zip (lucide: LogIn, PlusCircle, ShieldCheck, ArrowRight,
 * MapPin) but redrawn as plain stroke SVGs (24x24, currentColor) so no new
 * icon library dependency is introduced — same convention as
 * HeaderBar.tsx/Settings/icons.tsx.
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
      width="15"
      height="15"
      {...props}
    />
  );
}

export function IconLogIn(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="15,17 20,12 15,7" />
      <line x1="20" y1="12" x2="9" y2="12" />
    </Base>
  );
}

export function IconPlusCircle(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </Base>
  );
}

export function IconShieldCheck(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
      <polyline points="8.5,12.2 11,14.7 15.5,9.5" />
    </Base>
  );
}

export function IconArrowRight(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <line x1="4" y1="12" x2="20" y2="12" />
      <polyline points="14,6 20,12 14,18" />
    </Base>
  );
}

export function IconMapPin(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
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

export function IconAlertCircle(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <circle cx="12" cy="16.2" r="0.9" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconChevronDown(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <polyline points="6,9 12,15 18,9" />
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
