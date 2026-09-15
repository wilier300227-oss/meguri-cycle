/* =========================================================
   v2 確定金額の提示（要件定義_LINEシステム.md §10 / F-5）
   ・オーナーが自分の LINE からコマンドを送る:
       #見積 C12 12000                     1台・単一額
       #見積 C12 12000 パナソニック ビビDX  金額のあとは車体名（任意）
       #見積 C12 12000 電動                 バッテリーの条件行を追加
       #見積 C12 30000/24000/18000 電動     点灯数未確認の3段（4点灯以上/3点灯/2点灯以下）
       #見積 C12 12000+15000 ビビDX+アルベルト   複数台（内訳。合計は自動）
       #見積 C12 12000 車体のみ             バッテリーを含まない旨を明記
       #引取 C12 2500                       値段がつかない車体の引き取り費用（出張費）
       #見積 C12 12000 期限 9/30            有効期限の上書き（既定は提示日＋7日）
   ・ボットはプレビュー（実際に送る Flex）をオーナーに返し、[送信する] で quotes に記録してお客さまへ push
   ・お客さま: [この金額で決定] → 日時・住所の依頼＋即時通知＋手動対応 / [もう少し考えます] → 期限案内＋ボタン再掲
   ・ログ: quotes タブ（本文スナップショットを含む。保存7年＝§6 #10）
   ========================================================= */
const QUOTE_COLS = ['quoteId', 'userId', 'displayName', 'cust_no', '提示時刻', '提示者', '種別', '台数', '金額合計', '内訳JSON',
  '本文スナップショット', '有効期限', 'status', '回答', '回答時刻', '回答時スナップショット'];
const QUOTE_VALID_DAYS = 7;
const QUOTE_FORBIDDEN = ['高価買取', '転売', '前後', '目安', '〜', '～'];

function getQuotesSheet_() {
  const ssId = PropertiesService.getScriptProperties().getProperty('INQUIRY_SHEET_ID');
  if (!ssId) return null;
  const ss = SpreadsheetApp.openById(ssId);
  let sh = ss.getSheetByName('quotes');
  if (!sh) { sh = ss.insertSheet('quotes'); sh.appendRow(QUOTE_COLS); sh.setFrozenRows(1); }
  return sh;
}
function v2IsOwner_(userId) { return !!userId && userId === OWNER_LINE_USER_ID; }
function v2Yen_(n) { return Number(n).toLocaleString('ja-JP') + '円'; }
function v2FmtDate_(d) { return Utilities.formatDate(d, 'Asia/Tokyo', 'M月d日'); }

/* ── お客さま番号 → userId ── */
function v2FindUserByCustNo_(custNo) {
  const sh = getUsersSheet_();
  if (!sh) return null;
  const data = sh.getDataRange().getValues();
  const header = data[0];
  const col = header.indexOf('cust_no');
  if (col === -1) return null;
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][col]).toUpperCase() === custNo.toUpperCase()) {
      const o = {}; header.forEach(function (c, i) { o[c] = data[r][i]; });
      return o;
    }
  }
  return null;
}

/* ── コマンド解析。戻り値 {ok, error, quote} ── */
/** 全角の ＃・数字・英字・記号・スペースを半角に（スマホの日本語入力で全角になりやすいため） */
function v2NormalizeCmd_(text) {
  return String(text || '').replace(/[！-～]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); }).replace(/　/g, ' ').trim();
}
function v2ParseQuoteCommand_(text) {
  const t = v2NormalizeCmd_(text);
  const usage = '書き方: #見積 C12 12000 [車体名] [電動] [車体のみ] [期限 9/30]\n3段: #見積 C12 30000/24000/18000 電動\n複数台: #見積 C12 12000+15000 ビビDX+アルベルト\n引取: #引取 C12 2500\n（C12 はお客さま番号。通知に載っています）';
  if (/^#(見積|引取)\s+[0-9,]/.test(t)) return { ok: false, error: 'お客さま番号が抜けています。例: #見積 C12 12000\n' + usage };
  const m = t.match(/^#(見積|引取)\s+([A-Za-z0-9]+)\s+([0-9,]+(?:[\/+][0-9,]+)*)\s*(.*)$/);
  if (!m) return { ok: false, error: usage };
  const kind = m[1] === '引取' ? 'hikitori' : 'kaitori';
  const cust = m[2].toUpperCase();
  const amountsRaw = m[3];
  let rest = m[4] || '';
  const q = { kind: kind, cust: cust, ebike: false, bodyOnly: false, names: [], mode: 'single', amounts: [], expires: null };
  if (/電動/.test(rest)) { q.ebike = true; rest = rest.replace(/電動/g, ' '); }
  if (/車体のみ/.test(rest)) { q.bodyOnly = true; q.ebike = true; rest = rest.replace(/車体のみ/g, ' '); }
  const ex = rest.match(/期限\s*(\d{1,2})\/(\d{1,2})/);
  if (ex) {
    const now = new Date();
    let d = new Date(now.getFullYear(), Number(ex[1]) - 1, Number(ex[2]), 23, 59, 59);
    if (d.getTime() < now.getTime()) d = new Date(now.getFullYear() + 1, Number(ex[1]) - 1, Number(ex[2]), 23, 59, 59);
    q.expires = d; rest = rest.replace(ex[0], ' ');
  }
  const toNum = function (s) { return parseInt(String(s).replace(/,/g, ''), 10); };
  if (amountsRaw.indexOf('/') !== -1) {
    q.mode = 'tiers'; q.amounts = amountsRaw.split('/').map(toNum);
    if (q.amounts.length !== 3) return { ok: false, error: '3段は「4点灯以上/3点灯/2点灯以下」の3つの金額を / で区切ってください' };
    q.ebike = true;
  } else if (amountsRaw.indexOf('+') !== -1) {
    q.mode = 'multi'; q.amounts = amountsRaw.split('+').map(toNum);
  } else {
    q.amounts = [toNum(amountsRaw)];
  }
  if (q.amounts.some(function (n) { return isNaN(n) || n < 0; })) return { ok: false, error: '金額は半角数字で（例: 12000）' };
  if (kind === 'kaitori' && q.amounts.some(function (n) { return n === 0; })) return { ok: false, error: '0円は #引取 で（引き取り費用を指定）' };
  const names = rest.trim();
  if (names) {
    q.names = q.mode === 'multi' ? names.split('+').map(function (s) { return s.trim(); }) : [names];
    const bad = QUOTE_FORBIDDEN.filter(function (w) { return names.indexOf(w) !== -1; });
    if (bad.length) return { ok: false, error: '使えない語が含まれています: ' + bad.join(' ') };
  }
  if (!q.expires) q.expires = new Date(Date.now() + QUOTE_VALID_DAYS * 86400000);
  q.total = q.mode === 'multi' ? q.amounts.reduce(function (a, b) { return a + b; }, 0) : q.amounts[0];
  return { ok: true, quote: q };
}

/* ── 本文（Flex の text に入れる。スナップショットにもこの文字列を保存する）── */
function v2QuoteBodyText_(q) {
  const L = [];
  L.push('お写真を拝見しました。', '');
  if (q.kind === 'hikitori') {
    L.push('【引き取り費用】 ' + v2Yen_(q.total) + '（確定）');
    if (q.names[0]) L.push('　' + q.names[0]);
    L.push('', '処分費は0円です。上記の出張費のみ、お伺い当日にお支払いください。');
  } else if (q.mode === 'tiers') {
    L.push('【買取金額】 バッテリー残量ランプの点灯数で決まります');
    L.push('　4点灯以上 … ' + v2Yen_(q.amounts[0]) + '（確定）');
    L.push('　3点灯 　　 … ' + v2Yen_(q.amounts[1]) + '（確定）');
    L.push('　2点灯以下 … ' + v2Yen_(q.amounts[2]) + '（確定）');
    if (q.names[0]) L.push('　' + q.names[0]);
    L.push('', 'お伺い当日にランプを一緒に確認し、該当する金額をそのままお支払いします。', '出張費・査定料はかかりません。');
  } else if (q.mode === 'multi') {
    L.push('【買取金額】 合計 ' + v2Yen_(q.total) + '（確定）');
    q.amounts.forEach(function (n, i) { L.push('　' + (i + 1) + '台目　' + (q.names[i] ? q.names[i] + ' ' : '') + '… ' + v2Yen_(n)); });
    L.push('', 'この金額は、お写真のとおりであればお伺い当日にそのままお支払いします。', '出張費・査定料はかかりません。');
  } else {
    L.push('【買取金額】 ' + v2Yen_(q.total) + '（確定）');
    if (q.names[0]) L.push('　' + q.names[0] + (q.ebike ? '（電動アシスト）' : '') + ' 1台');
    L.push('', 'この金額は、お写真のとおりであればお伺い当日にそのままお支払いします。', '出張費・査定料はかかりません。');
  }
  if (q.bodyOnly) L.push('※ バッテリーは含みません（車体のみの金額です）');
  L.push('有効期限は ' + v2FmtDate_(q.expires) + '（' + QUOTE_VALID_DAYS + '日間）です。');
  if (q.kind !== 'hikitori') {
    L.push('', '※ 写真では分からない次の点が当日見つかった場合だけ、その場では決めず、再査定のうえ改めて金額をご連絡します。');
    L.push('　・フレームの曲がり、割れ', '　・変速またはブレーキが動かない');
    if (q.ebike && !q.bodyOnly && q.mode !== 'tiers') L.push('　・バッテリー残量ランプが2点灯以下');
  }
  L.push('', 'この金額でよろしければ、下のボタンを押してください。');
  return L.join('\n');
}
function v2QuoteFlex_(q, quoteId, bodyText) {
  const alt = (q.kind === 'hikitori' ? '引き取り費用のご案内（' : '査定結果のご案内（買取金額 ') + v2Yen_(q.total) + '）';
  const btn = function (label, val, style) {
    return { type: 'button', style: style, height: 'sm', action: { type: 'postback', label: label, displayText: label, data: 'v=2&flow=quote&step=1&act=submit&val=' + val + '&q=' + quoteId } };
  };
  return {
    type: 'flex', altText: alt,
    contents: {
      type: 'bubble',
      header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: q.kind === 'hikitori' ? '引き取り費用のご案内' : '査定結果のご案内', weight: 'bold', size: 'lg', color: '#1a2a28' }] },
      body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: bodyText, wrap: true, size: 'md', lineSpacing: '4px' }] },
      footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [btn('この金額で決定', 'accept', 'primary'), btn('もう少し考えます', 'hold', 'secondary')] },
    },
  };
}

/* ── オーナーのコマンド入口（handleEvent から。処理したら true）── */
function v2HandleOwnerCommand_(event, userId, text) {
  if (!v2IsOwner_(userId)) return false;
  if (!/^#(見積|引取)/.test(v2NormalizeCmd_(text))) return false;
  const p = v2ParseQuoteCommand_(text);
  if (!p.ok) { v2ReplyText_(event, '⚠ ' + p.error); logEvent_(event, 'quote:parse_error', text.slice(0, 60)); return true; }
  const q = p.quote;
  const target = /^U[0-9a-f]{32}$/.test(q.cust) ? { userId: q.cust, cust_no: '' } : v2FindUserByCustNo_(q.cust);
  if (!target || !target.userId) { v2ReplyText_(event, '⚠ お客さま番号 ' + q.cust + ' が見つかりません（users タブの cust_no）'); logEvent_(event, 'quote:no_user', q.cust); return true; }
  const st = getUserState_(target.userId);
  if (isOptedOut_(st)) { v2ReplyText_(event, '⚠ ' + q.cust + ' は停止フラグ中です（再勧誘禁止）。送信しません'); logEvent_(event, 'quote:opted_out', q.cust); return true; }
  if (/^S[4-9]/.test(String(st.state || ''))) { v2ReplyText_(event, '⚠ ' + q.cust + ' は state=' + st.state + '（訪問確定以降）です。送信しません'); logEvent_(event, 'quote:state', q.cust); return true; }
  q.userId = target.userId; q.custNo = target.cust_no || q.cust;
  const draftId = 'D' + Utilities.getUuid().slice(0, 8);
  const bodyText = v2QuoteBodyText_(q);
  q.bodyText = bodyText; q.expiresIso = q.expires.toISOString();
  CacheService.getScriptCache().put('quotedraft_' + draftId, JSON.stringify(q), 600);
  const preview = v2QuoteFlex_(q, 'PREVIEW', bodyText);
  const confirm = v2Msg_('↑ ' + q.custNo + '（' + getDisplayName_(target.userId) + '）にこの内容を送ります。10分以内に選んでください。', [
    qrPostback_('送信する', 'v=2&flow=quote&step=0&act=submit&val=send&q=' + draftId),
    qrPostback_('やめる', 'v=2&flow=quote&step=0&act=submit&val=cancel&q=' + draftId),
  ]);
  v2Reply_(event, [preview, confirm]);
  logEvent_(event, 'quote:preview', q.custNo + ' ' + q.total + ' ' + draftId);
  return true;
}

/* ── quote フローの postback（オーナーの送信確認／お客さまの回答）── */
function v2HandleQuotePostback_(event, userId, pb) {
  if (pb.step === 0) {   // オーナーの送信確認
    if (!v2IsOwner_(userId)) { v2ReplyReselect_(event); return true; }
    const raw = CacheService.getScriptCache().get('quotedraft_' + pb.q);
    if (pb.val === 'cancel') { CacheService.getScriptCache().remove('quotedraft_' + pb.q); v2ReplyText_(event, '取り消しました'); logEvent_(event, 'quote:cancel', pb.q); return true; }
    if (!raw) { v2ReplyText_(event, '⚠ 下書きの期限（10分）が切れました。コマンドをもう一度送ってください'); logEvent_(event, 'quote:draft_expired', pb.q); return true; }
    const q = JSON.parse(raw);
    CacheService.getScriptCache().remove('quotedraft_' + pb.q);
    const quoteId = v2SendQuote_(q);
    v2ReplyText_(event, '✅ 送信しました（' + quoteId + '）。回答があれば通知します');
    logEvent_(event, 'quote:sent', quoteId + ' ' + q.custNo + ' ' + q.total);
    return true;
  }
  // お客さまの回答
  const row = v2FindQuote_(pb.q);
  if (!row || row.userId !== userId) { v2ReplyReselect_(event); logEvent_(event, 'quote:unknown', pb.q); return true; }
  const expired = row.status === 'expired' || (row.expires && new Date(row.expires).getTime() < Date.now());
  if (expired) {
    v2ReplyText_(event, 'この金額は有効期限を過ぎています。金額を再確認して、あらためてご連絡します🚲');
    v2UpdateQuote_(pb.q, { status: 'expired', 回答: 'expired_tap', 回答時刻: new Date() });
    v2NotifyOwnerNow_(userId, '⏰ 期限切れの見積にタップ', row.custNo + ' ' + pb.q + ' ' + pb.val);
    logEvent_(event, 'quote:expired', pb.q); return true;
  }
  if (pb.val === 'accept') {
    if (row.answer === 'accept') { logEvent_(event, 'quote:accept_dup', pb.q); return true; }   // 2度目の決定は無視（ログのみ）
    v2UpdateQuote_(pb.q, { status: 'accepted', 回答: 'accept', 回答時刻: new Date(), 回答時スナップショット: row.body });
    v2Reply_(event, [v2Msg_(v2AcceptedText_(row))]);
    try { setUserFields_(userId, { state: 'S3' }); } catch (e) {}
    try { setManualMode_(userId); } catch (e) {}
    v2NotifyOwnerNow_(userId, '✅ 「この金額で決定」', row.custNo + ' ' + pb.q + '\n' + v2Yen_(row.total) + '\n→ 日時と住所の返信を待って人が対応');
    logEvent_(event, 'quote:accept', pb.q); return true;
  }
  if (pb.val === 'hold') {
    v2UpdateQuote_(pb.q, { status: row.answer === 'accept' ? 'accepted' : 'hold', 回答: row.answer === 'accept' ? 'accept→hold' : 'hold', 回答時刻: new Date(), 回答時スナップショット: row.body });
    const again = v2QuoteFlex_(row.q, pb.q, row.body);
    v2Reply_(event, [v2Msg_('承知しました。この金額は ' + v2FmtDate_(new Date(row.expires)) + 'まで（' + QUOTE_VALID_DAYS + '日間）有効です。\nそれまでに、下のボタンからいつでもお申し込みいただけます🚲'), again]);
    v2NotifyOwnerNow_(userId, '🤔 「もう少し考えます」', row.custNo + ' ' + pb.q + ' ' + v2Yen_(row.total));
    logEvent_(event, 'quote:hold', pb.q); return true;
  }
  v2ReplyReselect_(event); return true;
}
function v2AcceptedText_(row) {
  return [
    'ありがとうございます。' + v2Yen_(row.total) + 'で決定しました。',
    '',
    'お伺いの準備のため、次の2つをこのまま入力して送ってください。',
    '',
    '① ご希望の日時',
    '　（例：9月20日 土曜 午前中／第2希望もあれば助かります）',
    '② お伺い先のご住所',
    '　（市町名・町名・番地まで。マンション等は建物名とお部屋番号も）',
    '',
    '担当者が確認して、日時をご連絡します。',
  ].join('\n');
}

/* ── 送信・記録 ── */
function v2SendQuote_(q) {
  const quoteId = 'Q' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyMMdd') + '-' + Utilities.getUuid().slice(0, 4).toUpperCase();
  // 同じお客さまの過去の提示は expired にする（古いボタンが押されても金額を再掲しない）
  const sh = getQuotesSheet_();
  if (sh) {
    const data = sh.getDataRange().getValues();
    const iU = QUOTE_COLS.indexOf('userId'), iS = QUOTE_COLS.indexOf('status');
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][iU]) === q.userId && (data[r][iS] === 'sent' || data[r][iS] === 'hold')) sh.getRange(r + 1, iS + 1).setValue('expired');
    }
    sh.appendRow([quoteId, q.userId, getDisplayName_(q.userId), q.custNo, new Date(), 'owner', q.kind, q.amounts.length, q.total,
      JSON.stringify({ mode: q.mode, amounts: q.amounts, names: q.names, ebike: q.ebike, bodyOnly: q.bodyOnly }),
      q.bodyText, new Date(q.expiresIso), 'sent', '', '', '']);
  }
  pushMessage_(q.userId, [v2QuoteFlex_(q, quoteId, q.bodyText)]);
  try { setUserFields_(q.userId, { state: 'S3' }); } catch (e) {}
  return quoteId;
}
function v2FindQuote_(quoteId) {
  const sh = getQuotesSheet_();
  if (!sh) return null;
  const data = sh.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]) === quoteId) {
      let q = {}; try { q = JSON.parse(data[r][QUOTE_COLS.indexOf('内訳JSON')] || '{}'); } catch (e) {}
      q.kind = data[r][QUOTE_COLS.indexOf('種別')]; q.total = data[r][QUOTE_COLS.indexOf('金額合計')];
      q.expires = data[r][QUOTE_COLS.indexOf('有効期限')]; q.amounts = q.amounts || [q.total]; q.names = q.names || [];
      return {
        row: r + 1, userId: String(data[r][1]), custNo: data[r][QUOTE_COLS.indexOf('cust_no')], total: q.total,
        body: data[r][QUOTE_COLS.indexOf('本文スナップショット')], expires: q.expires,
        status: data[r][QUOTE_COLS.indexOf('status')], answer: data[r][QUOTE_COLS.indexOf('回答')], q: q,
      };
    }
  }
  return null;
}
function v2UpdateQuote_(quoteId, fields) {
  const sh = getQuotesSheet_();
  if (!sh) return;
  const row = v2FindQuote_(quoteId);
  if (!row) return;
  Object.keys(fields).forEach(function (k) { const c = QUOTE_COLS.indexOf(k); if (c !== -1) sh.getRange(row.row, c + 1).setValue(fields[k]); });
}
/** 見積の回答はバースト抑制の対象外で即時通知（F-5） */
function v2NotifyOwnerNow_(userId, subject, body) {
  try {
    const name = getDisplayName_(userId);
    try { appendInquiryRow_(new Date(), 'LINE', name, subject, body, 'quote_' + Date.now()); }
    catch (e) { notifyOwner_('LINE', name, subject, body); }
  } catch (e) {}
}
