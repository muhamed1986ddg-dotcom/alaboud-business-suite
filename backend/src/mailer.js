"use strict";

let nodemailer = null;
try { nodemailer = require("nodemailer"); } catch { nodemailer = null; }

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function sendPasswordResetEmail({ to, name, resetUrl, expiresMinutes = 15 }) {
  if (!smtpConfigured()) return { sent: false, reason: "SMTP_NOT_CONFIGURED" };
  if (!nodemailer) throw new Error("nodemailer غير مثبت");

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });

  const from = process.env.SMTP_FROM || `ALABOUD Business Suite <${process.env.SMTP_USER}>`;
  const safeName = String(name || "المستخدم");
  await transporter.sendMail({
    from,
    to,
    subject: "إعادة تعيين كلمة المرور — ALABOUD Business Suite",
    text: `مرحبًا ${safeName}\n\nاستخدم الرابط التالي لإعادة تعيين كلمة المرور خلال ${expiresMinutes} دقيقة:\n${resetUrl}\n\nإذا لم تطلب ذلك، تجاهل الرسالة.`,
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8"><h2>إعادة تعيين كلمة المرور</h2><p>مرحبًا ${safeName}</p><p>اضغط على الرابط التالي خلال ${expiresMinutes} دقيقة:</p><p><a href="${resetUrl}">إعادة تعيين كلمة المرور</a></p><p>إذا لم تطلب ذلك، تجاهل الرسالة.</p></div>`
  });
  return { sent: true };
}

module.exports = { smtpConfigured, sendPasswordResetEmail };
