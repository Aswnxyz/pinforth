"use client";

import { useState, type FormEvent } from "react";
import { FIX_NOTE_MAX_LENGTH } from "@pinforth/shared";
import { RecordDeploymentForm } from "@/components/deployments/record-deployment-form";
import { FormAlert } from "@/components/ui/form-alert";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextArea } from "@/components/ui/text-area";
import { focusFirstInvalid } from "@/lib/auth/validation";
import {
  STALE_ISSUE_CODES,
  submitFix,
  type FixWrite,
  type VerificationFieldErrors,
} from "@/lib/issues/verification-api";
import { prepareFix, UNCONFIRMED_FIX_MESSAGE, type FixValues } from "@/lib/issues/verification-values";
import { DeploymentPicker } from "./deployment-picker";
import { secondaryButton } from "./styles";
import { useEnvironmentDeployments } from "./use-environment-deployments";
import { useRetrySafeSend } from "./use-retry-safe-send";

/**
 * Records that a deployment has the fix. An issue without an environment
 * takes the chosen deployment's environment, for good (contract §4.1).
 */
export function SubmitFixForm({
  orgId,
  projectSlug,
  issueNumber,
  issueEnvironment,
  environments,
  onSubmitted,
  onStale,
  onCancel,
  onGone,
  onLogin,
}: {
  orgId: string;
  projectSlug: string;
  issueNumber: number;
  issueEnvironment: { id: string; name: string } | null;
  environments: readonly { id: string; name: string }[];
  onSubmitted: (write: FixWrite) => void;
  /** Our copy of the issue is out of date: say why and re-read it. */
  onStale: (message: string) => void;
  onCancel: () => void;
  onGone: () => void;
  onLogin: () => void;
}) {
  const [chosenEnvironmentId, setEnvironmentId] = useState(environments[0]?.id ?? "");
  const environment = issueEnvironment ?? environments.find((item) => item.id === chosenEnvironmentId) ?? null;
  const deployments = useEnvironmentDeployments(orgId, projectSlug, environment?.id ?? null);
  const options = deployments.state.kind === "ready" ? deployments.state.data : [];

  const [recording, setRecording] = useState(false);
  const [values, setValues] = useState<FixValues>({ deploymentId: "", note: "" });
  const [errors, setErrors] = useState<VerificationFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const sender = useRetrySafeSend((input: Parameters<typeof submitFix>[3]) =>
    submitFix(orgId, projectSlug, issueNumber, input),
  );
  // Newest by default; the chosen one only while it is still offered.
  const deploymentId = options.some((option) => option.id === values.deploymentId)
    ? values.deploymentId
    : (options[0]?.id ?? "");
  const locked = sender.pending || sender.unconfirmed !== null;

  function edit(change: Partial<FixValues>) {
    setValues((current) => ({ ...current, ...change }));
    setErrors({});
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sender.pending) return;

    let input = sender.unconfirmed;
    if (!input) {
      const prepared = prepareFix({ ...values, deploymentId }, sender.mutationId);
      if ("errors" in prepared) {
        setErrors(prepared.errors);
        focusFirstInvalid(event.currentTarget, Object.keys(prepared.errors));
        return;
      }
      input = prepared.input;
    }

    setMessage(null);
    const outcome = await sender.run(input);
    if (!outcome) return;

    switch (outcome.status) {
      case "success":
        return onSubmitted(outcome.data);
      case "unavailable":
        return setMessage(UNCONFIRMED_FIX_MESSAGE);
      case "unauthorized":
        return onLogin();
      case "not-found":
        return onGone();
      case "conflict":
        if ((STALE_ISSUE_CODES as readonly (string | null)[]).includes(outcome.code)) return onStale(outcome.message);
        if (outcome.code === "DEPLOYMENT_ENVIRONMENT_MISMATCH") return onStale(outcome.message);
        return setMessage(outcome.message);
      case "rejected":
        if (outcome.fields) return setErrors(outcome.fields);
        return setMessage(outcome.message);
      case "forbidden":
        return setMessage(outcome.message);
    }
  }

  // Replaces the fix form while open; what was typed here is kept.
  if (recording && environment) {
    return (
      <RecordDeploymentForm
        orgId={orgId}
        projectSlug={projectSlug}
        environment={environment}
        onRecorded={(deployment) => {
          setRecording(false);
          deployments.add(deployment);
          edit({ deploymentId: deployment.id });
        }}
        onCancel={() => setRecording(false)}
        onGone={onGone}
        onLogin={onLogin}
      />
    );
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">Submit a fix</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Say which deployment has the fix. A teammate then tests it there.
        </p>
      </div>

      {message ? <FormAlert>{message}</FormAlert> : null}

      {issueEnvironment ? null : environments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add an environment to the project first, then record a deployment on it.</p>
      ) : (
        <SelectField
          label="Environment"
          name="environmentId"
          value={chosenEnvironmentId}
          hint="The issue will be linked to this environment for good."
          disabled={locked}
          onChange={setEnvironmentId}
          options={environments.map((item) => ({ value: item.id, label: item.name }))}
        />
      )}

      {environment ? (
        <DeploymentPicker
          environment={environment}
          label="Deployment with the fix"
          state={deployments.state.kind}
          options={options}
          value={deploymentId}
          error={errors.deploymentId}
          disabled={locked}
          onChange={(id) => edit({ deploymentId: id })}
          onRetry={deployments.retry}
          onRecord={() => setRecording(true)}
          onLogin={onLogin}
        />
      ) : null}

      <TextArea
        label="Note (optional)"
        name="note"
        rows={3}
        maxLength={FIX_NOTE_MAX_LENGTH}
        placeholder="What changed, and anything the tester should know"
        value={values.note}
        disabled={locked}
        onChange={(note) => edit({ note })}
        error={errors.note}
      />

      <div className="space-y-2">
        <SubmitButton pending={sender.pending} pendingLabel="Submitting…" disabled={!deploymentId}>
          {sender.unconfirmed ? "Send again" : "Submit fix"}
        </SubmitButton>
        <button type="button" onClick={onCancel} disabled={sender.pending} className={secondaryButton}>
          Cancel
        </button>
      </div>
    </form>
  );
}
