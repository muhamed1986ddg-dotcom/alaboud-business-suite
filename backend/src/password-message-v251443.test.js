const fs=require("fs");
const s=fs.readFileSync("../frontend/src/screens/SettingsPanel.jsx","utf8");
if(!s.includes("settings-modal-message")) throw new Error("settings modal must render feedback message inside modal");
if(!s.includes('role="status"')) throw new Error("settings feedback should be announced");
console.log("v25.14.43 settings modal feedback OK");
