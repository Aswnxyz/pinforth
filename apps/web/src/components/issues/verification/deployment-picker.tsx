"use client";

import { useEffect } from "react";
import { SelectField } from "@/components/ui/select-field";
import type { Deployment } from "@/lib/deployments/api";
import { formatDeploymentTime } from "@/lib/deployments/deployment-values";
import type { LoadState } from "@/lib/issues/issue-loading";
import { linkButton } from "./styles";

type Option = Pick<Deployment, "id" | "label" | "createdAt">;

/**
 * Picks a deployment on one environment, newest first. "Record a new
 * deployment" asks the parent to swap in the record form: it can't nest here,
 * because a form inside a form would submit both.
 */
export function DeploymentPicker({
  environment,
  label,
  hint,
  state,
  options,
  value,
  error,
  disabled,
  onChange,
  onRetry,
  onRecord,
  onLogin,
}: {
  environment: { id: string; name: string };
  label: string;
  hint?: string;
  state: LoadState<unknown>["kind"];
  /** Already filtered to what may be chosen. */
  options: readonly Option[];
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (id: string) => void;
  onRetry: () => void;
  onRecord: () => void;
  onLogin: () => void;
}) {
  useEffect(() => {
    if (state === "login") onLogin();
  }, [state, onLogin]);

  const record = (
    <button type="button" onClick={onRecord} disabled={disabled} className={linkButton}>
      Record a new deployment
      <span className="sr-only"> on {environment.name}</span>
    </button>
  );

  if (state === "loading") {
    return <p className="text-sm text-muted-foreground">Loading deployments on {environment.name}…</p>;
  }

  if (options.length === 0) {
    return (
      <div className="space-y-2 rounded-md border border-border bg-surface-muted px-3 py-2.5 text-sm">
        {state === "ready" ? (
          <p className="text-muted-foreground">No deployments recorded on {environment.name} yet. Record the one that has the fix.</p>
        ) : (
          <p className="text-danger">
            We couldn’t load the deployments on {environment.name}.{" "}
            <button type="button" onClick={onRetry} className={linkButton}>
              Try again
            </button>
          </p>
        )}
        {record}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <SelectField
        label={label}
        name="deploymentId"
        value={value}
        hint={hint}
        error={error}
        disabled={disabled}
        onChange={onChange}
        options={options.map((option) => ({
          value: option.id,
          label: `${option.label} · ${formatDeploymentTime(option.createdAt)}`,
        }))}
      />
      {record}
    </div>
  );
}
