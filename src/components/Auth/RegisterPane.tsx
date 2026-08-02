import { useState, type FormEvent } from "react";

import { IconArrowRight, IconMapPin, IconShieldCheck } from "./icons";
import { AuthErrorBanner, AuthField, AuthInput, AuthPrimaryButton, AuthSuccessBanner, LockedSelectField, TextLinkButton } from "./primitives";
import { PARENT_DENOMINATION, composeChurchId, generateChurchIdSuffix, type BranchAccount } from "./types";

interface RegisterPaneProps {
  directory: BranchAccount[];
  onRegistered: (branch: BranchAccount) => void;
  onProceedToLogin: (branch: BranchAccount) => void;
}

export function RegisterPane({ directory, onRegistered, onProceedToLogin }: RegisterPaneProps) {
  const [branchName, setBranchName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [suffix, setSuffix] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<BranchAccount | null>(null);

  const codePreview = `${PARENT_DENOMINATION.shortCode}-${suffix || "AUTO-GEN"}`;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!branchName.trim() || !city.trim() || !password) {
      setError("Branch name, city, and password are required.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const location = [city.trim(), state.trim()].filter(Boolean).join(", ");
    const newBranch: BranchAccount = {
      id: composeChurchId(suffix || generateChurchIdSuffix()),
      name: branchName.trim(),
      location,
      password,
      operatorName: operatorName.trim() || undefined,
    };

    onRegistered(newBranch);
    setCreated(newBranch);
  };

  if (created) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: "var(--text-xl)", fontWeight: 700, color: "var(--fg-base)" }}>
            Branch Registered
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)", lineHeight: 1.5 }}>
            Your branch has been assigned a Church ID. Keep it and the password safe — both are required to sign in.
          </p>
        </div>

        <AuthSuccessBanner>Registration complete for "{created.name}".</AuthSuccessBanner>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            padding: "16px",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-elevated)",
          }}
        >
          <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--fg-subtle)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Assigned Church ID
          </span>
          <span style={{ fontSize: "var(--text-lg)", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-primary)", letterSpacing: "0.05em" }}>
            {created.id}
          </span>
          <span style={{ fontSize: "10px", color: "var(--fg-subtle)" }}>{created.location}</span>
        </div>

        <AuthPrimaryButton type="button" onClick={() => onProceedToLogin(created)} trailingIcon={<IconArrowRight />}>
          Proceed to Sign In
        </AuthPrimaryButton>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div>
        <h2 style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: "var(--text-xl)", fontWeight: 700, color: "var(--fg-base)" }}>
          Register Branch
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)", lineHeight: 1.5 }}>
          New Foursquare Gospel Church Nigeria branches receive a Church ID after registering here.
        </p>
      </div>

      {error ? <AuthErrorBanner>{error}</AuthErrorBanner> : null}

      <LockedSelectField
        label="Parent Denomination / Network"
        value={`${PARENT_DENOMINATION.name} (${PARENT_DENOMINATION.shortCode}) — ${directory.length} Active Branches`}
      />

      <AuthField label="Branch / Campus Name" required>
        <AuthInput value={branchName} onChange={setBranchName} placeholder="e.g. Foursquare Gospel Church, Trans-Amadi" required />
      </AuthField>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--color-primary)",
          }}
        >
          <IconMapPin />
          <span>Branch Location</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
          <AuthField label="City" required>
            <AuthInput value={city} onChange={setCity} placeholder="e.g. Port Harcourt" required />
          </AuthField>
          <AuthField label="State">
            <AuthInput value={state} onChange={setState} placeholder="e.g. Rivers State" />
          </AuthField>
        </div>
      </div>

      <AuthField label="Operator / Media Lead Name" hint="Optional — whoever primarily runs the console">
        <AuthInput value={operatorName} onChange={setOperatorName} placeholder="e.g. Bro. Emeka Johnson" />
      </AuthField>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
        <AuthField label="Branch Password" required>
          <AuthInput value={password} onChange={setPassword} secret placeholder="Set password" required />
        </AuthField>
        <AuthField label="Retype Password" required>
          <AuthInput value={confirmPassword} onChange={setConfirmPassword} secret placeholder="Confirm password" required />
        </AuthField>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
          paddingTop: "var(--space-3)",
          borderTop: "1px solid var(--border-base)",
        }}
      >
        <div>
          <span
            style={{
              display: "block",
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--fg-subtle)",
            }}
          >
            Generated Code Preview:
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-lg)",
              fontWeight: 700,
              color: "var(--color-primary)",
              letterSpacing: "0.04em",
            }}
          >
            {codePreview}
          </span>
        </div>
        <TextLinkButton onClick={() => setSuffix(generateChurchIdSuffix())}>Regenerate</TextLinkButton>
      </div>

      <AuthPrimaryButton icon={<IconShieldCheck />} style={{ marginTop: "var(--space-2)" }}>
        Complete Registration
      </AuthPrimaryButton>
    </form>
  );
}
