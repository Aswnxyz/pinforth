"use client";

import { useId, useState } from "react";
import type { Deployment, LatestDeployment } from "@/lib/deployments/api";
import { formatDeploymentTime, newestDeployment } from "@/lib/deployments/deployment-values";
import { DeploymentHistory } from "./deployment-history";
import { RecordDeploymentForm } from "./record-deployment-form";

const linkButton =
  "inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * One environment's deployments: the latest recorded version, the history
 * and recording a new one. "Latest" is the newest record, not a live check.
 */
export function EnvironmentDeployments({
  orgId,
  projectSlug,
  environment,
  latest,
  onGone,
  onLogin,
}: {
  orgId: string;
  projectSlug: string;
  environment: { id: string; name: string };
  /** From the project read; undefined when it wasn't sent. */
  latest: LatestDeployment | null | undefined;
  onGone: () => void;
  onLogin: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  // Recorded here since the project was read, so the line updates without a reload.
  const [recorded, setRecorded] = useState<Deployment | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [historyToken, setHistoryToken] = useState(0);
  const shown = newestDeployment<LatestDeployment>(latest, recorded);

  function handleRecorded(deployment: Deployment, message: string) {
    setRecorded((current) => newestDeployment(current, deployment));
    setRecording(false);
    setNotice(message);
    setHistoryToken((token) => token + 1);
  }

  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">
        {shown ? (
          <>
            Latest deployment:{" "}
            <span className="font-mono font-semibold break-all text-foreground">{shown.label}</span>
            <span className="text-xs"> · recorded {formatDeploymentTime(shown.createdAt)}</span>
          </>
        ) : (
          "No deployments recorded yet."
        )}
      </p>

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {shown ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`${id}-history`}
            onClick={() => setOpen((value) => !value)}
            className={linkButton}
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className={`size-3.5 fill-current transition-transform ${open ? "rotate-90" : ""}`}>
              <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
            </svg>
            Deployment history
            <span className="sr-only"> for {environment.name}</span>
          </button>
        ) : null}
        {recording ? null : (
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              setRecording(true);
            }}
            className={linkButton}
          >
            Record deployment
            <span className="sr-only"> on {environment.name}</span>
          </button>
        )}
      </div>

      <p role="status" className="text-xs leading-5 text-muted-foreground">
        {notice}
      </p>

      {recording ? (
        <RecordDeploymentForm
          orgId={orgId}
          projectSlug={projectSlug}
          environment={environment}
          onRecorded={handleRecorded}
          onCancel={() => setRecording(false)}
          onGone={onGone}
          onLogin={onLogin}
        />
      ) : null}

      {open && shown ? (
        <div id={`${id}-history`} className="pl-5">
          <DeploymentHistory
            key={historyToken}
            orgId={orgId}
            projectSlug={projectSlug}
            environmentId={environment.id}
            onGone={onGone}
            onLogin={onLogin}
          />
        </div>
      ) : null}
    </div>
  );
}
