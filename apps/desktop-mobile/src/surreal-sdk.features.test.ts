import { describe, expect, it } from "vitest";
import { Surreal } from "../../../packages/surrealdb-js-tauri/src/index";

class MockTransport {
  public readonly operations: Array<string> = [];
  public readonly statements: Array<{
    sql: string;
    vars?: Record<string, unknown>;
  }> = [];

  async connect(): Promise<void> {}

  async health(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: "ok" };
  }

  async version(): Promise<{ version: string }> {
    return { version: "surrealdb-2.6.5" };
  }

  async use(): Promise<void> {}

  async signup(): Promise<unknown> {
    this.operations.push("signup");
    return { access: "token" };
  }

  async signin(): Promise<unknown> {
    this.operations.push("signin");
    return { access: "token" };
  }

  async authenticate(): Promise<void> {
    this.operations.push("authenticate");
  }

  async invalidate(): Promise<void> {
    this.operations.push("invalidate");
  }

  async setParam(): Promise<void> {
    this.operations.push("setParam");
  }

  async unsetParam(): Promise<void> {
    this.operations.push("unsetParam");
  }

  async info(): Promise<unknown> {
    this.operations.push("info");
    return { tables: { todo: "SCHEMALESS" } };
  }

  async select(): Promise<unknown> {
    this.operations.push("select");
    return [{ id: "todo:1", text: "write tests", completed: false }];
  }

  async create(): Promise<unknown> {
    this.operations.push("create");
    return { id: "todo:1" };
  }

  async insert(): Promise<unknown> {
    this.operations.push("insert");
    return [{ id: "todo:2" }];
  }

  async update(): Promise<unknown> {
    this.operations.push("update");
    return { id: "todo:1" };
  }

  async upsert(): Promise<unknown> {
    this.operations.push("upsert");
    return { id: "todo:1" };
  }

  async merge(): Promise<unknown> {
    this.operations.push("merge");
    return { id: "todo:1" };
  }

  async patch(): Promise<unknown> {
    this.operations.push("patch");
    return { id: "todo:1" };
  }

  async delete(): Promise<unknown> {
    this.operations.push("delete");
    return { id: "todo:1" };
  }

  async relate(): Promise<unknown> {
    this.operations.push("relate");
    return { id: "edge:1" };
  }

  async run(): Promise<unknown> {
    this.operations.push("run");
    return 3;
  }

  async query<T = unknown>(
    sql: string,
    vars?: Record<string, unknown>,
  ): Promise<T> {
    this.statements.push({ sql, vars });

    if (sql.startsWith("SELECT * FROM todo")) {
      return [[{ id: "todo:1", text: "write tests", completed: false }]] as T;
    }

    return [null] as T;
  }

  async close(): Promise<void> {}
}

describe("Surreal SDK feature coverage", () => {
  it("supports connection/session/auth helpers", async () => {
    const transport = new MockTransport();
    const db = new Surreal(transport);

    await db.connect("tauri://", {
      namespace: "app",
      database: "app",
    });

    const token = await db.signin<{ access: string }>({
      username: "demo",
      password: "demo",
    });

    const version = await db.version();
    const info = await db.info<{ tables: Record<string, string> }>();

    expect(token.access).toBe("token");
    expect(version.version).toContain("surrealdb");
    expect(info.tables.todo).toBe("SCHEMALESS");
    expect((await db.db()).namespace).toBe("app");
  });

  it("supports CRUD/query-oriented methods", async () => {
    const transport = new MockTransport();
    const db = new Surreal(transport);

    const [todos] = await db.query<
      [Array<{ id: string; text: string; completed: boolean }>]
    >("SELECT * FROM todo ORDER BY createdAt DESC;");

    await db.create("todo", { text: "a" });
    await db.insert("todo", [{ text: "b" }]);
    await db.update("todo:1", { text: "c" });
    await db.merge("todo:1", { done: true });
    await db.patch("todo:1", [{ op: "replace", path: "/text", value: "d" }]);
    await db.upsert("todo:1", { text: "e" });
    await db.delete("todo:1");
    await db.relate("user:1", "owns", "todo:1", { role: "owner" });
    await db.run("string::length", "abc");
    await db.let("x", 42);
    await db.unset("x");

    expect(Array.isArray(todos)).toBe(true);
    expect(todos[0].text).toBe("write tests");

    expect(transport.operations.includes("create")).toBe(true);
    expect(transport.operations.includes("patch")).toBe(true);
    expect(transport.operations.includes("relate")).toBe(true);
    expect(transport.operations.includes("unsetParam")).toBe(true);
  });
});
