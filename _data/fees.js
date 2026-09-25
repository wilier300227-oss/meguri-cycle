// 出張費（出張引取のみ）の単一源（2026-09-16 T2 で新設）。
// かほく市役所起点・Googleマップの走行距離（片道）で決まる。表示用の文字列もここで作る。
// ⚠ ここを直すと、この値を参照しているページ（price.html・kanazawa.html・oyabe.html・himi.html）の表示が変わる。
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
  takaoka: { minKm: 25, maxKm: 47, note: "福岡町で約25km、高岡駅周辺で約39km、伏木・太田で約47km" }, // 2026-09-25 レビュー対応（OSRM 福岡町五位25.2／高岡駅38.7／太田47.2km）→ 2,000円〜3,000円
  oyabe: { minKm: 15, maxKm: 31, note: "石動地区で約22km。宮島方面など北西部は近く、南部の一部は30kmを超えます" }, // 2026-09-25 オーナー決定（OSRM 名ケ滝15.3／石動22.2／興法寺30.7km）
  himi: { minKm: 34, maxKm: 50, note: "市役所のある鞍川や中心街で約45km、床鍋・熊無など県境寄りは約34〜37km。大境など北端の一部は50kmを超えます" }, // 2026-09-25 レビュー対応（OSRM 床鍋34.4／熊無35.1／鞍川44.9／中央町45.3／宇波49.9／大境52.0km）。北端50km超は「応相談」（2026-09-25 オーナー決定）
  hakui: { minKm: 21, maxKm: 33, note: "市役所周辺・千里浜町・粟生町で約22〜24km、一ノ宮町・滝町で約28km。柴垣町・神子原町など北部・東部の一部は30kmを超えます" }, // 2026-09-25 レビュー対応（OSRM 粟生21.7／市役所23.6／一ノ宮28.2／鹿島路30.5／柴垣31.5／神子原32.8km）
  hakusan: { minKm: 31, maxKm: 49, note: "松任（市役所）で約30km、美川・鶴来で約37〜38km、河内・鳥越で約47〜50km。吉野谷・尾口・白峰など50km超は応相談" }, // 2026-09-25 レビュー対応（OSRM 倉光30.2／美川浜町36.7／鶴来本町38.0／河内町吉岡47.0／別宮町49.8／吉野50.1／中宮71.2／白峰81.8km）
  kanazawa: { minKm: 14, maxKm: 42, note: "北部の森本あたりで約14km、中心部の香林坊・片町で約22km、南部の額で約31km。湯涌温泉より奥は40kmを超えます" }, // 2026-09-25: 若松は東部(約22km)・押野は約26km と判明したため例から外した。湯涌河内町 約42km → 上限 3,000円（オーナー決定）
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
