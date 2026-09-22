# -*- coding: utf-8 -*-
"""撮影マップを PNG で作る。LINE の画像メッセージ用。
線画だと伝わらない（2026-09-22 オーナー指摘）ので、実物の全体写真の上に番号を置く形にした。

  python docs/mihon/make-map.py --src <生成画像のフォルダ> --out images/mihon
出力：map_normal.png / map_ebike.png / map_battery.png と、それぞれの _p.png（プレビュー、幅 400）
"""
import argparse, os, sys, importlib.util
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('make_mihon', os.path.join(HERE, 'make-mihon.py'))
mm = importlib.util.module_from_spec(spec); spec.loader.exec_module(mm)

INK = (26, 43, 69)
SUB = (90, 105, 130)
TOP, BOTTOM = 96, 150
CROP = (0, 150, 1024, 870)   # 全体写真の上下（壁と床）を少し詰める

# 番号 → 写真上の位置（1024px 座標）。全体（右から／左から）と、反対側・充電器は写真に置けないので下の注記に
NORMAL_POS = {'1・2': (150, 230), '3': (700, 470), '4': (650, 250), '5': (485, 680), '6・7': (800, 690), '8・9': (240, 690), '10': (800, 380), '11': (230, 440)}
NORMAL_NOTE = ['1・2 は自転車ぜんぶ（右から・左から）。6・7 と 8・9 は右と左から1枚ずつ。',
               '10・11 の前カゴ・荷台は、付いていれば。']
EBIKE_POS = {'1・2': (150, 230), '3': (660, 470), '4': (640, 260), '5': (730, 230), '6': (520, 690), '7・8': (800, 660), '9・10': (200, 660), '11': (860, 380), '12': (200, 440), '13': (450, 540), '14': (430, 610), '15': (930, 840)}
EBIKE_NOTE = ['1・2 は自転車ぜんぶ（右から・左から）。7・8 と 9・10 は右と左から1枚ずつ。',
              '13・14 はバッテリーの鍵と型番（位置はメーカーで違います）。15 は充電器に載せた状態。']


def photo_map(src_dir, src_id, pos, title, notes):
    base = mm.load_clean(src_dir, src_id)
    if base is None:
        base = Image.new('RGB', (1024, 1024), (238, 241, 245))
    photo = base.crop(CROP)
    W, H = photo.width, photo.height
    im = Image.new('RGB', (W, TOP + H + BOTTOM), (255, 255, 255))
    im.paste(photo, (0, TOP))
    d = ImageDraw.Draw(im)
    for n, (x, y) in pos.items():
        cx, cy = x - CROP[0], y - CROP[1] + TOP
        if '・' in str(n):
            f = mm.font(38); tw = d.textlength(str(n), font=f)
            d.rounded_rectangle([cx - tw / 2 - 22, cy - 34, cx + tw / 2 + 22, cy + 34], radius=34, fill=mm.RED, outline=(255, 255, 255), width=4)
            d.text((cx, cy + 2), str(n), font=f, fill=(255, 255, 255), anchor='mm')
        else:
            mm.badge(d, cx, cy, int(n), r=34)
    d.text((24, 22), title, font=mm.font(40), fill=INK)
    for i, t in enumerate(notes):
        d.text((24, TOP + H + 22 + i * 44), t, font=mm.font(26, bold=False), fill=SUB)
    return im


def battery_map():
    W, H = 1024, 640
    im = Image.new('RGB', (W, TOP + H + 100), (255, 255, 255))
    d = ImageDraw.Draw(im)
    LINE = (58, 90, 136)
    x0, y0, x1, y1 = 400, TOP + 60, 620, TOP + 520
    d.rounded_rectangle([x0, y0, x1, y1], radius=26, outline=LINE, width=7)
    d.rectangle([x0 + 50, y1, x1 - 50, y1 + 34], outline=LINE, width=7)
    d.rounded_rectangle([x0 + 60, y0 + 40, x1 - 60, y0 + 96], radius=8, outline=LINE, width=4)
    for i in range(5):
        d.ellipse([x0 + 160, y0 + 140 + i * 44, x0 + 182, y0 + 162 + i * 44], outline=LINE, width=3)
    mm.badge(d, x0 - 50, (y0 + y1) / 2, 1, r=34)
    mm.badge(d, x1 + 50, (y0 + y1) / 2, 2, r=34)
    mm.badge(d, (x0 + x1) / 2, y0 + 68, 3, r=34)
    mm.badge(d, (x0 + x1) / 2, y1 + 17, 4, r=34)
    d.text((24, 22), '撮る場所（バッテリーだけ・4枚）', font=mm.font(40), fill=INK)
    d.text((24, TOP + H + 22), '1 正面　2 横（ふくらみの確認）　3 型番のシール　4 端子', font=mm.font(26, bold=False), fill=SUB)
    return im


def save(im, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'PNG', optimize=True)
    pv = im.copy(); pv.thumbnail((400, 400))
    pv.save(path.replace('.png', '_p.png'), 'PNG', optimize=True)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--out', default='images/mihon')
    a = ap.parse_args()
    save(photo_map(a.src, '3337', NORMAL_POS, '撮る場所（一般車・11枚）', NORMAL_NOTE), os.path.join(a.out, 'map_normal.png'))
    save(photo_map(a.src, '3343', EBIKE_POS, '撮る場所（電動アシスト・15枚＋動画1本）', EBIKE_NOTE), os.path.join(a.out, 'map_ebike.png'))
    save(battery_map(), os.path.join(a.out, 'map_battery.png'))
    print('ok')
