/* =========================================================
   タブレット買取記入システム — フェーズ①（ローカル完結）
   入力 → 署名 → 確定ロック → PDF生成（GAS/Drive/PWA なし）
   対象端末: Redmi Pad SE (Android / Chrome)
   ========================================================= */
'use strict';

/* ---- 事業者固定情報 ---- */
const BIZ = {
  brand: 'RAINBOW',
  tradeName: 'めぐり自転車',        // 顧客向けの通称。書類上は RAINBOW（めぐり自転車）と併記
  buyerName: '高多優典',            // 譲受人（連絡先はPDF非表示）
  license: '第511090015059号',
  licenseAuthority: '石川県公安委員会',
};

/* ---- 状態 ---- */
let confirmedAt = null;   // ISO8601 署名確定時刻
let isLocked = false;
let sigSeller = null;
let sigGuardian = null;

/* ---- 要素参照 ---- */
const $ = (id) => document.getElementById(id);
const els = {};
[
  'tradeNo','tradeDate','tradeType',
  'pName','pZip','btnZip','zipNote','pAddress','pTel','pJob','pJobOther','pJobOtherField',
  'pBirth','pBirthY','pBirthM','pBirthD','pAgeView',
  'idType','licenseFields','licenseAuthority','licenseAuthorityOther',
  'licenseAuthorityOtherField','licenseNumber','idNote',
  'bItem','bQty','bMaker','bMakerOther','bMakerOtherField',
  'bModel','bModelOther','bModelOtherField',
  'bColor','bColorOther','bColorOtherField',
  'bFrame','bRegist','bFeature','btnFeatureAuto',
  'accKey','accKeyCount','accKeyCountWrap','accBattery','accCharger','accManual',
  'amount','payMethod','pledge','pledgeCorp',
  'registOwner','registOwnerFields','registOwnerName','registOwnerRelation','registOwnerConsent',
  'guardianCard','minorBanner','gName','gRelation','gRelationOther','gRelationOtherField',
  'gContact','gAddress','btnGuardianSameAddr','gIdMethod',
  'sigSeller','sigGuardian','sigSellerPh','sigGuardianPh',
  'validation','outputPanel','confirmStamp','btnConfirm',
  'btnPdfCert','btnPdfGuardian','btnImgCert','btnImgGuardian','sheetCert','sheetGuardian',
  'syncBox','syncStatus','btnSyncRetry'
].forEach(k => els[k] = $(k));

/* =========================================================
   1. 取引番号 自動採番  RB-YYYYMMDD-NNN
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
  const next = String(committed + 1).padStart(3, '0');
  els.tradeNo.value = `RB-${y}-${next}`;
}
function commitTradeNo() {
  const y = ymd(els.tradeDate.value);
  const committed = parseInt(localStorage.getItem(seqKey(y)) || '0', 10);
  localStorage.setItem(seqKey(y), String(committed + 1));
}

/* =========================================================
   2. 生年月日プルダウン（年→月→日）
      端末の日付ピッカーは指操作で「年」に到達しづらいため、
      年を先に選べる3段プルダウンにして #pBirth(hidden) へ同期する。
   ========================================================= */
const BIRTH_YEAR_SPAN = 100;

function fillSelect(sel, values, placeholder) {
  const keep = sel.value;
  sel.innerHTML = `<option value="">${placeholder}</option>` +
    values.map(v => `<option value="${v}">${v}</option>`).join('');
  if (values.includes(Number(keep)) || values.includes(keep)) sel.value = keep;
}

function daysInMonth(y, m) {
  if (!y || !m) return 31;                      // 年月未選択のうちは31日まで出す
  return new Date(Number(y), Number(m), 0).getDate();
}

function refreshBirthDays() {
  const y = els.pBirthY.value, m = els.pBirthM.value;
  const last = daysInMonth(y, m);
  const prev = Number(els.pBirthD.value);
  fillSelect(els.pBirthD, Array.from({ length: last }, (_, i) => i + 1), '日');
  // 2/31 のような選択を持ち越さない
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
  fillSelect(els.pBirthM, Array.from({ length: 12 }, (_, i) => i + 1), '月');
  refreshBirthDays();

  const onChange = () => {
    refreshBirthDays();
    syncBirth();
    updateAgeAndMinor();
    runValidation();
  };
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
  // 署名パッドは表示後にサイズ確定させる
  if (minor && sigGuardian) requestAnimationFrame(() => resizeCanvas(els.sigGuardian, sigGuardian));
}

/* ---- プルダウン＋「その他」自由記述のペア ----
   選択肢に無い値も記録できるよう、「その他」を選んだときだけ記述欄を出す。
   [選択select, 記述input, 記述の入れ物] */
const OTHER_PAIRS = [
  ['pJob', 'pJobOther', 'pJobOtherField'],
  ['bMaker', 'bMakerOther', 'bMakerOtherField'],
  ['bModel', 'bModelOther', 'bModelOtherField'],
  ['bColor', 'bColorOther', 'bColorOtherField'],
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

/* 台帳・PDFに出す実値（「その他」なら記述欄の内容） */
function pick(sel) {
  const v = els[sel].value;
  if (v !== 'その他') return v;
  const pair = OTHER_PAIRS.find(p => p[0] === sel);
  return els[pair[1]].value.trim() || 'その他';
}

/* =========================================================
   4. 本人確認区分による欄の出し分け
      運転免許証のみ「公安委員会名＋番号」を表示・保存。
      マイナンバー/保険証等では番号欄を一切出さない。
   ========================================================= */
function updateIdFields() {
  const v = els.idType.value;
  const isLicense = v === '運転免許証';
  els.licenseFields.style.display = isLicense ? '' : 'none';
  if (!isLicense) {
    // 表示しないだけでなく値も保持しない
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

/* ---- 免許証番号は数字12桁のみ保持（「第」「号」は入力させずPDF側で整形） ---- */
function normalizeLicenseNumber() {
  const digits = els.licenseNumber.value.replace(/\D/g, '').slice(0, 12);
  if (els.licenseNumber.value !== digits) els.licenseNumber.value = digits;
}
function licenseNumberText() {
  const n = els.licenseNumber.value.replace(/\D/g, '');
  return n ? `第${n}号` : '';
}

/* =========================================================
   5. 郵便番号 → 住所 自動入力
      ※ 外部API（zipcloud）を使うためオンライン時のみ。
        失敗しても手入力を妨げない（住所欄は常に編集可）。
        フェーズ③のオフライン化では住所データのローカル同梱に置き換える。
   ========================================================= */
const ZIP_API = 'https://zipcloud.ibsnet.co.jp/api/search?zipcode=';

function zipDigits() { return els.pZip.value.replace(/\D/g, ''); }

function showZipNote(msg, isError) {
  els.zipNote.style.display = msg ? '' : 'none';
  els.zipNote.textContent = msg || '';
  els.zipNote.style.color = isError ? 'var(--danger)' : 'var(--muted)';
}

async function lookupZip(auto) {
  if (isLocked) return;
  const zip = zipDigits();
  if (zip.length !== 7) {
    if (!auto) showZipNote('郵便番号は数字7桁で入力してください。', true);
    return;
  }
  showZipNote('住所を検索中…', false);
  try {
    const res = await fetch(ZIP_API + zip);
    const json = await res.json();
    const hit = json.results && json.results[0];
    if (!hit) {
      showZipNote('該当する住所が見つかりませんでした。住所は手入力してください。', true);
      return;
    }
    const base = `${hit.address1}${hit.address2}${hit.address3}`;
    // すでに入力済みなら上書きせず確認を促す（番地を消さないため）
    if (els.pAddress.value.trim() && !els.pAddress.value.startsWith(base)) {
      showZipNote(`候補：${base}（住所欄に入力済みのため自動反映していません）`, true);
      return;
    }
    if (!els.pAddress.value.trim()) els.pAddress.value = base;
    showZipNote('住所を入力しました。続けて番地・建物名を入力してください。', false);
    els.pAddress.focus();
    runValidation();
  } catch (e) {
    showZipNote('住所検索に失敗しました（オフラインの可能性）。住所は手入力してください。', true);
  }
}

/* ---- 付属品（電動アシストのバッテリー・充電器の有無は後日トラブルになりやすい） ---- */
function updateAccessoryFields() {
  els.accKeyCountWrap.style.display = els.accKey.checked ? '' : 'none';
}
function accessoryText() {
  const list = [];
  if (els.accKey.checked) list.push(`鍵${els.accKeyCount.value || 1}本`);
  if (els.accBattery.checked) list.push('バッテリー');
  if (els.accCharger.checked) list.push('充電器');
  if (els.accManual.checked) list.push('取扱説明書');
  return list.length ? list.join('・') : 'なし';
}

/* ---- 防犯登録の名義人（盗品リスクの切り分け） ---- */
function updateRegistOwnerFields() {
  const other = els.registOwner.value === '本人以外';
  els.registOwnerFields.style.display = other ? '' : 'none';
  if (!other) {
    els.registOwnerName.value = '';
    els.registOwnerRelation.value = '';
    els.registOwnerConsent.checked = false;
  }
}
function registOwnerText() {
  const v = els.registOwner.value;
  if (v !== '本人以外') return v;
  return `本人以外（${esc(els.registOwnerName.value)}・続柄 ${esc(els.registOwnerRelation.value)}／名義人の同意あり）`;
}

/* =========================================================
   6. 特徴の自動生成
      古物営業法の法定記載事項なので必須は維持しつつ、
      選択済みの内容から下書きを自動で作って手入力の負担を無くす。
      現場で手を入れた場合はその内容を尊重し、自動上書きしない。
   ========================================================= */
let featureTouched = false;

function buildFeatureText() {
  const parts = [];
  const maker = pick('bMaker'), model = pick('bModel'), color = pick('bColor');
  if (maker) parts.push(maker);
  if (model) parts.push(model);
  if (color) parts.push(`色：${color}`);
  if (els.bFrame.value.trim()) parts.push(`フレーム番号：${els.bFrame.value.trim()}`);
  if (els.bRegist.value.trim()) parts.push(`防犯登録：${els.bRegist.value.trim()}`);
  return parts.join('／');
}

function autoFillFeature(force) {
  if (isLocked) return;
  if (featureTouched && !force) return;
  const text = buildFeatureText();
  if (!text) return;
  els.bFeature.value = text;
  if (force) featureTouched = false;
  runValidation();
}

/* =========================================================
   7. 署名パッド（signature_pad）
   ========================================================= */
function resizeCanvas(canvas, pad) {
  // 表示サイズはCSS（.sig-canvas-box canvas）が持つ。ここではCSSの実寸に
  // devicePixelRatio を掛けた解像度を与えるだけにして、値の二重管理を避ける。
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
  // 署名は input/change を発火しないため、描き終わりで明示的に再検証する
  // （これが無いと「最後に署名」した場合に確定ボタンが不活性のままになる）
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
});
document.querySelectorAll('.sig-clear').forEach(btn => {
  btn.addEventListener('click', () => {
    if (isLocked) return;
    if (btn.dataset.target === 'seller') { sigSeller.clear(); els.sigSellerPh.style.display = ''; }
    else { sigGuardian.clear(); els.sigGuardianPh.style.display = ''; }
    runValidation();
  });
});

/* =========================================================
   6. 検証（法定5項目 + 署名 + 誓約 + 未成年時の保護者）
   ========================================================= */
function isFilled(el) { return el && String(el.value).trim() !== ''; }

function collectMissing() {
  const miss = [];
  // 法定5項目
  if (!isFilled(els.tradeDate)) miss.push('取引年月日');
  if (!isFilled(els.bItem) || !isFilled(els.bQty)) miss.push('古物の品目・数量');
  if (!isFilled(els.bFeature)) miss.push('古物の特徴');
  const partyMiss = [];
  if (!isFilled(els.pName)) partyMiss.push('氏名');
  if (!isFilled(els.pAddress)) partyMiss.push('住所');
  if (!isFilled(els.pTel)) partyMiss.push('電話番号');
  if (!isFilled(els.pJob)) partyMiss.push('職業');
  else if (els.pJob.value === 'その他' && !isFilled(els.pJobOther)) partyMiss.push('職業(その他の内容)');
  if (!isFilled(els.pBirth)) partyMiss.push('生年月日(年齢)');
  if (partyMiss.length) miss.push('相手方の' + partyMiss.join('・'));
  if (!isFilled(els.idType)) miss.push('本人確認方法');

  // 代金受領書を兼ねるため金額は必須（引取＝0円の場合は 0 を入力）
  if (!isFilled(els.amount)) miss.push('買取金額');

  // 誓約
  if (!els.pledge.checked) miss.push('誓約事項（盗品でないこと）のチェック');
  if (!els.pledgeCorp.checked) miss.push('誓約事項（法人名義でないこと）のチェック');

  // 防犯登録の名義人
  if (!isFilled(els.registOwner)) miss.push('防犯登録の名義人');
  else if (els.registOwner.value === '本人以外') {
    const r = [];
    if (!isFilled(els.registOwnerName)) r.push('氏名');
    if (!isFilled(els.registOwnerRelation)) r.push('続柄');
    if (r.length) miss.push('名義人の' + r.join('・'));
    if (!els.registOwnerConsent.checked) miss.push('名義人の同意の確認');
  }

  // 署名
  if (!sigSeller || sigSeller.isEmpty()) miss.push('譲渡人の署名');

  // 未成年時
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
  } else {
    box.className = 'validation ng';
    box.style.display = '';
    box.innerHTML = '⚠ 未入力のため署名確定・PDF生成はできません：<ul>' +
      miss.map(m => `<li>${m}</li>`).join('') + '</ul>';
    els.btnConfirm.disabled = true;
    return false;
  }
}

/* =========================================================
   7. 確定 → ロック
   ========================================================= */
function lockForm() {
  isLocked = true;
  document.getElementById('kaitoriForm').classList.add('form-locked');
  document.querySelectorAll('#kaitoriForm input, #kaitoriForm select, #kaitoriForm textarea')
    .forEach(el => { el.setAttribute('readonly', 'readonly'); el.setAttribute('disabled', 'disabled'); });
  if (sigSeller) sigSeller.off();
  if (sigGuardian) sigGuardian.off();
}

function onConfirm() {
  if (!runValidation()) return;
  confirmedAt = new Date().toISOString();
  commitTradeNo();
  lockForm();

  const d = new Date(confirmedAt);
  const human = d.toLocaleString('ja-JP', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' });
  els.confirmStamp.innerHTML =
    `取引番号：<b>${els.tradeNo.value}</b><br>` +
    `署名確定時刻：<b>${human}</b><br>` +
    `<span style="font-size:.75rem;color:#888;">ISO8601: ${confirmedAt}</span>`;

  // 確定バーを完了表示に
  document.querySelector('.confirm-bar .inner').innerHTML =
    '<div class="locked-note btn-block">🔒 署名を確定しました。フォームはロックされています。下のボタンからPDFを生成してください。</div>';

  els.outputPanel.classList.add('show');
  els.validation.style.display = 'none';
  els.outputPanel.scrollIntoView({ behavior: 'smooth' });

  // 台帳・Drive へ非同期送信（PDF/画像ボタンとは独立して自動実行）
  enqueueAndSync();
}

/* =========================================================
   8. PDF生成（html2canvas → jsPDF, A4・1枚）
   ========================================================= */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function brandText() { return `${BIZ.brand}（${BIZ.tradeName}）`; }
function yen(v) {
  const n = Number(v);
  return isNaN(n) ? '—' : '¥' + n.toLocaleString('ja-JP');
}
function humanTime() {
  if (!confirmedAt) return '';
  return new Date(confirmedAt).toLocaleString('ja-JP',
    { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

/* 本人確認方法の表示（免許証のみ番号を出す） */
function idMethodText() {
  const t = els.idType.value;
  if (t === '運転免許証') {
    const auth = esc(pick('licenseAuthority') || BIZ.licenseAuthority);
    const num = esc(licenseNumberText());
    return `${esc(t)}（${auth}${num ? '　' + num : ''}）`;
  }
  return esc(t);
}

function buildCertSheet() {
  const sig = (sigSeller && !sigSeller.isEmpty()) ? sigSeller.toDataURL('image/png') : '';
  const age = currentAge();
  const html = `
    <div class="doc-title">譲渡証明書 兼 代金受領書・委任状</div>
    <div class="doc-no">取引番号：${esc(els.tradeNo.value)}</div>

    <p class="lead">下記の物品を譲受人へ譲渡し、その代金を受領したことを証明します。あわせて、防犯登録の抹消その他名義変更に必要な手続きを譲受人に委任します。</p>

    <div class="sec-title">譲受人</div>
    <table class="kv">
      <tr><th>屋号</th><td>${esc(brandText())}</td></tr>
      <tr><th>氏名</th><td>${esc(BIZ.buyerName)}</td></tr>
      <tr><th>古物商許可番号</th><td>${esc(BIZ.license)}（${esc(BIZ.licenseAuthority)}）</td></tr>
    </table>

    <div class="sec-title">譲渡人（相手方）</div>
    <table class="kv">
      <tr><th>氏名</th><td>${esc(els.pName.value)}</td></tr>
      <tr><th>住所</th><td>${esc(els.pAddress.value)}</td></tr>
      <tr><th>電話番号</th><td>${esc(els.pTel.value)}</td></tr>
      <tr><th>職業</th><td>${esc(pick('pJob'))}</td></tr>
      <tr><th>生年月日 / 年齢</th><td>${esc(els.pBirth.value)}${age!==null?`<span class="age-badge">（${age}歳）</span>`:''}</td></tr>
      <tr><th>本人確認方法</th><td>${idMethodText()}</td></tr>
    </table>

    <div class="sec-title">取引内容</div>
    <table class="kv">
      <tr><th>取引年月日</th><td>${esc(els.tradeDate.value)}</td></tr>
      <tr><th>取引区分</th><td>${esc(els.tradeType.value)}</td></tr>
      <tr><th>品目 / 数量</th><td>${esc(els.bItem.value)}　／　${esc(els.bQty.value)} 点</td></tr>
      <tr><th>メーカー / 車種</th><td>${esc(pick('bMaker'))||'—'}　／　${esc(pick('bModel'))||'—'}</td></tr>
      <tr><th>フレーム番号</th><td>${esc(els.bFrame.value)||'—'}</td></tr>
      <tr><th>色</th><td>${esc(pick('bColor'))||'—'}</td></tr>
      <tr><th>防犯登録番号</th><td>${esc(els.bRegist.value)||'—'}</td></tr>
      <tr><th>防犯登録の名義人</th><td>${registOwnerText()}</td></tr>
      <tr><th>付属品</th><td>${esc(accessoryText())}</td></tr>
      <tr><th>特徴</th><td>${esc(els.bFeature.value)}</td></tr>
      <tr><th>買取金額</th><td><b>${yen(els.amount.value)}</b>（${esc(els.payMethod.value)}）</td></tr>
    </table>

    <div class="pledge">本物品は盗品・遺失物・不法投棄品ではなく、譲渡人が正当な権原に基づき譲渡するものであることを誓約します。また、会社・法人名義の自転車ではありません。上記代金を確かに受領しました。</div>

    <div class="sign-area">
      <div class="sign-box">
        <div class="sign-label">譲渡人（相手方）署名</div>
        <div class="sign-img">${sig ? `<img src="${sig}" alt="署名">` : ''}</div>
        <div class="confirm-time">署名確定時刻：${esc(humanTime())}</div>
      </div>
    </div>

    <div class="footer-note">
      古物商許可番号 ${esc(BIZ.license)}（${esc(BIZ.licenseAuthority)}）／ 取引番号 ${esc(els.tradeNo.value)}<br>
      本書は電子的に作成・保存されます（電子帳簿保存法 電子取引データ）。
    </div>
  `;
  els.sheetCert.innerHTML = html;
}

function buildGuardianSheet() {
  const sig = (sigGuardian && !sigGuardian.isEmpty()) ? sigGuardian.toDataURL('image/png') : '';
  const age = currentAge();
  const html = `
    <div class="doc-title">保護者同意書</div>
    <div class="doc-no">取引番号：${esc(els.tradeNo.value)}</div>

    <p class="lead">私は、下記未成年者による物品の譲渡（買取取引）について、保護者として同意します。</p>

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
      <tr><th>対象物品</th><td>${esc(els.bItem.value)}　${esc(pick('bMaker'))} ${esc(pick('bModel'))}　${esc(els.bQty.value)} 点</td></tr>
      <tr><th>買取金額</th><td><b>${yen(els.amount.value)}</b></td></tr>
      <tr><th>譲受人</th><td>${esc(brandText())}　${esc(BIZ.buyerName)}　古物商許可 ${esc(BIZ.license)}</td></tr>
    </table>

    <div class="pledge">上記取引の内容を確認し、未成年者による当該物品の譲渡に同意します。</div>

    <div class="sign-area">
      <div class="sign-box">
        <div class="sign-label">保護者 同意署名</div>
        <div class="sign-img">${sig ? `<img src="${sig}" alt="署名">` : ''}</div>
        <div class="confirm-time">署名確定時刻：${esc(humanTime())}</div>
      </div>
    </div>

    <div class="footer-note">
      古物商許可番号 ${esc(BIZ.license)}（${esc(BIZ.licenseAuthority)}）／ 取引番号 ${esc(els.tradeNo.value)}
    </div>
  `;
  els.sheetGuardian.innerHTML = html;
}

/* ---- ファイル名：署名直後にそのままお客さまへ送れる名前にする ----
   例）8月6日 山田太郎様 買取.pdf
   帳簿上の照合は書類本文に印字した取引番号で行う。
   （フェーズ②のDrive保存では取引番号を先頭に付けた名前で保存すること） */
function sanitizeFileName(s) {
  return String(s == null ? '' : s).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
}
function docFileName(kind, ext) {
  const d = els.tradeDate.value ? new Date(els.tradeDate.value + 'T00:00:00') : new Date();
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  const name = sanitizeFileName(els.pName.value) || 'お客様';
  return `${sanitizeFileName(`${md} ${name}様 ${kind}`)}.${ext}`;
}

async function renderSheet(sheetEl) {
  return html2canvas(sheetEl, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
}

/* 画像（PNG）保存。LINE公式アカウントのチャットは画像送信が確実なため、
   PDFと別に画像でも出せるようにする。 */
function downloadCanvasPng(canvas, filename) {
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

async function sheetToPdf(sheetEl, filename) {
  const canvas = await renderSheet(sheetEl);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageW = 210, pageH = 297;
  // A4 1枚に収める。縦がはみ出す場合は縦横比を保ったまま高さ基準で縮小する
  // （幅固定で高さだけ切り詰めると文字が縦方向に潰れるため）
  let w = pageW, h = canvas.height * pageW / canvas.width;
  if (h > pageH) { h = pageH; w = canvas.width * pageH / canvas.height; }
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', (pageW - w) / 2, 0, w, h);
  pdf.save(filename);
}

/* Drive送信用: シート → PDFのbase64（データURIの先頭を除去）。sheetToPdf と同じ体裁で1枚に収める */
async function sheetToPdfBase64(sheetEl) {
  const canvas = await renderSheet(sheetEl);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageW = 210, pageH = 297;
  let w = pageW, h = canvas.height * pageW / canvas.width;
  if (h > pageH) { h = pageH; w = canvas.width * pageH / canvas.height; }
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', (pageW - w) / 2, 0, w, h);
  return pdf.output('datauristring').split(',')[1];
}

async function generateCertPdf() {
  if (!isLocked) return;
  buildCertSheet();
  await sheetToPdf(els.sheetCert, docFileName(els.tradeType.value, 'pdf'));
}
async function generateGuardianPdf() {
  if (!isLocked || !isMinor()) return;
  buildGuardianSheet();
  await sheetToPdf(els.sheetGuardian, docFileName('保護者同意書', 'pdf'));
}
async function generateCertImage() {
  if (!isLocked) return;
  buildCertSheet();
  downloadCanvasPng(await renderSheet(els.sheetCert), docFileName(els.tradeType.value, 'png'));
}
async function generateGuardianImage() {
  if (!isLocked || !isMinor()) return;
  buildGuardianSheet();
  downloadCanvasPng(await renderSheet(els.sheetGuardian), docFileName('保護者同意書', 'png'));
}

/* =========================================================
   8.5 台帳・Drive連携（フェーズ②）
       確定後に PDF(base64) と取引データを GAS Web App へ送信。
       失敗時は localStorage キューに退避し、online復帰・起動時に再送。
   ========================================================= */
const CFG = window.KAITORI_CONFIG || {};
const QUEUE_KEY = 'rb_ledger_queue';

function ledgerConfigured() { return !!(CFG.gasUrl && CFG.token); }

/* 防犯登録名義人の平文（台帳セル用） */
function registOwnerPlain() {
  const v = els.registOwner.value;
  if (v !== '本人以外') return v;
  return `本人以外（${els.registOwnerName.value}・続柄 ${els.registOwnerRelation.value}／名義人同意あり）`;
}

/* 台帳に送る1件分のレコード（「その他」は pick() で実値、免許証番号は整形済み）。
   免許証以外は確認番号を送らない（フロント・GAS双方で防御）。 */
function collectRecord() {
  const isLic = els.idType.value === '運転免許証';
  return {
    tradeNo: els.tradeNo.value,
    tradeDate: els.tradeDate.value,
    tradeType: els.tradeType.value,
    pName: els.pName.value,
    pAddress: els.pAddress.value,
    pTel: els.pTel.value,
    pJob: pick('pJob'),
    pBirth: els.pBirth.value,
    age: currentAge(),
    idType: els.idType.value,
    idNumber: isLic ? `${pick('licenseAuthority')} ${licenseNumberText()}`.trim() : '',
    bMaker: pick('bMaker'),
    bModel: pick('bModel'),
    bColor: pick('bColor'),
    bFrame: els.bFrame.value,
    bRegist: els.bRegist.value,
    registOwner: registOwnerPlain(),
    accessories: accessoryText(),
    bItem: els.bItem.value,
    bQty: els.bQty.value,
    bFeature: els.bFeature.value,
    amount: els.amount.value,
    payMethod: els.payMethod.value,
    isMinor: isMinor(),
    gName: isMinor() ? els.gName.value : '',
    gRelation: isMinor() ? pick('gRelation') : '',
    gAddress: isMinor() ? els.gAddress.value : '',
    gContact: isMinor() ? els.gContact.value : '',
    gIdMethod: isMinor() ? els.gIdMethod.value : '',
    confirmedAt: confirmedAt,
  };
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

/* 確定直後に呼ぶ：PDFをbase64化してキュー投入 → 送信を試みる。
   Driveのファイル名は取引番号を先頭に付ける（帳簿の検索性要件のため）。 */
async function enqueueAndSync() {
  if (!ledgerConfigured()) {
    setSyncStatus('pending',
      '⚠ 台帳送信は未設定です（config.js 未設定）。この端末ではPDF・画像の保存のみ行えます。');
    els.btnSyncRetry.style.display = 'none';
    return;
  }
  setSyncStatus('pending', '⏳ 台帳・Driveへ保存する書類を準備しています…');
  try {
    buildCertSheet();
    const pdfs = [{
      kind: 'cert',
      name: `${els.tradeNo.value}_譲渡証明書.pdf`,
      b64: await sheetToPdfBase64(els.sheetCert),
    }];
    if (isMinor()) {
      buildGuardianSheet();
      pdfs.push({
        kind: 'guardian',
        name: `${els.tradeNo.value}_保護者同意書.pdf`,
        b64: await sheetToPdfBase64(els.sheetGuardian),
      });
    }
    const item = { id: els.tradeNo.value, action: 'append', record: collectRecord(), pdfs };
    const q = readQueue();
    if (!q.some(x => x.id === item.id)) { q.push(item); writeQueue(q); }
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
      if (data.status === 'ok') { lastLinks = data.links || null; }
      else { remaining.push(item); }
    } catch (e) {
      remaining.push(item); // ネットワーク不通など → キュー保持
    }
  }
  writeQueue(remaining);

  if (remaining.length === 0) {
    let linkHtml = '';
    if (lastLinks) {
      if (lastLinks.cert) linkHtml += ` <a href="${lastLinks.cert}" target="_blank" rel="noopener">証明書PDF</a>`;
      if (lastLinks.guardian) linkHtml += ` ／ <a href="${lastLinks.guardian}" target="_blank" rel="noopener">保護者同意書PDF</a>`;
    }
    setSyncStatus('ok', '✅ 台帳に記録し、PDFをDriveへ保存しました。' + linkHtml);
    els.btnSyncRetry.style.display = 'none';
  } else {
    setSyncStatus('ng',
      `⚠ 送信できませんでした（未送信 ${remaining.length} 件）。オフラインの可能性があります。電波の良い場所で「再送」してください。`);
    els.btnSyncRetry.style.display = '';
  }
}

/* =========================================================
   9. 初期化・イベント
   ========================================================= */
function init() {
  // 取引年月日 既定＝当日
  const today = new Date();
  els.tradeDate.value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  refreshTradeNo();

  initSignaturePads();
  initBirthSelects();
  updateIdFields();
  updateOtherFields();
  updateAccessoryFields();
  updateRegistOwnerFields();
  updateAgeAndMinor();

  els.tradeDate.addEventListener('change', () => { refreshTradeNo(); updateAgeAndMinor(); runValidation(); });
  els.idType.addEventListener('change', () => { updateIdFields(); runValidation(); });
  OTHER_PAIRS.forEach(([sel]) => {
    els[sel].addEventListener('change', () => { updateOtherFields(); runValidation(); });
  });

  // 郵便番号 → 住所
  els.btnZip.addEventListener('click', () => lookupZip(false));
  els.pZip.addEventListener('input', () => { if (zipDigits().length === 7) lookupZip(true); });

  // 免許証番号は数字のみに正規化
  els.licenseNumber.addEventListener('input', normalizeLicenseNumber);

  // 特徴の自動生成（手入力があればそれを優先）
  ['bMaker', 'bMakerOther', 'bModel', 'bModelOther', 'bColor', 'bColorOther', 'bFrame', 'bRegist']
    .forEach(id => {
      els[id].addEventListener('change', () => autoFillFeature(false));
      els[id].addEventListener('input', () => autoFillFeature(false));
    });
  els.bFeature.addEventListener('input', () => { featureTouched = true; });
  els.btnFeatureAuto.addEventListener('click', () => autoFillFeature(true));

  els.accKey.addEventListener('change', updateAccessoryFields);
  els.registOwner.addEventListener('change', () => { updateRegistOwnerFields(); runValidation(); });
  els.btnGuardianSameAddr.addEventListener('click', () => {
    if (isLocked) return;
    els.gAddress.value = els.pAddress.value;
    runValidation();
  });

  // 入力のたびに検証
  document.querySelectorAll('#kaitoriForm input, #kaitoriForm select, #kaitoriForm textarea')
    .forEach(el => { el.addEventListener('input', runValidation); el.addEventListener('change', runValidation); });

  els.btnConfirm.addEventListener('click', onConfirm);
  els.btnPdfCert.addEventListener('click', generateCertPdf);
  els.btnPdfGuardian.addEventListener('click', generateGuardianPdf);
  els.btnImgCert.addEventListener('click', generateCertImage);
  els.btnImgGuardian.addEventListener('click', generateGuardianImage);
  els.btnSyncRetry.addEventListener('click', flushQueue);

  // 未送信キューがあれば起動時・通信復帰時に再送（現場でオフライン→復帰を想定）
  if (readQueue().length) { els.outputPanel.classList.add('show'); flushQueue(); }
  window.addEventListener('online', flushQueue);

  runValidation();
}

document.addEventListener('DOMContentLoaded', init);
