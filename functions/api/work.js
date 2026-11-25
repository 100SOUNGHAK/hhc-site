// ─────────────────────────────────────────────────────────────────────────────
// GET /api/work?k={직원 링크 열쇠}            → 직원용 작업일정 (work.html)  (2026-11-13)
// GET /api/work?manifest=1&k={열쇠}           → 홈 화면 설치용 manifest (열쇠가 붙은 주소로 열리게)
//
//  · 열쇠: settings/work_link.staff[] 의 직원별 key 중 하나 (관리자 앱 「직원 일정표」 탭에서 직원마다 만들고 바꿈)
//          settings/work_link.admin_key = 관리자 탭 전용 열쇠 → &d=YYYY-MM-DD(날짜 지정) · &raw=1(원본+편집 따로) 허용
//  · 관리자 편집(직원 화면 전용 덧씌우기): work_edits/{YYYY-MM-DD}
//      { edits:{작업ID:{hidden:true} | {time_s,time_e,place,unit,addr,items,lines}}, added:[{id,...}] }
//      → 원래 예약·스케줄·구글 캘린더는 건드리지 않음. 캘린더 동기화가 덮어써도 편집이 유지됨.
//  · 보여 주는 날짜 (말레이시아 시간):
//      19:00 ~ 다음 날 17:59  → 다음 날 일정  (자정 이후에는 「오늘」이 그날이 됨)
//      18:00 ~ 18:59          → 준비 중 (mode:'soon', 일정 없음)
//  · 일정 규칙은 예전 「내일 일정 단체방 보내기」(sched-send.html, 2026-11-25 삭제)와 같다:
//      확정 예약(bookings, status=confirmed) + 일정(schedules, 예약 미러·휴일·✅완료 제외)
//  · 고객 전화번호 · 가격 · 내부 메모는 내려보내지 않는다. 시간 · 장소 · 동호수 · 품목 · 수량 · 주소 · 위치만.
//  · 📍 방문 위치 loc {lat,lng,name,addr,pid,src} (2026-11-16) — 직원 화면에서 누르면 구글맵 길 안내
//      우선순위: ① work_edits.locs[작업ID] (관리자가 이 일정에 직접 등록 · {off:true} = 이 일정은 위치 안 씀)
//               ② 예약에 저장된 위치 (bookings.customer_loc — 예약전환 때 고객 확정 위치가 담기거나 예약관리에서 등록)
//                  · 예전에 전환된 예약은 requests.loc 를 converted_booking_id 로 찾아 씀
//               ③ 고객관리에 등록한 고객 위치 (customers.loc — 연락처, 없으면 이름·별칭으로 찾음) (2026-11-16)
//               ④ settings/work_places.map[콘도명 키] (관리자가 「같은 콘도명이면 다음에도」로 저장한 위치)
//  · 📎 첨부 사진 (2026-11-17) — work_edits/{날짜}.photos[작업ID] = [{id,url,t,w,h,name,path,tpath}]
//      워크퍼밋 등. 직원 화면에는 url(원본) · t(작은 그림) · w · h · name 만 보냄. Storage 주소만 허용.
//  · 📷 직원 현장 사진 (2026-11-24) — 직원이 일정마다 온도측정 · 세척 전 · 세척 후 사진을 올림(여러 직원 가능)
//      POST /api/work?k={열쇠}&op=up&job={작업ID}&date={날짜}&cat=temp|before|after|etc  (FormData f=사진 · t=작은 그림 · w · h · taken)
//      · etc = 🧾 기타 사진 (2026-11-25) — 점검·출장진단/수리·설치·세탁기/건조기·주방후드 보고서의 기타 사진 칸으로 가져감
//      POST /api/work?k={열쇠}&op=del&id={사진ID}   → 자기가 올린 사진만(관리자 열쇠는 전부)
//      GET  /api/work?k={관리자 열쇠}&img={사진ID}   → 사진 받기(관리자 보고서 화면이 가져오기에 씀 · 같은 주소라 막힘 없음)
//      자료: site_photos/{자동ID} {date,job,cat,url,path,t,tpath,w,h,by,bk,at,taken,del,cname,cphone,place,unit}
//      Storage: site_photos/{날짜}/{작업ID}/… — 올린 날부터 30일 뒤(del 날짜) 자동으로 지움(요청이 올 때 6시간에 한 번 정리)
//      직원 화면에는 url · t · cat · mine(내가 올린 것)만. 고객 연락처(cphone)는 관리자 화면에서 고객을 찾을 때만 씀.
//  · 📅 날짜 고르기 (2026-11-25): &day=-1|0|1 → 오늘(말레이시아) 기준 어제 · 오늘 · 내일 (직원 열쇠도 가능)
//      내일은 18:00~18:59 에만 준비 중(soon). 응답에 today(오늘 날짜) · auto(자동으로 보여 주는 날짜)를 함께 보냄.
//  · 속도 (2026-11-17): 열쇠 확인과 그날 일정 조회를 동시에, 의뢰 위치·고객 위치 조회도 동시에.
//      고객 위치 목록은 서버 인스턴스에 10분간 기억(고객 전체를 매번 훑지 않음).
// ─────────────────────────────────────────────────────────────────────────────
import { getDoc, queryEq, queryIn, listAll, createDoc, deleteDoc, patchDoc, json, fail, rateLimited, originAllowed, nn, pn } from './_lib/fs.js';
import { stgPut, stgGet, stgDel } from './_lib/stg.js';

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
// 📅 어제 · 오늘 · 내일 고르기 (2026-11-25)
function pickOff(n){
  const now = myNow(), h = now.getUTCHours(), today = ymd(now);
  if (n === 1) return { date: addDays(today, 1), mode: h === 18 ? 'soon' : 'tomorrow', sel: 1 };
  if (n === -1) return { date: addDays(today, -1), mode: 'yesterday', sel: -1 };
  return { date: today, mode: 'today', sel: 0 };
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
  let title = String(s.title || '').replace(/^✅\s*/, '').trim();
  { // 「콘도명 (콘도명)」 중복 제목은 한 번만
    const m = title.match(/^(.*?)\s*\(([^()]+)\)\s*$/), n = x => x.toLowerCase().replace(/\s+/g, ' ').trim();
    if (m && n(m[1]).endsWith(n(m[2]))) title = m[1].trim();
  }
  const raw = String(s.memo || '').split('\n').map(x => x.trim());
  const pin = raw.find(l => l.indexOf('📍') === 0);
  const addr = String(s.address || (pin ? pin.replace('📍', '').trim() : '')).trim();
  const sp = splitUnit(title), asp = splitUnit(addr);
  const lines = cleanLines(raw.filter(l => l !== pin).join('\n'));
  return { id, time_s: String(s.time_s || ''), time_e: String(s.time_e || ''), place: sp.place || title || '—', unit: sp.unit || asp.unit,
    addr, items: [], lines, done: /^✅/.test(String(s.title || '')) };
}

// 관리자가 고친 값 → 직원 화면에 보낼 모양만 남김
function clean(j){
  const items = Array.isArray(j.items) ? j.items.map(it => ({ catId: String(it.catId || 'etc'), grpKo: it.grpKo || null, svcKo: it.svcKo || null,
    free: !!it.free, text: it.free ? String(it.text || '') : '', qty: Math.max(1, parseInt(it.qty, 10) || 1) })) : [];
  const lines = cleanLines(Array.isArray(j.lines) ? j.lines.map(String).join('\n') : (j.lines || ''));   // 관리자가 적은 메모도 전화번호·금액 줄은 빼기
  return { id: String(j.id), time_s: String(j.time_s || ''), time_e: String(j.time_e || ''), place: String(j.place || '—'),
    unit: String(j.unit || ''), addr: String(j.addr || ''), items, lines, done: !!j.done };
}

// ── 📍 방문 위치 ──
// 콘도명 → 저장 위치 키 (work-admin.html placeKey 와 같은 규칙)
function placeKey(s){ return String(s || '').toUpperCase().replace(/[^A-Z0-9가-힣]/g, '').slice(0, 60); }
function cleanLoc(l, src){
  if (!l || typeof l !== 'object') return null;
  const lat = Number(l.lat), lng = Number(l.lng);
  if (!isFinite(lat) || !isFinite(lng) || lat < 0.8 || lat > 7.6 || lng < 99.5 || lng > 119.5) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, name: String(l.name || '').slice(0, 120),
    addr: String(l.addr || '').slice(0, 300), pid: String(l.pid || '').slice(0, 300), src };
}

// ── 📎 첨부 사진 (워크퍼밋 등) ── Firebase Storage 다운로드 주소만 통과
const PHOTO_OK = /^https:\/\/firebasestorage\.googleapis\.com\//;
function cleanPhotos(a){
  if (!Array.isArray(a)) return [];
  return a.filter(p => p && PHOTO_OK.test(String(p.url || ''))).slice(0, 12).map(p => ({
    id: String(p.id || '').slice(0, 40), url: String(p.url), t: PHOTO_OK.test(String(p.t || '')) ? String(p.t) : String(p.url),
    w: Math.max(0, parseInt(p.w, 10) || 0), h: Math.max(0, parseInt(p.h, 10) || 0), name: String(p.name || '').slice(0, 60) }));
}

// ── 고객 위치 목록 (연락처 · 이름/별칭 → 위치) — 인스턴스에 10분 기억 ──
let _cidx = null, _cidxAt = 0, _cidxP = null;
async function custLocIndex(env){
  if (_cidx && Date.now() - _cidxAt < 10 * 60e3) return _cidx;
  if (_cidxP) return _cidxP;
  _cidxP = (async () => {
    const cs = await listAll(env, 'customers', 300, ['phone', 'name', 'aliases', 'loc']);
    const byP = {}, byN = {};
    for (const c of cs){
      const l = cleanLoc(c && c.loc, 'cust'); if (!l) continue;
      const p = pn(c.phone); if (p.length >= 6 && !byP[p]) byP[p] = l;
      [c.name].concat(Array.isArray(c.aliases) ? c.aliases : []).forEach(a => { const k = nn(a); if (k && !byN[k]) byN[k] = l; });
    }
    _cidx = { byP, byN }; _cidxAt = Date.now(); return _cidx;
  })();
  try{ return await _cidxP; } finally { _cidxP = null; }
}

// ── 📷 직원 현장 사진 ──
const SITE_CATS = ['temp', 'before', 'after', 'etc'];   // etc = 🧾 기타 사진 (2026-11-25)
const KEEP_DAYS = 30;
async function keyHash(k){ const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hhc-site|' + k)); return Array.from(new Uint8Array(d)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(''); }
function siteOut(p, bk){ return { id: p.__id, cat: String(p.cat || ''), url: String(p.url || ''), t: String(p.t || p.url || ''), by: String(p.by || ''), at: String(p.at || ''), mine: !!(bk && p.bk === bk) }; }
function siteByJob(rows, bk){
  const m = {};
  for (const p of (rows || [])){ if (!p || !p.job || !PHOTO_OK.test(String(p.url || ''))) continue; (m[p.job] = m[p.job] || []).push(siteOut(p, bk)); }
  for (const k in m) m[k].sort((a, b) => a.at.localeCompare(b.at));
  return m;
}
// 30일 지난 사진 정리 — 인스턴스마다 6시간에 한 번, 최근 10일치 「지울 날」만 훑음
let _cleanAt = 0;
async function cleanup(env){
  if (Date.now() - _cleanAt < 6 * 3600e3) return; _cleanAt = Date.now();
  const today = ymd(myNow());
  for (let i = 0; i <= 10; i++){
    const rows = await queryEq(env, 'site_photos', 'del', addDays(today, -i), 200).catch(() => []);
    for (const p of rows){
      await Promise.all([stgDel(env, p.path), stgDel(env, p.tpath)]).catch(() => {});
      await deleteDoc(env, 'site_photos', p.__id).catch(() => {});
    }
  }
}
// 사진을 올린 일정의 고객 · 장소 (관리자 보고서 화면에서 고객을 찾는 데 씀)
async function jobInfo(env, date, job){
  if (job.indexOf('bk_') === 0){
    const b = await getDoc(env, 'bookings', job.slice(3));
    if (!b || b.status !== 'confirmed' || b.booking_date !== date) return null;
    const j = fromBooking(job, b);
    return { cname: String(b.customer_name || ''), cphone: String(b.customer_phone || ''), place: j.place, unit: j.unit };
  }
  const s = await getDoc(env, 'schedules', job).catch(() => null);
  if (s && s.date === date){
    const j = s.type === 'reserve' ? fromBooking(job, s) : fromSchedule(job, s);
    return { cname: String(s.customer_name || s.title || '').replace(/^✅\s*/, ''), cphone: String(s.customer_phone || ''), place: j.place, unit: j.unit };
  }
  const ed = await getDoc(env, 'work_edits', date);
  const a = ed && Array.isArray(ed.added) ? ed.added.find(x => x && String(x.id) === job) : null;
  if (a) return { cname: String(a.place || ''), cphone: '', place: String(a.place || ''), unit: String(a.unit || '') };
  return null;
}
async function staffOf(env, k){
  const st = await getDoc(env, 'settings', 'work_link');
  if (!st) return null;
  if (st.admin_key && st.admin_key === k) return { admin: true, name: '관리자' };
  const s = (Array.isArray(st.staff) ? st.staff : []).find(x => x && x.key === k && x.off !== true);
  return s ? { admin: false, name: String(s.name || '') } : null;
}
const IMG_OK = /^image\/(jpeg|png|webp)$/;

export async function onRequestPost(context){
  const { request, env } = context;
  const q = new URL(request.url).searchParams;
  const k = String(q.get('k') || '').trim().slice(0, 80), op = q.get('op');
  if (!originAllowed(request)) return fail('forbidden', 403);
  if (rateLimited(request, 'work-up', 90)) return fail('too many requests', 429);
  if (!k) return fail('no-key', 403);
  try{
    const who = await staffOf(env, k);
    if (!who) return fail('bad-key', 403);
    const bk = await keyHash(k);
    if (op === 'del'){
      const id = String(q.get('id') || '').slice(0, 60);
      const p = await getDoc(env, 'site_photos', id);
      if (!p) return json({ ok: true, gone: true });
      if (!who.admin && p.bk !== bk) return fail('not-yours', 403);
      await Promise.all([stgDel(env, p.path), stgDel(env, p.tpath)]).catch(() => {});
      await deleteDoc(env, 'site_photos', id);
      return json({ ok: true });
    }
    if (op !== 'up') return fail('bad-op');
    const job = String(q.get('job') || '').slice(0, 80), date = String(q.get('date') || ''), cat = String(q.get('cat') || '');
    if (!job || !/^[A-Za-z0-9_-]+$/.test(job) || SITE_CATS.indexOf(cat) < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('bad-input');
    // 직원은 지금 화면에 보이는 날 또는 그 전날 · 📅 어제~내일 (2026-11-25: 날짜 고르기와 같은 범위)
    const auto = pickDay(), tdy = ymd(myNow());
    if (!who.admin && date !== auto.date && date !== addDays(auto.date, -1) && date !== tdy && date !== addDays(tdy, -1) && date !== addDays(tdy, 1)) return fail('bad-date', 403);
    const fd = await request.formData();
    const f = fd.get('f'), t = fd.get('t');
    if (!f || typeof f === 'string' || !IMG_OK.test(f.type || '') || f.size > 6 * 1048576) return fail('bad-photo');
    const info = await jobInfo(env, date, job);
    if (!info) return fail('no-job', 404);
    const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const dir = 'site_photos/' + date + '/' + job + '/' + cat + '-' + stamp;
    const url = await stgPut(env, dir + '.jpg', await f.arrayBuffer(), f.type);
    let turl = '', tpath = '';
    if (t && typeof t !== 'string' && IMG_OK.test(t.type || '') && t.size < 600 * 1024){
      tpath = dir + '-t.jpg'; turl = await stgPut(env, tpath, await t.arrayBuffer(), t.type).catch(() => { tpath = ''; return ''; });
    }
    const taken = parseInt(fd.get('taken'), 10) || 0;
    const rec = { date, job, cat, url, path: dir + '.jpg', t: turl, tpath, w: Math.max(0, parseInt(fd.get('w'), 10) || 0), h: Math.max(0, parseInt(fd.get('h'), 10) || 0),
      by: who.name, bk, at: new Date().toISOString(), taken: taken > 0 ? new Date(taken).toISOString() : '', del: addDays(ymd(myNow()), KEEP_DAYS),
      cname: info.cname.slice(0, 120), cphone: info.cphone.slice(0, 40), place: info.place.slice(0, 120), unit: info.unit.slice(0, 40) };
    const d = await createDoc(env, 'site_photos', rec);
    if (context.waitUntil) context.waitUntil(cleanup(env).catch(() => {}));
    return json({ ok: true, photo: siteOut(Object.assign({}, rec, { __id: d && d.__id }), bk) });
  }catch(e){
    return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500);
  }
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
  if (q.get('img')){ // 📷 현장 사진 받기 — 관리자 열쇠만
    try{
      const who = await staffOf(env, k);
      if (!who || !who.admin) return fail('bad-key', 403);
      const p = await getDoc(env, 'site_photos', String(q.get('img')).slice(0, 60));
      if (!p) return fail('gone', 404);
      const r = await stgGet(env, q.get('t') && p.tpath ? p.tpath : p.path);
      return new Response(r.body, { headers: { 'content-type': r.headers.get('content-type') || 'image/jpeg', 'cache-control': 'private, max-age=3600' } });
    }catch(e){ return fail('server-error', 500); }
  }
  try{
    // 열쇠 확인(settings/work_link)과 그날 일정 조회를 한꺼번에 시작 — 왕복 한 번을 줄임
    const dq = String(q.get('d') || '');
    const pick = /^\d{4}-\d{2}-\d{2}$/.test(dq) ? { date: dq, mode: 'pick' } : null;
    const dn = String(q.get('day') || '');
    const auto0 = pickDay();
    const auto = /^(-1|0|1)$/.test(dn) ? pickOff(parseInt(dn, 10)) : auto0;
    const ext = { today: ymd(myNow()), auto: auto0.date };
    const fetchDay = date => Promise.all([
      queryEq(env, 'schedules', 'date', date, 200),
      queryEq(env, 'bookings', 'booking_date', date, 200),
      getDoc(env, 'work_edits', date),
      getDoc(env, 'settings', 'work_places').catch(() => null),
      queryEq(env, 'site_photos', 'date', date, 400).catch(() => [])
    ]);
    const first = pick || auto;
    const dayP = first.mode === 'soon' ? null : fetchDay(first.date);
    if (dayP) dayP.catch(() => {});                     // 열쇠가 틀려 버려지는 경우의 경고 방지
    const st = await getDoc(env, 'settings', 'work_link');
    if (!st) return fail('bad-key', 403);
    const isAdmin = !!(st.admin_key && st.admin_key === k);
    const staff = isAdmin ? null : (Array.isArray(st.staff) ? st.staff : []).find(x => x && x.key === k && x.off !== true);
    if (!isAdmin && !staff) return fail('bad-key', 403);
    const who = staff ? String(staff.name || '') : '';

    const day = (isAdmin && pick) ? pick : auto;          // 날짜 지정(&d=)은 관리자 열쇠만
    if (day.mode === 'soon') return json(Object.assign({ ok: true, date: day.date, mode: 'soon', at: Date.now(), staff: who, jobs: [] }, ext));

    const [sRows, bRows, ed, wp, sp] = await ((day === first && dayP) ? dayP : fetchDay(day.date));
    // 고객이 의뢰신청서에서 확정한 위치 — 이 날 확정 예약으로 전환된 의뢰만
    const bkIds = bRows.filter(b => b && b.status === 'confirmed').map(b => b.__id);
    const reqLoc = {};
    for (const b of bRows){ const l = b && b.status === 'confirmed' && cleanLoc(b.customer_loc, b.customer_loc && b.customer_loc.from === 'request' ? 'req' : 'bk'); if (l) reqLoc['bk_' + b.__id] = l; }
    for (const s of sRows){ const l = s && !s.booking_id && s.type === 'reserve' && cleanLoc(s.customer_loc, 'bk'); if (l) reqLoc[s.__id] = l; }
    // ② 예전 전환 예약의 의뢰 위치 · ③ 고객관리 고객 위치 — 두 조회를 동시에
    const missBk = bkIds.filter(id => !reqLoc['bk_' + id]);
    const needC = [];
    for (const b of bRows){ if (b && b.status === 'confirmed' && !reqLoc['bk_' + b.__id]) needC.push(['bk_' + b.__id, b]); }
    for (const s of sRows){ if (s && !s.booking_id && s.type === 'reserve' && !reqLoc[s.__id]) needC.push([s.__id, s]); }
    const [rq, cidx] = await Promise.all([
      missBk.length ? queryIn(env, 'requests', 'converted_booking_id', missBk, 50).catch(() => []) : [],
      needC.length ? custLocIndex(env).catch(() => null) : null
    ]);
    for (const r of rq){ const l = cleanLoc(r && r.loc, 'req'); if (l && !reqLoc['bk_' + r.converted_booking_id]) reqLoc['bk_' + r.converted_booking_id] = l; }
    // ③ 고객관리 고객 위치 — 예약에 위치가 없는 일정만, 연락처 → 이름·별칭 순으로 찾음
    if (cidx){
      for (const [id, o] of needC){
        if (reqLoc[id]) continue;
        const p = pn(o.customer_phone);
        const l = (p.length >= 6 && cidx.byP[p]) || cidx.byN[nn(o.customer_name)];
        if (l) reqLoc[id] = l;
      }
    }
    const base = [];
    for (const b of bRows){ if (b && b.status === 'confirmed') base.push(fromBooking('bk_' + b.__id, b)); }
    for (const s of sRows){
      if (!s || s.booking_id) continue;                 // 예약 미러 일정은 예약 쪽으로 이미 들어감
      if (s.type === 'holiday') continue;               // 휴일 표시는 작업이 아님
      if (/^✅/.test(String(s.title || ''))) continue;   // 완료 표시한 할 일(개인 할 일 포함)은 빼기
      base.push(s.type === 'reserve' ? fromBooking(s.__id, s) : fromSchedule(s.__id, s));
    }
    const edits = (ed && ed.edits && typeof ed.edits === 'object') ? ed.edits : {};
    const added = (ed && Array.isArray(ed.added)) ? ed.added.filter(x => x && x.id) : [];
    const locs = (ed && ed.locs && typeof ed.locs === 'object') ? ed.locs : {};
    const places = (wp && wp.map && typeof wp.map === 'object') ? wp.map : {};
    const photos = (ed && ed.photos && typeof ed.photos === 'object') ? ed.photos : {};
    const bySort = (x, y) => (x.time_s || '99').localeCompare(y.time_s || '99');
    base.sort(bySort);
    const bk = await keyHash(k);
    const site = siteByJob(sp, bk);
    if (context.waitUntil) context.waitUntil(cleanup(env).catch(() => {}));
    if (isAdmin && q.get('raw')){
      base.forEach(j => { if (reqLoc[j.id]) j.rloc = reqLoc[j.id]; });
      return json({ ok: true, date: day.date, mode: day.mode, at: Date.now(), base, edits, added, locs, places, photos, site });
    }
    const locOf = j => {
      const own = locs[j.id];
      if (own && own.off) return null;
      return cleanLoc(own, 'job') || reqLoc[j.id] || cleanLoc(places[placeKey(j.place)], 'place') || null;
    };
    const jobs = [];
    for (const j of base){
      const e = edits[j.id];
      if (e && e.hidden) continue;
      jobs.push(e ? clean(Object.assign({}, j, e, { id: j.id })) : j);
    }
    for (const x of added) jobs.push(clean(x));
    jobs.forEach(j => { const l = locOf(j); if (l) j.loc = l; const ph = cleanPhotos(photos[j.id]); if (ph.length) j.photos = ph;
      if (site[j.id]) j.site = site[j.id].map(x => ({ id: x.id, cat: x.cat, url: x.url, t: x.t, mine: x.mine })); });
    jobs.sort(bySort);
    return json(Object.assign({ ok: true, date: day.date, mode: day.mode, at: Date.now(), staff: who, jobs }, ext));
  }catch(e){
    return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500);
  }
}
