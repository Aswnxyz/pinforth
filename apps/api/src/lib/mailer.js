import nodemailer from "nodemailer";
import { env } from "../config/env.js";

// Tests read sent mail from here instead of talking to SMTP.
// Each message: { to, subject, text, html }.
export const testOutbox = [];

const transport =
  env.NODE_ENV === "test"
    ? null
    : nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } } : {}),
      });

export async function sendMail(message) {
  if (!transport) {
    testOutbox.push(message);
    return;
  }

  await transport.sendMail({ from: env.MAIL_FROM, ...message });
}

const pending = new Set();

// Sends without making the caller wait, so a response doesn't take longer when
// an email is sent (which would reveal whether an account exists).
export function sendMailInBackground(message) {
  const job = sendMail(message)
    .catch((error) => {
      console.error(`Failed to send "${message.subject}" email`, error);
    })
    .finally(() => pending.delete(job));

  pending.add(job);
}

// Lets tests wait for background sends to finish.
export async function waitForPendingMail() {
  await Promise.all(pending);
}

const escapeHtml = (value) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

// Minimal shared layout; user-supplied text is always escaped.
// opts: { greetingName?, paragraphs: string[], action?: { label, url } }
export function renderEmail(opts) {
  const greeting = `Hi${opts.greetingName ? ` ${opts.greetingName}` : ""},`;

  const text = [
    greeting,
    "",
    ...opts.paragraphs.flatMap((p) => [p, ""]),
    ...(opts.action ? [`${opts.action.label}: ${opts.action.url}`, ""] : []),
    "— Pinforth",
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1f2937">
<p>${escapeHtml(greeting)}</p>
${opts.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n")}
${
  opts.action
    ? `<p><a href="${escapeHtml(opts.action.url)}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(opts.action.label)}</a></p>
<p style="font-size:13px;color:#6b7280">Or paste this link into your browser:<br>${escapeHtml(opts.action.url)}</p>`
    : ""
}
<p>— Pinforth</p>
</body></html>`;

  return { text, html };
}
