// ─────────────────────────────────────────────────────────────────────────────
// POST /api/transfer — 회원권 잔액 양도 · 전자상품권 전환 신청서(transfer.html #apply) 접수 (2026-11-23)
//  본문: {kind:'transfer'|'voucher', reason:'home'|'abroad', leave_date?, name, condo, phone, contract_no?,
//         remarks?, lang, agree:true,
//         // 양도   : amt_mode:'all'|'part', recipients:[{name, condo_name, unit, phone, amt?}]
//         //          (all = 남은 잔액 전부 · 받는 분 1명 / part = 받는 분마다 금액 · 여러 명 가능)  (2026-11-23 여러 명)
//         // 상품권 : v_mode:'all'|'split', vouchers?:[{amt, qty, to, condo_name, unit, phone}] (split 일 때 · 받는 분 이름·콘도명·동호수·전화 필수)
//         // condo = 콘도명 + 동호수 (관리자 화면 표시용으로 서버가 합쳐 저장)
//        }
//  → transfer_reqs 컬렉션에 새 문서(status:'new') + 관리자 기기 푸시 알림(「청구 → 양도·전환」 탭)
//  응답: {ok:true, id, ref}   ref = 고객에게 보여 주는 짧은 접수번호 (TR-월일-4자리)
//  ※ 실제 잔액 차감 · 상품권 발행은 관리자가 계약 화면(admin.html) · 상품권 관리(coupon-admin.html)에서 처리합니다.
// ─────────────────────────────────────────────────────────────────────────────
import { createDoc, getDoc, queryEq, patchDoc, json, fail, rateLimited, originAllowed } from './_lib/fs.js';
import { sendAdminPush } from './_lib/push.js';

const MAX = { name: 80, condo: 200, phone: 40, contract_no: 40, remarks: 2000, to_name: 80, to_phone: 40, leave_date: 10, lang: 5 };
const MAX_ROWS = 30, MAX_QTY = 100, MAX_AMT = 1000000, MAX_TR = 10;

function num(v){ v = Number(v); return isFinite(v) ? Math.round(v * 100) / 100 : 0; }
function digits(p){ return String(p || '').replace(/\D/g, ''); }

export async function onRequestPost(context){
  const { request, env } = context;
  if (!originAllowed(request)) return fail('forbidden', 403);
  if (rateLimited(request, 'tr', 5)) return fail('too many requests', 429);
  let b; try { b = await request.json(); } catch (e) { return fail('bad request', 400); }
  if (b && b.op === 'agree') return agree(env, b);
  const str = (k) => { const v = b && b[k]; return typeof v === 'string' ? v.trim().slice(0, MAX[k] || 200) : ''; };

  const kind = b.kind === 'voucher' ? 'voucher' : b.kind === 'transfer' ? 'transfer' : '';
  const reason = b.reason === 'home' || b.reason === 'abroad' ? b.reason : '';
  const name = str('name'), condo = str('condo'), phone = str('phone');
  if (!kind || !reason || !name || !condo || !phone) return fail('missing-fields', 400);
  if (digits(phone).length < 9) return fail('invalid-phone', 400);
  if (b.agree !== true) return fail('not-agreed', 400);

  const data = {
    kind, reason, name, condo, phone,
    contract_no: str('contract_no'),
    leave_date: /^\d{4}-\d{2}-\d{2}$/.test(str('leave_date')) ? str('leave_date') : '',
    remarks: str('remarks'),
    // 고객 화면에 보였던 현재 적립잔액(발송 링크 b=) · 기준일 — 관리자 참고용
    bal_shown: num(b.bal_shown) > 0 && num(b.bal_shown) <= MAX_AMT ? num(b.bal_shown) : 0,
    bal_date: /^\d{4}-\d{2}-\d{2}$/.test(String(b.bal_date || '')) ? String(b.bal_date) : '',
    lang: str('lang') === 'en' ? 'en' : 'ko',
    status: 'new',
    submitted_at: new Date().toISOString(),
  };

  if (kind === 'transfer') {
    data.amt_mode = b.amt_mode === 'part' ? 'part' : 'all';
    const rs = Array.isArray(b.recipients) ? b.recipients.slice(0, data.amt_mode === 'all' ? 1 : MAX_TR) : [];
    data.recipients = rs.map(r => {
      const cn = String((r && r.condo_name) || '').trim().slice(0, 160), un = String((r && r.unit) || '').trim().slice(0, 40);
      const o = { name: String((r && r.name) || '').trim().slice(0, 80), condo_name: cn, unit: un,
                  condo: (cn + ' ' + un).trim().slice(0, 200), phone: String((r && r.phone) || '').trim().slice(0, 40) };
      if (data.amt_mode === 'part') o.amt = num(r && r.amt);
      return o;
    });
    if (!data.recipients.length) return fail('missing-transferee', 400);
    for (const r of data.recipients) {
      if (!r.name || !r.condo_name || !r.unit || digits(r.phone).length < 9) return fail('missing-transferee', 400);
      if (data.amt_mode === 'part' && (!(r.amt > 0) || r.amt > MAX_AMT)) return fail('invalid-amount', 400);
    }
    if (data.amt_mode === 'part') data.t_total = Math.round(data.recipients.reduce((a, r) => a + r.amt, 0) * 100) / 100;
    // 목록 · 알림용 요약 (첫 분 이름 + 외 n명)
    data.to_name = data.recipients[0].name + (data.recipients.length > 1 ? ' 외 ' + (data.recipients.length - 1) + '명' : '');
    data.to_phone = data.recipients[0].phone;
  } else {
    data.v_mode = b.v_mode === 'split' ? 'split' : 'all';
    if (data.v_mode === 'split') {
      const rows = Array.isArray(b.vouchers) ? b.vouchers.slice(0, MAX_ROWS) : [];
      data.vouchers = rows.map(r => ({
        amt: num(r && r.amt),
        qty: Math.floor(num(r && r.qty)),
        to: String((r && r.to) || '').trim().slice(0, 80),
        condo_name: String((r && r.condo_name) || '').trim().slice(0, 160),
        unit: String((r && r.unit) || '').trim().slice(0, 40),
        phone: String((r && r.phone) || '').trim().slice(0, 40),
      })).map(v => Object.assign(v, { condo: (v.condo_name + ' ' + v.unit).trim() }));
      if (!data.vouchers.length) return fail('missing-vouchers', 400);
      for (const v of data.vouchers) {
        if (!(v.amt > 0 && v.amt <= MAX_AMT && v.qty > 0 && v.qty <= MAX_QTY)) return fail('invalid-voucher', 400);
        if (!v.to || !v.condo_name || !v.unit || digits(v.phone).length < 9) return fail('missing-voucher-recipient', 400);
      }
      data.v_total = Math.round(data.vouchers.reduce((a, r) => a + r.amt * r.qty, 0) * 100) / 100;
      data.v_count = data.vouchers.reduce((a, r) => a + r.qty, 0);
    }
  }

  // 짧은 접수번호 (말레이시아 날짜 + 임의 4자리) — 고객 안내 · 관리자 검색용
  const my = new Date(Date.now() + 8 * 3600e3);
  data.ref = 'TR-' + String(my.getUTCMonth() + 1).padStart(2, '0') + String(my.getUTCDate()).padStart(2, '0') + '-' +
             String(Math.floor(1000 + Math.random() * 9000));

  try {
    const d = await createDoc(env, 'transfer_reqs', data);
    const who = name + (kind === 'transfer' ? ' → ' + data.to_name : '');
    const push = await sendAdminPush(env, 'transfer', {
      title: kind === 'transfer' ? '🔁 새 잔액 양도 신청' : '🎁 새 상품권 전환 신청',
      body: who + ' · 눌러서 확인하세요',
    }).catch(() => ({ ok: false }));
    return json({ ok: true, id: d.__id, ref: data.ref, push });
  } catch (e) { return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500); }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transfer?k=TOKEN&i=받는 분 번호 — 양도받는 분 안내장(transfer-in.html)용 요약 (2026-11-23)
//  · TOKEN(tk)·계약 연결(ct_id)은 관리자 「양도·전환」 화면에서 「📨 안내장」을 누를 때 신청 문서에 저장됩니다.
//  · 돌려주는 것: 양도자 이름 · 받는 분(이름·서비스 대상) · 양도 금액(전부면 지금 잔액) · 원 계약의 번호·등급·계약일·부가혜택 키
//    양도자 전화번호 · 이용내역 · 특약사항은 보내지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────
function ctRemain(c){
  const tot=(parseFloat(c.amount_paid)||0)+(parseFloat(c.bonus_credit)||0)+(parseFloat(c.special_bonus_credit)||0);
  let h=[];try{h=typeof c.usage_history==='string'?JSON.parse(c.usage_history||'[]'):(c.usage_history||[]);}catch(e){}
  const s=k=>h.reduce((a,u)=>a+(parseFloat(u&&u[k])||0),0);
  return Math.round((tot-s('amount')+s('discount')+s('carryover'))*100)/100;
}
function benKeys(b){
  let a=b;try{if(typeof b==='string')a=JSON.parse(b||'[]');}catch(e){a=[];}
  // 계약서 저장 형식: {"promo":true,"parking":false,…} (admin.html getFormData) — 체크된 것만
  if(a&&!Array.isArray(a)&&typeof a==='object')return Object.keys(a).filter(x=>a[x]===true||a[x]==='true').slice(0,40);
  if(!Array.isArray(a))a=[];
  return a.map(x=>typeof x==='string'?x:(x&&(x.key||x.k))||'').filter(Boolean).slice(0,40);
}
export async function onRequestGet(context){
  const { request, env } = context;
  if (rateLimited(request, 'tri', 30)) return fail('too many requests', 429);
  const u = new URL(request.url);
  const k = String(u.searchParams.get('k') || '').trim();
  const i = Math.max(0, parseInt(u.searchParams.get('i') || '0', 10) || 0);
  if (!/^[A-Za-z0-9]{16,40}$/.test(k)) return fail('bad request', 400);
  try {
    const r = (await queryEq(env, 'transfer_reqs', 'tk', k, 1))[0];
    if (!r || r.kind !== 'transfer' || r.status === 'cancel') return fail('not-found', 404);
    const rc = Array.isArray(r.recipients) && r.recipients.length ? r.recipients : [{ name: r.to_name, phone: r.to_phone, amt: r.amt }];
    const to = rc[i]; if (!to) return fail('not-found', 404);
    const c = r.ct_id ? await getDoc(env, 'contracts', r.ct_id) : null;
    const remain = c ? ctRemain(c) : (Number(r.bal_shown) || 0);
    const amount = r.amt_mode === 'part' ? (Number(to.amt) || 0) : remain;
    const my = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
    const ok = (r.tin_ok && r.tin_ok[String(i)]) || '';
    return json({ ok: true, ref: r.ref || '', lang: r.lang === 'en' ? 'en' : 'ko', status: r.status || 'new', agreed_at: ok,
      from: String(r.name || ''), to: { name: String(to.name || ''), condo: String(to.condo || '') },
      amount, amt_mode: r.amt_mode === 'part' ? 'part' : 'all', as_of: my, people: rc.length,
      contract: { no: String((c && c.contract_no) || r.contract_no || ''), pkg: String((c && c.package_id) || ''),
                  type: String((c && c.contract_type) || ''), date: String((c && c.contract_date) || ''),
                  benefits: c ? benKeys(c.benefits) : [] } });
  } catch (e) { return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500); }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/transfer {op:'agree', k, i} — 양도받는 분이 안내장에서 「내용 이해 및 동의하기」를 누름 (2026-11-23)
//  → 신청 문서 tin_ok[i] = 누른 시각(ISO) 저장 + 관리자 앱 알림 「✅ 양도 동의」
//  · 이미 동의한 경우 다시 저장 · 알림하지 않고 처음 시각을 돌려줍니다.
// ─────────────────────────────────────────────────────────────────────────────
async function agree(env, b){
  const k = String(b.k || '').trim(), i = Math.max(0, parseInt(b.i, 10) || 0);
  if (!/^[A-Za-z0-9]{16,40}$/.test(k)) return fail('bad request', 400);
  try {
    const r = (await queryEq(env, 'transfer_reqs', 'tk', k, 1))[0];
    if (!r || r.kind !== 'transfer' || r.status === 'cancel') return fail('not-found', 404);
    const rc = Array.isArray(r.recipients) && r.recipients.length ? r.recipients : [{ name: r.to_name }];
    const to = rc[i]; if (!to) return fail('not-found', 404);
    const prev = (r.tin_ok && typeof r.tin_ok === 'object') ? r.tin_ok : {};
    if (prev[String(i)]) return json({ ok: true, agreed_at: prev[String(i)], already: true });
    const at = new Date().toISOString();
    await patchDoc(env, 'transfer_reqs', r.__id, { tin_ok: Object.assign({}, prev, { [String(i)]: at }), updated_at: at });
    const amt = r.amt_mode === 'part' ? 'RM ' + (Number(to.amt) || 0).toLocaleString('en-MY') : '잔액 전부';
    await sendAdminPush(env, 'transfer', { title: '✅ 양도 동의 — ' + (to.name || ''), body: (r.name || '') + ' → ' + (to.name || '') + ' · ' + amt + ' · 눌러서 확인하세요' }).catch(() => {});
    return json({ ok: true, agreed_at: at });
  } catch (e) { return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500); }
}
