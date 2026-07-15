/**
 * 問い合わせ一元管理システム（Gmail → スプレッドシート）
 * Google Apps Script (GAS) 用。code.gs と同じプロジェクトに追加してください。
 *
 * ── 仕組み ──
 * 1. Gmailで「査定問い合わせ」ラベルが付いたメール（フィルタで自動付与）を検索
 * 2. まだ転記していないメール（「転記済み」ラベルが付いていないもの）のうち、
 *    件名・本文にINQUIRY_KEYWORDSのいずれかを含むものだけを中央スプレッドシートに書き出す
 *    （Gmail側のフィルタが多少ゆるくても、ここで最終的に絞り込まれる）
 * 3. チェックしたメールには（転記の有無に関わらず）「転記済み」ラベルを付けて、二重チェックを防ぐ
 *
 * ── 初回セットアップ（1回だけ）──
 * 1. GASエディタで syncGmailToSheet を実行 → 権限確認が出たら許可
 *    （Gmail・スプレッドシートへのアクセス許可を求められます）
 * 2. 実行ログに表示されたスプレッドシートのURLを開いて、内容を確認
 * 3. installGmailSyncTrigger を実行 → 「10分ごとに自動実行」のトリガーが登録されます
 *    （これ以降は手動実行不要）
 */

/** 中央スプレッドシートのシート名 */
const INQUIRY_SHEET_NAME = 'inquiries';
/** 対象にするGmailラベル（STEP1でGmail側に作成したものと同じ名前にしてください） */
const GMAIL_INQUIRY_LABEL = '査定問い合わせ';
/** 転記済みの目印として付けるラベル */
const GMAIL_PROCESSED_LABEL = '転記済み';
/**
 * 件名または本文にこれらのどれかを含むメールだけを転記対象にする（Gmail側フィルタの誤爆対策の二重チェック）。
 * Gmailのフィルタ設定がゆるくても、ここで最終的に絞り込まれる。
 */
const INQUIRY_KEYWORDS = ['自転車', '買取', '引取', '査定', 'めぐり自転車'];

/**
 * これらのドメイン・アドレスからのメールは、キーワードに合致しても除外する。
 * Google/LINE/ジモティーなどの自動通知は、本文中に偶然「めぐり自転車」「引取」等を含むことがあるため。
 * forms-receipts-noreply はフォーム回答のGmail通知（回答本体は form-sync.gs が直接記録するので二重になる）。
 */
const EXCLUDED_SENDERS = ['accounts.google.com', 'linecorp.com', 'jmty.jp', 'amazon.co.jp', 'forms-receipts-noreply@google.com'];

/** Gmailの「査定問い合わせ」ラベルのメールを中央スプレッドシートに転記する（時間主導トリガーで自動実行） */
function syncGmailToSheet() {
  const processedLabel = getOrCreateLabel_(GMAIL_PROCESSED_LABEL);
  const sheet = getInquirySheet_();
  const knownIds = getKnownIds_(sheet); // 既に転記済みのIDの集合（重複防止の最終防波堤）

  // 「査定問い合わせ」ラベルが付いていて、まだ「転記済み」ラベルが付いていないスレッドだけを取得
  const threads = GmailApp.search(
    'label:' + GMAIL_INQUIRY_LABEL + ' -label:' + GMAIL_PROCESSED_LABEL
  );

  let written = 0;
  threads.forEach(function (thread) {
    const messages = thread.getMessages();
    messages.forEach(function (message) {
      const from = message.getFrom();
      if (isExcludedSender_(from)) return; // Google/LINE/ジモティー等の自動通知は対象外
      const subject = message.getSubject();
      const body = message.getPlainBody().slice(0, 300); // 本文は先頭300文字だけ（シートが長くなりすぎないように）
      if (!looksLikeInquiry_(subject, body)) return; // キーワードに合致しないものは転記しない
      if (appendInquiryRow_(message.getDate(), 'Gmail', from, subject, body, message.getId(), knownIds)) written++;
    });
    thread.addLabel(processedLabel); // 二重確認防止の目印（対象外だったスレッドも再チェックしないよう付ける）
  });

  console.log(threads.length + '件のスレッドを確認し、' + written + '件を転記しました');
}

/**
 * 中央スプレッドシートに1行追加し、オーナー個人のLINEに通知する共通処理。
 * Gmail・フォーム・LINEなど、どの経路から呼ばれても同じ形で記録・通知される。
 * knownIdsOpt を渡すと（大量処理時に）毎回シートを読み直さずに済み、高速化できる。
 * 戻り値：実際に書き込んだら true、既に記録済みでスキップしたら false
 */
function appendInquiryRow_(date, channel, from, subject, content, id, knownIdsOpt) {
  const sheet = getInquirySheet_();
  const knownIds = knownIdsOpt || getKnownIds_(sheet);
  if (knownIds.has(id)) return false; // 既に記録済み

  sheet.appendRow([date, channel, from, subject, flattenText_(content), '未対応', id]);
  knownIds.add(id);
  notifyOwner_(channel, from, subject, content); // code.gs 側で定義（LINEプッシュ通知）
  return true;
}

/** 件名・本文にキーワードが含まれるかどうかで、本当に問い合わせらしいメールかを判定する */
function looksLikeInquiry_(subject, body) {
  const text = subject + ' ' + body;
  return INQUIRY_KEYWORDS.some(function (kw) { return text.indexOf(kw) !== -1; });
}

/** Google/LINE/ジモティーなど、自動通知の送信元かどうかを判定する */
function isExcludedSender_(from) {
  return EXCLUDED_SENDERS.some(function (domain) { return from.indexOf(domain) !== -1; });
}

/** 改行や連続する空白を「 / 」に置き換え、スプレッドシートで1行に収まるようにする。Gmail・フォーム等で共通利用 */
function flattenText_(text) {
  return text.replace(/\s*\n+\s*/g, ' / ').trim();
}

/** シートのG列（ID）に既に記録されているIDの集合を取得する。Gmail・フォーム等、複数の経路から共通で使う */
function getKnownIds_(sheet) {
  const values = sheet.getDataRange().getValues();
  const ids = new Set();
  for (let i = 1; i < values.length; i++) {
    if (values[i][6]) ids.add(values[i][6]);
  }
  return ids;
}

/** 中央スプレッドシートを取得（なければ新規作成）。以後は同じシートを使い回す */
function getInquirySheet_() {
  const props = PropertiesService.getScriptProperties();
  let ssId = props.getProperty('INQUIRY_SHEET_ID');
  let ss;
  if (ssId) {
    ss = SpreadsheetApp.openById(ssId);
  } else {
    ss = SpreadsheetApp.create('めぐり自転車_問い合わせ一元管理');
    props.setProperty('INQUIRY_SHEET_ID', ss.getId());
    console.log('新しいスプレッドシートを作成しました: ' + ss.getUrl());
  }
  let sheet = ss.getSheetByName(INQUIRY_SHEET_NAME);
  if (!sheet) {
    sheet = ss.getSheets()[0];
    sheet.setName(INQUIRY_SHEET_NAME);
    sheet.appendRow(['受信日時', '経路', '送信元', '件名', '内容（抜粋）', 'ステータス', 'ID']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** 指定名のGmailラベルを取得（なければ作成） */
function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

/** 初回のみ：syncGmailToSheet を10分ごとに自動実行するトリガーを作成する */
function installGmailSyncTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncGmailToSheet') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncGmailToSheet').timeBased().everyMinutes(10).create();
}
