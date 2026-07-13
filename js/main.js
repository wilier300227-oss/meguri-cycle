// めぐり自転車 main.js

// ナビゲーション：スクロール時にシャドウを付ける
const nav = document.getElementById('site-nav');
if (nav) {
  const onScroll = () => {
    nav.classList.toggle('scrolled', window.scrollY > 8);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // 初期状態を反映
}

// スムーズスクロール（reduced-motion 対応）
// html { scroll-behavior: smooth } を CSS 側で定義しているが、
// ナビ固定分のオフセットをここで補正する
const NAV_HEIGHT = 56; // ナビの高さ (px) — ナビの高さを変えた場合はここも変更

document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const id = link.getAttribute('href');
    if (id === '#') return; // TODO プレースホルダーリンクはスキップ
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const top = target.getBoundingClientRect().top + window.scrollY - NAV_HEIGHT;

    window.scrollTo({
      top,
      behavior: prefersReduced ? 'auto' : 'smooth',
    });

    // フォーカスをセクションに移動（アクセシビリティ）
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
});

// FAQアコーディオン：同時に複数開かない（任意。全部開けたい場合はこのブロックを削除）
const faqItems = document.querySelectorAll('.faq-item');
faqItems.forEach(item => {
  item.addEventListener('toggle', () => {
    if (item.open) {
      faqItems.forEach(other => {
        if (other !== item) other.removeAttribute('open');
      });
    }
  });
});
