import { ISSUE_PRIORITIES, ISSUE_TYPES, type FieldName, type IssuePriority, type IssueType } from "../api";
import { h, uid } from "./dom";

export const TITLE_MAX = 255;
export const DESCRIPTION_MAX = 10000;

const TYPE_LABELS: Record<IssueType, string> = {
  BUG: "Bug",
  DESIGN: "Design",
  CONTENT: "Content",
  SUGGESTION: "Suggestion",
};
const PRIORITY_LABELS: Record<IssuePriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

const CLOSE_ICON = "M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z";
export const PIN_ICON = "M8 1a5 5 0 0 0-5 5c0 3.5 5 9 5 9s5-5.5 5-9a5 5 0 0 0-5-5Zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z";

export function icon(path: string): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const shape = document.createElementNS(ns, "path");
  shape.setAttribute("d", path);
  svg.append(shape);
  return svg;
}

export function header(title: string, subtitle: string | null, onClose: () => void, titleId: string) {
  return h(
    "div",
    { className: "head" },
    h("div", {}, h("h2", { className: "title", id: titleId }, title), subtitle ? h("p", { className: "sub" }, subtitle) : null),
    h("button", { type: "button", className: "icon-btn", "aria-label": "Close feedback", onClick: onClose }, icon(CLOSE_ICON)),
  );
}

export function alert(message: string | null) {
  return message ? h("p", { className: "alert", role: "alert" }, message) : null;
}

export interface Draft {
  title: string;
  description: string;
  type: IssueType;
  priority: IssuePriority;
}

export const EMPTY_DRAFT: Draft = { title: "", description: "", type: "BUG", priority: "MEDIUM" };

export function validateDraft(draft: Draft): Partial<Record<FieldName, string>> {
  const title = draft.title.trim();
  if (!title) return { title: "Give the problem a short title." };
  if (title.length > TITLE_MAX) return { title: `Keep the title under ${TITLE_MAX} characters.` };
  if (draft.description.trim().length > DESCRIPTION_MAX) {
    return { description: "The description is too long." };
  }
  return {};
}

function field(
  label: string,
  control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  error: string | undefined,
  required = false,
) {
  const id = uid("field");
  control.id = id;
  const errorId = `${id}-error`;
  if (error) {
    control.setAttribute("aria-invalid", "true");
    control.setAttribute("aria-describedby", errorId);
  }
  return h(
    "div",
    {},
    h("label", { for: id }, label, required ? h("span", { className: "req", "aria-hidden": "true" }, " *") : null),
    control,
    error ? h("p", { className: "err", id: errorId }, error) : null,
  );
}

function select<T extends string>(name: string, values: readonly T[], labels: Record<T, string>, value: T) {
  const control = h("select", { name });
  for (const option of values) {
    control.append(h("option", { value: option, selected: option === value }, labels[option]));
  }
  return control;
}

/** The report form. Edits update `draft` in place; the controller owns sending. */
export function reportForm({
  draft,
  picked,
  pending,
  message,
  fields,
  submitLabel,
  onRepick,
  onSubmit,
  onCancel,
}: {
  draft: Draft;
  picked: string | null;
  pending: boolean;
  message: string | null;
  fields: Partial<Record<FieldName, string>>;
  submitLabel: string;
  onRepick: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const title = h("input", { name: "title", maxlength: TITLE_MAX, autocomplete: "off", required: true });
  title.value = draft.title;
  title.addEventListener("input", () => (draft.title = title.value));

  const description = h("textarea", {
    name: "description",
    maxlength: DESCRIPTION_MAX,
    placeholder: "What’s wrong, and what did you expect?",
  });
  description.value = draft.description;
  description.addEventListener("input", () => (draft.description = description.value));

  const type = select("type", ISSUE_TYPES, TYPE_LABELS, draft.type);
  type.addEventListener("change", () => (draft.type = type.value as IssueType));
  const priority = select("priority", ISSUE_PRIORITIES, PRIORITY_LABELS, draft.priority);
  priority.addEventListener("change", () => (draft.priority = priority.value as IssuePriority));

  for (const control of [title, description, type, priority]) control.disabled = pending;

  const form = h(
    "form",
    { className: "stack", novalidate: true },
    h(
      "div",
      { className: "picked" },
      h("span", {}, picked ?? "Whole page — no element selected"),
      h("button", { type: "button", className: "link", onClick: onRepick, disabled: pending }, picked ? "Pick again" : "Pick one"),
    ),
    alert(message),
    field("Title", title, fields.title, true),
    field("Description", description, fields.description),
    h("div", { className: "grid" }, field("Type", type, fields.type), field("Priority", priority, fields.priority)),
    h(
      "div",
      { className: "row" },
      h("button", { type: "button", className: "btn", onClick: onCancel, disabled: pending }, "Cancel"),
      h(
        "button",
        { type: "submit", className: "btn primary", disabled: pending, "aria-busy": pending ? "true" : undefined },
        pending ? h("span", { className: "spin", "aria-hidden": "true" }) : null,
        pending ? " Sending…" : submitLabel,
      ),
    ),
  );

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    onSubmit();
  });

  // Focus the first problem, or the title on a fresh form.
  queueMicrotask(() => {
    const invalid = form.querySelector<HTMLElement>("[aria-invalid='true']");
    (invalid ?? (draft.title ? null : title))?.focus();
  });

  return form;
}
