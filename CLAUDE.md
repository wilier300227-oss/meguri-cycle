# CLAUDE.md — めぐり自転車リポジトリ 作業ガイド

このファイルはセッション開始時に自動で読み込まれる。**作業に入る前に、下記「まず読む」を必ず開くこと。**

## このリポジトリは何か
自転車出張買取・引取サービス「めぐり自転車」（屋号 RAINBOW／個人事業主）の
**ホームページ**＋**タブレット買取記入システム（PWA）**＋関連GAS。
- 公開：GitHub Pages（`master` ブランチ）＋独自ドメイン `meguri-cycle.com`
- リポジトリ：https://github.com/wilier300227-oss/meguri-cycle

## まず読む（正＝原文。要約より原文を優先）
- サイト全般：`HANDOFF.md`（リポジトリ直下）
- **買取記入システム（`kaitori/`）を触るなら必ず：`kaitori/HANDOFF.md`**（詳細な仕様・経緯・残タスク・受入基準）
- 買取システムの元指示書：`kaitori/docs/`（要件定義／段階実装指示書／事務処理規程）

## ディレクトリ早見
- `index.html` `css/` `js/` `privacy.html` … 公開サイト（1ページ構成）
- `kaitori/` … タブレット買取記入システム（PWA）。`app.js` `index.html` `style.css` `sw.js` `manifest.json`、仕様は `kaitori/HANDOFF.md`
- `line-bot/*.gs` … GAS（LINEボット・台帳連携など）。GASはここに集約する流儀
- `insta/` `yt/` `logo/` `images/` `video/` … 素材・付随ページ

## 作業ルール（厳守）
- **`master` = 本番公開ブランチ**。`master` へのコミットは直コミット運用（履歴参照）。**`push` した時点で GitHub Pages に本番デプロイされる**。push は公開行為なのでユーザーの指示があってから行う。
- 作業開始前に **`git fetch && git status`** で origin と同期を確認（別PCで作業継続する運用のため、ローカルが古いと最新を取りこぼす）。
- コミットメッセージは**日本語**。kaitori 関連は `kaitori: …（③-A-n）` の形式で、対応する `HANDOFF.md` の追記とセットにする。
- 個人情報の扱い：**運転免許証の「公安委員会名＋番号」以外の本人確認番号（マイナ・保険証等）は保存も表示もしない。** GASトークンは公開ソースに置かない（各端末の localStorage 保存方式＝`kaitori/config.js` は空の公開安全版）。

## kaitori（PWA）を触るときの必須注意
- **SW（`kaitori/sw.js`）を変更したら `CACHE` の版数を必ず上げる**（現行は履歴で確認）。上げないとタブレットに反映されない。反映にはタブレットを一度オンラインで開き直す（PWA再起動）必要がある。
- **PDF/PNGの描画崩れ（拡大・枠切れ）は「Redmi Pad SE 実機＋オフライン」限定で、PC・オンラインでは再現しない。** 描画（`renderSheet()`/`waitForImages()`）を触ったら、**PCでOKでも「直った」と報告せず、必ず実機オフラインで確認してから push する**（過去③-A-3/7/9 で「PC検証→実機再発」を繰り返した。詳細は `kaitori/HANDOFF.md`）。
  - 実機オフライン確認は、このPCで `python -m http.server 8765`（リポジトリ直下）を立て、タブレットから `http://<PCのLAN IP>:8765/kaitori/` を開き、確定後に機内モード→PDF/PNG生成で確認するのが確実（push前に検証できる）。
- 出力パネル（PDF/PNG保存画面）は**署名確定→確認ダイアログOK後（`doConfirm`）だけ**に表示する。起動時など他経路で先に出さない（お客さまの誤タップ防止）。
