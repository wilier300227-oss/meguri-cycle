// /line/ 計測用中間ページの生成データ。line.html が pagination で1件＝1ページ生成する。
// ページ間の差分は slug と msg（→ oaUrl）の2点のみ（要件6.4）。
// 末尾の「（〜から）」は GAS 集計キー（line-bot/code.gs の ROUTE_IDS / matchRoute_）。一字も変更禁止。
// URL構造 https://line.me/R/oaMessage/%40136bpsyc/?<encoded> は実機検証済み。改変禁止（要件11）。
const OA_BASE = "https://line.me/R/oaMessage/%40136bpsyc/?";

const routes = [
  // 主要ページ
  { slug: "top", msg: "自転車の査定・処分をお願いできますか？（トップから）" },
  { slug: "lp", msg: "自転車の査定・処分をお願いできますか？（LPから）" },
  { slug: "dendo", msg: "電動アシスト自転車の査定をお願いできますか？（電動ページから）" },
  { slug: "hikitori", msg: "自転車の引き取りをお願いできますか？（引取ページから）" },
  { slug: "brands", msg: "自転車の査定をお願いできますか？（ブランドページから）" },
  { slug: "price", msg: "自転車の査定をお願いできますか？（料金ページから）" },
  { slug: "area", msg: "自転車の査定をお願いできますか？（エリア一覧から）" },
  { slug: "souba", msg: "自転車の査定をお願いできますか？（相場ページから）" },
  { slug: "faq", msg: "自転車のことで相談できますか？（FAQから）" },
  { slug: "about", msg: "自転車のことで相談できますか？（紹介ページから）" },
  { slug: "terms", msg: "自転車のことで相談できますか？（条件ページから）" },
  { slug: "privacy", msg: "自転車のことで相談できますか？（プライバシーページから）" },
  // コラム
  { slug: "column", msg: "自転車のことで相談できますか？（コラム一覧から）" },
  { slug: "column-recall", msg: "電動アシストのリコールを確認したいのですが、相談できますか？（リコールコラムから）" },
  { slug: "column-battery-check", msg: "バッテリーの診断をお願いできますか？（診断コラムから）" },
  { slug: "column-battery-disposal", msg: "バッテリーの処分をお願いできますか？（処分コラムから）" },
  // 市町ページ（本文共通・経路タグは既存値を維持）
  { slug: "kanazawa", msg: "自転車の査定をお願いできますか？（金沢ページから）" },
  { slug: "tsubata", msg: "自転車の査定をお願いできますか？（津幡ページから）" },
  { slug: "uchinada", msg: "自転車の査定をお願いできますか？（内灘ページから）" },
  { slug: "hakusan", msg: "自転車の査定をお願いできますか？（白山ページから）" },
  { slug: "nonoichi", msg: "自転車の査定をお願いできますか？（野々市ページから）" },
  { slug: "komatsu", msg: "自転車の査定をお願いできますか？（小松ページから）" },
  { slug: "hakui", msg: "自転車の査定をお願いできますか？（羽咋ページから）" },
  { slug: "kawakita", msg: "自転車の査定をお願いできますか？（川北ページから）" },
  { slug: "nomi", msg: "自転車の査定をお願いできますか？（能美ページから）" },
  { slug: "kaga", msg: "自転車の査定をお願いできますか？（加賀ページから）" },
  { slug: "nanao", msg: "自転車の査定をお願いできますか？（七尾ページから）" },
  { slug: "shika", msg: "自転車の査定をお願いできますか？（志賀ページから）" },
  { slug: "nakanoto", msg: "自転車の査定をお願いできますか？（中能登ページから）" },
  { slug: "notomachi", msg: "自転車の査定をお願いできますか？（能登ページから）" },
  { slug: "anamizu", msg: "自転車の査定をお願いできますか？（穴水ページから）" },
  { slug: "suzu", msg: "自転車の査定をお願いできますか？（珠洲ページから）" },
  { slug: "wajima", msg: "自転車の査定をお願いできますか？（輪島ページから）" },
  { slug: "hodatsushimizu", msg: "自転車の査定をお願いできますか？（宝達志水ページから）" },
  { slug: "himi", msg: "自転車の査定をお願いできますか？（氷見ページから）" },
  { slug: "takaoka", msg: "自転車の査定をお願いできますか？（高岡ページから）" },
  { slug: "oyabe", msg: "自転車の査定をお願いできますか？（小矢部ページから）" },
  { slug: "imizu", msg: "自転車の査定をお願いできますか？（射水ページから）" },
  { slug: "tonami", msg: "自転車の査定をお願いできますか？（砺波ページから）" },
  { slug: "toyama", msg: "自転車の査定をお願いできますか？（富山ページから）" },
];

module.exports = routes.map(function (r) {
  return { slug: r.slug, msg: r.msg, oaUrl: OA_BASE + encodeURIComponent(r.msg) };
});
