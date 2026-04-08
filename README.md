# tauri-surrealdb-starter

A minimal Tauri v2 monorepo demonstrating **embedded SurrealDB (SurrealKV)** usage from a Tauri app via a single `rpc` IPC command.  
The JavaScript client communicates with the Rust backend exactly as it would with a remote SurrealDB server, but everything runs **locally** inside the app binary — no server process, no network, works on **iOS and Android** too.

---

## Structure

```
tauri-surrealdb-starter/
├── apps/
│   └── tauri-todo/                  # Tauri v2 app – Vite + vanilla TypeScript
│       ├── src/                     # Frontend source
│       └── src-tauri/               # Rust backend (embedded SurrealDB)
└── packages/
    └── tauri-surrealdb-transport/   # Custom Node package: rpc() transport + client adapter
```

---

## Quick start (desktop)

### Prerequisites

| Tool | Version |
|---|---|
| [Rust](https://rustup.rs/) | stable (≥ 1.77) |
| [Node.js](https://nodejs.org/) | ≥ 18 |
| [pnpm](https://pnpm.io/) | ≥ 9 |
| **Linux only** – system libraries | see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) |

On Ubuntu/Debian:
```bash
sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev libsoup-3.0-dev \
  libssl-dev pkg-config librsvg2-dev libayatana-appindicator3-dev
```

### Install & run

```bash
# 1 – install workspace dependencies and build the transport package
pnpm install
pnpm build:packages

# 2 – start the Vite dev server + Tauri window
pnpm tauri:dev

# Alternative: frontend only (hot-reload without Rust rebuild)
pnpm dev
```

### Production build

```bash
pnpm tauri:build
```

---

## Nix (alternative setup)

A `flake.nix` is provided for reproducible development and building using the
[Nix package manager](https://nixos.org/).

### Prerequisites

- [Nix](https://nixos.org/download) with flakes enabled:
  ```bash
  # Add to /etc/nix/nix.conf or ~/.config/nix/nix.conf
  experimental-features = nix-command flakes
  ```
- Optional: [direnv](https://direnv.net/) + [nix-direnv](https://github.com/nix-community/nix-direnv) for automatic shell activation.

### Development shell

```bash
# Enter the dev shell (provides Rust, Node, pnpm, and all system libs)
nix develop

# Or automatically when you cd into the repo (requires nix-direnv):
direnv allow
```

Inside the shell, use the same pnpm commands as above:

```bash
pnpm install
pnpm tauri:dev
pnpm tauri:build
```

### Building with Nix

Before the first `nix build`, you must obtain the hash for the pnpm offline
cache (a one-time step; repeat whenever `pnpm-lock.yaml` changes):

```bash
# 1. Attempt a build – it will fail and print the correct hash.
nix build .#pnpmOfflineCache 2>&1 | grep 'got:'

# 2. Open flake.nix and replace the value of  pnpmHash  with the hash above.

# 3. Build the desktop binary:
nix build

# The binary is symlinked at ./result/bin/tauri-todo
```

### Nix checks (CI)

```bash
# Runs: binary build + cargo clippy + cargo fmt check
nix flake check
```

---

## How the RPC bridge works

```
┌──────────────────────────────────────────────────────────────────────┐
│  JS frontend (Vite + TypeScript)                                     │
│                                                                      │
│  createSurrealClient()  ─►  rpc("select", ["todo"])                 │
│    │                              │                                  │
│    │            @tauri-surrealdb-starter/transport                   │
│    │                              │                                  │
│    │       invoke("rpc", { request: "{id,method,params}" })          │
└───────────────────────────────────┼──────────────────────────────────┘
                  Tauri IPC (secure local channel)
┌───────────────────────────────────┼──────────────────────────────────┐
│  Rust backend (src-tauri/)        │                                  │
│                                   ▼                                  │
│  #[tauri::command] async fn rpc(request: String, …)                 │
│    │                                                                  │
│    ├─ parse JSON-RPC request                                         │
│    ├─ dispatch to embedded SurrealDB (SurrealKV on disk)             │
│    └─ return JSON-RPC response string                                │
└──────────────────────────────────────────────────────────────────────┘
```

### Supported RPC methods

| Method | Params | Description |
|---|---|---|
| `use` | `[ns, db]` | Switch active namespace / database |
| `query` | `[sql, vars?]` | Run arbitrary SurrealQL |
| `select` | `[thing]` | `SELECT * FROM <thing>` |
| `create` | `[thing, data?]` | `CREATE <thing> CONTENT <data>` |
| `update` | `[thing, data]` | `UPDATE <thing> CONTENT <data>` |
| `merge` | `[thing, data]` | `UPDATE <thing> MERGE <data>` |
| `delete` | `[thing]` | `DELETE <thing>` |

### Using the transport package directly

```typescript
import { rpc, createSurrealClient } from "@tauri-surrealdb-starter/transport";

// Low-level: call any RPC method
const result = await rpc("query", ["SELECT * FROM todo"]);

// High-level adapter (mirrors SurrealDB JS SDK patterns)
const db = createSurrealClient();
await db.use("default", "todos");
const todos = await db.select("todo");
await db.create("todo", { title: "Buy milk", completed: false });
await db.merge("todo:abc123", { completed: true });
await db.delete("todo:abc123");
```

---

## Database file location

The SurrealKV database file (`surreal.db`) is stored in the **app data directory**, which Tauri resolves per-platform:

| Platform | Default path |
|---|---|
| Linux | `~/.local/share/<bundle-id>/surreal.db` |
| macOS | `~/Library/Application Support/<bundle-id>/surreal.db` |
| Windows | `%APPDATA%\<bundle-id>\surreal.db` |
| iOS | App sandbox `Library/Application Support/` |
| Android | App internal storage `files/` |

The bundle identifier is `dev.example.tauri-surrealdb-todo` (change it in `tauri.conf.json`).

---

## Mobile (Tauri iOS / Android)

This starter is designed to work on mobile with no code changes needed:

1. Tauri resolves the correct data directory automatically on all platforms.
2. SurrealKV is a pure-Rust embedded engine – no native C dependencies.
3. Follow the [Tauri mobile setup guide](https://v2.tauri.app/start/prerequisites/) to add iOS/Android targets.

```bash
# iOS (macOS only)
pnpm tauri ios dev

# Android
pnpm tauri android dev
```

**Considerations:**
- **Suspend/resume:** SurrealKV keeps the file open. If the OS terminates the app in the background, the DB is closed safely via Rust's Drop implementation.
- **File path:** Use only the Tauri-provided app data dir. Hardcoded paths will not work on mobile.
- **Thread safety:** `Surreal<Db>` is `Send + Sync`, so it's safe across async tasks without extra locking.

---

## Extending to multi-session

The current approach uses a **single global session** (one namespace/database shared by all windows). To support multiple sessions:

1. Change the `rpc` command signature to accept a `session_id: Option<String>`.
2. Replace `AppState { db: Surreal<Db> }` with a `HashMap<String, Surreal<Db>>` wrapped in a `Mutex`.
3. On `connect`, open a new DB instance (or a new NS/DB context on the same engine), store it under a generated session ID, and return that ID to JS.
4. The JS transport passes `session_id` as a parameter; the Rust side looks it up before dispatching.

---

## Project scripts

| Script | Description |
|---|---|
| `pnpm install` | Install all workspace dependencies |
| `pnpm build:packages` | Build the `@tauri-surrealdb-starter/transport` package |
| `pnpm dev` | Start Vite dev server (frontend only) |
| `pnpm tauri:dev` | Build packages + start Tauri dev (Rust + frontend) |
| `pnpm tauri:build` | Build packages + create production Tauri bundle |
| `pnpm type-check` | Run TypeScript type-check across all packages |

---

## Replacing placeholder icons

The `src-tauri/icons/` directory contains minimal placeholder icons. Generate proper ones with:

```bash
# Using the Tauri CLI (requires @tauri-apps/cli in the project)
pnpm tauri icon path/to/your/icon.png
```

This will produce all required sizes automatically.

---

## License

MIT – see [LICENSE](./LICENSE).
