/**
 * @tauri-surrealdb-starter/transport
 *
 * A minimal Tauri IPC transport for SurrealDB.
 *
 * Exposes a single `rpc()` function that serialises a JSON-RPC request and
 * sends it to the Rust backend via `invoke("rpc", …)`, then returns the
 * deserialised result (or throws on error).
 *
 * Also provides `createSurrealClient()` – a lightweight adapter that mirrors
 * the most common SurrealDB JS SDK call patterns so the todo app can call
 * `db.query()`, `db.select()`, etc. without depending on the full SDK.
 */

import { invoke } from "@tauri-apps/api/core";

// ─────────────────────────────────────────────────────────────────────────────
// JSON-RPC types
// ─────────────────────────────────────────────────────────────────────────────

export interface RpcRequest {
  id: string;
  method: string;
  params: unknown[];
}

export interface RpcError {
  code: number;
  message: string;
}

export interface RpcResponse<T = unknown> {
  id: string;
  result?: T;
  error?: RpcError;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core transport – single rpc() function
// ─────────────────────────────────────────────────────────────────────────────

let _idCounter = 0;

/**
 * Send a JSON-RPC request to the Tauri backend's `rpc` command.
 *
 * @param method  SurrealDB RPC method name (e.g. "query", "select", …)
 * @param params  Positional parameters for the method
 * @returns       The `result` field of the response on success
 * @throws        An `Error` containing the server error message on failure
 */
export async function rpc<T = unknown>(
  method: string,
  params: unknown[] = []
): Promise<T> {
  const id = String(++_idCounter);
  const request: RpcRequest = { id, method, params };

  const responseStr = await invoke<string>("rpc", {
    request: JSON.stringify(request),
  });

  const response = JSON.parse(responseStr) as RpcResponse<T>;

  if (response.error) {
    throw new Error(
      `SurrealDB RPC error [${response.error.code}]: ${response.error.message}`
    );
  }

  return response.result as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// High-level client adapter
// ─────────────────────────────────────────────────────────────────────────────

export interface QueryResult<T> {
  result: T[];
  status: string;
  time: string;
}

export interface SurrealClient {
  /** Select the active namespace and database */
  use(ns: string, db: string): Promise<void>;

  /**
   * Run a raw SurrealQL query.
   * Returns an array of statement results (one entry per SQL statement).
   */
  query<T = unknown>(
    sql: string,
    vars?: Record<string, unknown>
  ): Promise<T[][]>;

  /** Retrieve all records for a table, or a single record by `table:id` */
  select<T = unknown>(thing: string): Promise<T[]>;

  /** Create one or more records */
  create<T = unknown>(
    thing: string,
    data?: Record<string, unknown>
  ): Promise<T[]>;

  /** Replace a record's content entirely */
  update<T = unknown>(
    thing: string,
    data: Record<string, unknown>
  ): Promise<T[]>;

  /** Merge (partial-update) a record */
  merge<T = unknown>(
    thing: string,
    data: Record<string, unknown>
  ): Promise<T[]>;

  /** Delete a record or all records in a table */
  delete<T = unknown>(thing: string): Promise<T[]>;
}

/**
 * Create a SurrealDB client backed by the Tauri IPC transport.
 *
 * The client is already connected to the embedded database; you only need to
 * call `use()` once (or rely on the backend default of ns=default db=todos).
 */
export function createSurrealClient(): SurrealClient {
  return {
    async use(ns: string, db: string): Promise<void> {
      await rpc<void>("use", [ns, db]);
    },

    async query<T = unknown>(
      sql: string,
      vars?: Record<string, unknown>
    ): Promise<T[][]> {
      const params: unknown[] = [sql];
      if (vars && Object.keys(vars).length > 0) params.push(vars);
      return rpc<T[][]>("query", params);
    },

    async select<T = unknown>(thing: string): Promise<T[]> {
      return rpc<T[]>("select", [thing]);
    },

    async create<T = unknown>(
      thing: string,
      data?: Record<string, unknown>
    ): Promise<T[]> {
      const params: unknown[] = [thing];
      if (data) params.push(data);
      return rpc<T[]>("create", params);
    },

    async update<T = unknown>(
      thing: string,
      data: Record<string, unknown>
    ): Promise<T[]> {
      return rpc<T[]>("update", [thing, data]);
    },

    async merge<T = unknown>(
      thing: string,
      data: Record<string, unknown>
    ): Promise<T[]> {
      return rpc<T[]>("merge", [thing, data]);
    },

    async delete<T = unknown>(thing: string): Promise<T[]> {
      return rpc<T[]>("delete", [thing]);
    },
  };
}
