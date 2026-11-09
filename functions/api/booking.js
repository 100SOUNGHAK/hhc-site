// ─────────────────────────────────────────────────────────────────────────────
// /api/booking — 고객 예약서(booking.html) (2026-11-09)
//  GET  /api/booking?id={예약ID}            → 예약 1건
//  POST /api/booking  {id, status:'booked', booking_date, booking_time, booking_items, booking_items_struct, booking_memo, edit?:true}
//       → 고객이 고른 일정·항목을 저장하고 관리자 기기로 푸시 알림
//
// 고객이 바꿀 수 있는 필드만 받는다(아래 목록). 그 밖의 필드(고객명·전화·관리자 메모 등)는 보내도 무시한다.
// ─────────────────────────────────────────────────────────────────────────────
import { getDoc, patchDoc, json, fail, rateLimited, originAllowed } from './_lib/fs.js';
import { sendAdminPush } from './_lib/push.js';

const MAX = { booking_date: 40, booking_time: 40, booking_items: 4000, booking_items_struct: 20000, booking_memo: 2000 };

export async function onRequestGet(context){
  const { request, env } = context;
  if (rateLimited(request, 'bk', 120)) return fail('too many requests', 429);
  const id = (new URL(request.url).searchParams.get('id') || '').trim();
  if (!id || id.length > 200) return fail('no-id', 400);
  try {
    const d = await getDoc(env, 'bookings', id);
    if (!d) return fail('not-found', 404);
    return json({ ok: true, doc: d });
  } catch (e) { return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500); }
}

export async function onRequestPost(context){
  const { request, env } = context;
  if (!originAllowed(request)) return fail('forbidden', 403);
  if (rateLimited(request, 'bkw', 20)) return fail('too many requests', 429);
  let b; try { b = await request.json(); } catch (e) { return fail('bad request', 400); }
  const id = String((b && b.id) || '').trim();
  if (!id || id.length > 200) return fail('no-id', 400);
  const str = (k) => { const v = b[k]; return typeof v === 'string' ? v.slice(0, MAX[k]) : ''; };
  const payload = {
    status: 'booked',
    booking_date: str('booking_date'),
    booking_time: str('booking_time'),
    booking_items: str('booking_items'),
    booking_items_struct: str('booking_items_struct'),
    booking_memo: str('booking_memo'),
    booked_at: new Date().toISOString(),
  };
  if (!payload.booking_date || !payload.booking_time) return fail('missing-date', 400);
  try {
    const cur = await getDoc(env, 'bookings', id);
    if (!cur) return fail('not-found', 404);
    const isEdit = !!b.edit;
    if (isEdit) { payload.edited_at = payload.booked_at; payload.edit_count = (parseInt(cur.edit_count, 10) || 0) + 1; }
    const saved = await patchDoc(env, 'bookings', id, payload);
    // 관리자 푸시 — 실패해도 예약 저장에는 영향 없음
    const push = await sendAdminPush(env, isEdit ? 'booking_edit' : 'booking').catch(() => ({ ok: false }));
    return json({ ok: true, doc: saved, push });
  } catch (e) { return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500); }
}
