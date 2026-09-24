# 「買取・引取の対象」強化買取9カテゴリ Gemini プロンプト（2026-09-24）

## 方針
- 9枚バラバラではなく **1枚の3×3コラージュ** を生成し、こちらで9マスに切り分けてタイルに使う（枠ずれの心配なし・トーンが揃う）。
- **画像に文字は入れない**（ラベルはHTML）。ロゴ・ブランド名も入れない（人気ブランド車は「高級感のあるカーボンロード」で表現）。
- 生成は 1:1（正方形）で。横2048px以上あると1マス680px取れる。
- 保存名： `images/target/lineup-3x3.jpg`（原本）。切り分けはこちらで実施。

## 【推奨】3×3コラージュ（1枚）
```
A single square image composed as a clean 3x3 photo grid: nine equal square cells separated by thin white gutters (about 2% of the width), no text, no logos, no labels, no watermark. Every cell is a photorealistic product-style photograph shot in the same way: one bicycle (or parts) placed on a light warm-grey concrete floor in front of a plain pale wall in a bright, tidy Japanese bicycle workshop, soft daylight from the left, 35mm lens, the subject fills about 80% of the cell, side view facing left, consistent color grading across all nine cells. Subtle deep-navy (#1E3A5F) details may appear on some bikes.

Cells, left to right, top to bottom:
1. Electric assist city bicycle with a front basket and a visible frame battery (Japanese style)
2. Road bike with drop handlebars, slim frame, no visible logos
3. Cross bike (flat-bar hybrid) with 700c wheels
4. Mountain bike with front suspension and knobby tires
5. Mini velo with small 20-inch wheels and a classic upright frame
6. Folding bicycle, unfolded, small wheels, hinge visible on the main tube
7. Vintage randonneur bicycle with a leather saddle, chrome details and a bit of patina
8. High-end carbon road bike in a premium finish, deep navy paint, race wheels, no logos
9. Bicycle parts arranged neatly on a wooden bench: a wheelset, a rear derailleur, a crankset, a cassette and a saddle
```
（崩れたときの追加指示： "Keep all nine cells exactly the same size and the grid perfectly aligned. Do not merge cells."）

## 【任意】見出し用の横長ラインナップ写真（1枚）
9マスの上に「集合写真」として置く場合。無くても成立する。
```
Photorealistic wide banner photograph, 21:9, a lineup of nine bicycles and a parts bench standing side by side in one row along the pale wall of a bright, tidy Japanese bicycle workshop, light warm-grey concrete floor, soft daylight, shot slightly from the front-left so the whole row is visible: an electric assist city bicycle, a road bike, a cross bike, a mountain bike, a mini velo, a folding bicycle, a vintage randonneur, a premium navy carbon road bike, and a small wooden bench with a wheelset and components. No people, no text, no logos, no watermark. Keep the upper quarter of the frame quiet so a heading can be overlaid.
```
