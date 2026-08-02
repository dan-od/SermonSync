/**
 * SermonSync Auth — Church/Branch ID + Password gate.
 *
 * Per PRD v3.0 §8.1/§9, distribution is a single-string Church ID issued by
 * Foursquare HQ (no email, no separate account system). Per direct product
 * decision this now pairs the Church ID with a branch password so a device
 * can't be used without both — a slight extension of the PRD, not a
 * replacement of it. There is only one parent denomination (Foursquare
 * Gospel Church Nigeria), so there is no multi-org selector like a generic
 * multi-tenant SaaS would have.
 *
 * The branch directory below is mock/local data — matching the rest of the
 * app's approach of shipping UI ahead of the real Rust/Python backend (see
 * configStore.ts's own TODO about persisting to secure storage).
 */

export interface BranchAccount {
  /** Church ID, e.g. "FSQ-3A5HE6" */
  id: string;
  name: string;
  location: string;
  password: string;
  operatorName?: string;
}

export const DENOMINATION_NAME = "Foursquare Gospel Church Nigeria";
export const CHURCH_ID_PREFIX = "FSQ";
/** Number of characters in the Church ID suffix, after the fixed "FSQ-" prefix. */
export const CHURCH_ID_SUFFIX_LENGTH = 6;

export interface ParentDenomination {
  id: string;
  name: string;
  shortCode: string;
}

/** Single-denomination internal tool — only one network exists. */
export const PARENT_DENOMINATION: ParentDenomination = {
  id: "denom-fsq-ng",
  name: DENOMINATION_NAME,
  shortCode: CHURCH_ID_PREFIX,
};

export const INITIAL_BRANCH_DIRECTORY: BranchAccount[] = [
  {
    id: "FSQ-3A5HE6",
    name: "Foursquare Gospel Church, Mgbuogba",
    location: "Port Harcourt, Rivers State",
    password: "sermonsync2026",
    operatorName: "Media Team",
  },
  {
    id: "FSQ-9X2K4L",
    name: "Foursquare Gospel Church, Yaba",
    location: "Lagos, Lagos State",
    password: "yaba-media-01",
    operatorName: "Bro. Chidi Okafor",
  },
  {
    id: "FSQ-4M8P1Z",
    name: "Foursquare Gospel Church, Wuse",
    location: "Abuja, FCT",
    password: "wuse-media-02",
    operatorName: "Sis. Amaka Eze",
  },
];

/** Generates a random 6-character Church ID suffix, e.g. "XJ4M9K". */
export function generateChurchIdSuffix(): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let suffix = "";
  for (let i = 0; i < CHURCH_ID_SUFFIX_LENGTH; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return suffix;
}

/** Composes the full Church ID from a suffix, e.g. "FSQ-XJ4M9K". */
export function composeChurchId(suffix: string): string {
  return `${CHURCH_ID_PREFIX}-${suffix.toUpperCase()}`;
}


