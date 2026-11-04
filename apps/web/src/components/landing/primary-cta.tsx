import Link from "next/link";
import type { PrimaryCtaAction } from "./landing-content";

const BASE =
  "inline-flex h-11 min-w-[13rem] items-center justify-center gap-2 rounded-full px-7 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * The primary landing CTA.
 *
 * Presentational on purpose: the client islands resolve a
 * `PrimaryCtaAction` from the auth context and hand it here, so the loading
 * state renders a same-geometry skeleton with no link — a visitor never sees
 * an anonymous CTA swap after the session resolves.
 */
export function PrimaryCta({
  action,
  className = "",
}: {
  action: PrimaryCtaAction;
  className?: string;
}) {
  if (action.kind === "loading") {
    return (
      <span
        aria-busy="true"
        className={`${BASE} animate-pulse bg-accent text-accent-foreground ${className}`}
      >
        <span className="sr-only">Checking your session</span>
      </span>
    );
  }

  const { href, label } = action;

  return (
    <Link
      href={href}
      className={`${BASE} bg-accent text-accent-foreground shadow-[0_12px_40px_-14px_var(--lp-glow)] transition-all hover:-translate-y-0.5 hover:bg-accent-hover ${className}`}
    >
      {label}
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="size-4 fill-none stroke-current stroke-2"
      >
        <path d="M2.5 8h10m0 0L8.75 4.25M12.5 8l-3.75 3.75" />
      </svg>
    </Link>
  );
}
