/services/mailer.js
// Unified mailer with Gmail (Nodemailer) primary and SendGrid fallback
const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');

const {
  EMAIL_HOST = 'smtp.gmail.com',
  EMAIL_PORT = '587',
  EMAIL_USER,
  EMAIL_PASSWORD,
  EMAIL_FROM,
  SENDGRID_API_KEY,
  SENDGRID_FROM_EMAIL
} = process.env;

// Normalize from address to avoid DMARC issues: prefer the authenticated Gmail
function getFromAddress() {
  // If EMAIL_FROM is set but uses a different domain than Gmail, use Reply-To instead.
  const fromGmail = EMAIL_USER;
  // Fallback to Gmail user; keep a friendly name if provided but same email
  if (EMAIL_FROM && EMAIL_FROM.includes('<') && EMAIL_FROM.includes('>')) {
    // Replace email inside <> with Gmail user
    const name = EMAIL_FROM.split('<')[0].trim() || 'LiBrowse Verification';
    return `${name} <${fromGmail}>`;
  }
  if (EMAIL_FROM && EMAIL_FROM.includes('@') && EMAIL_FROM.endsWith('@gmail.com')) {
    return EMAIL_FROM;
  }
  return `"LiBrowse Verification" <${fromGmail}>`;
}

// Build Nodemailer transporter (Gmail SMTP)
function buildGmailTransporter() {
  if (!EMAIL_USER || !EMAIL_PASSWORD) return null;
  return nodemailer.createTransport({
    host: EMAIL_HOST,
    port: Number(EMAIL_PORT),
    secure: false,
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASSWORD
    }
  });
}

// Initialize SendGrid if key present
if (SENDGRID_API_KEY) {
  try {
    sgMail.setApiKey(SENDGRID_API_KEY);
  } catch (e) {
    console.warn('[Mailer] Failed to set SendGrid API key:', e.message);
  }
}

async function sendWithGmail(options) {
  const transporter = buildGmailTransporter();
  if (!transporter) {
    return { ok: false, provider: 'gmail', error: 'Gmail transporter not configured' };
  }
  const from = getFromAddress();
  const mail = {
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text || undefined
  };
  if (options.replyTo && options.replyTo !== from) {
    mail.replyTo = options.replyTo;
  }
  try {
    // verify can be flaky; we skip hard-fail
    try { await transporter.verify(); } catch (_) {}
    const info = await transporter.sendMail(mail);
    const accepted = Array.isArray(info.accepted) ? info.accepted : [];
    return {
      ok: accepted.length > 0,
      provider: 'gmail',
      meta: {
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
        response: info.response
      }
    };
  } catch (e) {
    return { ok: false, provider: 'gmail', error: e.message, code: e.code, meta: { response: e.response } };
  }
}

async function sendWithSendGrid({ to, subject, html, text, replyTo }) {
  if (!SENDGRID_API_KEY) {
    return { ok: false, provider: 'sendgrid', error: 'SendGrid not configured' };
  }
  const from = SENDGRID_FROM_EMAIL || EMAIL_USER;
  const msg = {
    to,
    from, // must be verified sender in SendGrid
    subject,
    html,
    text: text || undefined,
    replyTo: replyTo || undefined
  };
  try {
    const [resp] = await sgMail.send(msg);
    const ok = resp.statusCode >= 200 && resp.statusCode < 300;
    return { ok, provider: 'sendgrid', meta: { statusCode: resp.statusCode, headers: resp.headers } };
  } catch (e) {
    return { ok: false, provider: 'sendgrid', error: e.message, meta: { response: e.response?.body } };
  }
}

// Main sendMail with fallback strategy
async function sendMail({ to, subject, html, text, replyTo }) {
  // 1) Try Gmail
  const primary = await sendWithGmail({ to, subject, html, text, replyTo });
  if (primary.ok) return primary;

  // 2) Fallback to SendGrid
  const fallback = await sendWithSendGrid({ to, subject, html, text, replyTo });
  if (fallback.ok) {
    return { ...fallback, fallbackFrom: 'gmail', fallbackReason: primary.error || primary.meta };
  }

  // 3) Both failed
  return {
    ok: false,
    error: 'All mail providers failed',
    details: { primary, fallback }
  };
}

module.exports = {
  sendMail
};
