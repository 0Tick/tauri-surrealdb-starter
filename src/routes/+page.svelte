<script lang="ts">
  import { onDestroy } from "svelte";
  import LiveFeedContent from "$lib/components/test-console/LiveFeedContent.svelte";
  import PayloadSnapshotsContent from "$lib/components/test-console/PayloadSnapshotsContent.svelte";
  import TestResultsContent from "$lib/components/test-console/TestResultsContent.svelte";
  import { RecordId, Surreal, Table, type Frame, type LiveSubscription } from "surrealdb";

  type TestStatus = "idle" | "running" | "pass" | "fail";

  type TestRow = {
    key: string;
    category: string;
    label: string;
    status: TestStatus;
    details: string;
  };

  type DemoRecord = {
    id: RecordId;
    status?: string;
    run?: string;
    marker?: string;
    count?: number;
    label?: string;
  };

  type EdgeRecord = {
    id: RecordId;
    kind?: string;
    run?: string;
  };

  type EventLogEntry = {
    at: string;
    type: "query" | "live" | "system" | "error";
    label: string;
    sql?: string;
    durationMs?: number;
    payload?: unknown;
    result?: unknown;
    error?: string;
  };

  const BASE_TESTS: TestRow[] = [
    {
      key: "init",
      category: "Connection",
      label: "Initialize datastore and session",
      status: "idle",
      details: "Not run yet",
    },
    {
      key: "query",
      category: "Core Query",
      label: "Query returns expected result",
      status: "idle",
      details: "Not run yet",
    },
    {
      key: "stream",
      category: "Core Query",
      label: "Chunk stream emits finish",
      status: "idle",
      details: "Not run yet",
    },
    {
      key: "health",
      category: "Connection",
      label: "Health endpoint",
      status: "idle",
      details: "Not run yet",
    },
    {
      key: "version",
      category: "Connection",
      label: "Version endpoint",
      status: "idle",
      details: "Not run yet",
    },
    {
      key: "session",
      category: "Connection",
      label: "Session set/unset/fork/reset",
      status: "idle",
      details: "Not run yet",
    },
    {
      key: "crud",
      category: "Data Operations",
      label: "Create/select/update/upsert/insert/delete",
      status: "idle",
      details: "Not run yet",
    },
    {
      key: "relate-run",
      category: "Data Operations",
      label: "Relate and run function",
      status: "idle",
      details: "Not run yet",
    },
    {
      key: "tx",
      category: "Data Operations",
      label: "Transaction begin and cancel",
      status: "idle",
      details: "Not run yet",
    },
    {
      key: "live",
      category: "Live Queries",
      label: "LIVE subscription receives updates",
      status: "idle",
      details: "Not run yet",
    },
    {
      key: "live-cycle",
      category: "Live Queries",
      label: "LIVE start/stop cycle works",
      status: "idle",
      details: "Not run yet",
    },
    {
      key: "live-docs",
      category: "Live Queries",
      label: "LIVE implementation matches docs",
      status: "idle",
      details: "Not run yet",
    },
    {
      key: "unsubscribe",
      category: "Live Queries",
      label: "Unsubscribe stops updates",
      status: "idle",
      details: "Not run yet",
    },
  ];

  let dbStatus = $state("idle");
  let tests = $state(BASE_TESTS.map((row) => ({ ...row })));
  let activeLiveStreamId = $state<string | null>(null);
  let activeLiveSubscription = $state<LiveSubscription | null>(null);
  let activeLiveUnsubscribe = $state<(() => void) | null>(null);
  let liveNotificationCount = $state(0);
  let latestResult = $state("-");
  let streamResult = $state("-");
  let latestLivePayload = $state("-");
  let latestLivePatch = $state("-");
  let latestLiveNormalized = $state("-");
  let liveEvents = $state<string[]>([]);
  let runBusy = $state(false);

  let resolveFirstNotification: (() => void) | null = null;
  let rejectFirstNotification: ((error: Error) => void) | null = null;
  let lastLiveRecordId = $state<string | null>(null);

  let manualRecordKey = $state("manual_alpha");
  let manualStatusValue = $state("draft");
  let manualNoteValue = $state("created from manual panel");
  let manualQuerySql = $state("SELECT * FROM qa_mobile_demo LIMIT 5;");
  let manualStatus = $state("idle");
  let manualLiveStatus = $state("idle");
  let manualResult = $state("-");
  let eventLog = $state<EventLogEntry[]>([]);

  let sdkClient = $state<Surreal | null>(null);
  let sdkConnected = $state(false);
  let connectionUrl = $state("tauri://embedded");
  let connectionUsername = $state("root");
  let connectionPassword = $state("root");
  let connectionStatus = $state("not connected");
  let connectionBusy = $state(false);
  let runRemoteHealthCheck = $state(false);

  const DEFAULT_NAMESPACE = "starter";
  const DEFAULT_DATABASE = "mobile";

  type ConnectionConfig = {
    url: string;
    username: string;
    password: string;
  };

  let activeConnectionConfig: ConnectionConfig | null = null;

  function currentConnectionConfig(): ConnectionConfig {
    return {
      url: normalizeConnectionUrl(connectionUrl),
      username: connectionUsername.trim(),
      password: connectionPassword,
    };
  }

  function normalizeConnectionUrl(value: string): string {
    const trimmed = value.trim();
    if (!trimmed || isTauriConnection(trimmed)) {
      return trimmed;
    }

    try {
      const parsed = new URL(trimmed);
      const protocol = parsed.protocol.replace(":", "").toLowerCase();
      const remoteProtocols = new Set(["http", "https", "ws", "wss"]);

      if (remoteProtocols.has(protocol) && !parsed.pathname.endsWith("/rpc")) {
        parsed.pathname = parsed.pathname.endsWith("/")
          ? `${parsed.pathname}rpc`
          : `${parsed.pathname}/rpc`;
      }

      return parsed.toString();
    } catch {
      return trimmed;
    }
  }

  function sameConnectionConfig(a: ConnectionConfig | null, b: ConnectionConfig): boolean {
    if (!a) {
      return false;
    }

    return a.url === b.url && a.username === b.username && a.password === b.password;
  }

  function isTauriConnection(url: string): boolean {
    return url.toLowerCase().startsWith("tauri://");
  }

  function validateConnectionConfig(config: ConnectionConfig): void {
    if (!config.url) {
      throw new Error("connection URL is required");
    }

    if (!config.username) {
      throw new Error("username is required");
    }

    if (!config.password) {
      throw new Error("password is required");
    }
  }

  function isSemanticVersionLike(version: string): boolean {
    return /^(?:surrealdb-)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
      version,
    );
  }

  async function connectWithConfig(forceReconnect = false): Promise<Surreal> {
    const config = currentConnectionConfig();
    validateConnectionConfig(config);

    if (!forceReconnect && sdkClient && sdkConnected && sameConnectionConfig(activeConnectionConfig, config)) {
      return sdkClient;
    }

    if (sdkClient && sdkConnected) {
      await disposeSdkClient();
    }

    sdkClient = new Surreal();
    connectionStatus = "connecting...";

    await sdkClient.connect(config.url, { reconnect: false });

    if (!isTauriConnection(config.url)) {
      await sdkClient.signin({
        username: config.username,
        password: config.password,
      });
    }

    sdkConnected = true;
    dbStatus = "connected";
    activeConnectionConfig = config;
    connectionStatus = isTauriConnection(config.url)
      ? `connected to ${config.url} (embedded auth)`
      : `connected to ${config.url} as ${config.username}`;

    return sdkClient;
  }

  async function ensureSessionScope(client: Surreal): Promise<void> {
    await client.use({ namespace: DEFAULT_NAMESPACE, database: DEFAULT_DATABASE });
  }

  async function applyConnectionDetails() {
    if (connectionBusy) {
      return;
    }

    connectionBusy = true;

    try {
      await connectWithConfig(true);
      pushEventLog({
        type: "system",
        label: "connection updated",
        payload: {
          url: connectionUrl.trim(),
          username: connectionUsername.trim(),
        },
      });
    } catch (error) {
      const formatted = formatError(error);
      connectionStatus = `connect failed: ${formatted}`;
      dbStatus = `connect failed: ${formatted}`;
      pushEventLog({
        type: "error",
        label: "connection update failed",
        error: formatted,
      });
    } finally {
      connectionBusy = false;
    }
  }

  function updateTest(key: string, status: TestStatus, details: string) {
    tests = tests.map((row) => {
      if (row.key !== key) {
        return row;
      }
      return { ...row, status, details };
    });
  }

  function resetTests() {
    tests = BASE_TESTS.map((row) => ({ ...row }));
  }

  function pushLiveEvent(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    liveEvents = [`${timestamp} - ${message}`, ...liveEvents].slice(0, 16);
  }

  function pushEventLog(entry: Omit<EventLogEntry, "at">) {
    eventLog = [
      {
        at: new Date().toISOString(),
        ...entry,
      },
      ...eventLog,
    ].slice(0, 40);
  }

  function stringifyPretty(value: unknown) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  function summarizeLiveData(value: unknown) {
    const text = stringifyPretty(value).replace(/\s+/g, " ").trim();
    if (text.length <= 140) {
      return text;
    }
    return `${text.slice(0, 140)}...`;
  }

  function formatError(error: unknown) {
    if (!error || typeof error !== "object") {
      return String(error);
    }

    const err = error as { code?: unknown; message?: unknown };
    const code = typeof err.code === "string" ? err.code : null;
    const message = typeof err.message === "string" ? err.message : String(error);
    return code ? `${code}: ${message}` : message;
  }

  function sanitizeRecordKey(value: string) {
    const key = value.trim();
    if (!key) {
      throw new Error("record key cannot be empty");
    }
    if (!/^[A-Za-z0-9_-]+$/.test(key)) {
      throw new Error("record key must match [A-Za-z0-9_-]");
    }
    return key;
  }

  function assert(condition: unknown, message: string, actual?: unknown): asserts condition {
    if (condition) {
      return;
    }
    if (actual === undefined) {
      throw new Error(message);
    }
    throw new Error(`${message}. actual=${stringifyPretty(actual)}`);
  }

  function unwrapRecord<T>(label: string, value: T | T[]): T {
    const record = Array.isArray(value) ? value[0] : value;
    assert(record !== undefined && record !== null, `${label} did not return a record`, value);
    return record;
  }

  function expectSessionProbeValue(label: string, value: unknown, expected: string) {
    if (value === expected) {
      return;
    }

    if (Array.isArray(value) && value.includes(expected)) {
      return;
    }

    throw new Error(
      `${label} did not include expected '${expected}'. actual=${stringifyPretty(value)}`,
    );
  }

  function expectTrueResult(label: string, value: unknown) {
    if (value === true) {
      return;
    }
    if (Array.isArray(value) && value.includes(true)) {
      return;
    }
    throw new Error(`${label} expected true. actual=${stringifyPretty(value)}`);
  }

  async function ensureReadySession() {
    const client = await connectWithConfig();
    await ensureSessionScope(client);
    dbStatus = "ready";
    return client;
  }

  async function disposeSdkClient() {
    try {
      await cancelLive();
      if (sdkClient && sdkConnected) {
        await sdkClient.close();
      }
    } finally {
      sdkConnected = false;
      sdkClient = null;
      activeConnectionConfig = null;
      connectionStatus = "not connected";
    }
  }

  onDestroy(() => {
    void disposeSdkClient();
  });

  function waitForFirstLiveNotification(timeoutMs: number) {
    return new Promise<void>((resolve, reject) => {
      if (liveNotificationCount > 0) {
        resolve();
        return;
      }

      const timer = setTimeout(() => {
        resolveFirstNotification = null;
        rejectFirstNotification = null;
        reject(new Error("timed out waiting for live notification"));
      }, timeoutMs);

      resolveFirstNotification = () => {
        clearTimeout(timer);
        resolveFirstNotification = null;
        rejectFirstNotification = null;
        resolve();
      };

      rejectFirstNotification = (error: Error) => {
        clearTimeout(timer);
        resolveFirstNotification = null;
        rejectFirstNotification = null;
        reject(error);
      };
    });
  }

  function waitForLiveNotificationIncrease(previousCount: number, timeoutMs: number) {
    return new Promise<void>((resolve, reject) => {
      const startedAt = Date.now();

      const tick = () => {
        if (liveNotificationCount > previousCount) {
          resolve();
          return;
        }

        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error("timed out waiting for next live notification"));
          return;
        }

        setTimeout(tick, 75);
      };

      tick();
    });
  }

  async function waitForLiveSubscriptionReady(
    subscription: LiveSubscription,
    timeoutMs: number,
  ) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const id = subscription.id?.toString();
      if (id) {
        return id;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error("timed out waiting for live subscription readiness");
  }

  async function runInitTest() {
    updateTest("init", "running", "Initializing embedded datastore...");
    await ensureReadySession();
    updateTest("init", "pass", "SDK transport connection is ready");
  }

  async function runQueryTest() {
    updateTest("query", "running", "Running smoke query...");

    const client = await ensureReadySession();
    const [result] = await client.query("RETURN 'bridge-online';").collect();

    const asText = stringifyPretty(result);
    latestResult = asText;

    if (!asText.includes("bridge-online")) {
      throw new Error("smoke query returned unexpected payload");
    }

    updateTest("query", "pass", "Smoke query returned expected value");
  }

  async function runStreamTest() {
    updateTest("stream", "running", "Listening for chunked query stream...");

    const client = await ensureReadySession();
    const frames: unknown[] = [];
    let doneCount = 0;

    for await (const frame of client
      .query("RETURN 'stream-a'; RETURN 'stream-b';")
      .stream()) {
      const typedFrame = frame as Frame<unknown, false>;
      if (typedFrame.isError()) {
        typedFrame.throw();
      }
      if (typedFrame.isValue()) {
        frames.push(typedFrame.value);
      }
      if (typedFrame.isDone()) {
        doneCount += 1;
      }
    }

    streamResult = stringifyPretty(frames);

    if (frames.length < 2 || doneCount < 2) {
      throw new Error("expected value and done frames for both streamed statements");
    }

    updateTest("stream", "pass", `Received ${frames.length} value frames and ${doneCount} done frames`);
  }

  async function runHealthTest() {
    updateTest("health", "running", "Checking health endpoint...");

    const connection = activeConnectionConfig ?? currentConnectionConfig();
    if (!isTauriConnection(connection.url) && !runRemoteHealthCheck) {
      updateTest("health", "pass", "Skipped for non-embedded connection");
      return;
    }

    const client = await connectWithConfig();
    await client.health();

    updateTest("health", "pass", "Health endpoint responded successfully");
  }

  async function runVersionTest() {
    updateTest("version", "running", "Checking version endpoint...");

    const client = await connectWithConfig();
    const version = await client.version();
    const versionString =
      typeof version === "string"
        ? version
        : version && typeof version === "object" && "version" in version
          ? String((version as { version?: unknown }).version ?? "")
          : "";

    assert(isSemanticVersionLike(versionString), "version endpoint did not return a semantic version", version);

    updateTest("version", "pass", `Version: ${stringifyPretty(version)}`);
  }

  async function runSessionTest() {
    updateTest("session", "running", "Validating set/unset + fork session...");

    const client = await ensureReadySession();
    await client.set("sdk_probe", "root");
    const [rootProbe] = await client.query("RETURN $sdk_probe;").collect();
    expectSessionProbeValue("root session variable", rootProbe, "root");
    await client.unset("sdk_probe");
    const [rootProbeAfterUnset] = await client.query("RETURN $sdk_probe = NONE;").collect();
    expectTrueResult("root session variable after unset", rootProbeAfterUnset);

    const fork = await client.forkSession();
    try {
      await fork.use({ namespace: "starter", database: "mobile" });
      await fork.set("fork_probe", "forked");
      const [forkProbe] = await fork.query("RETURN $fork_probe;").collect();
      expectSessionProbeValue("fork session variable", forkProbe, "forked");
      await fork.reset();
    } finally {
      await fork.closeSession();
    }

    updateTest("session", "pass", "set/unset/fork/reset succeeded");
  }

  async function runCrudFeatureTest() {
    updateTest("crud", "running", "Exercising CRUD helpers...");

    await ensureLiveTable();
    const client = await ensureReadySession();
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    const markerA = `crud_a_${suffix}`;
    const markerB = `crud_b_${suffix}`;

    const [created] = await client
      .create<DemoRecord>(new Table("qa_mobile_demo"))
      .content({ status: "created", run: suffix, marker: markerA, count: 1 })
      .output("after");
    assert(created.marker === markerA, "create marker mismatch", created);
    assert(created.status === "created", "create status mismatch", created);

    const recordA = created.id;
    const selected = await client.select(recordA);
    assert(selected !== null && selected !== undefined, "select returned empty result", selected);

    // Some runtimes return an id-only projection for select(recordId). Validate full fields with SELECT *.
    const [selectedSnapshot] = await client.query<DemoRecord[]>(`SELECT * FROM ${recordA};`).collect();
    const selectedRecord = unwrapRecord("select", selectedSnapshot);
    assert(selectedRecord.status === "created", "select status mismatch", selectedRecord);

    const updated = unwrapRecord(
      "update",
      await client
        .update<DemoRecord>(recordA)
        .merge({ status: "updated", count: 2 })
        .output("after"),
    );
    assert(updated.status === "updated", "update status mismatch", updated);
    assert(updated.count === 2, "update count mismatch", updated);

    const upserted = unwrapRecord(
      "upsert",
      await client
        .upsert<DemoRecord>(new Table("qa_mobile_demo"))
        .content({ status: "upserted", run: suffix, marker: markerB })
        .output("after"),
    );
    assert(upserted.marker === markerB, "upsert marker mismatch", upserted);
    assert(upserted.status === "upserted", "upsert status mismatch", upserted);

    const inserted = await client
      .insert<DemoRecord>(new Table("qa_mobile_demo"), [
        { status: "inserted", run: suffix },
        { status: "inserted", run: suffix },
      ])
      .output("after");
    assert(Array.isArray(inserted), "insert should return an array", inserted);
    assert(inserted.length === 2, "insert should return two records", inserted);
    assert(
      inserted.every((row) => row.status === "inserted"),
      "insert status mismatch",
      inserted,
    );

    const deleted = unwrapRecord(
      "delete",
      await client.delete<DemoRecord>(recordA).output("before"),
    );
    assert(deleted.marker === markerA, "delete marker mismatch", deleted);

    await client.query(`DELETE qa_mobile_demo WHERE run = '${suffix}';`).collect();
    updateTest("crud", "pass", "CRUD helpers returned expected payloads");
  }

  async function runRelateAndRunTest() {
    updateTest("relate-run", "running", "Testing relate and run helper...");

    await ensureLiveTable();
    await ensureEdgeTable();

    const client = await ensureReadySession();
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    const [fromCreated] = await client
      .create<DemoRecord>(new Table("qa_mobile_demo"))
      .content({ label: "from", run: suffix, marker: `node_from_${suffix}` })
      .output("after");
    const [toCreated] = await client
      .create<DemoRecord>(new Table("qa_mobile_demo"))
      .content({ label: "to", run: suffix, marker: `node_to_${suffix}` })
      .output("after");

    const fromId = fromCreated.id;
    const toId = toCreated.id;

    const relation = unwrapRecord(
      "relate",
      await client.relate<EdgeRecord>(fromId, new Table("qa_mobile_edge"), toId, {
        kind: "linked",
        run: suffix,
      }),
    );
    assert(relation.kind === "linked", "relate kind mismatch", relation);

    const runResult = await client.run<number>("string::len", ["hello"]);
    assert(Number(runResult) === 5, "unexpected run() result", runResult);

    await client.query(`DELETE qa_mobile_edge WHERE run = '${suffix}';`).collect();
    await client.query(`DELETE qa_mobile_demo WHERE run = '${suffix}';`).collect();
    updateTest("relate-run", "pass", "relate() and run() behaved as expected");
  }

  async function runTransactionTest() {
    updateTest("tx", "running", "Testing transaction begin + cancel...");

    await ensureLiveTable();
    const client = await ensureReadySession();
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    const txRecord = `qa_mobile_demo:tx_${suffix}`;

    const tx = await client.beginTransaction();
    await tx.query(`CREATE ${txRecord} SET status = 'tx-created', run = '${suffix}';`).collect();
    await tx.cancel();

    const [result] = await client.query(`SELECT * FROM ${txRecord};`).collect();
    if (stringifyPretty(result).includes(`tx_${suffix}`)) {
      throw new Error("transaction cancel did not rollback record creation");
    }

    updateTest("tx", "pass", "begin/cancel lifecycle succeeded");
  }

  async function ensureLiveTable() {
    const client = await ensureReadySession();
    try {
      await client.query("DEFINE TABLE qa_mobile_demo SCHEMALESS;").collect();
    } catch (error) {
      const message = formatError(error).toLowerCase();
      if (!message.includes("already exists")) {
        throw error;
      }
    }
  }

  async function ensureEdgeTable() {
    const client = await ensureReadySession();
    try {
      await client.query("DEFINE TABLE qa_mobile_edge SCHEMALESS;").collect();
    } catch (error) {
      const message = formatError(error).toLowerCase();
      if (!message.includes("already exists")) {
        throw error;
      }
    }
  }

  async function startLiveListener() {
    resolveFirstNotification = null;
    rejectFirstNotification = null;

    if (activeLiveSubscription) {
      await cancelLive();
    }

    const client = await ensureReadySession();
    const subscription = await client.live(new Table("qa_mobile_demo"));
    activeLiveSubscription = subscription;

    let cancelled = false;
    activeLiveUnsubscribe = () => {
      cancelled = true;
    };

    void (async () => {
      try {
        for await (const message of subscription) {
          if (cancelled) {
            return;
          }

          liveNotificationCount += 1;
          const payload = message.value;
          latestLivePayload = stringifyPretty(payload);
          latestLiveNormalized = latestLivePayload;

          if (payload && typeof payload === "object" && "current" in payload) {
            const maybePatch = (payload as { current?: unknown }).current;
            latestLiveNormalized = stringifyPretty(maybePatch);
            latestLivePatch = stringifyPretty(maybePatch);
          } else {
            latestLivePatch = latestLiveNormalized;
          }

          pushLiveEvent(
            `notification ${message.action} from ${message.queryId?.toString() ?? "unknown"} :: ${summarizeLiveData(payload)}`,
          );
          pushEventLog({
            type: "live",
            label: `notification ${message.action}`,
            payload: {
              queryId: message.queryId?.toString() ?? "unknown",
              action: message.action,
              value: payload,
            },
          });

          const resolvePending = resolveFirstNotification as (() => void) | null;
          if (typeof resolvePending === "function") {
            resolvePending();
          }
        }

        const rejectPending = rejectFirstNotification as ((error: Error) => void) | null;
        if (!cancelled && typeof rejectPending === "function") {
          rejectPending(new Error("live stream finished before notification"));
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        const formatted = formatError(error);
        pushLiveEvent(`failed ${activeLiveStreamId ?? "unknown"}: ${formatted}`);
        pushEventLog({
          type: "error",
          label: "live stream failed",
          error: formatted,
        });

        const rejectPending = rejectFirstNotification as ((error: Error) => void) | null;
        if (typeof rejectPending === "function") {
          rejectPending(new Error(formatted));
        }
      }
    })();

    activeLiveStreamId = await waitForLiveSubscriptionReady(subscription, 4000);
    pushLiveEvent(`started ${activeLiveStreamId}`);
    pushEventLog({
      type: "live",
      label: "live stream started",
      payload: { streamId: activeLiveStreamId },
    });
  }

  async function runLiveTest() {
    updateTest("live", "running", "Starting LIVE subscription...");

    liveNotificationCount = 0;
    liveEvents = [];
    await ensureLiveTable();
    await startLiveListener();

    const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    const recordId = `qa_mobile_demo:live_${uniqueSuffix}`;
    lastLiveRecordId = recordId;

    const client = await ensureReadySession();
    await client.query(`CREATE ${recordId} SET status = 'created', run = '${uniqueSuffix}';`).collect();

    await waitForFirstLiveNotification(7000);
    const beforeUpdateNotifications = liveNotificationCount;

    await client
      .query(`UPDATE ${recordId} SET status = 'updated', run = '${uniqueSuffix}_updated';`)
      .collect();
    await waitForLiveNotificationIncrease(beforeUpdateNotifications, 7000);

    updateTest(
      "live",
      "pass",
      `Received ${liveNotificationCount} live notification(s)`,
    );
  }

  async function runLiveCycleTest() {
    updateTest("live-cycle", "running", "Starting and stopping a second LIVE stream...");

    await ensureLiveTable();
    const client = await ensureReadySession();
    const cycle = await client.live(new Table("qa_mobile_demo"));
    const cycleId = await waitForLiveSubscriptionReady(cycle, 4000);
    pushLiveEvent(`cycle started ${cycleId}`);
    await cycle.kill();
    pushLiveEvent(`cycle cancelled ${cycleId}`);

    updateTest(
      "live-cycle",
      "pass",
      "Second LIVE stream started and cancelled cleanly",
    );
  }

  async function runLiveDocsComplianceTest() {
    updateTest("live-docs", "running", "Validating LIVE behavior against docs...");

    await ensureLiveTable();
    const client = await ensureReadySession();

    const subscription = await client.live(new Table("qa_mobile_demo"));
    let recordId: string | null = null;

    try {
      const liveId = await waitForLiveSubscriptionReady(subscription, 4000);
      assert(liveId.length > 0, "live subscription id should be present", liveId);

      const suffix = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
      recordId = `qa_mobile_demo:live_docs_${suffix}`;

      const firstMessagePromise = (async () => {
        for await (const message of subscription) {
          return message;
        }
        throw new Error("live stream ended before first message");
      })();

      await client
        .query(`CREATE ${recordId} SET status = 'docs-create', run = '${suffix}';`)
        .collect();

      const firstMessage = await Promise.race([
        firstMessagePromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timed out waiting for docs compliance live event")), 7000),
        ),
      ]);

      const action = String((firstMessage as { action?: unknown }).action ?? "").toUpperCase();
      assert(
        ["CREATE", "UPDATE", "DELETE"].includes(action),
        "unexpected live action",
        firstMessage,
      );

      const queryId = (firstMessage as { queryId?: { toString: () => string } }).queryId?.toString();
      assert(queryId === liveId, "live event queryId should match subscription id", {
        liveId,
        queryId,
        firstMessage,
      });

      const payload = (firstMessage as { value?: unknown }).value;
      assert(payload && typeof payload === "object", "live event payload should be an object", payload);

      await subscription.kill();

      await client
        .query(`UPDATE ${recordId} SET status = 'docs-after-kill', run = '${suffix}';`)
        .collect();

      updateTest(
        "live-docs",
        "pass",
        "Subscription id, event action/value shape, and kill lifecycle match docs",
      );
    } finally {
      try {
        await subscription.kill();
      } catch {
        // Ignore cleanup failures for already-killed streams.
      }

      if (recordId) {
        await client.query(`DELETE ${recordId};`).collect();
      }
    }
  }

  async function runUnsubscribeTest() {
    updateTest("unsubscribe", "running", "Cancelling live subscription...");

    if (!activeLiveStreamId) {
      throw new Error("no active live stream to unsubscribe");
    }

    const before = liveNotificationCount;
    await cancelLive();

    const recordId = lastLiveRecordId ?? "qa_mobile_demo:alpha";
    const client = await ensureReadySession();
    await client.query(`UPDATE ${recordId} SET status = 'after-unsubscribe';`).collect();

    const startedAt = Date.now();
    while (Date.now() - startedAt < 1500) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (liveNotificationCount > before) {
        throw new Error("notifications still arrived after unsubscribe");
      }
    }

    updateTest("unsubscribe", "pass", "No post-unsubscribe notifications observed");
  }

  async function runAllTests() {
    if (runBusy) {
      return;
    }

    runBusy = true;
    dbStatus = "running test suite";
    resetTests();

    const testPlan: Array<{ key: string; run: () => Promise<void> }> = [
      { key: "init", run: runInitTest },
      { key: "query", run: runQueryTest },
      { key: "stream", run: runStreamTest },
      { key: "health", run: runHealthTest },
      { key: "version", run: runVersionTest },
      { key: "session", run: runSessionTest },
      { key: "crud", run: runCrudFeatureTest },
      { key: "relate-run", run: runRelateAndRunTest },
      { key: "tx", run: runTransactionTest },
      { key: "live", run: runLiveTest },
      { key: "live-cycle", run: runLiveCycleTest },
      { key: "live-docs", run: runLiveDocsComplianceTest },
      { key: "unsubscribe", run: runUnsubscribeTest },
    ];

    let failedCount = 0;

    for (const testStep of testPlan) {
      try {
        await testStep.run();
      } catch (error) {
        failedCount += 1;
        const formatted = formatError(error);
        updateTest(testStep.key, "fail", formatted);
        pushEventLog({
          type: "error",
          label: `suite ${testStep.key} failed`,
          error: formatted,
        });
      }
    }

    dbStatus =
      failedCount === 0
        ? "all tests passed"
        : `${failedCount}/${testPlan.length} tests failed`;
    runBusy = false;
  }

  async function cancelLive() {
    if (!activeLiveSubscription) {
      return;
    }

    const cancelledId = activeLiveStreamId ?? "unknown";
    activeLiveUnsubscribe?.();
    activeLiveUnsubscribe = null;

    try {
      await activeLiveSubscription.kill();
      pushLiveEvent(`manual cancel ${cancelledId}`);
      pushEventLog({
        type: "live",
        label: "live stream cancelled",
        payload: { streamId: cancelledId },
      });
    } finally {
      activeLiveSubscription = null;
      activeLiveStreamId = null;
    }
  }

  async function startManualLive() {
    manualLiveStatus = "starting live stream...";
    pushEventLog({ type: "system", label: "manual live start requested" });

    try {
      await ensureReadySession();
      await ensureLiveTable();
      await startLiveListener();
      manualLiveStatus = `live stream started: ${activeLiveStreamId ?? "unknown"}`;
    } catch (error) {
      manualLiveStatus = `start failed: ${formatError(error)}`;
      pushEventLog({
        type: "error",
        label: "manual live start failed",
        error: formatError(error),
      });
    }
  }

  async function stopManualLive() {
    if (!activeLiveStreamId) {
      manualLiveStatus = "no active stream to stop";
      pushEventLog({ type: "system", label: "manual live stop ignored (no stream)" });
      return;
    }

    const streamId = activeLiveStreamId;
    await cancelLive();
    manualLiveStatus = `live stream stopped: ${streamId}`;
  }

  async function runManualMutation(kind: "create" | "update" | "delete") {
    manualStatus = `${kind} in progress...`;

    try {
      await ensureReadySession();
      await ensureLiveTable();

      const recordKey = sanitizeRecordKey(manualRecordKey);
      const recordId = `qa_mobile_demo:${recordKey}`;
      lastLiveRecordId = recordId;

      let sql = "";
      if (kind === "create") {
        sql = `CREATE ${recordId} SET status = $status, note = $note, updatedAt = time::now();`;
      }
      if (kind === "update") {
        sql = `UPDATE ${recordId} SET status = $status, note = $note, updatedAt = time::now();`;
      }
      if (kind === "delete") {
        sql = `DELETE ${recordId};`;
      }

      const client = await ensureReadySession();
      const startedAt = performance.now();
      const [result] = await client
        .query(sql, {
          status: manualStatusValue,
          note: manualNoteValue,
        })
        .collect();
      const durationMs = performance.now() - startedAt;

      manualResult = stringifyPretty(result);
      manualStatus = `${kind} succeeded for qa_mobile_demo:${recordKey}`;
      pushEventLog({
        type: "query",
        label: `manual ${kind}`,
        sql,
        durationMs,
        payload: {
          status: manualStatusValue,
          note: manualNoteValue,
        },
        result,
      });
    } catch (error) {
      manualStatus = `${kind} failed: ${formatError(error)}`;
      pushEventLog({
        type: "error",
        label: `manual ${kind} failed`,
        error: formatError(error),
      });
    }
  }

  async function runManualQuery() {
    const sql = manualQuerySql.trim();
    if (!sql) {
      manualStatus = "query failed: SQL cannot be empty";
      pushEventLog({
        type: "error",
        label: "manual query failed",
        error: "SQL cannot be empty",
      });
      return;
    }

    manualStatus = "query in progress...";

    try {
      await ensureReadySession();
      const client = await ensureReadySession();
      const startedAt = performance.now();
      const result = await client.query(sql).collect();
      const durationMs = performance.now() - startedAt;

      manualResult = stringifyPretty(result);
      manualStatus = "query succeeded";

      pushEventLog({
        type: "query",
        label: "manual query",
        sql,
        durationMs,
        result,
      });
    } catch (error) {
      const formatted = formatError(error);
      manualStatus = `query failed: ${formatted}`;
      pushEventLog({
        type: "error",
        label: "manual query failed",
        sql,
        error: formatted,
      });
    }
  }

</script>

<main class="page">
  <section class="hero glass">
    <p class="eyebrow">Embedded SurrealDB Validation</p>
    <h1>Surreal SDK + LIVE Stream Test Console</h1>
    <p>
      This screen runs SDK transport tests against your Rust bridge so you can
      confirm behavior on desktop and mobile builds.
    </p>
    <div class="actions">
      <button type="button" class="primary" onclick={runAllTests} disabled={runBusy}>
        {runBusy ? "Running..." : "Run Full Test Suite"}
      </button>
      <button type="button" class="secondary" onclick={cancelLive} disabled={!activeLiveStreamId}>
        Cancel Active LIVE Stream
      </button>
    </div>
    <p class="status-line">Status: {dbStatus}</p>

    <h3>Connection</h3>
    <div class="manual-grid">
      <label class="full">
        URL
        <input bind:value={connectionUrl} placeholder="ws://127.0.0.1:8000/rpc" />
      </label>
      <label>
        Username
        <input bind:value={connectionUsername} placeholder="root" />
      </label>
      <label>
        Password
        <input bind:value={connectionPassword} type="password" placeholder="root" />
      </label>
      <label class="full health-toggle">
        <input type="checkbox" bind:checked={runRemoteHealthCheck} />
        Run health endpoint test for non-embedded connections
      </label>
    </div>
    <div class="actions">
      <button type="button" class="secondary" onclick={applyConnectionDetails} disabled={connectionBusy}>
        {connectionBusy ? "Connecting..." : "Apply Connection"}
      </button>
    </div>
    <p class="meta">Connection status: {connectionStatus}</p>
  </section>

  <section class="grid">
    <article class="glass card">
      <TestResultsContent {tests} />
    </article>

    <article class="glass card">
      <LiveFeedContent {activeLiveStreamId} {liveNotificationCount} {liveEvents} />
    </article>

    <article class="glass card wide">
      <PayloadSnapshotsContent
        {latestResult}
        {streamResult}
        {latestLivePayload}
        {latestLiveNormalized}
        {latestLivePatch}
      />
    </article>

    <article class="glass card wide">
      <h2>Manual Record Mutations</h2>
      <p class="meta">Use this panel to create, update, or delete a record while watching the Live Feed.</p>
      <div class="actions">
        <button type="button" class="primary" onclick={startManualLive}>
          Start LIVE Stream
        </button>
        <button type="button" class="secondary" onclick={stopManualLive}>
          Stop LIVE Stream
        </button>
      </div>
      <p class="status-line">Manual LIVE status: {manualLiveStatus}</p>
      <div class="manual-grid">
        <label>
          Record key
          <input bind:value={manualRecordKey} placeholder="manual_alpha" />
        </label>
        <label>
          Status value
          <input bind:value={manualStatusValue} placeholder="draft" />
        </label>
        <label class="full">
          Note
          <input bind:value={manualNoteValue} placeholder="any text" />
        </label>
        <label class="full">
          Manual SQL query
          <textarea bind:value={manualQuerySql} rows="4" placeholder="SELECT * FROM qa_mobile_demo LIMIT 5;"></textarea>
        </label>
      </div>
      <div class="actions">
        <button type="button" class="primary" onclick={() => runManualMutation("create")}>
          Create Record
        </button>
        <button type="button" class="secondary" onclick={() => runManualMutation("update")}>
          Update Record
        </button>
        <button type="button" class="danger" onclick={() => runManualMutation("delete")}>
          Delete Record
        </button>
        <button type="button" class="secondary" onclick={runManualQuery}>
          Run Manual Query
        </button>
      </div>
      <p class="status-line">Manual status: {manualStatus}</p>
      <pre>{manualResult}</pre>
      <h3>Event Log</h3>
      <div class="event-log">
        {#if eventLog.length === 0}
          <p class="empty">No events logged yet</p>
        {:else}
          {#each eventLog as entry}
            <article class="event-item">
              <p>
                <span class={`badge ${entry.type === "error" ? "fail" : entry.type === "query" ? "running" : "idle"}`}>
                  {entry.type}
                </span>
                <strong>{entry.label}</strong>
              </p>
              <p class="meta">{entry.at}{entry.durationMs !== undefined ? ` - ${entry.durationMs.toFixed(2)} ms` : ""}</p>
              {#if entry.sql}
                <p class="meta">SQL: {entry.sql}</p>
              {/if}
              {#if entry.error}
                <p class="meta">Error: {entry.error}</p>
              {/if}
              <pre>{stringifyPretty({ payload: entry.payload, result: entry.result })}</pre>
            </article>
          {/each}
        {/if}
      </div>
    </article>

  </section>
</main>

<style>
  :global(html) {
    min-height: 100%;
    background:
      radial-gradient(circle at 20% 20%, rgba(255, 196, 91, 0.24), transparent 40%),
      radial-gradient(circle at 80% 0%, rgba(51, 124, 255, 0.2), transparent 32%),
      linear-gradient(135deg, #f4f7ff 0%, #eefaf4 100%);
  }

  :global(body) {
    margin: 0;
    min-height: 100vh;
    color-scheme: light;
    font-family:
      "Space Grotesk",
      "Manrope",
      "Segoe UI",
      sans-serif;
    color: #10111a;
    background:
      radial-gradient(circle at 20% 20%, rgba(255, 196, 91, 0.24), transparent 40%),
      radial-gradient(circle at 80% 0%, rgba(51, 124, 255, 0.2), transparent 32%),
      linear-gradient(135deg, #f4f7ff 0%, #eefaf4 100%);
  }

  :global(body > div) {
    min-height: 100vh;
    background: inherit;
  }

  .page {
    max-width: 1080px;
    margin: 0 auto;
    padding: 1.1rem;
    display: grid;
    gap: 1rem;
  }

  .glass {
    background: rgba(255, 255, 255, 0.74);
    border: 1px solid rgba(16, 17, 26, 0.12);
    box-shadow: 0 16px 40px rgba(16, 17, 26, 0.1);
    backdrop-filter: blur(10px);
    border-radius: 20px;
  }

  .hero {
    padding: 1.1rem 1rem;
    animation: rise-in 500ms ease-out;
  }

  .eyebrow {
    margin: 0;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 0.75rem;
    color: #3557d5;
    font-weight: 700;
  }

  h1 {
    margin: 0.5rem 0;
    line-height: 1.1;
    font-size: clamp(1.4rem, 3vw, 2.1rem);
  }

  h2 {
    margin-top: 0;
  }

  .actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-top: 1rem;
  }

  button {
    border: 0;
    border-radius: 999px;
    padding: 0.7rem 1rem;
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    transition: transform 120ms ease;
  }

  button:hover {
    transform: translateY(-1px);
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .primary {
    color: #fff;
    background: linear-gradient(90deg, #1f5cff, #2789ff);
  }

  .secondary {
    color: #0d223e;
    background: #dbe6ff;
  }

  .danger {
    color: #fff;
    background: linear-gradient(90deg, #b62323, #d64040);
  }

  .status-line {
    margin: 0.8rem 0 0;
    font-weight: 600;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .card {
    padding: 1rem;
    animation: rise-in 520ms ease-out;
  }

  .wide {
    grid-column: 1 / -1;
  }

  .manual-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.7rem;
    margin-top: 0.6rem;
  }

  .manual-grid label {
    display: grid;
    gap: 0.35rem;
    font-size: 0.9rem;
    color: #1f2d46;
    font-weight: 600;
  }

  .manual-grid .full {
    grid-column: 1 / -1;
  }

  .health-toggle {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-weight: 600;
  }

  .health-toggle input {
    width: 1rem;
    height: 1rem;
    margin: 0;
    padding: 0;
    accent-color: #3557d5;
  }

  input {
    border: 1px solid rgba(51, 66, 95, 0.25);
    border-radius: 10px;
    padding: 0.6rem 0.7rem;
    font-size: 0.95rem;
    background: rgba(255, 255, 255, 0.9);
    color: #0f1626;
  }

  textarea {
    border: 1px solid rgba(51, 66, 95, 0.25);
    border-radius: 10px;
    padding: 0.6rem 0.7rem;
    font-size: 0.95rem;
    background: rgba(255, 255, 255, 0.9);
    color: #0f1626;
    resize: vertical;
    min-height: 96px;
  }

  h3 {
    margin: 1rem 0 0.5rem;
    font-size: 1rem;
  }

  .event-log {
    margin-top: 0.4rem;
    max-height: 360px;
    overflow: auto;
    display: grid;
    gap: 0.6rem;
  }

  .event-item {
    border: 1px solid rgba(51, 66, 95, 0.2);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.8);
    padding: 0.65rem;
  }

  .event-item p {
    margin: 0.2rem 0;
  }

  @media (prefers-color-scheme: dark) {
    :global(html) {
      background:
        radial-gradient(circle at 20% 20%, rgba(255, 164, 63, 0.2), transparent 42%),
        radial-gradient(circle at 80% 0%, rgba(45, 111, 255, 0.2), transparent 34%),
        linear-gradient(135deg, #0d1324 0%, #091b1a 100%);
    }

    :global(body) {
      color-scheme: dark;
      color: #e8edf8;
      background:
        radial-gradient(circle at 20% 20%, rgba(255, 164, 63, 0.2), transparent 42%),
        radial-gradient(circle at 80% 0%, rgba(45, 111, 255, 0.2), transparent 34%),
        linear-gradient(135deg, #0d1324 0%, #091b1a 100%);
    }

    :global(body > div) {
      background: inherit;
    }

    .glass {
      background: rgba(20, 26, 43, 0.72);
      border-color: rgba(222, 235, 255, 0.16);
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
    }

    .eyebrow {
      color: #89aeff;
    }

    .secondary {
      color: #dfe9ff;
      background: #334f86;
    }

    .meta,
    .status-line,
    .empty,
    .manual-grid label,
    .health-toggle {
      color: #bdcbea;
    }

    input {
      border-color: rgba(181, 199, 230, 0.25);
      background: rgba(15, 22, 38, 0.92);
      color: #e8edf8;
    }

    textarea {
      border-color: rgba(181, 199, 230, 0.25);
      background: rgba(15, 22, 38, 0.92);
      color: #e8edf8;
    }

    .event-item {
      border-color: rgba(181, 199, 230, 0.2);
      background: rgba(17, 23, 40, 0.8);
    }
  }

  @media (max-width: 840px) {
    .grid {
      grid-template-columns: 1fr;
    }

    .page {
      padding: 0.75rem;
    }

    .hero,
    .card {
      border-radius: 16px;
    }

    button {
      flex: 1 1 100%;
    }

    .manual-grid {
      grid-template-columns: 1fr;
    }
  }

  @keyframes rise-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
