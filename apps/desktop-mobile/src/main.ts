import { Surreal } from "@starter/surrealdb-js-tauri";
import "./style.css";

type WrappedThing = { tb: string; id: string };

type TodoRow = {
  id: string | WrappedThing;
  text: string;
  completed: boolean;
  createdAt?: string;
};

const form = document.querySelector<HTMLFormElement>("#todo-form");
const input = document.querySelector<HTMLInputElement>("#todo-input");
const list = document.querySelector<HTMLUListElement>("#todo-list");
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh");
const status = document.querySelector<HTMLSpanElement>("#status");

if (!form || !input || !list || !refreshButton || !status) {
  throw new Error("UI elements are missing");
}

const db = new Surreal();

const recordIdToString = (id: TodoRow["id"]): string => {
  if (typeof id === "string") {
    return id;
  }

  return `${id.tb}:${id.id}`;
};

const shortId = (rid: string): string => rid.replace(/^todo:/, "");

const setStatus = (message: string, isError = false) => {
  status.textContent = message;
  status.dataset.state = isError ? "error" : "ok";
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const unwrapSurrealValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(unwrapSurrealValue);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 1) {
    const [key, inner] = entries[0];

    if (key === "Array" && Array.isArray(inner)) {
      return inner.map(unwrapSurrealValue);
    }

    if (key === "Object" && inner && typeof inner === "object") {
      return Object.fromEntries(
        Object.entries(inner as Record<string, unknown>).map(
          ([nestedKey, nestedValue]) => [
            nestedKey,
            unwrapSurrealValue(nestedValue),
          ],
        ),
      );
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
        tb: typeof thing.tb === "string" ? thing.tb : String(thing.tb ?? ""),
        id: String(unwrapSurrealValue(thing.id) ?? ""),
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
      unwrapSurrealValue(nestedValue),
    ]),
  );
};

const normalizeTodoRows = (raw: unknown): TodoRow[] => {
  const normalized = unwrapSurrealValue(raw);
  const rows = Array.isArray(normalized) ? normalized : [];

  return rows
    .map((row): TodoRow | null => {
      if (!row || typeof row !== "object") {
        return null;
      }

      const record = row as Record<string, unknown>;
      const idValue = record.id;
      let id: string | WrappedThing;

      if (typeof idValue === "string") {
        id = idValue;
      } else if (
        idValue &&
        typeof idValue === "object" &&
        typeof (idValue as Record<string, unknown>).tb === "string"
      ) {
        const thing = idValue as Record<string, unknown>;
        id = {
          tb: String(thing.tb),
          id: String(thing.id ?? ""),
        };
      } else {
        return null;
      }

      return {
        id,
        text:
          typeof record.text === "string"
            ? record.text
            : String(record.text ?? ""),
        completed: Boolean(record.completed),
        createdAt:
          typeof record.createdAt === "string" ? record.createdAt : undefined,
      };
    })
    .filter((row): row is TodoRow => row !== null);
};

const renderTodos = (rows: TodoRow[]) => {
  if (rows.length === 0) {
    list.innerHTML = `<li class="empty">No todos yet.</li>`;
    return;
  }
  list.innerHTML = rows
    .sort((a, b) =>
      a.createdAt && b.createdAt ? b.createdAt.localeCompare(a.createdAt) : 0,
    )
    .map((row) => {
      const rid = recordIdToString(row.id);
      const dataId = escapeHtml(rid);
      const checked = row.completed ? "checked" : "";
      const doneClass = row.completed ? "done" : "";
      return `<li class="todo-item ${doneClass}" data-id="${dataId}">
        <label>
          <input type="checkbox" data-action="toggle" ${checked} />
          <span>${escapeHtml(row.text)}</span>
        </label>
        <button type="button" data-action="delete">Delete</button>
      </li>`;
    })
    .join("");
};

const listTodos = async () => {
  const rawRows = await db.query<unknown>(
    "SELECT * FROM todo ORDER BY createdAt DESC;",
  );
  const rows = normalizeTodoRows(rawRows);
  renderTodos(rows ?? []);
};

const createTodo = async (text: string) => {
  await db.query(
    "CREATE todo CONTENT { text: $text, completed: false, createdAt: time::now() };",
    {
      text,
    },
  );
};

const setTodoCompleted = async (rid: string, completed: boolean) => {
  await db.query(
    "UPDATE type::thing('todo', $id) SET completed = $completed;",
    {
      id: shortId(rid),
      completed,
    },
  );
};

const deleteTodo = async (rid: string) => {
  await db.query("DELETE type::thing('todo', $id);", { id: shortId(rid) });
};

const initialize = async () => {
  setStatus("Connecting...");

  try {
    await db.connect();
    await db.use({ namespace: "app", database: "app" });
    await listTodos();
    setStatus("Connected");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) {
    return;
  }

  try {
    await createTodo(text);
    input.value = "";
    await listTodos();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
});

refreshButton.addEventListener("click", async () => {
  try {
    await listTodos();
    setStatus("Synced");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
});

list.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement;
  const action = target.getAttribute("data-action");
  if (!action) {
    return;
  }

  const item = target.closest<HTMLLIElement>("li[data-id]");
  const rid = item?.dataset.id;
  if (!rid) {
    return;
  }

  try {
    if (action === "delete") {
      await deleteTodo(rid);
      await listTodos();
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
});

list.addEventListener("change", async (event) => {
  const target = event.target as HTMLInputElement;
  if (target.getAttribute("data-action") !== "toggle") {
    return;
  }

  const item = target.closest<HTMLLIElement>("li[data-id]");
  const rid = item?.dataset.id;
  if (!rid) {
    return;
  }

  try {
    await setTodoCompleted(rid, target.checked);
    await listTodos();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
});

window.addEventListener("beforeunload", () => {
  void db.close();
});

void initialize();
