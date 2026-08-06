/* =========================================================
   タブレット買取記入システム — フェーズ①（ローカル完結）
   入力 → 署名 → 確定ロック → PDF生成（GAS/Drive/PWA なし）
   対象端末: Redmi Pad SE (Android / Chrome)
   ========================================================= */
'use strict';

/* ---- 事業者固定情報 ---- */
const BIZ = {
  brand: 'RAINBOW',
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
  'pName','pAddress','pJob','pBirth','pAgeView',
  'idType','licenseFields','licenseAuthority','licenseNumber','idNote',
  'bItem','bQty','bMaker','bModel','bFrame','bColor','bRegist','bFeature',
  'amount','payMethod','pledge',
  'guardianCard','minorBanner','gName','gRelation','gContact',
  'sigSeller','sigGuardian','sigSellerPh','sigGuardianPh',
  'validation','outputPanel','confirmStamp','btnConfirm',
  'btnPdfCert','btnPdfGuardian','sheetCert','sheetGuardian'
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
   2. 年齢自動算出 & 未成年判定
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
  // 署名パッドは表示後にサイズ確定させる
  if (minor && sigGuardian) requestAnimationFrame(() => resizeCanvas(els.sigGuardian, sigGuardian));
}

/* =========================================================
   3. 本人確認区分による欄の出し分け
      運転免許証のみ「公安委員会名＋番号」を表示・保存。
      マイナンバー/保険証等では番号欄を一切出さない。
   ========================================================= */
function updateIdFields() {
  const v = els.idType.value;
  const isLicense = v === '運転免許証';
  els.licenseFields.style.display = isLicense ? '' : 'none';
  if (!isLicense) {
    // 表示しないだけでなく値も保持しない
    els.licenseAuthority.value = '';
    els.licenseNumber.value = '';
  } else if (!els.licenseAuthority.value) {
    els.licenseAuthority.value = BIZ.licenseAuthority;
  }
  if (v === 'マイナンバーカード' || v === '健康保険証＋補完書類') {
    els.idNote.style.display = '';
    els.idNote.textContent = '※ この区分では番号・写しを記録しません（表示も保存もしません）。';
  } else {
    els.idNote.style.display = 'none';
  }
}

/* =========================================================
   4. 署名パッド（signature_pad）
   ========================================================= */
function resizeCanvas(canvas, pad) {
  const box = canvas.parentElement;
  if (!box.offsetWidth) return;
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const data = pad ? pad.toData() : null;
  canvas.width = box.offsetWidth * ratio;
  canvas.height = 180 * ratio;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  if (pad) { pad.clear(); if (data) pad.fromData(data); }
}
function initSignaturePads() {
  sigSeller = new SignaturePad(els.sigSeller, { penColor: '#111', backgroundColor: 'rgba(255,255,255,0)' });
  sigGuardian = new SignaturePad(els.sigGuardian, { penColor: '#111', backgroundColor: 'rgba(255,255,255,0)' });
  sigSeller.addEventListener('beginStroke', () => { els.sigSellerPh.style.display = 'none'; });
  sigGuardian.addEventListener('beginStroke', () => { els.sigGuardianPh.style.display = 'none'; });
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
   5. 検証（法定5項目 + 署名 + 誓約 + 未成年時の保護者）
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
  if (!isFilled(els.pJob)) partyMiss.push('職業');
  if (!isFilled(els.pBirth)) partyMiss.push('生年月日(年齢)');
  if (partyMiss.length) miss.push('相手方の' + partyMiss.join('・'));
  if (!isFilled(els.idType)) miss.push('本人確認方法');

  // 誓約
  if (!els.pledge.checked) miss.push('誓約事項のチェック');

  // 署名
  if (!sigSeller || sigSeller.isEmpty()) miss.push('譲渡人の署名');

  // 未成年時
  if (isMinor()) {
    const g = [];
    if (!isFilled(els.gName)) g.push('氏名');
    if (!isFilled(els.gRelation)) g.push('続柄');
    if (!isFilled(els.gContact)) g.push('連絡先');
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
   6. 確定 → ロック
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
}

/* =========================================================
   7. PDF生成（html2canvas → jsPDF, A4・1枚）
   ========================================================= */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
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
    const auth = esc(els.licenseAuthority.value || BIZ.licenseAuthority);
    const num = esc(els.licenseNumber.value || '');
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
      <tr><th>屋号</th><td>${esc(BIZ.brand)}</td></tr>
      <tr><th>氏名</th><td>${esc(BIZ.buyerName)}</td></tr>
      <tr><th>古物商許可番号</th><td>${esc(BIZ.license)}（${esc(BIZ.licenseAuthority)}）</td></tr>
    </table>

    <div class="sec-title">譲渡人（相手方）</div>
    <table class="kv">
      <tr><th>氏名</th><td>${esc(els.pName.value)}</td></tr>
      <tr><th>住所</th><td>${esc(els.pAddress.value)}</td></tr>
      <tr><th>職業</th><td>${esc(els.pJob.value)}</td></tr>
      <tr><th>生年月日 / 年齢</th><td>${esc(els.pBirth.value)}${age!==null?`　（${age}歳）`:''}</td></tr>
      <tr><th>本人確認方法</th><td>${idMethodText()}</td></tr>
    </table>

    <div class="sec-title">取引内容</div>
    <table class="kv">
      <tr><th>取引年月日</th><td>${esc(els.tradeDate.value)}</td></tr>
      <tr><th>取引区分</th><td>${esc(els.tradeType.value)}</td></tr>
      <tr><th>品目 / 数量</th><td>${esc(els.bItem.value)}　／　${esc(els.bQty.value)} 点</td></tr>
      <tr><th>メーカー / 車種</th><td>${esc(els.bMaker.value)||'—'}　／　${esc(els.bModel.value)||'—'}</td></tr>
      <tr><th>フレーム番号</th><td>${esc(els.bFrame.value)||'—'}</td></tr>
      <tr><th>色</th><td>${esc(els.bColor.value)||'—'}</td></tr>
      <tr><th>防犯登録番号</th><td>${esc(els.bRegist.value)||'—'}</td></tr>
      <tr><th>特徴</th><td>${esc(els.bFeature.value)}</td></tr>
      <tr><th>買取金額</th><td><b>${yen(els.amount.value)}</b>（${esc(els.payMethod.value)}）</td></tr>
    </table>

    <div class="pledge">本物品は盗品ではなく、譲渡人が正当な権原に基づき譲渡するものであることを誓約します。上記代金を確かに受領しました。</div>

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
      <tr><th>生年月日 / 年齢</th><td>${esc(els.pBirth.value)}${age!==null?`　（${age}歳）`:''}</td></tr>
      <tr><th>住所</th><td>${esc(els.pAddress.value)}</td></tr>
    </table>

    <div class="sec-title">保護者</div>
    <table class="kv">
      <tr><th>氏名</th><td>${esc(els.gName.value)}</td></tr>
      <tr><th>続柄</th><td>${esc(els.gRelation.value)}</td></tr>
      <tr><th>連絡先</th><td>${esc(els.gContact.value)}</td></tr>
    </table>

    <div class="sec-title">取引の概要</div>
    <table class="kv">
      <tr><th>取引年月日</th><td>${esc(els.tradeDate.value)}</td></tr>
      <tr><th>対象物品</th><td>${esc(els.bItem.value)}　${esc(els.bMaker.value)} ${esc(els.bModel.value)}　${esc(els.bQty.value)} 点</td></tr>
      <tr><th>買取金額</th><td><b>${yen(els.amount.value)}</b></td></tr>
      <tr><th>譲受人</th><td>${esc(BIZ.brand)}（${esc(BIZ.buyerName)}）　古物商許可 ${esc(BIZ.license)}</td></tr>
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

async function sheetToPdf(sheetEl, filename) {
  const canvas = await html2canvas(sheetEl, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageW = 210, pageH = 297;
  const imgH = canvas.height * pageW / canvas.width;
  const h = Math.min(imgH, pageH); // A4 1枚に収める
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pageW, h);
  pdf.save(filename);
}

async function generateCertPdf() {
  if (!isLocked) return;
  buildCertSheet();
  await sheetToPdf(els.sheetCert, `${els.tradeNo.value}_譲渡証明書.pdf`);
}
async function generateGuardianPdf() {
  if (!isLocked || !isMinor()) return;
  buildGuardianSheet();
  await sheetToPdf(els.sheetGuardian, `${els.tradeNo.value}_保護者同意書.pdf`);
}

/* =========================================================
   8. 初期化・イベント
   ========================================================= */
function init() {
  // 取引年月日 既定＝当日
  const today = new Date();
  els.tradeDate.value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  refreshTradeNo();

  initSignaturePads();
  updateIdFields();
  updateAgeAndMinor();

  els.tradeDate.addEventListener('change', () => { refreshTradeNo(); updateAgeAndMinor(); runValidation(); });
  els.pBirth.addEventListener('change', () => { updateAgeAndMinor(); runValidation(); });
  els.idType.addEventListener('change', () => { updateIdFields(); runValidation(); });

  // 入力のたびに検証
  document.querySelectorAll('#kaitoriForm input, #kaitoriForm select, #kaitoriForm textarea')
    .forEach(el => { el.addEventListener('input', runValidation); el.addEventListener('change', runValidation); });

  els.btnConfirm.addEventListener('click', onConfirm);
  els.btnPdfCert.addEventListener('click', generateCertPdf);
  els.btnPdfGuardian.addEventListener('click', generateGuardianPdf);

  runValidation();
}

document.addEventListener('DOMContentLoaded', init);
