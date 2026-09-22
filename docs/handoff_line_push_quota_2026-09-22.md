# LINE Push 通数対策 ハンドオフ（見積の送信失敗の検知＋自分宛て通知のDiscord移行）

作成：2026-09-22／対象：`line-bot/`（GAS）／担当：クロコ

## 0. このドキュメントの読み方

- §2「確認済みの事実」は GitHub `master`（HEAD `f47d106`、2026-09-22 時点）のコードで確認した内容。着手前に Phase 0 で今も正しいか確かめる。
- §3「決定事項」は momon 承認済み。これ以外の変更はしない。
- 各 Phase の終わりに、変更ファイル一覧とオーナー向け文言の before→after を提示し、承認を得てから commit する。push は momon の指示があってから（CLAUDE.md）。コミットメッセージは日本語。

## 1. 背景

- LINE公式アカウントはコミュニケーションプラン（月額0円・無料メッセージ200通/月・追加メッセージ不可）。上限に達しても課金はされず、Push が失敗するようになる。
- 2026/9/1〜9/21 の通数：Push 105（無料枠を消費するのはこれだけ）、Reply 310、チャット 42、あいさつ 8。9/21時点で 105/200。
- 通数は「送信リクエスト数 × 送信先の人数」で数える。1リクエストに吹き出しを複数（最大5つ）入れても、1人宛てなら1通。
  参考：https://developers.line.biz/ja/tips/2026/05/28/how-to-count-messages/
- Reply は無料枠を消費しない。上限到達後も Reply は届く。

## 2. 確認済みの事実（GitHub master・2026-09-22）

### 2-1. Push は `pushMessage_` だけ

- Push を送っているのは `code.gs` の `pushMessage_` のみ。リポジトリ内に multicast / broadcast / narrowcast の呼び出しはない。
- `pushMessage_` は `muteHttpExceptions: true` で応答を捨てている。失敗しても呼び出し元にはわからない。

### 2-2. `pushMessage_` の呼び出し元

| 呼び出し元 | 宛先 | 内容 |
|---|---|---|
| `notifyOwner_`（code.gs） | オーナー | 自分宛て通知（§2-3） |
| v2-flows.gs の受付完了処理 | オーナー | 「💰 〇〇 に見積を送る」ボタン（2026-09-16 追加） |
| `v2SendQuote_`（v2-quote.gs） | お客さま | 見積 Flex |
| `sendReviewRequests`（code.gs） | お客さま | レビュー依頼。`REVIEW_AUTO_ENABLED = false` のため現在は送信なし |

→ お客さまに届く Push は見積だけ。それ以外は全部自分宛て。

### 2-3. 自分宛て通知の経路

`appendInquiryRow_`（inquiry-sync.gs）は新しい行を書くたびに `notifyOwner_` を呼ぶ。シート書き込みが例外になったときは、各呼び出し元の catch から `notifyOwner_` を直接呼ぶ。

| 通知（件名） | 呼び出し元 |
|---|---|
| LINEの主要アクション（写真・申し込み・初回メッセージ。同じ人は6時間に1回） | `logLineInquiry_`（code.gs） |
| 🆕 サイトCTA | `notifyRouteMessage_`（code.gs） |
| ⚠要返信（自動分類不可） | code.gs |
| 💬 手動対応中の新着（1人につき1分に1回・10分で5回まで） | code.gs |
| 📝 v2 受付完了（要査定） | v2-flows.gs |
| 見積の回答（決定／やめる／もう少し考えます／期限切れタップ） | `v2NotifyOwnerNow_`（v2-quote.gs） |
| 査定フォーム回答 | form-sync.gs |
| Gmail（info@ 宛の問い合わせ） | inquiry-sync.gs |

### 2-4. 受付完了は1件で2通

v2-flows.gs の受付完了処理は、`appendInquiryRow_`（内部で Push 1回）のあとに、見積ボタンを別の `pushMessage_` で送っている。受付1件でオーナー宛て2通。

### 2-5. 見積の送信処理 `v2SendQuote_`

順番：

1. 同じ相手の `sent` / `hold` の見積を `expired` にする
2. 新しい行を `status='sent'` で追記
3. `pushMessage_`（結果を見ていない）
4. ユーザー状態を `S3` にする
5. 呼び出し元（`v2HandleQuotePostback_` のオーナー送信確認）が「✅ 送信しました（quoteId）。回答があれば通知します」と Reply

→ Push が失敗すると、お客さまに届いていないのに、前の見積が失効し、新しい見積が `sent` で記録され、状態が S3 になり、オーナーには「送信しました」と返る。quotes タブは提示金額のログ（F-5・保存7年）を兼ねるので、記録としても誤りになる。

### 2-6. その他

- quotes の `status` を使うロジックは v2-quote.gs だけ。
- オーナーはボットに「見積」と送れば見積の対話式入力に入れる（`ownerqStart_`。Reply なので通数を使わない）。
- 設定値はスクリプト プロパティから読む流儀（`CHANNEL_ACCESS_TOKEN`・`OWNER_LINE_USER_ID`・`INQUIRY_SHEET_ID` など）。
- リポジトリは Public。

## 3. 決定事項（momon 承認済み）

1. Push の失敗を検知する。見積が届かなかったときは、オーナーに「送信失敗」と返す（最優先）
2. 自分宛て通知は Discord に移す。ただし「受付完了＋見積ボタン」だけは LINE に残し、1回の Push（1通）にまとめる
3. 料金プランはコミュニケーションのまま

## 4. Phase 0：着手前の確認（コードは変えない）

- `git fetch && git status` で同期する
- §2 の事実が今の `master` でも正しいか確認する。違っていたら止めて報告
- 次の仕様を WebSearch で裏取りする
  - Push の月上限到達時の応答（HTTP 429 と message の内容、レート制限の 429 との見分け方）
  - Discord Webhook の成功時のステータス、`content` の文字数上限、`allowed_mentions`
- momon に確認：quotes タブの `status` をシートの数式や集計で使っていないか（`send_failed` を増やすため）
- 結果を報告して承認を待つ

## 5. Phase 1：Push の失敗を検知する（決定事項1）

### 5-1. `pushMessage_` が結果を返す

- 戻り値は `{ ok, status, message, monthlyLimit }`。`ok` は HTTP 200 のとき true
- 例外を投げない。`UrlFetchApp.fetch` の例外も捕まえて `ok: false` で返す
- 失敗時は `console.error` に status と応答本文（先頭200文字程度）を出す
- `monthlyLimit` は月上限到達と判定できたとき true（判定方法は Phase 0 の裏取りに従う）

### 5-2. `v2SendQuote_`：届いたときだけ送信済みにする

- 成功時：今と同じ結果（前の見積は expired、新しい行は sent、状態 S3、「✅ 送信しました」）
- 失敗時：
  - 前の見積（sent / hold）を expired にしない
  - ユーザー状態を S3 にしない
  - 新しい見積の行は `status='send_failed'` で残す（提示していない記録として）
  - 呼び出し元はオーナーに失敗を Reply する（文言は §7-A）
- 「お客さまに届いたのに quotes に行が無い」状態は作らない。順番の組み方は任せるが、先に行を書いてから結果で status を確定するなら、失効処理で新しい行自身を expired にしないこと
- 呼び出し元が成否を判断できる戻り値にする

### 5-3. `sendReviewRequests`

- `ok` のときだけ `sent` にする（今は無効だが、同じ穴なので揃える）

## 6. Phase 2：自分宛て通知を Discord へ（決定事項2）

### 6-1. 設定

- スクリプト プロパティ `DISCORD_WEBHOOK_URL` を読む。URL はコードにもリポジトリにも書かない

### 6-2. `notifyOwner_` を Discord 優先にする

- 本文は今の LINE 通知と同じ組み立て（📩 新しい問い合わせ（経路）／差出人／件名／本文の先頭200字／シートURL）。組み立ては関数に切り出して共通化してよい
- `DISCORD_WEBHOOK_URL` があれば Discord に送る。payload は `{ content, allowed_mentions: { parse: [] } }`（お客さまの文面に @everyone などがあってもメンションさせない）。上限を超える長さは切り詰める
- Discord が未設定、または失敗（2xx 以外・例外）のときは、今までどおり LINE Push に送る
- Discord への送信は `OWNER_LINE_USER_ID` の有無に関係なく行う（LINE に送るときだけ `OWNER_LINE_USER_ID` が要る）
- これで §2-3 の通知は、受付完了を除いて全部 Discord に行く。`DISCORD_WEBHOOK_URL` を入れる前にデプロイしても、挙動は今と同じ

### 6-3. 受付完了（v2-flows.gs）を LINE Push 1回にまとめる

- 中央シートへの記録は今どおり `appendInquiryRow_` で行う。この呼び出しだけ内部の通知を止める（任意の引数を足すなど。他の呼び出し元の挙動は変えない）
- オーナーへの LINE Push を1リクエストで送る：`messages = [通知本文, 見積ボタンの吹き出し]`。本文は `notifyOwner_` と同じ文面、ボタンは今の `v2Msg_`＋`qrPostback_` と同じ。ボタンを作れないとき（cust が無いなど）は本文だけ
- 同じ受付で2回送らない：`appendInquiryRow_` が記録済み（false）を返したら送らない。シート書き込みが例外のときは、今どおり通知は試みる
- この Push が失敗したら、Discord に本文を送る（末尾の文言は §7-B）
- 「受付完了の通知はバースト抑制の対象にしない」は維持

### 6-4. コメント・資料

- inquiry-sync.gs の `notifyOwner_` 呼び出しのコメント（「LINEプッシュ通知」）を実態に合わせる
- `SETUP.md`（必要なら `README.md`）に `DISCORD_WEBHOOK_URL` の設定手順と §10 の戻し方を追記

## 7. オーナー向けの新しい文言（案・承認対象）

A. 見積を送れなかったとき（オーナーへの Reply）

- 月上限：`⚠ 見積を送れませんでした。今月のPush上限（200通）に達しています。お客さまには届いていません`
- それ以外：`⚠ 見積を送れませんでした（{status} {message}）。お客さまには届いていません`

B. 受付完了を Discord に回したとき（本文の末尾）

- `（LINEに送れなかったためDiscordに届いています。見積はボットに「見積」と送ると入力できます）`

お客さまに届く文言・Flex・フロー・リッチメニューは一切変えない。

## 8. テスト（通数を無駄にしない）

- 開発 WebApp（`line-bot/docs/v2test.py` の送信先）で確認してから本番に入れる
- 開発環境が本番と同じ LINE チャネルのトークンを使っているなら、テスト中のオーナー宛て Push も今月の200通から引かれる（9/21時点で残り95通）。開発側にも `DISCORD_WEBHOOK_URL`（開発用の別チャンネル推奨）を入れてからシナリオテストを流す
- 見積の失敗系：テストユーザー `Utest…` は userId の形式として不正なので、宛ての Push は失敗するはず（届かない送信は通数に数えない）。send_failed・前の見積が失効しない・失敗の Reply を確認する。quotes の status は diag の quotes 末尾で見られる
- Discord：テスト関数から `notifyOwner_` を1回呼んで届くか。未設定にしたとき LINE に送られるか（ここだけ Push を1通使う）
- 受付完了：オーナー宛ての Push が1回（吹き出し2つ）になっているか
- 本番でテスト送信はしない

## 9. 反映手順（momon 作業。クロコは最終版を報告に含める）

1. Discord の通知用チャンネルで Webhook を作り、URL をコピー
2. 本番 GAS：プロジェクトの設定 → スクリプト プロパティに `DISCORD_WEBHOOK_URL` を追加
3. 今の本番デプロイのバージョン番号を控える（戻し用。`line-bot/docs/rollback_2026-09.md` と同じ要領）
4. GAS エディタだけで直接直した箇所がないか確認 → 変更したファイルを全置換で貼り付け → 保存
5. デプロイを管理 → 鉛筆 → バージョン「新バージョン」→ デプロイ（URL は変わらない）
6. 確認：次の問い合わせ通知が Discord に届く／次の受付完了が LINE に1回（本文＋ボタン）で届く

## 10. 戻し方

- 通知だけ LINE に戻す：スクリプト プロパティの `DISCORD_WEBHOOK_URL` を削除（再デプロイ不要。次の実行から LINE Push に戻る）
- 全部戻す：デプロイを管理で §9-3 のバージョンを選んでデプロイ＋`git revert`

## 11. やらないこと

- 料金プランの変更
- お客さま向けの文言・Flex・フロー・リッチメニュー・あいさつメッセージの変更
- 手動対応中の通知の間引き（1分に1回・10分で5回）の変更
- レビュー依頼の自動送信の有効化
- 保護対象（`kaitori/`、LINE 定型文の末尾＝GAS の集計キー、`js/tailwind-config.js`、`robots.txt`、`sitemap.xml`）の変更
- Webhook URL・トークンのコミット

## 12. 受入基準

- `pushMessage_` が結果を返し、例外を投げない
- 見積の Push が失敗したとき：前の見積が失効しない／新しい行が `send_failed`／状態が変わらない／オーナーに失敗の Reply が届く
- 見積の Push が成功したとき：結果が今と同じ
- `DISCORD_WEBHOOK_URL` 未設定：通知は今どおり LINE Push
- `DISCORD_WEBHOOK_URL` 設定済み：受付完了以外の自分宛て通知で LINE Push が発生しない
- 受付完了：オーナーへの LINE Push が1回（本文＋ボタン）、同じ受付で重複しない、失敗時は Discord に届く
- Discord が失敗したときは LINE Push に送られる
- お客さまに届くメッセージは何も変わらない
- コード・リポジトリに Webhook URL やトークンが含まれない
