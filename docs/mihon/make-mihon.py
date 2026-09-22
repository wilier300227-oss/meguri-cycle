# -*- coding: utf-8 -*-
"""写真査定の見本画像を作る（要件定義 docs/spec_photo_appraisal_2026-09-20.md §2.4）。

入力：オーナーが Gemini で生成した正方形の PNG（3337.png … 3348.png）。リポジトリには入れない。
出力：images/mihon/<normal|ebike>/NN.jpg（1024、赤い点線の枠＋番号）と NN_p.jpg（400、LINE のプレビュー用）、
      setN.jpg（まとまりごとの合成。2〜4コマ、各コマに番号と短い名称）。

  python docs/mihon/make-mihon.py --src <生成画像のフォルダ> --out images/mihon

星マーク（生成AIの印、右下）は「切り落とす」と全体写真の前輪まで切れてしまうため、すぐ隣の同じ床・壁の模様を持ってきて
境界をなじませて覆う（cv2.seamlessClone）。要件の「切り落とす」からの変更点なので、オーナーに報告済み（2026-09-22）。
実写真がまだ無い箇所（品番シール・手元スイッチ・型番・鍵、文字消し待ちの後輪）は、番号と名称だけの仮パネルにして
あとから差し替えられるようにしている。
"""
import argparse, os
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont

RED = (229, 50, 45)
INK = (26, 43, 69)
PANEL = (238, 241, 245)
SIZE = 1024
PREVIEW = 400

# 星マークの位置（11枚とも同じ。1024px の右下）
STAR_CENTER, STAR_R = (905, 905), 48

# 「大きく写してほしい範囲」の枠。1024px 座標。目視で決めた（2026-09-22）
FRAMES = {
    '3337': (40, 190, 1000, 880),    # 右から全体（一般車）
    '3338': (50, 190, 1000, 880),    # 左から全体
    '3343': (30, 200, 1000, 900),    # 右から全体（電動）
    '3344': (140, 240, 960, 860),    # ハンドルまわり
    '3339': (10, 250, 960, 900),     # チェーン・ペダルまわり
    '3340': (60, 30, 960, 950),      # 前輪
    '3341': (20, 140, 910, 1010),    # 前カゴ
    '3342': (170, 180, 1010, 720),   # 荷台と後ろの泥よけ
    '3346': (300, 150, 720, 900),    # 充電器に載せた状態
    '3345': (60, 30, 960, 950),      # 後輪（文字消し後に使う）
    '3348': (200, 250, 760, 1000),   # 鍵を挿した状態（文字消し後に使う）
}

SIDE_NOTE = '反対側からも同じように1枚'
PENDING = '実写真を準備中'

# 番号 → (元画像, 短い名称, 補足)。元画像が None は仮パネル
NORMAL = {
    1: ('3337', '右から全体', ''), 2: ('3338', '左から全体', ''), 3: (None, '品番シール', PENDING),
    4: ('3344', 'ハンドルまわり', ''), 5: ('3339', 'チェーン・ペダル', ''),
    6: ('3340', '前輪・右', ''), 7: ('3340', '前輪・左', SIDE_NOTE),
    8: ('3345', '後輪・右', ''), 9: ('3345', '後輪・左', SIDE_NOTE),
    10: ('3341', '前カゴ', ''), 11: ('3342', '荷台', ''),
}
EBIKE = {
    1: ('3343', '右から全体', ''), 2: ('3338', '左から全体', ''), 3: (None, '品番シール', PENDING),
    4: ('3344', 'ハンドルまわり', ''), 5: (None, '手元スイッチ（電源オン）', PENDING), 6: ('3339', 'チェーン・ペダル', ''),
    7: ('3340', '前輪・右', ''), 8: ('3340', '前輪・左', SIDE_NOTE),
    9: ('3345', '後輪・右', ''), 10: ('3345', '後輪・左', SIDE_NOTE),
    11: ('3341', '前カゴ', ''), 12: ('3342', '荷台', ''),
    13: ('3348', '鍵を挿した状態', ''), 14: (None, '型番・ロット番号', PENDING), 15: ('3346', '充電器に載せた状態', ''),
}
# まとまり（§2.3）→ 番号。1コマだけのまとまりは個別画像をそのまま使う
SETS_NORMAL = {1: [1, 2, 3], 2: [4, 5], 3: [6, 7, 8, 9], 4: [10, 11]}
SETS_EBIKE = {1: [1, 2, 3], 2: [4, 5, 6], 3: [7, 8, 9, 10], 4: [11, 12], 5: [13, 14]}


def font(size, bold=True):
    cands = [('C:/Windows/Fonts/NotoSansJP-VF.ttf', 'Bold' if bold else 'Regular'), ('C:/Windows/Fonts/meiryob.ttc' if bold else 'C:/Windows/Fonts/meiryo.ttc', None)]
    for path, var in cands:
        if not os.path.exists(path):
            continue
        try:
            f = ImageFont.truetype(path, size)
            if var:
                try:
                    f.set_variation_by_name(var)
                except Exception:
                    try:
                        f.set_variation_by_name(var.encode())
                    except Exception:
                        pass
            return f
        except Exception:
            continue
    return ImageFont.load_default()


# 星マークの消し方（画像ごとに指定。自動で「平坦な隣」を選ぶと車輪やペダルを貼ってしまったため）
#   ('clone', (sx, sy))：その中心の床・壁の模様を持ってきて境界をなじませて覆う（ポアソン合成）
#   ('inpaint', r)     ：針金や管が入り込む場所は、半径 r の小さな範囲だけ周囲から塗る
STAR_FIX = {
    '3337': ('clone', (777, 905)),   # 床（前輪の左下）
    '3338': ('clone', (777, 905)),   # 床（後輪の下）
    '3343': ('clone', (760, 960)),   # 床（前輪の真下は避け、さらに下）
    '3344': ('clone', (777, 905)),   # 床
    '3339': ('clone', (640, 905)),   # 壁（ペダルの左下、チェーンより下）
    '3340': ('clone', (777, 905)),   # 床（同じ高さの真横。x=777 でのタイヤ下端は y≈832 なので重ならない）
    '3345': ('clone', (777, 905)),   # 床（後輪。文字消し後に使う。3340 と同じ構図）
    '3346': ('clone', (777, 905)),   # 床
    '3341': ('inpaint', 34),         # 前カゴ：針金が入り込むので小さく塗る
    '3342': ('inpaint', 34),         # 荷台：管が入り込むので小さく塗る
    '3348': ('inpaint', 34),         # 鍵：黒い管の上。文字消し後に使う
}


def remove_star(im, src_id):
    arr = cv2.cvtColor(np.array(im.convert('RGB')), cv2.COLOR_RGB2BGR)
    cx, cy = STAR_CENTER
    method, arg = STAR_FIX.get(src_id, ('clone', (cx - 128, cy)))
    if method == 'inpaint':
        mask = np.zeros(arr.shape[:2], np.uint8)
        cv2.circle(mask, (cx, cy), int(arg), 255, -1)
        out = cv2.inpaint(arr, mask, 5, cv2.INPAINT_NS)
    else:
        sx, sy = arg
        r = STAR_R + 6
        patch = arr[sy - r:sy + r, sx - r:sx + r].copy()
        mask = np.full(patch.shape[:2], 255, np.uint8)
        out = cv2.seamlessClone(patch, arr, mask, (cx, cy), cv2.NORMAL_CLONE)
    return Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB))


def dashed_rect(draw, box, color=RED, width=8, dash=26, gap=14):
    x0, y0, x1, y1 = box
    def seg(a, b, horizontal, fixed):
        pos = a
        while pos < b:
            end = min(pos + dash, b)
            if horizontal:
                draw.line([(pos, fixed), (end, fixed)], fill=color, width=width)
            else:
                draw.line([(fixed, pos), (fixed, end)], fill=color, width=width)
            pos = end + gap
    seg(x0, x1, True, y0); seg(x0, x1, True, y1); seg(y0, y1, False, x0); seg(y0, y1, False, x1)


def badge(draw, cx, cy, n, r=46):
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=RED, outline=(255, 255, 255), width=4)
    f = font(int(r * 1.15) if n < 10 else int(r * 0.95))
    draw.text((cx, cy + 2), str(n), font=f, fill=(255, 255, 255), anchor='mm')


def caption_strip(im, text, note=''):
    """画像の下に白い帯を足して名称（と補足）を書く。合成画像のコマに使う"""
    w = im.width
    strip_h = 64 if not note else 92
    out = Image.new('RGB', (w, im.height + strip_h), (255, 255, 255))
    out.paste(im, (0, 0))
    d = ImageDraw.Draw(out)
    d.text((16, im.height + 12), text, font=font(30), fill=INK)
    if note:
        d.text((16, im.height + 52), note, font=font(22, bold=False), fill=(90, 105, 130))
    return out


def make_single(src_dir, n, spec):
    src, label, note = spec
    path = os.path.join(src_dir, (src or '') + '.png')
    if src and os.path.exists(path):
        im = remove_star(Image.open(path).convert('RGB').resize((SIZE, SIZE)), src)
        d = ImageDraw.Draw(im)
        box = FRAMES[src]
        dashed_rect(d, box)
        badge(d, box[0] + 60, box[1] + 60, n)
        if note:
            # 「反対側から…」の補足は、1:1 を保つため画像の中（左下の白い小札）に入れる
            f = font(30, bold=False)
            tw = d.textlength(note, font=f)
            box = (24, SIZE - 88, int(24 + tw + 36), SIZE - 24)
            d.rounded_rectangle(box, radius=14, fill=(255, 255, 255), outline=(200, 206, 216), width=2)
            d.text((box[0] + 18, box[1] + 15), note, font=f, fill=INK)
        return im, True
    # 仮パネル
    im = Image.new('RGB', (SIZE, SIZE), PANEL)
    d = ImageDraw.Draw(im)
    dashed_rect(d, (80, 80, SIZE - 80, SIZE - 80), color=(190, 198, 210))
    badge(d, 140, 140, n)
    d.text((SIZE // 2, SIZE // 2 - 30), label, font=font(56), fill=INK, anchor='mm')
    d.text((SIZE // 2, SIZE // 2 + 50), note or PENDING, font=font(30, bold=False), fill=(120, 132, 150), anchor='mm')
    return im, False


def make_set(tiles):
    """2列のグリッド。tiles = [(画像, 番号, 名称, 補足)]"""
    tile = 500
    cells = []
    for im, n, label, note in tiles:
        t = im.resize((tile, tile)) if im.width == im.height else im.resize((tile, int(im.height * tile / im.width)))
        t = t.crop((0, 0, tile, tile)) if t.height > tile else t
        cells.append(caption_strip(t, f'{n}　{label}', note))
    cols = 2 if len(cells) > 1 else 1
    rows = (len(cells) + cols - 1) // cols
    cw, ch = cells[0].width, max(c.height for c in cells)
    pad = 12
    out = Image.new('RGB', (cols * cw + (cols + 1) * pad, rows * ch + (rows + 1) * pad), (255, 255, 255))
    for i, c in enumerate(cells):
        r, k = divmod(i, cols)
        out.paste(c, (pad + k * (cw + pad), pad + r * (ch + pad)))
    return out


def save(im, path, quality=88):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'JPEG', quality=quality, optimize=True)
    pv = im.copy(); pv.thumbnail((PREVIEW, PREVIEW))
    pv.save(path.replace('.jpg', '_p.jpg'), 'JPEG', quality=80, optimize=True)


def run(src_dir, out_dir):
    report = []
    for variant, table, sets in (('normal', NORMAL, SETS_NORMAL), ('ebike', EBIKE, SETS_EBIKE)):
        made = {}
        for n, spec in table.items():
            im, real = make_single(src_dir, n, spec)
            # 個別画像は 1:1 で保存（補足帯つきの場合は帯を除いた正方形部分も保存しない。帯つきのまま）
            save(im, os.path.join(out_dir, variant, f'{n:02d}.jpg'))
            made[n] = (im, spec, real)
            report.append(f'{variant}/{n:02d}.jpg  {spec[1]}  {"OK" if real else "仮パネル"}')
        for sn, nums in sets.items():
            tiles = []
            for n in nums:
                im, spec, real = made[n]
                # コマには元の正方形部分だけを使う（補足はコマの帯で書く）
                sq = im
                tiles.append((sq, n, spec[1], spec[2] if spec[2] != PENDING else ('実写真を準備中' if not real else '')))
            save(make_set(tiles), os.path.join(out_dir, variant, f'set{sn}.jpg'), quality=85)
            report.append(f'{variant}/set{sn}.jpg  コマ {nums}')
    return report


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True, help='生成画像（NNNN.png）のフォルダ。リポジトリ外')
    ap.add_argument('--out', default='images/mihon')
    a = ap.parse_args()
    for line in run(a.src, a.out):
        print(line)
