import { submitIssue, type ExchangeOutcome, type FieldName, type IssueContext } from "./api";
import { captureContext, describeElement, reportablePageUrl } from "./capture";
import { clearSession, sessionExpired, type WidgetSession } from "./session";
import { h, raise } from "./ui/dom";
import { startPicker, type Picker } from "./ui/picker";
import { applyStyles } from "./ui/styles";
import { alert, EMPTY_DRAFT, header, icon, PIN_ICON, reportForm, validateDraft, type Draft } from "./ui/views";

type View =
  | { kind: "collapsed" }
  | { kind: "starting" }
  | { kind: "start-failed"; outcome: Exclude<ExchangeOutcome, { status: "success" }> }
  | { kind: "home" }
  | { kind: "picking" }
  | {
      kind: "form";
      pending: boolean;
      message: string | null;
      fields: Partial<Record<FieldName, string>>;
      /** The last send's outcome is unknown; sending again is safe. */
      retry: boolean;
    }
  | { kind: "sent"; number: number }
  | { kind: "ended"; title: string; message: string };

const ENDED_MESSAGE = "Open your review link again to keep sending feedback.";

const newId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export interface WidgetController {
  setSession: (session: WidgetSession) => void;
  setView: (view: View) => void;
  destroy: () => void;
}

/** Mounts the widget in its own shadow root and runs it. */
export function mountWidget({
  apiBase,
  session: initialSession,
  view: initialView,
}: {
  apiBase: string;
  session: WidgetSession | null;
  view: View;
}): WidgetController {
  const host = document.createElement("div");
  host.setAttribute("data-pinforth-widget", "");
  const shadow = host.attachShadow({ mode: "open" });
  applyStyles(shadow);

  const root = h("div", { className: "root" });
  const dock = h("div", { className: "dock", popover: "manual" });
  root.append(dock);
  shadow.append(root);
  document.body.append(host);
  raise(dock);

  let session = initialSession;
  let view: View = initialView;
  let draft: Draft = { ...EMPTY_DRAFT };
  let picked: { element: Element; label: string } | null = null;
  let context: IssueContext | null = null;
  let mutation: { key: string; id: string } | null = null;
  let picker: Picker | null = null;
  const titleId = "pf-panel-title";

  const isOwn = (element: Element) => element === host || host.contains(element);

  function setView(next: View) {
    view = next;
    render();
  }

  function close() {
    picker?.stop();
    picker = null;
    setView({ kind: "collapsed" });
    queueMicrotask(() => shadow.querySelector<HTMLElement>(".launcher")?.focus());
  }

  function open() {
    if (!session) return;
    if (sessionExpired(session)) {
      clearSession();
      setView({ kind: "ended", title: "Your review session has ended", message: ENDED_MESSAGE });
      return;
    }
    setView(view.kind === "form" ? view : { kind: "home" });
  }

  function openForm() {
    setView({ kind: "form", pending: false, message: null, fields: {}, retry: false });
  }

  function pick() {
    setView({ kind: "picking" });
    picker = startPicker({
      layer: root,
      isOwn,
      onPick: (element) => {
        picker = null;
        picked = { element, label: describeElement(element) };
        context = captureContext(element);
        openForm();
      },
      onCancel: () => {
        picker = null;
        setView(picked || draft.title ? { kind: "form", pending: false, message: null, fields: {}, retry: false } : { kind: "home" });
      },
    });
  }

  function reportWithoutElement() {
    picked = null;
    context = captureContext(null);
    openForm();
  }

  async function send() {
    if (!session || view.kind !== "form" || view.pending) return;

    const fields = validateDraft(draft);
    if (Object.keys(fields).length > 0) {
      setView({ ...view, fields, message: null });
      return;
    }

    const description = draft.description.trim();
    const payload = {
      title: draft.title.trim(),
      ...(description ? { description } : {}),
      type: draft.type,
      priority: draft.priority,
      pageUrl: reportablePageUrl(window.location.href),
    };
    // The API treats a repeated id with identical fields as the same report,
    // so a retry after an unknown outcome reuses it; an edited report doesn't.
    const key = JSON.stringify(payload);
    if (!mutation || mutation.key !== key) mutation = { key, id: newId() };

    setView({ ...view, pending: true, message: null, fields: {} });
    const outcome = await submitIssue(apiBase, session.token, {
      ...payload,
      context: context ?? captureContext(null),
      clientMutationId: mutation.id,
    });

    switch (outcome.status) {
      case "created":
      case "duplicate":
        draft = { ...EMPTY_DRAFT };
        picked = null;
        context = null;
        mutation = null;
        setView({ kind: "sent", number: outcome.number });
        return;
      case "ended":
      case "closed":
        clearSession();
        session = null;
        setView({
          kind: "ended",
          title: outcome.status === "ended" ? "Your review session has ended" : "This review has ended",
          message: outcome.status === "ended" ? ENDED_MESSAGE : outcome.message,
        });
        return;
      case "rejected":
        setView({ kind: "form", pending: false, message: outcome.message, fields: outcome.fields ?? {}, retry: false });
        return;
      case "conflict":
        mutation = null;
        setView({ kind: "form", pending: false, message: outcome.message, fields: {}, retry: false });
        return;
      case "rate-limited":
      case "unavailable":
        setView({
          kind: "form",
          pending: false,
          message: outcome.message,
          fields: {},
          retry: outcome.status === "unavailable",
        });
    }
  }

  function launcher() {
    const expanded = view.kind !== "collapsed";
    return h(
      "button",
      {
        type: "button",
        className: "launcher",
        "aria-expanded": expanded ? "true" : "false",
        onClick: () => (expanded ? close() : open()),
      },
      icon(PIN_ICON),
      "Feedback",
    );
  }

  function subtitle(): string | null {
    if (!session) return null;
    const who = session.reviewer.name ?? session.reviewer.email;
    return who ? `${session.roundName} · reviewing as ${who}` : session.roundName;
  }

  function panelBody(): Node[] {
    switch (view.kind) {
      case "starting":
        return [h("p", { role: "status" }, h("span", { className: "spin", "aria-hidden": "true" }), " Starting your review…")];

      case "start-failed": {
        const { outcome } = view;
        const title =
          outcome.status === "closed" ? "This review has ended" : outcome.status === "denied" ? "This review link has been used" : "We couldn’t start your review";
        const body =
          outcome.status === "denied"
            ? "Each link opens the review once. Open your review link again from the message you were sent."
            : outcome.message;
        return [header(title, null, () => host.remove(), titleId), h("p", { className: "sub" }, body)];
      }

      case "home": {
        const expires = session ? new Date(session.expiresAt) : null;
        return [
          header("Send feedback", subtitle(), close, titleId),
          h(
            "div",
            { className: "stack" },
            h("button", { type: "button", className: "btn primary", onClick: pick }, "Report an issue"),
            h("button", { type: "button", className: "link", onClick: reportWithoutElement }, "Report without selecting an element"),
          ),
          ...(expires
            ? [h("p", { className: "note" }, `Your review session ends at ${expires.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`)]
            : []),
        ];
      }

      case "form":
        return [
          header("Report an issue", subtitle(), close, titleId),
          reportForm({
            draft,
            picked: picked?.label ?? null,
            pending: view.pending,
            message: view.message,
            fields: view.fields,
            submitLabel: view.retry ? "Try again" : "Send",
            onRepick: pick,
            onSubmit: () => void send(),
            onCancel: () => {
              draft = { ...EMPTY_DRAFT };
              picked = null;
              context = null;
              mutation = null;
              setView({ kind: "home" });
            },
          }),
        ];

      case "sent":
        return [
          header("Thanks!", subtitle(), close, titleId),
          h("p", { role: "status" }, h("span", { className: "ok" }, `Sent as #${view.number}.`), " The team will see it in Pinforth."),
          h("div", { className: "row gap-top" }, h("button", { type: "button", className: "btn primary", onClick: pick }, "Report another")),
        ];

      case "ended":
        return [header(view.title, null, () => host.remove(), titleId), alert(view.message) ?? h("span")];

      default:
        return [];
    }
  }

  function render() {
    dock.replaceChildren();
    if (view.kind === "picking") return;

    if (view.kind !== "collapsed") {
      const panel = h(
        "section",
        { className: "panel", role: "dialog", "aria-labelledby": titleId },
        ...panelBody(),
      );
      panel.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !(view.kind === "form" && view.pending)) {
          event.stopPropagation();
          close();
        }
      });
      dock.append(panel);
      if (view.kind !== "form") {
        queueMicrotask(() =>
          (panel.querySelector<HTMLElement>("button.btn.primary") ?? panel.querySelector<HTMLElement>("button"))?.focus(),
        );
      }
    }

    // Ended and failed starts can't do anything more on this page.
    if (session && view.kind !== "ended" && view.kind !== "start-failed") dock.append(launcher());
    raise(dock);
  }

  render();

  return {
    setSession: (next) => {
      session = next;
      render();
    },
    setView,
    destroy: () => {
      picker?.stop();
      host.remove();
    },
  };
}
