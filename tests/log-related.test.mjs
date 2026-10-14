import assert from "node:assert/strict";
import test from "node:test";
import { emptyLogDraft, validateLogDraft } from "../lib/log-schema.ts";

test("accepts an empty related list and every existing related variant", () => {
  const draft = emptyLogDraft("work", "縫物", "sample-001");
  assert.equal(validateLogDraft(draft), true);

  for (const related of [
    { kind: "external", title: "参考リンク", url: "https://example.com" },
    { kind: "log", title: "関連ログ", slug: "related-log-001" },
    { kind: "backlog", title: "Backlog項目", id: "BL-123" },
  ]) {
    assert.equal(validateLogDraft({ ...draft, related: [related] }), true);
  }
});

test("rejects related variants missing their type-specific field", () => {
  const draft = emptyLogDraft("work", "縫物", "sample-001");
  for (const related of [
    { kind: "external", title: "リンク" },
    { kind: "log", title: "ログ" },
    { kind: "backlog", title: "Backlog" },
    { kind: "unknown", title: "不明", id: "1" },
  ]) {
    assert.equal(validateLogDraft({ ...draft, related: [related] }), false);
  }
});
