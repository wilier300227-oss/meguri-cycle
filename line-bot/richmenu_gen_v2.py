# -*- coding: utf-8 -*-
"""LINEリッチメニュー画像 v2（要件定義_LINEシステム.md §9）を3枚生成する。

  richmenu_v2_normal.jpg  通常時       2500x1686  2列x3段
  richmenu_v2_inflow.jpg  フロー進行中 2500x843   横4分割
  richmenu_v2_photo.jpg   写真工程     2500x843   横3分割

背景・パネル・光沢は line-richmenu-gen.py（v1）と同じベクター描画。
絵文字は Segoe UI Emoji（カラー）をフォントから描画して画像に焼き込む
（LINE側のフォント依存をなくすため）。矢印だけは形を揃えるため自前で描く。
文言や色を変えるときは CELLS_* を編集して再実行する。
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

BASE = os.path.dirname(os.path.abspath(__file__))
INK = (26, 42, 40, 255)  # #1a2a28 サイトのダーク背景
FONT_PATH = r"C:\Windows\Fonts\YuGothB.ttc"
EMOJI_PATH = r"C:\Windows\Fonts\seguiemj.ttf"
PAD, GAP = 8, 8


def font(size):
    return ImageFont.truetype(FONT_PATH, size)


def emoji_font(size):
    return ImageFont.truetype(EMOJI_PATH, size)


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lighten(rgb, amt):
    return tuple(min(255, int(c + (255 - c) * amt)) for c in rgb)


def darken(rgb, amt):
    return tuple(max(0, int(c * (1 - amt))) for c in rgb)


# ── タイル定義 ──────────────────────────────────────
# label: 画像に描く文言（改行可）。emoji: 絵文字（"<" ">" は自前描画の矢印、"x" は自前描画のバツ）。
# dark: 明るい背景色で文字を濃色にする。
CELLS_NORMAL = [
    {"label": "買取を申し込む", "emoji": "🚲", "color": "#E53935"},
    {"label": "処分・引取を\n申し込む", "emoji": "🗑", "color": "#FB8C00"},
    {"label": "対応エリア・出張費", "emoji": "📍", "color": "#FDD835", "dark": True},
    {"label": "電動バッテリーの\n調べ方", "emoji": "🔋", "color": "#43A047"},
    {"label": "よくある質問", "emoji": "❓", "color": "#1E88E5"},
    {"label": "担当者に相談", "emoji": "💬", "color": "#8E24AA"},
]
# Gemini 画像に重ねるときのラベル（右側の狭い領域に収めるため全て2行）
OVERLAY_LABELS_NORMAL = ["買取を\n申し込む", "処分・引取を\n申し込む", "対応エリア・\n出張費",
                         "電動\nバッテリーの\n調べ方", "よくある\n質問", "担当者に\n相談"]
CELLS_INFLOW = [
    {"label": "ひとつ戻る", "emoji": "<", "color": "#546E7A"},
    {"label": "最初から\nやり直す", "emoji": "🔄", "color": "#FB8C00"},
    {"label": "担当者に相談", "emoji": "💬", "color": "#1E88E5"},
    {"label": "やめる", "emoji": "x", "color": "#E53935"},
]
CELLS_PHOTO = [
    {"label": "カメラで撮る", "emoji": "📷", "color": "#1E88E5"},
    {"label": "アルバムから選ぶ", "emoji": "🖼", "color": "#43A047"},
    {"label": "次へ進む", "emoji": ">", "color": "#FB8C00"},
]


def draw_arrow(layer, cx, cy, size, direction, color):
    """左右のシェブロン矢印（"<" / ">"）。"""
    d = ImageDraw.Draw(layer)
    w = int(size * 0.16)
    h = size * 0.42
    if direction == "<":
        pts = [(cx + h * 0.5, cy - h), (cx - h * 0.5, cy), (cx + h * 0.5, cy + h)]
    else:
        pts = [(cx - h * 0.5, cy - h), (cx + h * 0.5, cy), (cx - h * 0.5, cy + h)]
    d.line(pts, fill=color, width=w, joint="curve")
    r = w / 2
    for p in (pts[0], pts[2]):
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=color)


def draw_x(layer, cx, cy, size, color):
    d = ImageDraw.Draw(layer)
    w = int(size * 0.16)
    h = size * 0.34
    for a, b in (((cx - h, cy - h), (cx + h, cy + h)), ((cx - h, cy + h), (cx + h, cy - h))):
        d.line([a, b], fill=color, width=w)
        for p in (a, b):
            d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=color)


def draw_emoji(layer, cx, cy, size, ch, color):
    if ch in ("<", ">"):
        draw_arrow(layer, cx, cy, size, ch, color)
        return
    if ch == "x":
        draw_x(layer, cx, cy, size, color)
        return
    d = ImageDraw.Draw(layer)
    f = emoji_font(size)
    bbox = d.textbbox((0, 0), ch, font=f, embedded_color=True)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text((cx - w / 2 - bbox[0], cy - h / 2 - bbox[1]), ch, font=f, embedded_color=True)


def panels(img, cells, cols, rows, W, H):
    """角丸グラデーションのパネルと光沢を敷く。戻り値は各セルの (x0,y0,x1,y1)。"""
    cell_w = ((W - 2 * PAD) - (cols - 1) * GAP) / cols
    cell_h = ((H - 2 * PAD) - (rows - 1) * GAP) / rows
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    boxes = []
    for i, cell in enumerate(cells):
        col, row = i % cols, i // cols
        x0 = PAD + col * (cell_w + GAP)
        y0 = PAD + row * (cell_h + GAP)
        base = hex_to_rgb(cell["color"])
        top_c, bot_c = lighten(base, 0.16), darken(base, 0.22)
        pw, ph = int(cell_w), int(cell_h)
        grad = Image.new("RGB", (pw, ph))
        gpix = grad.load()
        for y in range(ph):
            t = y / ph
            row_col = tuple(int(top_c[k] + (bot_c[k] - top_c[k]) * t) for k in range(3))
            for x in range(pw):
                gpix[x, y] = row_col
        mask = Image.new("L", (pw, ph), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, pw - 1, ph - 1], radius=40, fill=255)
        layer.paste(grad, (int(x0), int(y0)), mask)
        gloss = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
        gd = ImageDraw.Draw(gloss)
        gd.polygon([(pw * 0.35, 0), (pw, 0), (pw, ph * 0.42), (pw * 0.68, ph * 0.18)], fill=(255, 255, 255, 55))
        gloss = gloss.filter(ImageFilter.GaussianBlur(10))
        gloss.putalpha(Image.composite(gloss.split()[3], Image.new("L", (pw, ph), 0), mask))
        layer.alpha_composite(gloss, (int(x0), int(y0)))
        boxes.append((x0, y0, x0 + cell_w, y0 + cell_h))
    return Image.alpha_composite(img, layer), boxes


def fit_font(d, text, size, max_w, min_size):
    f = font(size)
    while f.size > min_size and max(d.textlength(t, font=f) for t in text.split("\n")) > max_w:
        f = font(f.size - 4)
    return f


def text_with_shadow(img, draw_fn):
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    text = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(shadow), True)
    draw_fn(ImageDraw.Draw(text), False)
    shadow = shadow.filter(ImageFilter.GaussianBlur(6))
    return Image.alpha_composite(Image.alpha_composite(img, shadow), text)


def gen_normal(out):
    W, H = 2500, 1686
    img = Image.new("RGBA", (W, H), INK)
    img, boxes = panels(img, CELLS_NORMAL, 2, 3, W, H)
    icons = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for cell, (x0, y0, x1, y1) in zip(CELLS_NORMAL, boxes):
        cy = (y0 + y1) / 2
        draw_emoji(icons, x0 + 240, cy, 250, cell["emoji"], (255, 255, 255, 255))
    img = Image.alpha_composite(img, icons)

    def draw_text(d, is_shadow):
        for cell, (x0, y0, x1, y1) in zip(CELLS_NORMAL, boxes):
            dark = cell.get("dark", False)
            if is_shadow and dark:
                continue
            two = "\n" in cell["label"]
            f = fit_font(d, cell["label"], 112 if two else 128, (x1 - x0) - 470, 72)
            fill = (0, 0, 0, 90) if is_shadow else ((20, 37, 28, 255) if dark else (255, 255, 255, 255))
            off = 4 if is_shadow else 0
            d.multiline_text((x0 + 430 + off, (y0 + y1) / 2 + off), cell["label"], font=f, fill=fill,
                             anchor="lm", align="left", spacing=14)

    img = text_with_shadow(img, draw_text)
    save_for_line(img, out)


def gen_compact(cells, out):
    W, H = 2500, 843
    cols = len(cells)
    img = Image.new("RGBA", (W, H), INK)
    img, boxes = panels(img, cells, cols, 1, W, H)
    icons = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for cell, (x0, y0, x1, y1) in zip(cells, boxes):
        draw_emoji(icons, (x0 + x1) / 2, y0 + (y1 - y0) * 0.36, 230, cell["emoji"], (255, 255, 255, 255))
    img = Image.alpha_composite(img, icons)

    def draw_text(d, is_shadow):
        for cell, (x0, y0, x1, y1) in zip(cells, boxes):
            dark = cell.get("dark", False)
            if is_shadow and dark:
                continue
            f = fit_font(d, cell["label"], 96, (x1 - x0) - 60, 64)
            fill = (0, 0, 0, 90) if is_shadow else ((20, 37, 28, 255) if dark else (255, 255, 255, 255))
            off = 4 if is_shadow else 0
            d.multiline_text(((x0 + x1) / 2 + off, y1 - 70 + off), cell["label"], font=f, fill=fill,
                             anchor="md", align="center", spacing=8)

    img = text_with_shadow(img, draw_text)
    save_for_line(img, out)


def grid_boxes(cells, cols, rows, W, H):
    cell_w = ((W - 2 * PAD) - (cols - 1) * GAP) / cols
    cell_h = ((H - 2 * PAD) - (rows - 1) * GAP) / rows
    out = []
    for i in range(len(cells)):
        col, row = i % cols, i // cols
        x0 = PAD + col * (cell_w + GAP)
        y0 = PAD + row * (cell_h + GAP)
        out.append((x0, y0, x0 + cell_w, y0 + cell_h))
    return out


def overlay(src, cells, cols, rows, W, H, out, text_x=0.63, text_y=0.5, size=120, region=None,
            icon_scale=None, icon_span=0.48):
    """Gemini 等で作った文字なしタイル画像（richmenu_v2_src_*.jpg）を目的サイズに
    リサイズし、日本語ラベルを重ねる。タイルは等分グリッドとみなす。
    text_x / text_y: タイル内での文字中心の位置（0〜1）。"""
    img = Image.open(src).convert("RGBA")
    if abs(img.width / img.height - W / H) > 0.08:  # 3:1 → 2500:843 の差(0.03〜0.06)は許容
        raise SystemExit("aspect mismatch: %s %s -> %dx%d" % (src, img.size, W, H))
    img = img.resize((W, H), Image.LANCZOS)
    boxes = grid_boxes(cells, cols, rows, W, H)

    # アイコンを縮小して文字の領域を広げる（Gemini のアイコンはタイル左側の約半分を占めるため）
    if icon_scale:
        for cell, (x0, y0, x1, y1) in zip(cells, boxes):
            w, h = x1 - x0, y1 - y0
            # Gemini のタイルは余白・角丸があるので、角を避けて内側だけを対象にする
            box = (int(x0 + w * 0.05), int(y0 + h * 0.10), int(x0 + w * icon_span), int(y1 - h * 0.10))
            crop = img.crop(box)
            # 背景色は左側の余白列を行ごとに使う（上下のグラデーションを保つ）
            # 右半分の明るい帯（約0.48から）には触らず、その手前までを背景色で塗り直す
            bg = crop.copy()
            # 帯の境目をタイル上端付近の行から検出（アイコンが無い高さで、明るさが跳ねる位置）
            lum = img.convert("L")
            ys = int(y0 + h * 0.06)
            edge = None
            prev = None
            for xs in range(int(x0 + w * 0.30), int(x0 + w * 0.60)):
                v = lum.getpixel((xs, ys))
                if prev is not None and v - prev > 10:
                    edge = xs
                    break
                prev = v
            fill_w = int((edge - 2) - (x0 + w * 0.05)) if edge else int(w * (0.47 - 0.05))
            strip = img.crop((int(x0 + w * 0.05), box[1], int(x0 + w * 0.05) + 4, box[3])).resize((fill_w, crop.height))
            bg.paste(strip, (0, 0))
            # 帯の内側にはみ出していた元アイコンの残り（白い画素）は、帯の色（境目のすぐ右）で塗り直す
            if edge and crop.width > fill_w:
                sx = int(x0 + w * 0.62)  # 帯の中で、元アイコンが絶対に無い列から色を取る
                strip2 = img.crop((sx, box[1], sx + 4, box[3])).resize((crop.width - fill_w, crop.height))
                bg.paste(strip2, (fill_w, 0))  # 帯は左右方向に一様なので、列ごとの色でそのまま塗りつぶせる
            small = crop.resize((int(crop.width * icon_scale), int(crop.height * icon_scale)), Image.LANCZOS)
            # 白いアイコン部分だけを貼る（右半分の明るい帯の境目を持ち込まないため）
            r, g, bch, _ = small.split()
            mask = Image.eval(r, lambda v: 255 if v > 180 else 0)
            for ch in (g, bch):
                mask = Image.composite(mask, Image.new("L", mask.size, 0), Image.eval(ch, lambda v: 255 if v > 180 else 0))
            mask = mask.filter(ImageFilter.GaussianBlur(1.2))
            # 縮小したアイコンは左寄せで置く（右半分の明るい帯に重ならないように）
            bg.paste(small, (0, (crop.height - small.height) // 2), mask)
            img.paste(bg, box)

    def draw_text(d, is_shadow):
        for cell, (x0, y0, x1, y1) in zip(cells, boxes):
            dark = cell.get("dark", False)
            max_w = (x1 - x0) * (region if region else (1 - text_x) * 2) - 40
            f = fit_font(d, cell["label"], size, max_w, 64)
            fill = (0, 0, 0, 110) if is_shadow else (255, 255, 255, 255)
            off = 4 if is_shadow else 0
            stroke = {}
            d.multiline_text((x0 + (x1 - x0) * text_x + off, y0 + (y1 - y0) * text_y + off), cell["label"],
                             font=f, fill=fill, anchor="mm", align="center", spacing=14, **stroke)

    img = text_with_shadow(img, draw_text)
    save_for_line(img, out)


def save_for_line(img, out):
    """LINE のリッチメニュー画像は 1MB 以下。PNG だと超えるので JPEG（品質は 1MB に収まる範囲で最高）で保存する。"""
    rgb = img.convert("RGB")
    for q in (92, 88, 85, 80, 75):
        rgb.save(out, "JPEG", quality=q, optimize=True, subsampling=0)
        if os.path.getsize(out) < 1_000_000:
            break
    print("saved:", out, img.size, os.path.getsize(out), "bytes q=%d" % q)


if __name__ == "__main__":
    import sys
    if "--overlay" in sys.argv:
        # Gemini 生成の文字なし画像に文字を重ねる（採用版・2026-09-16）
        # Gemini のアイコンはタイル左側の約45%を占めるので、文字は右側に寄せて全ラベル2行にする
        cells = [dict(c, label=l) for c, l in zip(CELLS_NORMAL, OVERLAY_LABELS_NORMAL)]
        overlay(os.path.join(BASE, "richmenu_v2_src_normal.jpg"), cells, 2, 3, 2500, 1686,
                os.path.join(BASE, "richmenu_v2_normal.jpg"), text_x=0.70, text_y=0.5, size=120, region=0.60,
                icon_scale=0.80, icon_span=0.55)
        overlay(os.path.join(BASE, "richmenu_v2_src_inflow.jpg"), CELLS_INFLOW, 4, 1, 2500, 843,
                os.path.join(BASE, "richmenu_v2_inflow.jpg"), text_x=0.5, text_y=0.80, size=92)
        overlay(os.path.join(BASE, "richmenu_v2_src_photo.jpg"), CELLS_PHOTO, 3, 1, 2500, 843,
                os.path.join(BASE, "richmenu_v2_photo.jpg"), text_x=0.5, text_y=0.80, size=96)
    else:
        # 完全ベクター描画版（Gemini 画像が無いときの代替）
        gen_normal(os.path.join(BASE, "richmenu_v2_normal.jpg"))
        gen_compact(CELLS_INFLOW, os.path.join(BASE, "richmenu_v2_inflow.jpg"))
        gen_compact(CELLS_PHOTO, os.path.join(BASE, "richmenu_v2_photo.jpg"))
