# Architecture and Transport Contract

## Scope

This starter runs an embedded SurrealDB datastore through a Tauri IPC bridge and a local patched SurrealDB JavaScript SDK transport.

## High-level architecture

1. UI and test harness

- SvelteKit page and manual controls in src/routes/+page.svelte.

1. Frontend client bootstrap

- The app creates `new Surreal()` directly and connects using `tauri://embedded`.
- Namespace/database selection uses standard SDK calls (`connect`, `use`, optional `signin`).

1. Patched SDK transport

- Tauri engine implementation in packages/surrealdb-js-sdk/src/engine/tauri.ts.
- Engine registration helper in packages/surrealdb-js-sdk/src/engine/index.ts.

1. Tauri command surface

- Command registration in src-tauri/src/lib.rs.
- Command handlers in src-tauri/src/commands.rs.

1. Embedded bridge runtime

- Core bridge implementation in src-tauri/crates/surreal_tauri_bridge/src/lib.rs.

## Command surface

Registered commands in src-tauri/src/lib.rs:

- db_init
- db_health
- db_query
- db_new_session
- db_list_sessions
- db_drop_session
- db_use_session
- db_set_session_var
- db_unset_session_var
- db_begin_transaction
- db_list_transactions
- db_commit_transaction
- db_cancel_transaction
- db_query_stream
- db_live_query_stream
- db_live_subscribe
- db_live_unsubscribe
- db_list_live_streams

## Typed error envelope

Tauri command handlers return a typed error payload:

- code: stable static error code
- message: sanitized string

Current code families from src-tauri/src/commands.rs:

- BRIDGE_IO
- BRIDGE_DB
- BRIDGE_UNAVAILABLE
- APP_PATH
- IPC_SEND

## Query response contract

db_query returns an envelope with chunked results:

- ok: boolean
- chunks: QueryChunk[]

QueryChunk fields from bridge crate:

- index: statement index
- executionTimeMs: optional execution time in milliseconds
- result: statement result when successful
- error: statement error when failed

## Session model

Session state is tracked in bridge memory keyed by UUID v7 session id:

- namespace and database binding
- per-session variables map

Behavior:

1. New session creates isolated context.
2. use session updates namespace and database for that session.
3. set and unset session variable mutates per-session vars.
4. dropping a session removes related transaction handles.

## Transaction model

Transactions are tracked by transaction UUID and owning session id.

Behavior:

1. begin requires an existing session.
2. execute with transaction id enforces ownership checks.
3. commit and cancel remove transaction handle from registry.

## Stream model

### Query stream

db_query_stream emits events over Tauri channel:

- Started with total_chunks
- Chunk
- Finished
- Failed

### Live stream

Live subscription tracks a generated stream id and cancel channel.

Live event contract from bridge crate:

- Started with streamId
- Notification with streamId, queryId, action, data
- Finished
- Cancelled
- Failed with error

Lifecycle:

1. db_live_subscribe starts a background task and returns stream id.
2. db_live_unsubscribe signals cancel and removes stream mapping.
3. SDK close path unsubscribes active streams.

## SDK transport notes

Tauri engine behavior in packages/surrealdb-js-sdk/src/engine/tauri.ts:

- Resolves and tracks backend session ids per SDK session.
- Supports query, transactions, and live subscriptions.
- Implements KILL handling by mapping to db_live_unsubscribe.
- Performs normalization for Surreal value wrappers and identifier materialization in SQL rewrite paths.

Debug controls:

- global flag: __SURREAL_TAURI_DEBUG = true
- persistent flag: localStorage key surreal.tauri.debug set to 1

## Security and capability notes

Current desktop capability policy is in src-tauri/capabilities/default.json and uses core:default.
Additional command-level hardening should remain aligned with the registered command surface.
