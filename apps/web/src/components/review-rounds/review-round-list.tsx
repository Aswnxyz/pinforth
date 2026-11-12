import type { ReactNode } from "react";
import type { ReviewRound, ReviewRoundStatus } from "@/lib/review-rounds/api";
import { formatIssueDate } from "@/lib/issues/labels";

const STATUS_LABELS: Record<ReviewRoundStatus, string> = {
  ACTIVE: "Active",
  CLOSED: "Closed",
  ARCHIVED: "Archived",
};

const STATUS_TONES: Record<ReviewRoundStatus, string> = {
  ACTIVE: "border-status-approved/40 bg-status-approved/10 text-status-approved",
  CLOSED: "border-border bg-surface-muted text-muted-foreground",
  ARCHIVED: "border-border bg-surface-muted text-muted-foreground",
};

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/**
 * One card per review round. Presentational: `onInvite` is passed only to
 * managers, and `panel` renders the round's open invite flow, if any.
 */
export function ReviewRoundList({
  rounds,
  onInvite,
  panel,
}: {
  rounds: readonly ReviewRound[];
  onInvite?: (round: ReviewRound) => void;
  panel: (round: ReviewRound) => ReactNode;
}) {
  return (
    <ul className="space-y-4">
      {rounds.map((round) => {
        const open = panel(round);

        return (
          <li
            key={round.id}
            className="rounded-xl border border-border bg-surface-raised p-5 shadow-xs"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold wrap-break-word text-foreground">
                    {round.name}
                  </h2>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_TONES[round.status]}`}
                  >
                    {STATUS_LABELS[round.status]}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {round.environment.name} ·{" "}
                  <span className="font-mono break-all">{round.environment.url}</span>
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  {plural(round.activeLinksCount, "active link", "active links")} ·{" "}
                  {plural(round.issuesCount, "issue", "issues")} · Started{" "}
                  {formatIssueDate(round.createdAt)}
                </p>
              </div>

              {onInvite && round.status === "ACTIVE" && !open ? (
                <button
                  type="button"
                  onClick={() => onInvite(round)}
                  aria-label={`Invite a reviewer to ${round.name}`}
                  className="inline-flex h-9 shrink-0 items-center rounded-md border border-border-strong bg-surface-raised px-3 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Invite reviewer
                </button>
              ) : null}
            </div>

            {round.description ? (
              <p className="mt-3 text-sm leading-6 wrap-break-word whitespace-pre-wrap text-foreground">
                {round.description}
              </p>
            ) : null}

            {open ? <div className="mt-4 border-t border-border pt-4">{open}</div> : null}
          </li>
        );
      })}
    </ul>
  );
}
