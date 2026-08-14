// Tailwind CDN 共通設定（全ページ共有）
// このファイルを唯一の真実源とする。各ページの <head> で CDN スクリプトの直後に読み込む。
// 色・フォントのトークンを増減するときはここだけを編集する。
tailwind.config = {
  theme: {
    extend: {
      colors: {
        paper: '#FAFAF8',
        ink: '#20302E',
        accent: '#1F5FA8',
      },
      fontFamily: {
        mincho: ['"Shippori Mincho B1"', 'serif'],
        gothic: ['"Zen Kaku Gothic New"', 'sans-serif'],
        barlow: ['"Barlow Semi Condensed"', 'sans-serif'],
      },
    }
  }
}
