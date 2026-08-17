"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const android = fs.readFileSync(
  path.join(root, "app/src/main/java/com/alaboud/businesssuite/MainActivity.kt"),
  "utf8",
);

assert(
  android.includes("@Volatile private var trustedPageActive = false"),
  "trusted page state must be safe to read from the JavaScript bridge thread",
);
assert(
  android.includes("private fun isTrustedPage(): Boolean = trustedPageActive"),
  "JavaScript bridge trust checks must use the UI-thread-maintained state",
);
assert(
  !android.includes("private fun isTrustedPage(): Boolean = isTrustedAppUri(webView.url"),
  "a JavaScript bridge call must never read WebView state from its background thread",
);
assert(
  android.includes("private fun updateTrustedPage(uri: Uri?): Boolean"),
  "WebView callbacks must update the trusted page state",
);
assert(
  android.includes("override fun onPageStarted") &&
    android.includes("if (updateTrustedPage(uri))"),
  "navigation start must fail closed and refresh trusted page state",
);
assert(
  android.includes("trustedPageActive = false\n                detachNativeBridge()\n                handler?.cancel()"),
  "SSL failures must clear trust, detach the bridge and cancel navigation",
);
assert(
  android.includes('CLIENT_VERSION = "25.14.88"'),
  "Android hotfix client version mismatch",
);

console.log("Android WebView bridge thread-safety regression on v25.14.84: OK");
