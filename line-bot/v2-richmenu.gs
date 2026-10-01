/* =========================================================
   v2 リッチメニュー（要件定義_LINEシステム.md §9）を Messaging API で作成・管理する。
   ・3枚: normal（通常時 2列×3段）/ inflow（フロー進行中 横4分割）/ photo（写真工程 横3分割）
   ・画像はリポジトリ（公開）の GitHub raw から取得して登録する
   ・作成した richMenuId はスクリプトプロパティ RICHMENU_V2_NORMAL / _INFLOW / _PHOTO に保存
   ・切替はユーザー単位リンク（linkRichMenuIdToUser）。richmenuswitch は使わない（§9-4）
   実行はエディタから: v2SetupRichMenus → v2LinkOwnerNormal（自分の LINE で確認）
   ロールバック: v2UnlinkUser / v2DeleteAllMenus
   ========================================================= */
const V2_MENU_IMAGE_BASE = 'https://raw.githubusercontent.com/wilier300227-oss/meguri-cycle/master/line-bot/';

function v2Pb_(flow, step, act, val) {
  let d = 'v=2&flow=' + flow + '&step=' + step + '&act=' + act;
  if (val) d += '&val=' + val;
  return d;
}
function v2PostbackArea_(x, y, w, h, label, data) {
  return { bounds: { x: x, y: y, width: w, height: h }, action: { type: 'postback', label: label, data: data, displayText: label } };
}

const V2_MENUS = {
  normal: {
    name: 'v2-normal', chatBarText: 'メニューを開く／閉じる', selected: false, image: 'richmenu_v2_normal.jpg',
    size: { width: 2500, height: 1686 },
    areas: [
      v2PostbackArea_(0, 0, 1250, 562, '買取を申し込む', v2Pb_('satei', 0, 'next', 'kaitori')),
      v2PostbackArea_(1250, 0, 1250, 562, '処分・引取を申し込む', v2Pb_('satei', 0, 'next', 'shobun')),
      v2PostbackArea_(0, 562, 1250, 562, '対応エリア・出張費', v2Pb_('area', 0, 'next')),
      v2PostbackArea_(1250, 562, 1250, 562, '電動バッテリーの調べ方', v2Pb_('battery', 0, 'next')),
      v2PostbackArea_(0, 1124, 1250, 562, 'よくある質問', v2Pb_('faq', 0, 'next')),
      v2PostbackArea_(1250, 1124, 1250, 562, '担当者に相談', v2Pb_('menu', 0, 'consult')),
    ],
  },
  inflow: {
    name: 'v2-inflow', chatBarText: '戻る・相談', selected: false, image: 'richmenu_v2_inflow.jpg',
    size: { width: 2500, height: 843 },
    // flow/step は固定（menu/0）。GAS 側で「現在のセッションに対する操作」と解釈する（§9-2）
    areas: [
      v2PostbackArea_(0, 0, 625, 843, 'ひとつ戻る', v2Pb_('menu', 0, 'back')),
      v2PostbackArea_(625, 0, 625, 843, '最初からやり直す', v2Pb_('menu', 0, 'reset')),
      v2PostbackArea_(1250, 0, 625, 843, '担当者に相談', v2Pb_('menu', 0, 'consult')),
      v2PostbackArea_(1875, 0, 625, 843, 'やめる', v2Pb_('menu', 0, 'stop')),
    ],
  },
  photo: {
    // 写真工程は文字入力が要らないので、開いた状態で表示する（ボタンを探させない。2026-09-16）
    name: 'v2-photo', chatBarText: '写真を送る', selected: true, image: 'richmenu_v2_photo.jpg',
    size: { width: 2500, height: 843 },
    areas: [
      { bounds: { x: 0, y: 0, width: 833, height: 843 }, action: { type: 'camera', label: 'カメラで撮る' } },
      { bounds: { x: 833, y: 0, width: 834, height: 843 }, action: { type: 'cameraRoll', label: 'アルバムから選ぶ' } },
      v2PostbackArea_(1667, 0, 833, 843, '次へ進む', v2Pb_('satei', 3, 'next', 'photos_done')),
    ],
  },
};

function v2Headers_() { return { Authorization: 'Bearer ' + getChannelAccessToken_() }; }
function v2PropKey_(key) { return 'RICHMENU_V2_' + key.toUpperCase(); }

/** 3枚を作成して画像を登録し、ID をプロパティに保存する（エディタから実行）。既存の v2 メニューがあれば先に削除する。 */
function v2SetupRichMenus() {
  v2DeleteAllMenus();
  const props = PropertiesService.getScriptProperties();
  Object.keys(V2_MENUS).forEach(function (key) {
    const m = V2_MENUS[key];
    const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu', {
      method: 'post', contentType: 'application/json', headers: v2Headers_(), muteHttpExceptions: true,
      payload: JSON.stringify({ size: m.size, selected: m.selected, name: m.name, chatBarText: m.chatBarText, areas: m.areas }),
    });
    if (res.getResponseCode() !== 200) throw new Error('richmenu create ' + key + ': ' + res.getResponseCode() + ' ' + res.getContentText());
    const id = JSON.parse(res.getContentText()).richMenuId;
    const img = UrlFetchApp.fetch(V2_MENU_IMAGE_BASE + m.image, { muteHttpExceptions: true });
    if (img.getResponseCode() !== 200) throw new Error('image fetch ' + m.image + ': ' + img.getResponseCode());
    const up = UrlFetchApp.fetch('https://api-data.line.me/v2/bot/richmenu/' + id + '/content', {
      method: 'post', contentType: 'image/jpeg', headers: v2Headers_(), payload: img.getBlob().getBytes(), muteHttpExceptions: true,
    });
    if (up.getResponseCode() !== 200) throw new Error('image upload ' + key + ': ' + up.getResponseCode() + ' ' + up.getContentText());
    props.setProperty(v2PropKey_(key), id);
    Logger.log(key + ' = ' + id);
  });
  // 作り直すと旧 ID へのユーザー紐付けは消えるので、開発中はそのままオーナーへ通常時メニューを紐付け直す
  v2LinkOwnerNormal();
  return 'OK';
}

/** v2 の3枚（name が v2- で始まるもの）を API から削除し、プロパティも消す。 */
function v2DeleteAllMenus() {
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu/list', { headers: v2Headers_(), muteHttpExceptions: true });
  const list = (JSON.parse(res.getContentText()).richmenus) || [];
  list.filter(function (r) { return String(r.name).indexOf('v2-') === 0; }).forEach(function (r) {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu/' + r.richMenuId, { method: 'delete', headers: v2Headers_(), muteHttpExceptions: true });
    Logger.log('deleted ' + r.name + ' ' + r.richMenuId);
  });
  const props = PropertiesService.getScriptProperties();
  Object.keys(V2_MENUS).forEach(function (key) { props.deleteProperty(v2PropKey_(key)); });
}

/** ユーザー単位でメニューを切り替える（key: normal / inflow / photo）。ID 未設定なら何もしない。 */
/** メニュー ID。プロパティに無ければ API の一覧から名前（v2-normal 等）で探して保存する
 *  （本番プロジェクトへの切替時にプロパティを手で入れなくて済む。同じチャネルなので開発側で作ったメニューをそのまま使える） */
function v2MenuId_(key) {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(v2PropKey_(key));
  if (id) return id;
  try {
    const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu/list', { headers: v2Headers_(), muteHttpExceptions: true });
    const list = (JSON.parse(res.getContentText()).richmenus) || [];
    const hit = list.filter(function (r) { return r.name === V2_MENUS[key].name; }).sort(function (a, b) { return (b.richMenuId > a.richMenuId) ? 1 : -1; })[0];
    if (hit) { props.setProperty(v2PropKey_(key), hit.richMenuId); return hit.richMenuId; }
  } catch (e) { console.error('v2MenuId_ ' + e); }
  return '';
}
function v2LinkMenu_(userId, key) {
  if (!userId) return false;
  const id = v2MenuId_(key);
  if (!id) return false;
  // 同じメニューが直前に紐付いていれば API を呼ばない（写真1枚ごとに呼んでいた。2026-09-22 速度対策。6時間で忘れる）
  const ck = 'v2menu_' + userId;
  try { if (CacheService.getScriptCache().get(ck) === id) return true; } catch (e) {}
  try {
    const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/user/' + userId + '/richmenu/' + id, {
      method: 'post', headers: v2Headers_(), muteHttpExceptions: true,
    });
    const ok = res.getResponseCode() === 200;
    if (ok) { try { CacheService.getScriptCache().put(ck, id, 21600); } catch (e) {} }
    return ok;
  } catch (e) { console.error('v2LinkMenu_ ' + e); return false; }
}
function v2UnlinkUser_(userId) {
  if (!userId) return;
  UrlFetchApp.fetch('https://api.line.me/v2/bot/user/' + userId + '/richmenu', { method: 'delete', headers: v2Headers_(), muteHttpExceptions: true });
}

/** 自分（OWNER_LINE_USER_ID）に通常時メニューを紐付ける（エディタから実行。動作確認用）。 */
function v2LinkOwnerNormal() {
  const ok = v2LinkMenu_(OWNER_LINE_USER_ID, 'normal');
  Logger.log(ok ? 'linked normal to owner' : 'failed（RICHMENU_V2_NORMAL 未設定 or API エラー）');
  return ok;
}
/** 自分のユーザー単位メニューを外す（管理画面のメニューＡに戻る）。 */
function v2UnlinkOwner() { v2UnlinkUser_(OWNER_LINE_USER_ID); Logger.log('unlinked owner'); }

/** 切替（N-3）: 通常時メニューを全ユーザーのデフォルトにする。オーナーの LINE から「メニュー切替」で実行 */
function v2SetDefaultNormal() {
  const id = v2MenuId_('normal');
  if (!id) return 'RICHMENU_V2_NORMAL が見つかりません（v2SetupRichMenus を先に）';
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/user/all/richmenu/' + id, { method: 'post', headers: v2Headers_(), muteHttpExceptions: true });
  return 'setDefault ' + res.getResponseCode() + ' ' + id;
}
/** ロールバック（N-3）: API のデフォルトメニューを解除する（管理画面のメニューＡが再び表示される）。オーナーの LINE から「メニュー戻す」 */
function v2ClearDefault() {
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/user/all/richmenu', { method: 'delete', headers: v2Headers_(), muteHttpExceptions: true });
  return 'clearDefault ' + res.getResponseCode();
}
/** 現在のデフォルトメニューと ID の状態（オーナーの LINE から「メニュー確認」） */
function v2MenuStatus_() {
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/user/all/richmenu', { headers: v2Headers_(), muteHttpExceptions: true });
  const cur = res.getResponseCode() === 200 ? JSON.parse(res.getContentText()).richMenuId : '（API デフォルト無し＝管理画面のメニュー）';
  return ['デフォルト: ' + cur, 'normal: ' + v2MenuId_('normal'), 'inflow: ' + v2MenuId_('inflow'), 'photo: ' + v2MenuId_('photo')].join('\n');
}
/** オーナーのメニュー操作コマンド（handleEvent → v2HandleOwnerCommand_ 経由）。処理したら true */
function v2HandleMenuCommand_(event, userId, text) {
  const t = v2NormalizeCmd_(text);
  if (t === 'メニュー確認') { v2ReplyText_(event, v2MenuStatus_()); logEvent_(event, 'menu:status', ''); return true; }
  if (t === 'メニュー切替') { v2ReplyText_(event, '全ユーザーのデフォルトを v2 通常時メニューにしました\n' + v2SetDefaultNormal()); logEvent_(event, 'menu:setdefault', ''); return true; }
  if (t === 'メニュー戻す') { v2ReplyText_(event, 'API のデフォルトメニューを解除しました（管理画面のメニューＡに戻ります）\n' + v2ClearDefault()); logEvent_(event, 'menu:cleardefault', ''); return true; }
  if (t === 'メニュー自分') { v2LinkMenu_(userId, 'normal'); v2ReplyText_(event, '自分に v2 通常時メニューを紐付けました'); return true; }
  if (t === 'メニュー自分解除') { v2UnlinkUser_(userId); v2ReplyText_(event, '自分の個別メニューを外しました（デフォルトに戻ります）'); return true; }
  return false;
}
