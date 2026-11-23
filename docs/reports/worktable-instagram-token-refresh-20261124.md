# Instagramトークン自動更新・暗号化保存 照合報告書

## 1. 対象と要件定義書

- 対象: `feature/worktable-instagram-token-refresh` ブランチのコミット済みソース差分
- 要件定義書: `docs/requirements/worktable-instagram-token-refresh.md`（全文確認）
- 結論: 暗号化、30日経過時の更新、認証付きCron、メール通知、投稿処理のDBトークン利用、初回投入コードを確認した。外部サービス設定と実運用確認が残る。
- 判定語: 「実装済み」「一部」「未実装」「確認できず」。実装済みはコード・自動テストでの確認を意味し、外部環境での動作確認を含まない。

## 2. R-01〜R-17 要件ごとの判定

| ID | 判定 | 根拠 |
|---|---|---|
| R-01 | 実装済み | AES-256-GCM、12バイトIV、IV・タグ・暗号文をBase64化してドット区切りで保存・復号する。`lib/crypto.ts:3-4,29-35,45-55`。自動テストは`tests/instagram-token.test.mjs:10-16`。 |
| R-02 | 一部 | `APP_ENCRYPTION_KEY`を読み込み32バイトを検証する。`lib/crypto.ts:13-18`。Vercel上の設定・Sensitive指定はコード差分にない。 |
| R-03 | 実装済み | Cronを毎日18:00 UTCに設定。`vercel.json:2-6`。 |
| R-04 | 実装済み | Bearer認証不一致時に401を返す。`app/api/cron/refresh-instagram-token/route.ts:13-18`。テストは`tests/instagram-token.test.mjs:18-32`。 |
| R-05 | 実装済み | DBから現トークンを読み、復号してrefresh APIに渡す。`lib/instagram-token.ts:37-42,65-75,85-94`。 |
| R-06 | 実装済み | 新トークンを暗号化し、UPSERTで値と`updated_at`を更新する。`lib/instagram-token.ts:51-56`。 |
| R-07 | 実装済み | 更新・保存エラー時に失敗通知を試し、失敗結果を返す。`lib/instagram-token.ts:85-100`。refresh失敗時の保存値維持テストは`tests/instagram-token.test.mjs:34-46`。 |
| R-08 | 一部 | Gmail SMTP/TLSと環境変数認証、指定宛先への成功・失敗通知コードを確認。`lib/mail.ts:3,13-18,41-65`。Vercel設定とメール到達は未確認。 |
| R-09 | 実装済み | 投稿処理は`getInstagramToken()`から取得したDB復号トークンをAPI呼び出しに渡し、環境変数フォールバックはない。`app/api/post-instagram/route.ts:5,95-97,137-168`。 |
| R-10 | 未実装 | `app_secrets`テーブル作成はある。`migrations/006_create_app_secrets.sql:1-5`。`worktable_app`作成および指定テーブル・todosシーケンスへの権限付与は差分にない。 |
| R-11 | 一部 | テーブル作成SQLはある。`migrations/006_create_app_secrets.sql:1-5`。オーナー権限での実行とアプリ用接続文字列への切替は確認できない。 |
| R-12 | 実装済み | 初期トークンを環境変数から取得して暗号化し、DBへUPSERTするスクリプトがある。`scripts/init-instagram-token.ts:13-20`。マイグレーションにトークン値はない。 |
| R-13 | 未実装 | 初回投入スクリプトは`INSTAGRAM_ACCESS_TOKEN`を参照する。`scripts/init-instagram-token.ts:14-16`。Vercel環境変数削除を行う設定・手順はブランチ差分にない。 |
| R-14 | 未実装 | Vercel設定はこのリポジトリ差分に含まれず、`DATABASE_URL`の差替え、Sensitive指定、デプロイ後の正常動作を確認できない。 |
| R-15 | 実装済み | `updated_at`から30日以上経過した時だけ更新する。`lib/instagram-token.ts:26-28,85-94`。29日skip・31日更新テストは`tests/instagram-token.test.mjs:48-63`。 |
| R-16 | 未実装 | `migrations/006_create_app_secrets.sql:1-5`にパスワード値はない。`scripts/init-instagram-token.ts:14-16`は`DATABASE_URL`と`INSTAGRAM_ACCESS_TOKEN`を環境変数から参照するだけで、DBパスワード値を含まない。Neonでの発行・パスワードマネージャー保管・Vercel接続文字列設定は差分にない。 |
| R-17 | 実装済み | 保存失敗時に失敗通知し、成功扱いにしない。`lib/instagram-token.ts:85-100`。旧値維持・失敗通知テストは`tests/instagram-token.test.mjs:65-79`。 |

## 3. 機械チェック

以下は作業時に提示された実行結果を転記した。今回の報告書作成では再実行していない。

| チェック | 初回 | stashしたベース | 修正後・最終 |
|---|---|---|---|
| `npx tsc --noEmit` | TS5097 | 成功 | 成功 |
| `npm test` | `ERR_MODULE_NOT_FOUND` | 44件成功 | 50件成功 |
| `npm run build` | Google Fonts取得失敗 | 同じGoogle Fonts取得失敗 | Google Fonts取得失敗 |
| `npm run lint` | 成功 | — | 成功 |
| `git diff --check` | 成功 | — | 成功 |

Google Fonts取得失敗はstashしたベースでも再現した。

## 4. 受け入れ条件

### 自動テスト

| 要件 | 判定 | 確認状況 |
|---|---|---|
| R-01 | 実装済み | 暗号化・復号と改変暗号文の復号失敗を確認。`tests/instagram-token.test.mjs:10-16` |
| R-04 | 実装済み | 認証ヘッダーなし・不正値の401を確認。`tests/instagram-token.test.mjs:18-32` |
| R-07 | 実装済み | refresh失敗時に保存値が変わらないことを確認。`tests/instagram-token.test.mjs:34-46` |
| R-15 | 実装済み | 29日ではskip、31日では更新することを確認。`tests/instagram-token.test.mjs:48-63` |
| R-17 | 実装済み | refresh成功後のDB保存失敗時に旧値維持・失敗通知を確認。`tests/instagram-token.test.mjs:65-79` |

### 手動確認

| 要件 | 判定 | 確認状況 |
|---|---|---|
| R-05〜R-06 | 確認できず | 実Cron実行後のDB更新と新旧トークン差の確認は未了。 |
| R-08 | 確認できず | 実SMTPによる成功・失敗メール到達の確認は未了。 |
| R-09 | 確認できず | Worktable画面からInstagramへ投稿できることの確認は未了。コード上のDBトークン利用は第2節R-09に記載。 |
| R-10〜R-11 | 確認できず | `worktable_app`の読み書き・DDL拒否、オーナー権限でのSQL実行は未確認。 |
| R-12〜R-13 | 確認できず | 実DBでの復号一致と、Vercelから`INSTAGRAM_ACCESS_TOKEN`を削除したことは未確認。 |
| R-14 | 確認できず | Vercel設定後のデプロイとアプリ動作は未確認。 |
| R-16 | 確認できず | Neonでのパスワード発行・保管、Vercel接続文字列設定は未確認。 |

## 5. 推測で足した処理と扱い

- **SMTPプロトコル処理:** Gmail SMTP送信を`node:tls`で直接実装している。送信方式は要件に沿うが、利用ライブラリ・応答処理の詳細は実装上の選択。`lib/mail.ts:1,18-65`。要件変更とは扱わない。
- **通知宛先の定数化:** 宛先をコード定数にしている。指定宛先と一致する。`lib/mail.ts:3`。要件どおりの実装として扱う。
- **通知本文の固定化:** 個別の例外詳細を送らず、成功・失敗ごとの固定文言を使う。`lib/instagram-token.ts:95-100`。通知エラーは更新結果に影響しないよう捕捉する。`lib/instagram-token.ts:103-112`。この動作選択を記録し、要件変更とは扱わない。
- **トークン行欠落の扱い:** 保存行がない場合は更新失敗として通知する。`lib/instagram-token.ts:88-97`。通常運用上の異常系処理として記録する。

## 6. 未了の手作業

- Neonで`app_secrets`マイグレーションをオーナー権限で実行する。
- Neonで`worktable_app`を作成し、指定テーブルとtodosシーケンスの権限を付ける。パスワードを発行してパスワードマネージャーに保管する。
- Vercelに`APP_ENCRYPTION_KEY`、`CRON_SECRET`、`GMAIL_USER`、`GMAIL_APP_PASSWORD`をSensitive設定で登録する。
- 初回投入スクリプトを実行し、実DBの値を復号して投入トークンと一致することを確認する。
- Vercelの`DATABASE_URL`をアプリ用接続文字列に差し替え、`INSTAGRAM_ACCESS_TOKEN`を削除する。
- デプロイ後にCron認証、更新・保存、成功／失敗メール、Instagram投稿、DBロールの権限制限を手動確認する。
- 報告書はUTF-8で読み戻し、置換文字（U+FFFD）がなく、書込内容と一致することを確認した。
