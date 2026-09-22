/* =========================================================
   v2 写真査定「③写真」（要件定義 docs/spec_photo_appraisal_2026-09-20.md §2.1〜2.3・§7・§10）
   satei の step3（写真工程）と battery の step3 を、まとまり単位の受け付けに置き換える。
   - 写真がそろわなくても止めない。足りないまま［次へ］の確認はフロー全体で最初の1回だけ
   - 枚数が決まったまとまりは、枚数に達したら自動で次へ。想定より多く届いた分も受け取る
   - 同時送信（imageSet）は「最後の1枚」の replyToken で1回だけ返す
   - ボットは金額を計算しない。まとまりごとの受信数を記録して、受付通知に載せるだけ
   - 写真の実体は保存しない（オーナーがトークで見る。2026-09-22 決定）
   - 写真セッションは Sheets に 7 日間保持（v2-core.gs の v2GetSession_ が参照）
   文言の禁止語：「必須」「任意」「下限」、「下がります」と言い切らない。
   ========================================================= */
const V2_MIHON_BASE = 'https://meguri-cycle.com/images/mihon/';
const V2_PHOTO_TTL_SEC = 7 * 86400;
const V2_PHOTO_LOG_COLS = ['userId', 'cust_no', '種別', '開始', '最終操作', '到達まとまり', '受信数JSON', '飛ばした回数', '完了', '24h通知'];

/* ── まとまりの定義 ── */
function v2PhotoImg_(rel) {
  return { type: 'image', originalContentUrl: V2_MIHON_BASE + rel + '.jpg', previewImageUrl: V2_MIHON_BASE + rel + '_p.jpg' };
}
function v2PhotoMap_(variant) {
  return { type: 'image', originalContentUrl: V2_MIHON_BASE + 'map_' + variant + '.png', previewImageUrl: V2_MIHON_BASE + 'map_' + variant + '_p.png' };
}
/** セッションから種別を決める：normal（一般車）/ ebike（電動）/ battery（バッテリー単体） */
function v2PhotoVariant_(s) {
  const d = s.data || {};
  if (s.flow === 'battery') return 'battery';
  if (d.ebike === 'normal') return 'normal';
  return 'ebike';
}
/** まとまりの一覧。need=0 は［次へ］でしか進まない。kinds に video があるまとまりは動画も受ける */
function v2PhotoGroups_(s) {
  const d = s.data || {};
  const v = v2PhotoVariant_(s);
  const TIP = '文字のシールは、近づけて画面いっぱいに写してください。送るときに「ORIGINAL」の表示があれば、選んでいただけると文字がくっきり届きます。';
  if (v === 'battery') {
    return [
      { title: 'バッテリーの写真（正面・横・型番シール・端子）', need: 4, kinds: ['image'], img: null, tip: TIP },
      { title: 'バッテリー診断の動画', need: 1, kinds: ['image', 'video'], img: null, video: true, alt: '動画が難しければ、ランプが光った瞬間の写真2〜3枚でも大丈夫です。' },
      { title: '充電器に載せた状態（写真か動画）', need: 1, kinds: ['image', 'video'], img: 'ebike/15' },
      { title: '気になる点', need: 0, kinds: ['image', 'video'], img: null, skipLabel: '特にない', last: true },
    ];
  }
  if (v === 'normal') {
    return [
      { title: '全体（右・左）と品番シール', need: 3, kinds: ['image'], img: 'normal/set1', tip: TIP },
      { title: 'ハンドルまわりとチェーン・ペダル', need: 2, kinds: ['image'], img: 'normal/set2' },
      { title: '前輪・後輪の左右', need: 4, kinds: ['image'], img: 'normal/set3' },
      { title: '前カゴと荷台（付いていれば各1枚）', need: 2, kinds: ['image'], img: 'normal/set4', skipLabel: '付いていない', optional: true },
      { title: '気になる傷や不具合', need: 0, kinds: ['image', 'video'], img: null, skipLabel: '特にない', last: true },
    ];
  }
  // ebike
  const noCharge = d.charge === 'no';          // 充電できない → 手元スイッチと診断動画はお願いしない（§2.1-8）
  const bodyOnly = !!d.bodyOnly;               // バッテリーは受けられない（車体のみ）→ バッテリー関係を全部飛ばす
  const g = [
    { title: '全体（右・左）と品番シール', need: 3, kinds: ['image'], img: 'ebike/set1', tip: TIP },
    noCharge
      ? { title: 'ハンドルまわりとチェーン・ペダル', need: 2, kinds: ['image'], img: 'ebike/set2' }
      : { title: 'ハンドルまわり・手元スイッチ（電源オン）・チェーン・ペダル', need: 3, kinds: ['image'], img: 'ebike/set2', tip: '手元スイッチは電源を入れた状態で、画面に近づけて数字が読めるように。' },
    { title: '前輪・後輪の左右', need: 4, kinds: ['image'], img: 'ebike/set3' },
    { title: '前カゴと荷台（付いていれば各1枚）', need: 2, kinds: ['image'], img: 'ebike/set4', skipLabel: '付いていない', optional: true },
  ];
  if (!bodyOnly) {
    g.push({ title: '鍵を挿した状態と、バッテリーの型番・ロット番号', need: 2, kinds: ['image'], img: 'ebike/set5', tip: TIP });
    if (!noCharge) g.push({ title: 'バッテリー診断の動画', need: 1, kinds: ['image', 'video'], img: null, video: true, alt: '動画が難しければ、ランプが光った瞬間の写真2〜3枚でも大丈夫です。' });
    g.push({ title: '充電器に載せた状態（写真か動画）', need: 1, kinds: ['image', 'video'], img: 'ebike/15' });
  }
  g.push({ title: '気になる傷や不具合', need: 0, kinds: ['image', 'video'], img: null, skipLabel: '特にない', last: true });
  return g;
}
function v2PhotoTotals_(s) {
  const gs = v2PhotoGroups_(s);
  let photos = 0, videos = 0;
  gs.forEach(function (g) { if (g.video) videos += 1; else photos += g.need; });
  return { groups: gs.length, photos: photos, videos: videos };
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
  // 電動（車体のみでない）で、まだ「充電できるか」を答えていない
  return s.flow === 'satei' && v2PhotoVariant_(s) === 'ebike' && !(s.data && s.data.bodyOnly) && !(s.data && s.data.charge);
}

/* ── 文言 ── */
function v2PhotoQuick_(s, g) {
  return [
    qrPostback_(g && g.skipLabel ? '▶ ' + g.skipLabel : '▶ 次へ', v2Pb_(s.flow, 3, 'next', 'photo_next')),
    qrPostback_('◀ ひとつ戻る', v2Pb_('menu', 0, 'back')),
    qrPostback_('✖ やめる', v2Pb_('menu', 0, 'stop')),
  ];
}
function v2PhotoChargeMsg_(s) {
  return v2Msg_('🔌 バッテリーは充電できますか？\n（充電できない場合は、電源を入れた写真や診断の動画はお願いしません）', [
    qrPostback_('充電できる', v2Pb_(s.flow, 3, 'next', 'charge_yes')),
    qrPostback_('充電できない', v2Pb_(s.flow, 3, 'next', 'charge_no')),
    qrPostback_('わからない', v2Pb_(s.flow, 3, 'next', 'charge_unknown')),
  ]);
}
/** 最初の案内（§7、変更案B）：まず最初のまとまりを主役に、総量はあとに短く */
function v2PhotoIntroMsgs_(s) {
  const t = v2PhotoTotals_(s);
  const gs = v2PhotoGroups_(s);
  const first = gs[0];
  const v = v2PhotoVariant_(s);
  const lines = [
    'ここから写真をお願いします📷',
    '写真をもとに金額を確定するので、当日その場で金額が変わることはありません。',
    '',
    'まずは【1/' + t.groups + '】の' + first.need + '枚からお願いします（1〜2分ほどです）。',
    '全部で' + t.groups + 'つのまとまり（写真' + t.photos + '枚' + (t.videos ? 'と動画' + t.videos + '本' : '') + '）ですが、一度に全部でなくて大丈夫です。',
    '',
    'できる範囲で大丈夫です。写真が少ないと、確認できない部分の金額が下がる可能性があります。',
    'ご家族に撮ってもらってもOKです。今そばになくても、あとで続きから送れます。',
  ];
  const msgs = [v2Msg_(lines.join('\n'))];
  if (v !== 'battery') msgs.push(v2PhotoMap_(v));   // 撮影マップ（バッテリー単体はまだ無い）
  return msgs.concat(v2PhotoGroupMsgs_(s));
}
/** 今のまとまりの案内（見本画像 → 文＋ボタン。クイックリプライは最後の吹き出しに付ける） */
function v2PhotoGroupMsgs_(s, prefix) {
  const gs = v2PhotoGroups_(s);
  const p = s.data.photo;
  const g = gs[p.g - 1];
  const head = '【' + p.g + '/' + gs.length + '】' + g.title + (g.need ? '（' + g.need + (g.video ? '本' : '枚') + '）' : '');
  const lines = [(prefix ? prefix + '\n' : '') + head];
  if (g.last) lines.push('最後に、気になる傷や不具合があれば写真を送ってください。なければ「' + g.skipLabel + '」を押してください。');
  else if (g.optional) lines.push('付いていない場合は、そのまま「' + g.skipLabel + '」を押して進んでください。');
  else if (g.video) lines.push('上の動画のように、長押しでランプが光るところまでを動画で撮って送ってください。', g.alt || '');
  else if (g.img) lines.push('見本のように、枠の部分が大きく写るように撮ってください。');
  else lines.push('順番に撮って送ってください。');
  if (g.tip) lines.push('', g.tip);
  const msgs = [];
  if (g.video) msgs.push(v2BatteryVideoMessage_());
  if (g.img) msgs.push(v2PhotoImg_(g.img));
  msgs.push(v2Msg_(lines.filter(function (x) { return x !== undefined; }).join('\n'), v2PhotoQuick_(s, g)));
  return msgs;
}
/** 文字入力や「ひとつ戻る」で今の質問を出し直すとき（v2PromptMessages_ から） */
function v2PhotoPromptMsgs_(s) {
  if (v2PhotoNeedsCharge_(s)) return [v2PhotoChargeMsg_(s)];
  if (!s.data.photo) return v2PhotoStartMsgs_(s);
  return v2PhotoGroupMsgs_(s, '続きから送れます。');
}
/** 写真工程の入口（v2Transition_ で step を 3 にしたときに使う） */
function v2PhotoStartMsgs_(s, userId) {
  s.data = s.data || {};
  if (v2PhotoNeedsCharge_(s)) return [v2PhotoChargeMsg_(s)];
  if (!s.data.photo) v2PhotoInit_(s, userId);
  v2PhotoLog_(s, '');
  return v2PhotoIntroMsgs_(s);
}
function v2PhotoFinishText_() {
  return [
    '写真ありがとうございました📷',
    '内容を確認して、原則48時間以内に金額を LINE でお送りします。',
    'お送りいただいた写真は査定のためだけに使います。SNSなどに載せることはありません。',
  ].join('\n');
}

/* ── 進行 ── */
/** 次のまとまりへ。最後まで来たら終了。戻り値 { messages, menu, done, finished } */
function v2PhotoAdvance_(s, receivedLine) {
  const p = s.data.photo;
  const gs = v2PhotoGroups_(s);
  p.t = new Date().toISOString();
  p.ask = p.ask; // 確認は「最初の1回だけ」なので、まとまりが変わってもリセットしない
  if (p.g < gs.length) {
    p.g += 1;
    const g = gs[p.g - 1];
    const next = '次は【' + p.g + '/' + gs.length + '】' + g.title + (g.need ? '（' + g.need + (g.video ? '本' : '枚') + '）' : '') + 'です。';
    v2PhotoLog_(s, '');
    return { messages: v2PhotoGroupMsgs_(s, (receivedLine ? receivedLine + '\n' : '') + next), menu: 'photo', done: false, finished: false };
  }
  // 終了 → 既存フローの次の段階へ
  s.data.photoDone = 1;
  v2PhotoLog_(s, 'done');
  const out = { messages: [v2Msg_((receivedLine ? receivedLine + '\n\n' : '') + v2PhotoFinishText_())], menu: 'inflow', done: false, finished: true };
  if (s.flow === 'battery') { out.done = true; return out; }
  if (s.intent === 'kaitori' && !s.data.rust) { s.data.rustAsk = 1; out.messages.push(v2AskRustMessage_()); return out; }
  s.step = 4; out.messages.push(v2AskCityMessage_()); return out;
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
  if (pb.val === 'photo_go') { const p = s.data.photo; const g = v2PhotoGroups_(s)[p.g - 1]; if (g.need > 0 && (p.c[p.g] || 0) < g.need) p.skip = (p.skip || 0) + 1; return v2PhotoAdvance_(s, ''); }
  if (pb.val === 'photo_more' || pb.val === 'more_photos') return { messages: v2PhotoGroupMsgs_(s), menu: 'photo', done: false };
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
  const gi = p.g;   // ログ用：この1枚を数えたまとまり（自動で次へ進んだあとも変わらない）
  const unit = (kind === 'video' ? '本' : '枚');
  let out = null;
  if (shouldReply) {
    const received = n + unit + '受け取りました。';
    if (g.need > 0 && n >= g.need) {
      out = v2PhotoAdvance_(s, received);
    } else {
      const lines = [received + (g.need ? 'あと' + (g.need - n) + '枚です。' : '') + '続けて送れます。送り終わったら「' + (g.skipLabel || '次へ') + '」を押してください。'];
      if (!p.tip) { lines.push('（撮り直したいときは、そのまま同じまとまりにもう1枚送ってください）'); p.tip = 1; }
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
  logEvent_(event, 'v2:' + s.flow + '/3/' + kind, 'まとまり' + gi + ' ' + n + unit + (p.g !== gi ? ' → 次へ' : '') + (shouldReply ? '' : '（無言）'));
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
/** セッションの写真状態を「写真査定ログ」に1行で保つ（開始ごとに1行。同じ開始時刻の行を更新） */
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
/** 受付通知に足す行：まとまりごとの受信数と未送の箇所 */
function v2PhotoSummaryLines_(s) {
  const p = s.data && s.data.photo;
  if (!p) return [];
  const gs = v2PhotoGroups_(s);
  const parts = [], missing = [];
  gs.forEach(function (g, i) {
    const n = p.c[i + 1] || 0;
    parts.push((i + 1) + ':' + n + (g.need ? '/' + g.need : ''));
    if (g.need && n < g.need && !g.optional) missing.push('まとまり' + (i + 1) + ' ' + g.title + '（' + n + '/' + g.need + '）');
  });
  const lines = ['写真（まとまり別）: ' + parts.join('  ') + (p.skip ? '  飛ばした:' + p.skip + '回' : '')];
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
    if (!userId || String(data[r][1]) !== 'satei' && String(data[r][1]) !== 'battery') continue;
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
    notifyOwner_('LINE', name, '⏳ 写真が24時間止まっています', ['まとまり' + p.g + '/' + gs.length + ' で止まっています。'].concat(v2PhotoSummaryLines_(s)).join('\n'));
    v2SetSession_(userId, s);
    v2PhotoLog_(s, '');
  }
}
function installPhotoStaleTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'v2PhotoStaleCheck') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('v2PhotoStaleCheck').timeBased().everyHours(1).create();
}
