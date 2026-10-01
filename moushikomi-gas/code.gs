/* =========================================================
   めぐり自転車 申込フォーム受付（2026-09-30 作成）
   /moushikomi/ のフォーム（GitHub Pages）からの送信だけを受ける専用 GAS。
   LINE ボットの Webhook とは別プロジェクトにしている（公開ページに受信先の URL が載るため、
   LINE のイベントを送り込まれる入口を作らない。2026-09-30 オーナー決定）。

   流れ：LINE ボットが「この金額で決定」のときにトークンを発行し、問い合わせシートの「申込トークン」に書く
        → お客様がフォームから送信 → ここでトークンを照合 → 同じスプレッドシートの「申込」に1行追加
        → トークンを使用済みにする → Discord に「申込が来た」とだけ通知（個人情報は載せない）

   2026-10-01 オーナー指示：申込は問い合わせシートのタブではなく、専用のスプレッドシート「めぐり自転車_申込（防犯登録）」に入れる
   （トークンは今までどおり問い合わせシートの「申込トークン」）。初回の setup／送信で自動で作り、ID を APPLY_SHEET_ID に保存する。
   スクリプト プロパティ（コードにもリポジトリにも値を書かない）
     SHEET_IDS            … トークンを探すスプレッドシートの ID（カンマ区切り。本番と開発の問い合わせシート）
     APPLY_SHEET_ID       … 申込の保存先（自動で入る）
     DISCORD_WEBHOOK_URL  … 通知先（LINE ボットと同じもの）
   初回は setup を ▶ 実行して権限を承認する。
   ========================================================= */
const TOKEN_SHEET = '申込トークン';
const APPLY_SHEET = '申込';
const TOKEN_TTL_DAYS = 30;
const APPLY_COLS = ['受付日時', '顧客番号', 'LINE userId', '見積ID', '氏名', 'フリガナ', '電話', '郵便番号', '住所', 'お伺い先（住所と違う場合）', '第1希望', '第2希望', '第3希望',
  '防犯登録の状態', '名義区分', '名義人氏名', '続柄', '変わったこと', '候補：当時の住所', '候補：当時のお名前', '候補：当時の電話', '同意',
  '照会結果', '一致した組み合わせ', '照会日時', '対応'];   // 照会結果〜対応はオーナーが電話照会のあとに手で入れる
const LABEL = {
  bohan: { registered: '登録している', deleted: '抹消済み', none: '登録していない', unknown: 'わからない' },
  owner: { self: '自分', family: '家族', prev: '前の持ち主', unknown: 'わからない' },
  change: { move: '引っ越し', name: '名字', tel: '電話番号', none: '変わっていない', unknown: 'わからない' },
};

function setup() {
  const ids = sheetIds_();
  if (!ids.length) throw new Error('スクリプト プロパティ SHEET_IDS を設定してから実行してください');
  const book = applyBook_();
  Logger.log('申込の保存先：' + book.getName() + ' ' + book.getUrl());
  if (!PropertiesService.getScriptProperties().getProperty('DISCORD_WEBHOOK_URL')) Logger.log('DISCORD_WEBHOOK_URL が未設定です（通知なしで動きます）');
  Logger.log('OK ' + ids.length + ' 件のスプレッドシートを確認しました');
}

/** GET ?check=<token> … フォームを開いたときにトークンが使えるかだけを返す（個人情報は返さない） */
function doGet(e) {
  const t = String((e && e.parameter && e.parameter.check) || '');
  const hit = t ? findToken_(t) : null;
  const ok = !!(hit && !hit.used && !hit.expired);
  // hint：ボットでの防犯登録の答え（yes／seal だけ返す。個人情報は返さない）。フォームが「防犯登録はありますか？」を省くのに使う
  const hint = ok ? ({ bohan_yes: 'yes', bohan_seal: 'seal' }[hit.lineBohan] || '') : '';
  return json_({ ok: ok, reason: !hit ? 'token' : hit.used ? 'used' : hit.expired ? 'expired' : '', hint: hint });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, reason: 'bad' }); }
  if (!body || body.type !== 'moushikomi') return json_({ ok: false, reason: 'bad' });
  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (err) { return json_({ ok: false, reason: 'busy' }); }
  try {
    const hit = findToken_(String(body.t || ''));
    if (!hit) return json_({ ok: false, reason: 'token' });
    if (hit.used) return json_({ ok: false, reason: 'used' });
    if (hit.expired) return json_({ ok: false, reason: 'expired' });
    const v = normalize_(body);
    if (v.error) return json_({ ok: false, reason: 'input', field: v.error });
    const d = v.data;
    const row = [new Date(), hit.custNo, hit.userId, hit.quoteId, d.name, d.kana, d.tel, d.zip, d.addr, d.visit, d.wish[0] || '', d.wish[1] || '', d.wish[2] || '',
      LABEL.bohan[d.bohan], d.owner ? LABEL.owner[d.owner] : '', d.ownerName, d.ownerRel,
      d.changes.map(function (c) { return LABEL.change[c]; }).join('・'),
      d.oldAddrs.join('\n'), d.oldNames.join('\n'), d.oldTels.join('\n'), '同意する', '', '', '', ''];
    const book = applyBook_();
    const ash = applySheet_(book);
    ash.appendRow(row.map(safeCell_));
    // Discord から、その行をすぐ開けるリンク（2026-10-01 オーナー指示）
    const rowUrl = 'https://docs.google.com/spreadsheets/d/' + book.getId() + '/edit#gid=' + ash.getSheetId() + '&range=A' + ash.getLastRow();
    hit.sheet.getRange(hit.row, 6).setValue(new Date());   // 使用日時
    notify_(hit, d, rowUrl);
    return json_({ ok: true });
  } catch (err) {
    console.error('doPost ' + err);
    return json_({ ok: false, reason: 'error' });
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

/* ── 入力の検証と整形（フォーム側と同じ条件。空・長すぎ・形式違いは受け付けない） ── */
function normalize_(b) {
  const s = function (x, max) { return String(x == null ? '' : x).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 100); };
  const list = function (x, max) { return (Array.isArray(x) ? x : []).map(function (y) { return s(y, max); }).filter(Boolean).slice(0, 5); };
  const d = {
    name: s(b.name, 40), kana: s(b.kana, 60), tel: s(b.tel, 20).replace(/[^\d-]/g, ''), zip: s(b.zip, 8).replace(/\D/g, ''),
    addr: s(b.addr, 120), visit: s(b.visit, 120), bohan: s(b.bohan, 20), owner: s(b.owner, 20), ownerName: s(b.ownerName, 40), ownerRel: s(b.ownerRel, 20),
    changes: list(b.changes, 20).filter(function (c) { return LABEL.change[c]; }),
    oldAddrs: list(b.oldAddrs, 120), oldNames: list(b.oldNames, 40), oldTels: list(b.oldTels, 20),
  };
  // 希望日時（2026-10-01）：3つまで、第1希望は必須。日付は今日以降、時間帯は決まった選択肢だけ。保存は「10/5(日) 午前」の形
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const TIMES = ['午前', '午後', '夕方以降', '何時でも', '時間を指定'];
  d.wish = [];
  const wishes = (Array.isArray(b.wish) ? b.wish : []).slice(0, 3);
  for (let i = 0; i < wishes.length; i++) {
    const w = wishes[i] || {}; const ds = s(w.d, 10); const ts = s(w.t, 10); const xs = ts === '時間を指定' ? s(w.x, 30) : '';
    if (!ds && !ts) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ds) || ds < today || TIMES.indexOf(ts) === -1 || (ts === '時間を指定' && !xs)) return { error: 'd' + (i + 1) };
    const y = Number(ds.slice(0, 4)), m = Number(ds.slice(5, 7)), day = Number(ds.slice(8, 10));
    d.wish.push(m + '/' + day + '(' + '日月火水木金土'.charAt(new Date(Date.UTC(y, m - 1, day)).getUTCDay()) + ') ' + (xs || ts));
  }
  if (!d.wish.length) return { error: 'd1' };
  if (d.changes.length > 1) d.changes = d.changes.filter(function (c) { return c !== 'none'; });   // 「変わっていない」はほかと両立しない
  if (!d.name) return { error: 'name' };
  if (!d.kana) return { error: 'kana' };
  const telDigits = d.tel.replace(/\D/g, '');
  if (telDigits.length < 10 || telDigits.length > 11) return { error: 'tel' };
  if (d.zip.length !== 7) return { error: 'zip' };
  if (!d.addr) return { error: 'addr' };
  if (!LABEL.bohan[d.bohan]) return { error: 'bohan' };
  const needOwner = d.bohan === 'registered' || d.bohan === 'unknown';   // 名義と変わったことは、登録している／わからないときだけ聞く
  if (needOwner) {
    if (!LABEL.owner[d.owner]) return { error: 'owner' };
    if (d.owner === 'family' && (!d.ownerName || !d.ownerRel)) return { error: 'ownerName' };
    if (!d.changes.length) return { error: 'changes' };
    if (d.changes.indexOf('move') !== -1 && !d.oldAddrs.length) return { error: 'oldAddrs' };
    if (d.changes.indexOf('name') !== -1 && !d.oldNames.length) return { error: 'oldNames' };
    if (d.changes.indexOf('tel') !== -1 && !d.oldTels.length) return { error: 'oldTels' };
  } else {
    d.owner = ''; d.ownerName = ''; d.ownerRel = ''; d.changes = []; d.oldAddrs = []; d.oldNames = []; d.oldTels = [];
  }
  if (d.owner !== 'family') { d.ownerName = ''; d.ownerRel = ''; }
  if (d.changes.indexOf('move') === -1) d.oldAddrs = [];
  if (d.changes.indexOf('name') === -1) d.oldNames = [];
  if (d.changes.indexOf('tel') === -1) d.oldTels = [];
  if (b.consent !== true) return { error: 'consent' };
  return { data: d };
}

/* ── トークン ── */
function sheetIds_() {
  return String(PropertiesService.getScriptProperties().getProperty('SHEET_IDS') || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
}
/** 列：token／顧客番号／userId／見積ID／発行日時／使用日時（LINE ボットの v2MoushikomiUrl_ が書く） */
function findToken_(t) {
  if (!/^[0-9a-f]{32}$/.test(t)) return null;
  const ids = sheetIds_();
  for (let i = 0; i < ids.length; i++) {
    let ss; try { ss = SpreadsheetApp.openById(ids[i]); } catch (e) { continue; }
    const sh = ss.getSheetByName(TOKEN_SHEET);
    if (!sh) continue;
    const data = sh.getDataRange().getValues();
    for (let r = data.length - 1; r >= 1; r--) {
      if (String(data[r][0]) !== t) continue;
      const issued = data[r][4] ? new Date(data[r][4]).getTime() : 0;
      return {
        ss: ss, sheet: sh, row: r + 1, custNo: String(data[r][1] || ''), userId: String(data[r][2] || ''), quoteId: String(data[r][3] || ''),
        lineBohan: String(data[r][6] || ''), used: !!data[r][5], expired: !issued || Date.now() - issued > TOKEN_TTL_DAYS * 86400000,
      };
    }
  }
  return null;
}

/* ── シート・通知・応答 ── */
const APPLY_BOOK_NAME = 'めぐり自転車_申込（防犯登録）';
/** 申込の保存先（専用のスプレッドシート）。無ければ作り、問い合わせシートに残っている「申込」タブの行を移す */
function applyBook_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('APPLY_SHEET_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { console.error('APPLY_SHEET_ID が開けない ' + e); } }
  const book = SpreadsheetApp.create(APPLY_BOOK_NAME);
  const first = book.getSheets()[0];
  first.setName(APPLY_SHEET); first.appendRow(APPLY_COLS); first.setFrozenRows(1);
  props.setProperty('APPLY_SHEET_ID', book.getId());
  migrateOldApplyTabs_(first);
  return book;
}
/** 問い合わせシートの古い「申込」タブ → 新しい保存先へ、見出し名で列を合わせて行を写す。写し終えたタブは名前を変えて残す（消すのは人が判断） */
function migrateOldApplyTabs_(dest) {
  sheetIds_().forEach(function (sid) {
    try {
      const sh = SpreadsheetApp.openById(sid).getSheetByName(APPLY_SHEET);
      if (!sh) return;
      const data = sh.getDataRange().getValues();
      const head = data[0] || [];
      for (let r = 1; r < data.length; r++) {
        if (!data[r].some(function (v) { return v !== ''; })) continue;
        dest.appendRow(APPLY_COLS.map(function (c) { const i = head.indexOf(c); return i === -1 ? '' : data[r][i]; }));
      }
      sh.setName(APPLY_SHEET + '（移動済み・削除してよい）');
    } catch (e) { console.error('migrateOldApplyTabs_ ' + e); }
  });
}
function applySheet_(ss) {
  let sh = ss.getSheetByName(APPLY_SHEET);
  if (!sh) { sh = ss.insertSheet(APPLY_SHEET); sh.appendRow(APPLY_COLS); sh.setFrozenRows(1); return sh; }
  // 列を足したとき（2026-10-01 希望日時）：まだ1件も無ければ見出しを今の列に書き直す。データがあるときは触らない（列ずれは人が直す）
  if (sh.getLastRow() <= 1) {
    const head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
    if (head.join('|') !== APPLY_COLS.join('|')) { sh.clear(); sh.appendRow(APPLY_COLS); sh.setFrozenRows(1); }
  } else if (sh.getLastColumn() !== APPLY_COLS.length) {
    console.error('applySheet_: 「' + APPLY_SHEET + '」の列数が ' + sh.getLastColumn() + '（今のコードは ' + APPLY_COLS.length + '）');
  }
  return sh;
}
/** 数式として解釈されないように（=,+,-,@ で始まる入力） */
function safeCell_(v) {
  return (typeof v === 'string' && /^[=+\-@]/.test(v)) ? "'" + v : v;
}
function notify_(hit, d, rowUrl) {
  const url = PropertiesService.getScriptProperties().getProperty('DISCORD_WEBHOOK_URL');
  if (!url) return;
  const text = '📝 申込フォーム受付 ' + hit.custNo + (hit.quoteId ? '（' + hit.quoteId + '）' : '') + '\n'
    + '第1希望: ' + d.wish[0] + (d.wish.length > 1 ? '（ほか' + (d.wish.length - 1) + '件）' : '') + '\n'
    + '防犯登録: ' + LABEL.bohan[d.bohan] + (d.owner ? '／名義: ' + LABEL.owner[d.owner] : '')
    + (d.changes.length ? '／変わったこと: ' + d.changes.map(function (c) { return LABEL.change[c]; }).join('・') : '') + '\n'
    + (d.bohan === 'deleted' ? '→ 削除カードの写真を LINE で待つ（無ければシールの番号で照会）\n' : d.bohan === 'none' ? '→ 購入証明の写真を LINE で待つ（現地でシールやはがした跡があれば照会）\n' : '')
    + '→ ' + (d.bohan === 'registered' || d.bohan === 'unknown' ? '電話照会：' : '申込の行：') + (rowUrl || '「' + APPLY_BOOK_NAME + '」');
  try {
    UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify({ content: text.slice(0, 1900), allowed_mentions: { parse: [] } }) });
  } catch (e) { console.error('notify_ ' + e); }
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
