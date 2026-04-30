# Validation Matrix and Handoff

## Final validation gates

Run both compile gates before release:

1. Frontend and type checks

- npm run check

1. Rust bridge and app checks

- cd src-tauri
- cargo check

## End-to-end scenario checklist

1. Connect and health

- Open app and run full test suite.
- Confirm init, query, stream, and meta checks pass.

1. Session and variables

- Verify set, query, unset behavior.
- Verify forked session isolation and reset behavior.

1. CRUD and relation helpers

- Verify create, select, update, upsert, insert, delete checks pass.
- Verify relate and run checks pass.

1. Transaction lifecycle

- Begin transaction.
- Perform write.
- Cancel and verify rollback.

1. Live query lifecycle

- Start live stream and verify notifications.
- Validate start and stop cycle.
- Unsubscribe and confirm no further notifications.

1. Restart persistence

- Create records.
- Restart app.
- Verify records remain in datastore.

## Concurrency checks

1. Run overlapping queries from UI test harness.
2. Run transaction activity while live stream is active.
3. Confirm no cross-talk across sessions and transactions.

## Stream stress checks

1. Execute multi-statement query with streaming output.
2. Verify ordered chunk delivery and Finished event.
3. Confirm UI remains responsive during stream processing.

## Release handoff notes

1. Local SDK patch strategy

- The app depends on surrealdb from file:packages/surrealdb-js-sdk.
- Keep tauri transport changes isolated primarily in packages/surrealdb-js-sdk/src/engine/tauri.ts and packages/surrealdb-js-sdk/src/engine/index.ts.

1. Minimum artifacts to review before shipping

- src/routes/+page.svelte
- packages/surrealdb-js-sdk/src/controller/index.ts
- src-tauri/src/lib.rs
- src-tauri/src/commands.rs
- src-tauri/crates/surreal_tauri_bridge/src/lib.rs

1. Regression signal

- Any failure in npm run check or cargo check blocks release.
