# -*- coding: utf-8 -*-
"""LINEリッチメニュー画像(2500x1686)を完全にコードで生成する。
以前のAI生成背景(line-richmenu-bg.png)は非均等に引き伸ばされており
円アイコンが楕円に歪んでいたため、背景ごとベクター描画に置き換えて
正円を保証する。ブランドカラーは yt/gen_branded_short.py と共通。"""
import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

BASE = os.path.dirname(__file__)
OUT_PATH = os.path.join(BASE, "line-richmenu-final.png")

W, H = 2500, 1686
PAD, GAP = 8, 8
INK = (26, 42, 40, 255)          # #1a2a28 サイトのダーク背景
RAINBOW = ["#E53935", "#FB8C00", "#FDD835", "#43A047", "#1E88E5", "#8E24AA"]

FONT_PATH = r"C:\Windows\Fonts\YuGothB.ttc"

def font(size):
    return ImageFont.truetype(FONT_PATH, size)

F_LABEL = font(108)
F_SUB = font(46)
F_BADGE = font(40)

def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def lighten(rgb, amt):
    return tuple(min(255, int(c + (255 - c) * amt)) for c in rgb)

def darken(rgb, amt):
    return tuple(max(0, int(c * (1 - amt))) for c in rgb)

cell_w = ((W - 2 * PAD) - 2 * GAP) / 3
cell_h = ((H - 2 * PAD) - GAP) / 2

CELLS = [
    {"label": "買取査定", "sub": "写真を送るだけ・査定無料", "icon": "bicycle"},
    {"label": "出張引取", "sub": "処分費0円・出張費のみ", "icon": "truck"},
    {"label": "写真を送る", "sub": "ここに送るだけでOK", "dark": True, "icon": "camera"},
    {"label": "対応エリア", "sub": "石川県中心・北陸対応", "icon": "pin"},
    {"label": "よくある質問", "sub": "FAQ・お問い合わせ", "icon": "chat"},
    {"label": "公式サイト", "sub": "サービスの詳細はこちら", "icon": "house"},
]

# ── アイコン描画（正円・線画） ──────────────────────────
def draw_bicycle(d, cx, cy, r, color, w):
    dx = r * 0.62
    wr = r * 0.42
    d.ellipse([cx - dx - wr, cy - wr, cx - dx + wr, cy + wr], outline=color, width=w)
    d.ellipse([cx + dx - wr, cy - wr, cx + dx + wr, cy + wr], outline=color, width=w)
    top = (cx - 0.06 * r, cy - 0.62 * r)
    seat_l = (cx - dx, cy)
    hub_r = (cx + dx, cy)
    peg = (cx + 0.26 * r, cy)
    d.line([seat_l, top], fill=color, width=w)
    d.line([top, hub_r], fill=color, width=w)
    d.line([seat_l, peg], fill=color, width=w)
    d.line([peg, top], fill=color, width=w)
    d.line([top, (top[0] + 0.16 * r, top[1] - 0.26 * r)], fill=color, width=w)
    d.ellipse([cx - 0.16 * r, cy - 0.62 * r - 0.12 * r, cx + 0.02 * r, cy - 0.62 * r + 0.05 * r], fill=color)
    d.ellipse([cx - 0.05 * r, cy - 0.05 * r, cx + 0.05 * r, cy + 0.05 * r], outline=color, width=max(2, w - 2))

def draw_truck(d, cx, cy, r, color, w):
    bw, bh = 1.5 * r, 0.62 * r
    x0, y0 = cx - bw / 2, cy - bh / 2
    x1, y1 = cx + bw * 0.14, cy + bh / 2
    d.rounded_rectangle([x0, y0, x1, y1], radius=0.1 * r, outline=color, width=w)
    cab = [(x1, y0 + 0.18 * bh), (x1 + 0.42 * r, y0 + 0.18 * bh), (x1 + 0.62 * r, cy + 0.05 * bh), (x1, y1)]
    d.line(cab + [cab[0]], fill=color, width=w, joint="curve")
    wr = 0.17 * r
    for wx in (x0 + 0.32 * r, x1 + 0.18 * r):
        d.ellipse([wx - wr, y1 - wr * 0.7, wx + wr, y1 + wr * 1.3], outline=color, width=max(3, w - 2))
    for i in range(3):
        ly = cy - 0.3 * r + i * 0.18 * r
        d.line([(x0 - 0.5 * r + i * 0.06 * r, ly), (x0 - 0.16 * r, ly)], fill=color, width=max(3, w - 3))

def draw_camera(d, cx, cy, r, color, w):
    bw, bh = 1.35 * r, 0.85 * r
    d.rounded_rectangle([cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2], radius=0.14 * r, outline=color, width=w)
    fx0, fx1 = cx - 0.26 * r, cx + 0.26 * r
    fy = cy - bh / 2
    d.line([(fx0, fy), (fx0 + 0.12 * r, fy - 0.2 * r), (fx1 - 0.12 * r, fy - 0.2 * r), (fx1, fy)], fill=color, width=w, joint="curve")
    lr = 0.3 * r
    d.ellipse([cx - lr, cy - lr + 0.05 * r, cx + lr, cy + lr + 0.05 * r], outline=color, width=w)
    d.ellipse([cx + 0.34 * r, cy - bh / 2 + 0.12 * r, cx + 0.4 * r, cy - bh / 2 + 0.18 * r], fill=color)

def draw_pin(d, cx, cy, r, color, w):
    top_r = 0.5 * r
    top_cy = cy - 0.18 * r
    tip = (cx, cy + 0.62 * r)
    d.pieslice([cx - top_r, top_cy - top_r, cx + top_r, top_cy + top_r], 200, 340, outline=color, width=w)
    ang1 = math.radians(200)
    ang2 = math.radians(340)
    p1 = (cx + top_r * math.cos(ang1), top_cy + top_r * math.sin(ang1))
    p2 = (cx + top_r * math.cos(ang2), top_cy + top_r * math.sin(ang2))
    d.line([p1, tip], fill=color, width=w)
    d.line([p2, tip], fill=color, width=w)
    hr = 0.16 * r
    d.ellipse([cx - hr, top_cy - hr, cx + hr, top_cy + hr], outline=color, width=max(3, w - 2))

def draw_chat(d, cx, cy, r, color, w):
    bw, bh = 1.3 * r, 0.9 * r
    x0, y0, x1, y1 = cx - bw / 2, cy - bh / 2 - 0.06 * r, cx + bw / 2, cy + bh / 2 - 0.06 * r
    d.rounded_rectangle([x0, y0, x1, y1], radius=0.16 * r, outline=color, width=w)
    tail = [(cx - 0.2 * r, y1 - 0.03 * r), (cx - 0.32 * r, y1 + 0.24 * r), (cx + 0.06 * r, y1 - 0.03 * r)]
    d.polygon(tail, fill=color)
    for i in (-1, 0, 1):
        dcx = cx + i * 0.22 * r
        dr = 0.045 * r
        d.ellipse([dcx - dr, cy - 0.06 * r - dr, dcx + dr, cy - 0.06 * r + dr], fill=color)

def draw_house(d, cx, cy, r, color, w):
    bw = 1.15 * r
    top = cy - 0.68 * r
    base = cy + 0.34 * r
    roof_l = (cx - bw / 2 - 0.08 * r, cy - 0.08 * r)
    roof_r = (cx + bw / 2 + 0.08 * r, cy - 0.08 * r)
    apex = (cx, top)
    d.line([roof_l, apex, roof_r], fill=color, width=w, joint="curve")
    x0, x1 = cx - bw / 2, cx + bw / 2
    y0 = cy - 0.06 * r
    d.line([(x0, y0), (x0, base), (x1, base), (x1, y0)], fill=color, width=w, joint="curve")
    dw, dh = 0.24 * r, 0.42 * r
    d.rectangle([cx - dw / 2, base - dh, cx + dw / 2, base], outline=color, width=max(3, w - 2))

ICONS = {
    "bicycle": draw_bicycle, "truck": draw_truck, "camera": draw_camera,
    "pin": draw_pin, "chat": draw_chat, "house": draw_house,
}

# ── キャンバス作成 ──────────────────────────────────
img = Image.new("RGBA", (W, H), INK)
d = ImageDraw.Draw(img)

# 上部レインボーバー
bar_h = 16
n = len(RAINBOW)
seg_w = W / n
for i in range(n):
    c0, c1 = hex_to_rgb(RAINBOW[i]), hex_to_rgb(RAINBOW[(i + 1) % n])
    x0 = int(i * seg_w)
    x1 = int((i + 1) * seg_w)
    for x in range(x0, x1):
        t = (x - x0) / max(1, (x1 - x0))
        col = tuple(int(c0[k] + (c1[k] - c0[k]) * t) for k in range(3))
        d.line([(x, 0), (x, bar_h)], fill=col)

# セルパネル（角丸グラデーション＋光沢ハイライト）
panel_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for i, cell in enumerate(CELLS):
    col, row = i % 3, i // 3
    x0 = PAD + col * (cell_w + GAP)
    y0 = PAD + row * (cell_h + GAP)
    base = hex_to_rgb(RAINBOW[i])
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
    panel_layer.paste(grad, (int(x0), int(y0)), mask)

    gloss = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gloss)
    gd.polygon([(pw * 0.35, 0), (pw, 0), (pw, ph * 0.42), (pw * 0.68, ph * 0.18)], fill=(255, 255, 255, 55))
    gloss = gloss.filter(ImageFilter.GaussianBlur(10))
    gloss.putalpha(Image.composite(gloss.split()[3], Image.new("L", (pw, ph), 0), mask))
    panel_layer.alpha_composite(gloss, (int(x0), int(y0)))

img = Image.alpha_composite(img, panel_layer)

# アイコン（正円リング＋線画）
icon_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
idraw = ImageDraw.Draw(icon_layer)
for i, cell in enumerate(CELLS):
    col, row = i % 3, i // 3
    x0 = PAD + col * (cell_w + GAP)
    y0 = PAD + row * (cell_h + GAP)
    cx = x0 + cell_w / 2
    cy = y0 + cell_h * 0.40
    r = cell_w * 0.185
    ring_color = (255, 255, 255, 150) if not cell.get("dark") else (0, 0, 0, 90)
    idraw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=ring_color, width=6)
    icon_color = (20, 37, 28, 255) if cell.get("dark") else (255, 255, 255, 255)
    ICONS[cell["icon"]](idraw, cx, cy, r * 0.62, icon_color, 10)

img = Image.alpha_composite(img, icon_layer)

# ── テキスト ──────────────────────────────────────
shadow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow_layer)
text_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
tld = ImageDraw.Draw(text_layer)

for i, cell in enumerate(CELLS):
    col, row = i % 3, i // 3
    x0 = PAD + col * (cell_w + GAP)
    y0 = PAD + row * (cell_h + GAP)
    x1, y1 = x0 + cell_w, y0 + cell_h
    cx = (x0 + x1) / 2

    dark = cell.get("dark", False)
    label_color = (20, 37, 28, 255) if dark else (255, 255, 255, 255)
    sub_color = (0, 0, 0, 158) if dark else (255, 255, 255, 235)

    bottom_edge = y1 - 66
    sub_bbox = tld.textbbox((cx, bottom_edge), cell["sub"], font=F_SUB, anchor="mb")
    sub_top = sub_bbox[1]
    label_bottom = sub_top - 14

    if not dark:
        sd.text((cx, bottom_edge + 3), cell["sub"], font=F_SUB, fill=(0, 0, 0, 60), anchor="mb")
        sd.text((cx, label_bottom + 4), cell["label"], font=F_LABEL, fill=(0, 0, 0, 90), anchor="mb")

    tld.text((cx, bottom_edge), cell["sub"], font=F_SUB, fill=sub_color, anchor="mb")
    tld.text((cx, label_bottom), cell["label"], font=F_LABEL, fill=label_color, anchor="mb")

    if "badge" in cell:
        bt = cell["badge"]
        pad_x, pad_y = 34, 12
        bb = tld.textbbox((0, 0), bt, font=F_BADGE)
        bw, bh = bb[2] - bb[0], bb[3] - bb[1]
        bx1 = x1 - 36
        by0 = y0 + 32
        bx0 = bx1 - (bw + 2 * pad_x)
        by1 = by0 + (bh + 2 * pad_y)
        badge_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        bdraw = ImageDraw.Draw(badge_layer)
        bdraw.rounded_rectangle([bx0, by0, bx1, by1], radius=(by1 - by0) / 2, fill=(255, 255, 255, 255))
        img = Image.alpha_composite(img, badge_layer)
        tld.text(((bx0 + bx1) / 2, (by0 + by1) / 2 - bb[1]), bt, font=F_BADGE, fill=(198, 40, 40, 255), anchor="ma")

shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(6))
img = Image.alpha_composite(img, shadow_layer)
img = Image.alpha_composite(img, text_layer)

img.convert("RGB").save(OUT_PATH, "PNG")
print("saved:", OUT_PATH, img.size)
