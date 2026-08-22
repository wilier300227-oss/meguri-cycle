// サイト共通データ。
// mailtoUrl＝メール雛形リンク（Googleフォーム廃止（2026-08）の代替。追加要件D）。
// 改行は %0D%0A にする必要がある（%0A 単独は一部メールクライアントで改行が消える）ため、
// \r\n を encodeURIComponent に通して機械的に保証する。
const subject = "査定のご相談";
const body = [
  "メーカー：",
  "年式（不明でも大丈夫です）：",
  "バッテリーの有無（電動の場合）：",
  "現在も走行できるか：",
  "お住まいの市町村：",
  "",
  "※写真を添付いただけますと、より正確にご案内できます。",
].join("\r\n");

module.exports = {
  mailtoUrl:
    "mailto:info@meguri-cycle.com?subject=" +
    encodeURIComponent(subject) +
    "&body=" +
    encodeURIComponent(body),
};
