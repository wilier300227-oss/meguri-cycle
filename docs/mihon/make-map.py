# -*- coding: utf-8 -*-
"""撮影マップ（横から見た自転車の線画に番号付きの丸）を PNG で作る。LINE の画像メッセージ用。
要件定義 §2.4：一般車・電動・バッテリー単体の3種。/photo-guide/ のインライン SVG と同じ構図。

  python docs/mihon/make-map.py --out images/mihon
出力：map_normal.png / map_ebike.png / map_battery.png（1000×600 前後）と、それぞれの _p.png（プレビュー、幅 400）
"""
import argparse, os
from PIL import Image, ImageDraw, ImageFont

NAVY = (30, 58, 95)
LINE = (58, 90, 136)
INK = (26, 43, 69)
W, H = 1000, 600
S = W / 420.0  # SVG（420×240）からの倍率


def font(size):
    for p in ('C:/Windows/Fonts/NotoSansJP-VF.ttf', 'C:/Windows/Fonts/meiryob.ttc'):
        if os.path.exists(p):
            f = ImageFont.truetype(p, size)
            try: f.set_variation_by_name('Bold')
            except Exception:
                try: f.set_variation_by_name(b'Bold')
                except Exception: pass
            return f
    return ImageFont.load_default()


def badge(d, x, y, n, r=22):
    d.ellipse([x - r, y - r, x + r, y + r], fill=NAVY, outline=(255, 255, 255), width=3)
    d.text((x, y + 1), str(n), font=font(24 if n < 10 else 20), fill=(255, 255, 255), anchor='mm')


def bike(d):
    def P(x, y): return (x * S, y * S + 40)
    w = 6
    d.ellipse([P(95 - 46, 170 - 46), P(95 + 46, 170 + 46)], outline=LINE, width=w)
    d.ellipse([P(308 - 46, 170 - 46), P(308 + 46, 170 + 46)], outline=LINE, width=w)
    for a, b in [((95, 170), (170, 170)), ((170, 170), (214, 98)), ((214, 98), (256, 170)), ((170, 170), (204, 104)),
                 ((214, 98), (308, 170)), ((204, 104), (186, 80)), ((166, 82), (206, 82)), ((214, 98), (228, 70)), ((210, 66), (246, 66))]:
        d.line([P(*a), P(*b)], fill=LINE, width=w)
    d.ellipse([P(170 - 8, 170 - 8), P(170 + 8, 170 + 8)], fill=(107, 135, 174))
    return P


def make_bike_map(variant):
    im = Image.new('RGB', (W, H), (255, 255, 255))
    d = ImageDraw.Draw(im)
    P = bike(d)
    # 番号 → 位置（SVG 座標）。一般車と電動で番号が違う（要件 §2.2）
    if variant == 'normal':
        pos = {1: (38, 36), 2: (76, 36), 3: (234, 46), 4: (186, 52), 5: (170, 206), 6: (308, 112), 8: (95, 112), 10: (278, 46), 11: (142, 46)}
        note = '7・9 は反対側（左側）から同じように1枚ずつ。前カゴ・荷台は付いていれば。'
        title = '撮る場所（一般車・11枚）'
    else:
        pos = {1: (38, 36), 2: (76, 36), 3: (234, 46), 4: (186, 52), 5: (150, 90), 6: (170, 206), 7: (308, 112), 9: (95, 112), 11: (278, 46), 12: (142, 46), 13: (222, 150), 14: (250, 128), 15: (330, 36)}
        note = '8・10 は反対側から同じように1枚ずつ。13〜15 はバッテリーまわり（位置はメーカーによって違います）。'
        title = '撮る場所（電動アシスト・15枚＋診断動画1本）'
    for n, (x, y) in pos.items():
        badge(d, x * S, y * S + 40, n)
    d.text((24, 12), title, font=font(30), fill=INK)
    d.text((24, H - 44), note, font=font(20), fill=(90, 105, 130))
    return im


def make_battery_map():
    im = Image.new('RGB', (W, H), (255, 255, 255))
    d = ImageDraw.Draw(im)
    # バッテリー本体（縦長）と端子
    x0, y0, x1, y1 = 330, 110, 530, 470
    d.rounded_rectangle([x0, y0, x1, y1], radius=24, outline=LINE, width=6)
    d.rectangle([x0 + 40, y1, x1 - 40, y1 + 30], outline=LINE, width=6)  # 端子
    d.rounded_rectangle([x0 + 60, y0 + 40, x1 - 60, y0 + 90], radius=8, outline=LINE, width=4)  # 型番シール
    for i in range(5):  # 残量ランプ
        d.ellipse([x0 + 150, y0 + 130 + i * 40, x0 + 170, y0 + 150 + i * 40], outline=LINE, width=3)
    badge(d, x0 - 40, (y0 + y1) / 2, 1)
    badge(d, x1 + 40, (y0 + y1) / 2, 2)
    badge(d, (x0 + x1) / 2, y0 + 65, 3)
    badge(d, (x0 + x1) / 2, y1 + 15, 4)
    d.text((24, 12), '撮る場所（バッテリー単体・4枚＋診断動画1本）', font=font(30), fill=INK)
    d.text((24, H - 44), '1 正面　2 横（膨らみの確認）　3 型番・ロット番号のシール　4 端子', font=font(20), fill=(90, 105, 130))
    return im


def save(im, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'PNG', optimize=True)
    pv = im.copy(); pv.thumbnail((400, 400))
    pv.save(path.replace('.png', '_p.png'), 'PNG', optimize=True)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='images/mihon')
    a = ap.parse_args()
    save(make_bike_map('normal'), os.path.join(a.out, 'map_normal.png'))
    save(make_bike_map('ebike'), os.path.join(a.out, 'map_ebike.png'))
    save(make_battery_map(), os.path.join(a.out, 'map_battery.png'))
    print('ok')
