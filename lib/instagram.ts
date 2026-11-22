export type InstagramLog = {
  slug: string;
  type: "work" | "experience" | "development";
  category: string;
  title: string;
  details: { label: string; value: string }[];
  insights: string[];
  media: { type: string; src: string; caption?: string }[];
};

/**
 * カテゴリごとに、投稿へ毎回付ける固定タグを定義します。
 *
 * 1. 入力されたカテゴリに対応するタグ一覧を参照します。
 * 2. 一致する一覧を固定タグとして返します。
 * @example category="焙煎" // => ["#コーヒー焙煎", "#自家焙煎", "#手鍋焙煎", "#コーヒー好き"]
 */
const FIXED_TAGS: Record<string, string[]> = {
  焙煎: ["#コーヒー焙煎", "#自家焙煎", "#手鍋焙煎", "#コーヒー好き"],
  縫物: ["#手作り", "#ハンドメイド", "#手縫い", "#縫い物"],
  染物: ["#草木染め", "#手染め", "#染め物"],
  コーヒー店: ["#カフェ巡り", "#コーヒー好き", "#コーヒー店巡り"],
  コーヒー豆: ["#コーヒー豆", "#スペシャルティコーヒー", "#コーヒー好き"],
};

/**
 * ログの詳細欄から、指定した名前の値を取り出します。
 *
 * 1. 詳細欄から名前が一致する最初の項目を探します。
 * 2. 値を返し、該当項目がなければ空文字を返します。
 * @example detailValue({details:[{label:"産地",value:"ニカラグア"}]}, "産地") // => "ニカラグア"
 */
function detailValue(log: Pick<InstagramLog, "details">, label: string) {
  // ?? は値がない場合だけ、代わりに空文字を使います。
  return log.details.find((detail) => detail.label === label)?.value ?? "";
}

/**
 * 動的タグに使う値から、前後と中の空白や記号を取り除きます。
 *
 * 1. 前後の空白を取り除きます。
 * 2. 句読点・記号・空白を取り除いた値を返します。
 * @example cleanTagValue(" ニカラグア・SHG ") // => "ニカラグアSHG"
 */
function cleanTagValue(value: string) {
  // 正規表現は文字の種類をまとめて指定し、Unicodeの句読点・記号・空白を除きます。
  return value.trim().replace(/[\p{P}\p{S}\s]/gu, "");
}

/**
 * カテゴリに応じて、動的タグの元になる値を集めます。
 *
 * 1. 焙煎: 産地・農園・グレード・焙煎度を選びます。
 * 2. 縫物: 制作物・対象を選びます。染物: タイトルの「 #」より前と材質を選びます。
 * 3. コーヒー店: 店名を＠や括弧で分け、店名とエリアを選びます。
 * 4. コーヒー豆: 産地を「、」で分けて焙煎度を加えます。その他は空の一覧です。
 * @example dynamicTagValues({category:"コーヒー豆",details:[{label:"産地",value:"ブラジル、グアテマラ"},{label:"焙煎度",value:"中煎り"}]}) // => ["ブラジル", "グアテマラ", "中煎り"]
 */
function dynamicTagValues(log: Pick<InstagramLog, "category" | "title" | "details">) {
  switch (log.category) {
    case "焙煎":
      return ["産地", "農園", "グレード", "焙煎度"].map((label) => detailValue(log, label));
    case "縫物":
      return ["制作物", "対象"].map((label) => detailValue(log, label));
    case "染物":
      // splitでタイトルを「 #」の位置で分け、先頭の方法名を取ります。
      return [log.title.split(" #", 1)[0], detailValue(log, "染めたものの材質")];
    case "コーヒー店": {
      const place = detailValue(log, "店名");
      // 正規表現で、店名とエリアを分ける最初の記号を探します。
      const split = place.search(/[＠@(（]/);
      // 三項演算子は、区切りがある場合とない場合で返す値を選びます。
      return split < 0 ? [place] : [place.slice(0, split), place.slice(split + 1)];
    }
    case "コーヒー豆":
      return [...detailValue(log, "産地").split("、"), detailValue(log, "焙煎度")];
    default:
      return [];
  }
}

/**
 * ログの内容から、投稿に付けるタグ一覧を作ります。
 *
 * 1. developmentはタグなしにし、それ以外はカテゴリの固定タグから始めます。
 * 2. 動的な値を整え、空欄と固定・動的間の重複を除いて追加します。
 * 3. 固定タグを残し、現在の固定タグ数を前提に合計30個まで動的タグを加えます。
 * Setは重複しない値を記録する仕組みで、大文字小文字をそろえて重複を見分けます。
 * @example buildTags({type:"work",category:"縫物",title:"記録",details:[{label:"制作物",value:"アロハシャツ"}]}) // => ["#手作り", "#ハンドメイド", "#手縫い", "#縫い物", "#アロハシャツ"]
 */
function buildTags(log: Pick<InstagramLog, "type" | "category" | "title" | "details">) {
  if (log.type === "development") return [];
  const fixed = FIXED_TAGS[log.category] ?? [];
  const tags = [...fixed];
  // Setは同じ値を一度だけ記録し、タグの重複を判定します。
  const seen = new Set(fixed.map((tag) => tag.slice(1).toLocaleLowerCase()));
  for (const value of dynamicTagValues(log)) {
    const cleaned = cleanTagValue(value);
    const key = cleaned.toLocaleLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    tags.push(`#${cleaned}`);
  }
  return [...fixed, ...tags.slice(fixed.length, 30)];
}

/**
 * タイトル・詳細・考察を並べた本文を作り、タグがあれば末尾に追加します。
 *
 * 1. 詳細と考察を従来の形式で本文にまとめます。
 * 2. タグを作り、ある場合は空行の後ろにスペース区切りで追加します。
 * @example buildInstagramCaption({type:"work",category:"焙煎",title:"記録",details:[{label:"産地",value:"ニカラグア"}],insights:[]}) // => "記録\n\n産地: ニカラグア\n\n#コーヒー焙煎 #自家焙煎 #手鍋焙煎 #コーヒー好き #ニカラグア"
 */
export function buildInstagramCaption(log: Pick<InstagramLog, "type" | "category" | "title" | "details" | "insights">) {
  const details = log.details
    .map((detail) => `${detail.label}: ${detail.value}`)
    .join("\n");
  const insights = log.insights.length
    ? `\n\n${log.insights.map((insight) => `・${insight}`).join("\n")}`
    : "";

  const caption = `${log.title}\n\n${details}${insights}`;
  const tags = buildTags(log);
  return tags.length ? `${caption}\n\n${tags.join(" ")}` : caption;
}

export function selectInstagramImages<T extends { type: string }>(media: T[]) {
  const images = media.filter((item) => item.type === "image");
  return { images: images.slice(0, 10), totalImageCount: images.length };
}

export function safeExternalError(error: unknown, secrets: string[]) {
  let message = error instanceof Error ? error.message : "不明なエラー";
  for (const secret of secrets) {
    if (secret) message = message.split(secret).join("[非表示]");
  }
  return message.replace(/access_token[=:][^&\s"']+/gi, "access_token=[非表示]");
}
