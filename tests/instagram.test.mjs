import assert from "node:assert/strict";
import test from "node:test";
import { buildInstagramCaption, safeExternalError, selectInstagramImages } from "../lib/instagram.ts";

test("caption follows the existing site format", () => {
  assert.equal(buildInstagramCaption({
    type: "work",
    category: "焙煎",
    title: "作品タイトル",
    details: [{ label: "豆", value: "Brazil" }, { label: "焙煎日", value: "2026-10-18" }],
    insights: ["香ばしい", "次回は火力を調整"],
  }), "作品タイトル\n\n豆: Brazil\n焙煎日: 2026-10-18\n\n・香ばしい\n・次回は火力を調整\n\n#コーヒー焙煎 #自家焙煎 #手鍋焙煎 #コーヒー好き");
});

const caption = (category, details = [], title = "記録", type = "work", insights = []) =>
  buildInstagramCaption({ category, details, title, type, insights });

test("fixed and category-specific dynamic tags are appended in order", () => {
  assert.match(caption("焙煎", [
    { label: "産地", value: "ニカラグア" }, { label: "農園", value: "サンタアナ農園" },
    { label: "グレード", value: "SHG" }, { label: "焙煎度", value: "深煎り" },
  ]), /#コーヒー好き #ニカラグア #サンタアナ農園 #SHG #深煎り$/);
  assert.match(caption("縫物", [{ label: "制作物", value: "アロハシャツ" }, { label: "対象", value: "子ども" }]), /#縫い物 #アロハシャツ #子ども$/);
  assert.match(caption("染物", [{ label: "染めたものの材質", value: "オックス" }], "コーヒー染め #6｜布"), /#染め物 #コーヒー染め #オックス$/);
  assert.match(caption("コーヒー店", [{ label: "店名", value: "マーメイドコーヒー(明大前)" }], "店 #1", "experience"), /#コーヒー店巡り #マーメイドコーヒー #明大前$/);
  assert.match(caption("コーヒー豆", [{ label: "産地", value: "ブラジル、グアテマラ" }, { label: "焙煎度", value: "中煎り" }], "豆 #1", "experience"), /#コーヒー豆 #スペシャルティコーヒー #コーヒー好き #ブラジル #グアテマラ #中煎り$/);
});

test("blank values and insights do not produce dynamic tags; development has no tags", () => {
  const noValues = caption("縫物", [{ label: "制作物", value: "  " }, { label: "対象", value: "" }], "作品", "work", ["考察にあるタグ候補"]);
  assert.match(noValues, /\n\n#手作り #ハンドメイド #手縫い #縫い物$/);
  assert.doesNotMatch(noValues, /#考察にあるタグ候補/);
  assert.equal(caption("AI", [{ label: "値", value: "対象外" }], "開発ログ", "development"), "開発ログ\n\n値: 対象外");
});

test("dynamic values are normalized, symbols removed, and duplicates ignored case-insensitively", () => {
  assert.match(caption("焙煎", [
    { label: "産地", value: " ニカラグア ・ ＠試験 | ｜ " },
    { label: "農園", value: "ニカラグア ・ ＠試験 | ｜" }, { label: "グレード", value: "SHG" }, { label: "焙煎度", value: "深 煎 り" },
  ]), /#ニカラグア試験 #SHG #深煎り$/);
});

test("tags are capped at thirty while fixed tags remain", () => {
  const details = Array.from({ length: 40 }, (_, index) => ({ label: `産地${index}`, value: `tag${index}` }));
  details.push({ label: "産地", value: Array.from({ length: 40 }, (_, index) => `tag${index}`).join("、") });
  const tags = caption("コーヒー豆", details, "豆", "experience").split("\n\n").at(-1).split(" ");
  assert.equal(tags.length, 30);
  assert.deepEqual(tags.slice(0, 3), ["#コーヒー豆", "#スペシャルティコーヒー", "#コーヒー好き"]);
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
