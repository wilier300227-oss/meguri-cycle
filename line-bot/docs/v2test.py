# -*- coding: utf-8 -*-
"""v2 フローのシナリオテスト（偽イベントを開発 WebApp に送り、log の matchedRule/replySummary を突き合わせる）"""
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
def im(): ev = base(); ev.update({"type": "message", "message": {"type": "image", "id": "i%d" % random.randint(1, 99999), "contentProvider": {"type": "line"}}}); send(ev)
def diag(extra="", n=40):
    return json.load(urllib.request.urlopen(U + "?diag=" + K + "&n=%d" % n + extra))
def clear(): diag("&clearmanual=" + TU, 1)
def logs_since(mark):
    d = diag(n=60)
    rows = [r for r in d["log"][1:] if str(r[1]) == TU and str(r[0]) > mark]
    sess = [r for r in d["sessions"] if str(r[0]) == TU]
    return [(r[7], str(r[8])[:48]) for r in rows], sess
def now_mark():
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(time.time() - 2))

S = "v=2&flow=satei&step=%d&act=%s&val=%s"
scenarios = {
  "A 買取・非電動・完走": [lambda: pb(S % (0, "next", "kaitori")), lambda: pb(S % (1, "next", "normal")), im, lambda: pb(S % (3, "next", "photos_done")), lambda: tx("かほく市高松"), lambda: pb(S % (5, "next", "bohan_no"))],
  "B 買取・電動・NG→車体のみ": [lambda: pb(S % (0, "next", "kaitori")), lambda: pb(S % (1, "next", "ebike")), lambda: pb(S % (2, "next", "bat_ng")), lambda: pb(S % (2, "next", "body_only")), lambda: pb(S % (3, "next", "photos_done")), lambda: tx("金沢市片町"), lambda: pb(S % (5, "next", "bohan_yes"))],
  "C 戻る": [lambda: pb(S % (0, "next", "shobun")), lambda: pb(S % (1, "next", "normal")), lambda: pb("v=2&flow=menu&step=0&act=back"), lambda: pb(S % (1, "next", "ebike")), lambda: pb(S % (2, "next", "bat_unknown")), lambda: pb("v=2&flow=menu&step=0&act=back"), lambda: pb("v=2&flow=menu&step=0&act=stop")],
  "D ボタン段階で文字": [lambda: pb(S % (0, "next", "kaitori")), lambda: tx("電動です"), lambda: tx("はい"), lambda: tx("よくわかりません")],
  "E セッション無しでナビ": [lambda: pb("v=2&flow=menu&step=0&act=back"), lambda: pb(S % (5, "next", "bohan_yes"))],
  "F 回答済みボタンの2度押し": [lambda: pb(S % (0, "next", "kaitori")), lambda: pb(S % (1, "next", "ebike")), lambda: pb(S % (1, "next", "normal")), lambda: pb("v=2&flow=menu&step=0&act=stop")],
  "G バッテリー調べ方": [lambda: pb("v=2&flow=battery&step=0&act=next"), lambda: pb("v=2&flow=battery&step=1&act=next&val=bat_ok"), lambda: pb("v=2&flow=battery&step=0&act=next"), lambda: pb("v=2&flow=battery&step=1&act=next&val=bat_unknown"), im, lambda: pb(S % (3, "next", "photos_done"))],
  "H フロー中に停止希望": [lambda: pb(S % (0, "next", "kaitori")), lambda: tx("やめます")],
  "I 旧文言・写真前に写真": [lambda: pb(S % (0, "next", "kaitori")), im, lambda: pb(S % (1, "next", "normal")), lambda: tx("写真を追加する"), lambda: tx("写真は以上です")],
}
only = sys.argv[1:]
for name, steps in scenarios.items():
    if only and not any(name.startswith(o) for o in only): continue
    clear(); time.sleep(1)
    mark = now_mark()
    print("==", name)
    for st in steps: st(); time.sleep(1.5)
    rows, sess = logs_since(mark)
    for r in rows: print("  ", r[0], "|", r[1])
    print("   session:", sess)
