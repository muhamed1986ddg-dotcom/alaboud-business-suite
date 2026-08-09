const fs=require("fs");
const assert=require("assert");
const app=fs.readFileSync(require("path").join(__dirname,"../../frontend/src/App.jsx"),"utf8");
const settings=fs.readFileSync(require("path").join(__dirname,"../../frontend/src/screens/SettingsPanel.jsx"),"utf8");
assert(!app.includes('className="branch-switcher no-print"'));
assert(app.includes('onActiveBranchChange={changeActiveBranch}'));
assert(settings.includes('settings-active-branch'));
assert(settings.includes('تم تغيير الفرع النشط'));
console.log("v25.14.33 branch settings regression test passed");
