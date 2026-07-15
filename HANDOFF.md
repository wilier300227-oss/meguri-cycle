# めぐり自転車 引き継ぎファイル

作成：2026年7月

---

## プロジェクト概要

自転車出張買取・引取サービス「めぐり自転車」のホームページ＋関連設定。
要件定義書：`C:/Users/user/Downloads/めぐり自転車_要件定義書.md`

| 項目 | 内容 |
|---|---|
| サービス名 | めぐり自転車 |
| 屋号（法的表示） | RAINBOW |
| ドメイン | meguri-cycle.com（Xserverで取得済み） |
| GitHubリポジトリ | https://github.com/wilier300227-oss/meguri-cycle |
| 公開URL | https://wilier300227-oss.github.io/meguri-cycle/ |
| LINE公式アカウント | @136bpsyc |
| Googleフォーム（査定） | https://docs.google.com/forms/d/e/1FAIpQLSdx4H5kR91ydSnxwMJgoLxOm4XqpavR6Ua2FHHneaskffv7GQ/viewform |

---

## ファイル構成

```
C:/Users/user/meguri-cycle/
├── index.html          # メインページ（1ページ構成）
├── privacy.html        # プライバシーポリシー
├── line-richmenu.html  # LINEリッチメニュー画像用（スクリーンショット用HTML）
├── css/
│   └── style.css
├── js/
│   └── main.js
├── images/             # 空（画像は未追加）
└── .gitignore
```

---

## 完了済み作業

- [x] index.html 作成（hero/choice/why/target/price/flow/bohan/faq/contact/company）
- [x] css/style.css 作成（デザイン仕様通り）
- [x] js/main.js 作成（スムーズスクロール・FAQアコーディオン）
- [x] privacy.html 作成
- [x] Googleフォーム URL をindex.htmlに設定済み
- [x] GitHubリポジトリ作成・push済み
- [x] GitHub Pages 有効化済み
- [x] line-richmenu.html 作成（レインボー6色・2500×1686px）
- [x] LINE公式アカウント名を「めぐり自転車」に変更（ユーザー作業済み）

---

## 残っている作業

### LINEリッチメニュー（ユーザー作業）
1. `line-richmenu.html` をブラウザで開く
2. DevTools → デバイスモード → `2500×1686` → Capture screenshot
3. LINE Official Account Manager（manager.line.biz）で「リッチメニュー」→「作成」→ 画像アップロード
4. 各セルのアクションを設定（下表参照）

| ボタン | アクション | URL |
|---|---|---|
| 買取査定を申し込む | リンク | https://wilier300227-oss.github.io/meguri-cycle/#contact |
| 出張引取を申し込む | リンク | https://wilier300227-oss.github.io/meguri-cycle/#contact |
| 写真をここに送る | テキスト送信 | `写真を送ります` |
| サービスを見る | リンク | https://wilier300227-oss.github.io/meguri-cycle/ |
| よくある質問 | リンク | https://wilier300227-oss.github.io/meguri-cycle/#faq |
| 対応エリア・料金 | リンク | https://wilier300227-oss.github.io/meguri-cycle/#price |

### LINEその他（ユーザー作業）
- あいさつメッセージ設定（manager.line.biz → チャット → あいさつメッセージ）
- 自動応答メッセージ設定（manager.line.biz → チャット → 応答メッセージ）

あいさつメッセージ文：
```
めぐり自転車をフォローいただきありがとうございます🚲

自転車の出張買取・出張引取を行っています。
査定は無料ですので、お気軽にご相談ください。

【ご利用の流れ】
1️⃣ 自転車の写真をこのLINEに送る
2️⃣ 査定額をメールでご連絡（48時間以内）
3️⃣ ご納得いただけたらご自宅へ伺います

下のメニューから「買取査定を申し込む」または「写真をここに送る」をタップしてスタートできます。
```

自動応答メッセージ文（キーワード：査定・買取・引取・相談）：
```
お問い合わせありがとうございます。
担当者が確認次第、48時間以内にご返信します。

まずは自転車の写真（車体全体・ブレーキ・タイヤ・チェーン周り）をこのLINEにお送りいただくとスムーズです📷

お急ぎの場合はフォームもご利用いただけます：
https://docs.google.com/forms/d/e/1FAIpQLSdx4H5kR91ydSnxwMJgoLxOm4XqpavR6Ua2FHHneaskffv7GQ/viewform
```

### サイト（今後の作業）
- [ ] デザインの改善（ユーザー「質素すぎる」と保留中）
- [x] メールアドレスの差し替え（index.html・privacy.html → wilier30.0227@gmail.com に変更済み）
- [ ] ドメイン meguri-cycle.com をGitHub Pagesに紐付け
- [ ] 集客施策：不動産会社・生協向けメール文面作成（要件書§18で保留中）
- [ ] Googleビジネスプロフィール登録

### index.html 内のTODO
- ~~メールアドレスの差し替え~~ → 完了（wilier30.0227@gmail.com）

---

## デザイン仕様（変更時の参照）

| 用途 | 値 |
|---|---|
| ベース背景 | `#FAFAF8` |
| メインインク | `#20302E` |
| アクセント | `#1F5FA8` |
| 虹グラデーション | ヒーロー下線・区切り線・CTAホバーのみ |
| 見出しフォント | Shippori Mincho B1 |
| 本文フォント | Zen Kaku Gothic New |
| 数字フォント | Barlow Semi Condensed |

---

## 次のステップ候補

1. サイトデザインの改善
2. ドメイン meguri-cycle.com の GitHub Pages 紐付け
3. 不動産会社・生協向けメール文面作成
4. Googleビジネスプロフィール登録
