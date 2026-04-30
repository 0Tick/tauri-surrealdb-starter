# Tauri SurrealDB Starter

A cross-platform starter template for building desktop and mobile applications with [Tauri](https://tauri.app) and an **embedded [SurrealDB](https://surrealdb.com)** instance with on device persistence. The database runs entirely inside the Tauri process — no external server, sidecar or background processes required — and writes to the device filesystem.

> **Platform status:** tested on Linux and Android.  
> macOS, iOS and Windows should in theory also work, but are not yet tested. Please submit any bugs or issues that you find.

## What's included

| Layer | Technology |
|---|---|
| Frontend | SvelteKit + TypeScript |
| App shell | Tauri 2 |
| Database | SurrealDB 3 (embedded via `kv-surrealkv`) |
| Rust bridge | `surreal_tauri_bridge` crate — sessions, transactions, live streams |
| JS transport | Patched SurrealDB JS SDK with a `tauri://embedded` engine |

The goal is to give you a fully working foundation for applications that need the complete SurrealDB feature set (including the experimenta File Buckets), with persistence on the device and want to be cross platform.

## Prerequisites

- [Bun](https://bun.sh) (Or other javascript runtime and package manager)
- [Rust toolchain](https://rustup.rs)
- [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your platform

OR

- use the provided nix flake

## Quick start

```bash
#If using nix
nix develop
# 1. Install JS dependencies
bun install

# 2. Verify the frontend compiles
bun run check

# 3. Verify the Rust crates compile
cd src-tauri && cargo check && cd ..

# 4. Launch in development mode
bun run tauri dev
```

The app opens with a built-in test suite that exercises the full SurrealDB feature set: CRUD, relations, transactions, and LIVE subscriptions.

## Using the SurrealDB client in your code

This starter follows the same connection flow as the official SurrealDB JavaScript SDK guide (`new Surreal()` + `connect()` + `signin()`/`use()`).

### Create and connect a clientnow

```typescript
import { Surreal } from 'surrealdb';

// Create a Surreal instance
const db = new Surreal();

// Connect to the embedded datastore
await db.connect('tauri://embedded', {
  reconnect: false,
});

// Optional auth (same pattern as websocket usage)
// await db.signin({ username: 'root', password: 'root' });

// Select namespace/database
await db.use({
  namespace: 'app',
  database: 'app',
});
```

### Select a namespace and database, then query

```typescript
await db.use({ namespace: 'myapp', database: 'main' });

// Plain query
const users = await db.query('SELECT * FROM user WHERE active = true');

// Typed query
type User = { id: RecordId; name: string; email: string };
const [result] = await db.query<[User[]]>('SELECT * FROM user LIMIT 10');
```

### Create, update, and delete records

```typescript
import { RecordId } from 'surrealdb';

// Create a record with an auto-generated ID
const post = await db.create('post', { title: 'Hello world', draft: true });

// Create a record with a specific ID
await db.create(new RecordId('post', 'my-slug'), { title: 'Fixed ID post' });

// Update fields on a record
await db.merge(new RecordId('post', 'my-slug'), { draft: false });

// Delete a record
await db.delete(new RecordId('post', 'my-slug'));
```

### File Buckets (experimental)

SurrealDB file buckets are currently experimental in SurrealDB 3.Enabling is as simple as setting the file bucket feature flag in the tauri `cargo.toml`

```toml
surreal_tauri_bridge = { path = "crates/surreal_tauri_bridge", features = ["file-buckets"]}
```

A folder files gets automatically generated under $APPDATA/surrealdb/files which is then added to the allowlist. From there you can get the allow list from the frontend, initialize the Bucket and then use it to store files.

```typescript
import { FileRef, getBucketFolderAllowlist } from 'surrealdb';

// Read the allowlisted bucket folder from the Rust bridge.
// This command ensures the embedded bridge is initialized first.
const [bucketFolder] = await getBucketFolderAllowlist();

if (!bucketFolder) {
  throw new Error('No allowlisted bucket folder configured');
}

const escapedBucketFolder = bucketFolder.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// Define a persistent folder-backed bucket inside the allowlist.
await db.query(`DEFINE BUCKET IF NOT EXISTS uploads BACKEND 'folder' PATH '${escapedBucketFolder}';`);

// Write file contents
await db.query('f"uploads:/hello.txt".put("Hello from SurrealDB buckets");');

// Read file contents back as a string
const [text] = await db.query<[string]>('RETURN <string>f"uploads:/hello.txt".get();');

// Store a file pointer inside a regular record
await db.create('asset').content({
  name: 'welcome-text',
  file: new FileRef('uploads', '/hello.txt'),
});
```

See the `DEFINE BUCKET` [docs](https://surrealdb.com/docs/reference/query-language/statements/define/bucket) for backend and capability details.

### Transactions

```typescript
import { RecordId } from 'surrealdb';

const txn = await db.beginTransaction();

try {
  const alice = await txn.select<{ balance: number }>(new RecordId('account', 'alice'));
  const bob = await txn.select<{ balance: number }>(new RecordId('account', 'bob'));

  if (!alice || !bob) {
    throw new Error('Account not found');
  }

  if (alice.balance < 100) {
    throw new Error('Insufficient funds');
  }

  await txn.update(new RecordId('account', 'alice')).merge({ balance: alice.balance - 100 });
  await txn.update(new RecordId('account', 'bob')).merge({ balance: bob.balance + 100 });

  await txn.commit();
} catch (error) {
  await txn.cancel();
  throw error;
}
```

### LIVE queries

```typescript
import { type LiveSubscription } from 'surrealdb';

const subscription: LiveSubscription = await db.live('post', (action, record) => {
  console.log(action, record); // 'CREATE' | 'UPDATE' | 'DELETE', typed record
});

// Stop receiving updates
subscription.kill();
```

### Closing the connection

```typescript
await db.close();
```

## Project structure

```
src-tauri/
  crates/
    surreal_tauri_bridge/   — Rust crate: datastore lifecycle, sessions,
                              transactions, live stream IPC
  src/
    commands.rs     — Tauri commands exposed to the frontend
    lib.rs

packages/
  surrealdb-js-sdk/ — local working copy used to maintain the Tauri
                      transport changes before generating a patch
patches/
  surrealdb+2.0.3.patch — patch-package patch applied to npm surrealdb
```

## Updating the patched SurrealDB SDK

The project consumes `surrealdb` from npm (`surrealdb: 2.0.3`) and applies
the Tauri bridge via patch-package (`patches/surrealdb+2.0.3.patch`).

1. Sync upstream SDK source into `packages/surrealdb-js-sdk`.
2. Re-apply the Tauri engine in `packages/surrealdb-js-sdk/src/engine/tauri.ts`.
3. Verify the engine is exported in `packages/surrealdb-js-sdk/src/engine/index.ts`.
4. Verify default engine fallback in `packages/surrealdb-js-sdk/src/controller/index.ts` uses `createTauriEngines()`.
5. Rebuild the local SDK copy so `packages/surrealdb-js-sdk/dist` is up to date.
6. Copy updated SDK publish artifacts into `node_modules/surrealdb` (at minimum `dist/*` and `package.json`).
7. Regenerate the patch with `npx patch-package surrealdb`.
8. Run `bun run check` and `cargo check`.

## Debug logging

Enable verbose transport logs in the webview console:

```javascript
// Runtime (current session only)
window.__SURREAL_TAURI_DEBUG = true;

// Persistent across reloads
localStorage.setItem('surreal.tauri.debug', '1');

// Disable persistent logging
localStorage.removeItem('surreal.tauri.debug');
```

## Documentation

| Document | Description |
|---|---|
| [docs/architecture-and-contract.md](docs/architecture-and-contract.md) | IPC protocol, transport contract, and engine design |
| [docs/validation-and-handoff.md](docs/validation-and-handoff.md) | Validation matrix and release checklist |
| [docs/troubleshooting.md](docs/troubleshooting.md) | Common issues: channel lifecycle, stale sessions, auth refresh |
