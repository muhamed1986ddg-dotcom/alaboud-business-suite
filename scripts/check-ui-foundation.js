const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const frontendRoot = path.join(projectRoot, 'frontend');
const screensDir = path.join(frontendRoot, 'src', 'screens');
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


const legacyFiles = [path.join(frontendRoot, "src", "styles.css"), path.join(frontendRoot, "src", "shared.jsx")];
const forbiddenLegacy = ["transaction-modal-backdrop", "transaction-modal-panel", "settings-modal-backdrop", "rate-modal-backdrop", "budget-modal-overlay", "debt-modal-panel", "export function LoadingButton", "export function UnifiedModal", ".rate-modal{", ".budget-modal{"];
for (const file of legacyFiles) {
  const content = fs.readFileSync(file, "utf8");
  for (const token of forbiddenLegacy) {
    if (content.includes(token)) failures.push(`${path.relative(projectRoot,file)} still contains retired UI token: ${token}`);
  }
}

const uiDir = path.join(frontendRoot, "src", "components", "ui");
const uiTestFile = path.join(frontendRoot, "tests", "ui-components.test.mjs");
const uiTests = fs.readFileSync(uiTestFile, "utf8");
for (const name of fs.readdirSync(uiDir).filter((item) => /^App.+\.jsx$/.test(item))) {
  const component = path.basename(name, ".jsx");
  if (!uiTests.includes(component)) failures.push(`Missing shared UI test coverage: ${component}`);
}

if (failures.length) {
  console.error('UI foundation quality gate failed:\n' + failures.map((x) => `- ${x}`).join('\n'));
  process.exit(1);
}
console.log('UI foundation quality gate passed: no manual tables or modal backdrops in screens.');
