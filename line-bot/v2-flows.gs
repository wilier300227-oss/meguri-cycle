/* =========================================================
   v2 フロー本体（要件定義_LINEシステム.md 段階2 / §9 / §11）
   satei（買取 kaitori・処分 shobun）:
     step1 電動アシストの有無 → step2 バッテリー状態（電動のみ）→ step3 写真工程 → step4 市町名 → step5 完了（手動対応へ）
   battery（電動バッテリーの調べ方）:
     step1 バッテリー状態 → 長押し診断の案内 / 写真で人が判断
   文言の禁止語（高価買取・転売・引き取ります/処分します 等）は入れない。
   ========================================================= */
const V2_BATTERY_CHECK_URL = 'https://meguri-cycle.com/column/battery-check/';
const V2_BATTERY_DISPOSAL_URL = 'https://meguri-cycle.com/column/battery-disposal/';
// F-8 長押し診断の実演動画（約72秒・元動画から再編集・カウントダウン付き・字幕のみ・ブリヂストン見本を全メーカー共通で使用。2026-09-16 オーナー撮影）。サイトの video/ から配信
const V2_BATTERY_VIDEO_URL = 'https://meguri-cycle.com/video/battery-check-howto.mp4';
const V2_BATTERY_VIDEO_PREVIEW_URL = 'https://meguri-cycle.com/video/battery-check-howto.jpg';

function qrPostback_(label, data) {
  return { type: 'action', action: { type: 'postback', label: label, data: data, displayText: label } };
}
function v2Msg_(text, quickItems) {
  const m = { type: 'text', text: text };
  if (quickItems && quickItems.length) m.quickReply = { items: quickItems };
  return m;
}
function v2Reply_(event, messages) {
  if (event.replyToken) reply(event.replyToken, messages);
}

/* ── 質問文 ── */
function v2AskEbike_(s) {
  const head = s.intent === 'shobun'
    ? ['♻️ 処分・引取のお申し込みありがとうございます！', '処分費は0円、出張費のみです。値段がつく車体は買取に切り替えてご案内します。']
    : ['💰 買取のお申し込みありがとうございます！', '査定は写真だけで大丈夫です。金額が決まってからお伺いします（買取なら費用はかかりません）。'];
  return v2Msg_(head.concat(['', 'まず、電動アシスト自転車ですか？']).join('\n'), [
    qrPostback_('⚡ 電動アシスト', v2Pb_(s.flow, 1, 'next', 'ebike')),
    qrPostback_('🚲 電動ではない', v2Pb_(s.flow, 1, 'next', 'normal')),
    qrPostback_('❓ わからない', v2Pb_(s.flow, 1, 'next', 'unknown')),
  ]);
}
function v2AskBattery_(flow, step) {
  return v2Msg_([
    '🔋 バッテリーの状態を教えてください。',
    '',
    '次のどれかがありますか？',
    '　・ケースがふくらんでいる',
    '　・液がもれている、液のあとがある',
    '　・ひび割れ・落として壊れた',
  ].join('\n'), [
    qrPostback_('どれもない', v2Pb_(flow, step, 'next', 'bat_ok')),
    qrPostback_('ある', v2Pb_(flow, step, 'next', 'bat_ng')),
    qrPostback_('わからない', v2Pb_(flow, step, 'next', 'bat_unknown')),
  ]);
}
/** §11-2 バッテリーは受けられない → 車体だけ査定へ */
function v2BatteryNgMessage_(flow, step) {
  return v2Msg_([
    '教えていただきありがとうございます。',
    '',
    'ふくらみ・液もれ・破損のあるバッテリーは、発火の危険があるため、安全上お受けできません。申し訳ありません。',
    '',
    '【お願い】そのバッテリーは',
    '　・充電しない',
    '　・高温になる場所（車内・直射日光）に置かない',
    '　・水にぬらさない',
    '　・ふつうのごみに出さない',
    '　でお願いします。',
    '',
    '【相談先】',
    '　メーカーや販売店、リサイクル協力店（JBRC）はふくらんだバッテリーを受け付けていません。',
    '　お住まいの市町のごみ担当窓口にご相談ください。市町ごとの窓口はこちらにまとめています👇',
    '　' + V2_BATTERY_DISPOSAL_URL,
    '　金沢市の方は、月2回の資源回収「乾電池・水銀含有製品」の回収箱に出せます（ふくらんだものも可。市に確認済み）。',
    '',
    '車体（自転車本体）だけの買取・引き取りは可能です。バッテリーを外した状態で、車体の写真をお送りください📷',
  ].join('\n'), [
    qrPostback_('車体の写真を送る', v2Pb_(flow, step, 'next', 'body_only')),
    qrPostback_('やめる', v2Pb_(flow, step, 'stop', 'bat_ng')),
  ]);
}
/** §11-3 わからない → 写真で人が判断 */
function v2BatteryUnknownMessage_() {
  return v2Msg_([
    '写真で確認しますので、バッテリーを外して次の2枚をお送りください。',
    '',
    '① 側面（ケースの継ぎ目が見えるように）',
    '② 底面（端子のある面）',
    '',
    '外し方がわからない場合は、車体に付いたままでバッテリー全体が写る1枚でも大丈夫です。',
    '下のメニューの「カメラで撮る」「アルバムから選ぶ」から送れます。送り終わったら「次へ進む」を押してください。',
  ].join('\n'), v2PhotoStepQuick_());
}
/** §11-4 / F-8 長押し診断の案内。動画メッセージ＋説明文の2通（v2Transition_ では配列を展開して使う） */
function v2BatteryCheckMessage_() {
  return v2Msg_([
    'ありがとうございます。',
    '',
    '🔋 バッテリーの残量ランプの調べ方（残量ボタンの長押し）を、上の動画でご覧ください（音声なし）。',
    'メーカーによってボタンの位置は違いますが、長押しの要領は同じです。',
    '',
    '動画のように、ランプが光るところまでを動画で撮って送ってください。写真でも、点灯した数を文字で教えていただいても大丈夫です（できなくても大丈夫です）。',
    '文字で読みたい方はこちら👇',
    V2_BATTERY_CHECK_URL,
  ].join('\n'));
}
function v2BatteryVideoMessage_() {
  return { type: 'video', originalContentUrl: V2_BATTERY_VIDEO_URL, previewImageUrl: V2_BATTERY_VIDEO_PREVIEW_URL };
}
function v2PhotoGuideMessage_(s) {
  const ebike = s.data && (s.data.ebike === 'ebike' || s.data.ebike === 'unknown');
  const lines = s.intent === 'shobun'
    ? ['📷 お写真をお願いします。自転車全体が分かる1〜2枚で大丈夫です。', '傷・サビや、電動アシストのバッテリーがあれば写していただけると助かります。']
    : ['📷 写真を3枚ほどお願いします。', '・自転車ぜんぶ（横から）', '・タイヤ・チェーンまわり', '・メーカー名やロゴの部分'];
  if (ebike) lines.push('・電動：電源を入れたパネル、バッテリー、充電器、鍵');
  if (s.data && s.data.bodyOnly) lines.push('※ バッテリーは外した状態で撮ってください');
  // 既存ボットの一文を引き継ぐ（任意写真で査定が正確になる案内。2026-09-16 オーナー指摘で復活）
  if (s.intent !== 'shobun') lines.push('', '（余裕があれば：反対側の側面・ハンドル・ギアまわり・型番シール・気になる傷 も追加すると、より正確な査定につながります）');
  lines.push('', '下のメニューの「カメラで撮る」「アルバムから選ぶ」から送れます。', '送り終わったら「次へ進む」を押してください。写真がなくても「次へ進む」で大丈夫です。');
  return v2Msg_(lines.join('\n'), v2PhotoStepQuick_());
}
/** 写真工程の吹き出しに付けるボタン（写真を撮らなくても進む・戻る・やめるができるように。2026-09-16） */
function v2PhotoStepQuick_() {
  return [
    qrPostback_('▶ 次へ進む', v2Pb_('satei', 3, 'next', 'photos_done')),
    qrPostback_('◀ ひとつ戻る', v2Pb_('menu', 0, 'back')),
    qrPostback_('✖ やめる', v2Pb_('menu', 0, 'stop')),
  ];
}
function v2AskCityMessage_() {
  // 既存ボットと同じ聞き方（町名まで。番地は金額決定後にしか聞かない＝handoff §10-5）
  return v2Msg_('📍 お住まいの市町名を教えてください（例：金沢市片町）。\n\nこの下の入力欄に打ち込んで送ってください。');
}
/** サビの程度（買取のみ、写真のあと）。ボタンで答えるだけ。回答は受付通知に載せる（2026-09-16） */
function v2AskRustMessage_() {
  return v2Msg_('🔧 サビの程度を教えてください。\n（写真では分かりにくいので、近いものを選んでください）', [
    qrPostback_('ほとんどない', v2Pb_('satei', 3, 'next', 'rust_none')),
    qrPostback_('少しある（表面だけ）', v2Pb_('satei', 3, 'next', 'rust_some')),
    qrPostback_('かなりある（茶色・動きが固い）', v2Pb_('satei', 3, 'next', 'rust_heavy')),
  ]);
}
const V2_RUST_LABELS = { rust_none: 'ほとんどない', rust_some: '少しある（表面だけ）', rust_heavy: 'かなりある（チェーンや歯車が茶色・動きが固い）' };

function v2AskBohanMessage_(flow) {
  // 「シールは車体に貼ってあるが控えの紙はない」が多いので、その選択肢を用意する（2026-09-16 オーナー指摘）
  return v2Msg_('🔖 防犯登録はありますか？\n（自転車を買ったときに登録した、車体のシールと控えの紙のことです。抹消の手続きは当方で代行します）', [
    qrPostback_('シールも紙もある', v2Pb_(flow, 5, 'next', 'bohan_yes')),
    qrPostback_('シールだけ（紙はない）', v2Pb_(flow, 5, 'next', 'bohan_seal')),
    qrPostback_('ない', v2Pb_(flow, 5, 'next', 'bohan_no')),
    qrPostback_('わからない', v2Pb_(flow, 5, 'next', 'bohan_unknown')),
  ]);
}
function v2CityLines_(hit, intent) {
  if (intent === 'shobun') {
    if (hit.fee === '要相談' || !hit.city) return [(hit.city ? '📍 ' + hit.city + 'ですね。' : '📍 ') + '出張費は町名を伺って個別にご案内します。'];
    return ['📍 ' + hit.city + 'ですね、対応エリアです！', '♻️ 引取（処分）の出張費は ' + hit.fee + ' です（かほく市役所からの走行距離の目安。町名で確定します）。', '値段がつく車体なら買取に切り替え、その場合は出張費もかかりません。'];
  }
  if (hit.fee === '要相談' || !hit.city) return [(hit.city ? '📍 ' + hit.city + 'ですね。' : '📍 ') + 'ご相談を承ります。買取のご依頼なら出張費はかかりません。'];
  return ['📍 ' + hit.city + 'ですね、対応エリアです！', '💰 買取は、オンライン査定もお引き取りの出張費も すべて無料です。'];
}
/** 完了時の案内。既存ボット（replyEstimateRequest）の「状態の自己申告」の聞き方を引き継ぐ（現地での減額トラブル防止） */
function v2DoneLines_(intent) {
  const head = intent === 'shobun'
    ? ['ありがとうございます、受付は以上です🚲', '担当者が写真と出張費を確認して、確定した金額をご連絡します（原則48時間以内）。']
    : ['ありがとうございます、受付は以上です🚲', '担当者が写真を確認して、確定した買取金額をご連絡します（原則48時間以内）。'];
  return head.concat([
    '',
    '【状態について】',
    '写真で分かりにくい部分があれば、このままメッセージで教えてください。',
    '・タイヤの空気は入りますか',
    '・ブレーキは効きますか',
    '・その他、気になる箇所はありますか',
    '',
    '特になければ、そのままお待ちください。',
    '査定額は確定額です。写真では分からない不具合が現地で見つかった場合のみ、再査定となることがあります。',
  ]);
}

/* ── フロー制御（v2-core の v2StartFlow_ / v2Advance_ から呼ばれる）── */

/** 「ひとつ戻る」の戻り先。電動ではない場合はバッテリー状態（step2）を飛ばしているので、写真工程からは電動の質問（step1）へ戻す */
function v2PrevStep_(s) {
  if (s.flow === 'satei' && s.step === 3) return (s.data && s.data.ebike === 'normal') ? 1 : 2;
  if (s.flow === 'battery' && s.step === 3) return 1;
  return Math.max(1, s.step - 1);
}

/** フロー開始時の案内。satei: 電動の有無 / battery: バッテリー状態 */
function v2FlowStartMessages_(s) {
  if (s.flow === 'satei') return [v2AskEbike_(s)];
  if (s.flow === 'battery') return [v2AskBattery_('battery', 1)];
  return [v2Msg_('【開発中】' + s.flow)];
}

/** step と val から次の状態と返信を決める。戻り値 { messages, menu, done, stop } */
function v2Transition_(userId, s, pb) {
  s.data = s.data || {};
  const out = { messages: [], menu: null, done: false, stop: false };
  if (s.step !== 3 && s.data.rustAsk) delete s.data.rustAsk;   // 「ひとつ戻る」で写真工程より前に戻ったら、サビ質問中の印は消す

  if (s.flow === 'satei') {
    if (s.step === 1) {                       // 電動の有無
      s.data.ebike = pb.val;
      if (pb.val === 'normal') { s.step = 3; out.messages = [v2PhotoGuideMessage_(s)]; out.menu = 'photo'; }
      else { s.step = 2; out.messages = [v2AskBattery_('satei', 2)]; }
      return out;
    }
    if (s.step === 2) {                       // バッテリー状態
      if (pb.val.indexOf('bat_') === 0) s.data.battery = pb.val;   // body_only で bat_ng を上書きしない
      if (pb.val === 'bat_ng') { out.messages = [v2BatteryNgMessage_('satei', 2)]; return out; }       // step は 2 のまま（次のボタン待ち）
      if (pb.val === 'body_only') { s.data.bodyOnly = true; s.step = 3; out.messages = [v2PhotoGuideMessage_(s)]; out.menu = 'photo'; return out; }
      if (pb.val === 'bat_unknown') { s.data.batteryPhoto = true; s.step = 3; out.messages = [v2BatteryUnknownMessage_(), v2PhotoGuideMessage_(s)]; out.menu = 'photo'; return out; }
      s.step = 3; out.messages = [v2BatteryVideoMessage_(), v2BatteryCheckMessage_(), v2PhotoGuideMessage_(s)]; out.menu = 'photo'; return out;  // bat_ok
    }
    if (s.step === 3) {                       // 写真工程 → 次へ進む（旧「写真を追加する」は写真の案内を出し直すだけ）
      if (pb.val === 'more_photos') { out.messages = [v2PhotoGuideMessage_(s)]; out.menu = 'photo'; return out; }
      // 2026-09-16: 買取は写真のあとにサビの程度をボタンで1問（現地で写真より状態が悪い事例への対策。写真は3枚のまま）
      if (pb.val && pb.val.indexOf('rust_') === 0) { s.data.rust = pb.val; delete s.data.rustAsk; s.step = 4; out.messages = [v2AskCityMessage_()]; out.menu = 'inflow'; return out; }
      if (s.intent === 'kaitori' && !s.data.rust) { s.data.rustAsk = 1; out.messages = [v2AskRustMessage_()]; out.menu = 'inflow'; return out; }
      s.step = 4; out.messages = [v2AskCityMessage_()]; out.menu = 'inflow'; return out;
    }
    if (s.step === 5) {                       // 防犯登録の有無 → 完了
      s.data.bohan = pb.val;
      out.messages = [v2Msg_(v2DoneLines_(s.intent).join('\n'))];
      out.done = true; return out;
    }
  }
  if (s.flow === 'battery') {
    if (s.step === 1) {
      if (pb.val.indexOf('bat_') === 0) s.data.battery = pb.val;
      if (pb.val === 'bat_ng') { out.messages = [v2BatteryNgMessage_('battery', 1)]; return out; }
      if (pb.val === 'body_only') { s.flow = 'satei'; s.intent = 'kaitori'; s.data.ebike = 'ebike'; s.data.bodyOnly = true; s.step = 3; out.messages = [v2PhotoGuideMessage_(s)]; out.menu = 'photo'; return out; }
      if (pb.val === 'bat_unknown') { s.data.batteryPhoto = true; s.step = 3; out.messages = [v2BatteryUnknownMessage_()]; out.menu = 'photo'; return out; }
      // bat_ok: 診断の案内で終了（買取したい人はメニューから）
      out.messages = [v2BatteryVideoMessage_(), v2BatteryCheckMessage_(), v2Msg_('買取をご希望のときは、下のメニューの「買取を申し込む」からどうぞ🚲')];
      out.stop = true; out.menu = 'normal'; return out;
    }
    if (s.step === 3) {                       // 写真 → 人が判断
      if (pb.val === 'more_photos') { out.messages = [v2BatteryUnknownMessage_()]; out.menu = 'photo'; return out; }
      out.messages = [v2Msg_('ありがとうございます。担当者が写真を確認してご連絡します🚲')];
      out.done = true; return out;
    }
  }
  out.messages = [v2Msg_('このボタンは今は使えません。下の「メニューを開く／閉じる」から選び直してください🚲')];
  return out;
}

/** 完了処理: 手動対応ON・オーナー通知・users 更新・セッション消去・通常時メニュー */
function v2Complete_(event, userId, s, extraLines) {
  const cust = v2CustNo_(userId);
  const d = s.data || {};
  const summary = [
    '【' + (s.flow === 'battery' ? 'バッテリー確認' : (s.intent === 'shobun' ? '処分・引取' : '買取')) + ' 受付】' + (cust ? ' ' + cust : ''),
    '電動: ' + (d.ebike || '-') + ' / バッテリー: ' + (d.battery || '-') + (d.bodyOnly ? '（車体のみ）' : ''),
    '写真: ' + (d.photos || 0) + '枚' + (d.batteryPhoto ? '（バッテリー確認用あり）' : '') + (!d.photos ? '（フロー前に送られた写真はトークを確認）' : ''),
    'サビ（自己申告）: ' + (V2_RUST_LABELS[d.rust] || '-'),
    '住所: ' + (d.address || d.city || '-') + (d.fee ? '（出張費 ' + d.fee + '）' : ''),
    '防犯登録: ' + ({ bohan_yes: 'シールも紙もある', bohan_seal: 'シールだけ（紙はない）', bohan_no: 'ない', bohan_unknown: 'わからない' }[d.bohan] || '-'),
  ].join('\n');
  try { setUserFields_(userId, { state: 'S2', intent: s.intent || '', city: d.city || '', town: d.town || '' }); } catch (e) {}
  try { setManualMode_(userId); } catch (e) {}
  // 受付完了の通知はバースト抑制の対象にしない（直前の通知に潰されると査定依頼を見落とす）
  try {
    const name = getDisplayName_(userId);
    const id = 'line_' + (event.webhookEventId || (event.message && event.message.id));
    // 受付完了だけは LINE に残す（オーナーが個人 LINE の通知から見積を送れるように）。
    // 記録は今までどおり中央シートへ。通知は本文＋ボタンを 1 リクエスト（Push 1通）にまとめる（2026-09-22 Push通数対策）
    let wrote = true;
    try { wrote = appendInquiryRow_(new Date(), 'LINE', name, '📝 v2 受付完了（要査定）', summary, id, null, true); }
    catch (e) { wrote = true; } // シート書き込みが例外でも通知は試みる（今までどおり）
    if (wrote) v2NotifyReceipt_(name, cust, summary);
  } catch (e) {}
  v2LinkMenu_(userId, 'normal');
  v2ClearSession_(userId);
}

/** サイトの LINE ボタン（経路識別子つき初回メッセージ）から v2 の流れを始める。処理したら true
 *  電動ページ → 買取（電動＝はい を回答済みにしてバッテリーの質問から）／トップ・その他 → 買取／処分コラム → 処分・引取／診断コラム → バッテリーの調べ方 */
function v2StartFlowFromRoute_(event, userId, routeId) {
  if (!userId) return false;
  if (routeId === '（診断コラムから）') { v2StartFlow_(event, userId, 'battery', ''); return true; }
  if (routeId === '（処分コラムから）') { v2StartFlow_(event, userId, 'satei', 'shobun'); return true; }
  if (routeId === '（電動ページから）') {
    const s = { flow: 'satei', step: 2, intent: 'kaitori', data: { ebike: 'ebike', route: routeId } };
    v2Reply_(event, [v2Msg_('⚡ 電動アシストのご相談ありがとうございます！\n査定は写真だけで大丈夫です。金額が決まってからお伺いします（買取なら費用はかかりません）。'), v2AskBattery_('satei', 2)]);
    v2LinkMenu_(userId, 'inflow');
    v2SetSession_(userId, s);
    return true;
  }
  v2StartFlow_(event, userId, 'satei', 'kaitori');   // トップ・市町ページ・その他の「（〜から）」
  return true;
}

/** テキスト入力の受け口（handleEvent から呼ぶ）。処理したら true */
function v2HandleText_(event, userId, text) {
  const s = v2GetSession_(userId);
  // 旧タイル・旧クイックリプライの文言 → v2 に写像（セッションの有無に関わらず）
  const legacy = v2ParseLegacyText_(text);
  if (legacy) {
    if (legacy.val === 'photos_done' && !(s && s.step === 3)) {
      // 写真工程でないときの「写真は以上です」等: セッションが無ければ買取フローの写真工程として扱う
      if (!s) { v2StartFlow_(event, userId, 'satei', 'kaitori'); return true; }
    }
    return v2HandlePostback_(event, userId, legacy);
  }
  if (!s) return false;
  if (s.flow === 'satei' && s.step === 4) {
    const hit = detectCityFee(text);
    if (hit && !looksLikeQuestion_(text)) {
      s.data = s.data || {};
      s.data.city = hit.city || '';
      s.data.address = text.slice(0, 40);                                   // 町名まで（番地は聞かない）
      s.data.town = hit.city ? text.replace(hit.city, '').replace(/^[\s、,]+/, '').slice(0, 20) : text.slice(0, 20);
      s.data.fee = hit.fee;
      s.step = 5;
      v2Reply_(event, [v2Msg_(v2CityLines_(hit, s.intent).join('\n')), v2AskBohanMessage_('satei')]);
      v2SetSession_(userId, s);
      logEvent_(event, 'v2:satei/4/city', '返信:防犯登録の質問 ' + s.data.address);
      return true;
    }
    if (!s.data.cityRetried) {
      s.data = s.data || {}; s.data.cityRetried = true; v2SetSession_(userId, s);
      v2Reply_(event, [v2Msg_('市町名が読み取れませんでした。「金沢市」「かほく市」のように市町名だけで送ってください📍')]);
      logEvent_(event, 'v2:satei/4/city', '返信:再入力依頼');
      return true;
    }
    return false; // 2回目も読めない → 既存の分類不能（オーナー通知＋手動対応）へ
  }
  // ボタンで答える段階で文字が来た（例:「電動です」）→ 2回までは今の質問をボタン付きで出し直す。3回目は分類不能（人が対応）へ
  if (s.step === 1 || s.step === 2 || s.step === 3 || s.step === 5) {
    s.data = s.data || {};
    s.data.textMiss = (s.data.textMiss || 0) + 1;
    if (s.data.textMiss <= 2) {
      v2SetSession_(userId, s);
      v2Reply_(event, [v2Msg_('ありがとうございます。お手数ですが、下のボタンから選んでください👇')].concat(v2PromptMessages_(s)));
      logEvent_(event, 'v2:' + s.flow + '/' + s.step + '/text', '返信:ボタンの案内を再掲（' + s.data.textMiss + '回目）');
      return true;
    }
  }
  return false;
}
/** 現在の step の質問（v2Prompt_ と同じ内容を配列で返す。文字入力への再掲用） */
function v2PromptMessages_(s) {
  if (s.flow === 'satei' && s.step === 1) return [v2AskEbike_(s)];
  if (s.flow === 'satei' && s.step === 2) return [v2AskBattery_('satei', 2)];
  if (s.flow === 'battery' && s.step === 1) return [v2AskBattery_('battery', 1)];
  if (s.flow === 'battery' && s.step === 3) return [v2BatteryUnknownMessage_()];
  if (s.flow === 'satei' && s.step === 3 && s.data && s.data.rustAsk) return [v2AskRustMessage_()];   // サビの質問中に文字が来た → 同じ質問を出し直す
  if (s.step === 3) return [v2PhotoGuideMessage_(s)];
  if (s.flow === 'satei' && s.step === 4) return [v2AskCityMessage_()];
  if (s.flow === 'satei' && s.step === 5) return [v2AskBohanMessage_('satei')];
  return v2FlowStartMessages_(s);
}

/** 画像の受け口（handleEvent から呼ぶ）。写真工程なら枚数を数えて初回だけ受領確認。処理したら true */
function v2HandleImage_(event, userId) {
  const s = v2GetSession_(userId);
  if (!s) return false;
  s.data = s.data || {};
  s.data.photos = (s.data.photos || 0) + 1;
  if (s.step !== 3) {
    // 写真工程の前後に写真が来た → 受け取ったうえで、今の質問をもう一度出す（写真は記録に残す）
    v2Reply_(event, [v2Msg_('📸 お写真ありがとうございます、受け取りました！\nあわせて、こちらにもお答えください👇')].concat(v2PromptMessages_(s)));
  } else if (s.data.photos === 1) {
    v2Reply_(event, [v2Msg_('📸 お写真ありがとうございます、受け取りました！\n続けて送れます。送り終わったら「次へ進む」を押してください🚲', v2PhotoStepQuick_())]);
  }
  v2SetSession_(userId, s);
  try { logLineInquiry_(userId, '写真を送信（v2）', '(画像メッセージ ' + s.data.photos + '枚目)', 'line_' + event.message.id); } catch (e) {}
  logEvent_(event, 'v2:' + s.flow + '/' + s.step + '/image', '写真 ' + s.data.photos + '枚目');
  return true;
}

/** 受付完了の自分宛て通知。本文と「見積を送る」ボタンを 1 リクエスト（Push 1通）で送る。
 *  Push が失敗したときは Discord に本文を送る（2026-09-22 Push通数対策）。 */
function v2NotifyReceipt_(name, cust, summary) {
  const text = ownerNotifyText_('LINE', name, '📝 v2 受付完了（要査定）', summary);
  const messages = [{ type: 'text', text: text }];
  if (cust && typeof ownerqPb_ === 'function') {
    messages.push(v2Msg_('👆 ' + cust + '（' + name + '）に見積を送るときは、このボタンからどうぞ', [
      qrPostback_('💰 ' + cust + ' に見積を送る', ownerqPb_(1, 'next', cust)),
    ]));
  }
  let ok = false;
  if (OWNER_LINE_USER_ID && OWNER_LINE_USER_ID.indexOf('ここに') !== 0) {
    try { ok = pushMessage_(OWNER_LINE_USER_ID, messages).ok; } catch (e) { ok = false; }
  }
  if (!ok) postDiscord_(text + '\n（LINEに送れなかったためDiscordに届いています。見積はボットに「見積」と送ると入力できます）');
}
