const fs = require('fs');
const path = require('path');

const screensDir = path.join(__dirname, '..', 'frontend', 'src', 'screens');
const forbidden = [
  { pattern: /<table\b/i, label: 'استخدام <table> يدوي؛ استخدم AppTable' },
  { pattern: /modal-overlay|modal-backdrop|transaction-modal-backdrop|settings-modal-backdrop|budget-modal-overlay/i, label: 'مودال يدوي؛ استخدم AppModal' },
];

const failures = [];
for (const name of fs.readdirSync(screensDir).filter((item) => item.endsWith('.jsx'))) {
  const file = path.join(screensDir, name);
  const text = fs.readFileSync(file, 'utf8');
  for (const rule of forbidden) {
    if (rule.pattern.test(text)) failures.push(`${name}: ${rule.label}`);
  }
}

if (failures.length) {
  console.error('UI foundation quality gate failed:\n' + failures.map((x) => `- ${x}`).join('\n'));
  process.exit(1);
}
console.log('UI foundation quality gate passed: no manual tables or modal backdrops in screens.');
