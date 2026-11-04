import type { ReactNode } from "react";
import type { Issue } from "@/lib/issues/api";
import { safeWebsiteUrl } from "@/lib/projects/urls";

/**
 * Reads the widget-captured context defensively: it is free-form JSON, so
 * only values of the expected type are shown and everything else is ignored.
 */
export function readIssueContext(context: Issue["context"]): {
  selector: string | null;
  viewport: string | null;
  browser: string | null;
} {
  const value = context ?? {};
  const viewport = value.viewport as { width?: unknown; height?: unknown } | undefined;

  return {
    selector: typeof value.selector === "string" ? value.selector : null,
    viewport:
      viewport && Number.isFinite(viewport.width) && Number.isFinite(viewport.height)
        ? `${viewport.width} × ${viewport.height}`
        : null,
    browser: typeof value.browser === "string" ? value.browser : null,
  };
}

/**
 * Where the issue was reported: page, element, screen size and browser.
 * Renders nothing until the feedback widget fills these in.
 */
export function IssueContext({ issue }: { issue: Pick<Issue, "pageUrl" | "context"> }) {
  const { selector, viewport, browser } = readIssueContext(issue.context);
  if (!issue.pageUrl && !selector && !viewport && !browser) return null;

  // Only a normal web address may become a link; anything else is shown as
  // text so it can never execute on click.
  const href = issue.pageUrl ? safeWebsiteUrl(issue.pageUrl) : null;

  return (
    <section className="rounded-xl border border-border bg-surface-raised p-5 shadow-xs">
      <h2 className="text-sm font-semibold text-foreground">Page and element</h2>

      <dl className="mt-3 space-y-3">
        {issue.pageUrl ? (
          <Row label="Page">
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-sm break-all text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {href}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : (
              <span className="font-mono text-sm break-all text-muted-foreground">
                {issue.pageUrl}
              </span>
            )}
          </Row>
        ) : null}
        {selector ? (
          <Row label="Element">
            <code className="font-mono text-sm break-all text-foreground">{selector}</code>
          </Row>
        ) : null}
        {viewport ? <Row label="Screen size">{viewport}</Row> : null}
        {browser ? <Row label="Browser">{browser}</Row> : null}
      </dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-foreground">{children}</dd>
    </div>
  );
}
