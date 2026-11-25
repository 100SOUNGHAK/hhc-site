// ─────────────────────────────────────────────────────────────────────────────
// GET /api/job?j=r:{의뢰ID} | b:{예약ID}   — 고객 「진행 안내장」(go.html) 용 (2026-11-25)
//   의뢰서와 그 의뢰에서 만든 예약을 하나로 묶어 돌려준다.
//   · r:의뢰ID → 의뢰서 + (예약으로 넘겼으면) converted_booking_id
//   · b:예약ID → 그 예약을 만든 의뢰서(있으면) + 예약 ID
//   예약 문서 자체(후보 날짜 · 마감 시간)는 기존 창구 GET /api/booking?id= 를 그대로 쓴다.
//   의뢰서는 화면에 필요한 칸만 보낸다 — 전화번호 · 위치 좌표 · 관리자 메모는 보내지 않는다.
//   문서 ID 가 열쇠(예측 불가)라 /api/booking · /api/doc 와 같은 방식.
// ─────────────────────────────────────────────────────────────────────────────
import { getDoc, queryEq, json, fail, rateLimited } from './_lib/fs.js';

const ID_RE = /^[A-Za-z0-9_-]{4,80}$/;
function safeReq(r){
  if (!r) return null;
  return {
    id: r.__id, status: r.status || 'pending',
    submitted_at: r.submitted_at || r.created_at || '',
    condo: r.condo || '', condo_name: r.condo_name || '', condo_unit: r.condo_unit || '',
    lang: r.lang === 'en' ? 'en' : 'ko',
    items: typeof r.items === 'string' ? r.items.slice(0, 8000) : '[]',
    remarks: typeof r.remarks === 'string' ? r.remarks.slice(0, 1000) : '',
    converted: r.converted_to_booking === true,
    notes: Array.isArray(r.cust_notes) ? r.cust_notes.slice(-20) : [],   // ✏️ 고객이 남긴 요청 사항 (2026-11-25)
  };
}

export async function onRequestGet(context){
  const { request, env } = context;
  if (rateLimited(request, 'job', 120)) return fail('too many requests', 429);
  const j = (new URL(request.url).searchParams.get('j') || '').trim();
  const m = /^([rb]):(.+)$/.exec(j);
  if (!m || !ID_RE.test(m[2])) return fail('bad-id', 400);
  try {
    let req = null, bkId = '';
    if (m[1] === 'r') {
      req = await getDoc(env, 'requests', m[2]);
      if (!req) return fail('not-found', 404);
      const cb = String(req.converted_booking_id || '');
      if (ID_RE.test(cb)) bkId = cb;
    } else {
      const bk = await getDoc(env, 'bookings', m[2]);
      if (!bk) return fail('not-found', 404);
      bkId = m[2];
      const rows = await queryEq(env, 'requests', 'converted_booking_id', m[2], 1).catch(() => []);
      req = rows && rows[0] || null;
    }
    return json({ ok: true, req: safeReq(req), bk_id: bkId });
  } catch (e) {
    return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500);
  }
}
