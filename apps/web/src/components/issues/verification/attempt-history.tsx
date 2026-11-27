import type { ReactNode } from "react";
import { formatDeploymentTime } from "@/lib/deployments/deployment-values";
import type { LoadState } from "@/lib/issues/issue-loading";
import type { Attempt } from "@/lib/issues/verification-api";
import { actorName, attemptState, type AttemptState } from "@/lib/issues/verification-values";
import { linkButton } from "./styles";

const STATE: Record<AttemptState, { label: string; tone: string }> = {
  waiting: {
    label: "Waiting for test",
    tone: "border-status-qa-pending/40 bg-status-qa-pending-bg text-status-qa-pending-foreground",
  },
  passed: {
    label: "Passed",
    tone: "border-status-qa-verified/40 bg-status-qa-verified/10 text-status-qa-verified-foreground",
  },
  failed: { label: "Failed", tone: "border-status-blocked/40 bg-status-blocked/10 text-status-blocked-foreground" },
  withdrawn: { label: "Withdrawn", tone: "border-border bg-surface-muted text-muted-foreground" },
  untested: { label: "Not tested", tone: "border-border bg-surface-muted text-muted-foreground" },
};

/** Every fix and its test, newest first. Failed and withdrawn ones stay. */
export function AttemptHistory({
  state,
  pendingFixId,
  onRetry,
}: {
  state: LoadState<Attempt[]>;
  pendingFixId: string | null;
  onRetry: () => void;
}) {
  return (
    <section aria-labelledby="attempts-heading" className="space-y-3">
      <h3 id="attempts-heading" className="text-sm font-semibold text-foreground">
        Attempts
      </h3>
      {state.kind === "loading" ? <p className="text-sm text-muted-foreground">Loading attempts…</p> : null}
      {state.kind === "unavailable" || state.kind === "forbidden" ? (
        <p className="text-sm text-danger">
          We couldn’t load the attempts.{" "}
          <button type="button" onClick={onRetry} className={linkButton}>
            Try again
          </button>
        </p>
      ) : null}
      {state.kind === "ready" ? (
        <ol className="space-y-3">
          {state.data.map((attempt) => (
            <AttemptRow key={attempt.fix.id} attempt={attempt} state={attemptState(attempt, pendingFixId)} />
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function AttemptRow({ attempt, state }: { attempt: Attempt; state: AttemptState }) {
  const { fix, verification } = attempt;
  return (
    <li className="space-y-2 rounded-lg border border-border bg-surface p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-foreground">Attempt {attempt.attempt}</span>
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${STATE[state].tone}`}>
          {STATE[state].label}
        </span>
        {verification?.selfVerified ? (
          <span className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Self-verified
          </span>
        ) : null}
      </div>

      <Line note={fix.note}>
        Fix in <Label>{fix.deployment.label}</Label> by {actorName(fix.submittedBy)} · {formatDeploymentTime(fix.createdAt)}
      </Line>

      {fix.withdrawnAt ? (
        <Line note={null}>
          Withdrawn by {actorName(fix.withdrawnBy)} · {formatDeploymentTime(fix.withdrawnAt)}
        </Line>
      ) : null}

      {verification ? (
        <Line note={verification.note}>
          {verification.result === "PASS" ? "Passed" : "Failed"} on <Label>{verification.deployment.label}</Label> · tested
          by {actorName(verification.verifiedBy)} · {formatDeploymentTime(verification.createdAt)}
        </Line>
      ) : null}
    </li>
  );
}

function Line({ note, children }: { note: string | null; children: ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground">{children}</p>
      {note ? <p className="mt-1 wrap-break-word whitespace-pre-wrap text-foreground">{note}</p> : null}
    </div>
  );
}

const Label = ({ children }: { children: ReactNode }) => (
  <span className="font-mono font-semibold break-all text-foreground">{children}</span>
);
