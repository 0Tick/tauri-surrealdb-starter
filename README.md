# Tauri + Embedded SurrealDB Starter (Android-first MVP)

Small starter monorepo for a Tauri app that runs **embedded SurrealDB** on the Rust side and talks to it from the frontend via Tauri RPC.

## Disclaimer

⚠️ This repository was the result of many failed attempts of trying to get this to work by vibecoding. I don't know rust much and thus had to resort to vibecoding to get something working. 
⚠️ I will not be able to provide support or assistance but am open to suggestions or PRs to this repo.


## What is included

- `apps/desktop-mobile`: Tauri app (desktop + Android-first flow)
- `packages/surrealdb-js-tauri`: custom Surreal client package using Tauri RPC transport
- `flake.nix`: Nix dev shell with Android toolchain + Rust targets

## MVP scope

This repository starts with a **small, working connection path**:

1. Frontend calls custom SDK (`Surreal`)
2. SDK calls Tauri commands (`db_connect`, `db_use`, `db_query`, ...)
3. Rust side executes query on embedded SurrealDB (`surrealkv` local persistence)
4. Result is returned to frontend

## Quick start

```bash
nix develop
npm install
npm run tauri:dev
```

For Android-first development (inside `nix develop` shell):

```bash
npm run android:dev
```

## Patch-overlay strategy for `surrealdb.js`

`packages/surrealdb-js-tauri` is intentionally small and tracks a subset of the upstream API first. The strategy is:

1. Keep public API shape close to upstream (`connect`, `use`, `signin`, `query`, `close`)
2. Route transport through Tauri RPC instead of websocket/http
3. Add missing upstream methods incrementally as the embedded RPC contract grows
4. Maintain an overlay patch record in `docs/upstream-overlay.md`

## Current limitations

- Embedded engine uses `surrealkv` persisted under the app data directory.
- `signin` currently acknowledges credentials but does not enforce auth yet.
- API coverage is intentionally minimal.
- LIVE Querys are unavailable due to the complexity to get them running in this embedded way with mobile support too. I don't know enough about the SurrealDB codebase and rust to know how I could even approach this
- No IOS support yet as setting up tooling for that is jot something I have looked into

## Next steps

- Add typed response helpers and richer error mapping.
- Add IOS support if possible