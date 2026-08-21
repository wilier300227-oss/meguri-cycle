// PC向けCTA振り分け（全 head-new ページ共通）
// LINEの oaMessage リンク（＝入力済みメッセージ付き。スマホアプリ専用で、PCだと
// LINEトップにフォールバックして壊れる）を、PCでは友だち追加ページに差し替える。
// スマホ（iPhone/iPad/iPod/Android）はそのまま＝計測キー付きのメッセージが開く。
(function () {
  if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) return;
  var pcUrl = 'https://line.me/R/ti/p/@136bpsyc'; // フッターのLINEアイコンと同一URL
  function apply() {
    var links = document.querySelectorAll('a[href*="/R/oaMessage/"]');
    for (var i = 0; i < links.length; i++) { links[i].href = pcUrl; }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
