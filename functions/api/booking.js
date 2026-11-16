// ─────────────────────────────────────────────────────────────────────────────
// /api/booking — 고객 예약서(booking.html) (2026-11-09)
//  GET  /api/booking?id={예약ID}            → 예약 1건
//  POST /api/booking  {id, status:'booked', booking_date, booking_time, booking_items, booking_items_struct, booking_memo, edit?:true}
//       → 고객이 고른 일정·항목을 저장하고 관리자 기기로 푸시 알림
//
// (2026-11-16) 마감 시간 — 다른 고객이 이미 신청(booked)했거나 확정(confirmed)된 예약과
//   같은 날 전후 1시간 이내인 후보 시간은 「마감」으로 막는다.
//   · GET 응답의 taken = { 'YYYY-MM-DD': ['후보 시간 문자열', …] } — 이 예약서의 후보 시간 중 막힌 것만(다른 고객 정보는 보내지 않음)
//   · POST 는 저장 직전에 다시 확인 → 겹치면 409 slot-taken (저장하지 않음)
//   · 지난 날짜(오늘의 지난 시간 포함)는 409 slot-past
//   · 관리자가 그 예약을 「대기중」으로 돌리거나 삭제하면 자동으로 다시 열림(상태만 보고 판단)
//
// 고객이 바꿀 수 있는 필드만 받는다(아래 목록). 그 밖의 필드(고객명·전화·관리자 메모 등)는 보내도 무시한다.
// ─────────────────────────────────────────────────────────────────────────────
import { getDoc, patchDoc, queryIn, json, fail, rateLimited, originAllowed } from './_lib/fs.js';
import { sendAdminPush } from './_lib/push.js';

// 시간 글자 → 분 (예약관리 bkTimeMin 과 같은 규칙). 읽을 수 없으면 null
function tMin(v){
  const s=String(v==null?'':v).split('|')[0].trim();
  if(!s) return null;
  const pm=/오후|저녁|p\.?m\.?/i.test(s), am=/오전|아침|a\.?m\.?/i.test(s);
  let m=s.match(/(\d{1,2})\s*[:시]\s*(\d{1,2})?/);
  if(!m){ const d=s.match(/(\d{1,2})/); if(!d) return null; m=[null,d[1],null]; }
  let h=parseInt(m[1],10)||0; const mi=parseInt(m[2]||'0',10)||0;
  if(pm&&h<12) h+=12; if(am&&h===12) h=0;
  return h*60+mi;
}
const HOLD = { booked: 1, confirmed: 1 };   // 이 상태의 다른 예약이 시간을 차지함
const GAP = 60;                              // 전후 1시간
// 다른 예약이 차지한 시간: { 날짜: [분, …] }
async function busyMap(env, selfId, dates){
  const ds=[...new Set((dates||[]).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)))].slice(0,60);
  const out={}; if(!ds.length) return out;
  const rows=await queryIn(env,'bookings','booking_date',ds,300);
  for(const r of rows){
    if(!r||r.__id===selfId||!HOLD[r.status]) continue;
    const m=tMin(r.booking_time); if(m==null) continue;
    (out[r.booking_date]=out[r.booking_date]||[]).push(m);
  }
  return out;
}
const clash=(busy,date,time)=>{ const m=tMin(time); if(m==null) return false; return (busy[date]||[]).some(x=>Math.abs(x-m)<=GAP); };
function parseJ(s,d){ try{ const v=JSON.parse(s||''); return v&&typeof v==='object'?v:d; }catch(e){ return d; } }

const MAX = { booking_date: 40, booking_time: 40, booking_items: 4000, booking_items_struct: 20000, booking_memo: 2000 };

export async function onRequestGet(context){
  const { request, env } = context;
  if (rateLimited(request, 'bk', 120)) return fail('too many requests', 429);
  const id = (new URL(request.url).searchParams.get('id') || '').trim();
  if (!id || id.length > 200) return fail('no-id', 400);
  try {
    const d = await getDoc(env, 'bookings', id);
    if (!d) return fail('not-found', 404);
    // 이 예약서의 후보 시간 중 마감된 것 — 실패해도 예약서는 그대로 보여 준다
    let taken = {};
    try {
      const T0 = new Date(Date.now()+8*3600e3).toISOString().slice(0,10);   // 말레이시아 오늘
      const dates = (parseJ(d.schedule_dates, [])||[]).filter(x=>String(x)>=T0);
      const times = parseJ(d.schedule_times, {});
      if (dates.length) {
        const busy = await busyMap(env, id, dates);
        for (const dt of dates) {
          const hit = (Array.isArray(times[dt])?times[dt]:[]).filter(t=>clash(busy,dt,t));
          if (hit.length) taken[dt] = hit;
        }
      }
    } catch (e) { taken = {}; }
    return json({ ok: true, doc: d, taken });
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
    // 지난 일정은 저장하지 않음 (말레이시아 시간 기준)
    const nowM = new Date(Date.now()+8*3600e3), T0 = nowM.toISOString().slice(0,10);
    const pm = tMin(payload.booking_time);
    if (payload.booking_date < T0 || (payload.booking_date === T0 && pm != null && pm <= nowM.getUTCHours()*60+nowM.getUTCMinutes())) return fail('slot-past', 409);
    // 저장 직전 마감 확인 — 그사이 다른 고객이 신청·확정한 시간이면 저장하지 않는다
    const busy = await busyMap(env, id, [payload.booking_date]);
    if (clash(busy, payload.booking_date, payload.booking_time)) return fail('slot-taken', 409);
    const isEdit = !!b.edit;
    if (isEdit) { payload.edited_at = payload.booked_at; payload.edit_count = (parseInt(cur.edit_count, 10) || 0) + 1; }
    const saved = await patchDoc(env, 'bookings', id, payload);
    // 관리자 푸시 — 실패해도 예약 저장에는 영향 없음
    const push = await sendAdminPush(env, isEdit ? 'booking_edit' : 'booking').catch(() => ({ ok: false }));
    return json({ ok: true, doc: saved, push });
  } catch (e) { return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500); }
}
