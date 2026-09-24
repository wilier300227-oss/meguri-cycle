# 「選ばれる理由」実写画像 Gemini プロンプト（2026-09-24）

## 使い方
- 5枚とも **同じチャット内で連続生成**（1枚目を作ったら「同じ人物・同じ光・同じスタイルで」と続ける）。
- 各プロンプトの先頭に下の【共通スタイル】を毎回貼る。
- 画像内の文字は **見出しだけ**。本文・許可番号はサイト側のHTMLに残す（文字化け防止・スマホでの可読性・SEO）。
- 文字が崩れた場合は末尾の【文字なし版】で撮り直し → CSSで文字を重ねる。
- 保存名： `images/why/why-1.jpg` 〜 `why-5.jpg`（3:2、横1500px以上）。

## 【共通スタイル】（毎回プロンプトの先頭に貼る）
```
Photorealistic editorial photograph, 3:2 landscape, shot on a 35mm lens, shallow depth of field, warm natural late-afternoon light, muted colors with a deep navy (#1E3A5F) accent in clothing or props, Japanese residential setting in Ishikawa (Kanazawa-style suburban house, carport, tidy entrance), Japanese people if any, faces not prominent (side/back view or hands only), no brand logos, no watermark, no extra text.
Overlay ONE Japanese headline exactly as written, no other characters: 「{見出し}」 — bold white Japanese Gothic (sans-serif) font, placed in the lower-left area, with a soft dark-navy gradient behind it for legibility. The text must be spelled exactly, nothing added.
```

## 1. 整備士が一台ずつ点検・査定
```
A Japanese bicycle mechanic in his 30s–40s wearing a navy work apron crouches beside a city bicycle at a customer's front entrance, checking the chain and rear derailleur with a small wrench, a clipboard on the ground beside him. Focus on his hands and the drivetrain, face turned away. Clean, trustworthy, calm mood.
Headline: 「整備士が一台ずつ点検・査定」
```

## 2. 金額は訪問前に確定
```
Close-up of a woman's hands holding a smartphone, photographing a bicycle parked in a Japanese carport; the phone screen shows the bicycle photo (no UI text). The bicycle is softly out of focus in the background, morning light. Relaxed, "just send a photo from home" feeling.
Headline: 「金額は訪問前に確定」
```
（サブ文「玄関先で交渉なし」はHTML側に置く。画像に2行入れると崩れやすい）

## 3. 年式を問わず出張買取
```
An old, well-used Japanese city bicycle with faded paint and a little rust on the basket, standing under a house carport next to a parked white light van with its rear door open. A staff member in a navy polo shirt, seen from behind, is about to load it. Nostalgic but hopeful mood, golden-hour light.
Headline: 「年式を問わず出張買取」
```

## 4. 古物商許可 取得済み
```
Top-down close-up on a wooden entrance step: a staff member's hands in a navy sleeve filling in a purchase form on a clipboard with a pen, a small stamp (hanko) and a lanyard ID card lying beside it, a bicycle wheel blurred at the edge of the frame. Orderly, official, reassuring. The papers show only blurred generic lines, no readable text.
Headline: 「古物商許可 取得済み」
```
（許可番号「第511090015059号」は必ずHTML側。画像に入れない）

## 5. 防犯登録の抹消も代行
```
Macro close-up of a bicycle down tube with a small rectangular anti-theft registration sticker (plain, no readable text), a staff member's hand holding a pen and a folded form next to it, soft background of a Japanese residential street. Neat and helpful mood.
Headline: 「防犯登録の抹消も代行」
```

## 【文字なし版】（文字が崩れたときの撮り直し用）
共通スタイルの「Overlay ONE Japanese headline …」の段落を丸ごと次に置き換える：
```
Leave the lower-left third of the frame visually quiet (soft, uncluttered, slightly darker) so a headline can be overlaid later. No text anywhere in the image.
```
