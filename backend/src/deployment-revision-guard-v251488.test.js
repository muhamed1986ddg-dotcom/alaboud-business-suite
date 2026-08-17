"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.resolve(__dirname, "../..");
const deployPath = path.join(root, "DEPLOY_CLOUD_RUN_V25_14_88.ps1");
const deploy = fs.readFileSync(deployPath, "utf8");

assert.match(deploy, /25\.14\.88/, "deploy script must target v25.14.88");
assert.match(deploy, /"--no-traffic"/, "test revision must deploy with no production traffic");
assert.match(deploy, /"--tag",\s*"v251488"/, "test revision must use v251488 tag");
assert.match(deploy, /"--max-instances",\s*"1"/, "Cloud Run max instances must remain bounded");
assert.doesNotMatch(deploy, /--min-instances(?:=|\s)/, "revision-level --min-instances must never be used");
assert.match(deploy, /autoscaling\.knative\.dev\/minScale/, "deployment must verify revision-level minScale");
assert.match(deploy, /Unsafe Cloud Run configuration detected/, "deployment must fail closed if revision-level minScale returns");

console.log("v25.14.88 deployment revision guard: OK");
