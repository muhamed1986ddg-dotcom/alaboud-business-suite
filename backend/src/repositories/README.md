# PostgreSQL transition repositories — v22.3.3

`RelationalProjector` is the first production step toward native PostgreSQL operation.
Every successful store save now writes `app_state` and the normalized relational tables in one PostgreSQL transaction.
If any relational write fails, the entire save is rolled back.

This release intentionally keeps API reads compatible with the existing in-memory state while PostgreSQL parity is verified.
Set `RELATIONAL_MIRROR_ENABLED=false` only for emergency rollback.
