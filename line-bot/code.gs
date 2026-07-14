/**
 * めぐり自転車 LINE公式アカウント 自動応答ボット
 * Google Apps Script (GAS) 用
 *
 * ── 機能 ──
 * 1. リッチメニュー「写真を送る」タップ（=「写真をおくります。」受信）
 *    → 撮影ガイド7枚 + ボタン（カメラロール／カメラ／電動）を返信
 * 2. 「電動」受信 → 電動アシスト用の追加ガイドを返信
 * 3. 画像を受信 → お礼＋必要情報3点の質問＋ボタン（買取希望／処分希望／エリア）を返信
 * 4. 「買取希望」「処分希望」「対応エリア・出張費」→ それぞれの案内を返信
 * 5. その他のテキスト → 初回の1回だけ受付確認を返信（2回目以降は沈黙し手動チャットに任せる）
 *
 * ── 設定 ──
 * CHANNEL_ACCESS_TOKEN に LINE Developers コンソールで発行した
 * 「チャネルアクセストークン（長期）」を貼り付けてください。
 */

const CHANNEL_ACCESS_TOKEN = 'ここにチャネルアクセストークンを貼り付け';

/** 出張費の目安（サイトの料金表と合わせること） */
const AREA_FEE_TEXT = [
  '【出張費の目安（かほく市からの片道距離）】',
  '・〜10km：1,400円',
  '・10〜20km：1,700円',
  '・20〜30km：2,000円',
  '・30〜40km：2,400円',
  '・40〜50km：2,700円',
  '・50km超：応相談',
].join('\n');

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
  if (event.type !== 'message') return;
  const msg = event.message;

  if (msg.type === 'text') {
    const text = msg.text.trim();
    if (text === '写真をおくります。' || text === '写真をおくります' || text === '写真を送ります') {
      replyPhotoGuide(event.replyToken);
    } else if (text === '電動') {
      replyEbikeGuide(event.replyToken);
    } else if (text === '買取査定を申し込みます') {
      replyKaitoriApply(event.replyToken);
    } else if (text === '出張引取を申し込みます') {
      replyHikitoriApply(event.replyToken);
    } else if (text === '買取希望') {
      replyKaitori(event.replyToken);
    } else if (text === '処分希望') {
      replyShobun(event.replyToken);
    } else if (text === '対応エリア・出張費' || text === '対応エリア' || text === 'エリア') {
      replyArea(event.replyToken);
    } else {
      firstContactAck(event); // 初回のみ受付確認。以降は手動チャットに任せて沈黙
    }

  } else if (msg.type === 'image') {
    thankForPhoto(event);
  }
}

/** 写真の送り方ガイド（通常） */
function replyPhotoGuide(replyToken) {
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

  reply(replyToken, [{
    type: 'text',
    text: text,
    quickReply: { items: [
      qrCameraRoll(),
      qrCamera(),
      qrMessage('⚡電動アシストの方はこちら', '電動'),
    ]},
  }]);
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

/** 画像を受信したときのお礼＋必要情報の質問（同一ユーザーには10分に1回だけ） */
function thankForPhoto(event) {
  const userId = event.source && event.source.userId;
  if (userId) {
    const cache = CacheService.getScriptCache();
    const key = 'thanked_' + userId;
    if (cache.get(key)) return; // 10分以内にお礼済み
    cache.put(key, '1', 600);
  }
  const text = [
    '📩 お写真ありがとうございます！',
    '',
    'あわせて、次の3点を教えてください：',
    '1️⃣ お住まいの市区町村',
    '2️⃣ メーカー名・車種（わかる範囲でOK）',
    '3️⃣ ご希望（下のボタンからどうぞ）',
    '',
    '確認のうえ、48時間以内に査定額をご連絡します🚲',
  ].join('\n');

  reply(event.replyToken, [{
    type: 'text',
    text: text,
    quickReply: { items: [
      qrMessage('💰 買取希望', '買取希望'),
      qrMessage('♻️ 処分希望', '処分希望'),
      qrMessage('📍 対応エリア・出張費', '対応エリア・出張費'),
    ]},
  }]);
}

/** リッチメニュー「買取査定」からの申し込み案内 */
function replyKaitoriApply(replyToken) {
  const text = [
    '💰 買取査定のお申し込みありがとうございます！',
    '',
    '買取の場合、査定・出張・防犯登録の抹消代行まで、費用は一切かかりません。',
    '',
    '次の2つをお送りください：',
    '1️⃣ 自転車の写真（下のボタンから送れます）',
    '2️⃣ お住まいの市区町村とメーカー名・車種',
    '',
    '確認のうえ、48時間以内に確定の査定額をご連絡します🚲',
  ].join('\n');

  reply(replyToken, [{
    type: 'text',
    text: text,
    quickReply: { items: [
      qrCameraRoll(),
      qrCamera(),
      qrMessage('⚡電動アシストの方はこちら', '電動'),
    ]},
  }]);
}

/** リッチメニュー「出張引取」からの申し込み案内 */
function replyHikitoriApply(replyToken) {
  const text = [
    '♻️ 出張引取のお申し込みありがとうございます！',
    '',
    '処分費は0円。出張費のみで引取に伺います。',
    '',
    '次の2つをお送りください：',
    '1️⃣ 自転車の写真（下のボタンから送れます）',
    '2️⃣ お住まいの市区町村',
    '',
    '市区町村がわかれば、出張費はこちらで計算してご案内します。',
    AREA_FEE_TEXT,
    '',
    '金額をご確認いただいてから訪問日を決めますので、ご安心ください🚲',
  ].join('\n');

  reply(replyToken, [{
    type: 'text',
    text: text,
    quickReply: { items: [qrCameraRoll(), qrCamera()] },
  }]);
}

/** 「買取希望」への案内 */
function replyKaitori(replyToken) {
  const text = [
    '💰 買取のご希望、ありがとうございます！',
    '',
    '買取の場合、査定・出張・防犯登録の抹消代行まで、費用は一切かかりません。',
    '',
    'まだでしたら「お住まいの市区町村」と「メーカー名・車種」を教えてください。',
    '写真とあわせて確認のうえ、48時間以内に確定の査定額をご連絡します🚲',
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
    '💰 買取の場合は、査定・出張ともすべて無料です！',
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
    '内容を確認し、原則48時間以内にご返信します。',
    '',
    '📷 買取・引取のご相談は、下のメニューから「写真を送る」をタップすると案内が始まります。',
  ].join('\n');

  reply(event.replyToken, [{ type: 'text', text: text }]);
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
