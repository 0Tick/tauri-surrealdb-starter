# Troubleshooting

## Channel lifecycle issues

Symptoms:

- Live notifications stop unexpectedly.
- Stream appears active but no new events are emitted.

Checks:

1. Confirm stream id is present from db_live_subscribe response.
2. Confirm events include Started before expecting Notification payloads.
3. Confirm the SDK close path or iterator cleanup did not already unsubscribe.

Actions:

1. Recreate the subscription and verify new stream id appears.
2. Check webview console with transport debug enabled.
3. Verify db_list_live_streams output and remove stale streams with db_live_unsubscribe.

## Stale session issues

Symptoms:

- session not found errors.
- Transaction operation fails after session cleanup.

Checks:

1. Ensure session id is still listed in db_list_sessions.
2. Verify transaction belongs to the same session.
3. Confirm session namespace and database are set after reconnect.

Actions:

1. Create a new session and re-run use session.
2. Rebind required session variables.
3. Recreate long-lived transactions rather than reusing stale ids.

## Transaction ownership errors

Symptoms:

- transaction does not belong to provided session.

Cause:

- Transaction ids are session-scoped and validated in bridge execution path.

Actions:

1. Use the matching session for transaction queries.
2. Avoid sharing transaction ids across forked sessions.

## Live query mismatch and kill behavior

Symptoms:

- Live events continue after kill attempt.

Checks:

1. Ensure KILL maps to active stream id in the SDK transport.
2. Confirm db_live_unsubscribe call succeeds.
3. Verify stream id is removed from db_list_live_streams.

Actions:

1. Retry unsubscribe by explicit stream id.
2. Close and reopen the client to force cleanup.

## Typed API errors

Tauri command failures return:

- code
- message

Common code groups:

- BRIDGE_IO
- BRIDGE_DB
- BRIDGE_UNAVAILABLE
- APP_PATH
- IPC_SEND

Use code first for triage and message second for context.

## Token refresh and auth workflow note

The current bridge implementation in this starter does not expose a full auth token refresh command surface yet.
If you see token refresh expectations in higher-level app logic, treat them as unsupported in this build and use reconnect plus session re-initialization flows until auth endpoints are introduced.

## Enable transport debug logs

In webview console before connection:

1. Set global flag __SURREAL_TAURI_DEBUG to true.
2. Or set localStorage key surreal.tauri.debug to 1.

Disable persistent debug:

1. Remove localStorage key surreal.tauri.debug.
