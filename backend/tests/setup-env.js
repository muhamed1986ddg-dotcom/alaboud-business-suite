const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "TEST_ONLY_STRONG_JWT_SECRET_22_1";
process.env.RETURN_RESET_TOKEN = "true";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "alaboud-jest-"));
