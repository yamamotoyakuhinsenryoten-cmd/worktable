import assert from "node:assert/strict";
import test from "node:test";
import { isLogFilePresent } from "../lib/log-file.ts";

test("reports a log file as present when filesystem access succeeds", async () => {
  assert.equal(await isLogFilePresent("data/logs/work/example.ts", async () => {}), true);
});

test("treats only ENOENT as an unregistered log", async () => {
  const missing = Object.assign(new Error("missing"), { code: "ENOENT" });
  assert.equal(await isLogFilePresent("data/logs/work/example.ts", async () => { throw missing; }), false);
});

test("propagates permission and other filesystem errors", async () => {
  const denied = Object.assign(new Error("denied"), { code: "EACCES" });
  await assert.rejects(
    isLogFilePresent("data/logs/work/example.ts", async () => { throw denied; }),
    (error) => error === denied,
  );
});
