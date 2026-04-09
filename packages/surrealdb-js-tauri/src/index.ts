import { invoke } from "@tauri-apps/api/core";

export type QueryVariables = Record<string, unknown>;

export interface SurrealUseParams {
  namespace: string;
  database: string;
}

export interface SurrealSigninParams {
  username?: string;
  password?: string;
}

export interface RpcTransport {
  connect(): Promise<void>;
  health(): Promise<{ ok: boolean; message: string }>;
  use(params: SurrealUseParams): Promise<void>;
  signin(params: SurrealSigninParams): Promise<void>;
  query<T>(sql: string, vars?: QueryVariables): Promise<T>;
  close(): Promise<void>;
}

export class TauriRpcTransport implements RpcTransport {
  async connect(): Promise<void> {
    await invoke("db_connect");
  }

  async health(): Promise<{ ok: boolean; message: string }> {
    return invoke("db_health");
  }

  async use(params: SurrealUseParams): Promise<void> {
    await invoke("db_use", { params });
  }

  async signin(params: SurrealSigninParams): Promise<void> {
    await invoke("db_signin", { params });
  }

  async query<T>(sql: string, vars?: QueryVariables): Promise<T> {
    return invoke("db_query", {
      params: {
        sql,
        vars: vars ?? null,
      },
    });
  }

  async close(): Promise<void> {
    await invoke("db_close");
  }
}

export class Surreal {
  private readonly transport: RpcTransport;

  constructor(transport: RpcTransport = new TauriRpcTransport()) {
    this.transport = transport;
  }

  async connect(): Promise<void> {
    await this.transport.connect();
  }

  async health(): Promise<{ ok: boolean; message: string }> {
    return this.transport.health();
  }

  async use(params: SurrealUseParams): Promise<void> {
    await this.transport.use(params);
  }

  async signin(params: SurrealSigninParams): Promise<void> {
    await this.transport.signin(params);
  }

  async query<T = unknown>(sql: string, vars?: QueryVariables): Promise<T> {
    return this.transport.query<T>(sql, vars);
  }

  async close(): Promise<void> {
    await this.transport.close();
  }
}
