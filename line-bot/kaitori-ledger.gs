/**
 * 出張買取 台帳・Drive保存 Web App —— フェーズ②
 * 屋号 RAINBOW／めぐり自転車（古物商許可 第511090015059号）
 *
 * ★重要：これは LINEボット（code.gs）とは【別のGASプロジェクト】として新規作成・デプロイする。
 *   1つのGASプロジェクトに doPost は1つしか持てないため、同じプロジェクトには入れないこと。
 *
 * ── 役割 ──
 * kaitori/ のフロント（index.html）が「署名確定」した取引データと生成PDF(base64)を受け取り、
 *  1) PDFを Google Drive の指定フォルダに保存（ファイル名＝取引番号ベース）
 *  2) スプレッドシート台帳に1行追記（要件定義3.5のカラム準拠）
 *  3) 台帳に Drive のPDFリンクを記録
 * を行う。免許証以外の本人確認区分では確認番号を台帳に保存しない（サーバ側でも防御）。
 *
 * ── 初回セットアップ（1回だけ）──
 * 1. https://script.google.com で「新しいプロジェクト」を作成（LINEボットとは別プロジェクト）。
 * 2. このファイルの中身を全部貼り付けて保存。
 * 3. 台帳スプレッドシートを新規作成し、そのシートID（URLの /d/【ここ】/edit）を控える。
 * 4. PDF保存用の Drive フォルダを作成し、そのフォルダID（URLの /folders/【ここ】）を控える。
 * 5. GASエディタ左「プロジェクトの設定」→「スクリプト プロパティ」で次の3つを登録：
 *      KAITORI_TOKEN         … フロントの config.js と一致させる長めのランダム文字列（秘密）
 *      KAITORI_SHEET_ID      … 3で控えた台帳スプレッドシートID
 *      KAITORI_FOLDER_ID     … 4で控えたDriveフォルダID
 *    （関数 setupProps を編集して一度実行してもよい。下部参照）
 * 6. 一度 initLedgerHeader を実行してヘッダー行を作成（権限確認が出たら許可）。
 * 7. 右上「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *      次のユーザーとして実行：自分 ／ アクセスできるユーザー：全員
 *    → 表示された【ウェブアプリのURL】をコピーし、kaitori/config.js の gasUrl に貼る。
 * 8. コード変更のたびに「デプロイを管理」→ 鉛筆 → 新バージョンでデプロイし直す（反映のため）。
 *
 * ※ セキュリティ注意：GitHub Pages 上の config.js に置くトークンは、公開ページのソースから
 *   閲覧可能になり得る（クライアント側の宿命）。トークンは「Gitにコミットしない」ことで履歴からは
 *   守られるが、公開URLで配信するなら定期ローテーション＋kaitoriページの非公開運用を推奨。
 */

/* 台帳カラム定義（要件定義3.5準拠＋実機フィードバックで増えた項目。順序＝列順） */
const KAITORI_HEADERS = [
  '取引番号', '取引年月日', '取引区分',
  '相手方氏名', '住所', '電話番号', '職業', '生年月日', '年齢',
  '本人確認区分', '確認番号',
  'メーカー', '車種', 'フレーム番号', '色', '防犯登録番号', '防犯登録名義人', '付属品',
  '品目', '数量', '特徴',
  '買取金額', '支払方法',
  '未成年フラグ', '保護者氏名', '保護者続柄', '保護者住所', '保護者連絡先', '保護者本人確認',
  '署名確定時刻', '証明書PDF', '保護者同意書PDF',
  '記録日時', '訂正ログ',
];

/** フロントからのPOSTを受ける本体 */
function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // トークン検証
    const expected = PropertiesService.getScriptProperties().getProperty('KAITORI_TOKEN');
    if (!expected || body.token !== expected) {
      return json_({ status: 'error', message: 'unauthorized' });
    }

    const action = body.action || 'append';
    if (action === 'append') return handleAppend_(body);
    if (action === 'correct') return handleCorrect_(body);
    return json_({ status: 'error', message: 'unknown action: ' + action });
  } catch (err) {
    return json_({ status: 'error', message: String(err) });
  }
}

/** 疎通確認用（ブラウザでURLを開くと表示される） */
function doGet() {
  return ContentService.createTextOutput('kaitori-ledger web app: OK')
    .setMimeType(ContentService.MimeType.TEXT);
}

/** 新規取引の追記：PDFをDrive保存し、台帳に1行追加してリンクを記録 */
function handleAppend_(body) {
  const rec = body.record || {};
  const tradeNo = String(rec.tradeNo || '').trim();
  if (!tradeNo) return json_({ status: 'error', message: 'tradeNo required' });

  const sheet = getLedgerSheet_();

  // 免許証以外は確認番号を保存しない（サーバ側の防御。フロントでも空にしている）
  const idType = String(rec.idType || '');
  const idNumber = (idType === '運転免許証') ? String(rec.idNumber || '') : '';

  // PDFをDriveへ保存 → リンク取得
  const folder = DriveApp.getFolderById(
    PropertiesService.getScriptProperties().getProperty('KAITORI_FOLDER_ID'));
  const links = {};
  (body.pdfs || []).forEach(function (p) {
    if (!p || !p.b64) return;
    const bytes = Utilities.base64Decode(p.b64);
    const blob = Utilities.newBlob(bytes, 'application/pdf', p.name || (tradeNo + '.pdf'));
    const file = folder.createFile(blob);
    // kind: 'cert' | 'guardian'（フロントが指定）。無指定は cert 扱い。
    links[p.kind || 'cert'] = file.getUrl();
  });

  const row = [
    tradeNo,
    rec.tradeDate || '',
    rec.tradeType || '',
    rec.pName || '',
    rec.pAddress || '',
    rec.pTel || '',
    rec.pJob || '',
    rec.pBirth || '',
    (rec.age === 0 || rec.age) ? rec.age : '',
    idType,
    idNumber,
    rec.bMaker || '',
    rec.bModel || '',
    rec.bFrame || '',
    rec.bColor || '',
    rec.bRegist || '',
    rec.registOwner || '',
    rec.accessories || '',
    rec.bItem || '',
    (rec.bQty === 0 || rec.bQty) ? rec.bQty : '',
    rec.bFeature || '',
    (rec.amount === 0 || rec.amount) ? Number(rec.amount) : '',  // 数値で保持（検索・集計用）
    rec.payMethod || '',
    rec.isMinor ? '未成年' : '',
    rec.gName || '',
    rec.gRelation || '',
    rec.gAddress || '',
    rec.gContact || '',
    rec.gIdMethod || '',
    rec.confirmedAt || '',
    links.cert || '',
    links.guardian || '',
    new Date(),
    '',  // 訂正ログ（新規時は空）
  ];
  sheet.appendRow(row);

  return json_({ status: 'ok', tradeNo: tradeNo, links: links });
}

/**
 * 訂正：確定後の修正は「新規訂正」扱い（要件・事務処理規程 第5条）。
 * 元取引の行の「訂正ログ」に履歴を残し、訂正内容は新規行として追記する。
 * body = { record:{...,correctionOf, correctionReason}, pdfs:[...] }
 */
function handleCorrect_(body) {
  const rec = body.record || {};
  const origNo = String(rec.correctionOf || '').trim();
  if (!origNo) return json_({ status: 'error', message: 'correctionOf required' });

  const sheet = getLedgerSheet_();
  const values = sheet.getDataRange().getValues();
  const logColIdx = KAITORI_HEADERS.indexOf('訂正ログ'); // 0-based
  const stamp = new Date();
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][0]).trim() === origNo) {
      const prev = values[r][logColIdx] ? values[r][logColIdx] + '\n' : '';
      const logLine = Utilities.formatDate(stamp, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') +
        ' 訂正→' + (rec.tradeNo || '(新番号)') + '：' + (rec.correctionReason || '理由未記載');
      sheet.getRange(r + 1, logColIdx + 1).setValue(prev + logLine);
      break;
    }
  }
  // 訂正後の内容は新規行として記録（新しい取引番号を持たせる想定）
  const appended = handleAppend_(body);
  return appended;
}

/** 台帳シート取得（無ければヘッダーを作る） */
function getLedgerSheet_() {
  const ss = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty('KAITORI_SHEET_ID'));
  let sheet = ss.getSheetByName('台帳');
  if (!sheet) sheet = ss.insertSheet('台帳');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(KAITORI_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** JSONレスポンス */
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============ 手動セットアップ用ヘルパー ============ */

/** 台帳ヘッダーを初期化（初回に一度実行） */
function initLedgerHeader() {
  getLedgerSheet_();
}

/**
 * スクリプトプロパティをコードから設定したい場合の補助。
 * 値を埋めて一度だけ実行 → 実行後は値を消して保存すること（コミットもしない）。
 */
function setupProps() {
  PropertiesService.getScriptProperties().setProperties({
    KAITORI_TOKEN: '',      // ← フロント config.js と一致させる秘密トークン
    KAITORI_SHEET_ID: '',   // ← 台帳スプレッドシートID
    KAITORI_FOLDER_ID: '',  // ← PDF保存先DriveフォルダID
  });
}
