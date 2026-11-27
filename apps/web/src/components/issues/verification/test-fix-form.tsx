"use client";

import { useId, useState, type FormEvent } from "react";
import { VERIFICATION_NOTE_MAX_LENGTH } from "@pinforth/shared";
import { RecordDeploymentForm } from "@/components/deployments/record-deployment-form";
import { FormAlert } from "@/components/ui/form-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextArea } from "@/components/ui/text-area";
import { focusFirstInvalid } from "@/lib/auth/validation";
import type { PendingFix } from "@/lib/issues/api";
import {
  recordVerification,
  STALE_ISSUE_CODES,
  type VerificationFieldErrors,
  type VerificationWrite,
} from "@/lib/issues/verification-api";
import { prepareTest, retestOptions, UNCONFIRMED_TEST_MESSAGE, type TestValues } from "@/lib/issues/verification-values";
import { DeploymentPicker } from "./deployment-picker";
import { secondaryButton } from "./styles";
import { useEnvironmentDeployments } from "./use-environment-deployments";
import { useRetrySafeSend } from "./use-retry-safe-send";

const RESULTS = [
  { value: "PASS", label: "Passed", hint: "It works on this deployment." },
  { value: "FAIL", label: "Failed", hint: "It still happens. The issue goes back to In progress." },
] as const;

/** Records Passed or Failed for the pending fix, on its deployment or a newer one. */
export function TestFixForm({
  orgId,
  projectSlug,
  issueNumber,
  fix,
  environmentName,
  selfVerify,
  onRecorded,
  onStale,
  onCancel,
  onGone,
  onLogin,
}: {
  orgId: string;
  projectSlug: string;
  issueNumber: number;
  fix: PendingFix;
  environmentName: string;
  /** The only member is testing their own fix. */
  selfVerify: boolean;
  onRecorded: (write: VerificationWrite) => void;
  onStale: (message: string) => void;
  onCancel: () => void;
  onGone: () => void;
  onLogin: () => void;
}) {
  const id = useId();
  const deployments = useEnvironmentDeployments(orgId, projectSlug, fix.deployment.environmentId);
  // If the list can't be read, the fix's own deployment is still offered.
  const options = retestOptions(deployments.state.kind === "ready" ? deployments.state.data : [], fix.deployment);

  const [recording, setRecording] = useState(false);
  const [values, setValues] = useState<TestValues>({ result: "", note: "", deploymentId: fix.deployment.id });
  const [errors, setErrors] = useState<VerificationFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const sender = useRetrySafeSend((input: Parameters<typeof recordVerification>[3]) =>
    recordVerification(orgId, projectSlug, issueNumber, input),
  );
  const locked = sender.pending || sender.unconfirmed !== null;

  function edit(change: Partial<TestValues>) {
    setValues((current) => ({ ...current, ...change }));
    setErrors({});
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sender.pending) return;

    let input = sender.unconfirmed;
    if (!input) {
      const prepared = prepareTest(values, fix.id, sender.mutationId);
      if ("errors" in prepared) {
        setErrors(prepared.errors);
        // namedItem gives a RadioNodeList for the radios, which can't be focused.
        if (prepared.errors.result) event.currentTarget.querySelector<HTMLInputElement>("input[name=result]")?.focus();
        else focusFirstInvalid(event.currentTarget, Object.keys(prepared.errors));
        return;
      }
      input = prepared.input;
    }

    setMessage(null);
    const outcome = await sender.run(input);
    if (!outcome) return;

    switch (outcome.status) {
      case "success":
        return onRecorded(outcome.data);
      case "unavailable":
        return setMessage(UNCONFIRMED_TEST_MESSAGE);
      case "unauthorized":
        return onLogin();
      case "not-found":
        return onGone();
      case "conflict":
        if ((STALE_ISSUE_CODES as readonly (string | null)[]).includes(outcome.code)) return onStale(outcome.message);
        if (outcome.code === "DEPLOYMENT_NOT_NEWER" || outcome.code === "DEPLOYMENT_ENVIRONMENT_MISMATCH") {
          return setErrors({ deploymentId: outcome.message });
        }
        return setMessage(outcome.message);
      case "rejected":
        if (outcome.fields) return setErrors(outcome.fields);
        return setMessage(outcome.message);
      case "forbidden":
        return setMessage(outcome.message);
    }
  }

  const environment = { id: fix.deployment.environmentId, name: environmentName };

  // Replaces this form while open; what was chosen here is kept.
  if (recording) {
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
        <h3 className="text-base font-semibold text-foreground">Test attempt {fix.attemptNumber}</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Retest what was reported on the deployment, then record what you found.
        </p>
      </div>

      {selfVerify ? (
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted-foreground">
          You submitted this fix. You’re the only member of this workspace, so the result will be recorded as{" "}
          <span className="font-medium text-foreground">self-verified</span>.
        </p>
      ) : null}

      {message ? <FormAlert>{message}</FormAlert> : null}

      <fieldset aria-describedby={errors.result ? `${id}-result-error` : undefined}>
        <legend className="text-sm font-medium text-foreground">Result</legend>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {RESULTS.map((result) => (
            <label
              key={result.value}
              className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent ${values.result === result.value ? "border-accent bg-accent/5" : "border-border"}`}
            >
              <input
                type="radio"
                name="result"
                value={result.value}
                checked={values.result === result.value}
                onChange={() => edit({ result: result.value })}
                disabled={locked}
                className="mt-1 accent-accent"
              />
              <span>
                <span className="block font-medium text-foreground">{result.label}</span>
                <span className="block text-xs text-muted-foreground">{result.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {errors.result ? (
          <p id={`${id}-result-error`} className="mt-2 text-sm text-danger">
            {errors.result}
          </p>
        ) : null}
      </fieldset>

      <DeploymentPicker
        environment={environment}
        label="Tested on"
        hint={`The fix is in ${fix.deployment.label}. You can test it there or on a newer deployment.`}
        // The fix's own deployment is always there, so a slow or failed list never blocks.
        state={deployments.state.kind === "login" ? "login" : "ready"}
        options={options}
        value={values.deploymentId}
        error={errors.deploymentId}
        disabled={locked}
        onChange={(deploymentId) => edit({ deploymentId })}
        onRetry={deployments.retry}
        onRecord={() => setRecording(true)}
        onLogin={onLogin}
      />

      <TextArea
        label={values.result === "FAIL" ? "What still fails?" : "Note (optional)"}
        name="note"
        rows={3}
        required={values.result === "FAIL"}
        maxLength={VERIFICATION_NOTE_MAX_LENGTH}
        placeholder={values.result === "FAIL" ? "Steps, browser and what you saw" : "What you checked"}
        value={values.note}
        disabled={locked}
        onChange={(note) => edit({ note })}
        error={errors.note}
      />

      <div className="space-y-2">
        <SubmitButton pending={sender.pending} pendingLabel="Recording…">
          {sender.unconfirmed ? "Send again" : "Record result"}
        </SubmitButton>
        <button type="button" onClick={onCancel} disabled={sender.pending} className={secondaryButton}>
          Cancel
        </button>
      </div>
    </form>
  );
}
