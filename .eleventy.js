// Eleventy 設定
// - 入力はリポジトリ直下。index.html / privacy.html だけをテンプレート処理し、
//   共通パーツ（_includes/）を {% include %} で差し込む。
// - それ以外（アセット・kaitori PWA・insta/yt などの独立HTML）は素通しコピー。
// - kaitori/ には一切テンプレート処理を掛けない（.eleventyignore で除外し、passthroughで丸ごとコピー）。
module.exports = function (eleventyConfig) {
  // アセット・独立セクションを検証なしでそのまま出力へコピー
  ["css", "js", "images", "logo", "video", "insta", "yt"].forEach(
    (dir) => eleventyConfig.addPassthroughCopy(dir)
  );
  // kaitori は PWA の動作に必要なファイルだけ配信する（2026-09-01）。
  // HANDOFF.md・docs/（規程・指示書）は内部文書のため本番に載せない。
  // line-bot/ は GAS ソース＝サイトで配信する理由がないため丸ごと配信停止。
  // ※ sw.js の CORE キャッシュ対象はすべて下記に含まれている（タブレット影響なし）
  [
    "kaitori/*.html",
    "kaitori/*.js",
    "kaitori/*.css",
    "kaitori/*.json",
    "kaitori/icons",
    "kaitori/vendor",
    "kaitori/data",
  ].forEach((p) => eleventyConfig.addPassthroughCopy(p));
  // ルート直下の公開必須ファイル
  eleventyConfig.addPassthroughCopy("CNAME"); // 独自ドメイン。消えると本番が落ちる
  eleventyConfig.addPassthroughCopy(".nojekyll");
  eleventyConfig.addPassthroughCopy("robots.txt");
  eleventyConfig.addPassthroughCopy("sitemap.xml");
  eleventyConfig.addPassthroughCopy("line-richmenu.html");
  eleventyConfig.addPassthroughCopy("line-richmenu.png");
  eleventyConfig.addPassthroughCopy("line-richmenu-final.png");
  eleventyConfig.addPassthroughCopy("line-richmenu-b-final.png");

  // 2026-09-25 BudouX：見出し・リード・箇条書き・FAQ の質問・タイルのラベルを文節で区切り <wbr> を入れる
  // （語中改行「買い取／っている」対策。CSS 側の word-break: keep-all とセット。JSON-LD には触れない）
  const { loadDefaultJapaneseParser } = require("budoux");
  const budoux = loadDefaultJapaneseParser();
  const JA = /[぀-ヿ㐀-鿿]/;
  const segText = (text) =>
    text.split(/(&[a-zA-Z#0-9]+;)/).map((part, i) => {
      if (i % 2 === 1 || !JA.test(part) || part.includes("<wbr>")) return part;
      const segs = [];
      for (const seg of budoux.parse(part)) {
        // 1文字だけの断片（「か｜ほく」「子ども｜用」など）は隣とつなげる
        if (segs.length && (segs[segs.length - 1].length === 1 || seg.length === 1)) segs[segs.length - 1] += seg;
        else segs.push(seg);
      }
      return segs.join("<wbr>")
        .replace(/か<wbr>ほく/g, "かほく") // 地名「かほく」は割らない
        .replace(/・(?!<wbr>)(?=\S)/g, "・<wbr>"); // 「ロード・クロス・MTB」などは中黒の後で折り返せるように
    }).join("");
  const segInner = (inner) => inner.split(/(<[^>]+>)/).map((piece, i) => (i % 2 === 1 ? piece : segText(piece))).join("");
  const RE_TAG = /<(h1|h2|h3|h4|summary|li)(\s[^>]*)?>([\s\S]*?)<\/\1>/g;
  const RE_CLS = /<(p|span)(\s[^>]*class="[^"]*\b(?:lead|genre__jp|wfeat__t|badge)\b[^"]*"[^>]*)>([\s\S]*?)<\/\1>/g;
  eleventyConfig.addTransform("budoux", function (content) {
    const out = this.page && this.page.outputPath;
    if (!out || !out.endsWith(".html")) return content;
    return content
      .replace(RE_TAG, (m, tag, attrs, inner) => `<${tag}${attrs || ""}>${segInner(inner)}</${tag}>`)
      .replace(RE_CLS, (m, tag, attrs, inner) => `<${tag}${attrs}>${segInner(inner)}</${tag}>`);
  });

  return {
    dir: { input: ".", output: "_site", includes: "_includes" },
    templateFormats: ["html"], // .md や .py は出力しない（＝ソースは公開されない）
    htmlTemplateEngine: "njk",
  };
};
