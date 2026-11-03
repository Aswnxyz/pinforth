"use client";

import { useRef, useState, type FormEvent } from "react";
import { TextField } from "@/components/ui/text-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormAlert } from "@/components/ui/form-alert";
import {
  createInvitation,
  type InvitationRole,
} from "@/lib/organizations/invitations-api";

interface InviteMemberFormProps {
  organizationId: string;
}

export function InviteMemberForm({ organizationId }: InviteMemberFormProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitationRole>("MEMBER");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submitting = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting.current) return;

    submitting.current = true;
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await createInvitation(organizationId, email.trim(), role);

      if (result.ok && result.data?.invitation?.id) {
        setSuccess(`Invitation sent to ${result.data.invitation.email}.`);
        setEmail("");
        setRole("MEMBER");
        return;
      }

      if (result.code === "INVITATION_PENDING") {
        setError("This person already has a pending invitation.");
      } else if (result.code === "ALREADY_MEMBER") {
        setError("This person is already a member of this workspace.");
      } else if (result.code === "EMAIL_NOT_VERIFIED") {
        setError("Verify your email address before sending invitations.");
      } else if (result.status === 0 || result.status >= 500) {
        setError(
          "We couldn't confirm whether the invitation was sent. Check pending invitations before trying again.",
        );
      } else {
        setError(result.message || "Unable to send invitation.");
      }
    } catch {
      setError(
        "Something went wrong. Check pending invitations before retrying.",
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface-raised p-6 shadow-xs sm:p-8">
      <h2 className="text-lg font-semibold text-foreground">
        Invite a team member
      </h2>

      <p className="mt-1.5 text-sm text-muted-foreground">
        Invite someone to collaborate in this workspace.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <TextField
          label="Email address"
          name="email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="teammate@example.com"
          autoComplete="email"
          maxLength={320}
          disabled={pending}
          required
        />

        <div className="space-y-1.5">
          <label
            htmlFor="invite-role"
            className="block text-sm font-medium text-foreground"
          >
            Organization role
          </label>

          <select
            id="invite-role"
            value={role}
            onChange={(event) => setRole(event.target.value as InvitationRole)}
            disabled={pending}
            className="h-11 w-full rounded-md border border-border-strong bg-surface-raised px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-accent"
          >
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>

        {error && <FormAlert>{error}</FormAlert>}

        {success && (
          <p
            role="status"
            className="rounded-md border border-status-approved/40 bg-status-approved/10 px-3 py-2.5 text-sm text-status-approved"
          >
            {success}
          </p>
        )}

        <SubmitButton
          pending={pending}
          pendingLabel="Sending invitation..."
          disabled={!email.trim()}
        >
          Send invitation
        </SubmitButton>
      </form>
    </section>
  );
}
