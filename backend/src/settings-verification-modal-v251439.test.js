const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'../..');
const css=fs.readFileSync(path.join(root,'frontend/src/styles.css'),'utf8');
const settings=fs.readFileSync(path.join(root,'frontend/src/screens/SettingsPanel.jsx'),'utf8');
if(!css.includes('.settings-modal-shell[data-active-panel="verification"] [data-panel="verification"]')) throw new Error('verification modal selector missing');
if(!settings.includes('setActivePanel("verification")')) throw new Error('verification tile action missing');
if(!settings.includes('data-panel="verification"')) throw new Error('verification panel missing');
console.log('settings-verification-modal-v251439.test.js: OK');
