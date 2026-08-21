# Current Production Master

**Version:** 25.14.106

## Inventory and capital baseline

- Monthly Inventory displays the official company, customer, profit and vault summaries while retaining the backend `finalInventory` value.
- The latest approved `finalInventory` becomes original capital; only movements after its precise approval timestamp affect current capital.
- Legacy inventory records retain their safe date-based fallback and multi-currency vault snapshots remain unchanged.

## Vault cash currency picker

- Vault currencies are added on demand through a compact picker instead of displaying every supported currency at once.
- Existing multi-currency conversion, snapshot and CAD inventory-total behavior remain unchanged.

## Multi-currency vault cash

- Monthly inventory stores original vault balances and the exchange-rate snapshot used to calculate the existing CAD `vaultCash` total.
- Historical and legacy inventory records remain backward compatible without double counting.

## Mobile compact transfer results

- Restored compact, content-sized transfer result cards below 640px.
- Uses two columns on wider phones and one column on very narrow phones without affecting tablet or desktop layouts.

## Transfer form layout

- Corrected the responsive add-transfer grid and card spacing across desktop, tablet and mobile widths.
- Kept all transfer calculations, provider fees, backend behavior and API contracts unchanged.

## Architecture refactor

- Split organization/admin routes from `backend/src/server.js` into `backend/src/routes/organization.js`.
- Split expense/capital routes into `backend/src/routes/finance-operations.js`.
- Split backup/security-maintenance routes into `backend/src/routes/backup.js`.
- Preserved all public API paths and financial behavior.
- Reduced the main server file from 6,247 lines to under 6,000 lines without changing accounting formulas.

## Financial behavior

Provider-fee accounting from v25.14.98 remains unchanged: automatic fee-per-100 settings, per-transfer manual override, and net-profit deduction are preserved.
