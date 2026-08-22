// サイト共通データ。
// mailtoUrl＝メール雛形リンク（Googleフォーム廃止（2026-08）の代替。追加要件D）。
// 2026-08-22 短縮版に改訂：記入欄＋写真ガイド（査定アップ・電動・診断リンク）をコンパクトに。
// 長文はmailto URLが伸びて一部メールアプリで開けないリスクがあるため、この分量を上限とする。
// 改行は %0D%0A にする必要がある（%0A 単独は一部メールクライアントで改行が消える）ため、
// \r\n を encodeURIComponent に通して機械的に保証する。
const subject = "査定のご相談";
const body = [
  "はじめまして。自転車の査定を希望します。",
  "",
  "【ご記入ください】",
  "メーカー：",
  "年式（不明でも大丈夫です）：",
  "バッテリーの有無（電動の場合）：",
  "現在も走行できるか：",
  "お住まいの市町村：",
  "",
  "【写真のお願い】",
  "①車体ぜんぶ（横から）②タイヤまわり ③メーカー名やロゴ",
  "余裕があれば型番シールや傷の写真も添えていただくと査定アップにつながります。",
  "電動の方はパネルと充電器も。診断のやり方：https://meguri-cycle.com/column/battery-check/",
].join("\r\n");

module.exports = {
  mailtoUrl:
    "mailto:info@meguri-cycle.com?subject=" +
    encodeURIComponent(subject) +
    "&body=" +
    encodeURIComponent(body),
};
