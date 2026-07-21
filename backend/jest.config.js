module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.js"],
  setupFiles: ["<rootDir>/tests/setup-env.js"],
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: [
    "src/server.js",
    "src/security.js",
    "src/mailer.js",
    "src/store.js",
    "!src/selftest*.js"
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "json-summary", "lcov"],
  maxWorkers: 1,
  testTimeout: 30000
};
