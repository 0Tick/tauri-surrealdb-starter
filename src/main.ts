import { Surreal, type PatchOperation } from "@starter/surrealdb-js-tauri";
import "./style.css";

const status = document.querySelector<HTMLSpanElement>("#status");
const output = document.querySelector<HTMLPreElement>("#output");
const namespaceInput = document.querySelector<HTMLInputElement>("#namespace");
const databaseInput = document.querySelector<HTMLInputElement>("#database");
const signinJsonInput =
  document.querySelector<HTMLInputElement>("#signin-json");
const authTokenInput = document.querySelector<HTMLInputElement>("#auth-token");
const letNameInput = document.querySelector<HTMLInputElement>("#let-name");
const letValueInput = document.querySelector<HTMLInputElement>("#let-value");
const runNameInput = document.querySelector<HTMLInputElement>("#run-name");
const runArgsInput = document.querySelector<HTMLInputElement>("#run-args");
const querySqlInput = document.querySelector<HTMLTextAreaElement>("#query-sql");
const queryVarsInput =
  document.querySelector<HTMLTextAreaElement>("#query-vars");
const resourceInput = document.querySelector<HTMLInputElement>("#resource");
const recordIdInput = document.querySelector<HTMLInputElement>("#record-id");
const payloadInput = document.querySelector<HTMLInputElement>("#payload");
const fromInput = document.querySelector<HTMLInputElement>("#from");
const relationInput = document.querySelector<HTMLInputElement>("#relation");
const toInput = document.querySelector<HTMLInputElement>("#to");

const connectButton = document.querySelector<HTMLButtonElement>("#connect");
const useButton = document.querySelector<HTMLButtonElement>("#use");
const healthButton = document.querySelector<HTMLButtonElement>("#health");
const versionButton = document.querySelector<HTMLButtonElement>("#version");
const infoButton = document.querySelector<HTMLButtonElement>("#info");
const dbMetaButton = document.querySelector<HTMLButtonElement>("#db-meta");
const invalidateButton =
  document.querySelector<HTMLButtonElement>("#invalidate");
const closeButton = document.querySelector<HTMLButtonElement>("#close");
const signinButton = document.querySelector<HTMLButtonElement>("#signin");
const signupButton = document.querySelector<HTMLButtonElement>("#signup");
const authenticateButton =
  document.querySelector<HTMLButtonElement>("#authenticate");
const letButton = document.querySelector<HTMLButtonElement>("#let");
const unsetButton = document.querySelector<HTMLButtonElement>("#unset");
const runButton = document.querySelector<HTMLButtonElement>("#run");
const queryButton = document.querySelector<HTMLButtonElement>("#query");
const seedButton = document.querySelector<HTMLButtonElement>("#seed");
const selectButton = document.querySelector<HTMLButtonElement>("#select");
const createButton = document.querySelector<HTMLButtonElement>("#create");
const insertButton = document.querySelector<HTMLButtonElement>("#insert");
const updateButton = document.querySelector<HTMLButtonElement>("#update");
const upsertButton = document.querySelector<HTMLButtonElement>("#upsert");
const mergeButton = document.querySelector<HTMLButtonElement>("#merge");
const patchButton = document.querySelector<HTMLButtonElement>("#patch");
const deleteButton = document.querySelector<HTMLButtonElement>("#delete");
const relateButton = document.querySelector<HTMLButtonElement>("#relate");
const clearLogButton = document.querySelector<HTMLButtonElement>("#clear-log");

if (
  !status ||
  !output ||
  !namespaceInput ||
  !databaseInput ||
  !signinJsonInput ||
  !authTokenInput ||
  !letNameInput ||
  !letValueInput ||
  !runNameInput ||
  !runArgsInput ||
  !querySqlInput ||
  !queryVarsInput ||
  !resourceInput ||
  !recordIdInput ||
  !payloadInput ||
  !fromInput ||
  !relationInput ||
  !toInput ||
  !connectButton ||
  !useButton ||
  !healthButton ||
  !versionButton ||
  !infoButton ||
  !dbMetaButton ||
  !invalidateButton ||
  !closeButton ||
  !signinButton ||
  !signupButton ||
  !authenticateButton ||
  !letButton ||
  !unsetButton ||
  !runButton ||
  !queryButton ||
  !seedButton ||
  !selectButton ||
  !createButton ||
  !insertButton ||
  !updateButton ||
  !upsertButton ||
  !mergeButton ||
  !patchButton ||
  !deleteButton ||
  !relateButton ||
  !clearLogButton
) {
  throw new Error("Showcase UI elements are missing");
}

const db = new Surreal();

const setStatus = (message: string, isError = false) => {
  status.textContent = message;
  status.dataset.state = isError ? "error" : "ok";
};

const log = (label: string, payload?: unknown) => {
  const timestamp = new Date().toISOString();
  const entry =
    payload === undefined
      ? `[${timestamp}] ${label}`
      : `[${timestamp}] ${label}\n${JSON.stringify(payload, null, 2)}`;
  output.textContent = output.textContent
    ? `${entry}\n\n${output.textContent}`
    : entry;
};

const parseJson = <T = unknown>(value: string, fallback: T): T => {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  return JSON.parse(trimmed) as T;
};

const recordRef = (): string => {
  const resource = resourceInput.value.trim();
  const recordId = recordIdInput.value.trim();
  if (!resource) {
    throw new Error("Resource is required");
  }

  if (resource.includes(":")) {
    return resource;
  }

  return recordId ? `${resource}:${recordId}` : resource;
};

const withAction = async (label: string, action: () => Promise<unknown>) => {
  try {
    setStatus(`${label}...`);
    const result = await action();
    log(`${label} ✅`, result);
    setStatus(`${label} OK`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`${label} ❌`, { error: message });
    setStatus(message, true);
  }
};

connectButton.addEventListener("click", () => {
  void withAction("connect()", async () =>
    db.connect("tauri://", {
      namespace: namespaceInput.value.trim(),
      database: databaseInput.value.trim(),
    }),
  );
});

useButton.addEventListener("click", () => {
  void withAction("use()", async () => {
    await db.use({
      namespace: namespaceInput.value.trim(),
      database: databaseInput.value.trim(),
    });
    return db.db();
  });
});

healthButton.addEventListener("click", () => {
  void withAction("health()", async () => {
    await db.health();
    return { ok: true };
  });
});

versionButton.addEventListener("click", () => {
  void withAction("version()", async () => db.version());
});

infoButton.addEventListener("click", () => {
  void withAction("info()", async () => db.info());
});

dbMetaButton.addEventListener("click", () => {
  void withAction("db()", async () => db.db());
});

invalidateButton.addEventListener("click", () => {
  void withAction("invalidate()", async () => {
    await db.invalidate();
    return { invalidated: true };
  });
});

closeButton.addEventListener("click", () => {
  void withAction("close()", async () => db.close());
});

signinButton.addEventListener("click", () => {
  void withAction("signin()", async () => {
    const auth = parseJson<Record<string, unknown>>(signinJsonInput.value, {});
    return db.signin(auth);
  });
});

signupButton.addEventListener("click", () => {
  void withAction("signup()", async () => {
    const auth = parseJson<Record<string, unknown>>(signinJsonInput.value, {});
    return db.signup(auth);
  });
});

authenticateButton.addEventListener("click", () => {
  void withAction("authenticate()", async () => {
    await db.authenticate(authTokenInput.value.trim());
    return { authenticated: true };
  });
});

letButton.addEventListener("click", () => {
  void withAction("let()", async () => {
    const name = letNameInput.value.trim();
    const value = parseJson(letValueInput.value, letValueInput.value);
    await db.let(name, value);
    return { name, value };
  });
});

unsetButton.addEventListener("click", () => {
  void withAction("unset()", async () => {
    const name = letNameInput.value.trim();
    await db.unset(name);
    return { name };
  });
});

runButton.addEventListener("click", () => {
  void withAction("run()", async () => {
    const functionName = runNameInput.value.trim();
    const args = parseJson<unknown[]>(runArgsInput.value, []);
    return db.run(functionName, ...args);
  });
});

queryButton.addEventListener("click", () => {
  void withAction("query()", async () => {
    const sql = querySqlInput.value;
    const vars = parseJson<Record<string, unknown>>(queryVarsInput.value, {});
    return db.query(sql, vars);
  });
});

seedButton.addEventListener("click", () => {
  void withAction("seed showcase", async () =>
    db.query(
      "DEFINE TABLE IF NOT EXISTS showcase SCHEMALESS; UPSERT showcase:demo1 CONTENT { name: 'demo one', active: true, createdAt: time::now() }; UPSERT showcase:demo2 CONTENT { name: 'demo two', active: false, createdAt: time::now() }; SELECT * FROM showcase ORDER BY createdAt DESC;",
    ),
  );
});

selectButton.addEventListener("click", () => {
  void withAction("select()", async () => db.select(recordRef()));
});

createButton.addEventListener("click", () => {
  void withAction("create()", async () => {
    const payload = parseJson<Record<string, unknown>>(payloadInput.value, {});
    return db.create(recordRef(), payload);
  });
});

insertButton.addEventListener("click", () => {
  void withAction("insert()", async () => {
    const table = resourceInput.value.trim();
    if (!table || table.includes(":")) {
      throw new Error("Insert expects a table name");
    }
    const payload = parseJson<unknown>(payloadInput.value, {});
    return db.insert(table, payload);
  });
});

updateButton.addEventListener("click", () => {
  void withAction("update()", async () => {
    const payload = parseJson<Record<string, unknown>>(payloadInput.value, {});
    return db.update(recordRef(), payload);
  });
});

upsertButton.addEventListener("click", () => {
  void withAction("upsert()", async () => {
    const payload = parseJson<Record<string, unknown>>(payloadInput.value, {});
    return db.upsert(recordRef(), payload);
  });
});

mergeButton.addEventListener("click", () => {
  void withAction("merge()", async () => {
    const payload = parseJson<Record<string, unknown>>(payloadInput.value, {});
    return db.merge(recordRef(), payload);
  });
});

patchButton.addEventListener("click", () => {
  void withAction("patch()", async () => {
    const payload = parseJson<unknown>(payloadInput.value, {});
    const patchOps = Array.isArray(payload)
      ? (payload as PatchOperation[])
      : ([
          {
            op: "replace",
            path: "/name",
            value: String(
              (payload as Record<string, unknown>).name ?? "patched",
            ),
          },
        ] as PatchOperation[]);

    return db.patch(recordRef(), patchOps);
  });
});

deleteButton.addEventListener("click", () => {
  void withAction("delete()", async () => db.delete(recordRef()));
});

relateButton.addEventListener("click", () => {
  void withAction("relate()", async () => {
    const from = fromInput.value.trim();
    const relation = relationInput.value.trim();
    const to = toInput.value.trim();
    const payload = parseJson<Record<string, unknown>>(payloadInput.value, {});
    return db.relate(from, relation, to, payload);
  });
});

clearLogButton.addEventListener("click", () => {
  output.textContent = "";
});

window.addEventListener("beforeunload", () => {
  void db.close();
});

void withAction("initial connect", async () => {
  await db.connect("tauri://", {
    namespace: namespaceInput.value.trim(),
    database: databaseInput.value.trim(),
  });
  return db.db();
});
