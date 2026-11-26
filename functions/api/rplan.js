// ─────────────────────────────────────────────────────────────────────────────
// /api/rplan — 고객용 수리 의향서 (rplan.html) 서버 창구 (2026-11-26)
//
// GET  /api/rplan?k=열쇠          → {ok, plan}  고객에게 보여 줄 내용만 (관리자 메모·전화번호 등은 빼고)
//                                   처음 열면 viewed_at 기록 + 상태 sent → viewed
// POST /api/rplan {k, act:'agree'|'decline', opt, remark, lang}
//                                 → 회신 저장 (status agreed | declined, reply{…}) + 관리자 앱 알림
//                                   이미 회신한 안내서면 409 + 지금 회신 내용
//                                   회신 순간의 내용을 snap 에 그대로 사본 저장 → 이후 고객 화면은 snap 으로 고정 (동의 증거)
//                                   선입금 계획안이면 reply.prepay = 선입금 금액 (고객 화면에 결제 계좌 안내)
//
// · 컬렉션 repair_plans (관리자 작성 화면 rplan-admin.html 이 만듦). 열쇠 = 문서의 tk 값(24자 임의 문자).
// · 작성 중(draft)·취소(cancel) 안내서는 고객이 열 수 없습니다.
// ─────────────────────────────────────────────────────────────────────────────
import { queryEq, patchDoc, json, fail, rateLimited, originAllowed } from './_lib/fs.js';
import { sendAdminPush } from './_lib/push.js';

const OPEN = ['sent', 'viewed', 'agreed', 'declined'];
const KEY_RE = /^[A-Za-z0-9]{16,40}$/;

async function findPlan(env, k){
  const r = (await queryEq(env, 'repair_plans', 'tk', k, 1))[0];
  if (!r || OPEN.indexOf(String(r.status || '')) < 0) return null;
  return r;
}
// 고객에게 보낼 필드만
function pub(r){
  const keep = ['ref','lang','status','created_at','sent_at','valid_until','fixed','unit','headline','lead','symptom','diagnosis',
                'parts','options','notes','opinion','reply','en','pay_ok_at'];
  const o = {};
  keep.forEach(k => { if (r[k] !== undefined) o[k] = r[k]; });
  if (o.reply && typeof o.reply === 'object') { o.reply = Object.assign({}, o.reply); delete o.reply.ua; }
  o.cust = { name: String((r.cust && r.cust.name) || '') };
  // 회신한 안내서는 회신 순간의 사본으로 보여 줌 (그 뒤 관리자가 고쳐도 고객이 동의한 내용은 그대로)
  if ((r.status === 'agreed' || r.status === 'declined') && r.snap && typeof r.snap === 'object') {
    SNAP_KEYS.forEach(k => { if (r.snap[k] !== undefined) o[k] = r.snap[k]; });
  }
  return o;
}
const SNAP_KEYS = ['fixed','unit','headline','lead','symptom','diagnosis','parts','options','notes','opinion','en','valid_until'];
function snapOf(r){ const o = {}; SNAP_KEYS.forEach(k => { if (r[k] !== undefined) o[k] = r[k]; }); return o; }
function prepayOf(o){ if (!o || !o.prepay) return 0; const a = Number(o.prepay_amt); if (a > 0) return Math.round(a * 100) / 100; const t = optTotal(o); return t > 0 ? t : 0; }
function optTotal(o){
  let s = 0, has = false;
  ((o && o.lines) || []).forEach(l => { if (l.amt === '' || l.amt == null) return; has = true; if (!l.waived) s += Number(l.amt) || 0; });
  return has ? Math.round(s * 100) / 100 : null;
}

export async function onRequestGet(context){
  const { request, env } = context;
  if (rateLimited(request, 'rpg', 40)) return fail('too many requests', 429);
  const k = String(new URL(request.url).searchParams.get('k') || '').trim();
  if (!KEY_RE.test(k)) return fail('bad request', 400);
  try {
    const r = await findPlan(env, k);
    if (!r) return fail('not-found', 404);
    const now = new Date().toISOString();
    const upd = { last_view_at: now, views: (Number(r.views) || 0) + 1 };
    if (!r.viewed_at) upd.viewed_at = now;
    if (r.status === 'sent') { upd.status = 'viewed'; r.status = 'viewed'; }
    await patchDoc(env, 'repair_plans', r.__id, upd).catch(() => {});
    return json({ ok: true, plan: pub(r) });
  } catch (e) { return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500); }
}

export async function onRequestPost(context){
  const { request, env } = context;
  if (!originAllowed(request)) return fail('forbidden', 403);
  if (rateLimited(request, 'rpp', 10)) return fail('too many requests', 429);
  let b; try { b = await request.json(); } catch (e) { return fail('bad request', 400); }
  const k = String((b && b.k) || '').trim();
  if (!KEY_RE.test(k)) return fail('bad request', 400);
  const act = b.act === 'agree' ? 'agree' : b.act === 'decline' ? 'decline' : '';
  if (!act) return fail('bad-act', 400);
  try {
    const r = await findPlan(env, k);
    if (!r) return fail('not-found', 404);
    if (r.status === 'agreed' || r.status === 'declined') { const rp = r.reply ? Object.assign({}, r.reply) : null; if (rp) delete rp.ua; return json({ ok: false, error: 'already', status: r.status, reply: rp }, 409); }
    if (r.valid_until && new Date(r.valid_until + 'T23:59:59+08:00') < new Date()) return fail('expired', 410);
    const opts = Array.isArray(r.options) ? r.options : [];
    let opt = b.opt === null || b.opt === undefined || b.opt === '' ? null : parseInt(b.opt, 10);
    if (opt !== null && !(opt >= 0 && opt < opts.length)) opt = null;
    if (act === 'agree' && opt === null) { if (opts.length === 1) opt = 0; else return fail('no-option', 400); }
    const o = opt !== null ? opts[opt] : null;
    const reply = {
      act, opt,
      opt_title: o ? String(o.title || '').slice(0, 200) : '',
      total: o ? optTotal(o) : null,
      remark: String((b && b.remark) || '').trim().slice(0, 500),
      lang: b.lang === 'en' ? 'en' : 'ko',
      at: new Date().toISOString(),
      ua: String(request.headers.get('user-agent') || '').slice(0, 160),
    };
    if (act === 'agree') reply.prepay = prepayOf(o);
    const status = act === 'agree' ? 'agreed' : 'declined';
    await patchDoc(env, 'repair_plans', r.__id, { status, reply, replied_at: reply.at, snap: Object.assign(snapOf(r), { at: reply.at }) });
    const who = String((r.cust && r.cust.name) || '고객');
    const push = await sendAdminPush(env, 'rplan', act === 'agree'
      ? { od: r.__id, title: '🛠 수리 진행 동의', body: who + ' · ' + (opts.length > 1 ? String.fromCharCode(65 + opt) + '안 ' : '') + (reply.total != null ? 'RM ' + reply.total : '견적 별도') + (reply.prepay ? ' · 💳 선입금 RM ' + reply.prepay + ' 대기' : '') + ' · 눌러서 확인하세요' }
      : { od: r.__id, title: '🛠 수리 진행 안 함', body: who + (reply.remark ? ' · ' + reply.remark.slice(0, 60) : '') + ' · 눌러서 확인하세요' }
    ).catch(() => ({ ok: false }));
    const out = Object.assign({}, reply); delete out.ua;
    return json({ ok: true, status, reply: out, push });
  } catch (e) { return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500); }
}
