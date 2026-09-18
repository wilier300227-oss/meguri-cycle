"""バッテリー長押し診断の実演動画（video/battery-check-howto.mp4）を元動画から作る。2026-09-18
元素材: オーナー撮影 VID_20260915_110044.mp4（ブリヂストン B300）と手元スイッチ写真 IMG_20260915_110510.jpg（Downloads に保存）
静止なし・スロー（minterpolate）・BIZ UDゴシックの大きな字幕・30秒カウントダウン。出力 web2.mp4 を video/ に置く
"""
import os, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter

V = r"C:/Users/81909/Downloads/VID_20260915_110044.mp4"
PHOTO = r"C:/Users/81909/Downloads/IMG_20260915_110510.jpg"
FONT = r"C:/Windows/Fonts/BIZ-UDGothicB.ttc"
W, H = 1080, 1920
OUT = "build"; os.makedirs(OUT, exist_ok=True)

PRESS, RELEASE = 10.75, 37.0          # 元動画で押し始め／長押し区間の終わり（指が離れるのは 37.5 秒。字幕を先に出すため 0.5 秒手前）
HOLD_OUT = 30.0                       # 長押し区間を 30 秒ちょうどに（約 0.89 倍速）
BTN = (646, 452)                      # 回転後フレームでのボタン中心

YEL = (255, 214, 0); WHT = (255, 255, 255); GRN = (6, 199, 85); RED = (229, 57, 53)

def f(size): return ImageFont.truetype(FONT, size)

def text_w(d, s, fnt): return d.textlength(s, font=fnt)

def caption(label=None, lines=(), sub=None, y_bottom=1780, box=True):
    """下部の字幕ボックス。lines は [(文字列, 色)] の行リスト（1行内の色分けは [(s,c),...]）"""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    rows = []
    if label: rows.append(([(label, YEL)], f(46), 40))
    for ln in lines:
        segs = ln if isinstance(ln, list) else [(ln, WHT)]
        rows.append((segs, f(84), 16))
    if sub: rows.append(([(sub, (230, 230, 230))], f(44), 0))
    heights = [fn.size + gap for _, fn, gap in rows]
    total = sum(heights) + 24
    top = y_bottom - total - 60
    if box:
        widest = max(sum(text_w(d, s, fn) for s, _ in segs) for segs, fn, _ in rows)
        bw = min(W - 40, widest + 110)
        d.rounded_rectangle(((W - bw) / 2, top, (W + bw) / 2, y_bottom), 34, fill=(10, 12, 16, 205))
    y = top + 48
    for ri, ((segs, fn, gap), hgt) in enumerate(zip(rows, heights)):
        lw = sum(text_w(d, s, fn) for s, _ in segs); x = (W - lw) / 2
        if label and ri == 0:
            d.rounded_rectangle((x - 26, y - 10, x + lw + 26, y + fn.size + 12), 30, fill=YEL)
            d.text((x, y), label, font=fn, fill=(20, 20, 20)); y += hgt; continue
        for s, c in segs:
            d.text((x, y), s, font=fn, fill=c); x += text_w(d, s, fn)
        y += hgt
    return im

def ring(im, r=92, width=12):
    d = ImageDraw.Draw(im); x, y = BTN
    d.ellipse((x - r, y - r, x + r, y + r), outline=RED, width=width)
    # 矢印（左下から）
    d.line((x - 250, y + 250, x - r * 0.75, y + r * 0.75), fill=RED, width=16)
    d.polygon([(x - r * 0.62, y + r * 0.62), (x - r * 0.62 - 70, y + r * 0.62 + 10), (x - r * 0.62 - 10, y + r * 0.62 + 70)], fill=RED)
    return im

def counter(n, done=False):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    cx, cy, r = 885, 1010, 165
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(10, 12, 16, 215), outline=GRN if done else YEL, width=10)
    if done:
        d.text((cx, cy), "OK", font=f(120), fill=GRN, anchor="mm")
    else:
        d.text((cx, cy - 92), "あと", font=f(44), fill=WHT, anchor="mm")
        d.text((cx, cy + 8), str(n), font=f(150), fill=YEL, anchor="mm")
        d.text((cx, cy + 108), "秒", font=f(44), fill=WHT, anchor="mm")
    return im

def save(im, name): p = f"{OUT}/{name}.png"; im.save(p); return p

def frame_at(t):
    p = f"{OUT}/frame_{t}.png"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", V, "-vf", "transpose=2", "-frames:v", "1", p], check=True)
    return Image.open(p).convert("RGB")

def card_bg(img):
    return img.filter(ImageFilter.GaussianBlur(28)).point(lambda v: int(v * 0.38)).convert("RGBA")

def run(args): subprocess.run(["ffmpeg", "-v", "error", "-y"] + args, check=True)

ENC = ["-c:v", "libx264", "-crf", "14", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", "30"]

# ---------- T: タイトル（6秒）----------
bg = card_bg(frame_at(1.0)); d = ImageDraw.Draw(bg)
d.text((W / 2, 640), "電動アシスト自転車の", font=f(64), fill=WHT, anchor="mm")
d.text((W / 2, 790), "バッテリー診断", font=f(128), fill=YEL, anchor="mm")
d.text((W / 2, 935), "のやり方", font=f(72), fill=WHT, anchor="mm")
d.text((W / 2, 1100), "パナソニック・ヤマハ・ブリヂストン共通", font=f(44), fill=WHT, anchor="mm")
d.text((W / 2, 1230), "※見本はブリヂストン製です", font=f(38), fill=(215, 215, 215), anchor="mm")
d.text((W / 2, 1285), "ボタンの位置はメーカーごとに違います", font=f(38), fill=(215, 215, 215), anchor="mm")
d.text((W / 2, 1640), "めぐり自転車", font=f(52), fill=WHT, anchor="mm")
save(bg.convert("RGB"), "title")
run(["-loop", "1", "-t", "6", "-i", f"{OUT}/title.png", "-vf", "fps=30,format=yuv420p"] + ENC + [f"{OUT}/sT.mp4"])

# ---------- S1: 外す（元 0〜5.5 秒・等速）----------
save(caption("① バッテリーを外す", ["自転車から外します"], "充電器からも外してください"), "c1")
run(["-ss", "0", "-t", "5.5", "-i", V, "-i", f"{OUT}/c1.png", "-filter_complex",
     "[0:v]transpose=2,fps=30[b];[b][1:v]overlay=0:0", "-an"] + ENC + [f"{OUT}/s1.mp4"])

# ---------- S2: 手元スイッチではない（写真・8秒）----------
ph = Image.open(PHOTO).convert("RGB")
bg = card_bg(ph.resize((W, H)))
pw = 900; phs = ph.resize((pw, int(ph.height * pw / ph.width)))
px, py = (W - pw) // 2, 110
bg.paste(phs, (px, py))
d = ImageDraw.Draw(bg); cx, cy, r = px + pw - 40, py + 40, 95
d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=RED, outline=WHT, width=10)
d.line((cx - 42, cy - 42, cx + 42, cy + 42), fill=WHT, width=20); d.line((cx - 42, cy + 42, cx + 42, cy - 42), fill=WHT, width=20)
cap = caption("② ボタンの場所", ["手元のスイッチ", "ではありません"], "バッテリー本体のボタンを使います")
bg.alpha_composite(cap)
save(bg.convert("RGB"), "s2")
run(["-loop", "1", "-t", "8", "-i", f"{OUT}/s2.png", "-vf", "fps=30,format=yuv420p"] + ENC + [f"{OUT}/s2.mp4"])

# ---------- S3〜S5: 指を近づける（スロー）→ 30秒長押し（カウントダウン）→ 指を離す（スロー） ----------
SLOW = "minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,setpts=2*PTS,fps=30"
a3 = save(ring(caption("② ボタンの場所", ["ランプのそばの", "ボタンです"], "※位置はメーカーごとに違います")), "c3a")
b3 = save(caption("③ 30秒 長押し", [[("ボタンを", WHT), ("押します", YEL)]]), "c3b")
# S3: 元 5.5→10.75 を 0.5 倍速（10.5 秒）
run(["-ss", "5.5", "-t", str(PRESS - 5.5), "-i", V, "-i", a3, "-i", b3, "-filter_complex",
     f"[0:v]transpose=2,{SLOW}[b];[b][1:v]overlay=0:0:enable='lt(t,6.5)'[x];[x][2:v]overlay=0:0:enable='gte(t,6.5)'", "-an"] + ENC + [f"{OUT}/s3.mp4"])

# S4: 元 10.75→37.5 を 30 秒に（字幕＋カウントダウン）
k = HOLD_OUT / (RELEASE - PRESS)
caps4 = [  # (出力秒の開始, 終了, 画像)
    (0, 6.5, caption("③ 押したまま 30秒", [[("指を離さない！", YEL)]], "ランプが光ります")),
    (6.5, 12.3, caption("③ 押したまま 30秒", ["ランプが消えても", [("押したまま！", YEL)]])),
    (12.3, 17.8, caption("③ 押したまま 30秒", ["また光ります", [("まだ押したまま！", YEL)]])),
    (17.8, 23.7, caption("③ 押したまま 30秒", ["光り方は機種で違います"], "見方はわからなくて大丈夫です")),
    (23.7, 30.01, caption("③ 押したまま 30秒", ["点滅することもあります"], "もう少しです")),
]
inputs, chain = [], "[0:v]transpose=2,setpts=%f*PTS,fps=30[v0]" % k
idx, last = 1, "v0"
for i, (s, e, im) in enumerate(caps4):
    inputs += ["-i", save(im, f"c4_{i}")]
    chain += f";[{last}][{idx}:v]overlay=0:0:enable='between(t,{s},{e})'[v{idx}]"; last = f"v{idx}"; idx += 1
for n in range(30, 0, -1):
    inputs += ["-i", save(counter(n), f"n{n}")]
    s = 30 - n
    chain += f";[{last}][{idx}:v]overlay=0:0:enable='between(t,{s},{s + 0.999})'[v{idx}]"; last = f"v{idx}"; idx += 1
run(["-ss", str(PRESS), "-t", str(RELEASE - PRESS), "-i", V] + inputs + ["-filter_complex", chain, "-map", f"[{last}]", "-an", "-t", "30"] + ENC + [f"{OUT}/s4.mp4"])

# S5: 元 37.0→40 を 0.5 倍速（6 秒）…指を離すところ
okc = counter(0, done=True); okc.alpha_composite(caption("④ 指を離す", ["30秒たったら", [("指を離してOK", YEL)]]))
c5 = save(okc, "c5")
run(["-ss", str(RELEASE), "-t", "3.0", "-i", V, "-i", c5, "-filter_complex",
     f"[0:v]transpose=2,{SLOW}[b];[b][1:v]overlay=0:0", "-an"] + ENC + [f"{OUT}/s5.mp4"])

# ---------- S6: 締め（8秒）----------
bg = card_bg(frame_at(44.0)); d = ImageDraw.Draw(bg)
d.text((W / 2, 700), "この流れを", font=f(84), fill=WHT, anchor="mm")
d.text((W / 2, 810), "動画で撮って", font=f(84), fill=WHT, anchor="mm")
d.text((W / 2, 940), "LINEで送ってください", font=f(78), fill=GRN, anchor="mm")
d.text((W / 2, 1110), "ランプの見方がわからなくても", font=f(46), fill=(225, 225, 225), anchor="mm")
d.text((W / 2, 1170), "大丈夫です", font=f(46), fill=(225, 225, 225), anchor="mm")
d.text((W / 2, 1560), "めぐり自転車", font=f(56), fill=WHT, anchor="mm")
d.text((W / 2, 1640), "LINE  @136bpsyc", font=f(48), fill=GRN, anchor="mm")
save(bg.convert("RGB"), "end")
run(["-loop", "1", "-t", "8", "-i", f"{OUT}/end.png", "-vf", "fps=30,format=yuv420p"] + ENC + [f"{OUT}/s6.mp4"])

# ---------- 連結：カード間は 0.5 秒クロスフェード、S3→S4→S5 は続き映像なのでそのまま ----------
run(["-i", f"{OUT}/s3.mp4", "-i", f"{OUT}/s4.mp4", "-i", f"{OUT}/s5.mp4", "-filter_complex",
     "[0:v][1:v][2:v]concat=n=3:v=1:a=0"] + ENC + [f"{OUT}/s345.mp4"])
def dur(p): return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).decode())
parts = ["sT", "s1", "s2", "s345", "s6"]
XF = 0.5
chain, off, last = "", 0.0, "0:v"
for i in range(1, len(parts)):
    off += dur(f"{OUT}/{parts[i - 1]}.mp4") - XF
    chain += ("" if i == 1 else ";") + f"[{last}][{i}:v]xfade=transition=fade:duration={XF}:offset={off:.3f}[x{i}]"; last = f"x{i}"
    off -= 0  # offset は累積
run(sum([["-i", f"{OUT}/{p}.mp4"] for p in parts], []) + ["-filter_complex", chain, "-map", f"[{last}]",
    "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "master2.mp4"])
run(["-i", "master2.mp4", "-vf", "scale=720:1280", "-c:v", "libx264", "-profile:v", "high", "-b:v", "350k", "-maxrate", "700k",
     "-bufsize", "1400k", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "web2.mp4"])
print("done", dur("master2.mp4"))
