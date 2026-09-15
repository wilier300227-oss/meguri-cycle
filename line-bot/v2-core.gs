/* =========================================================
   v2 基盤（要件定義_LINEシステム.md F-3 状態ガード / F-9 旧入口の変換表 / §6 #5 セッション / §10-6 お客さま番号）
   ・postback data のスキーマ: v=2&flow=<flow>&step=<n>&act=<act>&val=<value>[&q=<quoteId>]
   ・旧 data（action=xxx）と旧テキスト（タイル・クイックリプライの送信文言）は V2_LEGACY_* で v2 に写像する
   ・セッションは CacheService（6時間）を主、Sheets の sessions タブをバックアップにする
   ・ここでは「受け口と状態遷移の骨組み」だけ。各フローの本文（段階2）は v2-flows.gs（未作成）に置く
   ========================================================= */
const V2_SESSION_TTL_SEC = 6 * 3600;
const V2_FLOWS = ['satei', 'battery', 'area', 'faq', 'menu'];
const V2_ACTS = ['next', 'back', 'reset', 'stop', 'submit', 'consult'];
const SESSION_COLS = ['userId', 'flow', 'step', 'intent', 'data', 'updated_at'];

/* ── F-9 旧入口の変換表（実コードの棚卸しに基づく。2026-09-16）──
   旧 postback action（richmenu_A.json / handlePostback_ の switch。実際には送られたことがない） */
const V2_LEGACY_ACTIONS = {
  apply_kaitori: { flow: 'satei', step: 0, act: 'next', val: 'kaitori' },
  apply_shobun: { flow: 'satei', step: 0, act: 'next', val: 'shobun' },
  area_fee: { flow: 'area', step: 0, act: 'next' },
  estimate_request: { flow: 'satei', step: 3, act: 'next', val: 'photos_done' },
  faq: { flow: 'faq', step: 0, act: 'next' },
  inquiry: { flow: 'menu', step: 0, act: 'consult' },
  photo: { flow: 'satei', step: 3, act: 'next', val: 'more_photos' },
  add_photo: { flow: 'satei', step: 3, act: 'next', val: 'more_photos' },
  add_vehicle: { flow: 'menu', step: 0, act: 'consult' },
  check_status: { flow: 'menu', step: 0, act: 'consult' },
  reschedule: { flow: 'menu', step: 0, act: 'consult' },
  cancel: { flow: 'menu', step: 0, act: 'stop' },
};
/* 旧テキスト（管理画面メニューＡの送信テキスト・旧 MANUAL_RESET_TEXTS 14語・クイックリプライ文言）。
   切替後に古いトークから押されたとき、テキスト分岐より先にここで v2 に写像する（段階2で handleEvent に組み込む） */
const V2_LEGACY_TEXTS = {
  '買取査定を申し込む': V2_LEGACY_ACTIONS.apply_kaitori,
  '買取査定を申し込みます': V2_LEGACY_ACTIONS.apply_kaitori,
  '買取を申し込む': V2_LEGACY_ACTIONS.apply_kaitori,
  '出張引取を申し込みます': V2_LEGACY_ACTIONS.apply_shobun,
  '出張引取を申し込む': V2_LEGACY_ACTIONS.apply_shobun,
  '対応エリア・出張費': V2_LEGACY_ACTIONS.area_fee,
  '写真は以上です': V2_LEGACY_ACTIONS.estimate_request,
  '査定を申し込む': V2_LEGACY_ACTIONS.estimate_request,
  '査定をお願いします': V2_LEGACY_ACTIONS.estimate_request,
  '入力完了': V2_LEGACY_ACTIONS.estimate_request,
  'よくある質問': V2_LEGACY_ACTIONS.faq,
  '担当者に相談': V2_LEGACY_ACTIONS.inquiry,
  '写真を追加する': V2_LEGACY_ACTIONS.add_photo,
  '写真を追加': V2_LEGACY_ACTIONS.add_photo,
  '台数を追加する': V2_LEGACY_ACTIONS.add_vehicle,
  '台数を追加': V2_LEGACY_ACTIONS.add_vehicle,
  '進捗を確認': V2_LEGACY_ACTIONS.check_status,
  '日程を変更したい': V2_LEGACY_ACTIONS.reschedule,
  'キャンセル・やめる': V2_LEGACY_ACTIONS.cancel,
  '電動アシストの案内を見る': { flow: 'battery', step: 0, act: 'next' },
  '電動アシストの案内': { flow: 'battery', step: 0, act: 'next' },
};

/** postback data を解析。v2 形式なら {v:2, flow, step, act, val, q}、旧 action= なら変換表を通す。どちらでもなければ null。 */
function v2ParsePostback_(data) {
  const s = String(data || '');
  if (!s) return null;
  const kv = {};
  s.split('&').forEach(function (p) {
    const i = p.indexOf('=');
    if (i > 0) kv[decodeURIComponent(p.slice(0, i))] = decodeURIComponent(p.slice(i + 1));
  });
  if (kv.v === '2') {
    const step = parseInt(kv.step, 10);
    if (V2_FLOWS.indexOf(kv.flow) === -1 || isNaN(step) || V2_ACTS.indexOf(kv.act) === -1) return null;
    return { v: 2, flow: kv.flow, step: step, act: kv.act, val: kv.val || '', q: kv.q || '', raw: s };
  }
  if (kv.action && V2_LEGACY_ACTIONS[kv.action]) {
    const m = V2_LEGACY_ACTIONS[kv.action];
    return { v: 1, flow: m.flow, step: m.step, act: m.act, val: m.val || '', q: '', raw: s, legacy: kv.action };
  }
  return null;
}
/** 旧テキストを v2 に写像（該当なしは null）。末尾の全角/半角スペースは無視する（管理画面の「対応エリア・出張費 」対策）。 */
function v2ParseLegacyText_(text) {
  const t = String(text || '').replace(/[\s　]+$/, '');
  const m = V2_LEGACY_TEXTS[t];
  return m ? { v: 1, flow: m.flow, step: m.step, act: m.act, val: m.val || '', q: '', raw: t, legacyText: t } : null;
}

/* ── セッション（CacheService 主・Sheets バックアップ）── */
function v2SessionKey_(userId) { return 'v2sess_' + userId; }
function getSessionsSheet_() {
  const ssId = PropertiesService.getScriptProperties().getProperty('INQUIRY_SHEET_ID');
  if (!ssId) return null;
  const ss = SpreadsheetApp.openById(ssId);
  let sh = ss.getSheetByName('sessions');
  if (!sh) { sh = ss.insertSheet('sessions'); sh.appendRow(SESSION_COLS); sh.setFrozenRows(1); }
  return sh;
}
function v2GetSession_(userId) {
  if (!userId) return null;
  const raw = CacheService.getScriptCache().get(v2SessionKey_(userId));
  if (raw) { try { return JSON.parse(raw); } catch (e) {} }
  // Cache が消えていたら Sheets から復元（6時間以内のものだけ）
  try {
    const sh = getSessionsSheet_();
    if (!sh) return null;
    const data = sh.getDataRange().getValues();
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][0]) === userId) {
        const upd = data[r][5] ? new Date(data[r][5]).getTime() : 0;
        if (!data[r][1] || Date.now() - upd > V2_SESSION_TTL_SEC * 1000) return null;
        const s = { flow: data[r][1], step: Number(data[r][2]) || 0, intent: data[r][3] || '', data: {} };
        try { s.data = JSON.parse(data[r][4] || '{}'); } catch (e) {}
        CacheService.getScriptCache().put(v2SessionKey_(userId), JSON.stringify(s), V2_SESSION_TTL_SEC);
        return s;
      }
    }
  } catch (e) {}
  return null;
}
function v2SetSession_(userId, s) {
  if (!userId) return;
  CacheService.getScriptCache().put(v2SessionKey_(userId), JSON.stringify(s), V2_SESSION_TTL_SEC);
  v2WriteSessionRow_(userId, s);
}
function v2ClearSession_(userId) {
  if (!userId) return;
  CacheService.getScriptCache().remove(v2SessionKey_(userId));
  v2WriteSessionRow_(userId, null);
}
function v2WriteSessionRow_(userId, s) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sh = getSessionsSheet_();
    if (!sh) return;
    const row = [userId, s ? s.flow : '', s ? s.step : '', s ? (s.intent || '') : '', s ? JSON.stringify(s.data || {}) : '', new Date()];
    const data = sh.getDataRange().getValues();
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][0]) === userId) { sh.getRange(r + 1, 1, 1, row.length).setValues([row]); return; }
    }
    sh.appendRow(row);
  } catch (e) {} finally { try { lock.releaseLock(); } catch (e) {} }
}

/* ── お客さま番号（§10-6）。users タブの cust_no 列。無ければ列を足して採番する ── */
function v2CustNo_(userId) {
  if (!userId) return '';
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sh = getUsersSheet_();
    if (!sh) return '';
    const header = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
    let col = header.indexOf('cust_no');
    if (col === -1) { col = header.length; sh.getRange(1, col + 1).setValue('cust_no'); }
    const data = sh.getDataRange().getValues();
    let maxNo = 0, row = -1;
    for (let r = 1; r < data.length; r++) {
      const v = String(data[r][col] || '');
      const n = v.indexOf('C') === 0 ? parseInt(v.slice(1), 10) : NaN;
      if (!isNaN(n) && n > maxNo) maxNo = n;
      if (String(data[r][0]) === userId) { row = r + 1; if (v) return v; }
    }
    const no = 'C' + (maxNo + 1);
    if (row === -1) { setUserFields_(userId, {}); return v2CustNo_(userId); }
    sh.getRange(row, col + 1).setValue(no);
    return no;
  } catch (e) { return ''; } finally { try { lock.releaseLock(); } catch (e) {} }
}

/* ── postback の入口（handlePostback_ から呼ぶ）。処理したら true ── */
function v2HandlePostback_(event, userId, pb) {
  const s = v2GetSession_(userId);
  const tag = 'v2:' + pb.flow + '/' + pb.step + '/' + pb.act + (pb.val ? '/' + pb.val : '') + (pb.legacy ? '(旧' + pb.legacy + ')' : '');

  // menu フロー = 現在のセッションに対する操作（§9-2）。step は見ない
  if (pb.flow === 'menu') {
    if (pb.act === 'consult') { replyInquiry(event); logEvent_(event, tag, '返信:担当者に相談（手動対応ON）'); return true; }
    if (pb.act === 'stop') { v2ClearSession_(userId); v2LinkMenu_(userId, 'normal'); v2ReplyText_(event, '中断しました。また最初からご利用いただけます🚲'); logEvent_(event, tag, '返信:中断'); return true; }
    if (pb.act === 'reset') {
      if (!s) { v2ReplyReselect_(event); logEvent_(event, tag, '返信:選び直し（セッション無し）'); return true; }
      v2StartFlow_(event, userId, s.flow, s.intent); logEvent_(event, tag, '返信:最初から'); return true;
    }
    if (pb.act === 'back') {
      if (!s || s.step <= 1) { v2ReplyReselect_(event); logEvent_(event, tag, '返信:選び直し（戻れない）'); return true; }
      s.step -= 1; v2SetSession_(userId, s); v2Prompt_(event, userId, s); logEvent_(event, tag, '返信:ひとつ戻る→' + s.step); return true;
    }
    v2ReplyReselect_(event); logEvent_(event, tag, '返信:選び直し'); return true;
  }

  // step 0 の next = フロー開始。進行中のセッションがあっても、通常時メニューからの開始は「やり直し」として受ける
  if (pb.step === 0 && pb.act === 'next') {
    if (pb.flow === 'area') { replyArea(event.replyToken); setExpectCity_(userId, 'area'); logEvent_(event, tag, '返信:対応エリア'); return true; }
    if (pb.flow === 'faq') { replyFaq_(event.replyToken); logEvent_(event, tag, '返信:FAQ'); return true; }
    v2StartFlow_(event, userId, pb.flow, pb.val); logEvent_(event, tag, '返信:開始'); return true;
  }

  // F-3 状態ガード: セッションの flow/step と一致しなければ進めない
  if (!s || s.flow !== pb.flow || s.step !== pb.step) {
    v2ReplyReselect_(event);
    logEvent_(event, tag, '返信:選び直し（不一致 ' + (s ? s.flow + '/' + s.step : 'なし') + '）');
    return true;
  }
  v2Advance_(event, userId, s, pb);
  logEvent_(event, tag, '返信:進行→' + s.flow + '/' + s.step);
  return true;
}

/* ── フローの骨組み（本文は段階2で差し替える）── */
function v2StartFlow_(event, userId, flow, intent) {
  const s = { flow: flow, step: 1, intent: intent || '', data: {} };
  v2SetSession_(userId, s);
  v2LinkMenu_(userId, 'inflow');
  v2Prompt_(event, userId, s);
}
/** 現在の step の案内を返す（段階1は動作確認用の仮文） */
function v2Prompt_(event, userId, s) {
  const label = s.flow === 'satei' ? (s.intent === 'shobun' ? '処分・引取' : '買取') : s.flow === 'battery' ? 'バッテリー診断' : s.flow;
  v2ReplyText_(event, '【開発中】' + label + 'の案内 ' + s.step + '番目です。\n下のメニューの「ひとつ戻る」「最初からやり直す」「やめる」で動作を確認できます。');
}
/** step を1つ進める（段階1は仮。段階2で val ごとの分岐を入れる） */
function v2Advance_(event, userId, s, pb) {
  s.data = s.data || {};
  s.data['step' + s.step] = pb.val;
  s.step += 1;
  v2SetSession_(userId, s);
  v2Prompt_(event, userId, s);
}
function v2ReplyReselect_(event) {
  v2ReplyText_(event, 'このボタンは今は使えません。下の「メニューを開く／閉じる」から選び直してください🚲');
}
function v2ReplyText_(event, text) {
  if (event.replyToken) reply(event.replyToken, [{ type: 'text', text: text }]);
}
