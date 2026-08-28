# Current Production Candidate

**Version:** 25.14.122

## Release focus

- Gives writes a production-safe 30-second timeout and treats lost responses as ambiguous rather than failed.
- Recovers payment confirmation with bounded 500/1000/1500/2500/4000 ms status checks using the original idempotency key, without replaying the financial mutation.
- Blocks repeat payment submission while saving or verifying and refreshes customer data after recovered commits.
- Reports explicit backend failure separately from an unknown final state, preventing accidental duplicate payments.
- Uses Android versionCode `2514122` and a signed Release APK workflow rather than Debug APK distribution.
- Requires a valid HTTPS `APP_URL` in production and aligns the public-registration environment variable name.

## Compatibility

All accounting formulas, multi-currency rates, WhatsApp automation, Voice Commands Phase 2, treasury weighted-average logic, customer balances, tenant isolation, and prior v25.14.121 functionality are retained unchanged.
