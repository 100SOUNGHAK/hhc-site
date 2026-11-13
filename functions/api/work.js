// ─────────────────────────────────────────────────────────────────────────────
// GET /api/work?k={직원 링크 열쇠}            → 직원용 작업일정 (work.html)  (2026-11-13)
// GET /api/work?manifest=1&k={열쇠}           → 홈 화면 설치용 manifest (열쇠가 붙은 주소로 열리게)
//
//  · 열쇠는 settings/work_link.key 와 같아야 한다 (관리자 앱 「직원 일정표」 탭에서 만들고 바꿈).
//  · 보여 주는 날짜 (말레이시아 시간):
//      19:00 ~ 다음 날 17:59  → 다음 날 일정  (자정 이후에는 「오늘」이 그날이 됨)
//      18:00 ~ 18:59          → 준비 중 (mode:'soon', 일정 없음)
//  · 일정 규칙은 「내일 일정 단체방 보내기」(sched-send.html)와 같다:
//      확정 예약(bookings, status=confirmed) + 일정(schedules, 예약 미러·휴일·✅완료 제외)
//  · 고객 전화번호 · 가격 · 내부 메모는 내려보내지 않는다. 시간 · 장소 · 동호수 · 품목 · 수량 · 주소만.
// ─────────────────────────────────────────────────────────────────────────────
import { getDoc, queryEq, json, fail, rateLimited } from './_lib/fs.js';

const MY_OFFSET = 8 * 60;   // UTC+8

function myNow(){ const n = new Date(); return new Date(n.getTime() + MY_OFFSET * 60000); }   // UTC 필드에 말레이시아 시각
function ymd(d){ return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); }
function addDays(ds, n){ const d = new Date(ds + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return ymd(d); }

// 지금 보여 줄 날짜와 상태
function pickDay(){
  const now = myNow(), h = now.getUTCHours(), today = ymd(now);
  if (h >= 19) return { date: addDays(today, 1), mode: 'tomorrow' };
  if (h === 18) return { date: addDays(today, 1), mode: 'soon' };
  return { date: today, mode: 'today' };
}

// 예약 시간 "14:00 전후|Around 14:00" → "14:00"
function bkTime(v){
  let t = String(v || '').trim(); if (!t) return '';
  if (t.indexOf('|') >= 0){ const a = t.split('|'); t = String(a[1] || a[0] || '').trim(); }
  const m = /(\d{1,2}):(\d{2})/.exec(t);
  return m ? String(m[1]).padStart(2, '0') + ':' + m[2] : '';
}

// ── 동호수 · 콘도명 ──
// "Arcoris A-23-05", "Verve Suites B-15-03", "#12-02", "Unit 23A-05" 등에서 동호수만 뽑는다
const UNIT_RE = /(?:#|unit\s*|no\.?\s*)?\b([A-Z]{1,2}\d{0,2}[A-Z]?-\d{1,3}[A-Z]?(?:-\d{1,3}[A-Z]?)?|\d{1,3}[A-Z]?-\d{1,3}[A-Z]?(?:-\d{1,3}[A-Z]?)?)\b/i;
function splitUnit(s){
  const str = String(s || '').trim(); if (!str) return { place: '', unit: '' };
  const m = UNIT_RE.exec(str);
  if (!m) return { place: str, unit: '' };
  const place = (str.slice(0, m.index) + ' ' + str.slice(m.index + m[0].length))
    .replace(/[,\s·—–-]+$/, '').replace(/^[,\s·—–-]+/, '').replace(/\s{2,}/g, ' ').trim();
  return { place, unit: m[1].toUpperCase() };
}
// 전화번호 · 금액이 든 줄은 직원 화면에 보내지 않는다
const PHONE_RE = /(\+?6?0\s?1\d[\d\s-]{6,})/;
const PRICE_RE = /(RM\s?\d|\d+\s?링깃|ringgit)/i;
function cleanLines(text){
  return String(text || '').split('\n').map(s => s.trim()).filter(Boolean)
    .filter(l => !PHONE_RE.test(l) && !PRICE_RE.test(l))
    .map(l => l.replace(/^[📍🏠🔧📝]\s*/u, ''));
}

// ── 품목 ──
// 예약관리(booking-admin PK_CATS)와 같은 분류. 구조 데이터가 없으면 표시 문자열을 거꾸로 읽는다.
const CAT_BY_KO = { '에어컨(가정용)':'ac_home','에어컨(매장용)':'ac_shop','세탁기':'washer','매트리스':'mattress','쇼파':'sofa','커튼':'curtain',
  '건조기':'dryer','주방후드':'hood','냉장고':'fridge','공기청정기':'purifier','실링팬':'fan','식탁의자':'chair','카페트':'carpet','기타서비스':'etc' };
function parseStruct(raw){
  if (!raw) return null;
  try{
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr) || !arr.length) return null;
    const out = arr.map(it => ({ catId: String(it.catId || 'etc'), grpKo: it.grpKo || null, svcKo: it.svcKo || null,
      free: !!it.free, text: it.free ? String(it.text || '') : '', qty: Math.max(1, parseInt(it.qty, 10) || 1) }))
      .filter(it => it.free ? it.text : (it.svcKo || it.grpKo));
    return out.length ? out : null;
  }catch(e){ return null; }
}
// "에어컨(가정용)(2대/벽걸이형 · 기본세척), 세탁기(1대/드럼세탁기)"
function parseText(s){
  const out = []; if (!s) return out;
  const re = /(.+?)\((\d+)\s*(?:대|units?\(s\)|units?)\s*\/\s*([^)]*)\)(?:\s*,\s*|\s*$)/g; let m;
  while ((m = re.exec(s)) !== null){
    const name = m[1].trim(), qty = parseInt(m[2], 10) || 1, svcPart = m[3].trim();
    const cat = CAT_BY_KO[name];
    if (!cat || cat === 'etc' || svcPart === '기타서비스'){ out.push({ catId: 'etc', free: true, text: name, qty }); continue; }
    const sep = svcPart.indexOf(' · ');
    out.push({ catId: cat, grpKo: sep >= 0 ? svcPart.slice(0, sep) : null, svcKo: sep >= 0 ? svcPart.slice(sep + 3) : svcPart, free: false, text: '', qty });
  }
  if (!out.length && String(s).trim()) out.push({ catId: 'etc', free: true, text: String(s).trim(), qty: 1 });
  return out;
}
function itemsOf(o){ return parseStruct(o.booking_items_struct) || parseStruct(o.prefill_items_struct) || parseText(o.booking_items || ''); }

// 예약 · 예약형 일정 → 직원 화면 한 줄
function fromBooking(id, b){
  const nameSp = splitUnit(b.customer_name || ''), addrSp = splitUnit(b.customer_address || '');
  const place = nameSp.place || addrSp.place.split(',')[0].trim() || '—';
  return { id, time_s: bkTime(b.booking_time) || String(b.time_s || ''), time_e: String(b.time_e || ''),
    place, unit: nameSp.unit || addrSp.unit, addr: String(b.customer_address || '').trim(), items: itemsOf(b), lines: [] };
}
// 구글 캘린더에서 넘어온 일정 · 직접 적은 일정 → 제목이 장소, 메모는 그대로(전화·금액 줄 제외)
function fromSchedule(id, s){
  const title = String(s.title || '').replace(/^✅\s*/, '').trim();
  const raw = String(s.memo || '').split('\n').map(x => x.trim());
  const pin = raw.find(l => l.indexOf('📍') === 0);
  const addr = String(s.address || (pin ? pin.replace('📍', '').trim() : '')).trim();
  const sp = splitUnit(title), asp = splitUnit(addr);
  const lines = cleanLines(raw.filter(l => l !== pin).join('\n'));
  return { id, time_s: String(s.time_s || ''), time_e: String(s.time_e || ''), place: sp.place || title || '—', unit: sp.unit || asp.unit,
    addr, items: [], lines, done: /^✅/.test(String(s.title || '')) };
}

// 설치용 manifest
function manifest(k){
  const q = k ? '?k=' + encodeURIComponent(k) : '';
  return new Response(JSON.stringify({
    name: 'HHC Work Schedule', short_name: 'HHC Jobs', id: '/work', start_url: '/work' + q, scope: '/work',
    display: 'standalone', background_color: '#F6F8FC', theme_color: '#0E2350',
    icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }]
  }), { headers: { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function onRequestGet(context){
  const { request, env } = context;
  const q = new URL(request.url).searchParams;
  const k = String(q.get('k') || '').trim().slice(0, 80);
  if (q.get('manifest')) return manifest(/^[A-Za-z0-9_-]{8,80}$/.test(k) ? k : '');
  if (rateLimited(request, 'work', 60)) return fail('too many requests', 429);
  if (!k) return fail('no-key', 403);
  try{
    const st = await getDoc(env, 'settings', 'work_link');
    if (!st || !st.key || st.key !== k || st.off === true) return fail('bad-key', 403);

    const day = pickDay();
    if (day.mode === 'soon') return json({ ok: true, date: day.date, mode: 'soon', at: Date.now(), jobs: [] });

    const [sRows, bRows] = await Promise.all([
      queryEq(env, 'schedules', 'date', day.date, 200),
      queryEq(env, 'bookings', 'booking_date', day.date, 200)
    ]);
    const jobs = [];
    for (const b of bRows){ if (b && b.status === 'confirmed') jobs.push(fromBooking('bk_' + b.__id, b)); }
    for (const s of sRows){
      if (!s || s.booking_id) continue;                 // 예약 미러 일정은 예약 쪽으로 이미 들어감
      if (s.type === 'holiday') continue;               // 휴일 표시는 작업이 아님
      if (/^✅/.test(String(s.title || ''))) continue;   // 완료 표시한 할 일(개인 할 일 포함)은 빼기
      jobs.push(s.type === 'reserve' ? fromBooking(s.__id, s) : fromSchedule(s.__id, s));
    }
    jobs.sort((a, b) => (a.time_s || '99').localeCompare(b.time_s || '99'));
    return json({ ok: true, date: day.date, mode: day.mode, at: Date.now(), jobs });
  }catch(e){
    return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500);
  }
}
