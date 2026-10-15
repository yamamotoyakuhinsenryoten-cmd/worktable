import assert from "node:assert/strict";
import test from "node:test";
import { buildTodoDraftPrompt, parseTodoDraft, selectTodoContext, todoDraftGenerationError } from "../lib/todo-draft.ts";

const messages = Array.from({ length: 9 }, (_, index) => ({
  role: index % 2 ? "assistant" : "user",
  content: `message-${index}`,
}));

test("TODO context includes up to three messages on each side in conversation order", () => {
  const result = selectTodoContext(messages, 4);
  assert.deepEqual(result.context.map(message => message.content), ["message-1", "message-2", "message-3", "message-4", "message-5", "message-6", "message-7"]);
  assert.equal(result.selected.content, "message-4");
  assert.equal(result.selectedIndex, 3);
});

test("TODO context trims to existing messages at conversation boundaries", () => {
  assert.deepEqual(selectTodoContext(messages, 0).context.map(message => message.content), ["message-0", "message-1", "message-2", "message-3"]);
  assert.deepEqual(selectTodoContext(messages, 8).context.map(message => message.content), ["message-5", "message-6", "message-7", "message-8"]);
});

test("TODO prompt identifies the selected message as primary source", () => {
  const prompt = buildTodoDraftPrompt(messages[2], messages.slice(0, 5));
  assert.match(prompt, /選択されたメッセージがTODOの主な情報源/u);
  assert.match(prompt, /<selected>/u);
  assert.match(prompt, /<context>/u);
});

test("TODO draft parsing requires a nonempty title and string content", () => {
  assert.deepEqual(parseTodoDraft('{"title":"  実装する  ","content":"詳細"}'), { title: "実装する", content: "詳細" });
  assert.equal(parseTodoDraft('{"title":" ","content":"x"}'), null);
  assert.equal(parseTodoDraft('{"title":"ok","content":2}'), null);
  assert.equal(parseTodoDraft("not json"), null);
});

test("generation error is shown only for a nonempty error string", () => {
  assert.equal(todoDraftGenerationError(""), "");
  assert.equal(todoDraftGenerationError("  \n"), "");
  assert.equal(todoDraftGenerationError(undefined), "");
  assert.equal(todoDraftGenerationError("AI request failed"), "AI request failed");
});
