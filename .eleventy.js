// Eleventy 設定
// - 入力はリポジトリ直下。index.html / privacy.html だけをテンプレート処理し、
//   共通パーツ（_includes/）を {% include %} で差し込む。
// - それ以外（アセット・kaitori PWA・insta/yt などの独立HTML）は素通しコピー。
// - kaitori/ には一切テンプレート処理を掛けない（.eleventyignore で除外し、passthroughで丸ごとコピー）。
module.exports = function (eleventyConfig) {
  // アセット・独立セクションを検証なしでそのまま出力へコピー
  ["css", "js", "images", "logo", "video", "insta", "yt", "kaitori", "line-bot"].forEach(
    (dir) => eleventyConfig.addPassthroughCopy(dir)
  );
  // ルート直下の公開必須ファイル
  eleventyConfig.addPassthroughCopy("CNAME"); // 独自ドメイン。消えると本番が落ちる
  eleventyConfig.addPassthroughCopy(".nojekyll");
  eleventyConfig.addPassthroughCopy("robots.txt");
  eleventyConfig.addPassthroughCopy("sitemap.xml");
  eleventyConfig.addPassthroughCopy("line-richmenu.html");
  eleventyConfig.addPassthroughCopy("line-richmenu.png");
  eleventyConfig.addPassthroughCopy("line-richmenu-final.png");
  eleventyConfig.addPassthroughCopy("line-richmenu-b-final.png");

  return {
    dir: { input: ".", output: "_site", includes: "_includes" },
    templateFormats: ["html"], // .md や .py は出力しない（＝ソースは公開されない）
    htmlTemplateEngine: "njk",
  };
};
