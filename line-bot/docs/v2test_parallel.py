# -*- coding: utf-8 -*-
"""同時送信の再現：imageSet 付きの画像イベント3件を並列（別スレッド・別リクエスト）で開発 WebApp に送り、
枚数が3になること・返事が1回だけであることを log と sessions で確認する。"""
import json, urllib.request, random, sys, time, threading
U = "https://script.google.com/macros/s/AKfycbzjdIx2dTAlf0TwsEp6HE32AGrpDMyZqLDWuiO5pQ38aQcgycEy9OQoJ0utpDYDVvmV/exec"
K = "1hfBnh0RoPCbN6ch4bc2Z2PEhHliVzMypXYmUbNT5mI8"
TU = "Utest00000000000000000000000000000"

def send(ev):
    body = json.dumps({"destination": "t", "forwardedFromV1": True, "events": [ev]}).encode("utf-8")
    req = urllib.request.Request(U, data=body, headers={"Content-Type": "application/json; charset=utf-8"})
    try: urllib.request.urlopen(req, timeout=120).read()
    except Exception as e: print("  send err", e)
def base():
    return {"webhookEventId": "t-%d" % random.randint(1, 10**9), "replyToken": "dummy",
            "source": {"type": "user", "userId": TU}, "timestamp": 0, "mode": "active"}
def pb(d): ev = base(); ev.update({"type": "postback", "postback": {"data": d}}); send(ev)
def im_ev(i, total, sid):
    ev = base(); ev.update({"type": "message", "message": {"type": "image", "id": "i%d" % random.randint(1, 99999),
        "contentProvider": {"type": "line"}, "imageSet": {"id": sid, "index": i, "total": total}}}); return ev
def diag(extra="", n=40):
    return json.load(urllib.request.urlopen(U + "?diag=" + K + "&n=%d" % n + extra))
def clear(): diag("&clearmanual=" + TU, 1)
def now_mark(): return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(time.time() - 2))

S = "v=2&flow=satei&step=%d&act=%s&val=%s"
n = int(sys.argv[1]) if len(sys.argv) > 1 else 3
clear(); time.sleep(1)
pb(S % (0, "next", "kaitori")); time.sleep(1.5)
pb(S % (1, "next", "normal")); time.sleep(1.5)
mark = now_mark()
sid = "set%d" % random.randint(1, 9999)
th = [threading.Thread(target=send, args=(im_ev(i, n, sid),)) for i in range(1, n + 1)]
print("== %d枚を並列送信（imageSet %s）" % (n, sid))
for t in th: t.start()
for t in th: t.join()
time.sleep(3)
d = diag(n=40)
rows = [r for r in d["log"][1:] if str(r[1]) == TU and str(r[0]) > mark]
for r in rows: print("  ", r[7], "|", str(r[8])[:60])
sess = [r for r in d["sessions"] if str(r[0]) == TU]
for r in sess:
    try: print("   photo.c =", json.loads(r[4]).get("photo", {}).get("c"), " g =", json.loads(r[4]).get("photo", {}).get("g"))
    except Exception: print("   session:", r)
