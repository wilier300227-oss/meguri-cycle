# /hikitori/ 写真化 Gemini プロンプト（2026-09-28）

## 方針
- /hikitori/ を写真ヒーロー＋「その後」節の2枚で写真化する（実例4枚は既存の実写 works/*-take.webp を流用）。
- 文字は画像に入れない（見出しはHTML側）。人物・軽バンを揃えるため、新しいチャットで `images/why/case-wide.webp`（JPG化したものを添付）を参考画像としてアップロードしてから①、続けて②。
  ※ファイルパスを文字で貼っても Gemini は画像を読めない（2026-09-28 実際に失敗）。必ずアップロードする。
- 受け取った画像は images/hikitori/hero.webp（背景、lp.css の .hero__bg--hikitori）・reuse.webp（1200x800 目安）に webp 化して置く。
- 2026-09-28 生成・配置済み。hero はナンバープレートをぼかし加工（1376x768）、reuse は 1200x805 に縮小。

## プロンプト
過去の why/case 画像と同じ人物・軽バン・光で揃えるため、**前回と同じチャットで続けて生成**が理想。文字は画像に入れない（見出しはHTML側）。
保存先：`images/hikitori/hero.jpg`、`images/hikitori/reuse.jpg`（こちらで webp 化）。プロンプトは実装時に `docs/gemini-prompts-hikitori-2026-09-28.md` にも保存する。

### ① ヒーロー（16:9、横1600px以上）※参考画像を添付して
```
Use the attached image only as a reference for the staff member (Japanese man, short black hair, plain navy polo shirt, navy trousers), the white kei van, and the overall photo style. Do NOT copy the text in the attached image.

Photorealistic editorial photograph, 16:9 wide landscape, 35mm lens, shallow depth of field, soft warm morning light, muted natural colors with a deep navy (#1E3A5F) accent. Japanese suburban house in Ishikawa, beside a carport / small storage shed. A staff member in a plain navy polo shirt (same person as the earlier images) is carefully lifting an old, well-used city bicycle (mamachari) with surface rust, a dusty basket and a flat front tire, carrying it toward a white kei van with its rear hatch open. The homeowner stands in the background near the entrance, relaxed and slightly out of focus. Calm, tidy, trustworthy mood — not a junk-collection scene. Faces not prominent, no brand logos, no license plates readable, no watermark. Keep the left 40% of the frame visually quiet and slightly darker (soft background, uncluttered) so a headline can be overlaid. No text anywhere in the image.
```

### ② 引き取った自転車のゆくえ（3:2、横1200px以上）
```
Photorealistic editorial photograph, 3:2 landscape, 50mm lens, shallow depth of field, soft daylight from a window, muted natural colors with a deep navy (#1E3A5F) accent. A small, clean, well-organized bicycle workshop in Japan. On a wooden workbench, parts taken off an old city bicycle are neatly sorted: a wheel, a crankset, a saddle, brake levers, a basket, and a chain in shallow trays; hand tools laid out in a row. The hands and forearms of a mechanic in a navy polo shirt are wiping a part clean with a cloth. In the soft-focus background, the stripped bicycle frame hangs on a repair stand. Feeling of care and reuse, not a scrapyard. No faces, no brand logos, no text anywhere in the image, no watermark.
```

崩れたときの共通の直し方：「人物の手が不自然」→ `hands resting naturally, five fingers` を追記、「自転車の形が崩れる」→ `anatomically correct bicycle: two wheels, one chain, pedals on the crank` を追記。

