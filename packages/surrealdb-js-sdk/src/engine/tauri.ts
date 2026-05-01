import { Channel, invoke } from "@tauri-apps/api/core";
import {
  ConnectionUnavailableError,
  UnexpectedServerResponseError,
} from "../errors";
import type { BoundQuery } from "../utils";
import { Features } from "../utils";
import { ChannelIterator } from "../utils/channel-iterator";
import { Publisher } from "../utils/publisher";
import type { LiveAction, LiveMessage } from "../types/live";
import type {
  ConnectionState,
  EngineEvents,
  QueryChunk,
  RpcQueryResult,
  RpcRequest,
  Session,
  SurrealEngine,
} from "../types";
import { Duration, RecordId, Uuid } from "../value";
import { RpcEngine } from "./rpc";

type DbQueryChunk = {
  index: number;
  executionTimeMs?: number | null;
  result?: unknown;
  error?: string | null;
};

type DbQueryResultEnvelope = {
  ok: boolean;
  chunks: DbQueryChunk[];
};

type DbLiveSubscriptionEvent =
  | { event: "started"; data: { streamId?: string; stream_id?: string } }
  | {
      event: "notification";
      data: {
        streamId?: string;
        stream_id?: string;
        queryId?: string;
        query_id?: string;
        action: string;
        data: unknown;
      };
    }
  | { event: "finished"; data: { streamId?: string; stream_id?: string } }
  | { event: "cancelled"; data: { streamId?: string; stream_id?: string } }
  | {
      event: "failed";
      data: { streamId?: string; stream_id?: string; error: string };
    };

const ROOT_SESSION_KEY = "__root__";

function invokeBridge<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return invoke<T>(command, args);
}

function asError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "object" && error !== null) {
    const maybe = error as { code?: unknown; message?: unknown };
    const code = typeof maybe.code === "string" ? maybe.code : null;
    const message =
      typeof maybe.message === "string" ? maybe.message : String(error);
    return new Error(code ? `${code}: ${message}` : message);
  }

  return new Error(String(error));
}

export async function getBucketFolderAllowlist(): Promise<string[]> {
  return invokeBridge<string[]>("db_bucket_folder_allowlist");
}

function sessionKey(session: Session): string {
  return session ? session.toString() : ROOT_SESSION_KEY;
}

function queryTypeFromSql(sql: string): "live" | "kill" | "other" {
  const normalized = sql.trim().toUpperCase();
  if (normalized.startsWith("LIVE ")) {
    return "live";
  }
  if (normalized.startsWith("KILL ")) {
    return "kill";
  }
  return "other";
}

function normalizeLiveSql(sql: string): string {
  // Some SDK-generated LIVE queries can quote table names as string literals.
  // Surreal expects a table identifier for LIVE SELECT FROM.
  return sql.replace(
    /(LIVE\s+SELECT\s+[\s\S]*?\s+FROM\s+)'([A-Za-z0-9_]+)'/i,
    "$1$2",
  );
}

function isSafeTableIdentifier(value: string): boolean {
  return /^[A-Za-z0-9_]+$/.test(value);
}

function extractLiveTableIdentifier(value: unknown): string | null {
  if (typeof value === "string" && isSafeTableIdentifier(value)) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const obj = value as Record<string, unknown>;
  const tableLike = [obj.tb, obj.table, obj.name].find(
    (entry) => typeof entry === "string",
  );
  if (typeof tableLike === "string" && isSafeTableIdentifier(tableLike)) {
    return tableLike;
  }

  return null;
}

function isSafeRecordIdentifier(value: string): boolean {
  return /^[A-Za-z0-9_]+:[A-Za-z0-9_\-]+$/.test(value);
}

function extractCreateTargetIdentifier(value: unknown): string | null {
  if (value && typeof value === "object") {
    const rendered =
      "toString" in (value as Record<string, unknown>)
        ? String((value as { toString: () => string }).toString())
        : null;
    if (rendered) {
      if (isSafeTableIdentifier(rendered) || isSafeRecordIdentifier(rendered)) {
        return rendered;
      }
    }
  }

  const normalized = normalizeSurrealValue(value);
  if (normalized !== value) {
    if (typeof normalized === "string") {
      if (
        isSafeTableIdentifier(normalized) ||
        isSafeRecordIdentifier(normalized)
      ) {
        return normalized;
      }
    }

    if (normalized && typeof normalized === "object") {
      const normalizedAsObject = normalized as Record<string, unknown>;
      if ("RecordId" in normalizedAsObject) {
        const nested = extractCreateTargetIdentifier(
          normalizedAsObject.RecordId,
        );
        if (nested) {
          return nested;
        }
      }
    }
  }

  if (typeof value === "string") {
    if (isSafeTableIdentifier(value) || isSafeRecordIdentifier(value)) {
      return value;
    }
    return null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const obj = value as Record<string, unknown>;
  const tableLike = [obj.tb, obj.table, obj.name].find(
    (entry) => typeof entry === "string",
  );

  if (typeof tableLike !== "string" || !isSafeTableIdentifier(tableLike)) {
    return null;
  }

  const keyLike = [obj.id, obj.key].find(
    (entry) => typeof entry === "string",
  ) as string | undefined;
  if (!keyLike) {
    const rawKey = obj.id ?? obj.key;
    const normalizedKey = normalizeSurrealValue(rawKey);
    if (typeof normalizedKey === "string") {
      if (isSafeRecordIdentifier(normalizedKey)) {
        return normalizedKey;
      }
      if (/^[A-Za-z0-9_\-]+$/.test(normalizedKey)) {
        return `${tableLike}:${normalizedKey}`;
      }
    }
    if (typeof normalizedKey === "number") {
      return `${tableLike}:${String(normalizedKey)}`;
    }
    return tableLike;
  }

  if (!/^[A-Za-z0-9_\-]+$/.test(keyLike)) {
    return null;
  }

  return `${tableLike}:${keyLike}`;
}

function materializeCreateUpsertSqlWithBindings(
  sql: string,
  bindings: Record<string, unknown> | undefined,
): { sql: string; bindings: Record<string, unknown> | undefined } {
  if (!bindings || Object.keys(bindings).length === 0) {
    return { sql, bindings };
  }

  const targetBindingMatch = sql.match(
    /^\s*(CREATE|UPSERT)\s+\$([A-Za-z0-9_]+)\b/i,
  );
  if (!targetBindingMatch) {
    return { sql, bindings };
  }

  const op = targetBindingMatch[1];
  const bindingKey = targetBindingMatch[2];
  const targetIdentifier = extractCreateTargetIdentifier(bindings[bindingKey]);
  if (!targetIdentifier) {
    return { sql, bindings };
  }

  const sqlWithTarget = sql.replace(
    new RegExp(`^\\s*${op}\\s+\\$${bindingKey}\\b`, "i"),
    `${op} ${targetIdentifier}`,
  );

  const nextBindings = { ...bindings };
  delete nextBindings[bindingKey];

  return {
    sql: sqlWithTarget,
    bindings: Object.keys(nextBindings).length > 0 ? nextBindings : undefined,
  };
}

function materializeBoundIdentifierSqlWithBindings(
  sql: string,
  bindings: Record<string, unknown> | undefined,
): { sql: string; bindings: Record<string, unknown> | undefined } {
  if (!bindings || Object.keys(bindings).length === 0) {
    return { sql, bindings };
  }

  let nextSql = sql;
  const nextBindings = { ...bindings };

  const replaceSingleBinding = (
    regex: RegExp,
    replacer: (resolvedIdentifier: string, bindingKey: string) => string,
  ) => {
    const match = nextSql.match(regex);
    if (!match) {
      return;
    }

    const bindingKey = match[1];
    const resolvedIdentifier = extractCreateTargetIdentifier(
      nextBindings[bindingKey],
    );
    if (!resolvedIdentifier) {
      return;
    }

    nextSql = nextSql.replace(regex, replacer(resolvedIdentifier, bindingKey));
    delete nextBindings[bindingKey];
  };

  replaceSingleBinding(
    /\bFROM\s+ONLY\s+\$([A-Za-z0-9_]+)\b/i,
    (resolvedIdentifier) => `FROM ONLY ${resolvedIdentifier}`,
  );
  replaceSingleBinding(
    /^\s*UPDATE\s+\$([A-Za-z0-9_]+)\b/i,
    (resolvedIdentifier) => `UPDATE ${resolvedIdentifier}`,
  );
  replaceSingleBinding(
    /^\s*UPDATE\s+ONLY\s+\$([A-Za-z0-9_]+)\b/i,
    (resolvedIdentifier) => `UPDATE ONLY ${resolvedIdentifier}`,
  );
  replaceSingleBinding(
    /^\s*DELETE\s+\$([A-Za-z0-9_]+)\b/i,
    (resolvedIdentifier) => `DELETE ${resolvedIdentifier}`,
  );
  replaceSingleBinding(
    /^\s*DELETE\s+ONLY\s+\$([A-Za-z0-9_]+)\b/i,
    (resolvedIdentifier) => `DELETE ONLY ${resolvedIdentifier}`,
  );

  const relateMatch = nextSql.match(
    /^\s*RELATE\s+(ONLY\s+)?\$([A-Za-z0-9_]+)->\$([A-Za-z0-9_]+)->\$([A-Za-z0-9_]+)\b/i,
  );
  if (relateMatch) {
    const onlyPrefix = relateMatch[1] ?? "";
    const fromKey = relateMatch[2];
    const edgeKey = relateMatch[3];
    const toKey = relateMatch[4];

    const fromIdentifier = extractCreateTargetIdentifier(nextBindings[fromKey]);
    const edgeIdentifier = extractCreateTargetIdentifier(nextBindings[edgeKey]);
    const toIdentifier = extractCreateTargetIdentifier(nextBindings[toKey]);

    if (fromIdentifier && edgeIdentifier && toIdentifier) {
      nextSql = nextSql.replace(
        /^\s*RELATE\s+(ONLY\s+)?\$([A-Za-z0-9_]+)->\$([A-Za-z0-9_]+)->\$([A-Za-z0-9_]+)\b/i,
        `RELATE ${onlyPrefix}${fromIdentifier}->${edgeIdentifier}->${toIdentifier}`,
      );
      delete nextBindings[fromKey];
      delete nextBindings[edgeKey];
      delete nextBindings[toKey];
    }
  }

  return {
    sql: nextSql,
    bindings: Object.keys(nextBindings).length > 0 ? nextBindings : undefined,
  };
}

function materializeLiveSqlWithBindings(
  sql: string,
  bindings: Record<string, unknown> | undefined,
): { sql: string; bindings: Record<string, unknown> | undefined } {
  const normalizedSql = normalizeLiveSql(sql);
  if (!bindings || Object.keys(bindings).length === 0) {
    return { sql: normalizedSql, bindings };
  }

  const fromBindingMatch = normalizedSql.match(/\bFROM\s+\$([A-Za-z0-9_]+)/i);
  if (!fromBindingMatch) {
    return { sql: normalizedSql, bindings };
  }

  const bindingKey = fromBindingMatch[1];
  const bindingValue = bindings[bindingKey];
  const tableIdentifier = extractLiveTableIdentifier(bindingValue);
  if (!tableIdentifier) {
    return { sql: normalizedSql, bindings };
  }

  const sqlWithTable = normalizedSql.replace(
    new RegExp(`\\bFROM\\s+\\$${bindingKey}\\b`, "i"),
    `FROM ${tableIdentifier}`,
  );

  const nextBindings = { ...bindings };
  delete nextBindings[bindingKey];

  return {
    sql: sqlWithTable,
    bindings: Object.keys(nextBindings).length > 0 ? nextBindings : undefined,
  };
}

function compactSql(sql: string): string {
  const normalized = sql.replace(/\s+/g, " ").trim();
  return normalized.length > 220
    ? `${normalized.slice(0, 220)}...`
    : normalized;
}

function liveStreamIdFromEvent(event: DbLiveSubscriptionEvent): string {
  return event.data.streamId ?? event.data.stream_id ?? "unknown";
}

function liveQueryIdFromEvent(
  event: Extract<DbLiveSubscriptionEvent, { event: "notification" }>,
): string {
  return event.data.queryId ?? event.data.query_id ?? "unknown";
}

function isTauriDebugEnabled(): boolean {
  const globalFlag = (globalThis as { __SURREAL_TAURI_DEBUG?: unknown })
    .__SURREAL_TAURI_DEBUG;
  if (globalFlag === true) {
    return true;
  }

  try {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem("surreal.tauri.debug") === "1";
    }
  } catch {
    // Ignore storage access errors.
  }

  return false;
}

function tauriDebug(scope: string, message: string, details?: unknown): void {
  if (!isTauriDebugEnabled()) {
    return;
  }

  if (details === undefined) {
    console.debug(`[surreal-tauri][${scope}] ${message}`);
    return;
  }

  console.debug(`[surreal-tauri][${scope}] ${message}`, details);
}

function normalizeSurrealValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeSurrealValue(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);

  if (keys.length === 1) {
    const key = keys[0];
    const inner = obj[key];

    if (key === "String" || key === "Bool" || key === "Null") {
      return inner;
    }

    if (key === "None") {
      return null;
    }

    if (key === "Number") {
      return normalizeSurrealValue(inner);
    }

    if (key === "Int" || key === "Float" || key === "Decimal") {
      const numeric = Number(inner);
      return Number.isNaN(numeric) ? inner : numeric;
    }

    if (key === "Array" && Array.isArray(inner)) {
      return inner.map((item) => normalizeSurrealValue(item));
    }

    if (key === "Object" && inner && typeof inner === "object") {
      const mapped: Record<string, unknown> = {};
      for (const [childKey, childValue] of Object.entries(
        inner as Record<string, unknown>,
      )) {
        mapped[childKey] = normalizeSurrealValue(childValue);
      }
      return mapped;
    }

    if (key === "RecordId" && inner && typeof inner === "object") {
      const record = inner as Record<string, unknown>;
      const table = typeof record.table === "string" ? record.table : "unknown";
      const keyPart = normalizeSurrealValue(record.key);
      return `${table}:${String(keyPart)}`;
    }

    if (key === "Uuid" && typeof inner === "string") {
      return inner;
    }
  }

  const mapped: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(obj)) {
    mapped[childKey] = normalizeSurrealValue(childValue);
  }
  return mapped;
}

function parseRecordId(input: unknown): RecordId {
  if (typeof input === "string" && input.includes(":")) {
    const [table, ...rest] = input.split(":");
    const key = rest.join(":");
    if (table && key) {
      return new RecordId(table, key);
    }
  }

  return new RecordId("unknown", "unknown");
}

function parseLiveAction(input: string): LiveAction {
  const upper = input.toUpperCase();
  if (
    upper === "CREATE" ||
    upper === "UPDATE" ||
    upper === "DELETE" ||
    upper === "KILLED"
  ) {
    return upper;
  }
  return "UPDATE";
}

export class TauriEngine extends RpcEngine implements SurrealEngine {
  #publisher = new Publisher<EngineEvents>();
  #sessionMap = new Map<string, string>();
  #liveChannels = new Map<string, ChannelIterator<LiveMessage>>();
  #liveEventChannels = new Map<string, Channel<DbLiveSubscriptionEvent>>();
  #liveStreamByQuery = new Map<string, string>();
  #active = false;

  features = new Set([
    Features.LiveQueries,
    Features.Sessions,
    Features.Transactions,
    Features.Api,
  ]);

  subscribe<K extends keyof EngineEvents>(
    event: K,
    listener: (...payload: EngineEvents[K]) => void,
  ): () => void {
    return this.#publisher.subscribe(event, listener);
  }

  open(state: ConnectionState): void {
    this._state = state;
    this.#active = false;
    this.#sessionMap.clear();
    this.#liveChannels.clear();
    this.#liveEventChannels.clear();
    this.#liveStreamByQuery.clear();

    tauriDebug("open", "engine open requested", {
      namespace: state.rootSession.namespace,
      database: state.rootSession.database,
    });

    void (async () => {
      try {
        const rootSessionId = await invokeBridge<string>("db_new_session");
        this.#sessionMap.set(ROOT_SESSION_KEY, rootSessionId);
        tauriDebug("open", "root session allocated", { rootSessionId });

        const { namespace, database } = state.rootSession;
        if (namespace !== undefined || database !== undefined) {
          await invokeBridge("db_use_session", {
            sessionId: rootSessionId,
            namespace: namespace ?? null,
            database: database ?? null,
          });
          tauriDebug("open", "root session namespace/database set", {
            namespace: namespace ?? null,
            database: database ?? null,
          });
        }

        this.#active = true;
        tauriDebug("open", "engine connected");
        this.#publisher.publish("connected");
      } catch (error) {
        tauriDebug("open", "engine failed to connect", {
          error: asError(error).message,
        });
        this.#publisher.publish("error", asError(error));
        this._state = undefined;
        this.#active = false;
        this.#publisher.publish("disconnected");
      }
    })();
  }

  async close(): Promise<void> {
    this.#active = false;
    tauriDebug("close", "engine close requested", {
      liveStreamCount: this.#liveStreamByQuery.size,
    });

    try {
      for (const [queryId, streamId] of this.#liveStreamByQuery.entries()) {
        try {
          await invokeBridge("db_live_unsubscribe", { streamId });
          tauriDebug("close", "live stream unsubscribed during close", {
            queryId,
            streamId,
          });
        } catch {
          // Ignore cleanup failures on close.
          tauriDebug("close", "live stream unsubscribe failed during close", {
            queryId,
            streamId,
          });
        }

        const channel = this.#liveChannels.get(queryId);
        channel?.cancel();
        this.#liveEventChannels.delete(queryId);
      }

      const backendSessionIds = new Set(this.#sessionMap.values());
      for (const sessionId of backendSessionIds) {
        try {
          await invokeBridge("db_drop_session", { sessionId });
        } catch {
          // Ignore cleanup failures on close.
        }
      }
    } finally {
      this.#sessionMap.clear();
      this.#liveChannels.clear();
      this.#liveEventChannels.clear();
      this.#liveStreamByQuery.clear();
      this._state = undefined;
      tauriDebug("close", "engine disconnected");
      this.#publisher.publish("disconnected");
    }
  }

  ready(): void {
    // No-op for Tauri invoke/channel transport.
  }

  override async sessions(): Promise<Uuid[]> {
    return Array.from(this.#sessionMap.keys())
      .filter((key) => key !== ROOT_SESSION_KEY)
      .map((key) => new Uuid(key));
  }

  override async attach(session: Uuid): Promise<void> {
    if (!this.#active) {
      throw new ConnectionUnavailableError();
    }

    const key = session.toString();
    if (this.#sessionMap.has(key)) {
      tauriDebug("session", "attach skipped, session already mapped", {
        session: key,
      });
      return;
    }

    const backendSessionId = await invokeBridge<string>("db_new_session");
    this.#sessionMap.set(key, backendSessionId);
    tauriDebug("session", "session attached", {
      session: key,
      backendSessionId,
    });
  }

  override async detach(session: Uuid): Promise<void> {
    const key = session.toString();
    const backendSessionId = this.#sessionMap.get(key);
    if (!backendSessionId) {
      return;
    }

    await invokeBridge("db_drop_session", { sessionId: backendSessionId });
    this.#sessionMap.delete(key);
    tauriDebug("session", "session detached", {
      session: key,
      backendSessionId,
    });
  }

  override async use(
    what: { namespace?: string | null; database?: string | null },
    session: Session,
  ) {
    const backendSessionId = await this.#backendSession(session);

    if (what.namespace === undefined && what.database === undefined) {
      return {};
    }

    await invokeBridge("db_use_session", {
      sessionId: backendSessionId,
      namespace: what.namespace ?? null,
      database: what.database ?? null,
    });
    tauriDebug("session", "session namespace/database updated", {
      session: session ? session.toString() : ROOT_SESSION_KEY,
      backendSessionId,
      namespace: what.namespace ?? null,
      database: what.database ?? null,
    });

    return {
      namespace: what.namespace ?? undefined,
      database: what.database ?? undefined,
    };
  }

  override async reset(session: Session): Promise<void> {
    const backendSessionId = await this.#backendSession(session);
    await invokeBridge("db_use_session", {
      sessionId: backendSessionId,
      namespace: null,
      database: null,
    });
    tauriDebug("session", "session reset", {
      session: session ? session.toString() : ROOT_SESSION_KEY,
      backendSessionId,
    });
  }

  override async set(name: string, value: unknown, session: Session): Promise<void> {
    const backendSessionId = await this.#backendSession(session);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new UnexpectedServerResponseError(`Invalid variable name: ${name}`);
    }

    await invokeBridge("db_set_session_var", {
      sessionId: backendSessionId,
      name,
      value,
    });

    tauriDebug("session", "session variable set", {
      session: session ? session.toString() : ROOT_SESSION_KEY,
      backendSessionId,
      variable: name,
    });
  }

  override async unset(name: string, session: Session): Promise<void> {
    const backendSessionId = await this.#backendSession(session);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new UnexpectedServerResponseError(`Invalid variable name: ${name}`);
    }

    await invokeBridge("db_unset_session_var", {
      sessionId: backendSessionId,
      name,
    });

    tauriDebug("session", "session variable unset", {
      session: session ? session.toString() : ROOT_SESSION_KEY,
      backendSessionId,
      variable: name,
    });
  }

  override async invalidate(session: Session): Promise<void> {
    tauriDebug("session", "invalidate requested", {
      session: session ? session.toString() : ROOT_SESSION_KEY,
    });
    // Current bridge surface does not implement auth-token invalidation yet.
  }

  override async begin(session: Session): Promise<Uuid> {
    const backendSessionId = await this.#backendSession(session);
    const txId = await invokeBridge<string>("db_begin_transaction", {
      sessionId: backendSessionId,
    });
    tauriDebug("tx", "transaction begun", {
      session: session ? session.toString() : ROOT_SESSION_KEY,
      backendSessionId,
      transactionId: txId,
    });
    return new Uuid(txId);
  }

  override async commit(txn: Uuid, session: Session): Promise<void> {
    const backendSessionId = await this.#backendSession(session);
    tauriDebug("tx", "transaction commit requested", {
      transactionId: txn.toString(),
      backendSessionId,
    });
    await invokeBridge("db_commit_transaction", {
      sessionId: backendSessionId,
      transactionId: txn.toString(),
    });
  }

  override async cancel(txn: Uuid, session: Session): Promise<void> {
    const backendSessionId = await this.#backendSession(session);
    tauriDebug("tx", "transaction cancel requested", {
      transactionId: txn.toString(),
      backendSessionId,
    });
    await invokeBridge("db_cancel_transaction", {
      sessionId: backendSessionId,
      transactionId: txn.toString(),
    });
  }

  override async *query<T>(
    query: BoundQuery,
    session: Session,
    txn?: Uuid,
  ): AsyncIterable<QueryChunk<T>> {
    const queryType = queryTypeFromSql(query.query);
    tauriDebug("query", "dispatch", {
      type: queryType,
      session: session ? session.toString() : ROOT_SESSION_KEY,
      transaction: txn?.toString() ?? null,
      sql: compactSql(query.query),
      hasBindings: Boolean(
        query.bindings && Object.keys(query.bindings).length,
      ),
    });

    if (queryType === "live") {
      const fakeQueryId = Uuid.v7();
      const queryIdKey = fakeQueryId.toString();
      tauriDebug("live", "creating managed live subscription", {
        queryId: queryIdKey,
      });
      const channel = new ChannelIterator<LiveMessage>(() => {
        const streamId = this.#liveStreamByQuery.get(queryIdKey);
        if (!streamId) {
          return;
        }

        void invokeBridge("db_live_unsubscribe", { streamId }).catch(() => {
          // The stream may already be stopped on the backend.
          tauriDebug("live", "unsubscribe during iterator cleanup failed", {
            queryId: queryIdKey,
            streamId,
          });
        });
        tauriDebug("live", "iterator cleanup unsubscribe requested", {
          queryId: queryIdKey,
          streamId,
        });
        this.#liveStreamByQuery.delete(queryIdKey);
        this.#liveChannels.delete(queryIdKey);
        this.#liveEventChannels.delete(queryIdKey);
      });

      const onEvent = new Channel<DbLiveSubscriptionEvent>();
      onEvent.onmessage = (message) => {
        tauriDebug("live:event", "incoming event", {
          queryId: queryIdKey,
          event: message.event,
          streamId: liveStreamIdFromEvent(message),
        });

        if (message.event === "started") {
          return;
        }

        if (message.event === "notification") {
          const payload = normalizeSurrealValue(message.data.data);
          const recordRaw =
            payload && typeof payload === "object" && "id" in payload
              ? (payload as Record<string, unknown>).id
              : undefined;

          tauriDebug("live:event", "notification mapped", {
            queryId: queryIdKey,
            streamId: liveStreamIdFromEvent(message),
            backendQueryId: liveQueryIdFromEvent(message),
            action: message.data.action,
            recordId: typeof recordRaw === "string" ? recordRaw : null,
          });

          channel.submit({
            queryId: fakeQueryId,
            action: parseLiveAction(message.data.action),
            recordId: parseRecordId(recordRaw),
            value: (payload as Record<string, unknown>) ?? {},
          });
          return;
        }

        if (message.event === "cancelled" || message.event === "finished") {
          tauriDebug("live:event", "stream closed", {
            queryId: queryIdKey,
            streamId: liveStreamIdFromEvent(message),
            event: message.event,
          });
          channel.cancel();
          this.#liveChannels.delete(queryIdKey);
          this.#liveStreamByQuery.delete(queryIdKey);
          this.#liveEventChannels.delete(queryIdKey);
          return;
        }

        if (message.event === "failed") {
          const errorMessage =
            typeof message.data.error === "string"
              ? message.data.error
              : String(message.data.error);
          tauriDebug("live:event", "stream failed", {
            queryId: queryIdKey,
            streamId: liveStreamIdFromEvent(message),
            error: errorMessage,
          });
          this.#publisher.publish("error", new Error(errorMessage));
          channel.cancel();
          this.#liveChannels.delete(queryIdKey);
          this.#liveStreamByQuery.delete(queryIdKey);
          this.#liveEventChannels.delete(queryIdKey);
        }
      };

      const backendSessionId = await this.#backendSession(session);
      const { sql: liveSql, bindings: liveBindings } =
        materializeLiveSqlWithBindings(query.query, query.bindings);
      if (liveSql !== query.query) {
        tauriDebug("live", "normalized live sql", {
          queryId: queryIdKey,
          before: compactSql(query.query),
          after: compactSql(liveSql),
        });
      }
      const streamId = await invokeBridge<string>("db_live_subscribe", {
        sql: liveSql,
        vars: liveBindings ?? null,
        sessionId: backendSessionId,
        onEvent,
      });

      tauriDebug("live", "live stream subscribed", {
        queryId: queryIdKey,
        streamId,
        backendSessionId,
      });

      this.#liveChannels.set(queryIdKey, channel);
      this.#liveEventChannels.set(queryIdKey, onEvent);
      this.#liveStreamByQuery.set(queryIdKey, streamId);

      yield {
        query: 0,
        batch: 0,
        kind: "single",
        type: "live",
        result: [fakeQueryId as unknown as T],
        stats: {
          recordsReceived: 1,
          bytesReceived: -1,
          recordsScanned: -1,
          bytesScanned: -1,
          duration: new Duration("0ms"),
        },
      };

      return;
    }

    if (queryType === "kill") {
      const maybeId = query.query.trim().split(/\s+/).at(1)?.replace(/;$/, "");
      if (maybeId) {
        const streamId = this.#liveStreamByQuery.get(maybeId);
        if (streamId) {
          tauriDebug("live", "kill requested", {
            queryId: maybeId,
            streamId,
          });
          await invokeBridge("db_live_unsubscribe", { streamId });
          this.#liveStreamByQuery.delete(maybeId);
          this.#liveChannels.get(maybeId)?.cancel();
          this.#liveChannels.delete(maybeId);
          this.#liveEventChannels.delete(maybeId);
        }
      }

      yield {
        query: 0,
        batch: 0,
        kind: "single",
        type: "kill",
        result: [],
        stats: {
          recordsReceived: 0,
          bytesReceived: -1,
          recordsScanned: -1,
          bytesScanned: -1,
          duration: new Duration("0ms"),
        },
      };

      return;
    }

    const backendSessionId = await this.#backendSession(session);
    const createUpsertMaterialized = materializeCreateUpsertSqlWithBindings(
      query.query,
      query.bindings ?? undefined,
    );
    const materialized = materializeBoundIdentifierSqlWithBindings(
      createUpsertMaterialized.sql,
      createUpsertMaterialized.bindings,
    );
    const response = await invokeBridge<DbQueryResultEnvelope>("db_query", {
      sql: materialized.sql,
      vars: materialized.bindings ?? null,
      sessionId: backendSessionId,
      transactionId: txn?.toString() ?? null,
    });
    tauriDebug("query", "db_query response received", {
      chunkCount: response.chunks?.length ?? 0,
      session: session ? session.toString() : ROOT_SESSION_KEY,
      backendSessionId,
      transaction: txn?.toString() ?? null,
      sql: compactSql(materialized.sql),
    });

    for (const chunk of response.chunks ?? []) {
      const durationMs = Math.max(0, Number(chunk.executionTimeMs ?? 0));
      const resultValue = normalizeSurrealValue(chunk.result);

      if (chunk.error) {
        tauriDebug("query", "chunk error", {
          index: chunk.index,
          error: chunk.error,
        });
        yield {
          query: chunk.index,
          batch: 0,
          kind: "single",
          error: new Error(chunk.error) as never,
          stats: {
            recordsReceived: -1,
            bytesReceived: -1,
            recordsScanned: -1,
            bytesScanned: -1,
            duration: new Duration(`${durationMs}ms`),
          },
        };
        continue;
      }

      yield {
        query: chunk.index,
        batch: 0,
        kind: "single",
        type: "other",
        result: resultValue === undefined ? [] : ([resultValue] as T[]),
        stats: {
          recordsReceived: Array.isArray(resultValue) ? resultValue.length : 1,
          bytesReceived: -1,
          recordsScanned: -1,
          bytesScanned: -1,
          duration: new Duration(`${durationMs}ms`),
        },
      };
    }
  }

  override liveQuery(id: Uuid): AsyncIterable<LiveMessage> {
    const channel = this.#liveChannels.get(id.toString());
    if (!channel) {
      throw new UnexpectedServerResponseError(
        `No live channel found for id ${id.toString()}`,
      );
    }
    return channel;
  }

  override async send<
    Method extends string,
    Params extends unknown[] | undefined,
    Result,
  >(request: RpcRequest<Method, Params>): Promise<Result> {
    switch (request.method) {
      case "health":
        await invokeBridge("db_health");
        return undefined as Result;
      case "version":
        return (await invokeBridge<string>("db_version")) as Result;
      default:
        throw new UnexpectedServerResponseError(
          `Method ${String(request.method)} is not supported by the tauri engine send() path`,
        );
    }
  }

  async #backendSession(session: Session): Promise<string> {
    if (!this.#active) {
      throw new ConnectionUnavailableError();
    }

    const key = sessionKey(session);
    const existing = this.#sessionMap.get(key);
    if (existing) {
      tauriDebug("session", "resolved existing backend session", {
        session: key,
        backendSessionId: existing,
      });
      return existing;
    }

    if (session) {
      await this.attach(session);
      const created = this.#sessionMap.get(key);
      if (created) {
        tauriDebug("session", "resolved newly attached backend session", {
          session: key,
          backendSessionId: created,
        });
        return created;
      }
    }

    throw new ConnectionUnavailableError();
  }
}
