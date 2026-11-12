import nodemailer from "nodemailer";
import { logger } from "./logger";

let transporter: nodemailer.Transporter | null = null;
let warned = false;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;
  const key = process.env.RESEND_API_KEY || process.env.SMTP_PASS;
  if (!key) {
    if (!warned) {
      logger.warn("RESEND_API_KEY / SMTP_PASS is not set — emails will be skipped");
      warned = true;
    }
    return null;
  }
  transporter = nodemailer.createTransport({
    host: process.env.RESEND_SMTP_HOST || process.env.SMTP_HOST || "smtp.resend.com",
    port: Number(process.env.RESEND_SMTP_PORT || process.env.SMTP_PORT || 587),
    secure: false,
    auth: { user: process.env.RESEND_SMTP_USER || process.env.SMTP_USER || "resend", pass: key },
  });
  return transporter;
}

function fromAddress(): string {
  return process.env.MAIL_FROM || process.env.SMTP_FROM || "JMCS Portal <onboarding@resend.dev>";
}

export async function sendEmail(opts: { to: string; subject: string; text: string; html?: string }): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  try {
    await t.sendMail({
      from: fromAddress(),
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    return true;
  } catch (e) {
    logger.error({ err: e }, "sendEmail failed");
    return false;
  }
}

/**
 * Send a Resend dashboard template (created at resend.com/templates).
 * Hosted templates are sent via the Resend REST API using the template's id
 * and cannot travel through the SMTP/Nodemailer transport.
 */
export async function sendTemplateEmail(opts: {
  to: string;
  templateId: string;
  data?: Record<string, unknown>;
  subject?: string;
  from?: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY || process.env.SMTP_PASS;
  if (!key) {
    logger.warn("RESEND_API_KEY / SMTP_PASS is not set — template email skipped");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: opts.from || fromAddress(),
        to: [opts.to],
        template: { id: opts.templateId, data: opts.data ?? {} },
        ...(opts.subject ? { subject: opts.subject } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body }, "sendTemplateEmail failed");
      return false;
    }
    logger.info({ to: opts.to, templateId: opts.templateId }, "Template email sent");
    return true;
  } catch (e) {
    logger.error({ err: e }, "sendTemplateEmail failed");
    return false;
  }
}

export async function sendAccessEmail(opts: {
  to: string;
  title: string;
  link: string;
  access: string;
  code?: string;
  expiresAt?: string | null;
}): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  const from = fromAddress();
  const status =
    opts.access === "open" ? "accessible (open)" : opts.access === "restricted" ? "restricted" : "currently disabled";

  let expiresLabel = "";
  let expiresHtml = "";
  if (opts.expiresAt) {
    try {
      const d = new Date(opts.expiresAt);
      expiresLabel = d.toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
    } catch {
      expiresLabel = opts.expiresAt;
    }
    expiresHtml = `<p style="margin-top:4px;color:#64748b;font-size:13px">This link expires on <strong>${expiresLabel}</strong>.</p>`;
  }
  const expiresText = expiresLabel ? `\n\nNote: This link expires on ${expiresLabel}.` : "";

  const codeBlock = opts.code
    ? `\n\nAccess code: ${opts.code}\n(Enter this code on the portal to open the material.)`
    : "";
  const codeHtml = opts.code
    ? `<div style="margin:20px 0;padding:16px 20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;text-align:center">` +
      `<p style="margin:0 0 6px;font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Your access code</p>` +
      `<p style="margin:0;font-size:28px;font-weight:700;letter-spacing:4px;color:#166534">${opts.code}</p>` +
      `<p style="margin:8px 0 0;font-size:12px;color:#64748b">Enter this code on the portal to open the material</p>` +
      `</div>`
    : "";
  try {
    await t.sendMail({
      from,
      to: opts.to,
      subject: `Your training material access: ${opts.title}`,
      text:
        `Hello,\n\nYou have been given access to the training material "${opts.title}".\n` +
        `Current access status: ${status}.${expiresText}\n\nOpen the material here:\n${opts.link}${codeBlock}\n\n— JMCS Portal`,
      html:
        `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0f172a;line-height:1.6;max-width:560px">` +
        `<p>Hello,</p>` +
        `<p>You have been given access to the training material <strong>${opts.title}</strong>.</p>` +
        `<p>Current access status: <strong>${status}</strong>.</p>` +
        expiresHtml +
        codeHtml +
        `<p style="margin-top:20px"><a href="${opts.link}" style="display:inline-block;padding:10px 24px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Open Material</a></p>` +
        `<p style="margin-top:12px;font-size:13px;color:#64748b">Or copy this link: <span style="word-break:break-all">${opts.link}</span></p>` +
        `<p style="margin-top:24px">— JMCS Portal</p>` +
        `</div>`,
    });
    logger.info({ to: opts.to }, "Access email sent");
    return true;
  } catch (e) {
    logger.error({ err: e }, "Failed to send access email");
    return false;
  }
}

export function publicOrigin(req: { headers: any; protocol: string; get: (h: string) => string | undefined }): string {
  // Always derive the origin from configuration, never from the client-
  // supplied Origin header (which an attacker could spoof to poison links).
  const configured = process.env.PUBLIC_URL || process.env.BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const host = req.get("host");
  if (host) return `${req.protocol}://${host}`;
  return "";
}

// Base URL of the standalone public training-materials viewer (the
// `materials.jro-jmcs.com` site). Participant/external share links in emails
// point here as `${publicViewerUrl()}/?token=...` so materials open automatically
// with no manual paste. Falls back to the app origin's /library path.
export function publicViewerUrl(): string {
  const configured = (process.env.PUBLIC_VIEWER_URL || "").replace(/\/$/, "").trim();
  if (configured) return configured;
  return publicOriginFromEnv();
}

// Used only as a fallback when PUBLIC_VIEWER_URL is unset and there is no
// request context (e.g. background jobs). Mirrors publicOrigin's config read.
function publicOriginFromEnv(): string {
  const configured = process.env.PUBLIC_URL || process.env.BASE_URL;
  return configured ? configured.replace(/\/$/, "") : "https://software-jmcs.web.app";
}

export async function sendAccessRevokedEmail(opts: { to: string; title: string }): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  const from = fromAddress();
  try {
    await t.sendMail({
      from,
      to: opts.to,
      subject: `Access removed: ${opts.title}`,
      text:
        `Hello,\n\nYour access to the training material "${opts.title}" has been removed and is no longer available.\n\n` +
        `If you believe this is a mistake, please contact your administrator.\n\n— JMCS Portal`,
      html:
        `<p>Hello,</p>` +
        `<p>Your access to the training material <strong>${opts.title}</strong> has been removed and is no longer available.</p>` +
        `<p>If you believe this is a mistake, please contact your administrator.</p>` +
        `<p>— JMCS Portal</p>`,
    });
    logger.info({ to: opts.to }, "Access-revoked email sent");
    return true;
  } catch (e) {
    logger.error({ err: e }, "Failed to send access-revoked email");
    return false;
  }
}

export async function sendAccessExpiredEmail(opts: {
  to: string;
  title: string;
  kind: "material" | "folder";
  expiredAt: string;
}): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  const from = fromAddress();
  const label = opts.kind === "folder" ? "training folder" : "training material";
  let when = opts.expiredAt;
  try {
    when = new Date(opts.expiredAt).toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    });
  } catch { /* keep raw value */ }
  try {
    await t.sendMail({
      from,
      to: opts.to,
      subject: `Access ended: ${opts.title}`,
      text:
        `Dear Participant,\n\n` +
        `This is to notify you that your access to the ${label} "${opts.title}" ended on ${when}.\n\n` +
        `The shared link is no longer available and can no longer be viewed.\n\n` +
        `If you require continued access or believe this has occurred in error, please contact your JMCS administrator, ` +
        `who can extend or restore your access.\n\n` +
        `Thank you for your understanding.\n\n` +
        `Best regards,\n` +
        `JMCS Portal Team`,
      html:
        `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0f172a;line-height:1.6;max-width:560px">` +
        `<p>Dear Participant,</p>` +
        `<p>This is to notify you that your access to the ${label} <strong>${opts.title}</strong> ended on <strong>${when}</strong>.</p>` +
        `<p>The shared link is no longer available and can no longer be viewed.</p>` +
        `<p>If you require continued access or believe this has occurred in error, please contact your JMCS administrator, who can extend or restore your access.</p>` +
        `<p>Thank you for your understanding.</p>` +
        `<p style="margin-top:24px">Best regards,<br/><strong>JMCS Portal Team</strong></p>` +
        `</div>`,
    });
    logger.info({ to: opts.to }, "Access-expired email sent");
    return true;
  } catch (e) {
    logger.error({ err: e }, "Failed to send access-expired email");
    return false;
  }
}

export async function sendFolderAccessEmail(opts: {
  to: string;
  folderName: string;
  link: string;
  access: string;
  code?: string;
  expiresAt?: string | null;
}): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  const from = fromAddress();
  const status =
    opts.access === "open" ? "accessible (open)" : opts.access === "restricted" ? "restricted" : "currently disabled";

  let expiresLabel = "";
  let expiresHtml = "";
  if (opts.expiresAt) {
    try {
      const d = new Date(opts.expiresAt);
      expiresLabel = d.toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
    } catch {
      expiresLabel = opts.expiresAt;
    }
    expiresHtml = `<p style="margin-top:4px;color:#64748b;font-size:13px">This link expires on <strong>${expiresLabel}</strong>.</p>`;
  }
  const expiresText = expiresLabel ? `\n\nNote: This link expires on ${expiresLabel}.` : "";

  const codeBlock = opts.code
    ? `\n\nAccess code: ${opts.code}\n(Enter this code on the portal to open the folder.)`
    : "";
  const codeHtml = opts.code
    ? `<div style="margin:20px 0;padding:16px 20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;text-align:center">` +
      `<p style="margin:0 0 6px;font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Your access code</p>` +
      `<p style="margin:0;font-size:28px;font-weight:700;letter-spacing:4px;color:#166534">${opts.code}</p>` +
      `<p style="margin:8px 0 0;font-size:12px;color:#64748b">Enter this code on the portal to open the folder</p>` +
      `</div>`
    : "";
  try {
    await t.sendMail({
      from,
      to: opts.to,
      subject: `Your training folder access: ${opts.folderName}`,
      text:
        `Hello,\n\nYou have been given access to the training folder "${opts.folderName}".\n` +
        `It contains all shared materials and attachments in one place.\n` +
        `Current access status: ${status}.${expiresText}\n\nOpen the folder here:\n${opts.link}${codeBlock}\n\n— JMCS Portal`,
      html:
        `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0f172a;line-height:1.6;max-width:560px">` +
        `<p>Hello,</p>` +
        `<p>You have been given access to the training folder <strong>${opts.folderName}</strong>.</p>` +
        `<p>It contains all shared materials and attachments in one place.</p>` +
        `<p>Current access status: <strong>${status}</strong>.</p>` +
        expiresHtml +
        codeHtml +
        `<p style="margin-top:20px"><a href="${opts.link}" style="display:inline-block;padding:10px 24px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Open Folder</a></p>` +
        `<p style="margin-top:12px;font-size:13px;color:#64748b">Or copy this link: <span style="word-break:break-all">${opts.link}</span></p>` +
        `<p style="margin-top:24px">— JMCS Portal</p>` +
        `</div>`,
    });
    logger.info({ to: opts.to }, "Folder access email sent");
    return true;
  } catch (e) {
    logger.error({ err: e }, "Failed to send folder access email");
    return false;
  }
}
