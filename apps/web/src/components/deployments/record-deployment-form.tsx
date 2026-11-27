"use client";

import { useRef, useState, type FormEvent } from "react";
import { DEPLOYMENT_LABEL_MAX_LENGTH, DEPLOYMENT_NOTES_MAX_LENGTH, DEPLOYMENT_URL_MAX_LENGTH } from "@pinforth/shared";
import { FormAlert } from "@/components/ui/form-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { focusFirstInvalid } from "@/lib/auth/validation";
import {
  createDeployment,
  listDeployments,
  DEPLOYMENT_PAGE_LIMIT,
  type CreateDeploymentInput,
  type Deployment,
  type DeploymentFieldErrors,
} from "@/lib/deployments/api";
import {
  EMPTY_DEPLOYMENT_VALUES,
  findRecordedDeployment,
  labelTakenMessage,
  prepareDeployment,
  unconfirmedRecordMessage,
  type DeploymentValues,
} from "@/lib/deployments/deployment-values";
import { createRequestGuard } from "@/lib/projects/project-detail";

const secondaryButton =
  "inline-flex h-11 w-full items-center justify-center rounded-md border border-border-strong bg-surface-raised px-4 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Records a deployment on one environment. Deployments can't be edited, so a
 * create whose outcome is unknown is never sent again blindly: the history is
 * read back by label first (contract §11).
 */
export function RecordDeploymentForm({
  orgId,
  projectSlug,
  environment,
  onRecorded,
  onCancel,
  onGone,
  onLogin,
}: {
  orgId: string;
  projectSlug: string;
  environment: { id: string; name: string };
  onRecorded: (deployment: Deployment, notice: string) => void;
  onCancel: () => void;
  onGone: () => void;
  onLogin: () => void;
}) {
  const [values, setValues] = useState<DeploymentValues>(EMPTY_DEPLOYMENT_VALUES);
  const [errors, setErrors] = useState<DeploymentFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [phase, setPhase] = useState<"filling" | "saving" | "checking">("filling");
  // What was sent when its outcome is unknown. Blocks another create until checked.
  const [unconfirmed, setUnconfirmed] = useState<CreateDeploymentInput | null>(null);
  const guard = useRef(createRequestGuard());
  const busy = phase !== "filling";

  function edit(field: keyof DeploymentValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function check(input: CreateDeploymentInput, reason: "unconfirmed" | "taken", takenMessage = "") {
    const token = guard.current.start();
    setPhase("checking");
    setMessage(null);

    const result = await findRecordedDeployment(
      (cursor) => listDeployments(orgId, projectSlug, environment.id, cursor, DEPLOYMENT_PAGE_LIMIT),
      input,
    );
    if (!guard.current.accept(token)) return;
    setPhase("filling");
    setUnconfirmed(result.kind === "unknown" ? input : null);

    switch (result.kind) {
      case "login":
        return onLogin();
      case "gone":
        return onGone();
      case "recorded":
        return onRecorded(
          result.deployment,
          reason === "taken" ? `“${input.label}” is already recorded with these details.` : `Recorded “${input.label}”.`,
        );
      case "different":
        return setErrors({ label: labelTakenMessage(input.label) });
      case "missing":
        return reason === "taken"
          ? setErrors({ label: takenMessage })
          : setMessage(`“${input.label}” wasn’t recorded. You can try again.`);
      case "unknown":
        return setMessage(unconfirmedRecordMessage(input.label));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || unconfirmed) return;

    const prepared = prepareDeployment(values);
    if ("errors" in prepared) {
      setErrors(prepared.errors);
      focusFirstInvalid(event.currentTarget, Object.keys(prepared.errors));
      return;
    }

    const { input } = prepared;
    const token = guard.current.start();
    setPhase("saving");
    setErrors({});
    setMessage(null);

    const outcome = await createDeployment(orgId, projectSlug, environment.id, input);
    if (!guard.current.accept(token)) return;

    if (outcome.status === "success") return onRecorded(outcome.data, `Recorded “${outcome.data.label}”.`);
    if (outcome.status === "unavailable") return check(input, "unconfirmed");
    // A 409 may be this person's own earlier attempt; the history tells.
    if (outcome.status === "conflict" && outcome.labelTaken) return check(input, "taken", outcome.message);

    setPhase("filling");
    if (outcome.status === "unauthorized") return onLogin();
    if (outcome.status === "not-found") return onGone();
    if (outcome.status === "rejected" && outcome.fields) return setErrors(outcome.fields);
    setMessage(outcome.message);
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">Record a deployment on {environment.name}</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          A version of the website that fixes can be tested on. Records can’t be edited later.
        </p>
      </div>

      {message ? <FormAlert>{message}</FormAlert> : null}

      <TextField
        label="Version label"
        name="label"
        required
        maxLength={DEPLOYMENT_LABEL_MAX_LENGTH}
        placeholder="v1.5"
        hint="Unique on this environment. Capitals count: v1.5 and V1.5 are different."
        value={values.label}
        disabled={busy}
        onChange={(value) => edit("label", value)}
        error={errors.label}
      />
      <TextField
        label="Commit SHA (optional)"
        name="commitSha"
        maxLength={40}
        placeholder="a1b2c3d"
        value={values.commitSha}
        disabled={busy}
        onChange={(value) => edit("commitSha", value)}
        error={errors.commitSha}
      />
      <TextField
        label="Deployment URL (optional)"
        name="url"
        type="url"
        maxLength={DEPLOYMENT_URL_MAX_LENGTH}
        placeholder="https://staging.example.com"
        hint="Without a username or password."
        value={values.url}
        disabled={busy}
        onChange={(value) => edit("url", value)}
        error={errors.url}
      />
      <TextArea
        label="Notes (optional)"
        name="notes"
        rows={3}
        maxLength={DEPLOYMENT_NOTES_MAX_LENGTH}
        placeholder="What changed in this version"
        value={values.notes}
        disabled={busy}
        onChange={(value) => edit("notes", value)}
        error={errors.notes}
      />

      <div className="space-y-2">
        {unconfirmed ? (
          <button type="button" onClick={() => void check(unconfirmed, "unconfirmed")} disabled={busy} className={secondaryButton}>
            {phase === "checking" ? "Checking…" : `Check whether “${unconfirmed.label}” was recorded`}
          </button>
        ) : (
          <SubmitButton pending={busy} pendingLabel={phase === "checking" ? "Checking…" : "Recording…"}>
            Record deployment
          </SubmitButton>
        )}
        <button type="button" onClick={onCancel} disabled={busy} className={secondaryButton}>
          Cancel
        </button>
      </div>
    </form>
  );
}
