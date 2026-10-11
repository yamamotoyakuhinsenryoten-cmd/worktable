import assert from "node:assert/strict";
import test from "node:test";
import { parseCategoryClassification } from "../lib/category-classification.ts";
import { CATEGORIES } from "../lib/categories.ts";

const allowedIds = CATEGORIES.map(({ id }) => id);

test("accepts one or multiple known categories", () => {
  assert.deepEqual(parseCategoryClassification('{"categoryIds":["roasting"]}', allowedIds), {
    categoryIds: ["roasting"],
    status: "classified",
  });
  assert.deepEqual(parseCategoryClassification('{"categoryIds":["ai","website-development"]}', allowedIds), {
    categoryIds: ["ai", "website-development"],
    status: "classified",
  });
});

test("treats an empty array as unclassified", () => {
  assert.deepEqual(parseCategoryClassification('{"categoryIds":[]}', allowedIds), {
    categoryIds: [],
    status: "unclassified",
  });
});

test("rejects unknown, duplicate, excessive, and malformed outputs", () => {
  for (const output of [
    '{"categoryIds":["not-a-category"]}',
    '{"categoryIds":["roasting","roasting"]}',
    '{"categoryIds":["roasting","dyeing","sewing","ai"]}',
    "not json",
  ]) {
    assert.deepEqual(parseCategoryClassification(output, allowedIds), {
      categoryIds: [],
      status: "invalid_output",
    });
  }
});
