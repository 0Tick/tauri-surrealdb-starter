import { invoke } from "@tauri-apps/api/core";

export type QueryVariables = Record<string, unknown>;
export type RecordRef = string;
export type VersionInfo = { version: string };
export type PatchOperation = {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  from?: string;
  value?: unknown;
};

export interface SurrealUseParams {
  namespace: string;
  database: string;
}

export type SurrealSigninParams = Record<string, unknown>;
export type SurrealSignupParams = Record<string, unknown>;
export type SurrealAuthenticateToken = string;

export interface RpcTransport {
  connect(): Promise<void>;
  health(): Promise<{ ok: boolean; message: string }>;
  version(): Promise<VersionInfo>;
  use(params: SurrealUseParams): Promise<void>;
  signup(params: SurrealSignupParams): Promise<unknown>;
  signin(params: SurrealSigninParams): Promise<unknown>;
  authenticate(token: SurrealAuthenticateToken): Promise<void>;
  invalidate(): Promise<void>;
  setParam(name: string, value: unknown): Promise<void>;
  unsetParam(name: string): Promise<void>;
  info(): Promise<unknown>;
  select(resource: RecordRef): Promise<unknown>;
  create(resource: RecordRef, data?: QueryVariables): Promise<unknown>;
  insert(resource: RecordRef, data: unknown): Promise<unknown>;
  update(resource: RecordRef, data?: QueryVariables): Promise<unknown>;
  upsert(resource: RecordRef, data?: QueryVariables): Promise<unknown>;
  merge(resource: RecordRef, data: QueryVariables): Promise<unknown>;
  patch(resource: RecordRef, diff: PatchOperation[]): Promise<unknown>;
  delete(resource: RecordRef): Promise<unknown>;
  relate(
    from: RecordRef,
    relation: string,
    to: RecordRef,
    data?: QueryVariables,
  ): Promise<unknown>;
  run(name: string, args: unknown[]): Promise<unknown>;
  query<T = unknown>(sql: string, vars?: QueryVariables): Promise<T>;
  close(): Promise<void>;
}

export class TauriRpcTransport implements RpcTransport {
  async connect(): Promise<void> {
    await invoke("db_connect");
  }

  async health(): Promise<{ ok: boolean; message: string }> {
    return invoke("db_health");
  }

  async version(): Promise<VersionInfo> {
    return invoke("db_version");
  }

  async use(params: SurrealUseParams): Promise<void> {
    await invoke("db_use", { params });
  }

  async signup(params: SurrealSignupParams): Promise<unknown> {
    return invoke("db_signup", {
      params: {
        auth: params,
      },
    });
  }

  async signin(params: SurrealSigninParams): Promise<unknown> {
    return invoke("db_signin", {
      params: {
        auth: params,
      },
    });
  }

  async authenticate(token: SurrealAuthenticateToken): Promise<void> {
    await invoke("db_authenticate", {
      params: {
        token,
      },
    });
  }

  async invalidate(): Promise<void> {
    await invoke("db_invalidate");
  }

  async setParam(name: string, value: unknown): Promise<void> {
    await invoke("db_let", {
      params: {
        name,
        value,
      },
    });
  }

  async unsetParam(name: string): Promise<void> {
    await invoke("db_unset", {
      params: {
        name,
      },
    });
  }

  async info(): Promise<unknown> {
    return invoke("db_info");
  }

  async select(resource: RecordRef): Promise<unknown> {
    return invoke("db_select", {
      params: {
        resource,
      },
    });
  }

  async create(resource: RecordRef, data?: QueryVariables): Promise<unknown> {
    return invoke("db_create", {
      params: {
        resource,
        data: data ?? null,
      },
    });
  }

  async insert(resource: RecordRef, data: unknown): Promise<unknown> {
    return invoke("db_insert", {
      params: {
        resource,
        data,
      },
    });
  }

  async update(resource: RecordRef, data?: QueryVariables): Promise<unknown> {
    return invoke("db_update", {
      params: {
        resource,
        data: data ?? null,
      },
    });
  }

  async upsert(resource: RecordRef, data?: QueryVariables): Promise<unknown> {
    return invoke("db_upsert", {
      params: {
        resource,
        data: data ?? null,
      },
    });
  }

  async merge(resource: RecordRef, data: QueryVariables): Promise<unknown> {
    return invoke("db_merge", {
      params: {
        resource,
        data,
      },
    });
  }

  async patch(resource: RecordRef, diff: PatchOperation[]): Promise<unknown> {
    return invoke("db_patch", {
      params: {
        resource,
        diff,
      },
    });
  }

  async delete(resource: RecordRef): Promise<unknown> {
    return invoke("db_delete", {
      params: {
        resource,
      },
    });
  }

  async relate(
    from: RecordRef,
    relation: string,
    to: RecordRef,
    data?: QueryVariables,
  ): Promise<unknown> {
    return invoke("db_relate", {
      params: {
        from,
        relation,
        to,
        data: data ?? null,
      },
    });
  }

  async run(name: string, args: unknown[]): Promise<unknown> {
    return invoke("db_run", {
      params: {
        name,
        args,
      },
    });
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

const unwrapTaggedValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(unwrapTaggedValue);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 1) {
    const [key, inner] = entries[0];

    if (key === "Object" && inner && typeof inner === "object") {
      return Object.fromEntries(
        Object.entries(inner as Record<string, unknown>).map(
          ([nestedKey, nestedValue]) => [
            nestedKey,
            unwrapTaggedValue(nestedValue),
          ],
        ),
      );
    }

    if (key === "Array" && Array.isArray(inner)) {
      return inner.map(unwrapTaggedValue);
    }

    if (["Strand", "String", "Datetime", "Uuid", "Duration"].includes(key)) {
      return typeof inner === "string" ? inner : String(inner);
    }

    if (key === "Bool") {
      return Boolean(inner);
    }

    if (key === "Thing" && inner && typeof inner === "object") {
      const thing = inner as Record<string, unknown>;
      return {
        tb: String(thing.tb ?? ""),
        id: String(unwrapTaggedValue(thing.id) ?? ""),
      };
    }

    if (key === "Number" && inner && typeof inner === "object") {
      const numberObject = inner as Record<string, unknown>;
      if ("Int" in numberObject) {
        return Number(numberObject.Int);
      }
      if ("Float" in numberObject) {
        return Number(numberObject.Float);
      }
      if ("Decimal" in numberObject) {
        return Number(numberObject.Decimal);
      }
    }

    if (key === "Null" || key === "None") {
      return null;
    }
  }

  return Object.fromEntries(
    entries.map(([nestedKey, nestedValue]) => [
      nestedKey,
      unwrapTaggedValue(nestedValue),
    ]),
  );
};

const asStatementResults = (raw: unknown): unknown[] => {
  const normalized = unwrapTaggedValue(raw);
  return Array.isArray(normalized) ? normalized : [normalized];
};

const normalizeResult = <T>(raw: unknown): T => unwrapTaggedValue(raw) as T;

const sanitizeFunctionName = (name: string): string => {
  if (!/^[a-zA-Z0-9_:.]+$/.test(name)) {
    throw new Error(`Invalid function name: ${name}`);
  }

  return name;
};

const sanitizeParameterName = (name: string): string => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid parameter name: ${name}`);
  }

  return name;
};

const asRecordRef = (resource: RecordRef): string => resource;

export class Surreal {
  private readonly transport: RpcTransport;
  private currentNamespace?: string;
  private currentDatabase?: string;

  constructor(transport: RpcTransport = new TauriRpcTransport()) {
    this.transport = transport;
  }

  async connect(
    _endpoint?: string | URL,
    options?: {
      namespace?: string;
      database?: string;
      authentication?: SurrealAuthenticateToken | SurrealSigninParams;
    },
  ): Promise<true> {
    await this.transport.connect();

    if (options?.namespace && options?.database) {
      await this.use({
        namespace: options.namespace,
        database: options.database,
      });
    }

    if (options?.authentication) {
      if (typeof options.authentication === "string") {
        await this.authenticate(options.authentication);
      } else {
        await this.signin(options.authentication);
      }
    }

    return true;
  }

  async close(): Promise<true> {
    await this.transport.close();
    return true;
  }

  async health(): Promise<void> {
    const response = await this.transport.health();
    if (!response.ok) {
      throw new Error(response.message);
    }
  }

  async use(params: SurrealUseParams): Promise<void> {
    await this.transport.use(params);
    this.currentNamespace = params.namespace;
    this.currentDatabase = params.database;
  }

  async signup<T = unknown>(params: SurrealSignupParams): Promise<T> {
    return normalizeResult<T>(await this.transport.signup(params));
  }

  async signin<T = unknown>(params: SurrealSigninParams): Promise<T> {
    return normalizeResult<T>(await this.transport.signin(params));
  }

  async authenticate(token: SurrealAuthenticateToken): Promise<void> {
    await this.transport.authenticate(token);
  }

  async invalidate(): Promise<void> {
    await this.transport.invalidate();
  }

  async let(name: string, value: unknown): Promise<void> {
    const paramName = sanitizeParameterName(name);
    await this.transport.setParam(paramName, value);
  }

  async unset(name: string): Promise<void> {
    const paramName = sanitizeParameterName(name);
    await this.transport.unsetParam(paramName);
  }

  async info<T = unknown>(): Promise<T> {
    return normalizeResult<T>(await this.transport.info());
  }

  async version(): Promise<VersionInfo> {
    return this.transport.version();
  }

  async query<T extends unknown[] = unknown[]>(
    sql: string,
    vars?: QueryVariables,
  ): Promise<T> {
    const raw = await this.transport.query<unknown>(sql, vars);
    return asStatementResults(raw) as T;
  }

  async select<T = unknown>(resource: RecordRef): Promise<T> {
    return normalizeResult<T>(
      await this.transport.select(asRecordRef(resource)),
    );
  }

  async create<T = unknown>(
    resource: RecordRef,
    data?: QueryVariables,
  ): Promise<T> {
    return normalizeResult<T>(
      await this.transport.create(asRecordRef(resource), data),
    );
  }

  async insert<T = unknown>(resource: RecordRef, data: unknown): Promise<T> {
    return normalizeResult<T>(
      await this.transport.insert(asRecordRef(resource), data),
    );
  }

  async update<T = unknown>(
    resource: RecordRef,
    data?: QueryVariables,
  ): Promise<T> {
    return normalizeResult<T>(
      await this.transport.update(asRecordRef(resource), data),
    );
  }

  async upsert<T = unknown>(
    resource: RecordRef,
    data?: QueryVariables,
  ): Promise<T> {
    return normalizeResult<T>(
      await this.transport.upsert(asRecordRef(resource), data),
    );
  }

  async merge<T = unknown>(
    resource: RecordRef,
    data: QueryVariables,
  ): Promise<T> {
    return normalizeResult<T>(
      await this.transport.merge(asRecordRef(resource), data),
    );
  }

  async patch<T = unknown>(
    resource: RecordRef,
    diff: PatchOperation[],
  ): Promise<T> {
    return normalizeResult<T>(
      await this.transport.patch(asRecordRef(resource), diff),
    );
  }

  async delete<T = unknown>(resource: RecordRef): Promise<T> {
    return normalizeResult<T>(
      await this.transport.delete(asRecordRef(resource)),
    );
  }

  async relate<T = unknown>(
    from: RecordRef,
    relation: string,
    to: RecordRef,
    data?: QueryVariables,
  ): Promise<T> {
    return normalizeResult<T>(
      await this.transport.relate(
        asRecordRef(from),
        relation,
        asRecordRef(to),
        data,
      ),
    );
  }

  async run<T = unknown>(fnName: string, ...args: unknown[]): Promise<T> {
    const validName = sanitizeFunctionName(fnName);
    return normalizeResult<T>(await this.transport.run(validName, args));
  }

  get namespace(): string | undefined {
    return this.currentNamespace;
  }

  get database(): string | undefined {
    return this.currentDatabase;
  }

  async db(): Promise<{ namespace?: string; database?: string }> {
    return {
      namespace: this.currentNamespace,
      database: this.currentDatabase,
    };
  }

  async signinLegacy(params: SurrealSigninParams): Promise<void> {
    await this.signin(params);
  }
}
