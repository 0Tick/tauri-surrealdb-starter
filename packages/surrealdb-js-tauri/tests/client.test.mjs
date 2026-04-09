import test from "node:test";
import assert from "node:assert/strict";
import { Surreal } from "../dist/index.js";

test("Surreal query returns statement result array", async () => {
    const calls = [];

    const mockTransport = {
        async connect() {
            calls.push("connect");
        },
        async health() {
            calls.push("health");
            return { ok: true, message: "ok" };
        },
        async version() {
            calls.push("version");
            return { version: "surrealdb-2.6.5" };
        },
        async use(params) {
            calls.push(["use", params]);
        },
        async signup(params) {
            calls.push(["signup", params]);
            return { token: "signup-token" };
        },
        async signin(params) {
            calls.push(["signin", params]);
            return { token: "signin-token" };
        },
        async authenticate(token) {
            calls.push(["authenticate", token]);
        },
        async invalidate() {
            calls.push("invalidate");
        },
        async setParam(name, value) {
            calls.push(["setParam", name, value]);
        },
        async unsetParam(name) {
            calls.push(["unsetParam", name]);
        },
        async info() {
            calls.push("info");
            return { Object: { tables: { Object: { todo: { Strand: "SCHEMALESS" } } } } };
        },
        async select(resource) {
            calls.push(["select", resource]);
            return [
                {
                    Object: {
                        id: { Thing: { tb: "todo", id: { String: "abc" } } },
                        text: { Strand: "task" },
                        completed: { Bool: false },
                    },
                },
            ];
        },
        async create(resource, data) {
            calls.push(["create", resource, data]);
            return { id: "person:john" };
        },
        async insert(resource, data) {
            calls.push(["insert", resource, data]);
            return [{ id: "person:a" }];
        },
        async update(resource, data) {
            calls.push(["update", resource, data]);
            return { id: String(resource) };
        },
        async upsert(resource, data) {
            calls.push(["upsert", resource, data]);
            return { id: String(resource) };
        },
        async merge(resource, data) {
            calls.push(["merge", resource, data]);
            return { id: String(resource) };
        },
        async patch(resource, diff) {
            calls.push(["patch", resource, diff]);
            return { id: String(resource) };
        },
        async delete(resource) {
            calls.push(["delete", resource]);
            return { id: String(resource) };
        },
        async relate(from, relation, to, data) {
            calls.push(["relate", from, relation, to, data]);
            return { id: `${from}->${relation}->${to}` };
        },
        async run(name, args) {
            calls.push(["run", name, args]);
            return 3;
        },
        async query(sql, vars) {
            calls.push(["query", sql, vars]);
            if (sql.startsWith("SELECT")) {
                return [
                    [
                        {
                            Object: {
                                id: { Thing: { tb: "todo", id: { String: "abc" } } },
                                text: { Strand: "task" },
                                completed: { Bool: false },
                            },
                        },
                    ],
                ];
            }
            return [true];
        },
        async close() {
            calls.push("close");
        },
    };

    const db = new Surreal(mockTransport);
    await db.connect("tauri://", {
        namespace: "app",
        database: "app",
    });

    const [rows] = await db.query("SELECT * FROM todo;");
    const version = await db.version();
    const selected = await db.select("todo");
    await db.close();

    assert.equal(Array.isArray(rows), true);
    assert.deepEqual(rows[0], {
        id: { tb: "todo", id: "abc" },
        text: "task",
        completed: false,
    });
    assert.deepEqual(version, { version: "surrealdb-2.6.5" });
    assert.equal(Array.isArray(selected), true);
    assert.equal(calls[0], "connect");
    assert.equal(calls.at(-1), "close");
});

test("Surreal high-level methods compile expected operations", async () => {
    const operations = [];
    const mockTransport = {
        async connect() { },
        async health() {
            return { ok: true, message: "ok" };
        },
        async version() {
            return { version: "surrealdb-2.6.5" };
        },
        async use() { },
        async signup(params) {
            operations.push(["signup", params]);
            return { ok: true };
        },
        async signin(params) {
            operations.push(["signin", params]);
            return { ok: true };
        },
        async authenticate(token) {
            operations.push(["authenticate", token]);
        },
        async invalidate() {
            operations.push(["invalidate"]);
        },
        async setParam(name, value) {
            operations.push(["setParam", name, value]);
        },
        async unsetParam(name) {
            operations.push(["unsetParam", name]);
        },
        async info() {
            operations.push(["info"]);
            return { tables: { todo: "SCHEMALESS" } };
        },
        async select(resource) {
            operations.push(["select", resource]);
            return [];
        },
        async create(resource, data) {
            operations.push(["create", resource, data]);
            return null;
        },
        async insert(resource, data) {
            operations.push(["insert", resource, data]);
            return null;
        },
        async update(resource, data) {
            operations.push(["update", resource, data]);
            return null;
        },
        async upsert(resource, data) {
            operations.push(["upsert", resource, data]);
            return null;
        },
        async merge(resource, data) {
            operations.push(["merge", resource, data]);
            return null;
        },
        async patch(resource, diff) {
            operations.push(["patch", resource, diff]);
            return null;
        },
        async delete(resource) {
            operations.push(["delete", resource]);
            return null;
        },
        async relate(from, relation, to, data) {
            operations.push(["relate", from, relation, to, data]);
            return null;
        },
        async run(name, args) {
            operations.push(["run", name, args]);
            return 3;
        },
        async query(sql, vars) {
            operations.push(["query", sql, vars]);
            return [null];
        },
        async close() { },
    };

    const db = new Surreal(mockTransport);
    await db.signup({ user: "a" });
    await db.signin({ user: "a" });
    await db.authenticate("token");
    await db.invalidate();
    await db.info();
    await db.create("person", { name: "John" });
    await db.select("person");
    await db.insert("person", [{ name: "A" }]);
    await db.update("person:john", { name: "Jane" });
    await db.merge("person:john", { active: true });
    await db.patch("person:john", [{ op: "replace", path: "/name", value: "J" }]);
    await db.upsert("person:john", { name: "J" });
    await db.delete("person:john");
    await db.relate("person:john", "likes", "movie:matrix", { rating: 5 });
    await db.run("string::length", "abc");
    await db.let("x", 1);
    await db.unset("x");

    const opNames = operations.map((entry) => entry[0]);
    assert.equal(opNames.includes("create"), true);
    assert.equal(opNames.includes("insert"), true);
    assert.equal(opNames.includes("patch"), true);
    assert.equal(opNames.includes("relate"), true);
    assert.equal(opNames.includes("unsetParam"), true);
});
