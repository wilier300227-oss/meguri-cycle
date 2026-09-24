# 「実例」横長バナー Gemini プロンプト（2026-09-24）

## 方針
- #why 冒頭の黄色の実例ストリップを、横長（21:9）の実写風バナーに置き換える。
- 画像に入れる文字は見出し1行だけ。補足文・「実例」ラベルはHTML側で重ねる。
- 「選ばれる理由」の5枚・「流れ」の写真と同じスタッフ・軽バン・光で揃える（同じチャットで続けて生成）。
- 保存名：`images/why/case-wide.jpg`（21:9、横1500px以上が理想）。

## プロンプト（本命：見出し入り）
```
Photorealistic editorial photograph, 21:9 wide landscape banner, 35mm lens, shallow depth of field, warm bright morning light, muted colors with a deep navy (#1E3A5F) accent, Japanese suburban residential setting in Ishikawa. A staff member in a navy polo shirt (same person as the earlier images) is briskly wheeling a city bicycle toward a white kei van with its rear door open, parked in the customer's driveway; the customer stands relaxed at the front door in the background, slightly out of focus. A sense of quick, easy, friendly service. Faces not prominent, no brand logos, no watermark. Keep the left third of the frame visually quiet.
Overlay ONE Japanese headline exactly as written, no other characters: 「最短30分で査定、当日お引き取りも」 — bold white Japanese Gothic (sans-serif) font, placed at the left-center, with a soft dark-navy gradient behind it for legibility. The text must be spelled exactly, nothing added, no quotation marks.
```

## 文字が崩れたとき（文字なし版）
最後の段落を次に置き換える：
```
Leave the left third of the frame visually quiet (soft, uncluttered, slightly darker) so a headline can be overlaid later. No text anywhere in the image.
```

## 組み込み（こちらで実施）
- 画像を横いっぱいの帯に。左上に黒地の「実例」ラベル、右下（または画像の下）に「通常は原則48時間以内にご連絡。写真だけで完結します。」を小さく。
- スマホでは 21:9 だと細すぎるので 16:9 にトリミング表示（文字は左側にあるので切れない）。
