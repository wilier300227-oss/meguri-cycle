import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import os
import math

W, H = 360, 640
FPS = 30
TOTAL_FRAMES = 15 * FPS
out_path = "meguri_shorts_preview.mp4"

# 動画ライターの初期化
fourcc = cv2.VideoWriter_fourcc(*'mp4v')
video = cv2.VideoWriter(out_path, fourcc, FPS, (W, H))

# OSごとの日本語フォントのパスを自動チェック
font_path = None
font_paths_to_check = [
    "C:\\Windows\\Fonts\\msgothic.ttc",  # Windows
    "C:\\Windows\\Fonts\\msmincho.ttc",
    "/Library/Fonts/Arial Unicode.ttf",  # Mac
    "/System/Library/Fonts/Supplemental/ヒラギノ角ゴ Pro W3.otf",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttf" # Linux
]
for p in font_paths_to_check:
    if os.path.exists(p):
        font_path = p
        break

def get_font(size):
    if font_path:
        return ImageFont.truetype(font_path, size)
    return ImageFont.load_default()

font_text = get_font(28)
font_sub = get_font(16)
font_caption = get_font(18)

print("動画を生成中... (約15秒かかります)")

for i in range(TOTAL_FRAMES):
    t = i / FPS
    img = Image.new("RGBA", (W, H), "#FFFFFF")

    if t < 3.0:
        # ① 0〜3秒: フック面 (ラインが流れるアニメーション)
        img.paste(Image.new("RGBA", (W, H), "#0F172A"), (0,0))
        d = ImageDraw.Draw(img)
        colors = ["#FF3B30", "#FF9500", "#FFCC00", "#4CD964", "#5AC8FA", "#5856D6"]
        offset_x = int(t * 80)
        for j, color in enumerate(colors):
            d.line([(-150 + offset_x, 100 + j*30), (W+50 + offset_x, 250 + j*30)], fill=color, width=15)

        txt_alpha = min(255, int((t / 0.5) * 255))
        txt_layer = Image.new("RGBA", (W, H), (0,0,0,0))
        td = ImageDraw.Draw(txt_layer)
        td.text((W//2, H//2 - 40), "ただの移動、\n飽きてない？", fill=(255,255,255,txt_alpha), font=font_text, anchor="mm", align="center", stroke_width=4, stroke_fill=(0,0,0,txt_alpha))
        img = Image.alpha_composite(img, txt_layer)

    elif t < 7.0:
        # ② 3〜7秒: イメージ面 (道路が迫ってくるアニメーション)
        local_t = t - 3.0
        img.paste(Image.new("RGBA", (W, H), "#5AC8FA"), (0,0))
        d = ImageDraw.Draw(img)
        d.ellipse([(-150, H-250), (W+150, H+250)], fill="#4CD964")
        d.polygon([(W//2-40, H-200), (W//2+40, H-200), (W+80, H), (-80, H)], fill="#1E293B")

        speed = 250
        line_y_offset = (local_t * speed) % 150
        for k in range(4):
            y1 = H - 200 + line_y_offset + k*150
            y2 = y1 + 60
            if y1 < H:
                w1 = 2 + (y1 - (H-200)) * 0.06
                w2 = 2 + (y2 - (H-200)) * 0.06
                x_c = W//2
                d.polygon([(x_c-w1, y1), (x_c+w1, y1), (x_c+w2, y2), (x_c-w2, y2)], fill="#FFFFFF")

        txt_layer = Image.new("RGBA", (W, H), (0,0,0,0))
        td = ImageDraw.Draw(txt_layer)
        y_slide = max(0, 30 - int(local_t * 60))
        td.text((W//2, H//2 - 60 + y_slide), "日常を「冒険」に\n変えるサイクル。", fill=(255,255,255,255), font=font_text, anchor="mm", align="center", stroke_width=5, stroke_fill=(11,37,69,255))
        img = Image.alpha_composite(img, txt_layer)

    elif t < 12.0:
        # ③ 7〜12秒: ロゴ面 (ロゴ登場)
        local_t = t - 7.0
        base = Image.new("RGBA", (W, H), "#FFFFFF")
        cx, cy = W//2, H//2 - 100

        sun_layer = Image.new("RGBA", (W, H), (0,0,0,0))
        sun_d = ImageDraw.Draw(sun_layer)
        sun_d.ellipse([(cx-45, cy-75), (cx+45, cy+15)], fill=(243, 112, 33, 50))
        base = Image.alpha_composite(base, sun_layer)

        d3 = ImageDraw.Draw(base)
        d3.arc([(cx-130, cy-20), (cx+130, cy+110)], start=180, end=360, fill="#FF9500", width=10)
        d3.ellipse([(cx-55, cy+25), (cx-20, cy+60)], outline="#0B2545", width=4)
        d3.ellipse([(cx+20, cy+15), (cx+55, cy+50)], outline="#0B2545", width=4)
        d3.polygon([(cx-38, cy+42), (cx, cy+42), (cx-10, cy+15)], outline="#0B2545", width=4)
        d3.line([(cx, cy+42), (cx+28, cy+8), (cx-10, cy+15)], fill="#0B2545", width=4)
        d3.line([(cx+28, cy+8), (cx+38, cy+32)], fill="#0B2545", width=4)
        d3.line([(cx-10, cy+15), (cx+12, cy-15)], fill="#0B2545", width=7)
        d3.ellipse([(cx+7, cy-25), (cx+22, cy-10)], fill="#0B2545")

        d3.text((W//2, cy + 110), "meguri·cycle", fill="#0B2545", font=font_text, anchor="mm")
        d3.text((W//2, cy + 150), ".com", fill="#0B2545", font=font_sub, anchor="mm")
        d3.text((W//2, cy + 185), "めぐる。つながる。冒険の旅へ。", fill="#0B2545", font=font_sub, anchor="mm")
        d3.text((W//2, cy + 225), "BY RAINBOW", fill="#A0AEC0", font=font_sub, anchor="mm")

        alpha = min(255, int(local_t * 510))
        if alpha < 255:
            fade_layer = Image.new("RGBA", (W, H), (255,255,255, 255-alpha))
            base = Image.alpha_composite(base, fade_layer)
        img = base

    else:
        # ④ 12〜15秒: 行動喚起 (脈打ちアニメーション)
        local_t = t - 12.0
        img.paste(Image.new("RGBA", (W, H), "#F37021"), (0,0))
        d = ImageDraw.Draw(img)

        scale = 1.0 + 0.04 * math.sin(local_t * 12)
        bw, bh = 280 * scale, 65 * scale
        bx, by = W//2, H//2 + 65
        d.rounded_rectangle([(bx - bw//2, by - bh//2), (bx + bw//2, by + bh//2)], radius=12, fill="#FFFFFF")

        d.text((W//2, H//2 + 65), "今すぐリンクをクリック", fill="#F37021", font=font_caption, anchor="mm")
        d.text((W//2, H//2 - 60), "今すぐ、\n概要欄のURLへ！", fill="#FFFFFF", font=font_text, anchor="mm", align="center", stroke_width=4, stroke_fill="#000000")

    frame = cv2.cvtColor(np.array(img.convert("RGB")), cv2.COLOR_RGB2BGR)
    video.write(frame)

video.release()
print(f"完了しました！保存先: {os.path.abspath(out_path)}")
