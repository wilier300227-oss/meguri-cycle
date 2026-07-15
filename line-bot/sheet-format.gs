/**
 * 中央スプレッドシートのステータス列（F列）を見やすくする設定
 * Google Apps Script (GAS) 用。code.gs / inquiry-sync.gs と同じプロジェクトに追加してください。
 *
 * ── できること ──
 * - F列（ステータス）をプルダウン選択式にする（自由入力によるタイプミス・表記ゆれを防ぐ）
 * - ステータスごとに背景色・文字色を自動で変える（未対応＝赤、完了＝緑、など）
 *
 * ── 使い方（1回だけ）──
 * GASエディタで setupStatusFormatting を実行 → 権限確認が出たら許可
 * 何度実行しても安全（実行するたびに設定を上書きするだけ）
 */

/** ステータスの選択肢と色（背景色・文字色）。増やしたいときはここに1行足すだけでOK */
const STATUS_OPTIONS = [
  { label: '未対応', background: '#F4CCCC', color: '#990000' },
  { label: '対応中（査定・日程調整）', background: '#FFF2CC', color: '#BF9000' },
  { label: '査定送付済み', background: '#CFE2F3', color: '#1155CC' },
  { label: '完了', background: '#D9EAD3', color: '#38761D' },
  { label: '不成立', background: '#EFEFEF', color: '#666666' },
];

/** F列にプルダウンと色分けを設定する */
function setupStatusFormatting() {
  const sheet = getInquirySheet_();
  const lastRow = Math.max(sheet.getMaxRows(), 500);
  const statusRange = sheet.getRange(2, 6, lastRow - 1, 1); // F2:F〜（1行目はヘッダーなので除く）

  // プルダウン（入力規則）
  const labels = STATUS_OPTIONS.map(function (s) { return s.label; });
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(labels, true)
    .setAllowInvalid(false)
    .build();
  statusRange.setDataValidation(rule);

  // 色分け（条件付き書式）。既存の他の条件付き書式は残しつつ、F列分だけ追加する
  const otherRules = sheet.getConditionalFormatRules().filter(function (r) {
    return !r.getRanges().some(function (rg) { return rg.getColumn() === 6; });
  });
  const statusRules = STATUS_OPTIONS.map(function (s) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(s.label)
      .setBackground(s.background)
      .setFontColor(s.color)
      .setRanges([statusRange])
      .build();
  });
  sheet.setConditionalFormatRules(otherRules.concat(statusRules));

  console.log('ステータス列のプルダウン・色分けを設定しました');
}
