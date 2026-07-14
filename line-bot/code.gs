/**
 * めぐり自転車 LINE公式アカウント 自動応答ボット
 * Google Apps Script (GAS) 用
 *
 * ── 機能 ──
 * 1. リッチメニュー「写真を送る」タップ（=「写真をおくります。」受信）
 *    → 撮影ガイド7枚 + クイックリプライボタン（カメラロール／カメラ／電動）を返信
 * 2. 「電動」受信 → 電動アシスト用の追加ガイドを返信
 * 3. 画像を受信 → お礼メッセージを返信（連投対策で10分に1回まで）
 * 4. それ以外のメッセージには反応しない（手動チャットの邪魔をしない）
 *
 * ── 設定 ──
 * CHANNEL_ACCESS_TOKEN に LINE Developers コンソールで発行した
 * 「チャネルアクセストークン（長期）」を貼り付けてください。
 */

const CHANNEL_ACCESS_TOKEN = 'ここにチャネルアクセストークンを貼り付け';

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
    } else if (text === '電動' || text === '⚡電動アシストの方はこちら') {
      replyEbikeGuide(event.replyToken);
    }
    // それ以外のテキストはボットは沈黙 → 手動チャットで対応

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
      { type: 'action', action: { type: 'message', label: '⚡電動アシストの方はこちら', text: '電動' } },
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

/** 画像を受信したときのお礼（同一ユーザーには10分に1回だけ） */
function thankForPhoto(event) {
  const userId = event.source && event.source.userId;
  if (userId) {
    const cache = CacheService.getScriptCache();
    const key = 'thanked_' + userId;
    if (cache.get(key)) return; // 10分以内にお礼済み
    cache.put(key, '1', 600);
  }
  reply(event.replyToken, [{
    type: 'text',
    text: '📩 お写真ありがとうございます！\n確認のうえ、48時間以内に査定額をご連絡します。\n追加の写真もこのままお送りください🚲',
  }]);
}

/** クイックリプライ：カメラロールを開くボタン（スマホのみ表示） */
function qrCameraRoll() {
  return { type: 'action', action: { type: 'cameraRoll', label: '📷 写真を選ぶ' } };
}

/** クイックリプライ：カメラを起動するボタン（スマホのみ表示） */
function qrCamera() {
  return { type: 'action', action: { type: 'camera', label: '📸 カメラで撮る' } };
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
