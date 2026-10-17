import assert from "node:assert/strict";
import test from "node:test";
import { findMediaArrayStart } from "../lib/log-media/findMediaArrayStart.ts";

test("finds an unquoted media array key", () => {
  const code = "export const log = { media: [] };";
  assert.equal(code.slice(findMediaArrayStart(code)), "media: [] };");
});

test("finds a quoted media array key", () => {
  const code = 'export const log = { "media": [] };';
  assert.equal(code.slice(findMediaArrayStart(code)), '"media": [] };');
});

test("returns -1 when a media array is absent", () => {
  assert.equal(findMediaArrayStart("export const log = { title: 'example' };"), -1);
});
