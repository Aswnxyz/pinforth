"use client";

import { useId, useSyncExternalStore } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { API_BASE_URL } from "@/lib/auth/api";
import { widgetCspSources, widgetSnippet } from "@/lib/widget/install";

const noSubscribe = () => () => {};

/** The dashboard's own origin, which serves the widget script. */
function useWebOrigin(): string {
  return useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => "",
  );
}

function selectText(id: string) {
  const element = document.getElementById(id);
  const selection = window.getSelection();
  if (!element || !selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

function CopyLine({ id, text, item }: { id: string; text: string; item: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <pre className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border bg-surface px-3 py-2.5 font-mono text-sm text-foreground">
        <code id={id}>{text}</code>
      </pre>
      <CopyButton text={text} describedItem={item} onBlocked={() => selectText(id)} />
    </div>
  );
}

/**
 * How to put the feedback widget on a website. The script is the same for
 * every environment: it only switches on for a reviewer arriving through a
 * review link, on the address set as that environment's URL.
 */
export function WidgetInstallCard() {
  const webOrigin = useWebOrigin();
  const id = useId();
  if (!webOrigin) return null;

  const snippet = widgetSnippet(webOrigin);
  const csp = widgetCspSources(webOrigin, API_BASE_URL);

  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface-raised p-5 shadow-xs">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Install the feedback widget
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Add this once to the website, inside <code className="font-mono">&lt;head&gt;</code>.
          Visitors never see it — only reviewers who open a review link get the Feedback button.
        </p>
      </div>

      <CopyLine id={`${id}-snippet`} text={snippet} item="the install snippet" />

      <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
        <li>
          Paste it <strong className="font-semibold text-foreground">without</strong>{" "}
          <code className="font-mono">async</code> or <code className="font-mono">defer</code>, so it
          runs before the website’s own scripts.
        </li>
        <li>
          It works on the address set as the environment’s URL — the review link only opens there.
        </li>
        <li>
          To check it works, invite yourself as a reviewer and open the link in a private window.
        </li>
      </ul>

      <details className="group rounded-md border border-border px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          The website has a Content Security Policy
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-sm leading-6 text-muted-foreground">
            Add these sources to the existing directives, or the browser blocks the widget:
          </p>
          <CopyLine id={`${id}-script-src`} text={csp.scriptSrc} item="the script-src source" />
          <CopyLine id={`${id}-connect-src`} text={csp.connectSrc} item="the connect-src source" />
        </div>
      </details>
    </section>
  );
}
