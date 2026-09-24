# 「出張買取という選び方」比較表 Gemini プロンプト（2026-09-24）

## 方針
- 3つの選び方（店頭に持ち込む／宅配で送る／めぐり自転車＝出張）を **写真1枚ずつ、計3枚**。
- **画像に文字は入れない**（見出し・表の文言はHTML側で重ねる。文言を後から直せる・文字化けしない）。
- 3枚の光・色味を揃える。3枚目（めぐり自転車）だけ少し明るく温かく、他2枚はニュートラル（他の方法を悪く見せない）。
- 「選ばれる理由」の5枚と同じチャットで続けて生成すると、同じスタッフ・同じ軽バンで揃う。
- 保存名： `images/compare/cmp-store.webp`／`cmp-ship.webp`／`cmp-meguri.webp`（3:2、横1200px以上）。

## 【共通スタイル】（毎回プロンプトの先頭に貼る）
```
Photorealistic editorial photograph, 3:2 landscape, 35mm lens, shallow depth of field, soft natural daylight, muted colors, Japanese suburban residential setting in Ishikawa, Japanese people if any, faces not prominent (side or back view), no brand logos, no shop signs, no readable text anywhere in the image, no watermark. Keep the upper third of the frame visually quiet and uncluttered so a caption can be overlaid later.
```

## 1. 店頭に持ち込む（cmp-store）
```
A person seen from behind wheeling a city bicycle along a suburban sidewalk toward the entrance of a small generic bicycle shop (glass door, no signage, no readable text), a compact car parked at the curb with its rear hatch open. Neutral, slightly overcast light, an ordinary-errand feeling. Nothing negative, just "carrying the bike somewhere".
```

## 2. 宅配で送る（cmp-ship）
```
Inside a Japanese home entrance (genkan): a large brown cardboard bicycle box on the floor, a person's hands sealing it with packing tape, bubble wrap and a small tool set beside it, a bicycle wheel partly visible behind the box. Neutral indoor daylight from a window, tidy but a little busy. No text on the box.
```

## 3. めぐり自転車（cmp-meguri）
```
At a customer's front door in a Japanese suburban house: a staff member in a navy polo shirt (same person as the earlier images) receiving a city bicycle from a resident standing on the doorstep, both seen from the side, a white kei van with its rear door open parked in the driveway behind them. Warm late-afternoon light, relaxed and friendly mood. The resident is not carrying anything; the staff member is doing the work.
```

## 生成後の組み込み（こちらで実施）
- デスクトップ：3列の「選び方カード」。各カードの上に写真（上部に列名を白文字で重ねる）、下に「運ぶ手間／梱包／金額が決まるタイミング／玄関先の交渉／費用」の5行。
- スマホ：カードを縦に積む（今の横スクロール表は廃止）。
- めぐり自転車のカードだけネイビーの枠＋「おすすめ」ラベルで強調。文言は今の表のまま。
