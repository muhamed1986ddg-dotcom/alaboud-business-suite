# Current Production Candidate

**Version:** 25.14.121

## Release focus

- Fixes multi-currency transfer-rate conversion through a currency graph, including USD cross-rates for EUR, SYP, AED, GBP and other configured currencies.
- Preserves quoted transfer-rate audit metadata and resets it safely to CAD only when a legacy edit actually changes the canonical CAD rate.
- Includes `treasuryMovements` in company-wide operational backup and restore.
- Expands the backend test sweep to execute both `.test.js` and `.test.mjs`.
- Uses Android versionCode `2514121` and a signed Release APK workflow rather than Debug APK distribution.
- Requires a valid HTTPS `APP_URL` in production and aligns the public-registration environment variable name.

## Compatibility

All accounting formulas, WhatsApp automation, Voice Commands Phase 2, treasury weighted-average logic, customer balances, and prior v25.14.120 functionality are retained unless explicitly fixed above.
