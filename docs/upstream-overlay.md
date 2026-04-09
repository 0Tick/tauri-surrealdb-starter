# `surrealdb.js` Overlay Plan

This starter uses a **patch-overlay** approach rather than a hard fork first.

## Why overlay first

- Faster iteration for Android-first MVP.
- Lower maintenance burden while API surface is still evolving.
- Easy to migrate to full fork later if transport internals require it.

## Current overlay package

- Package: `packages/surrealdb-js-tauri`
- Transport: Tauri RPC (`@tauri-apps/api/core` `invoke`)
- Implemented subset:
  - `connect()`
  - `health()`
  - `use({ namespace, database })`
  - `signin({ username, password })`
  - `query(sql, vars)`
  - `close()`

## Upstream sync workflow

1. Track upstream `surrealdb.js` API changes.
2. Mirror method signatures where possible.
3. Keep transport implementation isolated (`TauriRpcTransport`).
4. Add compatibility tests for any newly added methods.

## Graduation criteria to full fork

Move to full fork once one or more are true:

- Multiple upstream internals must be patched at once.
- Overlay API diverges significantly from upstream contract.
- Need for deep integration of live queries and subscription semantics.
