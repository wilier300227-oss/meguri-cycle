/**
 * めぐり自転車 LINE公式アカウント 自動応答ボット
 * Google Apps Script (GAS) 用
 *
 * ── 機能 ──
 * 1. リッチメニュー「買取査定」「出張引取」→ 受付＋必要事項＋写真ガイドを2通で返信
 * 2. リッチメニュー「写真を送る」→ 撮影ガイド7枚＋カメラボタンを返信
 * 3. 「電動」→ 電動アシスト用の追加ガイドを返信
 * 4. 画像を受信 → お礼＋必要情報3点の質問＋選択ボタンを返信
 * 5. 「買取希望」「処分希望」「対応エリア・出張費」→ それぞれの案内を返信
 * 6. メッセージに市町名が含まれる → その地域の出張費目安を自動返信
 * 7. その他のテキスト → 初回の1回だけ受付確認（以降は沈黙し手動チャットに任せる）
 *
 * ── 設定 ──
 * CHANNEL_ACCESS_TOKEN に LINE Developers コンソールで発行した
 * 「チャネルアクセストークン（長期）」を貼り付けてください。
 */

const CHANNEL_ACCESS_TOKEN = 'ここにチャネルアクセストークンを貼り付け';

/** 出張費の目安表（サイトの料金表と合わせること） */
const AREA_FEE_TEXT = [
  '【出張費の目安（かほく市からの片道距離）】',
  '・〜10km：1,400円',
  '・10〜20km：1,700円',
  '・20〜30km：2,000円',
  '・30〜40km：2,400円',
  '・40〜50km：2,700円',
  '・50km超：応相談',
].join('\n');

/**
 * 市区町村 → 出張費の目安
 * ⚠️ 金額は仮の目安です。デプロイ前に必ず実際の距離で確認・修正してください。
 * 追加したい地名はこの表に行を足すだけでOKです。
 */
const CITY_FEES = {
  // 石川県
  'かほく市': '1,400円',
  '津幡町': '1,400円',
  '内灘町': '1,700円',
  '宝達志水町': '1,700円',
  '金沢市': '1,700円〜2,000円（市内の場所によります）',
  '羽咋市': '2,000円',
  '野々市市': '2,000円〜2,400円',
  '野々市': '2,000円〜2,400円',
  '白山市': '2,400円〜（市内の場所によります）',
  '能美市': '2,400円',
  '川北町': '2,400円',
  '志賀町': '2,400円',
  '中能登町': '2,400円',
  '七尾市': '2,700円',
  '小松市': '2,700円',
  '加賀市': '応相談（少し遠方のため、まずはご相談ください）',
  '輪島市': '応相談（少し遠方のため、まずはご相談ください）',
  '珠洲市': '応相談（少し遠方のため、まずはご相談ください）',
  '穴水町': '応相談（少し遠方のため、まずはご相談ください）',
  '能登町': '応相談（少し遠方のため、まずはご相談ください）',
  // 富山県
  '氷見市': '2,400円',
  '高岡市': '2,400円',
  '小矢部市': '2,400円',
  '射水市': '2,700円',
  '砺波市': '2,700円',
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
      const hit = detectCityFee(text);
      if (hit) {
        replyCityFee(event.replyToken, hit, event);
      } else {
        firstContactAck(event); // 初回のみ受付確認。以降は手動チャットに任せて沈黙
      }
    }

  } else if (msg.type === 'image') {
    thankForPhoto(event);
  }
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
    '💰 買取の場合：査定・出張とも無料です。',
    '',
    '正確な金額は、査定のご連絡時に確定してお伝えします🚲',
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
    ]},
  };
}

/** リッチメニュー「写真を送る」 */
function replyPhotoGuide(replyToken) {
  reply(replyToken, [photoGuideMessage()]);
}

/** リッチメニュー「買取査定」：受付＋必要事項 → 写真ガイド の2通 */
function replyKaitoriApply(replyToken) {
  const ack = [
    '💰 買取査定のお申し込みありがとうございます！',
    '',
    '買取の場合、査定・出張・防犯登録の抹消代行まで、費用は一切かかりません。',
    '',
    'お手数ですが、次の2つをメッセージでお送りください：',
    '1️⃣ お住まいの市区町村',
    '2️⃣ メーカー名・車種（わかる範囲でOK）',
    '',
    'あわせて自転車の写真をお願いします（次のメッセージをご覧ください）。',
    '確認のうえ、48時間以内に確定の査定額をご連絡します🚲',
  ].join('\n');

  reply(replyToken, [{ type: 'text', text: ack }, photoGuideMessage()]);
}

/** リッチメニュー「出張引取」：受付＋必要事項 → 写真ガイド の2通 */
function replyHikitoriApply(replyToken) {
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
    'お住まいの市区町村を送っていただければ、出張費の目安をすぐお答えします。',
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

/** 初回受付フラグを立てる（別の自動応答が受付確認を兼ねた場合に使う） */
function markAcked(event) {
  const userId = event.source && event.source.userId;
  if (!userId) return;
  PropertiesService.getScriptProperties().setProperty('acked_' + userId, '1');
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
