// ─────────────────────────────────────────────────────────────────────────────
// POST /api/note — 진행 안내장(/go)의 「✏️ 요청 사항 남기기」 (2026-11-25)
//   본문: {j:'r:의뢰ID' | 'b:예약ID', t:'요청 내용'}
//   · 예약이 있으면 예약 문서에, 없으면 의뢰서에 cust_notes 로 쌓습니다 (최근 20개)
//     → 의뢰관리 · 예약관리 카드에 「✏️ 고객 요청」으로 보이고, 관리자 기기에 알림이 갑니다
//   · 품목 · 일정은 고객이 직접 바꾸지 않습니다 — 관리자가 확인 후 ✏️ 로 고칩니다
//   · 모든 단계(접수 전 · 접수 후 · 예약 신청 · 확정 후)에서 같은 방식
// ─────────────────────────────────────────────────────────────────────────────
import { getDoc, patchDoc, json, fail, rateLimited, originAllowed } from './_lib/fs.js';
import { sendAdminPush } from './_lib/push.js';

const ID_RE = /^[A-Za-z0-9_-]{4,80}$/;

export async function onRequestPost(context){
  const { request, env } = context;
  if (!originAllowed(request)) return fail('forbidden', 403);
  if (rateLimited(request, 'note', 6)) return fail('too many requests', 429);
  let b; try { b = await request.json(); } catch (e) { return fail('bad request', 400); }
  const m = /^([rb]):(.+)$/.exec(String((b && b.j) || '').trim());
  if (!m || !ID_RE.test(m[2])) return fail('bad-id', 400);
  const t = String((b && b.t) || '').replace(/\r/g, '').trim().slice(0, 500);
  if (!t) return fail('empty', 400);
  try {
    let coll = m[1] === 'r' ? 'requests' : 'bookings', id = m[2];
    let d = await getDoc(env, coll, id);
    if (!d) return fail('not-found', 404);
    // 의뢰가 이미 예약으로 넘어갔으면 예약 쪽에 남깁니다 (관리자는 예약관리에서 일함)
    if (coll === 'requests' && ID_RE.test(String(d.converted_booking_id || ''))) {
      const bk = await getDoc(env, 'bookings', d.converted_booking_id).catch(() => null);
      if (bk) { coll = 'bookings'; id = bk.__id; d = bk; }
    }
    const at = new Date().toISOString();
    const notes = (Array.isArray(d.cust_notes) ? d.cust_notes : []).filter(x => x && x.t).concat([{ t, at }]).slice(-20);
    await patchDoc(env, coll, id, { cust_notes: notes, cust_note_at: at, cust_note_new: true });
    const nm = String(d.customer_name || d.condo || '').slice(0, 40);
    await sendAdminPush(env, coll === 'bookings' ? 'booking' : 'request', {
      title: '✏️ 고객 요청 사항 도착',
      body: (nm ? nm + ' — ' : '') + t.slice(0, 90),
    }).catch(() => null);
    return json({ ok: true, notes });
  } catch (e) { return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500); }
}
