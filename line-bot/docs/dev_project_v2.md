# LINE v2 開発用 GAS プロジェクト（2026-09-16 作成）

要件定義 §12 段階0「新プロジェクトの器」。本番（`コード.js` のプロジェクト、@47）とは**別プロジェクト・別 WebApp URL・別 Sheets**。
本番の台帳・集計シートには一切書き込まない（N-2）。

| 項目 | 値 |
|---|---|
| プロジェクト名 | めぐり自転車 LINE v2（開発） |
| scriptId | `1piJF_XcPYYWPFkfeI3N8SXEHAjDRiRhkdhT2SmGt0bzQmWmE3bEEuH4U` |
| エディタ | https://script.google.com/d/1piJF_XcPYYWPFkfeI3N8SXEHAjDRiRhkdhT2SmGt0bzQmWmE3bEEuH4U/edit |
| WebApp デプロイ ID | `AKfycbzjdIx2dTAlf0TwsEp6HE32AGrpDMyZqLDWuiO5pQ38aQcgycEy9OQoJ0utpDYDVvmV`（@1） |
| WebApp URL（転送シムの転送先） | `https://script.google.com/macros/s/AKfycbzjdIx2dTAlf0TwsEp6HE32AGrpDMyZqLDWuiO5pQ38aQcgycEy9OQoJ0utpDYDVvmV/exec` |
| clasp | `line-bot/.clasp.json` がこのプロジェクトを指す。`line-bot/` で `npx clasp push --force` → `npx clasp create-deployment -i <上のデプロイID> -d "説明"` |
| push 対象 | `.claspignore` で code.gs / form-sync.gs / inquiry-sync.gs / sheet-format.gs / appsscript.json のみ（kaitori-ledger.gs は別プロジェクトなので除外） |

**本番プロジェクトへの push は、これまでどおり scratchpad に本番用 `.clasp.json` を置いて行う**（`line-bot/` の `.clasp.json` は開発用）。

## オーナー作業（初回のみ・エディタで）

1. 上のエディタ URL を開き、**プロジェクトの設定 → スクリプト プロパティ** に次を追加
   | プロパティ | 値 |
   |---|---|
   | `CHANNEL_ACCESS_TOKEN` | 本番と同じチャネルアクセストークン（本番プロジェクトのスクリプトプロパティからコピー） |
   | `OWNER_LINE_USER_ID` | 自分の userId（本番 `コード.js` 58行目の値） |
   | `GOOGLE_REVIEW_URL` | `https://g.page/r/CdZATCD3-TNjEAE/review`（任意） |
   | `INQUIRY_SHEET_TITLE` | `めぐり自転車_問い合わせ一元管理（v2開発）` |
2. 関数プルダウンで **`setupLineSheets`** を選んで ▶ 実行（初回は権限承認）。開発用のスプレッドシートが作られ、`INQUIRY_SHEET_ID` が自動で入る
3. 確認: Drive に「めぐり自転車_問い合わせ一元管理（v2開発）」ができている

ここまでで段階1（転送シム＋postback 基盤）に入れる。LINE の Webhook URL は**変えない**（本番のまま。転送シムが対象 userId のイベントだけ上の WebApp URL へ転送する）。

## コード側の変更（2026-09-16、本番未反映）

- `OWNER_LINE_USER_ID` / `GOOGLE_REVIEW_URL` をスクリプトプロパティ優先に変更（無ければ従来どおり定数）。段階5で本番へ持ち込むと、本番 pull → 差分 → 部分適用の手間が減る
- `getInquirySheet_` の新規作成名を `INQUIRY_SHEET_TITLE` プロパティで変えられるように
