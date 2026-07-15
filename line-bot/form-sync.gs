/**
 * 問い合わせ一元管理システム（Googleフォーム → スプレッドシート）
 * Google Apps Script (GAS) 用。code.gs / inquiry-sync.gs と同じプロジェクトに追加してください。
 *
 * ── 仕組み ──
 * フォームが送信されると、質問と回答をすべて「質問：回答」の形でテキストにまとめ、
 * 中央スプレッドシート（inquiry-sync.gs が使っているものと同じ）に1行追加する。
 * 分岐フォームで質問構成が変わっても、そのまま柔軟に記録できる。
 *
 * ── 初回セットアップ（1回だけ）──
 * 1. https://forms.google.com を開き、自分のフォーム一覧から対象の査定フォームを開く
 *    （サイトに貼っている回答用リンク [.../forms/d/e/.../viewform] とは別物なので注意。
 *     必ずフォーム一覧から「編集画面」を開くこと）
 * 2. 編集画面のURL https://docs.google.com/forms/d/【この部分】/edit の【この部分】をコピー
 *    （"e/" から始まる場合は回答用リンクを開いてしまっているので、フォーム一覧からやり直す）
 * 3. 下の FORM_ID にそのIDを貼り付けて保存
 * 4. GASエディタで installFormSyncTrigger を実行 → 権限確認が出たら許可
 *    （これでフォーム送信時に自動実行されるようになります。時間主導トリガーは不要）
 * 5. 実際にフォームをテスト送信して、中央スプレッドシートに行が増えるか確認
 */

/** 対象のGoogleフォームの編集用ID（"e/"から始まる回答用リンクのIDとは別物。上記STEP1〜2参照） */
const FORM_ID = 'ここに査定フォームの編集用IDを貼り付け';

/** フォーム送信時に呼ばれる：質問と回答をまとめて中央スプレッドシートに追記する */
function onFormSubmitToInquirySheet(e) {
  const itemResponses = e.response.getItemResponses();
  const id = 'form_' + e.response.getId();

  let email = '';
  try {
    email = e.response.getRespondentEmail() || ''; // フォームで「メールアドレスを収集する」設定がONの場合のみ取得できる
  } catch (err) {
    // 収集設定がOFFのときは例外になるので無視してよい
  }

  const lines = itemResponses.map(function (ir) {
    const title = ir.getItem().getTitle();
    if (!email && /メール|email/i.test(title)) email = String(ir.getResponse());
    return title + '：' + formatAnswer_(ir.getResponse());
  });

  appendInquiryRow_(new Date(), 'フォーム', email, '査定フォーム回答', lines.join(' / ').slice(0, 500), id);
}

/** フォームの回答値を文字列にする（チェックボックスなど配列で返る質問にも対応） */
function formatAnswer_(response) {
  return Array.isArray(response) ? response.join('、') : String(response);
}

/** 初回のみ：フォーム送信時に onFormSubmitToInquirySheet を呼ぶトリガーを作成する */
function installFormSyncTrigger() {
  const form = FormApp.openById(FORM_ID);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onFormSubmitToInquirySheet') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onFormSubmitToInquirySheet').forForm(form).onFormSubmit().create();
}
