# 使い方（2026-09-28）：
#   1. 同じフォルダに p17.json（石川）・p16.json（富山）を置く
#      https://raw.githubusercontent.com/smartnews-smri/japan-topography/main/data/municipality/geojson/s0010/N03-21_17_210101.json
#      https://raw.githubusercontent.com/smartnews-smri/japan-topography/main/data/municipality/geojson/s0010/N03-21_16_210101.json
#   2. python make_areamap.py → areamap.svg.html ができる
#   3. area.html の <svg class="areamap__svg" …>…</svg> をその中身に差し替える
#   出典表記「国土数値情報（行政区域データ）（国土交通省）を加工して作成」は地図の下に必須。
#   市町を増やすときは REGIONS・SLUG に足し、area.html のカードと地域の並びも合わせる。
"""石川県・富山県の市町村境界（国土数値情報 N03 を smartnews-smri が簡素化した GeoJSON）から、
/area/ に埋め込む SVG 地図を作る。対応26市町はリンク、それ以外は灰色。"""
import json, math, io, sys
sys.stdout.reconfigure(encoding="utf-8")

REGIONS = {
    "near":  ("金沢・かほく周辺", ["かほく市", "金沢市", "津幡町", "内灘町", "野々市市"]),
    "kaga":  ("加賀（南部）",     ["白山市", "能美市", "川北町", "小松市", "加賀市"]),
    "noto":  ("能登",             ["宝達志水町", "羽咋市", "志賀町", "中能登町", "七尾市", "穴水町", "輪島市", "能登町", "珠洲市"]),
    "toyama": ("富山県",          ["氷見市", "高岡市", "小矢部市", "射水市", "砺波市", "南砺市", "富山市"]),
}
SLUG = {"かほく市": "kahoku", "金沢市": "kanazawa", "津幡町": "tsubata", "内灘町": "uchinada", "野々市市": "nonoichi",
        "白山市": "hakusan", "能美市": "nomi", "川北町": "kawakita", "小松市": "komatsu", "加賀市": "kaga",
        "宝達志水町": "hodatsushimizu", "羽咋市": "hakui", "志賀町": "shika", "中能登町": "nakanoto", "七尾市": "nanao",
        "穴水町": "anamizu", "輪島市": "wajima", "能登町": "notomachi", "珠洲市": "suzu",
        "氷見市": "himi", "高岡市": "takaoka", "小矢部市": "oyabe", "射水市": "imizu", "砺波市": "tonami",
        "南砺市": "nanto", "富山市": "toyama"}
REGION_OF = {n: r for r, (_, ns) in REGIONS.items() for n in ns}

feats = []
for n in (17, 16):
    d = json.load(open(f"p{n}.json", encoding="utf-8"))
    feats += d["features"]

LAT0 = 36.8
kx = math.cos(math.radians(LAT0))
def proj(lon, lat):
    return (lon * kx, -lat)

# 範囲（富山県の東端までは要らないので、富山市の東端で切る）
xs, ys = [], []
for f in feats:
    name = f["properties"]["N03_004"]
    if name not in SLUG:
        continue
    g = f["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    poly = max(polys, key=lambda q: len(q[0]))
    for lon, lat in poly[0]:
        x, y = proj(lon, lat); xs.append(x); ys.append(y)
minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
W = 640
pad = 8
s = (W - 2 * pad) / (maxx - minx)
H = round((maxy - miny) * s + 2 * pad)
def P(lon, lat):
    x, y = proj(lon, lat)
    return ((x - minx) * s + pad, (y - miny) * s + pad)

def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy) or 1e-9
    dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        x0, y0 = pts[i]
        d = abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / L
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        return rdp(pts[:idx + 1], eps)[:-1] + rdp(pts[idx:], eps)
    return [pts[0], pts[-1]]

def path_d(geom):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    parts = []
    area_best, cen = 0, (0, 0)
    for poly in polys:
        ring = [P(lon, lat) for lon, lat in poly[0]]
        m = len(ring) // 2  # 閉じた輪は始点と終点が同じなので半分ずつ簡素化
        ring = rdp(ring[:m + 1], 0.6)[:-1] + rdp(ring[m:], 0.6)
        if len(ring) < 3:
            continue
        # 面積と重心（ラベル位置用。いちばん大きい多角形）
        a = cx = cy = 0
        for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
            c = x0 * y1 - x1 * y0
            a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c
        if abs(a) > area_best and a != 0:
            area_best, cen = abs(a), (cx / (3 * a), cy / (3 * a))
        parts.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in ring) + "Z")
    return "".join(parts), cen, area_best / 2

out_paths, labels = [], []
for f in feats:
    name = f["properties"]["N03_004"]
    d, cen, area = path_d(f["geometry"])
    if not d:
        continue
    if name in SLUG:
        reg = REGION_OF[name]
        out_paths.append(f'<a href="/{SLUG[name]}/" aria-label="{name}"><path class="am am--{reg}{" am--base" if name=="かほく市" else ""}" d="{d}"><title>{name}</title></path></a>')
        labels.append((name, cen, area))
    else:
        out_paths.append(f'<path class="am am--off" d="{d}"/>')

# ラベル（小さい市町は位置を手で補正）
NUDGE = {"野々市市": (-2, 4), "川北町": (-4, 2), "七尾市": (14, 30), "津幡町": (4, 0),
         "金沢市": (6, 6), "能美市": (-6, 2), "射水市": (0, -2), "中能登町": (6, 0), "宝達志水町": (-6, 0)}
SMALL = {"野々市市", "内灘町", "川北町", "かほく市", "津幡町", "能美市", "中能登町", "宝達志水町", "射水市", "小矢部市", "羽咋市"}
lab_svg = []
OUT = {"かほく市": (-14, 4, "かほく市（拠点）"), "内灘町": (-14, 2, "内灘町")}  # 細い市町は海側に濃い字で
for name, (x, y), area in labels:
    if name in OUT:
        dx, dy, t = OUT[name]
        lab_svg.append(f'<text class="al al--out" x="{x+dx:.0f}" y="{y+dy:.0f}">{t}</text>')
        continue
    dx, dy = NUDGE.get(name, (0, 0))
    cls = "al al--s" if name in SMALL else "al"
    lab_svg.append(f'<text class="{cls}" x="{x+dx:.0f}" y="{y+dy:.0f}">{name}</text>')

# 拠点マーク（かほく市の重心）
kx_, ky_ = [c for n, c, a in labels if n == "かほく市"][0]
base = f'<g class="am-basemark" aria-hidden="true"><circle cx="{kx_:.0f}" cy="{ky_:.0f}" r="6"/></g>'

svg = (f'<svg class="areamap__svg" viewBox="0 0 {W} {H}" role="img" aria-label="対応エリアの地図（石川県・富山県の26市町）">'
       + "".join(out_paths) + '<g class="am-labels" aria-hidden="true">' + "".join(lab_svg) + "</g>" + base + "</svg>")
io.open("areamap.svg.html", "w", encoding="utf-8").write(svg)
print(W, H, len(svg))
