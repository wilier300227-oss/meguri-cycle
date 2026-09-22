# -*- coding: utf-8 -*-
"""写真フロー（v2-photo.gs）のシナリオテスト。偽イベントを開発 WebApp に送り、log と sessions を確認する。"""
import json, urllib.request, random, sys, time
U = "https://script.google.com/macros/s/AKfycbzjdIx2dTAlf0TwsEp6HE32AGrpDMyZqLDWuiO5pQ38aQcgycEy9OQoJ0utpDYDVvmV/exec"
K = "1hfBnh0RoPCbN6ch4bc2Z2PEhHliVzMypXYmUbNT5mI8"
TU = "Utest00000000000000000000000000000"

def send(ev):
    body = json.dumps({"destination": "t", "forwardedFromV1": True, "events": [ev]}).encode("utf-8")
    req = urllib.request.Request(U, data=body, headers={"Content-Type": "application/json; charset=utf-8"})
    try: urllib.request.urlopen(req, timeout=90).read()
    except Exception as e: print("  send err", e)
def base():
    return {"webhookEventId": "t-%d" % random.randint(1, 10**9), "replyToken": "dummy",
            "source": {"type": "user", "userId": TU}, "timestamp": 0, "mode": "active"}
def pb(d): ev = base(); ev.update({"type": "postback", "postback": {"data": d}}); send(ev)
def tx(t): ev = base(); ev.update({"type": "message", "message": {"type": "text", "id": "m%d" % random.randint(1, 99999), "text": t}}); send(ev)
def im(imageset=None):
    ev = base(); m = {"type": "image", "id": "i%d" % random.randint(1, 99999), "contentProvider": {"type": "line"}}
    if imageset: m["imageSet"] = imageset
    ev.update({"type": "message", "message": m}); send(ev)
def vi(): ev = base(); ev.update({"type": "message", "message": {"type": "video", "id": "v%d" % random.randint(1, 99999), "duration": 30000, "contentProvider": {"type": "line"}}}); send(ev)
def diag(extra="", n=40):
    return json.load(urllib.request.urlopen(U + "?diag=" + K + "&n=%d" % n + extra))
def clear(): diag("&clearmanual=" + TU, 1)
def logs_since(mark):
    d = diag(n=80)
    rows = [r for r in d["log"][1:] if str(r[1]) == TU and str(r[0]) > mark]
    sess = [r for r in d["sessions"] if str(r[0]) == TU]
    return [(r[7], str(r[8])[:60]) for r in rows], sess
def now_mark():
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(time.time() - 2))

S = "v=2&flow=satei&step=%d&act=%s&val=%s"
B = "v=2&flow=battery&step=%d&act=%s&val=%s"
def ims(n):
    return [im for _ in range(n)]
scenarios = {
  # 一般車：全部送る（自動で次へ）→ 前カゴ「付いていない」→ 「特にない」→ サビ → 市町 → 防犯登録 → 完了
  "P1 一般車・全部送る": [lambda: pb(S % (0, "next", "kaitori")), lambda: pb(S % (1, "next", "normal"))] + ims(3) + ims(2) + ims(4)
      + [lambda: pb(S % (3, "next", "photo_next")), lambda: pb(S % (3, "next", "photo_next")),
         lambda: pb(S % (3, "next", "rust_some")), lambda: tx("かほく市高松"), lambda: pb(S % (5, "next", "bohan_no"))],
  # 一般車：足りないまま次へ（確認は最初の1回だけ）→ このまま進む → 以降は確認なしで進む
  "P2 一般車・足りないまま次へ": [lambda: pb(S % (0, "next", "kaitori")), lambda: pb(S % (1, "next", "normal"))] + ims(1)
      + [lambda: pb(S % (3, "next", "photo_next")), lambda: pb(S % (3, "next", "photo_go")),
         lambda: pb(S % (3, "next", "photo_next")), lambda: pb(S % (3, "next", "photo_next")), lambda: pb(S % (3, "next", "photo_next")),
         lambda: pb(S % (3, "next", "photo_next")), lambda: pb(S % (3, "next", "rust_none")), lambda: tx("津幡町"), lambda: pb(S % (5, "next", "bohan_yes"))],
  # 電動：充電できる → 8まとまり。動画は video で、充電器は image で
  "P3 電動・充電できる・動画あり": [lambda: pb(S % (0, "next", "kaitori")), lambda: pb(S % (1, "next", "ebike")), lambda: pb(S % (2, "next", "bat_ok")),
         lambda: pb(S % (3, "next", "charge_yes"))] + ims(3) + ims(3) + ims(4) + [lambda: pb(S % (3, "next", "photo_next"))] + ims(2) + [vi] + ims(1)
      + [lambda: pb(S % (3, "next", "photo_next")), lambda: pb(S % (3, "next", "rust_heavy")), lambda: tx("金沢市片町"), lambda: pb(S % (5, "next", "bohan_seal"))],
  # 電動：充電できない → 手元スイッチと診断動画が出ない（7まとまり）
  "P4 電動・充電できない": [lambda: pb(S % (0, "next", "kaitori")), lambda: pb(S % (1, "next", "ebike")), lambda: pb(S % (2, "next", "bat_ok")),
         lambda: pb(S % (3, "next", "charge_no"))] + ims(3) + ims(2) + ims(4) + [lambda: pb(S % (3, "next", "photo_next"))] + ims(2) + ims(1)
      + [lambda: pb(S % (3, "next", "photo_next"))],
  # 同時送信4枚（imageSet）→ 返事は最後の1枚だけ
  "P5 同時送信4枚": [lambda: pb(S % (0, "next", "kaitori")), lambda: pb(S % (1, "next", "normal"))] + ims(3)
      + [lambda i=i: im({"id": "set1", "index": i, "total": 4}) for i in (1, 2, 3, 4)],
  # 写真工程の前に画像 → 案内は1回だけ
  "P6 写真前に画像2枚": [lambda: pb(S % (0, "next", "kaitori")), im, im, lambda: pb(S % (1, "next", "normal"))],
  # バッテリー単体（battery フロー・わからない）
  "P7 バッテリー単体": [lambda: pb(B % (0, "next", "")), lambda: pb(B % (1, "next", "bat_unknown"))] + ims(4) + [vi] + ims(1) + [lambda: pb(B % (3, "next", "photo_next"))],
  # 処分（shobun）は写真のあとサビ質問なしで市町へ
  "P8 処分・一般車": [lambda: pb(S % (0, "next", "shobun")), lambda: pb(S % (1, "next", "normal"))] + ims(3) + [lambda: pb(S % (3, "next", "photo_next"))] * 5 + [lambda: tx("内灘町"), lambda: pb(S % (5, "next", "bohan_no"))],
}
only = sys.argv[1:]
for name, steps in scenarios.items():
    if only and not any(name.startswith(o) for o in only): continue
    clear(); time.sleep(1)
    mark = now_mark()
    print("==", name)
    for st in steps: st(); time.sleep(1.2)
    rows, sess = logs_since(mark)
    for r in rows: print("  ", r[0], "|", r[1])
    print("   session:", sess)
