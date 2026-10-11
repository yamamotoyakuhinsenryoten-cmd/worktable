-- Categories remain code-owned in lib/categories.ts. This table stores only shared,
-- category-specific prompt context, keyed by the stable code category ID.
CREATE TABLE IF NOT EXISTS category_contexts (
  category_id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO category_contexts (category_id, body) VALUES
('roasting', $context$
タイトルは「豆の名前 #焙煎回数｜手法｜焙煎度」。detailsは以下をすべて含め、値が不明なら空文字にする。
基本: 焙煎日(YYYY/M/D)、焙煎手法(手鍋/土鍋/焙煎機)、焙煎度(浅煎り/中浅煎り/中煎り/中深煎り/深煎り)、焙煎前(g)、焙煎後(g)、減少率(約○%)。
豆: 豆(名前)、産地、農園、品種、精製方法、標高、グレード。
ハンドピック: ハンドピック前(g)、ハンドピック後(g)、除去(g)、欠点豆率(約○%)、欠点豆数(個)、欠点豆内訳。
焙煎: 投入温度(約○℃)、火力変更(分:秒)、1ハゼ(分:秒)、2ハゼ(分:秒)、終了(分:秒)。
豆名はdetailsの「豆」から、焙煎度は実際の仕上がりから記載する。情報のない項目は補完しない。approach/resultは今回の方針と実際の結果、insightsは本人の考察、nextは次回試したいことを配列で記録する。
$context$),
('dyeing', $context$
タイトルは「染色方法 #実施回数｜染めたもの」。染色方法はコーヒー染め・玉ねぎ染めなど、染めたものはdetailsの同名項目から使う。
details: 基本=染めた日(YYYY/M/D)、染めたもの(対象名・色・サイズ・数量)、染めたものの材質。下処理=材料名・分量・処理内容。染色=染液(材料・数値・単位)、染色時間(1回あたり○時間)、重ね染め(○回)。媒染=媒染剤名・数値・単位・時間。
値は会話にある情報だけを記載し、未知の値は空文字にする。approach/result/insights/nextは固定の構造に従い、次回の方針はnextに分ける。
$context$),
('sewing', $context$
タイトルは「作品名 #制作回数」。素材などの補足が有用な場合のみ「｜素材・特徴」を付ける。
details: 基本=制作物、対象(男性/女性/子ども)、作品カテゴリ(服/バッグ・袋物/寝具/その他)、生地、その他材料、制作方法(手縫い/ミシン/手縫い(一部ミシン)/ミシン(一部手縫い))、制作期間(YYYY/M/D〜YYYY/M/D頃)。カテゴリは「縫物」。
同じ作品の制作回数を使う。情報がない項目は空文字にし、制作手順や結果をdetailsに混ぜずapproach/result/insights/nextに整理する。
$context$),
('coffee-shop', $context$
タイトルは「店名(エリア) #訪問回数」。エリアが不明なら「店名 #訪問回数」。同じ店でもエリアが違えば別店舗として扱う。
details: 基本=店名(分かる場合は店名(エリア))、訪問日時(YYYY/M/D・時間帯)、オーダー。コーヒー=注文したコーヒーに限り、豆、精製方法、標高、店頭カードやメニュー記載のテイスティングノート、ドリップ方法。店=店カテゴリ(ロースタリー/カフェ/喫茶店/コーヒースタンド/その他)、店の規模(小/中/大)、豆の販売、店内利用、テイクアウト、メニュー。
注文していない豆・商品情報はコーヒー欄に含めない。自分の味の感想はdetailsではなくinsightsへ記録する。店名・訪問回数を推測しない。
$context$),
('coffee-beans', $context$
タイトルは「豆の名前(購入店)」。購入店のエリアは原則含めず、同じ豆の複数回記録では必要に応じて末尾に #連番を付ける。
details: 基本=名前、購入店、価格(数量・単位・価格)、ブレンド(ブレンド/シングルオリジン)、産地、農園、品種、精製方法、標高、グレード、焙煎度(浅煎り/中浅煎り/中煎り/中深煎り/深煎り)。抽出=好みの抽出方法(抽出温度（抽出方法）)。
商品説明などの事実情報をdetailsに、本人の味の感想・印象はinsightsに分ける。情報のない値は空文字にする。
$context$),
('ai', $context$
タイトルは会話の目的と対象を短く表し、必要に応じて連番や補足を付ける。
以下の6セクションに整理する: purpose(目的・背景)、policy(採用した方針・判断基準)、steps(string[]で時系列の作業)、execution({title, body}[]で試行・変更・確認内容。stepsと順序を対応)、result(確認できた最終結果・分かったこと)、next(string[]で残課題・次の試行)。
会話に存在しない作業・結果・提案を追加しない。単なる操作ログはまとめ、意思決定や試行錯誤を優先する。情報がない項目は空文字または空配列。
$context$),
('website-development', $context$
タイトルは対象サイトや機能と変更内容を短く示す。
purpose(目的)、policy(方針)、steps(string[]の時系列作業)、execution({title, body}[]の実施内容)、result(確認できた結果)、next(string[]の残課題・次の試行)で整理する。
技術的な変更だけでなく、方針・判断の変化も適切な項目に記録する。会話にない作業・結果を推測しない。情報がない項目は空文字または空配列。
$context$)
ON CONFLICT (category_id) DO UPDATE
SET body = EXCLUDED.body, updated_at = NOW();
