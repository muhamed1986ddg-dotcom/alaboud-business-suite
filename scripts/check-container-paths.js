"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { TextDecoder } = require("node:util");

const decoder = new TextDecoder("utf-8", { fatal: true });
const invalid = [];
let inspected = 0;

function inspectDirectory(directory) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { encoding: "buffer", withFileTypes: true });
  } catch (error) {
    if (error && ["EACCES", "ENOENT", "ENOTDIR"].includes(error.code)) return;
    throw error;
  }

  for (const entry of entries) {
    inspected += 1;
    const rawName = Buffer.isBuffer(entry.name) ? entry.name : Buffer.from(entry.name);
    let name;
    try {
      name = decoder.decode(rawName);
    } catch {
      invalid.push(`${directory}/<hex:${rawName.toString("hex")}>`);
      continue;
    }

    if (name.includes("\uFFFD")) {
      invalid.push(path.join(directory, name));
      continue;
    }

    if (entry.isDirectory()) inspectDirectory(path.join(directory, name));
  }
}

const root = path.resolve(process.argv[2] || "/app");
inspectDirectory(root);

if (invalid.length) {
  console.error("Container filesystem contains invalid UTF-8 path names:");
  for (const item of invalid.slice(0, 50)) console.error(` - ${item}`);
  process.exit(1);
}

console.log(`Container UTF-8 path check passed (${inspected} entries inspected).`);
