#!/usr/bin/env node
/**
 * backup-database.js
 * -------------------
 * نسخ احتياطي تلقائي لقاعدة بيانات PostgreSQL باستخدام pg_dump.
 *
 * لماذا هذا السكربت بدل تصدير JSON يدوي:
 * - نسخ احتياطية سابقة كانت تُصدَّر يدويًا كملفات JSON وتُحفظ بالخطأ داخل
 *   مستودع Git (alaboud-backup-*.json)، ما سبب تسريب بيانات عملاء حقيقية
 *   (أسماء، هواتف، أرقام هوية) في تاريخ المستودع.
 * - هذا السكربت يحفظ النسخ خارج مجلد المشروع تمامًا (أو في مسار مستثنى من
 *   Git عبر .gitignore: backups/) ويستخدم pg_dump الرسمي بدل التصدير اليدوي.
 *
 * الاستخدام:
 *   node scripts/backup-database.js
 *
 * متغيرات البيئة المطلوبة:
 *   DATABASE_URL   رابط الاتصال بقاعدة postgres (كما في .env)
 *
 * متغيرات اختيارية:
 *   BACKUP_DIR     مسار حفظ النسخ (افتراضي: ./backups، وهو مستثنى في .gitignore)
 *   BACKUP_KEEP    عدد النسخ المُبقاة قبل حذف الأقدم (افتراضي: 14)
 *
 * لتشغيله تلقائيًا يوميًا، استخدم مجدولًا خارجيًا موثوقًا مع حساب خدمة محدود الصلاحيات.
 *   - type: cron
 *     name: alaboud-db-backup
 *     schedule: "0 2 * * *"
 *     buildCommand: npm install
 *     startCommand: node scripts/backup-database.js
 *     envVars:
 *       - key: DATABASE_URL
 *         fromDatabase: { name: alaboud-db, property: connectionString }
 */

const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const DATABASE_URL = process.env.DATABASE_URL;
const BACKUP_DIR = process.env.BACKUP_DIR || path.resolve(__dirname, "..", "backups");
const KEEP = Number(process.env.BACKUP_KEEP || 14);

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function ensureBackupDirIgnored() {
  // تأمين إضافي: تأكد أن مجلد النسخ الاحتياطية مستثنى في .gitignore حتى لو
  // تغيّر مسار المشروع أو نُسي تحديث .gitignore يدويًا.
  const gitignorePath = path.resolve(__dirname, "..", ".gitignore");
  try {
    const content = fs.readFileSync(gitignorePath, "utf8");
    if (!content.includes("backups/")) {
      fs.appendFileSync(gitignorePath, "\nbackups/\n");
      console.log("[backup] تمت إضافة backups/ إلى .gitignore تلقائيًا.");
    }
  } catch {
    // إذا لم يوجد .gitignore، لا نوقف العملية بسبب هذا فقط.
  }
}

async function runBackup() {
  if (!DATABASE_URL) {
    console.error("[backup] خطأ: متغير DATABASE_URL غير مضبوط. أوقفت العملية.");
    process.exitCode = 1;
    return;
  }

  await ensureBackupDirIgnored();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const file = path.join(BACKUP_DIR, `alaboud-db-${timestamp()}.dump`);

  console.log(`[backup] بدء النسخ الاحتياطي إلى: ${file}`);

  try {
    // صيغة custom (-Fc) مضغوطة وقابلة للاستعادة الجزئية عبر pg_restore،
    // وأكثر أمانًا وكفاءة من تصدير JSON كامل الحالة في الذاكرة.
    await execFileAsync("pg_dump", [
      DATABASE_URL,
      "-Fc",
      "-f", file,
      "--no-owner",
      "--no-privileges",
    ]);
  } catch (error) {
    console.error("[backup] فشل pg_dump:", error.message);
    process.exitCode = 1;
    return;
  }

  const sizeKb = (fs.statSync(file).size / 1024).toFixed(1);
  console.log(`[backup] تم بنجاح (${sizeKb} KB).`);

  await rotateOldBackups();
}

async function rotateOldBackups() {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("alaboud-db-") && f.endsWith(".dump"))
    .map((f) => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);

  const toDelete = files.slice(KEEP);
  for (const { f } of toDelete) {
    fs.unlinkSync(path.join(BACKUP_DIR, f));
    console.log(`[backup] حذف نسخة قديمة: ${f}`);
  }

  if (toDelete.length) {
    console.log(`[backup] تم الاحتفاظ بآخر ${KEEP} نسخة، وحذف ${toDelete.length}.`);
  }
}

runBackup();
