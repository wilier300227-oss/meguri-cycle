/**
 * めぐり自転車 LINE公式アカウント 自動応答ボット
 * Google Apps Script (GAS) 用
 *
 * ── 機能 ──
 * 1. リッチメニュー「買取査定」「出張引取」→ 受付＋必要事項＋写真ガイドを2通で返信
 * 2. リッチメニュー「写真を送る」→ 撮影ガイド7枚＋カメラボタンを返信
 * 3. 「電動」→ 電動アシスト用の追加ガイドを返信
 * 4. 画像を受信 → お客さまへの自動応答はせず、記録＋オーナー通知のみ（返信は手動）
 * 5. 「買取希望」「処分希望」「対応エリア・出張費」→ それぞれの案内を返信
 * 5-2.「査定を申し込む」（入力完了ボタン）→ 必要事項の確認リスト（漏れは追記）＋条件付き確定額＋48時間以内 を返信
 * 5-3.「お問い合わせ」（問い合わせボタン）→ 質問記入を促す＋手動対応モードON（人が対応）
 * 6. 「対応エリア・出張費」ボタン／「買取希望」「処分希望」の案内を出した直後だけ、
 *    市区町村を送ると その地域の出張費目安を返信。有効なのは案内タップ直後の
 *    「最大2メッセージ」まで（EXPECT_CITY_MSG_BUDGET／CacheServiceで60分TTL）。
 *    さらに §4-1：買取意向なら出張費を出さない（無料のみ）・疑問文には料金を返さず人へ回す。
 *    ※ 住所などに市町名が含まれても誤って料金を出さないよう、常時検出する運用は廃止。
 * 7. その他（分類不能）→ 顧客へは自動応答せず（受付文は問い合わせボタン時のみ）、オーナー通知＋手動対応モードON（§5-3）
 *    ※ 評価順の最上位に 停止フラグ(opt_out §5-2) → 手動対応モード(manual_mode §5-1) を判定。
 *      いずれもONの間は自動応答を止め、ログ・オーナー通知のみ継続。状態は Sheets(users) に永続化。
 *      全受信は log シートに記録、webhookEventId で二重処理を防止（§5-6/§5-7）。
 * 8. Googleロコミ依頼：現在は【手動運用】（REVIEW_AUTO_ENABLED=false）。送る相手・
 *    タイミングはケースバイケースのため、オーナーが LINE公式アカウントアプリの1:1チャットから
 *    手動で送る。文面は定数 REVIEW_MESSAGE_TEXT（アプリの「定型文」に登録推奨）。
 *    ※ REVIEW_AUTO_ENABLED=true にすると従来の自動運用（写真受信から REVIEW_REQUEST_DELAY_DAYS
 *      日後に自動プッシュ、キャンセル系キーワードで自動取消）に戻る（installReviewTrigger 再実行）。
 * 9. 「写真送信」「買取査定/出張引取の申し込み」「初回メッセージ」を中央スプレッドシート
 *    （inquiry-sync.gs が使っているものと同じ）に記録し、オーナー個人のLINEに通知
 *
 * ── 設定 ──
 * CHANNEL_ACCESS_TOKEN に LINE Developers コンソールで発行した
 * 「チャネルアクセストークン（長期）」を貼り付けてください。
 * GOOGLE_REVIEW_URL に Googleビジネスプロフィール承認後の口コミ投稿リンクを貼り付けてください。
 * OWNER_LINE_USER_ID に、あなた個人のLINEのuserIdを貼り付けてください。
 *   取得方法：あなた個人のLINEで「めぐり自転車」を友だち追加し、"MYID" と送信すると
 *   あなたのuserIdが返信されます。それをコピーして貼り付けてください。
 * レビュー依頼は現在【手動運用】（REVIEW_AUTO_ENABLED=false）のため、日次トリガーは不要。
 *   既に自動運用のトリガーを作成済みなら、GAS エディタで uninstallReviewTrigger() を1回実行して削除する。
 *   将来また自動運用に戻す場合のみ REVIEW_AUTO_ENABLED=true にして installReviewTrigger() を実行する。
 */

const CHANNEL_ACCESS_TOKEN = 'ここにチャネルアクセストークンを貼り付け';

/** オーナー個人のLINEのuserId（新規問い合わせの通知先）。取得方法は上記コメント参照 */
const OWNER_LINE_USER_ID = 'ここに自分のuserIdを貼り付け';

/** Googleビジネスプロフィールの「口コミを書く」リンク（承認後、共有リンクに差し替え） */
const GOOGLE_REVIEW_URL = 'ここにGoogleビジネスプロフィールの口コミ投稿リンクを貼り付け';

/**
 * レビュー依頼の自動送信を行うか。
 * false＝手動運用（送る相手・タイミングはケースバイケースのため、オーナーが
 *   LINE公式アカウントアプリの1:1チャットから手動で送る。文面は REVIEW_MESSAGE_TEXT を
 *   コピーして使う／アプリの「定型文」に登録しておくと便利）。写真受信時のキュー登録も
 *   自動送信もスキップされる。
 * true＝従来の自動運用（写真受信から REVIEW_REQUEST_DELAY_DAYS 日後に自動プッシュ）。
 *   true に戻す場合は GAS エディタで installReviewTrigger() を再実行すること。
 */
const REVIEW_AUTO_ENABLED = false;

/** レビュー依頼の文面（自動送信でも、手動コピー用でも使う共通テキスト） */
const REVIEW_MESSAGE_TEXT = [
  'この度はめぐり自転車をご利用いただきありがとうございました🚲',
  '',
  'もしご満足いただけましたら、今後のサービス向上のためGoogleロコミにひとこといただけると励みになります。',
  GOOGLE_REVIEW_URL,
  '',
  '（まだお取引が完了していない場合はこのメッセージは読み流してください）',
].join('\n');

/** 写真受信から何日後にレビュー依頼を送るか（自動運用時のみ有効。査定回答48h＋日程調整＋訪問を見込んだ日数） */
const REVIEW_REQUEST_DELAY_DAYS = 10;

/** これらの語を含むメッセージが来たら、そのユーザーへのレビュー依頼を取り消す（不成立の低評価対策） */
const REVIEW_CANCEL_KEYWORDS = ['キャンセル', 'やめ', '見送り', '他で決め', '結構です', '不成立', 'なしで'];

/** 出張費の目安表（サイトの料金表と合わせること） */
const AREA_FEE_TEXT = [
  '【出張費の目安（かほく市役所起点・Googleマップの走行距離）】',
  '・〜10km：1,000円',
  '・10〜20km：1,500円',
  '・20〜30km：2,000円',
  '・30〜40km：2,500円',
  '・40〜50km：3,000円',
  '・50km超：応相談',
].join('\n');

/**
 * 出張費の単一源（handoff §5-4）。実データは Sheets の fee_master シート
 * （列：市町名 / 出張費 / 対応可否 / 備考）。未設定時は下の DEFAULT_FEES にフォールバック。
 * 金額は単一額のみ（レンジ表記は禁止＝§10-3）。遠方・エリア外は '要相談'。
 * ⚠ 金額は暫定。GASエディタで initFeeMaster_() を1回実行して fee_master を作り、
 *   実測（かほく市役所起点の走行距離）で各額を確定すること（§改修3）。
 */
const DEFAULT_FEES = {
  // 近くて距離がほぼ一定の町＝単一額（かほく市役所起点・Googleマップ走行距離の目安）
  'かほく市': '1,000円', '津幡町': '1,000円', '宝達志水町': '1,000円', '内灘町': '1,500円',
  '羽咋市': '2,000円', '野々市市': '2,000円', '野々市': '2,000円',
  '能美市': '2,500円', '川北町': '2,500円', '志賀町': '2,500円', '中能登町': '2,500円',
  // 大きい市＝場所で距離が変わるため 要相談（町名を伺って個別に確定）
  '金沢市': '要相談', '白山市': '要相談', '七尾市': '要相談', '小松市': '要相談', '加賀市': '要相談',
  '輪島市': '要相談', '珠洲市': '要相談', '穴水町': '要相談', '能登町': '要相談',
  // 富山・福井はエリア外＝要相談（§5-4／サイトの「富山・福井は応相談」と統一）
  '氷見市': '要相談', '高岡市': '要相談', '小矢部市': '要相談', '射水市': '要相談', '砺波市': '要相談',
  '富山市': '要相談', '南砺市': '要相談',
};
function defaultFeeMap_() {
  const m = {};
  Object.keys(DEFAULT_FEES).forEach(function (c) {
    m[c] = { fee: DEFAULT_FEES[c], ok: DEFAULT_FEES[c] === '要相談' ? '要相談' : '可' };
  });
  return m;
}
/** fee_master を読み（5分キャッシュ）、{city:{fee, ok}} を返す。未設定/空なら DEFAULT_FEES */
function getFeeMasterMap_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('fee_master_map');
  if (cached) { try { return JSON.parse(cached); } catch (e) {} }
  let map = {};
  try {
    const ssId = PropertiesService.getScriptProperties().getProperty('INQUIRY_SHEET_ID');
    if (ssId) {
      const sh = SpreadsheetApp.openById(ssId).getSheetByName('fee_master');
      if (sh) {
        const data = sh.getDataRange().getValues();
        for (let r = 1; r < data.length; r++) {
          const city = String(data[r][0]).trim();
          if (city) map[city] = { fee: String(data[r][1]).trim(), ok: String(data[r][2] || '可').trim() };
        }
      }
    }
  } catch (e) {}
  if (!Object.keys(map).length) map = defaultFeeMap_();
  cache.put('fee_master_map', JSON.stringify(map), 300);
  return map;
}
function getFee_(city) { const m = getFeeMasterMap_(); return m[city] || null; }
/** 初回セットアップ：fee_master シートを DEFAULT_FEES で作成（GASエディタで1回実行→額を確定） */
function initFeeMaster_() {
  const ssId = PropertiesService.getScriptProperties().getProperty('INQUIRY_SHEET_ID');
  if (!ssId) throw new Error('INQUIRY_SHEET_ID 未設定。問い合わせ記録を1件作るか、プロパティに設定してから実行してください。');
  const ss = SpreadsheetApp.openById(ssId);
  let sh = ss.getSheetByName('fee_master');
  if (!sh) sh = ss.insertSheet('fee_master');
  sh.clear();
  sh.appendRow(['市町名', '出張費', '対応可否', '備考']);
  sh.setFrozenRows(1);
  Object.keys(DEFAULT_FEES).forEach(function (c) {
    const talk = DEFAULT_FEES[c] === '要相談';
    sh.appendRow([c, talk ? '' : DEFAULT_FEES[c], talk ? '要相談' : '可', '要確認（実測で確定）']);
  });
  CacheService.getScriptCache().remove('fee_master_map');
}

/**
 * 初回セットアップ（公開関数：GASエディタの実行プルダウンから選んで▶実行）。
 * ※ 末尾が「_」の関数はプルダウンに出ないため、この公開関数から呼ぶ。
 * 中央スプレッドシートを用意し、log / users / fee_master タブを作成する。
 */
function setupLineSheets() {
  getInquirySheet_();  // 中央シート＋問い合わせタブ（INQUIRY_SHEET_ID を設定）
  getLogSheet_();      // log タブ
  getUsersSheet_();    // users タブ
  initFeeMaster_();    // fee_master タブ（暫定額。あとで実測で確定）
  const id = PropertiesService.getScriptProperties().getProperty('INQUIRY_SHEET_ID');
  Logger.log('セットアップ完了。INQUIRY_SHEET_ID=' + id);
  return 'OK INQUIRY_SHEET_ID=' + id;
}
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    (body.events || []).forEach(handleEvent);
  } catch (err) {
    console.error(err);
  }
  return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleEvent(event) {
  // 5-6: LINEの再送などによる二重処理を防ぐ（webhookEventId で冪等化）
  if (isDuplicateEvent_(event)) return;

  // リッチメニューの postback アクション（§6-2）。メッセージ送信アクションでも動くよう両対応。
  if (event.type === 'postback') { handlePostback_(event, event.source && event.source.userId); return; }

  if (event.type !== 'message') { logEvent_(event, '(' + event.type + ')', 'NONE'); return; }
  const msg = event.message;
  const userId = event.source && event.source.userId;
  const text = (msg && msg.type === 'text') ? String(msg.text || '').trim() : '';

  // 開発用：MYID は最優先で常に通す
  if (text === 'MYID') {
    reply(event.replyToken, [{ type: 'text', text: 'あなたのuserId:\n' + userId }]);
    logEvent_(event, 'MYID', 'userId返信');
    return;
  }

  // 評価順の最上位（handoff §5-3）：停止フラグ → 手動対応モード
  const st = getUserState_(userId);
  // 1. 停止フラグ（§5-2）：明示的な再依頼だけ解除。それ以外は営業応答しない。
  if (isOptedOut_(st)) {
    if (isExplicitReRequest_(text)) {
      setUserFields_(userId, { opt_out: '', opt_out_reason: '（顧客の再依頼で解除）' });
    } else {
      handleOptedOut_(event, userId, msg, text);
      logEvent_(event, 'OPT_OUT', 'NONE（通知/1文）');
      return;
    }
  }
  // 2. 手動対応モード（§5-1）：全自動応答を停止し、通知のみ。
  //    ただし自動応答系ボタンを押し直したら解除して通常応答に戻す（§5-1 リセット）。
  if (isManualMode_(st)) {
    if (isManualResetText_(text)) {
      clearManualMode_(userId);
      logEvent_(event, 'MANUAL_RESET', text);
    } else {
      notifyManualIncoming_(event, userId, msg, text, '💬 手動対応中の新着');
      logEvent_(event, 'MANUAL_MODE', 'NONE（通知のみ）');
      return;
    }
  }

  if (msg.type === 'text') {
    if (REVIEW_AUTO_ENABLED && userId && REVIEW_CANCEL_KEYWORDS.some(function (kw) { return text.indexOf(kw) !== -1; })) {
      skipReviewRequest_(userId);
    }

    let rule = 'UNMATCHED';
    if (detectOptOut_(text)) {
      // §5-2：停止希望を検知 → 以後は営業しない（再勧誘禁止）
      setOptOut_(userId, text);
      reply(event.replyToken, [{ type: 'text', text: '承知しました。ご案内を停止します。またご利用の際は、下のメニューからお声がけください🚲' }]);
      notifyManualIncoming_(event, userId, msg, '【停止希望】' + text, '⛔ 停止希望');
      rule = 'OPT_OUT_SET';
    } else if (text === '写真をおくります。' || text === '写真をおくります' || text === '写真を送ります') {
      replyPhotoGuide(event.replyToken); rule = '写真ガイド';
    } else if (text === '電動') {
      replyEbikeGuide(event.replyToken); rule = '電動ガイド';
    } else if (text === '買取査定を申し込みます') {
      replyKaitoriApply(event.replyToken, userId); rule = '買取査定申込';
    } else if (text === '出張引取を申し込みます') {
      replyHikitoriApply(event.replyToken, userId); rule = '出張引取申込';
    } else if (text === '買取希望') {
      replyKaitori(event.replyToken); setExpectCity_(userId, 'buy'); rule = '買取希望案内';
    } else if (text === '処分希望') {
      replyShobun(event.replyToken); setExpectCity_(userId, 'shobun'); rule = '処分希望案内';
    } else if (text === '対応エリア・出張費' || text === '対応エリア' || text === 'エリア') {
      replyArea(event.replyToken); setExpectCity_(userId, 'area'); rule = 'エリア案内';
    } else if (text === '査定を申し込む' || text === '査定をお願いします' || text === '入力完了' ||
               text.indexOf('査定を申し込む') !== -1 ||
               text.indexOf('査定をお願い') !== -1 || text.indexOf('査定お願い') !== -1) {
      replyEstimateRequest(event); rule = '査定依頼';
    } else if (text === 'お問い合わせ' || text === '問い合わせ' || text === '担当者に相談' ||
               text.indexOf('問い合わせ') !== -1 || text.indexOf('問合せ') !== -1) {
      replyInquiry(event); rule = '問い合わせ';
    } else if (text === 'よくある質問' || text === 'FAQ') {
      replyFaq_(event.replyToken); rule = 'FAQ';
    } else if (text === '写真を追加する' || text === '写真を追加') {
      replyPhotoGuide(event.replyToken); rule = '写真追加';
    } else if (text === '台数を追加する' || text === '台数を追加') {
      replyAddVehicle_(event.replyToken); rule = '台数追加';
    } else if (text === '進捗を確認' || text === '進捗確認') {
      replyStaffFollowup_(event, userId, '進捗のご確認'); rule = '進捗確認';
    } else if (text === '日程を変更したい' || text === '日程変更') {
      replyStaffFollowup_(event, userId, '日程のご変更'); rule = '日程変更';
    } else if (detectVisitRequest(text)) {
      replyVisitPolicy(event); rule = '訪問希望案内';
    } else {
      // 市町名の出張費案内は「対応エリア／買取・処分の案内を出した直後」だけに限定。
      const hit = detectCityFee(text);
      if (hit && expectsCity_(userId) && !looksLikeQuestion_(text)) {
        // §4-1：意向で出し分け（買取なら出張費を出さない）。疑問文は下の分類不能へ回す。
        const intent = expectCityIntent_(userId);
        clearExpectCity_(userId);
        replyCityFee(event.replyToken, hit, event, intent);
        rule = '市町名→' + (intent === 'buy' ? '買取無料' : '出張費');
      } else {
        if (expectsCity_(userId)) consumeExpectCity_(userId);
        // 5-3: 分類不能（疑問文・意向外の市町名含む）。顧客へ営業応答せず、オーナーへ通知。
        handleUnmatchedText_(event, userId, text);
        rule = 'UNMATCHED';
      }
    }
    logEvent_(event, rule, rule === 'UNMATCHED' ? 'NONE（オーナー通知）' : ('返信:' + rule));

  } else if (msg.type === 'image') {
    thankForPhoto(event);
    logEvent_(event, 'image', '受領・オーナー通知');
  } else {
    logEvent_(event, '(' + msg.type + ')', 'NONE');
  }
}

/* =========================================================
   基盤（ハンドオフ §5-6 / §5-7 / §5-3）
   ========================================================= */

/** 5-6: 同一 webhookEventId の二重処理を防ぐ（CacheService＋LockService） */
function isDuplicateEvent_(event) {
  const id = event.webhookEventId;
  if (!id) return false;
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    const cache = CacheService.getScriptCache();
    if (cache.get('evt_' + id)) return true;
    cache.put('evt_' + id, '1', 600); // 10分
    return false;
  } catch (e) {
    return false; // ロック不能時は取りこぼしを避けて処理を通す
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/** 5-7: 全受信イベントと発火分岐を log シートへ記録（失敗してもwebhookは壊さない） */
function getLogSheet_() {
  const ssId = PropertiesService.getScriptProperties().getProperty('INQUIRY_SHEET_ID');
  if (!ssId) return null; // 中央シート未設定ならログはスキップ（本処理は通常どおり動く）
  const ss = SpreadsheetApp.openById(ssId);
  let sheet = ss.getSheetByName('log');
  if (!sheet) {
    sheet = ss.insertSheet('log');
    sheet.appendRow(['timestamp', 'userId', 'displayName', 'eventType', 'messageType', 'body', 'state', 'matchedRule', 'replySummary', 'flags']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}
function logEvent_(event, matchedRule, replySummary) {
  try {
    const sheet = getLogSheet_();
    if (!sheet) return;
    const src = event.source || {};
    const userId = src.userId || '';
    const msg = event.message || {};
    const body = msg.type === 'text'
      ? String(msg.text || '').slice(0, 500)
      : '(' + (msg.type || event.type) + (msg.id ? ' ' + msg.id : '') + ')';
    const flags = 'expect_city=' + (userId && expectsCity_(userId) ? '1' : '0');
    sheet.appendRow([
      new Date(), userId, userId ? getDisplayName_(userId) : '',
      event.type || '', msg.type || '', body, '', matchedRule || '', replySummary || '', flags,
    ]);
  } catch (e) {
    // ログ失敗は無視（webhookの本処理を止めない）
  }
}

/** 5-3: 分類不能テキスト。顧客へは営業応答せず、オーナーへ通知＋短い受付一文を1回だけ。 */
function handleUnmatchedText_(event, userId, text) {
  notifyUnmatched_(event, userId, text);
  // 通常のやり取りでは顧客へ自動返信しない（人が対応中の会話に割り込むため）。
  // 「担当者が確認し、順次ご返信します」の受付返信は、問い合わせボタン押下時（replyInquiry）だけに出す。
  // ackUnmatchedOnce_(event, userId);
  if (userId) setManualMode_(userId); // §5-3：分類不能は手動対応モードON（人が対応）
}
/** オーナー通知（10分のバースト抑制のみ。用件を取りこぼさないため6h等の長いデデュープはかけない） */
function notifyUnmatched_(event, userId, text) {
  if (!userId) return;
  const cache = CacheService.getScriptCache();
  const key = 'unmatched_' + userId;
  if (cache.get(key)) return;
  cache.put(key, '1', 600);
  const name = getDisplayName_(userId);
  const id = 'line_' + (event.message && event.message.id);
  try {
    appendInquiryRow_(new Date(), 'LINE', name, '⚠要返信（自動分類不可）', text, id);
  } catch (e) {
    notifyOwner_('LINE', name, '⚠要返信（自動分類不可）', text); // 中央シート未設定でも通知は試みる
  }
}
/** 顧客へは短い受付一文を1セッション（6時間）に1回だけ。無応答でも可だが到達不安をなくすため。 */
function ackUnmatchedOnce_(event, userId) {
  if (!userId) return;
  const cache = CacheService.getScriptCache();
  const key = 'ackmsg_' + userId;
  if (cache.get(key)) return;
  cache.put(key, '1', 21600);
  reply(event.replyToken, [{ type: 'text', text:
    'メッセージありがとうございます🚲\n担当者が内容を確認し、順次ご返信します。\n\n📷 買取・引取のご相談は、下のメニューからどうぞ。' }]);
}

/* =========================================================
   ユーザー状態（handoff §7 users）と 手動対応モード §5-1 / 停止フラグ §5-2
   ・状態は Sheets に永続化（CacheServiceは揮発するため不可）。
   ・INQUIRY_SHEET_ID 未設定の間は全て no-op（＝設定するまで従来動作のまま）。
   ========================================================= */
const USER_COLS = ['userId', 'displayName', 'state', 'intent', 'city', 'town',
  'manual_mode', 'manual_until', 'opt_out', 'opt_out_at', 'opt_out_reason', 'created_at', 'updated_at'];

function getUsersSheet_() {
  const ssId = PropertiesService.getScriptProperties().getProperty('INQUIRY_SHEET_ID');
  if (!ssId) return null;
  const ss = SpreadsheetApp.openById(ssId);
  let sheet = ss.getSheetByName('users');
  if (!sheet) { sheet = ss.insertSheet('users'); sheet.appendRow(USER_COLS); sheet.setFrozenRows(1); }
  return sheet;
}
/** userId の状態を1行読む（無ければ {}） */
function getUserState_(userId) {
  if (!userId) return {};
  try {
    const sheet = getUsersSheet_();
    if (!sheet) return {};
    const data = sheet.getDataRange().getValues();
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][0]) === userId) {
        const o = {}; USER_COLS.forEach((c, i) => o[c] = data[r][i]); return o;
      }
    }
  } catch (e) {}
  return {};
}
/** userId の指定フィールドだけ更新（無ければ新規行）。LockServiceで競合防止 */
function setUserFields_(userId, fields) {
  if (!userId) return;
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheet = getUsersSheet_();
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    const now = new Date();
    let row = -1;
    for (let r = 1; r < data.length; r++) { if (String(data[r][0]) === userId) { row = r + 1; break; } }
    if (row === -1) {
      const rec = {}; USER_COLS.forEach(c => rec[c] = '');
      rec.userId = userId; rec.created_at = now;
      Object.assign(rec, fields); rec.updated_at = now;
      sheet.appendRow(USER_COLS.map(c => rec[c]));
    } else {
      USER_COLS.forEach((c, i) => { if (c in fields) sheet.getRange(row, i + 1).setValue(fields[c]); });
      sheet.getRange(row, USER_COLS.indexOf('updated_at') + 1).setValue(now);
    }
  } catch (e) {} finally { try { lock.releaseLock(); } catch (e) {} }
}

/* ── 停止フラグ（§5-2 再勧誘禁止・特商法58条の6第3項）── */
const OPT_OUT_KEYWORDS = ['キャンセル', 'やめます', 'やめたい', 'やめておき', 'やめる', '不要', 'いりません', 'いらない', '結構です', 'お断り', '取り消', '取消'];
function detectOptOut_(text) { return !!text && OPT_OUT_KEYWORDS.some(function (kw) { return text.indexOf(kw) !== -1; }); }
function isOptedOut_(st) { return st && String(st.opt_out) === '1'; }
function setOptOut_(userId, reason) {
  setUserFields_(userId, { opt_out: '1', opt_out_at: new Date(), opt_out_reason: String(reason || '').slice(0, 100) });
  switchToMenuA_(userId); // 停止時はメニューを通常(A)に戻す（§6-3）
}
/** 停止解除は「顧客の明示的な再依頼」のみ（時間では解除しない） */
function isExplicitReRequest_(text) {
  if (!text) return false;
  return text === '買取査定を申し込みます' || text === '出張引取を申し込みます' || text === '買取希望' ||
    text.indexOf('査定をお願い') !== -1 || text.indexOf('申し込み') !== -1 || text.indexOf('お願いします') !== -1;
}
/** 停止中の新規メッセージ：営業応答はせず、オーナー通知＋短い1文のみ（1セッション1回） */
function handleOptedOut_(event, userId, msg, text) {
  notifyManualIncoming_(event, userId, msg, text, '⛔ 停止中ユーザーからの新着');
  const cache = CacheService.getScriptCache();
  const key = 'optack_' + userId;
  if (event.replyToken && !cache.get(key)) {
    cache.put(key, '1', 21600);
    reply(event.replyToken, [{ type: 'text', text: '承知しました。担当者が確認いたします。またご利用の際は下のメニューからお声がけください🚲' }]);
  }
}

/* ── 手動対応モード（§5-1）── */
function isManualMode_(st) {
  if (!st || String(st.manual_mode) !== '1') return false;
  const until = st.manual_until ? new Date(st.manual_until) : null;
  if (until && Date.now() > until.getTime()) { setUserFields_(st.userId, { manual_mode: '', manual_until: '' }); return false; }
  return true;
}
function setManualMode_(userId) {
  setUserFields_(userId, { manual_mode: '1', manual_until: new Date(Date.now() + 48 * 3600 * 1000) });
}
/** 手動対応モードを解除して自動応答に戻す（§5-1 リセット）。 */
function clearManualMode_(userId) {
  if (userId) setUserFields_(userId, { manual_mode: '', manual_until: '' });
}
/* 手動対応モードを解除する「自動応答系ボタン」（§5-1 リセット）。
   お客さまが問い合わせ後に別のメニューを押し直したら、48時間を待たずに自動応答へ戻す。
   人対応の意図が明確な inquiry（担当者に相談）／check_status（進捗確認）／
   reschedule（日程変更）／cancel（キャンセル）は除外し、手動のまま維持する。 */
var MANUAL_RESET_ACTIONS = ['apply_kaitori', 'apply_shobun', 'area_fee', 'estimate_request', 'faq', 'photo', 'add_photo', 'add_vehicle'];
var MANUAL_RESET_TEXTS = ['買取査定を申し込みます', '出張引取を申し込みます', '対応エリア・出張費', '査定を申し込む', '査定をお願いします', 'よくある質問', '写真を追加する', '写真を追加', '台数を追加する', '台数を追加'];
function isManualResetAction_(action) { return MANUAL_RESET_ACTIONS.indexOf(action) !== -1; }
function isManualResetText_(text) { return MANUAL_RESET_TEXTS.indexOf(text) !== -1; }
/** 手動対応中/停止中の新着をオーナーへ通知（10分バースト抑制。ログは別途） */
function notifyManualIncoming_(event, userId, msg, text, subject) {
  if (!userId) return;
  const cache = CacheService.getScriptCache();
  const key = 'mnotify_' + userId;
  if (cache.get(key)) return;
  cache.put(key, '1', 600);
  const name = getDisplayName_(userId);
  const body = text || ('(' + (msg && msg.type) + ')');
  const id = 'line_' + (msg && msg.id);
  try { appendInquiryRow_(new Date(), 'LINE', name, subject || '💬 手動対応中の新着', body, id); }
  catch (e) { notifyOwner_('LINE', name, subject || '💬 手動対応中の新着', body); }
}

/**
 * 「写真じゃなくて直接見に来てほしい」というご依頼の検知。
 * 査定は写真によるオンライン完結なので、理由を添えて写真へご案内する。
 */
const VISIT_REQUEST_PATTERNS = [
  '見に来', '見にきて', 'みに来', 'みにきて', '見てもらえ', '見て欲しい', '見てほしい',
  '来てもらえ', '来て欲しい', '来てほしい', '来ていただ', 'きてほしい', 'きてもらえ',
  '出張査定', '現物を見', '現物見', '直接見',
];
// 「取りに来てほしい」は正当な引取のご依頼なので、あえて検知しない

/** 引取（処分）のご依頼は正当なので、この自動応答の対象外にする語 */
const VISIT_REQUEST_EXCLUDES = ['取りに来', '取りにきて', '引き取', '引取', '処分'];

function detectVisitRequest(text) {
  // 写真を送る意思が併記されている場合は通常フローに任せる
  if (text.indexOf('写真を送') !== -1 || text.indexOf('写真送') !== -1) return false;
  if (VISIT_REQUEST_EXCLUDES.some(function (kw) { return text.indexOf(kw) !== -1; })) return false;
  return VISIT_REQUEST_PATTERNS.some(function (kw) { return text.indexOf(kw) !== -1; });
}

/** 「直接見に来てほしい」への案内（査定は写真・訪問は引き取り時） */
function replyVisitPolicy(event) {
  markAcked(event); // 受付確認を兼ねる
  const text = [
    'ご連絡ありがとうございます🚲',
    '',
    '恐れ入りますが、査定のためだけにお伺いすることは承っておりません。',
    'お伺いするのは、金額にご納得いただいたあとのお引き取りのときだけです。',
    '',
    '先に金額を確定させているのには理由があります：',
    '・玄関先で価格交渉になり、その場で決断を迫られることがありません',
    '・お断りしたいときも、LINEで気兼ねなく「やめておきます」と言えます',
    '・同じ車種の相場を調べたうえでお出しするので、根拠のある金額になります',
    '',
    '📷 まずはお手元のスマホで3枚だけお願いします',
    '①自転車ぜんぶが写るように横から',
    '②タイヤ・チェーンまわり',
    '③メーカー名やロゴの部分',
    '',
    'ピントが甘くても、暗くても、型番が分からなくても大丈夫です。お写真をお待ちしています🚲',
  ].join('\n');

  reply(event.replyToken, [{
    type: 'text',
    text: text,
    quickReply: { items: [qrCameraRoll(), qrCamera()] },
  }]);

  // T6/事象F：訪問希望は人が follow-up すべき用件。オーナー通知＋手動対応モードON。
  const userId = event.source && event.source.userId;
  if (userId) { notifyManualIncoming_(event, userId, event.message, event.message && event.message.text, '🙋 訪問希望（要follow-up）'); setManualMode_(userId); }
}

/** メッセージ内に既知の市町名があれば出張費情報を返す */
function detectCityFee(text) {
  const m = getFeeMasterMap_();
  for (const city in m) {
    if (text.indexOf(city) !== -1) {
      const e = m[city];
      return { city: city, fee: (e.ok === '要相談' || !e.fee) ? '要相談' : e.fee };
    }
  }
  // 府県名だけ（エリア外は要相談）。市町名の一致を優先するためここは最後。
  if (text.indexOf('富山') !== -1 || text.indexOf('福井') !== -1) return { city: '', fee: '要相談' };
  return null;
}

/** 市町名を検出したときの案内。§4-1：意向で出し分け（買取なら出張費を出さない＝事象A対策）。 */
function replyCityFee(replyToken, hit, event, intent) {
  markAcked(event); // 受付確認の代わりになるので初回フラグも立てる
  let lines;
  if (intent === 'buy') {
    // 買取意向：出張費は無料。金額（出張費目安）は出さない。
    lines = [
      '📍 ' + hit.city + 'ですね、対応エリアです！',
      '',
      '💰 買取は、オンライン査定もお引き取りの出張費も すべて無料です。',
      '正確な金額は、お写真を拝見して確定してお伝えします🚲',
    ];
  } else if (hit.fee === '要相談' || !hit.city) {
    // 遠方・エリア外：金額は出さず個別相談へ（§5-4）
    lines = [
      (hit.city ? '📍 ' + hit.city + 'ですね。' : '📍 ') + 'ご相談を承ります。',
      '',
      'そのエリアは距離により変わるため、出張費は個別にご案内します（買取が成立すれば出張費は無料です）。',
      'まずはお写真をお送りください。金額を確定してお伝えします🚲',
    ];
  } else {
    // 処分／対応エリア：引取の出張費（fee_master の単一額）を出す。
    lines = [
      '📍 ' + hit.city + 'ですね、対応エリアです！',
      '',
      '♻️ 引取（処分）の場合：出張費は ' + hit.fee + ' です。',
      '（かほく市役所からのGoogleマップ走行距離の目安です。町名を伺って正確な額を確定します）',
      '💰 買取の場合：オンライン査定も、お引き取りの出張費も無料です。',
      '',
      '正確な金額は、写真を拝見したうえで確定してお伝えします。',
      'お伺いするのは、金額にご納得いただいたあとのお引き取りのときです🚲',
    ];
  }
  reply(replyToken, [{ type: 'text', text: lines.join('\n') }]);
}

/** 写真ガイドのメッセージ本体（単体でも申し込みフローの2通目でも使う） */
function photoGuideMessage() {
  const text = [
    '📷 写真をお送りください！',
    '',
    '査定に必要な7枚：',
    '①自転車全体（右側面）',
    '②自転車全体（左側面）',
    '③ハンドル・ブレーキまわり',
    '④ギア・チェーンまわり',
    '⑤メーカー名・型番のシール部分',
    '⑥タイヤ・ホイール',
    '⑦傷やサビが気になる部分',
    '',
    '鍵・カゴ・ライトなどの付属品があれば、その写真もお願いします。',
    '',
    'すべて揃わなくても大丈夫です。まずは送れる分だけどうぞ！',
    '下のボタンから写真を送れます👇',
  ].join('\n');

  return {
    type: 'text',
    text: text,
    quickReply: { items: [
      qrCameraRoll(),
      qrCamera(),
      qrMessage('⚡電動アシストの方はこちら', '電動'),
      qrMessage('✅ 査定を申し込む', '査定を申し込む'),
      qrMessage('💬 問い合わせ', 'お問い合わせ'),
    ]},
  };
}

/** 引取（処分）向けの軽い写真依頼。価値判定が目的ではないので枚数は少なくてよい。 */
function photoGuideLightMessage() {
  return {
    type: 'text',
    text: [
      '📷 お写真は 自転車全体が分かる1〜2枚 で大丈夫です（メーカー名・型番などは不要）。',
      '傷・サビや、電動アシストのバッテリーがあれば写していただけると助かります。',
      '下のボタンから送れます👇',
    ].join('\n'),
    quickReply: { items: [qrCameraRoll(), qrCamera()] },
  };
}

/** リッチメニュー「写真を送る」 */
function replyPhotoGuide(replyToken) {
  reply(replyToken, [photoGuideMessage()]);
}

/** リッチメニュー「買取査定」：受付＋必要事項 → 写真ガイド の2通 */
function replyKaitoriApply(replyToken, userId) {
  const ack = [
    '💰 買取査定のお申し込みありがとうございます！',
    '',
    '査定は写真で行い、金額が決まってからお引き取りに伺います。買取なら査定・出張費・防犯登録の抹消代行まで費用は一切かかりません。',
    '',
    'スムーズにご案内するため、次を1通にまとめて教えてください（分かる範囲でOK）：',
    '① 台数（何台ですか？）',
    '② お住まいの市町名（町名まで）',
    '③ メーカー・車種',
    '④ 年式、または購入日（分かる範囲で）',
    '⑤ 電動アシストの有無',
    '⑥ 防犯登録の名義（本人／家族／不明）',
    '',
    'あわせて下の写真ガイドの通りにお写真をお送りください。すべて揃ったら「査定を申し込む」を押してください🚲',
  ].join('\n');

  reply(replyToken, [{ type: 'text', text: ack }, photoGuideMessage()]);
  setExpectCity_(userId, 'buy');   // §4-1：以後の市町名は「買取＝出張費無料」で扱い、引取料金を出さない
  switchToMenuB_(userId); // §6-3：申込(S1)でメニューBへ
  logLineInquiry_(userId, '買取査定を申し込み', '(リッチメニューから申し込み)', 'line_' + replyToken);
}

/** リッチメニュー「出張引取」：受付＋必要事項 → 写真ガイド の2通 */
function replyHikitoriApply(replyToken, userId) {
  const ack = [
    '♻️ 出張引取のお申し込みありがとうございます！',
    '',
    '処分費は0円。出張費のみで引取に伺います。出張費はこちらで計算し、金額をご確認いただいてから訪問日を決めます。',
    '',
    '次を1通にまとめて教えてください（分かる範囲でOK）：',
    '① 台数（何台ですか？）',
    '② お住まいの市町名（町名まで）',
    '③ 防犯登録の名義（本人／家族／不明）',
    '',
    'お写真は下のガイドのとおり、簡単で大丈夫です。状態によっては買取（費用なし＋お支払い）に切り替えられる場合もあります🚲',
  ].join('\n');

  reply(replyToken, [{ type: 'text', text: ack }, photoGuideLightMessage()]);
  setExpectCity_(userId, 'shobun'); // §4-1：引取なので以後の市町名は出張費の目安を返す
  switchToMenuB_(userId); // §6-3：申込(S1)でメニューBへ
  logLineInquiry_(userId, '出張引取を申し込み', '(リッチメニューから申し込み)', 'line_' + replyToken);
}

/** 電動アシスト用の追加ガイド */
function replyEbikeGuide(replyToken) {
  const text = [
    '⚡電動アシスト自転車ですね！',
    '通常の7枚に加えて、こちらもお願いします：',
    '',
    '①バッテリー（型番が見える面）',
    '②バッテリーを外した本体側の端子部分',
    '③充電器',
    '④鍵（スペアキー含む）',
    '',
    'バッテリーの型番と鍵の有無は査定額に大きく影響します🔋',
    '下のボタンから写真を送れます👇',
  ].join('\n');

  reply(replyToken, [{
    type: 'text',
    text: text,
    quickReply: { items: [qrCameraRoll(), qrCamera()] },
  }]);
}

/** 画像を受信：自動応答はしない（連投の続きに割り込む・重複するため）。
 *  記録とオーナー通知だけ行い、お客さまへの返信は手動チャットに任せる。
 *  （同一ユーザーの連投は10分に1回だけ通知＝重複通知を防ぐ） */
function thankForPhoto(event) {
  const userId = event.source && event.source.userId;
  const cache = userId ? CacheService.getScriptCache() : null;

  // §4-2：セッション最初の1枚にだけ短い受領確認（30分デデュープ）。
  // 撮影ボタンは写真送信で消えるため、ここで出し直し＋「📷マークから続けて」を案内。
  if (cache && !cache.get('photorcv_' + userId)) {
    cache.put('photorcv_' + userId, '1', 1800);
    reply(event.replyToken, [{
      type: 'text',
      text: [
        '📸 お写真ありがとうございます、受け取りました！',
        '続けて送るときは、入力欄の 📷 マークからどうぞ（送れる分だけでOK）。',
        'すべて送り終えたら「査定を申し込む」を押してください🚲',
      ].join('\n'),
      quickReply: { items: [qrCameraRoll(), qrCamera(), qrMessage('✅ 査定を申し込む', '査定を申し込む')] },
    }]);
  }

  // 記録＋オーナー通知（連投の重複通知は10分デデュープ）
  if (cache) {
    if (cache.get('thanked_' + userId)) return;
    cache.put('thanked_' + userId, '1', 600);
  }
  if (userId && REVIEW_AUTO_ENABLED) queueReviewRequest_(userId);
  logLineInquiry_(userId, '写真を送信', '(画像メッセージ)', 'line_' + event.message.id);
}

/**
 * ── レビュー依頼の自動送信 ──
 * 写真を送ってくれたユーザーをスプレッドシートに記録し、
 * REVIEW_REQUEST_DELAY_DAYS 日後に時間主導トリガー（sendReviewRequests）が
 * Googleロコミ依頼をプッシュ送信する。
 * 初回だけ GAS エディタで installReviewTrigger() を一度実行してください。
 */
function queueReviewRequest_(userId) {
  const sheet = getReviewSheet_();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === userId) return; // 既に依頼予定 or 送信済み
  }
  sheet.appendRow([userId, new Date(), 'pending']);
}

/** キャンセル系キーワードを検知したとき、そのユーザーの依頼予定を取り消す */
function skipReviewRequest_(userId) {
  const sheet = getReviewSheet_();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === userId && rows[i][2] === 'pending') {
      sheet.getRange(i + 1, 3).setValue('skipped');
    }
  }
}

function getReviewSheet_() {
  const props = PropertiesService.getScriptProperties();
  let ssId = props.getProperty('REVIEW_SHEET_ID');
  let ss;
  if (ssId) {
    ss = SpreadsheetApp.openById(ssId);
  } else {
    ss = SpreadsheetApp.create('めぐり自転車_レビュー依頼キュー');
    props.setProperty('REVIEW_SHEET_ID', ss.getId());
  }
  let sheet = ss.getSheetByName('queue');
  if (!sheet) {
    sheet = ss.getSheets()[0];
    sheet.setName('queue');
    sheet.appendRow(['userId', '写真受信日時', 'ステータス']);
  }
  return sheet;
}

/** 時間主導トリガー（毎日1回）で呼び出す：期限が来たユーザーにレビュー依頼をプッシュ送信。
 *  REVIEW_AUTO_ENABLED=false（手動運用）の間は何もしない。 */
function sendReviewRequests() {
  if (!REVIEW_AUTO_ENABLED) return; // 手動運用中：自動送信しない
  const sheet = getReviewSheet_();
  const rows = sheet.getDataRange().getValues();
  const now = new Date();
  for (let i = 1; i < rows.length; i++) {
    const [userId, receivedAt, status] = rows[i];
    if (status !== 'pending') continue;
    const daysPassed = (now - new Date(receivedAt)) / (1000 * 60 * 60 * 24);
    if (daysPassed < REVIEW_REQUEST_DELAY_DAYS) continue;
    pushMessage_(userId, [{ type: 'text', text: REVIEW_MESSAGE_TEXT }]);
    sheet.getRange(i + 1, 3).setValue('sent');
  }
}

/** 初回のみ：sendReviewRequests を毎日実行する時間主導トリガーを作成する（自動運用に戻すとき用） */
function installReviewTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendReviewRequests') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendReviewRequests').timeBased().everyDays(1).atHour(10).create();
}

/** 手動運用に切り替えるとき用：sendReviewRequests の日次トリガーを削除する。
 *  GAS エディタでこの関数を1回実行すること（トリガーが残っていても sendReviewRequests は
 *  REVIEW_AUTO_ENABLED=false で何もしないが、無駄な起動をなくすため削除を推奨）。 */
function uninstallReviewTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendReviewRequests') ScriptApp.deleteTrigger(t);
  });
}

/** 「買取希望」への案内 */
function replyKaitori(replyToken) {
  const text = [
    '💰 買取のご希望、ありがとうございます！',
    '',
    '買取の場合、査定・お引き取りの出張費・防犯登録の抹消代行まで、費用は一切かかりません。',
    '',
    'まだでしたら「お住まいの市区町村」と「メーカー名・車種」を教えてください。',
    '写真とあわせて確認のうえ、確定の査定額をご連絡します🚲',
  ].join('\n');

  reply(replyToken, [{ type: 'text', text: text }]);
}

/** 「処分希望」への案内 */
function replyShobun(replyToken) {
  const text = [
    '♻️ 処分（引取）のご希望、承知しました！',
    '',
    '処分費は0円。出張費のみで引取に伺います。',
    '出張費はお住まいの場所で決まりますので、市区町村を教えてください。',
    '',
    AREA_FEE_TEXT,
    '',
    '出張費の金額をご確認いただいてから訪問日を決めますので、ご安心ください🚲',
  ].join('\n');

  reply(replyToken, [{ type: 'text', text: text }]);
}

/** 対応エリア・出張費の案内 */
function replyArea(replyToken) {
  const text = [
    '📍 対応エリア・出張費のご案内',
    '',
    '【対応エリア】',
    '石川県かほく市（かほく市役所）を拠点に対応しています。',
    'かほく市・金沢市・白山市・七尾市 など。富山県・福井県も応相談です。',
    '',
    AREA_FEE_TEXT,
    '※ 出張費がかかるのは引取（処分）の場合のみ',
    '',
    '💰 買取の場合は、オンライン査定もお引き取りの出張費もすべて無料です！',
    '（査定のためだけにお伺いするサービスではありません。まずはお写真をお送りください）',
    'お住まいの市区町村を送っていただければ、出張費の目安をすぐお答えします。',
  ].join('\n');

  reply(replyToken, [{ type: 'text', text: text }]);
}

/** 「入力が終わったので査定お願いします」ボタン用の自動応答。
 *  住所のお願い＋現地での減額の可能性＋48時間以内 をまとめて返す（48時間はここに集約）。 */
function replyEstimateRequest(event) {
  markAcked(event);
  const text = [
    '📋 査定のお申し込みありがとうございます！お送りいただいた写真・情報を確認して査定します。',
    '',
    '念のため、次がそろっているかご確認ください（不足や、まだお伝えでない項目があれば、このメッセージのあとに追記してください）：',
    '① 台数',
    '② お住まいの市町名（町名まで／番地は金額が決まってからでOK）',
    '③ メーカー・車種',
    '④ 年式、または購入日（分かる範囲で）',
    '⑤ 電動アシストの有無',
    '⑥ 防犯登録の名義（本人／家族／不明）',
    '',
    '査定額は写真をもとに確定してお伝えします。写真のとおりであれば、その金額で確定します。',
    '写真では判別できない不具合（フレームの曲がり・割れ、変速・ブレーキの不調、電動アシストのバッテリー劣化 など）が現地で見つかった場合のみ、再査定のうえ、減額となる可能性がある旨あらかじめご了承ください。',
    '',
    '原則48時間以内に、確定の査定額をLINEでご連絡します🚲',
  ].join('\n');
  reply(event.replyToken, [{ type: 'text', text: text }]);
  const userId = event.source && event.source.userId;
  logLineInquiry_(userId, '査定を依頼（入力完了）', (event.message && event.message.text) || '', 'line_' + (event.message && event.message.id));
}

/** 「問い合わせ」ボタン用の自動応答。質問内容の記入を促し、以降は手動チャットで対応する。 */
function replyInquiry(event) {
  markAcked(event);
  const text = [
    '💬 お問い合わせありがとうございます！',
    '',
    'ご質問・ご相談の内容を、このままメッセージでお送りください。担当が確認し、順次ご返信します🚲',
    '',
    '※ 買取・引取のご相談は、下のメニューから「写真を送る」をタップすると案内が始まります。',
  ].join('\n');
  reply(event.replyToken, [{ type: 'text', text: text }]);
  const userId = event.source && event.source.userId;
  if (userId) setManualMode_(userId); // §4-5/§5-1：問い合わせは手動対応モードON（人が対応）
  logLineInquiry_(userId, 'お問い合わせ', (event.message && event.message.text) || '', 'line_' + (event.message && event.message.id));
}

/* =========================================================
   §6-2 リッチメニューA の postback アクション
   （メニューを「メッセージ送信」で登録した場合は、上の text 分岐が拾うので両対応）
   action= の割り当て：
     apply_kaitori   … 買取を申し込む（受付＋写真ガイド）
     apply_shobun    … 処分・引取を申し込む（受付＋写真ガイド＋町名待ち）
     area_fee        … 対応エリア・出張費（市町名の入力を促す）
     estimate_request… 査定をお願いします（住所町名＋条件付き確定額＋48時間）
     faq             … よくある質問
     inquiry         … 担当者に相談（手動対応モードON）
   ========================================================= */
function parseAction_(data) {
  const m = String(data || '').match(/action=([a-zA-Z_]+)/);
  return m ? m[1] : String(data || '');
}
function handlePostback_(event, userId) {
  const action = parseAction_(event.postback && event.postback.data);
  const pmsg = { type: 'postback', id: event.webhookEventId };
  const st = getUserState_(userId);

  // 優先順1: 停止フラグ（apply/estimate は明示的な再依頼として解除）
  if (isOptedOut_(st)) {
    if (action === 'apply_kaitori' || action === 'apply_shobun' || action === 'estimate_request') {
      setUserFields_(userId, { opt_out: '', opt_out_reason: '（メニュー再依頼で解除）' });
    } else {
      handleOptedOut_(event, userId, pmsg, '[postback ' + action + ']');
      logEvent_(event, 'OPT_OUT', 'NONE'); return;
    }
  }
  // 優先順2: 手動対応モード（自動応答系ボタンを押し直したら解除して通常応答に戻す＝§5-1 リセット）
  if (isManualMode_(st)) {
    if (isManualResetAction_(action)) {
      clearManualMode_(userId);
      logEvent_(event, 'MANUAL_RESET', 'postback ' + action);
    } else {
      notifyManualIncoming_(event, userId, pmsg, '[postback ' + action + ']', '💬 手動対応中の新着');
      logEvent_(event, 'MANUAL_MODE', 'NONE'); return;
    }
  }

  let rule = 'postback:' + action;
  switch (action) {
    case 'apply_kaitori': replyKaitoriApply(event.replyToken, userId); break;
    case 'apply_shobun': replyHikitoriApply(event.replyToken, userId); setExpectCity_(userId, 'shobun'); break;
    case 'area_fee': replyArea(event.replyToken); setExpectCity_(userId, 'area'); break;
    case 'estimate_request': replyEstimateRequest(event); break;
    case 'faq': replyFaq_(event.replyToken); break;
    case 'inquiry': replyInquiry(event); break;
    case 'photo': case 'add_photo': replyPhotoGuide(event.replyToken); break;
    // §6-3 メニューB
    case 'add_vehicle': replyAddVehicle_(event.replyToken); break;
    case 'check_status': replyStaffFollowup_(event, userId, '進捗のご確認'); break;
    case 'reschedule': replyStaffFollowup_(event, userId, '日程のご変更'); break;
    case 'cancel': handleCancelButton_(event, userId); break;
    default: rule = 'postback:unknown';
  }
  logEvent_(event, rule, '返信:' + rule);
}

/** §6-3 メニューB：台数を追加する */
function replyAddVehicle_(replyToken) {
  reply(replyToken, [{
    type: 'text',
    text: '🚲 追加の1台ですね！\n\n次の台のお写真を7枚を目安にお送りください（「〇台目」と一言そえていただけると助かります）。\nメーカー・車種・電動アシストの有無・防犯登録の名義もあわせて教えてください🚲',
    quickReply: { items: [qrCameraRoll(), qrCamera()] },
  }]);
}
/** §6-3 メニューB：進捗確認／日程変更 → 担当者へつなぐ（通知＋手動対応モード） */
function replyStaffFollowup_(event, userId, what) {
  reply(event.replyToken, [{ type: 'text', text: '承知しました。' + what + 'について、担当者が確認してご連絡します🚲' }]);
  if (!userId) return;
  const msg = event.message || { type: 'postback', id: event.webhookEventId };
  notifyManualIncoming_(event, userId, msg, '【' + what + '】', '🔔 ' + what + '（要対応）');
  setManualMode_(userId);
}
/** §6-3 メニューB：キャンセル・やめる → 停止フラグ（§5-2） */
function handleCancelButton_(event, userId) {
  setOptOut_(userId, 'メニューB キャンセル');
  reply(event.replyToken, [{ type: 'text', text: '承知しました。ご案内を停止します。またご利用の際は、メニューからお声がけください🚲' }]);
  const msg = event.message || { type: 'postback', id: event.webhookEventId };
  notifyManualIncoming_(event, userId, msg, '【キャンセル・やめる】', '⛔ キャンセル');
}

/** §6-2 よくある質問（実際に出た質問を反映）。手動対応フラグは立てない。 */
function replyFaq_(replyToken) {
  const text = [
    '❓ よくある質問',
    '',
    'Q. 査定に来てもらって、断っても無料ですか？',
    'A. 買取の場合は査定・出張とも無料です。断っても費用はかかりません。',
    '',
    'Q. 防犯登録カードとは何ですか？',
    'A. 購入時にもらう白い紙（登録の控え）です。抹消手続きは当方で代行します。',
    '',
    'Q. 何台まで一度に依頼できますか？',
    'A. 複数台まとめて大丈夫です。',
    '',
    'Q. 買取金額はいつ確定しますか？',
    'A. 訪問前に確定してお伝えします。玄関先での交渉はありません。',
    '',
    'Q. 支払い方法は？',
    'A. 現金は3万円まで、超える分は振込です。',
    '',
    'Q. 対応エリア外ですが可能ですか？',
    'A. 富山・福井など少し遠方は要相談です。まずはお声がけください。',
    '',
    '▼ もっと詳しいFAQはこちら',
    'https://meguri-cycle.com/#faq',
    '',
    '他のご質問は「担当者に相談」からどうぞ🚲',
  ].join('\n');
  reply(replyToken, [{ type: 'text', text: text }]);
}

/** その他のテキストへの受付確認（ユーザーごとに初回の1回だけ） */
function firstContactAck(event) {
  const userId = event.source && event.source.userId;
  if (!userId) return;
  const props = PropertiesService.getScriptProperties();
  const key = 'acked_' + userId;
  if (props.getProperty(key)) return; // 2回目以降は沈黙 → 手動チャットで対応
  props.setProperty(key, '1');

  const text = [
    'メッセージありがとうございます🚲',
    '内容を確認し、順次ご返信します。',
    '',
    '📷 買取・引取のご相談は、下のメニューから「写真を送る」をタップすると案内が始まります。',
  ].join('\n');

  reply(event.replyToken, [{ type: 'text', text: text }]);
  logLineInquiry_(userId, '初回メッセージ', event.message.text, 'line_' + event.message.id);
}

/** 初回受付フラグを立てる（別の自動応答が受付確認を兼ねた場合に使う） */
function markAcked(event) {
  const userId = event.source && event.source.userId;
  if (!userId) return;
  PropertiesService.getScriptProperties().setProperty('acked_' + userId, '1');
}

/* ── 市区町村の出張費案内を「案内直後の数メッセージだけ」に限定するためのフラグ ──
 * 対応エリア／買取・処分の案内を出したときに、残り回数(n)と意向(intent)を持つ。
 * ・n＝案内タップ直後に反応してよいメッセージ数。市町名以外が来るたび1消費し0で失効。
 * ・intent＝'buy'（買取）/'shobun'（処分）/'area'（対応エリア）。買取なら出張費を出さない（§4-1・事象A）。
 * ・保存は CacheService（TTLで60分失効。Propertiesは競合・上限のため使わない＝§4-1）。 */
const EXPECT_CITY_MSG_BUDGET = 2;              // 案内タップ直後、市町名に反応してよいメッセージ数
const EXPECT_CITY_TTL_SEC = 60 * 60;           // 60分でTTL失効（保険）
function expectCityKey_(userId) { return 'expectcity_' + userId; }
function setExpectCity_(userId, intent) {
  if (!userId) return;
  const v = JSON.stringify({ n: EXPECT_CITY_MSG_BUDGET, intent: intent || 'area' });
  CacheService.getScriptCache().put(expectCityKey_(userId), v, EXPECT_CITY_TTL_SEC);
}
/** 有効なら {n, intent} を返し、無効（未設定・TTL失効・残0）なら null */
function readExpectCity_(userId) {
  if (!userId) return null;
  const raw = CacheService.getScriptCache().get(expectCityKey_(userId));
  if (!raw) return null;
  let o;
  try { o = JSON.parse(raw); } catch (e) { return null; }
  if (!o || !o.n || o.n <= 0) return null;
  return o;
}
function expectsCity_(userId) { return !!readExpectCity_(userId); }
function expectCityIntent_(userId) { const o = readExpectCity_(userId); return o ? o.intent : null; }
/** 市町名以外のメッセージで残り回数を1消費（0で解除） */
function consumeExpectCity_(userId) {
  const o = readExpectCity_(userId);
  if (!o) return;
  o.n -= 1;
  if (o.n <= 0) { clearExpectCity_(userId); return; }
  CacheService.getScriptCache().put(expectCityKey_(userId), JSON.stringify(o), EXPECT_CITY_TTL_SEC);
}
function clearExpectCity_(userId) {
  if (!userId) return;
  CacheService.getScriptCache().remove(expectCityKey_(userId));
}
/** §4-1：料金は返さず人へ回すべき疑問文の検知（事象B の再発防止） */
function looksLikeQuestion_(text) {
  if (!text) return false;
  if (/[?？]/.test(text)) return true;
  return ['でしょうか', 'ますか', '可能', 'いつ', 'いくら'].some(function (k) { return text.indexOf(k) !== -1; });
}

/** クイックリプライ：カメラロールを開くボタン（スマホのみ表示） */
function qrCameraRoll() {
  return { type: 'action', action: { type: 'cameraRoll', label: '📷 写真を選ぶ' } };
}

/** クイックリプライ：カメラを起動するボタン（スマホのみ表示） */
function qrCamera() {
  return { type: 'action', action: { type: 'camera', label: '📸 カメラで撮る' } };
}

/** クイックリプライ：タップでテキストを送信するボタン */
function qrMessage(label, text) {
  return { type: 'action', action: { type: 'message', label: label, text: text } };
}

/**
 * ── 問い合わせ一元管理への記録 ──
 * LINEでの主要なアクション（写真送信・申し込み・初回メッセージ）を中央スプレッドシートに記録し、
 * オーナー個人のLINEに通知する。中央シート・通知の実体は inquiry-sync.gs 側の appendInquiryRow_ を使う。
 */
function logLineInquiry_(userId, subject, content, id) {
  if (!userId) return;
  // 同じ人の連続アクション（申し込み→写真送信→メッセージ等）は一連の1件として扱い、
  // 最初の1回だけ記録・通知する（6時間以内の続きのアクションはスキップ）
  const cache = CacheService.getScriptCache();
  const key = 'inqlog_' + userId;
  if (cache.get(key)) return;
  cache.put(key, '1', 21600); // 21600秒 = 6時間（CacheServiceの上限）
  const name = getDisplayName_(userId);
  appendInquiryRow_(new Date(), 'LINE', name, subject, content, id);
}

/** LINEのプロフィールAPIで表示名を取得する（1時間キャッシュ、失敗時はuserIdをそのまま返す） */
function getDisplayName_(userId) {
  const cache = CacheService.getScriptCache();
  const key = 'name_' + userId;
  const cached = cache.get(key);
  if (cached) return cached;

  let name = userId;
  try {
    const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/profile/' + userId, {
      headers: { Authorization: 'Bearer ' + CHANNEL_ACCESS_TOKEN },
      muteHttpExceptions: true,
    });
    const profile = JSON.parse(res.getContentText());
    if (profile.displayName) name = profile.displayName;
  } catch (err) {
    // 取得失敗時はuserIdのまま（友だち解除済み等）
  }
  cache.put(key, name, 3600);
  return name;
}

/** 新しい問い合わせが中央スプレッドシートに記録されたとき、オーナー個人のLINEに通知する（inquiry-sync.gsから呼ばれる） */
function notifyOwner_(channel, from, subject, content) {
  if (!OWNER_LINE_USER_ID || OWNER_LINE_USER_ID.indexOf('ここに') === 0) return; // 未設定ならスキップ
  const sheetId = PropertiesService.getScriptProperties().getProperty('INQUIRY_SHEET_ID');
  const sheetUrl = sheetId ? 'https://docs.google.com/spreadsheets/d/' + sheetId + '/edit' : '';

  const text = [
    '📩 新しい問い合わせ（' + channel + '）',
    from,
    subject,
    flattenText_(String(content)).slice(0, 200), // 空行だらけのメール本文でも通知は詰めて表示（flattenText_はinquiry-sync.gs側）
    '',
    sheetUrl,
  ].filter(String).join('\n');

  pushMessage_(OWNER_LINE_USER_ID, [{ type: 'text', text: text }]);
}

/** LINEへの返信共通処理 */
function reply(replyToken, messages) {
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + CHANNEL_ACCESS_TOKEN },
    payload: JSON.stringify({ replyToken: replyToken, messages: messages }),
    muteHttpExceptions: true,
  });
}

/** LINEへのプッシュ送信共通処理（ユーザーの発言なしに、こちらから送るとき用） */
function pushMessage_(userId, messages) {
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + CHANNEL_ACCESS_TOKEN },
    payload: JSON.stringify({ to: userId, messages: messages }),
    muteHttpExceptions: true,
  });
}

/* =========================================================
   §6-3 リッチメニュー A↔B のユーザー単位切替（Messaging API）
   スクリプトプロパティ RICHMENU_A_ID / RICHMENU_B_ID を設定すると有効。
   未設定なら no-op（＝メニューを1つ（既定A）で運用しても問題なし）。
   ・申込(S1)で B（写真追加/進捗/キャンセル 等）へ、停止/キャンセルで A へ戻す。
   ========================================================= */
function linkRichMenu_(userId, which) {
  if (!userId) return;
  const id = PropertiesService.getScriptProperties().getProperty(which === 'B' ? 'RICHMENU_B_ID' : 'RICHMENU_A_ID');
  if (!id) return; // 未設定なら何もしない
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/user/' + userId + '/richmenu/' + id, {
      method: 'post',
      headers: { Authorization: 'Bearer ' + CHANNEL_ACCESS_TOKEN },
      muteHttpExceptions: true,
    });
  } catch (e) {}
}
function switchToMenuB_(userId) { linkRichMenu_(userId, 'B'); } // 査定・訪問フェーズ
function switchToMenuA_(userId) { linkRichMenu_(userId, 'A'); } // 通常/停止時に戻す

/** 公開関数：登録済みリッチメニューの richMenuId と名前を実行ログに出す。
 *  ここで得た A/B の richMenuId を スクリプトプロパティ RICHMENU_A_ID / RICHMENU_B_ID に設定する。 */
function listRichMenus() {
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu/list', {
    headers: { Authorization: 'Bearer ' + CHANNEL_ACCESS_TOKEN },
    muteHttpExceptions: true,
  });
  let data = {};
  try { data = JSON.parse(res.getContentText()); } catch (e) {}
  const list = data.richmenus || [];
  if (!list.length) { Logger.log('リッチメニューが見つかりません（先に管理画面で作成してください）'); return list; }
  list.forEach(function (m) {
    Logger.log('richMenuId = ' + m.richMenuId + '   ←   名前:「' + (m.name || '') + '」 / チャットバー:「' + (m.chatBarText || '') + '」');
  });
  return list;
}
