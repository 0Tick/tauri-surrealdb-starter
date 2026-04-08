/**
 * Tauri Todo – main entry point
 *
 * Uses the @tauri-surrealdb-starter/transport package to talk to the
 * embedded SurrealDB instance running inside the Tauri Rust backend.
 */

import { createSurrealClient } from "@tauri-surrealdb-starter/transport";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Todo {
  id: string; // SurrealDB record ID, e.g. "todo:abc123"
  title: string;
  completed: boolean;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DOM refs
// ─────────────────────────────────────────────────────────────────────────────

const form = document.getElementById("add-form") as HTMLFormElement;
const input = document.getElementById("todo-input") as HTMLInputElement;
const list = document.getElementById("todo-list") as HTMLUListElement;
const statusEl = document.getElementById("status") as HTMLParagraphElement;

// ─────────────────────────────────────────────────────────────────────────────
// DB client
// ─────────────────────────────────────────────────────────────────────────────

const db = createSurrealClient();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function setStatus(msg: string, isError = false): void {
  statusEl.textContent = msg;
  statusEl.className = isError ? "status error" : "status";
}

function clearStatus(): void {
  statusEl.textContent = "";
  statusEl.className = "status";
}

// ─────────────────────────────────────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────────────────────────────────────

function renderTodos(todos: Todo[]): void {
  list.innerHTML = "";

  if (todos.length === 0) {
    list.innerHTML =
      '<li class="empty-state">No todos yet. Add one above!</li>';
    return;
  }

  for (const todo of todos) {
    const li = document.createElement("li");
    li.className = `todo-item${todo.completed ? " completed" : ""}`;
    li.dataset["id"] = todo.id;

    // Checkbox
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.completed;
    checkbox.addEventListener("change", () => toggleTodo(todo));

    // Title
    const span = document.createElement("span");
    span.className = "todo-title";
    span.textContent = todo.title;

    // Delete button
    const del = document.createElement("button");
    del.className = "btn-delete";
    del.title = "Delete";
    del.textContent = "✕";
    del.addEventListener("click", () => deleteTodo(todo.id));

    li.append(checkbox, span, del);
    list.appendChild(li);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD operations
// ─────────────────────────────────────────────────────────────────────────────

async function loadTodos(): Promise<void> {
  setStatus("Loading…");
  try {
    const todos = await db.select<Todo>("todo");
    // Sort: incomplete first, then by created_at ascending
    todos.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return a.created_at < b.created_at ? -1 : 1;
    });
    renderTodos(todos);
    clearStatus();
  } catch (err) {
    setStatus(`Error loading todos: ${String(err)}`, true);
  }
}

async function addTodo(title: string): Promise<void> {
  setStatus("Saving…");
  try {
    await db.create("todo", {
      title: title.trim(),
      completed: false,
      created_at: new Date().toISOString(),
    });
    await loadTodos();
  } catch (err) {
    setStatus(`Error adding todo: ${String(err)}`, true);
  }
}

async function toggleTodo(todo: Todo): Promise<void> {
  try {
    await db.merge(todo.id, { completed: !todo.completed });
    await loadTodos();
  } catch (err) {
    setStatus(`Error updating todo: ${String(err)}`, true);
  }
}

async function deleteTodo(id: string): Promise<void> {
  try {
    await db.delete(id);
    await loadTodos();
  } catch (err) {
    setStatus(`Error deleting todo: ${String(err)}`, true);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Event listeners
// ─────────────────────────────────────────────────────────────────────────────

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = input.value.trim();
  if (!title) return;
  input.value = "";
  await addTodo(title);
});

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  setStatus("Connecting to database…");
  try {
    // Explicitly set ns/db (the Rust backend defaults to ns=default db=todos,
    // but calling use() here makes the session explicit and demonstrates usage)
    await db.use("default", "todos");
    await loadTodos();
  } catch (err) {
    setStatus(`Failed to initialise: ${String(err)}`, true);
  }
}

init();
