// ─────────────────────────────────────────────────────────────────────────────
// 날짜·분이 찍힌 미리보기 그림 고르기 (2026-11-21) — functions/r.js · functions/_middleware.js 공용
//
//  · 예약 확정(vi=bc)        → og-dc/MMDD.jpg   「확정된 방문 날짜 + 작업방문등록 필수」
//  · 예약 신청(vi=bq)        → og-db/MMDD.jpg   「방문 날짜를 골라 주세요 · 이날부터 선택」
//  · 이동중·지연(vi=mv/dt/dw + mn=분) → og-mv|og-dt|og-dw/N.jpg 「N분 후 도착」 (1~180분)
//  · 지금 방문(vi=nw)        → og-now.jpg
//  · 점검(수리) 접수(vi=ir)  → og-received-repair.jpg
//  · 예약서(booking.html?id=) → 예약 문서를 읽어 확정일(dc) 또는 첫 후보일(db)
//  · 작업방문등록(workpermit?vi=bc&d=YYYY-MM-DD) → og-dc/MMDD.jpg
//  날짜·분 묶음 그림은 1000×525, 단일 그림은 1200×630 입니다. 해당 없으면 null.
// ─────────────────────────────────────────────────────────────────────────────
import { getDoc } from './fs.js';

const ME = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const SET = { w: '1000', h: '525' };

function mdOf(s){
  const m = /^(?:\d{4}-)?(\d{2})-?(\d{2})/.exec(String(s || ''));
  if (!m) return '';
  const mm = +m[1], dd = +m[2];
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 ? m[1] + m[2] : '';
}
function dateImg(kind, md){
  const mm = +md.slice(0, 2), dd = +md.slice(2, 4), de = dd + ' ' + ME[mm - 1];
  return kind === 'dc'
    ? { img: 'dc/' + md, ...SET,
        tk: mm + '월 ' + dd + '일 예약 확정 · Confirmed | Happy Home Care', te: 'Confirmed for ' + de + ' | Happy Home Care',
        dk: mm + '월 ' + dd + '일 방문이 확정되었습니다 · 작업방문등록 필수', de: 'Your visit on ' + de + ' is confirmed · Work Permit registration required' }
    : { img: 'db/' + md, ...SET,
        tk: '방문 날짜 선택 · Booking | Happy Home Care', te: 'Pick Your Date | Happy Home Care',
        dk: mm + '월 ' + dd + '일부터 편하신 날짜를 골라 주세요', de: 'Choose a date that suits you from ' + de };
}
const MIN = {
  mv: ['mv', '방문하러 가는 중 · On the way', 'On the Way', '분 후 도착 예정입니다', 'We are on our way · arriving in '],
  dt: ['dt', '도착 지연 안내 · Delay', 'Running Late', '분 후 도착 예정입니다 · 교통 체증으로 늦어집니다', 'Stuck in traffic · arriving in '],
  dw: ['dw', '도착 지연 안내 · Delay', 'Running Late', '분 후 도착 예정입니다 · 앞 작업이 길어졌습니다', 'Previous job ran over · arriving in '],
};

// t: URL 객체. env 가 있으면 예약서 문서를 읽어 날짜를 찾습니다.
export async function visitImg(env, t){
  const q = t.searchParams, vi = q.get('vi') || '', p = t.pathname;
  if (/^\/(my|mypage|my-en)(\.html)?$/i.test(p)){
    if (vi === 'bc' || vi === 'bq'){ const md = mdOf(q.get('vd')); if (md) return dateImg(vi === 'bc' ? 'dc' : 'db', md); }
    if (MIN[vi]){
      const n = parseInt(q.get('mn') || '', 10);
      if (n >= 1 && n <= 180){ const [s, tk, te, dk, de] = MIN[vi];
        return { img: s + '/' + n, ...SET, tk: tk + ' | Happy Home Care', te: te + ' | Happy Home Care', dk: n + dk, de: de + n + ' min' }; }
    }
    if (vi === 'nw') return { img: 'now', w: '1200', h: '630', tk: '지금 방문 가능 · Now | Happy Home Care', te: 'Visiting Now | Happy Home Care',
      dk: '지금 바로 방문 가능합니다', de: 'We can visit you right now' };
    if (vi === 'ir') return { img: 'received-repair', w: '1200', h: '630', tk: '점검(수리) 접수 · Repair Request | Happy Home Care', te: 'Repair Request Received | Happy Home Care',
      dk: '점검(수리) 의뢰가 접수되었습니다 · 담당 직원이 확인 후 가능 일정을 안내드리겠습니다', de: 'Your repair request is received · we will let you know the available dates' };
    return null;
  }
  if (/^\/workpermit(\.html)?$/i.test(p) && vi === 'bc'){
    const md = mdOf(q.get('d')); return md ? dateImg('dc', md) : null;
  }
  if (/^\/booking(\.html)?$/i.test(p) && env){
    const id = q.get('id') || '';
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) return null;
    let b = null; try { b = await getDoc(env, 'bookings', id); } catch (_) { return null; }
    if (!b || /cancel/i.test(String(b.status || ''))) return null;
    const bd = mdOf(b.booking_date);
    if (bd) return dateImg('dc', bd);
    let a = []; try { a = typeof b.schedule_dates === 'string' ? JSON.parse(b.schedule_dates || '[]') : (b.schedule_dates || []); } catch (_) {}
    a = (Array.isArray(a) ? a : []).map(String).filter(x => /^\d{4}-\d{2}-\d{2}/.test(x)).sort();
    const md = mdOf(a[0]); return md ? dateImg('db', md) : null;
  }
  return null;
}
