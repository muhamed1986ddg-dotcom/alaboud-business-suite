#!/usr/bin/env bash
# clean-git-history.sh
# ---------------------
# يحذف ملفات النسخ الاحتياطية التي تحتوي بيانات عملاء حقيقية
# (alaboud-backup-*.json / alaboud-backup-*.zip) من تاريخ Git بالكامل،
# وليس فقط من آخر نسخة (commit) — لأن الحذف العادي (git rm) يُبقيها
# في السجل التاريخي وقابلة للاسترجاع من أي شخص لديه وصول للمستودع.
#
# ⚠️ هذا الإجراء يُعيد كتابة تاريخ Git بالكامل (rewrite history).
# اقرأ التحذيرات في نهاية الملف قبل التنفيذ.
#
# الاستخدام:
#   bash scripts/clean-git-history.sh

set -euo pipefail

echo "=== فحص أولي ==="

if ! command -v git >/dev/null 2>&1; then
  echo "خطأ: git غير مثبت." >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "خطأ: هذا المجلد ليس مستودع Git." >&2
  exit 1
fi

if ! command -v git-filter-repo >/dev/null 2>&1; then
  cat <<'EOF'
أداة git-filter-repo غير مثبتة. ثبّتها أولاً:

  pip install git-filter-repo --break-system-packages
  # أو على macOS:
  brew install git-filter-repo

ثم أعد تشغيل هذا السكربت.
EOF
  exit 1
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "الفرع الحالي: $BRANCH"

echo ""
echo "=== خطوة أمان: تأكد من نسخة احتياطية محلية كاملة للمستودع قبل المتابعة ==="
read -r -p "هل أخذت نسخة احتياطية كاملة من مجلد المستودع (cp -r) قبل المتابعة؟ (yes/لا) " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "أوقفت العملية. خذ نسخة احتياطية أولاً بالأمر التالي من خارج المجلد:"
  echo "  cp -r $(pwd) $(pwd)-backup-before-history-clean"
  exit 1
fi

echo ""
echo "=== حذف الملفات الحساسة من كامل تاريخ Git ==="

git filter-repo \
  --path-glob 'alaboud-backup-*.json' \
  --path-glob 'alaboud-backup-*.zip' \
  --invert-paths \
  --force

echo ""
echo "=== انتهى التنظيف المحلي ==="
echo ""
echo "الخطوات التالية (يدويًا، بعد مراجعتك):"
echo ""
echo "1. تحقق أن الملفات فعلاً اختفت من كل التاريخ:"
echo "     git log --all --oneline -- 'alaboud-backup-*.json'"
echo "   (يجب ألا يظهر أي شيء)"
echo ""
echo "2. أعد إضافة الـ remote (filter-repo يحذفه كإجراء أمان):"
echo "     git remote add origin <رابط-المستودع>"
echo ""
echo "3. ادفع التاريخ المُعاد كتابته بالقوة (سيُغيّر تاريخ المستودع البعيد بالكامل):"
echo "     git push origin --force --all"
echo "     git push origin --force --tags"
echo ""
echo "⚠️ تحذيرات مهمة قبل الدفع:"
echo "  - أي متعاون آخر لديه نسخة من المستودع يجب أن يعيد الاستنساخ من الصفر"
echo "    (git clone من جديد)، وليس git pull، لأن التاريخ اختلف بالكامل."
echo "  - إذا كان المستودع على GitHub/GitLab، تحقق من عدم وجود Forks أو"
echo "    Pull Requests مفتوحة تحتفظ بنسخة من الـ commits القديمة."
echo "  - بيانات النسخ الاحتياطية القديمة قد تكون محفوظة أيضًا في ذاكرة التخزين"
echo "    المؤقت لدى GitHub لبضعة أيام حتى بعد force-push؛ تواصل مع دعم"
echo "    GitHub لطلب حذف فوري (purge) إذا كانت البيانات حساسة جدًا."
