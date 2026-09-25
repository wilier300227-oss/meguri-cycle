// 出張費（出張引取のみ）の単一源（2026-09-16 T2 で新設）。
// かほく市役所起点・Googleマップの走行距離（片道）で決まる。表示用の文字列もここで作る。
// ⚠ ここを直すと、この値を参照しているページ（price.html・kanazawa.html）の表示が変わる。
//   ほかの市町ページ・index・lp・dendo・hikitori・terms の表はまだ直書き（別途テンプレ化するまで手で合わせる）。
//   LINE ボットの出張費は Google シート fee_master が正（このファイルとは連動しない）。
const bands = [
  { maxKm: 10, yen: 1000 },
  { maxKm: 20, yen: 1500 },
  { maxKm: 30, yen: 2000 },
  { maxKm: 40, yen: 2500 },
  { maxKm: 50, yen: 3000 },
];

const yen = (n) => n.toLocaleString("ja-JP") + "円";

// 表の1行ずつ（「〜10km」「10〜20km」…「50km超」）
const rows = bands.map((b, i) => ({
  label: (i === 0 ? "〜" : bands[i - 1].maxKm + "〜") + b.maxKm + "km",
  price: yen(b.yen),
}));
rows.push({ label: bands[bands.length - 1].maxKm + "km超", price: "応相談", muted: true });

// 距離 → 出張費（50km超は null）
const feeForKm = (km) => {
  const b = bands.find((x) => km <= x.maxKm);
  return b ? b.yen : null;
};

// 市内で距離に幅がある市の片道距離（かほく市役所起点、各市ページの記載値）
const cityKm = {
  kanazawa: { minKm: 14, maxKm: 32, note: "北部の森本・若松あたりで約14km、南部の額・押野で約32km" },
};

// 市ごとの出張費の幅（例：金沢市 → 「1,500円〜2,500円」）
const cities = {};
for (const [slug, c] of Object.entries(cityKm)) {
  const lo = feeForKm(c.minKm);
  const hi = feeForKm(c.maxKm);
  cities[slug] = Object.assign({}, c, {
    minYen: lo,
    maxYen: hi,
    range: lo === hi ? yen(lo) : yen(lo) + "〜" + yen(hi),
  });
}

module.exports = { bands, rows, cities };
