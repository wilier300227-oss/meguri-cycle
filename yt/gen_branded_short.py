# -*- coding: utf-8 -*-
"""
めぐり自転車 ブランド版ショート動画ジェネレータ
4幕構成：フック → 価値訴求 → ロゴ → CTA（LINE誘導）
"""
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import os
import math

W, H = 1080, 1920
FPS = 30
TOTAL_SEC = 15
TOTAL_FRAMES = TOTAL_SEC * FPS
out_path = os.path.join(os.path.dirname(__file__), "meguri_shorts_raw.mp4")

# ブランドカラー（サイト・LINEリッチメニューと統一）
INK = "#1a2a28"        # サイトのダーク背景
LINE_GREEN = "#06C755"
RAINBOW = ["#E53935", "#FB8C00", "#FDD835", "#43A047", "#1E88E5", "#8E24AA"]

font_path = None
for p in [
    "C:\\Windows\\Fonts\\YuGothB.ttc",
    "C:\\Windows\\Fonts\\meiryob.ttc",
    "C:\\Windows\\Fonts\\msgothic.ttc",
    "/System/Library/Fonts/Supplemental/ヒラギノ角ゴ Pro W3.otf",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttf",
]:
    if os.path.exists(p):
        font_path = p
        break

def get_font(size):
    if font_path:
        return ImageFont.truetype(font_path, size)
    return ImageFont.load_default()

font_hook = get_font(96)
font_value = get_font(84)
font_logo = get_font(88)
font_logo_sub = get_font(44)
font_tagline = get_font(40)
font_cta_main = get_font(88)
font_cta_sub = get_font(56)
font_button = get_font(50)

fourcc = cv2.VideoWriter_fourcc(*"mp4v")
video = cv2.VideoWriter(out_path, fourcc, FPS, (W, H))

def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def draw_bicycle_logo(draw, cx, cy, scale=1.0, color="#FFFFFF"):
    r = 70 * scale
    dx = 95 * scale
    # 車輪
    draw.ellipse([cx-dx-r, cy-r, cx-dx+r, cy+r], outline=color, width=int(8*scale))
    draw.ellipse([cx+dx-r, cy-r, cx+dx+r, cy+r], outline=color, width=int(8*scale))
    # フレーム
    top = (cx-8*scale, cy-70*scale)
    draw.line([(cx-dx, cy), top], fill=color, width=int(8*scale))
    draw.line([top, (cx+dx, cy)], fill=color, width=int(8*scale))
    draw.line([(cx-dx, cy), (cx+30*scale, cy)], fill=color, width=int(8*scale))
    draw.line([(cx+30*scale, cy), top], fill=color, width=int(8*scale))
    # ハンドル・サドル
    draw.line([top, (top[0]+18*scale, top[1]-30*scale)], fill=color, width=int(8*scale))
    draw.ellipse([cx-18*scale, cy-70*scale-14*scale, cx+2*scale, cy-70*scale+6*scale], fill=color)

def draw_camera_icon(draw, cx, cy, scale=1.0, color="#FFFFFF"):
    bw, bh = 200*scale, 130*scale
    draw.rounded_rectangle([cx-bw/2, cy-bh/2, cx+bw/2, cy+bh/2], radius=18*scale, outline=color, width=int(9*scale))
    draw.polygon([
        (cx-40*scale, cy-bh/2), (cx-20*scale, cy-bh/2-30*scale),
        (cx+20*scale, cy-bh/2-30*scale), (cx+40*scale, cy-bh/2)
    ], outline=color, width=int(9*scale))
    r = 45*scale
    draw.ellipse([cx-r, cy-r+8*scale, cx+r, cy+r+8*scale], outline=color, width=int(9*scale))

print("動画を生成中...")

for i in range(TOTAL_FRAMES):
    t = i / FPS
    img = Image.new("RGBA", (W, H), INK)

    if t < 3.0:
        # ① 0-3秒 フック：虹の斜線が流れ込み、キャッチコピー
        d = ImageDraw.Draw(img)
        offset = int(t * 340)
        for j, color in enumerate(RAINBOW):
            y0 = 280 + j * 90
            d.line([(-500 + offset, y0), (W + 300 + offset, y0 - 500)], fill=color, width=26)

        txt_alpha = min(255, int((t / 0.6) * 255))
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        td = ImageDraw.Draw(layer)
        td.text((W//2, H//2), "その自転車、\n捨てる前に。",
                 fill=(255, 255, 255, txt_alpha), font=font_hook,
                 anchor="mm", align="center", spacing=30,
                 stroke_width=10, stroke_fill=(0, 0, 0, txt_alpha))
        img = Image.alpha_composite(img, layer)

    elif t < 7.0:
        # ② 3-7秒 価値訴求：カメラアイコン＋「写真を送るだけで無料査定」
        local_t = t - 3.0
        d = ImageDraw.Draw(img)

        bounce = abs(math.sin(local_t * 2.4)) * 22
        cam_scale = min(1.0, local_t / 0.4)
        draw_camera_icon(d, W//2, H//2 - 260 - bounce, scale=1.7 * cam_scale, color="#FDD835")

        slide = max(0, 60 - int(local_t * 140))
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        td = ImageDraw.Draw(layer)
        td.text((W//2, H//2 + 40 + slide), "写真を送るだけで\n無料査定",
                 fill="#FFFFFF", font=font_value, anchor="mm", align="center", spacing=26,
                 stroke_width=8, stroke_fill=INK)
        td.text((W//2, H//2 + 220 + slide), "LINEで完結。48時間以内に確定額をご連絡",
                 fill="#A8C9C3", font=font_tagline, anchor="mm", align="center")
        img = Image.alpha_composite(img, layer)

    elif t < 12.0:
        # ③ 7-12秒 ロゴ：虹アーチ＋自転車ロゴ＋サイトURL
        local_t = t - 7.0
        d = ImageDraw.Draw(img)

        cx, cy = W//2, H//2 - 160
        arc_alpha = min(255, int(local_t / 0.5 * 255))
        arc_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ad = ImageDraw.Draw(arc_layer)
        for k, color in enumerate(RAINBOW):
            rgb = hex_to_rgb(color)
            ad.arc([cx-260, cy-260+k*10, cx+260, cy+40+k*10], start=180, end=360,
                    fill=rgb + (arc_alpha,), width=14)
        img = Image.alpha_composite(img, arc_layer)
        d = ImageDraw.Draw(img)

        logo_scale = min(1.0, local_t / 0.5)
        draw_bicycle_logo(d, cx, cy + 40, scale=1.15 * logo_scale, color="#FFFFFF")

        text_alpha = min(255, int(max(0, local_t - 0.3) / 0.6 * 255))
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        td = ImageDraw.Draw(layer)
        td.text((W//2, cy + 230), "めぐり自転車", fill=(255, 255, 255, text_alpha), font=font_logo, anchor="mm")
        td.text((W//2, cy + 300), "meguri-cycle.com", fill=(105, 240, 174, text_alpha), font=font_logo_sub, anchor="mm")
        td.text((W//2, cy + 370), "その一台に、次のめぐりを。", fill=(200, 210, 205, text_alpha), font=font_tagline, anchor="mm")
        img = Image.alpha_composite(img, layer)

    else:
        # ④ 12-15秒 CTA：LINE誘導
        local_t = t - 12.0
        img.paste(Image.new("RGBA", (W, H), LINE_GREEN), (0, 0))
        d = ImageDraw.Draw(img)

        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        td = ImageDraw.Draw(layer)
        td.text((W//2, H//2 - 260), "LINEで無料査定",
                 fill="#FFFFFF", font=font_cta_main, anchor="mm", align="center",
                 stroke_width=8, stroke_fill="#04913F")
        td.text((W//2, H//2 - 150), "@136bpsyc", fill="#FFFFFF", font=font_cta_sub, anchor="mm")
        img = Image.alpha_composite(img, layer)
        d = ImageDraw.Draw(img)

        scale = 1.0 + 0.05 * math.sin(local_t * 10)
        bw, bh = 640 * scale, 130 * scale
        bx, by = W//2, H//2 + 120
        d.rounded_rectangle([bx-bw/2, by-bh/2, bx+bw/2, by+bh/2], radius=26, fill="#FFFFFF")
        d.text((bx, by), "友だち追加はこちら →", fill=LINE_GREEN, font=font_button, anchor="mm")

        d.text((W//2, H//2 + 320), "査定・出張は無料。処分費も0円", fill="#EAFFF4", font=font_tagline, anchor="mm")

    frame = cv2.cvtColor(np.array(img.convert("RGB")), cv2.COLOR_RGB2BGR)
    video.write(frame)

video.release()
print(f"完了: {out_path}")
