# -*- coding: utf-8 -*-
import io, re, json, html
def T(n):
    t = io.open(n + '.txt', encoding='utf-8').read()
    return html.unescape(t).replace('～', '～')
def between(t, a, b):
    i = t.index(a); j = t.index(b, i + len(a)); return t[i + len(a):j]
CHECK = '2026-09-17'
rows = []

# ── Panasonic ──
t = T('p_ex')
blk = between(t, '対象バッテリー品番とロット記号\n', '※参考情報')
g1 = between(blk, 'アルファベット左から1文字目', 'または')
nums1 = re.findall(r'\b(\d{3})\b', g1); let1 = re.findall(r'\b([A-Z])\b', g1)
g2 = blk.split('アルファベット左から1・2文字目')[1]
nums2 = re.findall(r'\b(\d{3})\b', g2); let2 = re.findall(r'\b([A-Z]{2})\b', g2)
codes = ['NKY%sB02' % n for n in nums1 + nums2]
rows.append(dict(maker='パナソニック', title='電動アシスト自転車用バッテリー（2024年4月23日 社告）',
  codes=codes, extra=[],
  codesNote='ロット記号（11桁）が次に当てはまるものが対象：NKY%s〜%sB02 の%d品番は左から1文字目が %s／%s は左から1・2文字目が %s。品番の最後に「B」が付くもの（例：NKY○○○B02B）は対象外。' % (nums1[0], nums1[-1], len(nums1), '・'.join(let1), '・'.join('NKY%sB02' % n for n in nums2), '・'.join(let2)),
  period='2015年1月〜2017年7月製造', part='バッテリー（発煙・発火のおそれ）', action='無償交換（交換用バッテリーと放電器を送付、対象品を返送）',
  contact='電動自転車バッテリー市場対策室 0120-870-355', url='https://panasonic.co.jp/pct/info/ex/', published='2024-04-23'))

t = T('p_2016')
blk = between(t, '対象バッテリー品番とロット記号（2015年7月社告分と今回分をまとめて記載）', '（※最後にＢが付いているものは')
lots = {}; cur = []; last_was_lot = False
for tok in re.findall(r'NKY\d{3}B02|[A-Z]{2}\d{2}(?:～\d{2})?', blk):
    if tok.startswith('NKY'):
        if last_was_lot: cur = []
        cur.append(tok); lots.setdefault(tok, []); last_was_lot = False
    else:
        for c in cur: lots[c].append(tok)
        last_was_lot = True
note = '／'.join('%s：%s' % (c, '・'.join(v)) for c, v in lots.items())
rows.append(dict(maker='パナソニック', title='電動アシスト自転車用バッテリー（2015年7月27日 社告・2016年9月26日 追加）',
  codes=list(lots.keys()), extra=sorted(set(x.split('～')[0] for v in lots.values() for x in v)),
  codesNote='ロット記号（4桁）が次の範囲のものが対象：' + note + '。品番の最後に「B」が付くものは対象外。',
  period='2012年12月〜2013年4月、2013年10月2日〜4日製造', part='バッテリー（発煙・発火のおそれ）', action='無償交換',
  contact='電動自転車バッテリー市場対策室 0120-870-355', url='https://panasonic.co.jp/pct/info/note/d201507.html', published='2016-09-26'))

t = T('p_offtime')
oc = re.findall(r'BE-ELW073A[A-Z]', t)
body = between(t, '(2)車体番号\n', '対象外の車体番号')
exact = re.findall(r'G\d{3}G\d{5}', body)
prefixes = re.findall(r'(G\w{3}G)\*{5}', body)
rows.append(dict(maker='パナソニック', title='折りたたみ「オフタイム」ハンドルポスト',
  codes=oc, extra=exact + ['オフタイム', 'OFFTIME'], prefixes=prefixes,
  codesNote='車体番号（10桁）も一致したものが対象：%s、および左から5桁が %s の一部（対象外も含むため公式の一覧で確認）。' % ('、'.join(exact), '・'.join(prefixes)),
  period='2020年12月〜2021年5月製造', part='ハンドルポスト（走行中にハンドルが回転し転倒のおそれ）', action='ハンドルポストの無料交換',
  contact='オフタイム リコール窓口 0120-781-603', url='https://panasonic.co.jp/pct/info/073a/', published='2022-02-03'))

t = T('p_vivistrong')
rows.append(dict(maker='パナソニック', title='ビビ・ストロング（ViVi STRONG）前ホーク',
  codes=re.findall(r'BE-ENEG63[A-Z]', t), extra=['ビビ・ストロング', 'ViVi STRONG'], codesNote='品番はフレーム前方のヘッドマーク、または保証書に記載。',
  period='2012年7月〜2014年10月製造', part='前ホーク（衝撃後に折れるおそれ）', action='安全点検（無料）・強度を高めた前ホークへ交換',
  contact='安全点検受付・お問い合わせ窓口 0120-781-603', url='https://panasonic.co.jp/pct/info/note/d201501.html', published='2015-01-20'))

# ── Yamaha ──
t = T('y_2025citv')
cv = re.findall(r'(20\d\d)\n\s*(X\w{3}-\d{7}～\d{7})', t)
rows.append(dict(maker='ヤマハ', title='PAS CITY-V ステムハンドル',
  codes=['PA24CV'] + [r[1] for r in cv], extra=['PAS CITY-V', 'CITY-V'],
  codesNote='機種総称 PA24CV。PAS号機番号（ヘッドパイプの銀色ラベル）が次の範囲：' + '、'.join('%s年式 %s' % r for r in cv) + '。',
  period='2018年8月〜2025年6月製造（2018〜2024年式）', part='ステムハンドル（固定用ボルトが折損するおそれ）', action='ステムハンドル一式を対策品に無償交換',
  contact='PAS CITY-V ステムハンドル 無償交換コールセンター 0120-715-182', url='https://www.yamaha-motor.co.jp/recall/pas/2025-12-02/', published='2025-12-02'))

rows.append(dict(maker='ヤマハ', title='PAS バッテリー X0T型・X0U型',
  codes=['X0T', 'X0U'], extra=['PASバッテリー'],
  codesNote='X0T（12.3Ah）2016/8/9〜2018/12/29製造、X0U（15.4Ah）2016/11/10〜2017/12/19製造のうち、製造ロット（ロットラベルの左から4桁）が公式一覧に当てはまるもの。型番が X0T-10・X0T-30・X0U-30 の場合はブリヂストンサイクルへ問い合わせ。',
  period='2016年8月〜2018年12月製造（2017〜2021年モデルの一部、補修用を含む）', part='バッテリー（内部から発火するおそれ）', action='対策品バッテリーに無償交換',
  contact='PASバッテリー（X0T/X0U）無償交換お客様コールセンター 0120-772-780', url='https://www.yamaha-motor.co.jp/recall/pas/2022-04-05/', published='2022-04-05'))

tb = T('b_bat1213')
ybat = re.findall(r'X83-\d\d', between(tb, 'ヤマハ発動機株式会社による対象型番', 'こちら'))
rows.append(dict(maker='ヤマハ', title='PAS バッテリー（2012〜2013年の一部モデル用）',
  codes=ybat, extra=[], codesNote='バッテリー本体のラベルの型番で確認（型番の一覧はブリヂストンサイクルの告知に掲載）。',
  period='2011年12月〜2013年12月製造', part='バッテリー（内部から発火するおそれ）', action='無償交換',
  contact='PASバッテリー 無償交換お客様コールセンター 0120-808-368', url='https://www.yamaha-motor.co.jp/recall/pas/2021-01-26/', published='2021-01-26',
  url2='https://www.bscycle.co.jp/info/2021/8785'))

t = T('y_rim')
blk = between(t, '年式\n', '※対象車両の確認')
cur = None; ranges = []; prev_name = False
for line in blk.split('\n'):
    s = line.strip()
    if s.startswith('PAS '):
        cur = (cur + '・' + s) if (prev_name and cur) else s   # 「PAS ナチュラL」「PAS ナチュラXL」のように名前が続けて並ぶ行はまとめる
        prev_name = True; continue
    prev_name = False
    for m in re.findall(r'X\w{3}-\d{7} ～ X\w{3}-\d{7}', s): ranges.append((cur, m.replace(' ', '')))
rows.append(dict(maker='ヤマハ', title='PAS ステンレス製リム',
  codes=[r[1] for r in ranges], extra=list(dict.fromkeys(re.findall(r'PA\d\d[A-Z]+', blk) + [r[0] for r in ranges])),
  codesNote='PAS号機番号が次の範囲：' + '、'.join('%s %s' % r for r in ranges) + '（範囲内でも交換済みの場合あり）。2016年12月以降に交換した補修用リムも対象の可能性。',
  period='2017〜2021年式の一部', part='ステンレス製リム（線状のサビ・ヘコミ・ひび割れの後に破損するおそれ）', action='対策品リムに無償交換（販売店で作業）',
  contact='ステンレス製リム 無償交換コールセンター 0120-456-579', url='https://www.yamaha-motor.co.jp/recall/pas/2022-pm018/', published='2022-10-11'))

t = T('y_2020model')
mm = re.findall(r'(PA\d\d[A-Z]*)\n\s*(PAS [^\n]+?)\s*\n\s*2020年\n\s*(X\w{3}-\d{7}) ～ (\d{7})', t)
rows.append(dict(maker='ヤマハ', title='PAS 2020年モデル（スマートパワーアシスト搭載）ドライブユニット',
  codes=[m[0] for m in mm] + ['%s～%s' % (m[2], m[3]) for m in mm], extra=[m[1] for m in mm],
  codesNote='車両号機番号が次の範囲（範囲内に対象外の車両も含む）：' + '、'.join('%s（%s）%s～%s' % m for m in mm) + '。',
  period='2019年9月〜2020年1月製造', part='ドライブユニットのソフトウェア（アシストオフ表示でもアシストするおそれ）', action='無償改修（ダイレクトメールで案内）',
  contact='ヤマハPAS ドライブユニット書換コールセンター 0120-500-298', url='https://www.yamaha-motor.co.jp/recall/pas/2020-02-03/', published='2020-02-03'))

rows.append(dict(maker='ヤマハ', title='PAS ハンドルロック「一発二錠」',
  codes=[], extra=['一発二錠', 'ハンドルロック'],
  codesNote='型番ではなく、ハンドルロック表示窓のラベル色と号機番号で確認（対象一覧は公式の検索・PDF）。',
  period='2004年10月〜2015年1月製造', part='ハンドルロック（錠が誤作動しハンドル操作ができなくなるおそれ）', action='無償点検・改修',
  contact='「一発二錠」無償点検・改修お客様コールセンター 0120-801-309', url='https://www.yamaha-motor.co.jp/recall/pas/2019-06-24/', published='2019-06-24'))

# ── Bridgestone ──
t = T('b_bat1618')
blk = between(t, '対象製品搭載モデル', '対象製品の確認方法')
models = []; curname = None; maker_now = None
lines = [l.strip() for l in blk.split('\n') if l.strip()]
i = 0
while i < len(lines):
    s = lines[i]
    if s in ('㈱あさひ', 'ブリヂストンサイクル㈱'): maker_now = s; i += 1; continue
    if re.fullmatch(r'[A-Z0-9]{5,6}', s) and i + 1 < len(lines) and re.match(r'20\d\d', lines[i + 1]):
        models.append((maker_now, curname, s, lines[i + 1])); i += 2; continue
    if s not in ('販売元', '車種名', '車種略号', 'モデル年度'): curname = s
    i += 1
lotblk = between(t, '対象製品の製造ロット', '⇒ 該当の場合')
blots = re.findall(r'\b[A-Z0-9]{4}\b', lotblk)
names_b = list(dict.fromkeys(m[1] for m in models))
rows.append(dict(maker='ブリヂストン', title='バッテリー C301・C400（型番 X0T・X0U）',
  codes=['C301', 'C400', 'X0T', 'X0U'] + [m[2] for m in models], extra=names_b,
  codesNote='バッテリー右側面ラベルのカッコ内の型番が X0T・X0U（右端の数字が1以上は対象外）で、製造ロット（左から4桁）が下の一覧に当てはまるもの。搭載車種（車種略号・モデル年度）：' + '、'.join('%s %s（%s）' % (m[1], m[2], m[3]) for m in models) + '。',
  period='2016年8月〜2018年12月製造（2016〜2021年販売の一部）', part='バッテリー（内部から発火するおそれ）', action='無償交換（交換用バッテリーと放電器を送付、対象品を返送）',
  contact='電動アシスト自転車バッテリー（C301/C400）無償交換お客様コールセンター 0120-220-566', url='https://www.bscycle.co.jp/info/2022/10537', published='2022-04-05', lots=blots))

bsx = re.findall(r'X83-\d\d', between(tb, '◆無償交換対象バッテリー型番', '無償交換の対象です'))
rows.append(dict(maker='ブリヂストン', title='バッテリー（2012〜2013年の一部モデル用）',
  codes=bsx, extra=[], codesNote='バッテリー本体のラベルの型番で確認。',
  period='2012〜2013年の一部モデル', part='バッテリー（内部から発火するおそれ）', action='無償交換',
  contact='電動アシスト自転車バッテリー 無償交換お客様コールセンター 0120-830-257', url='https://www.bscycle.co.jp/info/2021/8785', published='2021-01-26'))
mx = re.findall(r'X83-\d\d', between(tb, '株式会社丸石サイクルによる対象型番', 'こちら'))
rows.append(dict(maker='丸石サイクル（参考）', title='バッテリー（2012〜2013年の一部モデル用）',
  codes=mx, extra=[], codesNote='ブリヂストンサイクルの告知に「丸石サイクルによる対象型番」として掲載。問い合わせは丸石サイクルへ。',
  period='2012〜2013年の一部モデル', part='バッテリー（内部から発火するおそれ）', action='無償交換（各社で実施）',
  contact='丸石サイクル（告知ページのリンク先）', url='https://www.bscycle.co.jp/info/2021/8785', published='2021-01-26'))

rows.append(dict(maker='ブリヂストン', title='ビッケ モブdd・グリdd ハンドルポスト引き上げ棒',
  codes=[], extra=['ビッケ', 'bikke', 'モブdd', 'グリdd'],
  codesNote='フレーム前方下端の車種表示マーク（車種略号・商品コード・製造ロット）と、引き上げ棒ボルト頭部の刻印の両方で確認（公式の検索ページ）。車体色に関わらず対象。',
  period='2020年4月〜2021年3月製造', part='ハンドルポストの引き上げ棒（ネジ部が破損しハンドル操作ができなくなるおそれ）', action='対象部品の無償交換',
  contact='「ビッケ モブdd・グリdd」ハンドルポスト引き上げ棒 無償交換お客様コールセンター 0120-212-150', url='https://www.bscycle.co.jp/info/2022/10768', published='2022-11-09'))
rows.append(dict(maker='ブリヂストン', title='自転車・電動アシスト自転車 ステンレス製リム',
  codes=[], extra=['ステンレス製リム', 'リム'],
  codesNote='車種表示マークの車種略号・商品コード・製造ロットで公式ページから検索。2016年12月以降に補修用として交換したリムは刻印とラベルで確認。',
  period='2016年12月〜2020年12月製造（2023年5月16日に対象車両を追加）', part='ステンレス製リム（溶接部の線状のサビ・ヘコミ・ひび割れから破損するおそれ）', action='リコール（無償交換）',
  contact='ステンレス製リム 無償交換お客様コールセンター 0120-662-722', url='https://www.bscycle.co.jp/info/2022/10752', published='2022-10-11'))
rows.append(dict(maker='ブリヂストン', title='ハンドルロック「一発二錠」搭載 自転車・電動アシスト自転車',
  codes=[], extra=['一発二錠', 'ハンドルロック'],
  codesNote='ハンドルロック表示窓のラベルが「黒色」の製品はすべて対象（白色は対象外）。不明な場合は車種略号・商品コードで公式検索。',
  period='2003年9月〜2015年5月製造', part='ハンドルロック（走行時に錠が誤作動しハンドルがロックするおそれ）', action='無償点検・改修',
  contact='「一発二錠」無償点検・改修お客様コールセンター 0120-502-092', url='https://www.bscycle.co.jp/info/2019/6624', published='2019-06-24'))

for r in rows: r['checked'] = CHECK
json.dump({'checked': CHECK, 'rows': rows}, io.open('recalls.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for r in rows:
    print('%s | %s | codes %d | extra %d | %s' % (r['maker'], r['title'][:34], len(r['codes']), len(r['extra']), ' '.join(r['codes'][:8])))
print('pana2024', nums1, let1, nums2, let2)
print('pana2016', lots)
print('offtime', oc, exact, prefixes)
print('citv', cv)
print('rim', ranges)
print('2020', mm)
print('bs models', len(models)); [print('  ', m) for m in models]
print('bs lots', len(blots), blots[:6], blots[-4:])
print('x83', ybat, bsx, mx)
