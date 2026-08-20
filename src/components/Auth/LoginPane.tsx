import { useState, type FormEvent } from "react";

import { ChurchIdInput } from "./ChurchIdInput";
import { IconArrowRight, IconShieldCheck } from "./icons";
import { AuthErrorBanner, AuthField, AuthInput, AuthPrimaryButton } from "./primitives";
import { CHURCH_ID_PREFIX, composeChurchId, type BranchAccount } from "./types";

interface LoginPaneProps {
  directory: BranchAccount[];
  onSuccess: (branch: BranchAccount) => void;
}

export function LoginPane({ directory, onSuccess }: LoginPaneProps) {
  const [suffix, setSuffix] = useState(() => directory[0]?.id.replace(`${CHURCH_ID_PREFIX}-`, "") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsVerifying(true);

    setTimeout(() => {
      const cleanId = composeChurchId(suffix);
      const branch = directory.find((b) => b.id.toUpperCase() === cleanId);

      if (!branch) {
        setError(`Church ID "${cleanId}" was not found. Check your ID or register this branch.`);
        setIsVerifying(false);
        return;
      }

      if (branch.password !== password) {
        setError("Incorrect password for this Church ID.");
        setIsVerifying(false);
        return;
      }

      setIsVerifying(false);
      onSuccess(branch);
    }, 500);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div>
        <h2 style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: "var(--text-xl)", fontWeight: 700, color: "var(--fg-base)" }}>
          Branch Sign In
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)", lineHeight: 1.5 }}>
          Enter your Church ID and branch password to open the operator console.
        </p>
      </div>

      {error ? <AuthErrorBanner>{error}</AuthErrorBanner> : null}

      <AuthField label="Church ID" required hint="Assigned by Foursquare HQ on first launch. Format: FSQ-XXXXXX">
        <ChurchIdInput value={suffix} onChange={setSuffix} />
      </AuthField>

      <AuthField label="Branch Password" required>
        <AuthInput value={password} onChange={setPassword} secret placeholder="••••••••••••" required />
      </AuthField>

      <AuthPrimaryButton
        disabled={isVerifying}
        icon={<IconShieldCheck />}
        trailingIcon={isVerifying ? undefined : <IconArrowRight />}
        style={{ marginTop: "var(--space-2)" }}
      >
        {isVerifying ? "Verifying..." : "Open Operator Console"}
      </AuthPrimaryButton>
    </form>
  );
}
