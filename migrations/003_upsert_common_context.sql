-- Re-runnable seed for the shared chat context. This only inserts or updates `common`.
INSERT INTO category_contexts (category_id, body)
VALUES (
  'common',
$common$# 共通コンテキスト

## 生活・時間的な制約

- 子どもが2人いる。
- 育児のため、活動に使える時間や行動範囲に制約がある。
- 平日は10:00〜16:30の時短勤務をしている。
- 提案するときは、時間や行動範囲の制約を考慮し、無理なく実行できる方法を優先する。
- 実際に使える時間や移動可能な範囲は決めつけず、必要に応じて確認する。$common$
)
ON CONFLICT (category_id) DO UPDATE
SET body = EXCLUDED.body, updated_at = NOW();
