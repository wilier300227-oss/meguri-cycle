/* =========================================================
   v2 写真査定「③写真」（要件定義 docs/spec_photo_appraisal_2026-09-20.md §2.1〜2.3・§7・§10）
   satei の step3（写真工程）と battery の step3 を、工程（まとまり）単位の受け付けに置き換える。
   - 写真がそろわなくても止めない。足りないまま［次へ］の確認はフロー全体で最初の1回だけ
   - 枚数が決まった工程は、枚数に達したら自動で次へ。想定より多く届いた分も受け取る
   - 同時送信（imageSet）は「最後の1枚」の replyToken で1回だけ返す
   - ボットは金額を計算しない。工程ごとの受信数を記録して、受付通知に載せるだけ
   - 写真の実体は保存しない（オーナーがトークで見る。2026-09-22 決定）
   - 写真セッションは Sheets に 7 日間保持（v2-core.gs の v2GetSession_ が参照）
   2026-09-22 オーナーの実機テストを受けて：数字と工程を減らし（一般車4・電動6・単体3）、「気になる点」の工程は廃止
   （完了文の「状態について」に一本化）、ORIGINAL の説明は削除、受け取りの返事と次の見出しの二重表示をやめた。
   文言の禁止語：「必須」「任意」「下限」、「下がります」と言い切らない。お客さま向けには「まとまり」も使わない。
   ========================================================= */
const V2_MIHON_BASE = 'https://meguri-cycle.com/images/mihon/';
const V2_PHOTO_TTL_SEC = 7 * 86400;
const V2_PHOTO_LOG_COLS = ['userId', 'cust_no', '種別', '開始', '最終操作', '到達工程', '受信数JSON', '飛ばした回数', '完了', '24h通知'];
const V2_TIP_SEAL = 'シールの文字が読めるように、近づけて撮ってください。';

/* ── 工程の定義 ── */
function v2PhotoImg_(rel) {
  return { type: 'image', originalContentUrl: V2_MIHON_BASE + rel + '.jpg', previewImageUrl: V2_MIHON_BASE + rel + '_p.jpg' };
}
function v2PhotoMap_(variant) {
  return { type: 'image', originalContentUrl: V2_MIHON_BASE + 'map_' + variant + '.png', previewImageUrl: V2_MIHON_BASE + 'map_' + variant + '_p.png' };
}
function v2PhotoVariant_(s) {
  const d = s.data || {};
  if (s.flow === 'battery') return 'battery';
  if (d.ebike === 'normal') return 'normal';
  return 'ebike';
}
/** 工程の一覧。need 枚届いたら自動で次へ。kinds に video があれば動画も受ける。optional は「付いていない」で飛ばせる */
function v2PhotoGroups_(s) {
  const d = s.data || {};
  const v = v2PhotoVariant_(s);
  const VIDEO = { title: 'バッテリー診断の動画', need: 1, kinds: ['image', 'video'], img: null, video: true,
    alt: '難しければ、ランプが光った瞬間の写真2〜3枚でも大丈夫です。' };
  if (v === 'battery') {
    return [
      { title: 'バッテリーの写真（正面・横・型番シール・端子）', need: 4, kinds: ['image'], img: null, tip: V2_TIP_SEAL },
      { title: '充電器に載せた状態（写真か動画）', need: 1, kinds: ['image', 'video'], img: 'ebike/15' },
      VIDEO,
    ];
  }
  if (v === 'normal') {
    return [
      { title: '自転車ぜんぶ（右から・左から）と、品番シール', need: 3, kinds: ['image'], img: 'normal/set1', tip: V2_TIP_SEAL },
      { title: 'ハンドルまわりと、チェーン・ペダル', need: 2, kinds: ['image'], img: 'normal/set2' },
      { title: '前輪と後輪（右と左）', need: 4, kinds: ['image'], img: 'normal/set3' },
      { title: '前カゴと荷台（付いていれば）', need: 2, kinds: ['image'], img: 'normal/set4', optional: true, skipLabel: '付いていない' },
    ];
  }
  const noCharge = d.charge === 'no';   // 充電できない → 手元スイッチと診断動画はお願いしない（§2.1-8）
  const bodyOnly = !!d.bodyOnly;        // バッテリーは受けられない（車体のみ）→ バッテリー関係を全部飛ばす
  const g = [
    { title: '自転車ぜんぶ（右から・左から）と、品番シール', need: 3, kinds: ['image'], img: 'ebike/set1', tip: V2_TIP_SEAL },
    noCharge
      ? { title: 'ハンドルまわりと、チェーン・ペダル', need: 2, kinds: ['image'], img: 'ebike/set2' }
      : { title: 'ハンドルまわり・手元スイッチ・チェーン', need: 3, kinds: ['image'], img: 'ebike/set2', tip: '手元スイッチは電源を入れて、数字が読めるように撮ってください。' },
    { title: '前輪と後輪（右と左）', need: 4, kinds: ['image'], img: 'ebike/set3' },
    { title: '前カゴと荷台（付いていれば）', need: 2, kinds: ['image'], img: 'ebike/set4', optional: true, skipLabel: '付いていない' },
  ];
  if (!bodyOnly) {
    g.push({ title: 'バッテリーの鍵・型番シール・充電器', need: 3, kinds: ['image', 'video'], img: 'ebike/set5',
      tip: V2_TIP_SEAL + '充電器は、ランプが点いている瞬間を。' });
    if (!noCharge) g.push(VIDEO);
  }
  return g;
}

/* ── 状態 ── */
function v2PhotoInit_(s, userId) {
  s.data = s.data || {};
  s.data.photo = { uid: userId || '', g: 1, c: {}, ask: 0, sets: {}, tip: 0, skip: 0, t: new Date().toISOString(), n24: 0, started: new Date().toISOString() };
  delete s.data.photoDone;
  return s.data.photo;
}
function v2PhotoActive_(s) {
  return !!(s && s.step === 3 && s.data && s.data.photo && !s.data.photoDone && !s.data.rustAsk);
}
function v2PhotoNeedsCharge_(s) {
  return s.flow === 'satei' && v2PhotoVariant_(s) === 'ebike' && !(s.data && s.data.bodyOnly) && !(s.data && s.data.charge);
}

/* ── 文言 ── */
function v2PhotoQuick_(s, g) {
  return [
    qrPostback_('▶ ' + ((g && g.skipLabel) || '次へ'), v2Pb_(s.flow, 3, 'next', 'photo_next')),
    qrPostback_('◀ ひとつ戻る', v2Pb_('menu', 0, 'back')),
    qrPostback_('✖ やめる', v2Pb_('menu', 0, 'stop')),
  ];
}
function v2PhotoChargeMsg_(s) {
  return v2Msg_('🔌 バッテリーは充電できますか？', [
    qrPostback_('充電できる', v2Pb_(s.flow, 3, 'next', 'charge_yes')),
    qrPostback_('充電できない', v2Pb_(s.flow, 3, 'next', 'charge_no')),
    qrPostback_('わからない', v2Pb_(s.flow, 3, 'next', 'charge_unknown')),
  ]);
}
/** 最初の案内：数字を出さない。順番に案内する、できる範囲で、家族OK・あとで続きからOK */
function v2PhotoIntroMsgs_(s) {
  const v = v2PhotoVariant_(s);
  const lines = [
    '📷 写真をお願いします',
    '写真で金額を確定するので、当日その場で金額が変わることはありません。',
    '',
    '順番にご案内しますので、案内のとおりに撮って送ってください。',
    'できる範囲で大丈夫です（少ないと、確認できない部分の金額が下がる可能性があります）。',
    'ご家族に撮ってもらっても、あとで続きからでもOKです。',
  ];
  return [v2Msg_(lines.join('\n')), v2PhotoMap_(v)].concat(v2PhotoGroupMsgs_(s, ''));
}
/** 今の工程の案内。見本画像 → 文＋ボタン（クイックリプライは最後の吹き出しに付ける）。prefix は受け取りの一言 */
function v2PhotoGroupMsgs_(s, prefix) {
  const gs = v2PhotoGroups_(s);
  const p = s.data.photo;
  const g = gs[p.g - 1];
  const head = '【' + p.g + '/' + gs.length + '】' + g.title + (g.need ? '（' + g.need + (g.video ? '本' : '枚') + '）' : '');
  const lines = [(prefix ? prefix + '\n' : '') + head];
  if (g.video) lines.push('上の動画のように、長押しでランプが光るところまでを動画で撮って送ってください。', g.alt || '');
  else if (p.g === 1) lines.push('見本のように、枠の部分が大きく写るように撮ってください。');
  if (g.optional) lines.push('付いていない場合は「' + g.skipLabel + '」を押してください。');
  if (g.tip) lines.push(g.tip);
  const msgs = [];
  if (g.video) msgs.push(v2BatteryVideoMessage_());
  if (g.img) msgs.push(v2PhotoImg_(g.img));
  msgs.push(v2Msg_(lines.filter(function (x) { return x; }).join('\n'), v2PhotoQuick_(s, g)));
  return msgs;
}
function v2PhotoPromptMsgs_(s) {
  if (v2PhotoNeedsCharge_(s)) return [v2PhotoChargeMsg_(s)];
  if (!s.data.photo) return v2PhotoStartMsgs_(s);
  return v2PhotoGroupMsgs_(s, '続きから送れます。');
}
function v2PhotoStartMsgs_(s, userId) {
  s.data = s.data || {};
  if (v2PhotoNeedsCharge_(s)) return [v2PhotoChargeMsg_(s)];
  if (!s.data.photo) v2PhotoInit_(s, userId);
  v2PhotoLog_(s, '');
  return v2PhotoIntroMsgs_(s);
}

/* ── 進行 ── */
/** 次の工程へ。最後まで来たら終了して既存フローの次の段階へ。戻り値 { messages, menu, done } */
function v2PhotoAdvance_(s, receivedLine) {
  const p = s.data.photo;
  const gs = v2PhotoGroups_(s);
  p.t = new Date().toISOString();
  if (p.g < gs.length) {
    p.g += 1;
    v2PhotoLog_(s, '');
    return { messages: v2PhotoGroupMsgs_(s, receivedLine), menu: 'photo', done: false };
  }
  s.data.photoDone = 1;
  v2PhotoLog_(s, 'done');
  const thanks = (receivedLine ? receivedLine + '\n' : '') + '写真ありがとうございました📷（写真は査定のためだけに使います）';
  const out = { messages: [], menu: 'inflow', done: false };
  if (s.flow === 'battery') { out.messages = [v2Msg_(thanks)]; out.done = true; return out; }
  if (s.intent === 'kaitori' && !s.data.rust) { s.data.rustAsk = 1; out.messages = [v2Msg_(thanks), v2AskRustMessage_()]; return out; }
  s.step = 4; out.messages = [v2Msg_(thanks), v2AskCityMessage_()]; return out;
}
/** ［次へ］が押された（写真が足りなければ最初の1回だけ確認） */
function v2PhotoNextPressed_(s) {
  const p = s.data.photo;
  const g = v2PhotoGroups_(s)[p.g - 1];
  const n = p.c[p.g] || 0;
  if (g.need > 0 && n < g.need && !g.optional && !p.ask) {
    p.ask = 1;
    return { messages: [v2Msg_('まだ' + (g.need - n) + '枚届いていません。足りない分は、確認できない部分の金額が下がる可能性があります。', [
      qrPostback_('このまま進む', v2Pb_(s.flow, 3, 'next', 'photo_go')),
      qrPostback_('写真を足す', v2Pb_(s.flow, 3, 'next', 'photo_more')),
    ])], menu: 'photo', done: false };
  }
  if (g.need > 0 && n < g.need) p.skip = (p.skip || 0) + 1;
  return v2PhotoAdvance_(s, '');
}
/** postback（v2Transition_ の step3 から）。処理したら out、対象外なら null */
function v2PhotoTransition_(userId, s, pb) {
  s.data = s.data || {};
  if (pb.val === 'charge_yes' || pb.val === 'charge_no' || pb.val === 'charge_unknown') {
    s.data.charge = pb.val.replace('charge_', '');
    return { messages: v2PhotoStartMsgs_(s, userId), menu: 'photo', done: false };
  }
  if (!v2PhotoActive_(s)) return null;
  if (pb.val === 'photo_next' || pb.val === 'photos_done') return v2PhotoNextPressed_(s);
  if (pb.val === 'photo_go') {
    const p = s.data.photo; const g = v2PhotoGroups_(s)[p.g - 1];
    if (g.need > 0 && (p.c[p.g] || 0) < g.need) p.skip = (p.skip || 0) + 1;
    return v2PhotoAdvance_(s, '');
  }
  if (pb.val === 'photo_more' || pb.val === 'more_photos') return { messages: v2PhotoGroupMsgs_(s, ''), menu: 'photo', done: false };
  return null;
}
/** 画像・動画が届いた（v2HandleImage_ から）。写真工程なら数えて、返事が要るときだけ返す。処理したら true */
function v2PhotoOnMedia_(event, userId, s, kind) {
  if (!v2PhotoActive_(s)) return false;
  const p = s.data.photo;
  if (!p.uid) p.uid = userId;
  const gs = v2PhotoGroups_(s);
  const g = gs[p.g - 1];
  p.c[p.g] = (p.c[p.g] || 0) + 1;
  p.t = new Date().toISOString();
  s.data.photos = (s.data.photos || 0) + 1;
  // 返事は「同時送信のまとまりに1回」。imageSet.total が分かれば最後の1枚で、分からなければ最初の1枚で
  const set = event.message && event.message.imageSet;
  let shouldReply = true;
  if (set && set.id) {
    if (set.total && set.index) shouldReply = Number(set.index) === Number(set.total);
    else { shouldReply = !p.sets[set.id]; p.sets[set.id] = 1; }
  }
  const n = p.c[p.g];
  const gi = p.g;
  const unit = (kind === 'video' ? '本' : '枚');
  let out = null;
  if (shouldReply) {
    const received = n + unit + '受け取りました📷';
    if (g.need > 0 && n >= g.need) {
      out = v2PhotoAdvance_(s, received);
    } else {
      const lines = [received + (g.need ? ' あと' + (g.need - n) + '枚です。' : '') + '送り終わったら「' + (g.skipLabel || '次へ') + '」を押してください。'];
      if (!p.tip) { lines.push('（撮り直したいときは、そのままもう1枚送ってください）'); p.tip = 1; }
      out = { messages: [v2Msg_(lines.join('\n'), v2PhotoQuick_(s, g))], menu: 'photo', done: false };
    }
  }
  v2PhotoLog_(s, '');
  if (out) {
    v2Reply_(event, out.messages);
    if (out.done) { v2Complete_(event, userId, s); return true; }
    if (out.menu) v2LinkMenu_(userId, out.menu);
  }
  v2SetSession_(userId, s);
  logEvent_(event, 'v2:' + s.flow + '/3/' + kind, '工程' + gi + ' ' + n + unit + (p.g !== gi ? ' → 次へ' : '') + (s.data.photoDone ? ' → 完了' : '') + (shouldReply ? '' : '（無言）'));
  return true;
}

/* ── 記録（写真査定ログ）と受付通知 ── */
function getPhotoLogSheet_() {
  const ssId = PropertiesService.getScriptProperties().getProperty('INQUIRY_SHEET_ID');
  if (!ssId) return null;
  const ss = SpreadsheetApp.openById(ssId);
  let sh = ss.getSheetByName('写真査定ログ');
  if (!sh) { sh = ss.insertSheet('写真査定ログ'); sh.appendRow(V2_PHOTO_LOG_COLS); sh.setFrozenRows(1); }
  return sh;
}
function v2PhotoLog_(s, status) {
  try {
    const p = s.data && s.data.photo;
    if (!p) return;
    const sh = getPhotoLogSheet_();
    if (!sh) return;
    const userId = p.uid || '';
    let cust = ''; try { cust = userId ? (v2CustNo_(userId) || '') : ''; } catch (e) {}
    const row = [userId, cust, v2PhotoVariant_(s), p.started, p.t, p.g, JSON.stringify(p.c), p.skip || 0, status === 'done' ? new Date().toISOString() : '', p.n24 ? 1 : ''];
    const data = sh.getDataRange().getValues();
    for (let r = data.length - 1; r >= 1; r--) {
      if (String(data[r][0]) === userId && String(data[r][3]) === String(p.started)) {
        if (!row[8] && data[r][8]) row[8] = data[r][8];
        sh.getRange(r + 1, 1, 1, row.length).setValues([row]);
        return;
      }
    }
    sh.appendRow(row);
  } catch (e) { console.error('v2PhotoLog_ ' + e); }
}
/** 受付通知に足す行：工程ごとの受信数と未送の箇所 */
function v2PhotoSummaryLines_(s) {
  const p = s.data && s.data.photo;
  if (!p) return [];
  const gs = v2PhotoGroups_(s);
  const parts = [], missing = [];
  gs.forEach(function (g, i) {
    const n = p.c[i + 1] || 0;
    parts.push((i + 1) + ':' + n + (g.need ? '/' + g.need : ''));
    if (g.need && n < g.need && !g.optional) missing.push('工程' + (i + 1) + ' ' + g.title + '（' + n + '/' + g.need + '）');
  });
  const lines = ['写真（工程別）: ' + parts.join('  ') + (p.skip ? '  飛ばした:' + p.skip + '回' : '')];
  if (missing.length) lines.push('未送: ' + missing.join(' / '));
  if (s.data.charge) lines.push('充電: ' + ({ yes: 'できる', no: 'できない', unknown: 'わからない' }[s.data.charge] || s.data.charge));
  return lines;
}

/* ── 24時間止まったままの検出（時間トリガー。1セッション1回だけオーナーに通知） ── */
function v2PhotoStaleCheck() {
  const sh = getSessionsSheet_();
  if (!sh) return;
  const data = sh.getDataRange().getValues();
  const now = Date.now();
  for (let r = 1; r < data.length; r++) {
    const userId = String(data[r][0] || '');
    if (!userId || (String(data[r][1]) !== 'satei' && String(data[r][1]) !== 'battery')) continue;
    let d = {}; try { d = JSON.parse(data[r][4] || '{}'); } catch (e) {}
    const p = d.photo;
    if (!p || d.photoDone || p.n24) continue;
    const last = p.t ? new Date(p.t).getTime() : 0;
    if (!last || now - last < 24 * 3600 * 1000) continue;
    const s = { flow: data[r][1], step: Number(data[r][2]) || 0, intent: data[r][3] || '', data: d };
    if (s.step !== 3) continue;
    p.n24 = 1;
    let name = userId; try { name = getDisplayName_(userId) || userId; } catch (e) {}
    const gs = v2PhotoGroups_(s);
    notifyOwner_('LINE', name, '⏳ 写真が24時間止まっています', ['工程' + p.g + '/' + gs.length + ' で止まっています。'].concat(v2PhotoSummaryLines_(s)).join('\n'));
    v2SetSession_(userId, s);
    v2PhotoLog_(s, '');
  }
}
function installPhotoStaleTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'v2PhotoStaleCheck') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('v2PhotoStaleCheck').timeBased().everyHours(1).create();
}
