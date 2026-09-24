// ビルドごとに変わる版番号。CSS/JS の URL に ?v= で付けてブラウザキャッシュを確実に更新する（2026-09-24）。
// 以前は head-new.njk に固定値（?v=20260918）を直書きしており、CSS を変えても古いキャッシュが残っていた。
module.exports = { id: new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12) };
