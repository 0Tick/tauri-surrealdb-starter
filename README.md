# Tauri SurrealDB Starter

A cross-platform starter template for building desktop and mobile applications with [Tauri](https://tauri.app) and an **embedded [SurrealDB](https://surrealdb.com)** instance with on-device persistence. The database runs entirely inside the Tauri process — no external server, sidecar, or background processes required — and writes to the device filesystem.

> **Platform status:** tested on Linux and Android.  
> macOS, iOS, and Windows should in theory also work, but are not yet tested. Please submit any bugs or issues that you find.

## What's included

| Layer | Technology |
|---|---|
| Frontend | SvelteKit + TypeScript |
| App shell | Tauri 2 |
| Database | SurrealDB 3 (embedded via `kv-surrealkv`) |
| Rust bridge | `surreal_tauri_bridge` crate — sessions, transactions, live streams |
| JS SDK | [0Tick/surrealdb.js-tauri](https://github.com/0Tick/surrealdb.js-tauri) (`tauri` branch) with a `tauri://` engine |

The JavaScript SDK is vendored as a git submodule. The starter consumes it through Bun workspaces (`surrealdb: workspace:*`), so the app imports `surrealdb` normally while the source lives in `surrealdb-js-sdk/`.

The goal is to give you a fully working foundation for applications that need the complete SurrealDB feature set (including the experimental File Buckets), with persistence on the device and cross-platform support.

## Prerequisites

- [Bun](https://bun.sh) (or another JavaScript runtime and package manager)
- [Rust toolchain](https://rustup.rs)
- [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your platform

OR

- use the provided nix flake

## Quick start

```bash
# If using nix
nix develop

# 1. Clone this repo with the SDK submodule
git clone --recurse-submodules https://github.com/0Tick/tauri-surrealdb-starter.git
cd tauri-surrealdb-starter

# If you already cloned without submodules:
# git submodule update --init --recursive

# 2. Build the SDK (required on first checkout or when sdk was modified or updated)
./scripts/build-sdk.sh

# 3. Install app dependencies
bun install

# 4. Verify the frontend compiles
bun run check

# 5. Verify the Rust crates compile
cd src-tauri && cargo check && cd ..

# 6. Launch in development mode
bun run tauri dev
```

The app opens with a built-in test suite that exercises the full SurrealDB feature set: CRUD, relations, transactions, and LIVE subscriptions.

## Using the SurrealDB client in your code

This starter follows the same connection flow as the official SurrealDB JavaScript SDK guide (`new Surreal()` + `connect()` + `signin()`/`use()`).

### Create and connect a client

```typescript
import { Surreal } from 'surrealdb';

const db = new Surreal();

// Connect to the embedded datastore via the Tauri transport
await db.connect('tauri://embedded', {
  reconnect: false,
});

// Optional auth (same pattern as websocket usage)
// await db.signin({ username: 'root', password: 'root' });

await db.use({
  namespace: 'app',
  database: 'app',
});
```

### Select a namespace and database, then query

```typescript
await db.use({ namespace: 'myapp', database: 'main' });

const users = await db.query('SELECT * FROM user WHERE active = true');

type User = { id: RecordId; name: string; email: string };
const [result] = await db.query<[User[]]>('SELECT * FROM user LIMIT 10');
```

### Create, update, and delete records

```typescript
import { RecordId } from 'surrealdb';

const post = await db.create('post', { title: 'Hello world', draft: true });
await db.create(new RecordId('post', 'my-slug'), { title: 'Fixed ID post' });
await db.merge(new RecordId('post', 'my-slug'), { draft: false });
await db.delete(new RecordId('post', 'my-slug'));
```

### File Buckets (experimental)

SurrealDB file buckets are currently experimental in SurrealDB 3. Enable them by setting the file bucket feature flag in the Tauri `Cargo.toml`:

```toml
surreal_tauri_bridge = { path = "crates/surreal_tauri_bridge", features = ["file-buckets"] }
```

A `files` folder is created under `$APPDATA/surrealdb/files` and added to the allowlist. From the frontend you can read that allowlist, define a bucket, and store files.

```typescript
import { FileRef } from 'surrealdb';

const allowlist = await db.getBucketFolderAllowlist();
const bucketFolder = allowlist[0];

if (!bucketFolder) {
  throw new Error('No allowlisted bucket folder configured');
}

const escapedBucketFolder = bucketFolder.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

await db.query(`DEFINE BUCKET IF NOT EXISTS uploads BACKEND 'folder' PATH '${escapedBucketFolder}';`);
await db.query('f"uploads:/hello.txt".put("Hello from SurrealDB buckets");');

const [text] = await db.query<[string]>('RETURN <string>f"uploads:/hello.txt".get();');

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

subscription.kill();
```

### Closing the connection

```typescript
await db.close();
```

## Project structure

```
.gitmodules                      Submodule config for the SDK fork
src/                             SvelteKit frontend and built-in test console
src-tauri/
  crates/
    surreal_tauri_bridge/        Embedded SurrealDB, sessions, transactions,
                                 live notifications, and Tauri IPC commands
  src/                           Tauri app entry (`lib.rs`, `main.rs`)

surrealdb-js-sdk/                Git submodule → 0Tick/surrealdb.js-tauri (`tauri` branch)
  packages/
    sdk/                         `surrealdb` npm package consumed by this app
    sqon/                        `@surrealdb/sqon` value types and codecs

package.json                     Bun workspaces + `surrealdb: workspace:*`
```

At install time, Bun links `node_modules/surrealdb` to `surrealdb-js-sdk/packages/sdk`.

### SDK submodule

| Setting | Value |
|---|---|
| Path | `surrealdb-js-sdk/` |
| Remote | [https://github.com/0Tick/surrealdb.js-tauri.git](https://github.com/0Tick/surrealdb.js-tauri.git) |
| Branch | `tauri` |
| Upstream base | [surrealdb/surrealdb.js](https://github.com/surrealdb/surrealdb.js) |

The `tauri` branch contains the embedded transport and related API wiring. The fork's `upstream` remote points at the official surrealdb.js repository for merging new releases.

## Updating the SurrealDB SDK

### Pull the latest `tauri` branch

From the repo root:

```bash
git submodule update --init --remote surrealdb-js-sdk
./scripts/build-sdk.sh
bun install
bun run check
git add surrealdb-js-sdk
```

Or from inside the submodule:

```bash
cd surrealdb-js-sdk
git pull origin tauri
cd ..
./scripts/build-sdk.sh
bun install
git add surrealdb-js-sdk
```

`git submodule update --remote` follows the branch configured in `.gitmodules` (`branch = tauri`).

### Merge upstream surrealdb.js into the fork

To bring official SDK changes onto the Tauri branch:

```bash
cd surrealdb-js-sdk
git fetch upstream
git merge upstream/main   # or rebase, as you prefer
# resolve conflicts, rebuild, test
git push origin tauri
cd ..
git submodule update --init --remote surrealdb-js-sdk
git add surrealdb-js-sdk
```

### Tauri-specific files on the `tauri` branch

| Path | Purpose |
|---|---|
| `packages/sdk/src/engine/tauri.ts` | Tauri invoke + channel RPC engine |
| `packages/sdk/src/engine/index.ts` | Registers the `tauri:` engine in `createRemoteEngines()` |
| `packages/sdk/src/controller/index.ts` | `getBucketFolderAllowlist()` controller hook |
| `packages/sdk/src/api/surreal.ts` | Public `getBucketFolderAllowlist()` API |
| `packages/sdk/build.ts` | Marks `@tauri-apps/api/core` as an external bundle dependency |
| `packages/sdk/package.json` | Dev + optional peer dependency on `@tauri-apps/api` (needed to build declarations) |
| `packages/sqon/src/value/uuid.ts` | Guards `SharedArrayBuffer` usage for Tauri webviews |

After changing SDK source, always rebuild before running the app:

```bash
./scripts/build-sdk.sh
```

Restart the dev server after rebuilding (`bun run tauri dev`).

### Notes

- Connect with `tauri://embedded` (or any `tauri://…` URL); the host and path are ignored.
- `@tauri-apps/api` must be installed in the app (listed in root `package.json`).
- On a fresh clone, build the SDK before `bun run dev` or `bun run tauri dev` — the submodule ships source, not prebuilt `dist/` artifacts.

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
