import assert from "node:assert/strict";
import test from "node:test";
import { buildInstagramCaption, safeExternalError, selectInstagramImages } from "../lib/instagram.ts";

test("caption follows the existing site format", () => {
  assert.equal(buildInstagramCaption({
    title: "作品タイトル",
    details: [{ label: "豆", value: "Brazil" }, { label: "焙煎日", value: "2026-10-18" }],
    insights: ["香ばしい", "次回は火力を調整"],
  }), "作品タイトル\n\n豆: Brazil\n焙煎日: 2026-10-18\n\n・香ばしい\n・次回は火力を調整");
});

test("Instagram images retain media order and are capped at ten", () => {
  const media = [
    { type: "video", src: "video" },
    ...Array.from({ length: 12 }, (_, index) => ({ type: "image", src: `image-${index + 1}` })),
  ];
  const selected = selectInstagramImages(media);
  assert.deepEqual(selected.images.map(({ src }) => src), Array.from({ length: 10 }, (_, index) => `image-${index + 1}`));
  assert.equal(selected.totalImageCount, 12);
});

test("external errors redact configured secrets and access tokens", () => {
  assert.equal(safeExternalError(new Error("failed with super-secret access_token=other-secret&x=1"), ["super-secret"]), "failed with [非表示] access_token=[非表示]&x=1");
});
