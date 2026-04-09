import test from "node:test";
import assert from "node:assert/strict";
import { Surreal } from "../dist/index.js";

test("Surreal wrapper delegates to transport", async () => {
    const calls = [];

    const mockTransport = {
        async connect() {
            calls.push("connect");
        },
        async health() {
            calls.push("health");
            return { ok: true, message: "ok" };
        },
        async use(params) {
            calls.push(["use", params]);
        },
        async signin(params) {
            calls.push(["signin", params]);
        },
        async query(sql, vars) {
            calls.push(["query", sql, vars]);
            return [{ connected: true }];
        },
        async close() {
            calls.push("close");
        },
    };

    const db = new Surreal(mockTransport);
    await db.connect();
    const health = await db.health();
    await db.use({ namespace: "app", database: "app" });
    await db.signin({ username: "u", password: "p" });
    const result = await db.query("RETURN true", { v: 1 });
    await db.close();

    assert.deepEqual(health, { ok: true, message: "ok" });
    assert.deepEqual(result, [{ connected: true }]);
    assert.equal(calls[0], "connect");
    assert.equal(calls.at(-1), "close");
});
