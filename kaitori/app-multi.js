/* =========================================================
   タブレット買取記入システム — 複数台版（別ページ /kaitori/multi.html）
   入力 → 署名 → 確定ロック → PDF/PNG生成（最大5台・複数ページ対応）
   ・単台版 app.js の実績ある関数（採番/生年月日/zip/署名/描画）を流用。
   ・v1はローカル完結（GAS台帳・Drive連携なし）。オフライン(PWA)対応は後日フェーズ。
   対象端末: Redmi Pad SE (Android / Chrome)
   ========================================================= */
'use strict';

/* ---- 事業者固定情報（単台版と同一） ---- */
const BIZ = {
  brand: 'RAINBOW',
  tradeName: 'めぐり自転車',
  buyerName: '高多優典',
  license: '第511090015059号',
  licenseAuthority: '石川県公安委員会',
};

const MAX_BIKES = 5;
const MAX_OWNERS = 4;

/* ---- 状態 ---- */
let confirmedAt = null;
let isLocked = false;
let savedArtifacts = null;   // 確定時に生成したPDF/PNG（Blob）。リロード後の再ダウンロード用
let sigSeller = null;
let sigGuardian = null;
const sigOwners = [];        // 名義人①〜④の署名パッド（追加順）
let amountTouched = false;   // 合計金額を手修正したら自動合計で上書きしない

/* ---- 要素参照 ---- */
const $ = (id) => document.getElementById(id);
const els = {};
[
  'tradeNo','tradeDate','tradeType',
  'bikeList','btnAddBike','bikeCountNote',
  'amountTotal','payMethod',
  'idType','licenseFields','licenseAuthority','licenseAuthorityOther',
  'licenseAuthorityOtherField','licenseNumber','idNote',
  'pName','pZip','btnZip','zipNote','pAddress','pTel','pJob','pJobOther','pJobOtherField',
  'pBirth','pBirthY','pBirthM','pBirthD','pAgeView',
  'pledge','pledgeCorp',
  'ownerList','btnAddOwner','ownerConsentLine','ownerHouseholdConsent',
  'guardianCard','minorBanner','gName','gRelation','gRelationOther','gRelationOtherField',
  'gContact','gAddress','btnGuardianSameAddr','gIdMethod',
  'sigSeller','sigGuardian','sigSellerPh','sigGuardianPh',
  'validation','outputPanel','confirmStamp','btnConfirm',
  'btnPdfCert','btnPdfGuardian','btnImgCert','btnImgGuardian','sheetGuardian',
  'syncBox','syncStatus','btnSyncRetry',
  'cfgUrl','cfgToken','btnSaveCfg','btnClearCfg','cfgStatus',
  'appTitle','ledgerSettings',
  'confirmModal','btnConfirmYes','btnConfirmCancel',
  'btnFinish','finishModal','btnFinishYes','btnFinishCancel'
].forEach(k => els[k] = $(k));
const a4stage = document.querySelector('.a4-stage');

/* =========================================================
   1. 取引番号 自動採番  RB-YYYYMMDD-NNN
      ※ 単台版と同じ localStorage キー(rb_seq_)を共有するので、
        同じ端末で単台/複数台を混在させても番号が重複しない。
   ========================================================= */
function ymd(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
function seqKey(ymdStr) { return `rb_seq_${ymdStr}`; }
function refreshTradeNo() {
  const y = ymd(els.tradeDate.value);
  const committed = parseInt(localStorage.getItem(seqKey(y)) || '0', 10);
  els.tradeNo.value = `RB-${y}-${String(committed + 1).padStart(3, '0')}`;
}
function commitTradeNo() {
  const y = ymd(els.tradeDate.value);
  const committed = parseInt(localStorage.getItem(seqKey(y)) || '0', 10);
  localStorage.setItem(seqKey(y), String(committed + 1));
}

/* =========================================================
   2. 生年月日プルダウン（年→月→日）
   ========================================================= */
const BIRTH_YEAR_SPAN = 100;
const BIRTH_DEFAULT_AGE = 40;
function fillSelect(sel, values, placeholder) {
  const keep = sel.value;
  sel.innerHTML = `<option value="">${placeholder}</option>` +
    values.map(v => `<option value="${v}">${v}</option>`).join('');
  if (values.includes(Number(keep)) || values.includes(keep)) sel.value = keep;
}
function daysInMonth(y, m) {
  if (!y || !m) return 31;
  return new Date(Number(y), Number(m), 0).getDate();
}
function refreshBirthDays() {
  const y = els.pBirthY.value, m = els.pBirthM.value;
  const last = daysInMonth(y, m);
  const prev = Number(els.pBirthD.value);
  fillSelect(els.pBirthD, Array.from({ length: last }, (_, i) => i + 1), '日');
  els.pBirthD.value = prev && prev <= last ? String(prev) : '';
}
function syncBirth() {
  const y = els.pBirthY.value, m = els.pBirthM.value, d = els.pBirthD.value;
  els.pBirth.value = (y && m && d)
    ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    : '';
}
function initBirthSelects() {
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: BIRTH_YEAR_SPAN + 1 }, (_, i) => thisYear - i);
  fillSelect(els.pBirthY, years, '年');
  els.pBirthY.value = String(thisYear - BIRTH_DEFAULT_AGE);
  fillSelect(els.pBirthM, Array.from({ length: 12 }, (_, i) => i + 1), '月');
  refreshBirthDays();
  const onChange = () => { refreshBirthDays(); syncBirth(); updateAgeAndMinor(); runValidation(); };
  [els.pBirthY, els.pBirthM, els.pBirthD].forEach(s => s.addEventListener('change', onChange));
}

/* =========================================================
   3. 年齢自動算出 & 未成年判定
   ========================================================= */
function calcAge(birthStr, refStr) {
  if (!birthStr) return null;
  const b = new Date(birthStr + 'T00:00:00');
  const ref = refStr ? new Date(refStr + 'T00:00:00') : new Date();
  if (isNaN(b) || isNaN(ref)) return null;
  let age = ref.getFullYear() - b.getFullYear();
  const m = ref.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < b.getDate())) age--;
  return age >= 0 && age < 150 ? age : null;
}
function currentAge() { return calcAge(els.pBirth.value, els.tradeDate.value); }
function isMinor() { const a = currentAge(); return a !== null && a < 18; }
function updateAgeAndMinor() {
  const age = currentAge();
  els.pAgeView.textContent = age === null ? '—' : `${age} 歳`;
  const minor = isMinor();
  els.guardianCard.style.display = minor ? '' : 'none';
  els.btnPdfGuardian.style.display = minor ? '' : 'none';
  els.btnImgGuardian.style.display = minor ? '' : 'none';
  if (minor && sigGuardian) requestAnimationFrame(() => resizeCanvas(els.sigGuardian, sigGuardian));
}

/* ---- プルダウン＋「その他」自由記述のペア（フォーム直下の固定欄のみ。明細行/名義人は個別処理） ---- */
const OTHER_PAIRS = [
  ['pJob', 'pJobOther', 'pJobOtherField'],
  ['licenseAuthority', 'licenseAuthorityOther', 'licenseAuthorityOtherField'],
  ['gRelation', 'gRelationOther', 'gRelationOtherField'],
];
function updateOtherFields() {
  OTHER_PAIRS.forEach(([sel, other, wrap]) => {
    const isOther = els[sel].value === 'その他';
    els[wrap].style.display = isOther ? '' : 'none';
    if (!isOther) els[other].value = '';
  });
}
function pick(sel) {
  const v = els[sel].value;
  if (v !== 'その他') return v;
  const pair = OTHER_PAIRS.find(p => p[0] === sel);
  return els[pair[1]].value.trim() || 'その他';
}

/* =========================================================
   4. 本人確認区分による欄の出し分け（免許証のみ番号を表示・保存）
   ========================================================= */
function updateIdFields() {
  const v = els.idType.value;
  const isLicense = v === '運転免許証';
  els.licenseFields.style.display = isLicense ? '' : 'none';
  if (!isLicense) {
    els.licenseAuthority.value = BIZ.licenseAuthority;
    els.licenseAuthorityOther.value = '';
    els.licenseNumber.value = '';
  }
  updateOtherFields();
  if (v === 'マイナンバーカード' || v === '健康保険証＋補完書類') {
    els.idNote.style.display = '';
    els.idNote.textContent = '※ この区分では番号・写しを記録しません（表示も保存もしません）。';
  } else {
    els.idNote.style.display = 'none';
  }
}
function normalizeLicenseNumber() {
  const digits = els.licenseNumber.value.replace(/\D/g, '').slice(0, 12);
  if (els.licenseNumber.value !== digits) els.licenseNumber.value = digits;
}
function licenseNumberText() {
  const n = els.licenseNumber.value.replace(/\D/g, '');
  return n ? `第${n}号` : '';
}

/* =========================================================
   5. 郵便番号 → 住所 自動入力（北陸ローカル辞書＋zipcloud。オンライン前提）
   ========================================================= */
const ZIP_API = 'https://zipcloud.ibsnet.co.jp/api/search?zipcode=';
let ZIP_LOCAL = null, zipLocalLoading = null;
function loadLocalZip() {
  if (ZIP_LOCAL) return Promise.resolve(ZIP_LOCAL);
  if (!zipLocalLoading) {
    zipLocalLoading = fetch('data/zip_hokuriku.json')
      .then(r => r.ok ? r.json() : {})
      .then(j => (ZIP_LOCAL = j))
      .catch(() => (ZIP_LOCAL = {}));
  }
  return zipLocalLoading;
}
function zipDigits() { return els.pZip.value.replace(/\D/g, ''); }
function showZipNote(msg, isError) {
  els.zipNote.style.display = msg ? '' : 'none';
  els.zipNote.textContent = msg || '';
  els.zipNote.style.color = isError ? 'var(--danger)' : 'var(--muted)';
}
function applyZipResult(base) {
  if (els.pAddress.value.trim() && !els.pAddress.value.startsWith(base)) {
    showZipNote(`候補：${base}（住所欄に入力済みのため自動反映していません）`, true);
    return;
  }
  if (!els.pAddress.value.trim()) els.pAddress.value = base;
  showZipNote('住所を入力しました。続けて番地・建物名を入力してください。', false);
  els.pAddress.focus();
  runValidation();
}
async function lookupZip(auto) {
  if (isLocked) return;
  const zip = zipDigits();
  if (zip.length !== 7) {
    if (!auto) showZipNote('郵便番号は数字7桁で入力してください。', true);
    return;
  }
  showZipNote('住所を検索中…', false);
  const local = await loadLocalZip();
  if (local && local[zip]) { applyZipResult(local[zip]); return; }
  if (navigator.onLine) {
    try {
      const res = await fetch(ZIP_API + zip);
      const json = await res.json();
      const hit = json.results && json.results[0];
      if (hit) { applyZipResult(`${hit.address1}${hit.address2}${hit.address3}`); return; }
      showZipNote('該当する住所が見つかりませんでした。住所は手入力してください。', true);
      return;
    } catch (e) {}
  }
  showZipNote('オフラインのため県外の住所は自動入力できません。住所は手入力してください。', true);
}

/* =========================================================
   6. 対象自転車 明細（最大5台）
   ========================================================= */
const MAKER_OPTS = `<option value="">選択してください</option>
<option>あさひ</option><option>アンカー</option><option>イオンバイク</option>
<option>キャノンデール</option><option>コルナゴ</option><option>サカモトテクノ</option>
<option>シボレー</option><option>ジャイアント</option><option>スペシャライズド</option>
<option>ダホン</option><option>トレック</option><option>ドッペルギャンガー</option>
<option>ナショナル</option><option>ネスト</option><option>ハマー</option>
<option>パナソニック</option><option>ビアンキ</option><option>ブリヂストン</option>
<option>ブロンプトン</option><option>ホダカ</option><option>丸石サイクル</option>
<option>マルキン自転車</option><option>ミヤタ</option><option>メリダ</option>
<option>ヤマハ</option><option>ライトウェイ</option><option>ルイガノ</option>
<option>不明・ノーブランド</option><option value="その他">その他</option>`;
const MODEL_OPTS = `<option value="">選択してください</option>
<option value="シティサイクル（ママチャリ）">シティサイクル（ママチャリ）</option>
<option value="電動アシスト自転車">電動アシスト自転車</option>
<option value="子供用自転車">子供用自転車</option>
<option value="クロスバイク">クロスバイク</option>
<option value="ロードバイク">ロードバイク</option>
<option value="マウンテンバイク">マウンテンバイク</option>
<option value="折りたたみ自転車">折りたたみ自転車</option>
<option value="ミニベロ（小径車）">ミニベロ（小径車）</option>
<option value="三輪自転車">三輪自転車</option>
<option value="その他">その他</option>`;
const COLOR_OPTS = `<option value="">選択してください</option>
<option>白</option><option>黒</option><option>シルバー</option><option value="その他">その他</option>`;

function bikeRows() { return [...els.bikeList.querySelectorAll('.bike-row')]; }
function renumberBikes() {
  bikeRows().forEach((row, i) => {
    row.querySelector('.bike-no').textContent = `${i + 1}台目`;
  });
  const n = bikeRows().length;
  els.btnAddBike.disabled = n >= MAX_BIKES;
  els.bikeCountNote.textContent = `現在 ${n} 台（最大 ${MAX_BIKES} 台）`;
  // 1台のときは削除不可
  bikeRows().forEach(row => {
    row.querySelector('.bk-del').disabled = (n <= 1);
  });
}
function addBikeRow() {
  if (bikeRows().length >= MAX_BIKES) return;
  const row = document.createElement('div');
  row.className = 'bike-row';
  row.innerHTML = `
    <div class="bike-head">
      <span class="bike-no">台目</span>
      <button type="button" class="btn btn-xs btn-ghost bk-del">この台を削除</button>
    </div>
    <div class="field"><label>メーカー</label><select class="bk-maker">${MAKER_OPTS}</select></div>
    <div class="field bk-maker-other-f" style="display:none;"><label>メーカー（その他）</label><input type="text" class="bk-maker-other" placeholder="例）キャノンデール"></div>
    <div class="field"><label>車種</label><select class="bk-model">${MODEL_OPTS}</select></div>
    <div class="field bk-model-other-f" style="display:none;"><label>車種（その他）</label><input type="text" class="bk-model-other" placeholder="例）リカンベント"></div>
    <div class="field"><label>色</label><select class="bk-color">${COLOR_OPTS}</select></div>
    <div class="field bk-color-other-f" style="display:none;"><label>色（その他）</label><input type="text" class="bk-color-other" placeholder="例）ツートン（白／青）"></div>
    <div class="row2">
      <div class="field"><label>車体番号（フレーム番号）</label><input type="text" class="bk-frame"></div>
      <div class="field"><label>防犯登録番号</label><input type="text" class="bk-regist" placeholder="無い/不明は「なし」"></div>
    </div>
    <div class="field"><label class="req">買取金額（円）</label><input type="number" class="bk-amount" min="0" step="1" placeholder="例）8000"></div>`;
  els.bikeList.appendChild(row);
  hardenInputsForPrivacy();
  renumberBikes();
}
function delBikeRow(row) {
  if (bikeRows().length <= 1) return;
  row.remove();
  renumberBikes();
  recomputeTotal();
  runValidation();
}
/* 「その他」自由記述に解決した値 */
function rowPick(row, kind) {
  const sel = row.querySelector('.bk-' + kind);
  if (sel.value !== 'その他') return sel.value;
  const other = row.querySelector('.bk-' + kind + '-other');
  return (other && other.value.trim()) || 'その他';
}
function bikeIsFilled(row) {
  const anyText = ['maker','model','color'].some(k => row.querySelector('.bk-' + k).value)
    || ['frame','regist'].some(c => row.querySelector('.bk-' + c).value.trim())
    || row.querySelector('.bk-amount').value.trim();
  return anyText;
}
function collectBikes() {
  return bikeRows().filter(bikeIsFilled).map(row => ({
    maker: rowPick(row, 'maker'),
    model: rowPick(row, 'model'),
    color: rowPick(row, 'color'),
    frame: row.querySelector('.bk-frame').value.trim(),
    regist: row.querySelector('.bk-regist').value.trim(),
    amount: row.querySelector('.bk-amount').value.trim(),
  }));
}
function recomputeTotal() {
  if (amountTouched) return;
  let sum = 0, has = false;
  bikeRows().forEach(row => {
    const v = row.querySelector('.bk-amount').value;
    if (v !== '') { sum += Number(v) || 0; has = true; }
  });
  els.amountTotal.value = has ? String(sum) : '';
}
/* 明細リスト内の入力を委譲でハンドリング */
function onBikeListInput(e) {
  const t = e.target;
  if (t.classList.contains('bk-maker')) toggleRowOther(t, 'maker');
  if (t.classList.contains('bk-model')) toggleRowOther(t, 'model');
  if (t.classList.contains('bk-color')) toggleRowOther(t, 'color');
  if (t.classList.contains('bk-amount')) recomputeTotal();
  runValidation();
}
function toggleRowOther(sel, kind) {
  const row = sel.closest('.bike-row');
  const wrap = row.querySelector('.bk-' + kind + '-other-f');
  const isOther = sel.value === 'その他';
  wrap.style.display = isOther ? '' : 'none';
  if (!isOther) row.querySelector('.bk-' + kind + '-other').value = '';
}

/* =========================================================
   7. 防犯登録の名義人・同意（複数名義。最大4名。各自に同意署名）
   ========================================================= */
function ownerBlocks() { return [...els.ownerList.querySelectorAll('.owner-block')]; }
function renumberOwners() {
  ownerBlocks().forEach((b, i) => { b.querySelector('.owner-no').textContent = `名義人${['①','②','③','④'][i] || (i + 1)}`; });
  const n = ownerBlocks().length;
  els.btnAddOwner.disabled = n >= MAX_OWNERS;
  els.ownerConsentLine.style.display = n > 0 ? '' : 'none';
}
function addOwnerBlock() {
  if (ownerBlocks().length >= MAX_OWNERS) return;
  const block = document.createElement('div');
  block.className = 'owner-block';
  block.innerHTML = `
    <div class="owner-head">
      <span class="owner-no">名義人</span>
      <button type="button" class="btn btn-xs btn-ghost owner-del">削除</button>
    </div>
    <div class="row2">
      <div class="field"><label>氏名</label><input type="text" class="ow-name" placeholder="例）山田 花子"></div>
      <div class="field"><label>続柄</label><input type="text" class="ow-relation" placeholder="例）妻・子"></div>
    </div>
    <div class="field"><label>対象車体No. <span class="hint">（明細の台番号。例）1・3）</span></label><input type="text" class="ow-carno" placeholder="例）1・2"></div>
    <div class="field sig-wrap">
      <label>同意署名</label>
      <div class="sig-canvas-box"><canvas class="ow-sig"></canvas><div class="sig-placeholder ow-sig-ph">ここに署名してください</div></div>
      <div class="sig-actions"><button type="button" class="btn btn-sm btn-ghost ow-sig-clear">署名をクリア</button></div>
    </div>`;
  els.ownerList.appendChild(block);
  const canvas = block.querySelector('.ow-sig');
  const ph = block.querySelector('.ow-sig-ph');
  const pad = new SignaturePad(canvas, { penColor: '#111', backgroundColor: 'rgba(255,255,255,0)' });
  pad.addEventListener('beginStroke', () => { ph.style.display = 'none'; });
  pad.addEventListener('endStroke', runValidation);
  block._pad = pad;
  block._ph = ph;
  sigOwners.push(pad);
  block.querySelector('.ow-sig-clear').addEventListener('click', () => {
    if (isLocked) return;
    pad.clear(); ph.style.display = ''; runValidation();
  });
  hardenInputsForPrivacy();
  renumberOwners();
  requestAnimationFrame(() => resizeCanvas(canvas, pad));
}
function delOwnerBlock(block) {
  const idx = sigOwners.indexOf(block._pad);
  if (idx >= 0) sigOwners.splice(idx, 1);
  block.remove();
  renumberOwners();
  runValidation();
}
function collectOwners() {
  return ownerBlocks().map(b => ({
    name: b.querySelector('.ow-name').value.trim(),
    relation: b.querySelector('.ow-relation').value.trim(),
    carNo: b.querySelector('.ow-carno').value.trim(),
    sig: (b._pad && !b._pad.isEmpty()) ? b._pad.toDataURL('image/png') : '',
  })).filter(o => o.name || o.relation || o.carNo || o.sig);
}

/* =========================================================
   8. 署名パッド（譲渡人・保護者）
   ========================================================= */
function resizeCanvas(canvas, pad) {
  const w = canvas.offsetWidth, h = canvas.offsetHeight;
  if (!w || !h) return;
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const data = pad ? pad.toData() : null;
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  if (pad) { pad.clear(); if (data) pad.fromData(data); }
}
function initSignaturePads() {
  sigSeller = new SignaturePad(els.sigSeller, { penColor: '#111', backgroundColor: 'rgba(255,255,255,0)' });
  sigGuardian = new SignaturePad(els.sigGuardian, { penColor: '#111', backgroundColor: 'rgba(255,255,255,0)' });
  sigSeller.addEventListener('beginStroke', () => { els.sigSellerPh.style.display = 'none'; });
  sigGuardian.addEventListener('beginStroke', () => { els.sigGuardianPh.style.display = 'none'; });
  sigSeller.addEventListener('endStroke', runValidation);
  sigGuardian.addEventListener('endStroke', runValidation);
  requestAnimationFrame(() => {
    resizeCanvas(els.sigSeller, sigSeller);
    resizeCanvas(els.sigGuardian, sigGuardian);
  });
}
window.addEventListener('resize', () => {
  if (isLocked) return;
  resizeCanvas(els.sigSeller, sigSeller);
  if (isMinor()) resizeCanvas(els.sigGuardian, sigGuardian);
  ownerBlocks().forEach(b => resizeCanvas(b.querySelector('.ow-sig'), b._pad));
});

/* =========================================================
   9. 検証
   ========================================================= */
function isFilled(el) { return el && String(el.value).trim() !== ''; }
function collectMissing() {
  const miss = [];
  if (!isFilled(els.tradeDate)) miss.push('取引年月日');

  // 対象自転車（1台以上・各台に買取金額と特徴）
  const filled = bikeRows().filter(bikeIsFilled);
  if (filled.length === 0) {
    miss.push('対象自転車（1台以上）');
  } else {
    filled.forEach((row) => {
      const no = bikeRows().indexOf(row) + 1;
      const hasFeature = ['maker','model'].some(k => row.querySelector('.bk-' + k).value)
        || row.querySelector('.bk-frame').value.trim();
      if (!hasFeature) miss.push(`${no}台目の車種・メーカー・車体番号のいずれか`);
      if (!row.querySelector('.bk-amount').value.trim()) miss.push(`${no}台目の買取金額`);
    });
  }
  if (!isFilled(els.amountTotal)) miss.push('合計買取金額');

  if (!isFilled(els.idType)) miss.push('本人確認方法');

  const partyMiss = [];
  if (!isFilled(els.pName)) partyMiss.push('氏名');
  if (!isFilled(els.pAddress)) partyMiss.push('住所');
  if (!isFilled(els.pTel)) partyMiss.push('電話番号');
  if (!isFilled(els.pJob)) partyMiss.push('職業');
  else if (els.pJob.value === 'その他' && !isFilled(els.pJobOther)) partyMiss.push('職業(その他の内容)');
  if (!isFilled(els.pBirth)) partyMiss.push('生年月日(年齢)');
  if (partyMiss.length) miss.push('相手方の' + partyMiss.join('・'));

  if (!els.pledge.checked) miss.push('誓約事項（盗品でないこと）のチェック');
  if (!els.pledgeCorp.checked) miss.push('誓約事項（法人名義でないこと）のチェック');

  // 名義人：氏名等を入れた名義人には続柄・対象車体No.・同意署名を求める
  const owners = collectOwners();
  owners.forEach((o, i) => {
    const label = `名義人${['①','②','③','④'][i] || (i + 1)}`;
    const r = [];
    if (!o.name) r.push('氏名');
    if (!o.relation) r.push('続柄');
    if (!o.carNo) r.push('対象車体No.');
    if (!o.sig) r.push('同意署名');
    if (r.length) miss.push(`${label}の` + r.join('・'));
  });
  if (owners.length > 0 && !els.ownerHouseholdConsent.checked) {
    miss.push('名義人の世帯同意チェック');
  }

  if (!sigSeller || sigSeller.isEmpty()) miss.push('譲渡人の署名');

  if (isMinor()) {
    const g = [];
    if (!isFilled(els.gName)) g.push('氏名');
    if (!isFilled(els.gRelation)) g.push('続柄');
    else if (els.gRelation.value === 'その他' && !isFilled(els.gRelationOther)) g.push('続柄(その他の内容)');
    if (!isFilled(els.gContact)) g.push('連絡先');
    if (!isFilled(els.gAddress)) g.push('住所');
    if (!isFilled(els.gIdMethod)) g.push('本人確認');
    if (g.length) miss.push('保護者の' + g.join('・'));
    if (!sigGuardian || sigGuardian.isEmpty()) miss.push('保護者の同意署名');
  }
  return miss;
}
function runValidation() {
  if (isLocked) return true;
  const miss = collectMissing();
  const box = els.validation;
  if (miss.length === 0) {
    box.className = 'validation ok';
    box.style.display = '';
    box.innerHTML = '✅ 必須項目はすべて入力済みです。「署名を確定する」を押してください。';
    els.btnConfirm.disabled = false;
    return true;
  }
  box.className = 'validation ng';
  box.style.display = '';
  box.innerHTML = '⚠ 未入力のため署名確定・PDF生成はできません：<ul>' +
    miss.map(m => `<li>${m}</li>`).join('') + '</ul>';
  els.btnConfirm.disabled = true;
  return false;
}

/* =========================================================
   10. 確定 → ロック
   ========================================================= */
function lockForm() {
  isLocked = true;
  document.getElementById('kaitoriForm').classList.add('form-locked');
  document.querySelectorAll('#kaitoriForm input, #kaitoriForm select, #kaitoriForm textarea')
    .forEach(el => { el.setAttribute('readonly', 'readonly'); el.setAttribute('disabled', 'disabled'); });
  if (sigSeller) sigSeller.off();
  if (sigGuardian) sigGuardian.off();
  sigOwners.forEach(p => p.off());
  els.btnAddBike.disabled = true;
  els.btnAddOwner.disabled = true;
}
function onConfirm() {
  if (!runValidation()) return;
  els.confirmModal.hidden = false;
}
async function doConfirm() {
  els.confirmModal.hidden = true;
  confirmedAt = new Date().toISOString();
  commitTradeNo();
  lockForm();

  const human = new Date(confirmedAt).toLocaleString('ja-JP',
    { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' });
  els.confirmStamp.innerHTML =
    `取引番号：<b>${els.tradeNo.value}</b><br>` +
    `署名確定時刻：<b>${human}</b><br>` +
    `<span style="font-size:.75rem;color:#888;">ISO8601: ${confirmedAt}</span>`;

  els.validation.style.display = 'none';
  document.querySelector('.confirm-bar .inner').innerHTML =
    '<div class="locked-note btn-block">🔒 署名を確定しました。書類（PDF・画像）を作成しています…</div>';

  // 出力物（PDF/PNG）を1回だけ生成して端末（IndexedDB）に保存する。
  // Androidは「保存（ダウンロード）」でPWAをリロードすることがあり、そのままだと
  // 次の取引の新規フォームが開いてしまう。保存しておけば、リロード後も同じ取引の
  // 保存パネルに戻って再ダウンロードできる（復元は init() で行う）。
  //
  // ★オフライン崩れ対策（③-A-9と同型）：スムーズスクロールやパネル表示など
  //   ビューポートが動いている最中に html2canvas を走らせると、取り込み位置が
  //   狂って拡大・枠切れになる（オフラインは描画が速く顕在化）。そのため
  //   パネル表示・スクロールより【前】に、レイアウトが静止した状態で先に生成する。
  setOutputButtonsEnabled(false);
  try {
    await prepareAndStoreOutputs();
  } catch (e) {
    setSyncStatus('ng', '⚠ 書類の作成に失敗しました：' + esc(e.message || e));
  }
  setOutputButtonsEnabled(true);

  // 生成し終えてからパネルを表示・スクロールする
  document.querySelector('.confirm-bar .inner').innerHTML =
    '<div class="locked-note btn-block">🔒 署名を確定しました。下のボタンからPDF/画像を保存してください。</div>';
  els.outputPanel.classList.add('show');
  els.outputPanel.scrollIntoView({ behavior: 'smooth' });

  // 台帳・Drive へ非同期送信（車両ごとに1行。保存済みPDFを流用）
  enqueueAndSync();
}

/* =========================================================
   11. PDF/PNG生成（html2canvas → jsPDF。複数ページ対応）
   ========================================================= */
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function brandText() { return `${BIZ.brand}（${BIZ.tradeName}）`; }
function yen(v) { const n = Number(v); return isNaN(n) ? '—' : '¥' + n.toLocaleString('ja-JP'); }
function humanTime() {
  if (!confirmedAt) return '';
  return new Date(confirmedAt).toLocaleString('ja-JP',
    { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' });
}
function idMethodText() {
  const t = els.idType.value;
  if (t === '運転免許証') {
    const auth = esc(pick('licenseAuthority') || BIZ.licenseAuthority);
    const num = esc(licenseNumberText());
    return `${esc(t)}（${auth}${num ? '　' + num : ''}）`;
  }
  return esc(t);
}

/* 譲渡証明書の本文を「トップレベルのブロック」の配列で組み立てる。
   ページ送りはこのブロック単位で行い、明細行や署名がページ境界で切れないようにする。 */
function buildCertBlocks() {
  const age = currentAge();
  const bikes = collectBikes();
  const owners = collectOwners();
  const sellerSig = (sigSeller && !sigSeller.isEmpty()) ? sigSeller.toDataURL('image/png') : '';
  const blocks = [];

  // A. タイトル＋譲受人
  blocks.push(`
    <div class="doc-title">譲渡証明書 兼 代金受領書・委任状</div>
    <div class="doc-no">取引番号：${esc(els.tradeNo.value)}</div>
    <p class="lead">下記の自転車（古物・複数台）を譲受人へ譲渡し、その代金を受領したことを証明します。あわせて、防犯登録の抹消その他名義変更に必要な手続きを譲受人に委任します。</p>
    <div class="sec-title">譲受人</div>
    <table class="kv">
      <tr><th>屋号</th><td>${esc(brandText())}</td></tr>
      <tr><th>氏名</th><td>${esc(BIZ.buyerName)}</td></tr>
      <tr><th>古物商許可番号</th><td>${esc(BIZ.license)}（${esc(BIZ.licenseAuthority)}）</td></tr>
    </table>`);

  // B. 譲渡人（相手方）＋本人確認
  blocks.push(`
    <div class="sec-title">譲渡人（相手方）</div>
    <table class="kv">
      <tr><th>氏名</th><td>${esc(els.pName.value)}</td></tr>
      <tr><th>住所</th><td>${esc(els.pAddress.value)}</td></tr>
      <tr><th>電話番号</th><td>${esc(els.pTel.value)}</td></tr>
      <tr><th>職業</th><td>${esc(pick('pJob'))}</td></tr>
      <tr><th>生年月日 / 年齢</th><td>${esc(els.pBirth.value)}${age!==null?`<span class="age-badge">（${age}歳）</span>`:''}</td></tr>
      <tr><th>本人確認方法</th><td>${idMethodText()}</td></tr>
    </table>`);

  // C. 取引内容＋明細表＋合計
  const rowsHtml = bikes.map((b, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${esc(b.maker) || '—'}</td>
      <td>${esc(b.model) || '—'}</td>
      <td>${esc(b.color) || '—'}</td>
      <td>${esc(b.frame) || '—'}</td>
      <td>${esc(b.regist) || '—'}</td>
      <td class="r">${b.amount !== '' ? yen(b.amount) : '—'}</td>
    </tr>`).join('');
  blocks.push(`
    <div class="sec-title">取引内容</div>
    <table class="kv">
      <tr><th>取引年月日</th><td>${esc(els.tradeDate.value)}</td></tr>
      <tr><th>取引区分</th><td>${esc(els.tradeType.value)}</td></tr>
      <tr><th>品目 / 台数</th><td>自転車　／　${bikes.length} 台</td></tr>
    </table>
    <table class="bike-table">
      <thead><tr>
        <th>No</th><th>メーカー</th><th>車種</th><th>色</th><th>車体番号</th><th>防犯登録番号</th><th>買取金額(円)</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot><tr><td colspan="6" class="r">合計買取金額</td><td class="r"><b>${yen(els.amountTotal.value)}</b></td></tr></tfoot>
    </table>
    <table class="kv">
      <tr><th>支払方法</th><td>${esc(els.payMethod.value)}</td></tr>
    </table>`);

  // D. 誓約
  blocks.push(`<div class="pledge">本自転車は盗品・遺失物・不法投棄品ではなく、譲渡人が正当な権原に基づき譲渡するものであることを誓約します。また、会社・法人名義の自転車ではありません（個人名義の自転車です）。上記の買取金額を確かに受領しました。</div>`);

  // E. 名義人・同意（あれば。名義人ごとに1ブロック）
  if (owners.length) {
    blocks.push(`<div class="sec-title">防犯登録の名義人・同意（複数名義）</div>`);
    owners.forEach((o, i) => {
      const label = `名義人${['①','②','③','④'][i] || (i + 1)}`;
      blocks.push(`
        <div class="owner-cert">
          <div class="owner-line"><b>${label}</b>　氏名：${esc(o.name) || '—'}　続柄：${esc(o.relation) || '—'}　対象車体No.：${esc(o.carNo) || '—'}</div>
          <div class="sign-box">
            <div class="sign-label">同意署名</div>
            <div class="sign-img">${o.sig ? `<img src="${o.sig}" alt="署名">` : ''}</div>
          </div>
        </div>`);
    });
    blocks.push(`<div class="pledge small">上記の自転車はすべて同一世帯・家族の所有であり、防犯登録の抹消・名義変更に同意します。</div>`);
  }

  // F. 委任状
  blocks.push(`
    <div class="sec-title">委任状</div>
    <div class="pledge">私は、本書に記載の自転車の譲渡にあたり、防犯登録の抹消および名義変更に関する一切の手続きを ${esc(brandText())} に委任します。また、上記の買取金額を受領したことを確認します（本書をもって代金受領書を兼ねます）。</div>`);

  // G. 署名（譲渡人）
  blocks.push(`
    <div class="sign-area">
      <div class="sign-box">
        <div class="sign-label">譲渡人（相手方）署名</div>
        <div class="sign-img">${sellerSig ? `<img src="${sellerSig}" alt="署名">` : ''}</div>
        <div class="confirm-time">署名確定時刻：${esc(humanTime())}</div>
      </div>
    </div>`);

  return blocks;
}

const PAGE_BODY_MAX = 1010;  // A4本文の詰め上限(px)。超えたら次ページへ（footerぶんの余白込み）
function clearCertPages() {
  a4stage.querySelectorAll('.a4-sheet.cert-page').forEach(n => n.remove());
}
function newCertPage() {
  const page = document.createElement('div');
  page.className = 'a4-sheet multi cert-page';
  page.innerHTML = `<div class="sheet-body"></div><div class="page-foot"></div>`;
  a4stage.appendChild(page);
  return page;
}
/* ブロックをA4ページに詰める。1ブロックがページ本文上限を超えないよう前提（明細5台・名義人1名は収まる） */
function paginateCertSheets() {
  clearCertPages();
  const blocks = buildCertBlocks();
  const pages = [];
  let page = newCertPage(); pages.push(page);
  let body = page.querySelector('.sheet-body');
  blocks.forEach(html => {
    const blk = document.createElement('div');
    blk.className = 'cert-blk';
    blk.innerHTML = html;
    body.appendChild(blk);
    if (body.offsetHeight > PAGE_BODY_MAX && body.children.length > 1) {
      body.removeChild(blk);
      page = newCertPage(); pages.push(page);
      body = page.querySelector('.sheet-body');
      body.appendChild(blk);
    }
  });
  pages.forEach((p, i) => {
    p.querySelector('.page-foot').innerHTML =
      `${esc(brandText())}　古物商許可 ${esc(BIZ.license)}（${esc(BIZ.licenseAuthority)}）／ 取引番号 ${esc(els.tradeNo.value)}` +
      `<span class="pageno">${i + 1} / ${pages.length}</span>`;
  });
  return pages;
}

function buildGuardianSheet() {
  const sig = (sigGuardian && !sigGuardian.isEmpty()) ? sigGuardian.toDataURL('image/png') : '';
  const age = currentAge();
  const bikes = collectBikes();
  els.sheetGuardian.className = 'a4-sheet';
  els.sheetGuardian.innerHTML = `
    <div class="doc-title">保護者同意書</div>
    <div class="doc-no">取引番号：${esc(els.tradeNo.value)}</div>
    <p class="lead">私は、下記未成年者による自転車の譲渡（買取・引取）取引について、保護者として同意します。</p>
    <div class="sec-title">未成年者</div>
    <table class="kv">
      <tr><th>氏名</th><td>${esc(els.pName.value)}</td></tr>
      <tr><th>生年月日 / 年齢</th><td>${esc(els.pBirth.value)}${age!==null?`<span class="age-badge">（${age}歳）</span>`:''}</td></tr>
      <tr><th>住所</th><td>${esc(els.pAddress.value)}</td></tr>
    </table>
    <div class="sec-title">保護者</div>
    <table class="kv">
      <tr><th>氏名</th><td>${esc(els.gName.value)}</td></tr>
      <tr><th>続柄</th><td>${esc(pick('gRelation'))}</td></tr>
      <tr><th>住所</th><td>${esc(els.gAddress.value)}</td></tr>
      <tr><th>連絡先</th><td>${esc(els.gContact.value)}</td></tr>
      <tr><th>本人確認</th><td>${esc(els.gIdMethod.value)}</td></tr>
    </table>
    <div class="sec-title">取引の概要</div>
    <table class="kv">
      <tr><th>取引年月日</th><td>${esc(els.tradeDate.value)}</td></tr>
      <tr><th>対象物品</th><td>自転車　${bikes.length} 台</td></tr>
      <tr><th>合計買取金額</th><td><b>${yen(els.amountTotal.value)}</b></td></tr>
      <tr><th>譲受人</th><td>${esc(brandText())}　${esc(BIZ.buyerName)}　古物商許可 ${esc(BIZ.license)}</td></tr>
    </table>
    <div class="pledge">上記取引の内容を確認し、未成年者による当該自転車の譲渡に同意します。</div>
    <div class="sign-area">
      <div class="sign-box">
        <div class="sign-label">保護者 同意署名</div>
        <div class="sign-img">${sig ? `<img src="${sig}" alt="署名">` : ''}</div>
        <div class="confirm-time">署名確定時刻：${esc(humanTime())}</div>
      </div>
    </div>
    <div class="footer-note">
      ${esc(brandText())}　古物商許可番号 ${esc(BIZ.license)}（${esc(BIZ.licenseAuthority)}）／ 取引番号 ${esc(els.tradeNo.value)}
    </div>`;
}

/* シート内の全画像がデコード＆レイアウトされるまで待つ（単台版と同一の実機崩れ対策） */
async function waitForImages(sheetEl) {
  const imgs = [...sheetEl.querySelectorAll('img')];
  await Promise.all(imgs.map((img) => {
    if (img.complete && img.naturalWidth) {
      return img.decode ? img.decode().catch(() => {}) : Promise.resolve();
    }
    return new Promise((res) => { img.onload = img.onerror = res; });
  }));
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
  void sheetEl.getBoundingClientRect();
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
}
async function renderSheet(sheetEl) {
  await waitForImages(sheetEl);
  const w = sheetEl.offsetWidth, h = sheetEl.offsetHeight;
  return html2canvas(sheetEl, {
    scale: 2, backgroundColor: '#ffffff', useCORS: true,
    width: w, height: h, windowWidth: w, windowHeight: h,
    scrollX: 0, scrollY: 0, x: 0, y: 0,
    onclone: (doc) => {
      const stage = doc.querySelector('.a4-stage');
      if (stage) { stage.style.position = 'absolute'; stage.style.left = '0'; stage.style.top = '0'; }
    },
  });
}
function addCanvasToPdf(pdf, canvas) {
  const pageW = 210, pageH = 297;
  let w = pageW, h = canvas.height * pageW / canvas.width;
  if (h > pageH) { h = pageH; w = canvas.width * pageH / canvas.height; }
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', (pageW - w) / 2, 0, w, h);
}
function downloadCanvasPng(canvas, filename) {
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}
function sanitizeFileName(s) {
  return String(s == null ? '' : s).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
}
function docFileName(kind, ext) {
  const d = els.tradeDate.value ? new Date(els.tradeDate.value + 'T00:00:00') : new Date();
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  const name = sanitizeFileName(els.pName.value) || 'お客様';
  return `${sanitizeFileName(`${md} ${name}様 ${kind}`)}.${ext}`;
}

async function generateCertPdf() {
  if (!isLocked) return;
  const pages = paginateCertSheets();
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  for (let i = 0; i < pages.length; i++) {
    const canvas = await renderSheet(pages[i]);
    if (i > 0) pdf.addPage();
    addCanvasToPdf(pdf, canvas);
  }
  pdf.save(docFileName(els.tradeType.value, 'pdf'));
}
async function generateCertImage() {
  if (!isLocked) return;
  const pages = paginateCertSheets();
  for (let i = 0; i < pages.length; i++) {
    const canvas = await renderSheet(pages[i]);
    const suffix = pages.length > 1 ? `（${i + 1}）` : '';
    downloadCanvasPng(canvas, docFileName(els.tradeType.value + suffix, 'png'));
  }
}
async function generateGuardianPdf() {
  if (!isLocked || !isMinor()) return;
  buildGuardianSheet();
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  addCanvasToPdf(pdf, await renderSheet(els.sheetGuardian));
  pdf.save(docFileName('保護者同意書', 'pdf'));
}
async function generateGuardianImage() {
  if (!isLocked || !isMinor()) return;
  buildGuardianSheet();
  downloadCanvasPng(await renderSheet(els.sheetGuardian), docFileName('保護者同意書', 'png'));
}

/* =========================================================
   11.5 台帳・Drive連携（1車両=1行）
        確定後、車両ごとに 取引データ＋PDF(base64) を GAS Web App へ送信。
        ・単台版と同じ localStorage キー（設定・キュー）を共有する。
        ・GASは無改修。既存の action:'append' を車両の数だけ呼び、取引番号は
          枝番付き（RB-YYYYMMDD-NNN-01）で送る＝台帳に1車両=1行で並ぶ。
        ・PDF（複数ページの譲渡証明書＋保護者同意書）は枝番01の行にだけ添付し、
          Driveへの重複保存を避ける。
        ・失敗時は localStorage キューに退避し、online復帰・起動時に自動再送。
   ========================================================= */
const QUEUE_KEY = 'rb_ledger_queue';   // 単台版と共有
const CFG_KEY = 'rb_ledger_config';    // 単台版と共有（端末に一度だけ保存）

function loadConfig() {
  const f = window.KAITORI_CONFIG || {};
  let ls = {};
  try { ls = JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch (e) {}
  return {
    gasUrl: (ls.gasUrl || f.gasUrl || '').trim(),
    token: (ls.token || f.token || '').trim(),
  };
}
let CFG = loadConfig();
function ledgerConfigured() { return !!(CFG.gasUrl && CFG.token); }

function showCfgStatus() {
  const ok = ledgerConfigured();
  els.cfgStatus.textContent = ok
    ? '✅ この端末で台帳連携が有効です。'
    : '未設定：GAS URL とトークンを入れて保存すると、この端末で台帳連携が有効になります。';
  els.cfgStatus.style.color = ok ? 'var(--ok)' : 'var(--muted)';
}
function saveLedgerConfig() {
  const cfg = { gasUrl: els.cfgUrl.value.trim(), token: els.cfgToken.value.trim() };
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  CFG = loadConfig();
  showCfgStatus();
  if (ledgerConfigured() && readQueue().length) flushQueue();
}
function clearLedgerConfig() {
  localStorage.removeItem(CFG_KEY);
  CFG = loadConfig();
  els.cfgUrl.value = CFG.gasUrl;
  els.cfgToken.value = CFG.token;
  showCfgStatus();
}

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
  catch (e) { return []; }
}
function writeQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }

function setSyncStatus(kind, html) {
  els.syncBox.style.display = '';
  els.syncStatus.className = 'sync-status ' + kind; // ok | ng | pending
  els.syncStatus.innerHTML = html;
}

/* 車体番号No.（"1・3" 等）をゆるくパースして数値配列に */
function parseCarNos(s) { return (String(s || '').match(/\d+/g) || []).map(Number); }
/* その車両の防犯登録名義人（台帳セル用）。名義人の対象車体No.に一致すれば本人以外、
   名義人指定が全く無ければ空欄（本人 or 登録なしは現物確認に委ねる） */
function registOwnerForBike(owners, no) {
  const m = owners.find(o => parseCarNos(o.carNo).includes(no));
  if (m) return `本人以外（${m.name}・続柄 ${m.relation}／同意署名あり）`;
  return owners.length ? '本人（名義人指定なし）' : '';
}
/* 車両1台ぶんの「特徴」（法定記載事項）。明細列から自動生成 */
function bikeFeatureText(b) {
  const parts = [];
  if (b.maker) parts.push(b.maker);
  if (b.model) parts.push(b.model);
  if (b.color) parts.push(`色：${b.color}`);
  if (b.frame) parts.push(`フレーム番号：${b.frame}`);
  if (b.regist) parts.push(`防犯登録：${b.regist}`);
  return parts.join('／');
}

/* 台帳に送る「1車両=1行」のレコード配列（共通の相手方情報を各行に複製） */
function collectRecords() {
  const isLic = els.idType.value === '運転免許証';
  const idNumber = isLic ? `${pick('licenseAuthority')} ${licenseNumberText()}`.trim() : '';
  const minor = isMinor();
  const common = {
    tradeDate: els.tradeDate.value,
    tradeType: els.tradeType.value,
    pName: els.pName.value,
    pAddress: els.pAddress.value,
    pTel: els.pTel.value,
    pJob: pick('pJob'),
    pBirth: els.pBirth.value,
    age: currentAge(),
    idType: els.idType.value,
    idNumber: idNumber,
    payMethod: els.payMethod.value,
    isMinor: minor,
    gName: minor ? els.gName.value : '',
    gRelation: minor ? pick('gRelation') : '',
    gAddress: minor ? els.gAddress.value : '',
    gContact: minor ? els.gContact.value : '',
    gIdMethod: minor ? els.gIdMethod.value : '',
    confirmedAt: confirmedAt,
  };
  const owners = collectOwners();
  const bikes = collectBikes();
  const base = els.tradeNo.value;
  return bikes.map((b, i) => Object.assign({}, common, {
    tradeNo: `${base}-${String(i + 1).padStart(2, '0')}`,  // 枝番付き＝1車両1行
    bMaker: b.maker,
    bModel: b.model,
    bColor: b.color,
    bFrame: b.frame,
    bRegist: b.regist,
    registOwner: registOwnerForBike(owners, i + 1),
    accessories: '',
    bItem: '自転車',
    bQty: '1',
    bFeature: bikeFeatureText(b),
    amount: b.amount,
  }));
}

/* 複数ページの譲渡証明書PDF → base64（データURIの先頭を除去） */
async function certPdfBase64() {
  const pages = paginateCertSheets();
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  for (let i = 0; i < pages.length; i++) {
    const canvas = await renderSheet(pages[i]);
    if (i > 0) pdf.addPage();
    addCanvasToPdf(pdf, canvas);
  }
  return pdf.output('datauristring').split(',')[1];
}
async function guardianPdfBase64() {
  buildGuardianSheet();
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  addCanvasToPdf(pdf, await renderSheet(els.sheetGuardian));
  return pdf.output('datauristring').split(',')[1];
}

/* 確定直後に呼ぶ：PDFをbase64化 → 車両ごとにキュー投入 → 送信を試みる */
async function enqueueAndSync() {
  if (!ledgerConfigured()) {
    setSyncStatus('pending',
      '⚠ 台帳送信はこの端末で未設定です。タイトルを長押し →「⚙ 台帳連携の設定」でGAS URL・トークンを保存してください（PDF・画像の保存は可能）。');
    els.btnSyncRetry.style.display = 'none';
    return;
  }
  setSyncStatus('pending', '⏳ 台帳・Driveへ保存する書類を準備しています…');
  try {
    // 確定時に生成済みのPDF（savedArtifacts）を流用して二重描画を避ける。無ければ都度生成。
    const certB64 = savedArtifacts && savedArtifacts.certPdf
      ? await blobToBase64(savedArtifacts.certPdf) : await certPdfBase64();
    const pdfs = [{
      kind: 'cert',
      name: `${els.tradeNo.value}_譲渡証明書.pdf`,
      b64: certB64,
    }];
    if (isMinor()) {
      const gB64 = savedArtifacts && savedArtifacts.guardianPdf
        ? await blobToBase64(savedArtifacts.guardianPdf) : await guardianPdfBase64();
      pdfs.push({
        kind: 'guardian',
        name: `${els.tradeNo.value}_保護者同意書.pdf`,
        b64: gB64,
      });
    }
    const records = collectRecords();
    const q = readQueue();
    records.forEach((rec, i) => {
      // PDFは先頭（枝番01）の行にだけ添付（Drive重複を避ける）
      const item = { id: rec.tradeNo, action: 'append', record: rec, pdfs: i === 0 ? pdfs : [] };
      if (!q.some(x => x.id === item.id)) q.push(item);
    });
    writeQueue(q);
  } catch (e) {
    setSyncStatus('ng', '⚠ 送信データの準備に失敗しました：' + esc(e.message || e));
    els.btnSyncRetry.style.display = '';
    return;
  }
  await flushQueue();
}

/* キューを順に送信。Content-Typeを付けない＝text/plain扱いでプリフライトを避ける（GAS Web App対応） */
async function flushQueue() {
  if (!ledgerConfigured()) return;
  const q = readQueue();
  if (!q.length) return;

  setSyncStatus('pending', `⏳ 台帳・Driveへ送信中…（未送信 ${q.length} 件）`);
  const remaining = [];
  let lastLinks = null;
  for (const item of q) {
    try {
      const res = await fetch(CFG.gasUrl, {
        method: 'POST',
        body: JSON.stringify(Object.assign({ token: CFG.token }, item)),
      });
      const data = await res.json();
      if (data.status === 'ok') { if (data.links) lastLinks = data.links; }
      else { remaining.push(item); }
    } catch (e) {
      remaining.push(item);
    }
  }
  writeQueue(remaining);

  if (remaining.length === 0) {
    let linkHtml = '';
    if (lastLinks) {
      if (lastLinks.cert) linkHtml += ` <a href="${lastLinks.cert}" target="_blank" rel="noopener">証明書PDF</a>`;
      if (lastLinks.guardian) linkHtml += ` ／ <a href="${lastLinks.guardian}" target="_blank" rel="noopener">保護者同意書PDF</a>`;
    }
    setSyncStatus('ok', '✅ 各車両を台帳に1行ずつ記録し、PDFをDriveへ保存しました。' + linkHtml);
    els.btnSyncRetry.style.display = 'none';
  } else {
    setSyncStatus('ng',
      `⚠ 送信できませんでした（未送信 ${remaining.length} 件）。オフラインの可能性があります。電波の良い場所で「再送」してください。`);
    els.btnSyncRetry.style.display = '';
  }
}

/* タイトルを約1.5秒長押しで「台帳連携の設定」を表示（事業者専用の隠し操作） */
function setupTitleLongPress() {
  const el = els.appTitle;
  if (!el) return;
  let timer = null;
  const LONG_MS = 1500;
  const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const start = () => { clearTimer(); timer = setTimeout(revealSettings, LONG_MS); };
  function revealSettings() {
    els.ledgerSettings.hidden = false;
    els.ledgerSettings.open = true;
    els.ledgerSettings.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', clearTimer);
  el.addEventListener('pointerleave', clearTimer);
  el.addEventListener('pointercancel', clearTimer);
  el.addEventListener('pointermove', clearTimer);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

/* =========================================================
   11.6 出力物（PDF/PNG）の端末保存と、リロード後の復元
        Androidは「保存（ダウンロード）」でPWAをリロードすることがある。
        確定時に PDF/PNG を IndexedDB に保存しておき、リロード後は同じ取引の
        保存パネルに戻して再ダウンロードできるようにする（次の取引へ進むのは
        「完了」ボタンのときだけ）。
   ========================================================= */
const ACTIVE_KEY = 'rb_multi_active';   // 復元対象の取引番号（localStorage・小さい印）
const IDB_NAME = 'rbMultiOutputs', IDB_STORE = 'artifacts';

function idbOpen() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(IDB_STORE); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbPut(key, val) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const t = db.transaction(IDB_STORE, 'readwrite');
    t.objectStore(IDB_STORE).put(val, key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const t = db.transaction(IDB_STORE, 'readonly');
    const rq = t.objectStore(IDB_STORE).get(key);
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}
async function idbDel(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const t = db.transaction(IDB_STORE, 'readwrite');
    t.objectStore(IDB_STORE).delete(key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
function canvasToPngBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
function canvasesToPdfBlob(canvases) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  canvases.forEach((c, i) => { if (i > 0) pdf.addPage(); addCanvasToPdf(pdf, c); });
  return pdf.output('blob');
}
function dlBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* 確定時に呼ぶ：譲渡証明書（複数ページ）と保護者同意書を1回だけ描画し、
   PDF/PNG（Blob）＋ファイル名を savedArtifacts に保持し IndexedDB に保存する。 */
async function prepareAndStoreOutputs() {
  const kind = els.tradeType.value;
  const pages = paginateCertSheets();
  const certCanvases = [];
  for (const p of pages) certCanvases.push(await renderSheet(p));

  const art = {
    tradeNo: els.tradeNo.value,
    confirmedAt: confirmedAt,
    minor: isMinor(),
    certPdf: canvasesToPdfBlob(certCanvases),
    certPng: await Promise.all(certCanvases.map(canvasToPngBlob)),
    guardianPdf: null,
    guardianPng: null,
    names: {
      certPdf: docFileName(kind, 'pdf'),
      certPng: pages.length > 1
        ? pages.map((_, i) => docFileName(`${kind}（${i + 1}）`, 'png'))
        : [docFileName(kind, 'png')],
      guardianPdf: docFileName('保護者同意書', 'pdf'),
      guardianPng: [docFileName('保護者同意書', 'png')],
    },
  };
  if (art.minor) {
    buildGuardianSheet();
    const gc = await renderSheet(els.sheetGuardian);
    art.guardianPdf = canvasesToPdfBlob([gc]);
    art.guardianPng = [await canvasToPngBlob(gc)];
  }

  savedArtifacts = art;
  try {
    await idbPut(art.tradeNo, art);
    localStorage.setItem(ACTIVE_KEY, art.tradeNo);
  } catch (e) {
    // 保存に失敗しても、この画面が生きている間は savedArtifacts から再保存できる
    console.warn('出力物の端末保存に失敗:', e);
  }
}

/* 保存ボタンの実処理（保存済みBlobを再ダウンロード。無ければその場で生成にフォールバック） */
async function onSaveCertPdf() {
  if (!isLocked) return;
  if (savedArtifacts && savedArtifacts.certPdf) dlBlob(savedArtifacts.certPdf, savedArtifacts.names.certPdf);
  else await generateCertPdf();
}
async function onSaveCertPng() {
  if (!isLocked) return;
  if (savedArtifacts && savedArtifacts.certPng) savedArtifacts.certPng.forEach((b, i) => dlBlob(b, savedArtifacts.names.certPng[i]));
  else await generateCertImage();
}
async function onSaveGuardianPdf() {
  if (!isLocked) return;
  if (savedArtifacts && savedArtifacts.guardianPdf) dlBlob(savedArtifacts.guardianPdf, savedArtifacts.names.guardianPdf);
  else await generateGuardianPdf();
}
async function onSaveGuardianPng() {
  if (!isLocked) return;
  if (savedArtifacts && savedArtifacts.guardianPng) savedArtifacts.guardianPng.forEach((b, i) => dlBlob(b, savedArtifacts.names.guardianPng[i]));
  else await generateGuardianImage();
}

function setOutputButtonsEnabled(on) {
  [els.btnPdfCert, els.btnPdfGuardian, els.btnImgCert, els.btnImgGuardian].forEach(b => { b.disabled = !on; });
}

/* この取引を終了して次のお客さまへ（保存物を削除してリロード＝新規フォーム） */
async function finishTransaction() {
  try {
    const no = localStorage.getItem(ACTIVE_KEY) || els.tradeNo.value;
    if (no) await idbDel(no);
  } catch (e) {}
  localStorage.removeItem(ACTIVE_KEY);
  location.reload();
}

/* リロード後、確定済み取引を保存パネルとして復元する。true=復元した */
async function restoreCompleted(tradeNo) {
  let art = null;
  try { art = await idbGet(tradeNo); } catch (e) {}
  if (!art) return false;

  savedArtifacts = art;
  confirmedAt = art.confirmedAt;
  isLocked = true;
  els.tradeNo.value = art.tradeNo;
  document.body.classList.add('restored-mode');

  const human = new Date(art.confirmedAt).toLocaleString('ja-JP',
    { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' });
  els.confirmStamp.innerHTML =
    `<b>保存済みの取引です。</b>PDF・画像を再保存できます。<br>` +
    `取引番号：<b>${esc(art.tradeNo)}</b><br>署名確定時刻：<b>${human}</b>`;

  els.btnPdfGuardian.style.display = art.minor ? '' : 'none';
  els.btnImgGuardian.style.display = art.minor ? '' : 'none';
  els.outputPanel.classList.add('show');

  wireOutputButtons();
  wireFinishAndSettings();
  els.cfgUrl.value = CFG.gasUrl;
  els.cfgToken.value = CFG.token;
  showCfgStatus();
  setupTitleLongPress();
  if (readQueue().length) flushQueue();     // 未送信の台帳分があれば再送
  window.addEventListener('online', flushQueue);
  return true;
}

/* 保存ボタン・再送ボタンの配線（新規／復元の両方で使う） */
function wireOutputButtons() {
  els.btnPdfCert.addEventListener('click', onSaveCertPdf);
  els.btnPdfGuardian.addEventListener('click', onSaveGuardianPdf);
  els.btnImgCert.addEventListener('click', onSaveCertPng);
  els.btnImgGuardian.addEventListener('click', onSaveGuardianPng);
  els.btnSyncRetry.addEventListener('click', flushQueue);
}
/* 「完了」ダイアログと台帳設定カードの配線（新規／復元の両方で使う） */
function wireFinishAndSettings() {
  els.btnFinish.addEventListener('click', () => { els.finishModal.hidden = false; });
  els.btnFinishCancel.addEventListener('click', () => { els.finishModal.hidden = true; });
  els.finishModal.addEventListener('click', (e) => { if (e.target === els.finishModal) els.finishModal.hidden = true; });
  els.btnFinishYes.addEventListener('click', finishTransaction);
  els.btnSaveCfg.addEventListener('click', saveLedgerConfig);
  els.btnClearCfg.addEventListener('click', clearLedgerConfig);
}

/* =========================================================
   12. 初期化・イベント
   ========================================================= */
function hardenInputsForPrivacy() {
  const sel = '#kaitoriForm input[type="text"], #kaitoriForm input[type="tel"], ' +
              '#kaitoriForm input[type="number"], #kaitoriForm textarea';
  document.querySelectorAll(sel).forEach(el => {
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('autocorrect', 'off');
    el.setAttribute('autocapitalize', 'off');
    el.setAttribute('spellcheck', 'false');
  });
}

async function init() {
  // リロード直後に「確定済みだが完了していない取引」があれば、保存パネルとして復元する
  // （Androidが保存操作でPWAをリロードしても、次の取引に進まず再ダウンロードできる）
  const activeNo = localStorage.getItem(ACTIVE_KEY);
  if (activeNo) {
    const restored = await restoreCompleted(activeNo);
    if (restored) return;               // 復元したら通常の新規セットアップはしない
    localStorage.removeItem(ACTIVE_KEY); // 保存物が見つからない古い印は消して新規へ
  }

  const today = new Date();
  els.tradeDate.value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  refreshTradeNo();

  addBikeRow();          // 明細は1台から開始
  initSignaturePads();
  initBirthSelects();
  updateIdFields();
  updateOtherFields();
  updateAgeAndMinor();
  hardenInputsForPrivacy();

  els.tradeDate.addEventListener('change', () => { refreshTradeNo(); updateAgeAndMinor(); runValidation(); });
  els.idType.addEventListener('change', () => { updateIdFields(); runValidation(); });
  OTHER_PAIRS.forEach(([sel]) => {
    els[sel].addEventListener('change', () => { updateOtherFields(); runValidation(); });
  });

  // 郵便番号 → 住所
  els.btnZip.addEventListener('click', () => lookupZip(false));
  els.pZip.addEventListener('input', () => { if (zipDigits().length === 7) lookupZip(true); });
  els.licenseNumber.addEventListener('input', normalizeLicenseNumber);

  // 明細（追加/削除/その他/合計）は委譲で処理
  els.btnAddBike.addEventListener('click', () => { if (!isLocked) addBikeRow(); runValidation(); });
  els.bikeList.addEventListener('click', (e) => {
    if (isLocked) return;
    if (e.target.classList.contains('bk-del')) delBikeRow(e.target.closest('.bike-row'));
  });
  els.bikeList.addEventListener('input', onBikeListInput);
  els.bikeList.addEventListener('change', onBikeListInput);
  // 合計を手修正したら自動合計を止める
  els.amountTotal.addEventListener('input', () => { amountTouched = true; });

  // 名義人（追加/削除）
  els.btnAddOwner.addEventListener('click', () => { if (!isLocked) addOwnerBlock(); runValidation(); });
  els.ownerList.addEventListener('click', (e) => {
    if (isLocked) return;
    if (e.target.classList.contains('owner-del')) delOwnerBlock(e.target.closest('.owner-block'));
  });

  els.btnGuardianSameAddr.addEventListener('click', () => {
    if (isLocked) return;
    els.gAddress.value = els.pAddress.value;
    runValidation();
  });

  // 署名クリア（譲渡人・保護者）
  document.querySelectorAll('.sig-clear').forEach(btn => {
    btn.addEventListener('click', () => {
      if (isLocked) return;
      if (btn.dataset.target === 'seller') { sigSeller.clear(); els.sigSellerPh.style.display = ''; }
      else { sigGuardian.clear(); els.sigGuardianPh.style.display = ''; }
      runValidation();
    });
  });

  // 入力のたびに検証（動的追加要素も拾えるようフォームに委譲）
  const form = document.getElementById('kaitoriForm');
  form.addEventListener('input', runValidation);
  form.addEventListener('change', runValidation);

  els.btnConfirm.addEventListener('click', onConfirm);
  els.btnConfirmYes.addEventListener('click', doConfirm);
  els.btnConfirmCancel.addEventListener('click', () => { els.confirmModal.hidden = true; });
  els.confirmModal.addEventListener('click', (e) => { if (e.target === els.confirmModal) els.confirmModal.hidden = true; });

  // 保存ボタン（確定時に生成したPDF/PNGを保存）・完了・台帳設定の配線（復元時と共通）
  wireOutputButtons();
  wireFinishAndSettings();

  // 台帳連携の設定（この端末に保存。単台フォームと共通）
  els.cfgUrl.value = CFG.gasUrl;
  els.cfgToken.value = CFG.token;
  showCfgStatus();
  setupTitleLongPress();

  // 未送信キューがあれば起動時・通信復帰時に再送（出力パネルは開かず裏で送信のみ）
  if (readQueue().length) flushQueue();
  window.addEventListener('online', flushQueue);

  renumberOwners();
  runValidation();
}
document.addEventListener('DOMContentLoaded', init);

/* Service Worker 登録（オフライン対応）。http/https のときだけ登録する。 */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW登録失敗:', e));
  });
}
