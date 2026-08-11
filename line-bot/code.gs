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
 * 5-2.「査定をお願いします」（入力完了ボタン）→ 住所のお願い＋現地減額の可能性＋48時間以内 を返信
 * 5-3.「お問い合わせ」（問い合わせボタン）→ 質問内容の記入を促す（以降は手動対応）
 * 6. 「対応エリア・出張費」ボタン／「買取希望」「処分希望」の案内を出した直後だけ、
 *    市区町村を送ると その地域の出張費目安を返信。有効なのは案内タップ直後の
 *    「最大2メッセージ」まで（EXPECT_CITY_MSG_BUDGET）。それを過ぎたら、別の話題の
 *    やりとりで市町名が出ても反応しない。時間の失効（EXPECT_CITY_TTL_MS）は保険。
 *    ※ 住所などに市町名が含まれても誤って料金を出さないよう、常時検出する運用は廃止。
 * 7. その他のテキスト → 初回の1回だけ受付確認（以降は沈黙し手動チャットに任せる）
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
  '【出張費の目安（かほく市からの片道距離）】',
  '・〜10km：1,000円',
  '・10〜20km：1,500円',
  '・20〜30km：2,000円',
  '・30〜40km：2,500円',
  '・40〜50km：3,000円',
  '・50km超：応相談',
].join('\n');

/**
 * 市区町村 → 出張費の目安
 * ⚠️ 金額は仮の目安です。デプロイ前に必ず実際の距離で確認・修正してください。
 * 追加したい地名はこの表に行を足すだけでOKです。
 */
const CITY_FEES = {
  // 石川県
  'かほく市': '1,000円',
  '津幡町': '1,000円',
  '内灘町': '1,500円',
  '宝達志水町': '1,500円',
  '金沢市': '1,500円〜2,000円（市内の場所によります）',
  '羽咋市': '2,000円',
  '野々市市': '2,000円〜2,500円',
  '野々市': '2,000円〜2,500円',
  '白山市': '2,500円〜（市内の場所によります）',
  '能美市': '2,500円',
  '川北町': '2,500円',
  '志賀町': '2,500円',
  '中能登町': '2,500円',
  '七尾市': '3,000円',
  '小松市': '3,000円',
  '加賀市': '応相談（少し遠方のため、まずはご相談ください）',
  '輪島市': '応相談（少し遠方のため、まずはご相談ください）',
  '珠洲市': '応相談（少し遠方のため、まずはご相談ください）',
  '穴水町': '応相談（少し遠方のため、まずはご相談ください）',
  '能登町': '応相談（少し遠方のため、まずはご相談ください）',
  // 富山県
  '氷見市': '2,500円',
  '高岡市': '2,500円',
  '小矢部市': '2,500円',
  '射水市': '3,000円',
  '砺波市': '3,000円',
  '富山市': '応相談（少し遠方のため、まずはご相談ください）',
  '南砺市': '応相談（少し遠方のため、まずはご相談ください）',
  // 県名だけの場合（市町名のマッチを優先するため最後に置く）
  '富山県': '応相談（市町村を教えていただければ目安をご案内します）',
  '福井県': '応相談（まずはお気軽にご相談ください）',
};

/** LINEからのWebhookを受け取る入口 */
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

  if (event.type !== 'message') { logEvent_(event, '(' + event.type + ')', 'NONE'); return; }
  const msg = event.message;
  const userId = event.source && event.source.userId;

  if (msg.type === 'text') {
    const text = msg.text.trim();

    if (text === 'MYID') {
      // オーナー自身のuserId確認用（取得したら OWNER_LINE_USER_ID に貼り付ける）
      reply(event.replyToken, [{ type: 'text', text: 'あなたのuserId:\n' + userId }]);
      logEvent_(event, 'MYID', 'userId返信');
      return;
    }
    if (REVIEW_AUTO_ENABLED && userId && REVIEW_CANCEL_KEYWORDS.some(function (kw) { return text.indexOf(kw) !== -1; })) {
      skipReviewRequest_(userId);
    }

    let rule = 'UNMATCHED';
    if (text === '写真をおくります。' || text === '写真をおくります' || text === '写真を送ります') {
      replyPhotoGuide(event.replyToken); rule = '写真ガイド';
    } else if (text === '電動') {
      replyEbikeGuide(event.replyToken); rule = '電動ガイド';
    } else if (text === '買取査定を申し込みます') {
      replyKaitoriApply(event.replyToken, userId); rule = '買取査定申込';
    } else if (text === '出張引取を申し込みます') {
      replyHikitoriApply(event.replyToken, userId); rule = '出張引取申込';
    } else if (text === '買取希望') {
      replyKaitori(event.replyToken); setExpectCity_(userId); rule = '買取希望案内';
    } else if (text === '処分希望') {
      replyShobun(event.replyToken); setExpectCity_(userId); rule = '処分希望案内';
    } else if (text === '対応エリア・出張費' || text === '対応エリア' || text === 'エリア') {
      replyArea(event.replyToken); setExpectCity_(userId); rule = 'エリア案内';
    } else if (text === '査定をお願いします' || text === '入力完了' ||
               text.indexOf('査定をお願い') !== -1 || text.indexOf('査定お願い') !== -1) {
      replyEstimateRequest(event); rule = '査定依頼';
    } else if (text === 'お問い合わせ' || text === '問い合わせ' ||
               text.indexOf('問い合わせ') !== -1 || text.indexOf('問合せ') !== -1) {
      replyInquiry(event); rule = '問い合わせ';
    } else if (detectVisitRequest(text)) {
      replyVisitPolicy(event); rule = '訪問希望案内';
    } else {
      // 市町名の出張費案内は「対応エリア／買取・処分の案内を出した直後」だけに限定。
      const hit = detectCityFee(text);
      if (hit && expectsCity_(userId)) {
        clearExpectCity_(userId);
        replyCityFee(event.replyToken, hit, event);
        rule = '市町名→出張費';
      } else {
        if (expectsCity_(userId)) consumeExpectCity_(userId);
        // 5-3: 分類不能。既定は「顧客へ営業応答しない・オーナーへ通知」。
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
  ackUnmatchedOnce_(event, userId);
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
}

/** メッセージ内に既知の市町名があれば出張費情報を返す */
function detectCityFee(text) {
  for (const city in CITY_FEES) {
    if (text.indexOf(city) !== -1) return { city: city, fee: CITY_FEES[city] };
  }
  return null;
}

/** 市町名を検出したときの出張費案内 */
function replyCityFee(replyToken, hit, event) {
  markAcked(event); // 受付確認の代わりになるので初回フラグも立てる
  const text = [
    '📍 ' + hit.city + 'ですね、対応エリアです！',
    '',
    '♻️ 引取（処分）の場合：出張費の目安は ' + hit.fee + ' です。',
    '💰 買取の場合：オンライン査定も、お引き取りの出張費も無料です。',
    '',
    '正確な金額は、写真を拝見したうえで確定してお伝えします。',
    'お伺いするのは、金額にご納得いただいたあとのお引き取りのときです🚲',
  ].join('\n');

  reply(replyToken, [{ type: 'text', text: text }]);
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
      qrMessage('✅ 入力完了・査定をお願いします', '査定をお願いします'),
      qrMessage('💬 問い合わせ', 'お問い合わせ'),
    ]},
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
    '査定は写真で行い、金額が決まってからお引き取りに伺います。',
    '買取の場合、査定・お引き取りの出張費・防犯登録の抹消代行まで、費用は一切かかりません。',
    '',
    'お手数ですが、次の2つをメッセージでお送りください：',
    '1️⃣ お住まいの市区町村',
    '2️⃣ メーカー名・車種（わかる範囲でOK）',
    '',
    'あわせて自転車の写真をお願いします（次のメッセージをご覧ください）。',
    '写真と情報が揃いましたら「✅ 入力完了・査定をお願いします」を押してください（または「査定をお願いします」とご送信ください）🚲',
  ].join('\n');

  reply(replyToken, [{ type: 'text', text: ack }, photoGuideMessage()]);
  logLineInquiry_(userId, '買取査定を申し込み', '(リッチメニューから申し込み)', 'line_' + replyToken);
}

/** リッチメニュー「出張引取」：受付＋必要事項 → 写真ガイド の2通 */
function replyHikitoriApply(replyToken, userId) {
  const ack = [
    '♻️ 出張引取のお申し込みありがとうございます！',
    '',
    '処分費は0円。出張費のみで引取に伺います。',
    '',
    'お手数ですが「お住まいの市区町村」をメッセージでお送りください。',
    '出張費はこちらで計算して、金額をご確認いただいてから訪問日を決めます。',
    '',
    'あわせて自転車の写真をお願いします（次のメッセージをご覧ください）。',
    '状態によっては買取（費用なし＋お支払い）に切り替えられる場合もあります🚲',
  ].join('\n');

  reply(replyToken, [{ type: 'text', text: ack }, photoGuideMessage()]);
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
  if (userId) {
    const cache = CacheService.getScriptCache();
    const key = 'thanked_' + userId;
    if (cache.get(key)) return; // 10分以内は通知済み（連投の重複通知を防ぐ）
    cache.put(key, '1', 600);
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
    '石川県中心（かほく市・金沢市・白山市・七尾市など）',
    '富山県・福井県も応相談です。',
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
    '📋 査定のご依頼ありがとうございます！お送りいただいた写真・情報を確認します。',
    '',
    'お引き取りの段取りのため、差し支えなければ お住まいの市町名（町名まで）を教えてください。番地は金額が決まってからで大丈夫です。',
    '',
    '査定額は写真をもとに確定してお伝えします。写真のとおりであれば、その金額で確定します。',
    '写真では判別できない次の点が現地で見つかった場合のみ、その場では決めず、一度お持ち帰りのうえ再提示します：',
    '・フレームの曲がり／割れ',
    '・変速またはブレーキが機能しない',
    '・（電動アシスト）バッテリー残量ランプが2点灯以下',
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
  logLineInquiry_(userId, 'お問い合わせ', (event.message && event.message.text) || '', 'line_' + (event.message && event.message.id));
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
 * 対応エリア／買取・処分の案内を出したときに、そのユーザーについて
 * 「このあと数メッセージは市区町村に反応してよい」印を、残り回数（n）と時刻（t）で持つ。
 * ・n（EXPECT_CITY_MSG_BUDGET）＝案内タップ直後に反応してよいメッセージ数。市町名以外の
 *   メッセージが来るたび 1 消費し、0 になったら失効（別の話題のやりとりに市町名が混ざっても
 *   反応しない）。市町名で1回料金を返したらそこで解除。
 * ・t＝暴発防止の時間バックストップ。EXPECT_CITY_TTL_MS を過ぎたら回数が残っていても無効。 */
const EXPECT_CITY_MSG_BUDGET = 2;              // 案内タップ直後、市町名に反応してよいメッセージ数
const EXPECT_CITY_TTL_MS = 60 * 60 * 1000;     // 保険の時間失効（60分）
function expectCityKey_(userId) { return 'expectcity_' + userId; }
function setExpectCity_(userId) {
  if (!userId) return;
  const v = JSON.stringify({ t: Date.now(), n: EXPECT_CITY_MSG_BUDGET });
  PropertiesService.getScriptProperties().setProperty(expectCityKey_(userId), v);
}
/** 有効なら {t, n} を返し、無効（未設定・期限切れ・残0）なら null */
function readExpectCity_(userId) {
  if (!userId) return null;
  const raw = PropertiesService.getScriptProperties().getProperty(expectCityKey_(userId));
  if (!raw) return null;
  let o;
  try { o = JSON.parse(raw); } catch (e) { return null; }
  if (!o || !o.n || o.n <= 0) return null;
  if (Date.now() - Number(o.t) > EXPECT_CITY_TTL_MS) return null;
  return o;
}
function expectsCity_(userId) { return !!readExpectCity_(userId); }
/** 市町名以外のメッセージで残り回数を1消費（0で解除） */
function consumeExpectCity_(userId) {
  const o = readExpectCity_(userId);
  if (!o) { clearExpectCity_(userId); return; }
  o.n -= 1;
  if (o.n <= 0) { clearExpectCity_(userId); return; }
  PropertiesService.getScriptProperties().setProperty(expectCityKey_(userId), JSON.stringify(o));
}
function clearExpectCity_(userId) {
  if (!userId) return;
  PropertiesService.getScriptProperties().deleteProperty(expectCityKey_(userId));
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
