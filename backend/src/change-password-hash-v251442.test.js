const fs=require("fs");
const path=require("path");
const server=fs.readFileSync(path.join(__dirname,"server.js"),"utf8");
if(!server.includes("const currentPasswordOk = isScryptHash(user.passwordHash)")) throw new Error("change-password must support scrypt hashes");
if(!server.includes("? verifyPassword(currentPassword,user.passwordHash)")) throw new Error("scrypt verifyPassword branch missing");
if(!server.includes(": bcrypt.compareSync(currentPassword,user.passwordHash)")) throw new Error("bcrypt compatibility branch missing");
console.log("v25.14.42 change-password hash compatibility OK");
