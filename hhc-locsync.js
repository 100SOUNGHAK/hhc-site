/* ═══════════════════════════════════════════════════════════════════════════
   📍 고객 위치 연동 · 변경 승인 (2026-11-17)  —  /hhc-locsync.js
   고객관리(customers.loc) · 예약관리(bookings.customer_loc) · 스케쥴 예약형 일정(schedules.customer_loc)
   · 직원 일정표(work_edits/{날짜}.locs[일정ID]) 의 고객 위치를 서로 맞춥니다.

   · 기준 = 고객관리 고객 위치. 다른 위치가 등록되면 바로 덮어쓰지 않고 「변경 승인」을 받습니다.
       - 고객이 의뢰신청서에서 등록 → requests.loc_sync = 'pending' (functions/api/request.js)
         → 고객관리·의뢰관리 맨 위 「📍 위치 변경 승인 대기」 칸에서 승인/거절
       - 관리자가 예약관리·직원 일정표·고객관리에서 등록 → 그 자리에서 「고객 위치도 바꿀까요?」 창
   · 승인하면 고객 위치 + 오늘 이후 예약·예약형 일정·직원 일정표 중 체크한 곳을 함께 바꿉니다.
     따로 정해 둔 위치(관리자가 그 예약·일정에만 정한 다른 위치)는 기본으로 체크를 꺼 둡니다.
   · 추천 순서: ① 가장 마지막에 등록된 위치 ② 고객이 의뢰신청서에서 직접 등록 ③ 관리자가 등록
   · 저장 필드: customers.loc {lat,lng,name,addr,pid,at,src:'customer'|'admin',via:'request'|'customer'|'booking'|'work'}
               requests.loc_sync 'pending'|'approved'|'rejected'|'same'|'replaced', loc_sync_at
   · 새 컬렉션 없음 (백업 GROUPS 변경 불필요)

   사용:  <script type="module" src="/hhc-locsync.js"></script>
          HHCLS.setDb(db)                       — 화면이 Firestore 를 만든 뒤 한 번
          await HHCLS.proposeAdmin({phone,name,loc,via,skip})   — 관리자가 위치를 저장한 직후
          HHCLS.watchPending(hostEl)            — 승인 대기 칸 (고객관리 · 의뢰관리)
   ═══════════════════════════════════════════════════════════════════════════ */
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, collection, doc, getDocs, updateDoc, addDoc, setDoc, deleteDoc, query, where, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

let DB = null;
function db(){ return DB || (DB = getFirestore(getApp())); }

const pn = p => { p = String(p || '').replace(/[^0-9]/g, ''); if (p.indexOf('60') === 0) p = p.slice(2); return p.replace(/^0+/, ''); };
const nn = n => String(n || '').toLowerCase().replace(/\s+/g, '');
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ok = l => !!(l && isFinite(l.lat) && isFinite(l.lng) && !l.off);
// 약 20m 이내면 같은 위치로 봅니다 (같은 건물 다시 찍기)
const same = (a, b) => ok(a) && ok(b) && Math.abs(a.lat - b.lat) < 2e-4 && Math.abs(a.lng - b.lng) < 2e-4;
const clean = l => ({ lat: +l.lat, lng: +l.lng, name: String(l.name || ''), addr: String(l.addr || ''), pid: String(l.pid || '') });
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);   // 말레이시아 날짜
const md = d => { const m = String(d || '').match(/^\d{4}-(\d{2})-(\d{2})/); if (!m) return String(d || ''); const w = '일월화수목금토'[new Date(d + 'T00:00:00+08:00').getDay()]; return (+m[1]) + '/' + (+m[2]) + '(' + w + ')'; };
const klTime = s => { const t = Date.parse(s || ''); return isFinite(t) ? new Date(t + 8 * 3600e3).toISOString().slice(5, 16).replace('T', ' ').replace('-', '/') : ''; };   // 말레이시아 시각
const ts = s => { const t = Date.parse(s || ''); return isFinite(t) ? t : 0; };
const mapUrl = l => 'https://www.google.com/maps/search/?api=1&query=' + l.lat + ',' + l.lng + (l.pid ? '&query_place_id=' + encodeURIComponent(l.pid) : '');
const SRC_LB = { customer: '고객 직접', admin: '관리자 등록' };
const VIA_LB = { request: '의뢰신청서', customer: '고객관리', booking: '예약관리', work: '직원 일정표' };
function srcLabel(l){
  if (!ok(l)) return '';
  const a = [];
  if (l.via && VIA_LB[l.via]) a.push(VIA_LB[l.via]);
  a.push(SRC_LB[l.src] || '관리자 등록');
  if (l.at) a.push(md(String(l.at).slice(0, 10)));
  return a.join(' · ');
}

// ── 고객 찾기 (연락처 → 이름·별칭) ──
async function loadCustomers(){
  const s = await getDocs(collection(db(), 'customers'));
  return s.docs.map(d => ({ ...d.data(), __id: d.id }));   // ⚠ 고객 문서 안에 자체 id 필드('c…')가 있으므로 문서 ID 는 __id
}
function matchCust(list, phone, names){
  const p = pn(phone);
  if (p.length >= 6){ const c = list.find(c => pn(c.phone) === p); if (c) return c; }
  const ks = (names || []).map(nn).filter(Boolean);
  if (!ks.length) return null;
  return list.find(c => [c.name].concat(Array.isArray(c.aliases) ? c.aliases : []).some(a => ks.includes(nn(a)))) || null;
}
function isMine(o, phone, names, cust){
  const p = pn(o.customer_phone);
  const mp = pn(phone);
  if (p.length >= 6 && mp.length >= 6) return p === mp;
  if (cust && p.length >= 6 && pn(cust.phone) === p) return true;
  const ks = (names || []).concat(cust ? [cust.name].concat(cust.aliases || []) : []).map(nn).filter(Boolean);
  return ks.includes(nn(o.customer_name));
}

// ── 함께 바뀔 곳 모으기 (오늘 이후) ──
async function collectTargets({ phone, names, cust, oldLoc, newLoc, skip }){
  skip = skip || {};
  const T = today(), out = [], ids = {};
  const [bs, ss, ws] = await Promise.all([
    getDocs(query(collection(db(), 'bookings'), where('booking_date', '>=', T))).catch(() => null),
    getDocs(query(collection(db(), 'schedules'), where('date', '>=', T))).catch(() => null),
    getDocs(query(collection(db(), 'work_edits'), where('date', '>=', T))).catch(() => null)
  ]);
  const consider = (kind, id, date, label, cur) => {
    const sp = kind === 'booking' ? skip.booking === id : kind === 'schedule' ? skip.schedule === id : skip.work === id;
    if (sp || same(cur, newLoc)) return;
    // 따로 정한 위치 = 관리자가 그 예약·일정에만 다른 위치를 정해 둔 경우 → 기본 해제
    const own = ok(cur) && !same(cur, oldLoc) && !(cur.from === 'customer' || cur.from === 'request');
    out.push({ kind, id, date, label, cur: ok(cur) ? cur : null, def: !own, own });
  };
  if (bs) bs.docs.forEach(d => {
    const b = d.data() || {};
    if (!['waiting', 'booked', 'confirmed'].includes(b.status)) return;
    if (!isMine(b, phone, names, cust)) return;
    ids['bk_' + d.id] = 1;
    consider('booking', d.id, b.booking_date, '예약 ' + md(b.booking_date) + (b.booking_time ? ' ' + String(b.booking_time).split('|')[0] : '') + (b.status === 'confirmed' ? '' : ' (확정 전)'), b.customer_loc);
  });
  if (ss) ss.docs.forEach(d => {
    const s = d.data() || {};
    if (s.type !== 'reserve' || s.booking_id) return;
    if (!isMine(s, phone, names, cust)) return;
    ids[d.id] = 1;
    consider('schedule', d.id, s.date, '스케쥴 예약 일정 ' + md(s.date) + (s.time_s ? ' ' + s.time_s : ''), s.customer_loc);
  });
  if (ws) ws.docs.forEach(d => {
    const w = d.data() || {}, locs = w.locs || {};
    Object.keys(locs).forEach(jid => {
      if (!ids[jid] || !ok(locs[jid])) return;
      const own = !same(locs[jid], oldLoc);
      const key = d.id + '|' + jid;
      if (skip.work === key || same(locs[jid], newLoc)) return;
      out.push({ kind: 'work', id: key, date: d.id, label: '직원 일정표 ' + md(d.id) + ' 일정', cur: locs[jid], def: !own, own });
    });
  });
  out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return out;
}

// ── 반영 ──
async function apply({ cust, phone, name, newLoc, src, via, targets, custOn }){
  const now = new Date().toISOString();
  const L = clean(newLoc);
  if (custOn !== false){
    const loc = { ...L, at: now, src, via };
    if (cust) await updateDoc(doc(db(), 'customers', cust.__id), { loc, updated_at: now });
    else if (name || phone) await addDoc(collection(db(), 'customers'), { id: 'c' + Date.now(), name: name || '', phone: phone || '', member: '', email: '', addr: '', memo: '', aliases: [], loc, created_at: now, updated_at: now });
  }
  const from = src === 'customer' ? 'request' : 'customer';
  for (const t of targets || []){
    if (t.kind === 'booking') await updateDoc(doc(db(), 'bookings', t.id), { customer_loc: { ...L, from } });
    else if (t.kind === 'schedule') await updateDoc(doc(db(), 'schedules', t.id), { customer_loc: { ...L, from } });
    else if (t.kind === 'work'){
      const [day, jid] = t.id.split('|');
      await setDoc(doc(db(), 'work_edits', day), { locs: { [jid]: L }, updated_at: now }, { merge: true });
    }
  }
}

// ── 확인 창 ──
let cssDone = false;
function css(){
  if (cssDone) return; cssDone = true;
  const s = document.createElement('style');
  s.textContent = `
.hls-ov{position:fixed;inset:0;z-index:3000;background:rgba(11,23,48,.5);display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit}
.hls-m{background:#fff;border-radius:18px;max-width:460px;width:100%;max-height:90vh;overflow:auto;padding:18px;box-shadow:0 20px 50px rgba(15,31,61,.3);color:#0F1F3D}
.hls-m .t{font-weight:800;font-size:16px;margin-bottom:6px}.hls-m p{font-size:12.5px;color:#475569;margin:0 0 8px;line-height:1.5}
.hls-row{display:flex;gap:8px;margin-top:8px;font-size:12.5px}
.hls-box{flex:1;min-width:0;border-radius:10px;padding:8px 10px;line-height:1.4;word-break:break-word}
.hls-box small{display:block;font-size:10.5px;font-weight:800;margin-bottom:2px}
.hls-box a{color:inherit;font-size:11px;display:inline-block;margin-top:3px}
.hls-old{background:#F8FAFC;color:#64748B}.hls-old small{color:#94A3B8}
.hls-new{background:#F0FDFA;border:1px solid #99F6E4}.hls-new small{color:#0F766E}
.hls-bd{font-size:10px;background:#D4A017;color:#fff;border-radius:999px;padding:1px 7px;margin-left:4px}
.hls-warn{background:#FFFBEB;color:#92400E;font-size:12px;border-radius:9px;padding:7px 10px;margin-top:8px;line-height:1.45}
.hls-aff{font-size:12.5px;color:#334155;margin-top:10px}.hls-aff b{display:block;font-size:12px;color:#64748B;margin-bottom:4px}
.hls-aff label{display:flex;gap:7px;align-items:flex-start;padding:5px 0;cursor:pointer;line-height:1.4}
.hls-aff label input{margin-top:2px;flex:none;width:16px;height:16px;accent-color:#0F766E}
.hls-aff .own{color:#94A3B8;font-size:11px}
.hls-aff .none{color:#94A3B8;font-size:12px}
.hls-btns{display:flex;gap:6px;margin-top:12px}
.hls-btns button{border:0;border-radius:10px;padding:10px 12px;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit}
.hls-ok{background:#0F766E;color:#fff;flex:1}.hls-no{background:#F1F5F9;color:#475569}
.hls-ban{background:#fff;border:1px solid #FCD34D;border-left:5px solid #D4A017;border-radius:14px;padding:12px 14px;margin:0 0 12px;box-shadow:0 4px 14px rgba(15,31,61,.08);color:#0F1F3D;font-family:inherit}
.hls-ban .bt{font-weight:800;font-size:14.5px;display:flex;align-items:center;gap:6px;cursor:pointer}.hls-ban .bt b{color:#B45309}
.hls-ban .bt .tg{margin-left:auto;font-size:12px;color:#64748B;font-weight:700}
.hls-it{border:1px solid #E2E8F0;border-radius:12px;padding:10px 12px;margin-top:8px}
.hls-it .who{font-weight:800;font-size:14px}.hls-it .tm{font-size:11px;color:#94A3B8;margin-left:6px}
.hls-tag{font-size:10.5px;font-weight:800;border-radius:999px;padding:2px 8px;margin-left:6px;background:#ECFDF5;color:#047857}
.hls-it .note{font-size:11.5px;color:#92400E;margin-top:6px}
.hls-it .hls-btns{margin-top:8px}.hls-it .hls-btns button{padding:8px 12px;font-size:12.5px}
.hls-ban.fold .hls-it{display:none}
`;
  document.head.appendChild(s);
}
function modal({ title, intro, oldLoc, oldLb, newLoc, newLb, newBd, warn, targets, custLine, okLb, noLb }){
  css();
  return new Promise(res => {
    const ov = document.createElement('div'); ov.className = 'hls-ov';
    const tl = (targets || []).map((t, i) => `<label><input type="checkbox" data-i="${i}"${t.def ? ' checked' : ''}><span>${esc(t.label)}${t.own ? ' <span class="own">(따로 정한 위치' + (t.cur ? ': ' + esc(t.cur.name || '') : '') + ' — 기본 해제)</span>' : ''}</span></label>`).join('');
    ov.innerHTML = `<div class="hls-m" role="dialog"><div class="t">📍 ${esc(title)}</div>${intro ? '<p>' + intro + '</p>' : ''}
      <div class="hls-row"><div class="hls-box hls-old"><small>${esc(oldLb)}</small>${ok(oldLoc) ? esc(oldLoc.name || oldLoc.addr || '지도에서 고른 위치') + '<br><a href="' + mapUrl(oldLoc) + '" target="_blank" rel="noopener">지도 보기</a>' : '(없음)'}</div>
      <div class="hls-box hls-new"><small>${esc(newLb)}${newBd ? '<span class="hls-bd">' + esc(newBd) + '</span>' : ''}</small>${esc(newLoc.name || newLoc.addr || '지도에서 고른 위치')}<br><a href="${mapUrl(newLoc)}" target="_blank" rel="noopener">지도 보기</a></div></div>
      ${warn ? '<div class="hls-warn">' + warn + '</div>' : ''}
      <div class="hls-aff"><b>승인하면 함께 바뀌는 곳</b>${custLine ? '<label><input type="checkbox" checked disabled><span>' + esc(custLine) + '</span></label>' : ''}${tl || (custLine ? '' : '<span class="none">함께 바꿀 예정 일정이 없습니다</span>')}</div>
      <div class="hls-btns"><button type="button" class="hls-no">${esc(noLb)}</button><button type="button" class="hls-ok">${esc(okLb)}</button></div></div>`;
    document.body.appendChild(ov);
    const done = v => { ov.remove(); res(v); };
    ov.querySelector('.hls-no').onclick = () => done(null);
    ov.querySelector('.hls-ok').onclick = () => {
      const pick = [];
      ov.querySelectorAll('input[data-i]').forEach(c => { if (c.checked) pick.push(targets[+c.dataset.i]); });
      done(pick);
    };
  });
}
function toast(m){
  if (typeof window.toast === 'function') return window.toast(m);
  if (typeof window.showToast === 'function') return window.showToast(m);
  const t = document.createElement('div');
  t.textContent = m;
  t.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#0F1F3D;color:#fff;padding:10px 16px;border-radius:12px;font-size:13px;font-weight:700;z-index:3100;box-shadow:0 8px 24px rgba(0,0,0,.25)';
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}

// ── 관리자가 위치를 저장한 직후 (예약관리 · 직원 일정표 · 고객관리) ──
//   via: 'booking' | 'work' | 'customer'
//   skip: 방금 저장한 곳 {booking:id} | {schedule:id} | {work:'날짜|일정ID'}
//   via 'customer' 는 고객 위치 저장도 여기서 합니다 (승인 = 고객관리 저장 + 체크한 곳)
async function proposeAdmin({ phone, name, names, loc, via, skip, custId }){
  if (!ok(loc)) return false;
  try{
    const list = await loadCustomers();
    const ns = [name].concat(names || []).filter(Boolean);
    const cust = custId ? list.find(c => c.__id === custId) : matchCust(list, phone, ns);
    if (!cust && !pn(phone) && !ns.length) return false;
    const oldLoc = cust && ok(cust.loc) ? cust.loc : null;
    const targets = await collectTargets({ phone: phone || (cust && cust.phone), names: ns, cust, oldLoc, newLoc: loc, skip });
    const nm = (cust && cust.name) || name || '고객';
    if (via === 'customer'){
      if (!targets.length){ await apply({ cust, phone, name, newLoc: loc, src: 'admin', via, targets: [] }); toast('📍 방문 위치가 저장되었습니다'); return true; }
      const r = await modal({ title: '예정된 일정도 함께 바꿀까요?', intro: '<b>' + esc(nm) + '</b> 고객 위치를 바꿉니다. 이 고객의 예정된 예약·일정에도 반영할 곳을 고르세요.',
        oldLoc, oldLb: oldLoc ? '지금 고객 위치 (' + srcLabel(oldLoc) + ')' : '지금 고객 위치', newLoc: loc, newLb: '새 위치', newBd: '최신',
        warn: oldLoc && oldLoc.src === 'customer' && !same(oldLoc, loc) ? '⚠ 지금 위치는 고객이 의뢰신청서에서 직접 등록한 것입니다.' : '',
        targets, okLb: '승인 · 함께 변경', noLb: '고객관리에만 저장' });
      await apply({ cust, phone, name, newLoc: loc, src: 'admin', via, targets: r || [] });
      toast(r && r.length ? '📍 고객 위치와 예정 일정 ' + r.length + '곳을 바꿨습니다' : '📍 방문 위치가 저장되었습니다');
      return true;
    }
    if (same(oldLoc, loc) && !targets.length) return false;
    const custLine = same(oldLoc, loc) ? '' : '고객관리 고객 위치' + (cust ? '' : ' (고객 마스터 새로 등록)');
    const where = via === 'work' ? '직원 일정표' : '예약';
    const r = await modal({ title: same(oldLoc, loc) ? '다른 예정 일정도 바꿀까요?' : '고객 위치도 바꿀까요?',
      intro: '<b>' + esc(nm) + '</b> ' + (oldLoc ? (same(oldLoc, loc) ? '고객의 다른 예정 일정에 다른 위치가 있습니다.' : '고객의 등록 위치와 다른 위치를 저장했습니다.') : '고객에게 등록된 위치가 없습니다. 이 위치를 고객 위치로 등록할까요?'),
      oldLoc, oldLb: oldLoc ? '지금 고객 위치 (' + srcLabel(oldLoc) + ')' : '지금 고객 위치', newLoc: loc, newLb: '방금 저장한 위치', newBd: '최신',
      warn: oldLoc && oldLoc.src === 'customer' && !same(oldLoc, loc) ? '⚠ 지금 위치는 고객이 의뢰신청서에서 직접 등록한 것입니다. 바꾸기 전에 고객에게 확인해 보세요.' : '',
      targets, custLine, okLb: '승인 · 모두 변경', noLb: via === 'work' ? '이 일정에만 저장' : '이 예약에만 저장' });
    if (!r) return false;
    await apply({ cust, phone, name, newLoc: loc, src: 'admin', via, targets: r, custOn: !!custLine });
    toast('📍 ' + (custLine ? '고객 위치' + (r.length ? '와 예정 일정 ' + r.length + '곳' : '') : '예정 일정 ' + r.length + '곳') + '을 바꿨습니다');
    return true;
  }catch(e){ console.warn('[HHCLS]', e); toast('위치 연동 중 문제가 있었습니다: ' + (e.message || '')); return false; }
}

// ── 고객이 의뢰신청서에서 등록한 위치 → 승인 대기 칸 ──
let PEND = [], CUSTS = null, CUSTS_AT = 0;
const hosts = new Set();
let unsub = null, folded = false;
async function custs(){ if (!CUSTS || Date.now() - CUSTS_AT > 30000){ CUSTS = await loadCustomers(); CUSTS_AT = Date.now(); } return CUSTS; }
function reqNames(r){ return [r.condo, r.condo_name, r.customer_name].filter(Boolean); }
async function renderAll(){
  let list = [];
  try{
    const cs = await custs();
    for (const r of PEND){
      const c = matchCust(cs, r.phone, reqNames(r));
      const old = c && ok(c.loc) ? c.loc : null;
      if (same(old, r.loc)){ updateDoc(doc(db(), 'requests', r.id), { loc_sync: 'same', loc_sync_at: new Date().toISOString() }).catch(() => {}); continue; }
      list.push({ r, c, old, key: c ? 'c:' + c.__id : 'p:' + (pn(r.phone) || nn(r.condo)) });
    }
  }catch(e){ console.warn('[HHCLS]', e); }
  // 같은 고객의 요청이 여러 건이면 가장 최근 것을 추천 (① 가장 마지막 등록)
  const newest = {};
  list.forEach(x => { const t = ts(x.r.loc.at || x.r.submitted_at); if (!newest[x.key] || t > newest[x.key]) newest[x.key] = t; });
  list.sort((a, b) => ts(b.r.submitted_at) - ts(a.r.submitted_at));
  css();
  hosts.forEach(h => {
    if (!list.length){ h.innerHTML = ''; return; }
    h.innerHTML = `<div class="hls-ban${folded ? ' fold' : ''}"><div class="bt" data-hx="fold">📍 위치 변경 승인 대기 <b>${list.length}건</b><span class="tg">${folded ? '펼치기 ▾' : '접기 ▴'}</span></div>` +
      list.map((x, i) => {
        const t = ts(x.r.loc.at || x.r.submitted_at), latest = t === newest[x.key];
        // ① 최신 등록 우선 — 고객 위치가 이 요청보다 나중에 바뀌었으면 거절 추천
        const newerOld = x.old && ts(x.old.at) > t;
        const rec = latest && !newerOld;
        const nm = (x.c && x.c.name) || x.r.condo || x.r.condo_name || '고객';
        return `<div class="hls-it"><span class="who">${esc(nm)}</span><span class="hls-tag">의뢰신청서 · 고객 직접</span><span class="tm">${esc(klTime(x.r.submitted_at))}</span>
          <div class="hls-row"><div class="hls-box hls-old"><small>지금 고객 위치${x.old ? ' (' + esc(srcLabel(x.old)) + ')' : ''}</small>${x.old ? esc(x.old.name || x.old.addr || '지도에서 고른 위치') + '<br><a href="' + mapUrl(x.old) + '" target="_blank" rel="noopener">지도 보기</a>' : '(없음)'}</div>
          <div class="hls-box hls-new"><small>새 위치${rec ? '<span class="hls-bd">추천</span>' : ''}</small>${esc(x.r.loc.name || x.r.loc.addr || '지도에서 고른 위치')}<br><a href="${mapUrl(x.r.loc)}" target="_blank" rel="noopener">지도 보기</a></div></div>
          ${newerOld ? '<div class="note">지금 고객 위치가 이 요청보다 나중에 등록되었습니다 — 거절(지금 위치 유지)을 추천합니다.</div>' : (!latest ? '<div class="note">같은 고객의 더 최근 요청이 있습니다 — 최근 요청을 추천합니다.</div>' : '')}
          ${!x.c ? '<div class="note" style="color:#64748B">고객관리에 없는 고객입니다 — 승인하면 고객 마스터를 새로 만듭니다.</div>' : ''}
          <div class="hls-btns"><button type="button" class="hls-no" data-hx="no" data-i="${i}">거절</button><button type="button" class="hls-ok" data-hx="ok" data-i="${i}">승인 · 변경</button></div></div>`;
      }).join('') + '</div>';
    h._hlsList = list;
  });
}
async function onClick(e){
  const b = e.target.closest('[data-hx]'); if (!b) return;
  const h = e.currentTarget, a = b.dataset.hx;
  if (a === 'fold'){ folded = !folded; renderAll(); return; }
  const x = (h._hlsList || [])[+b.dataset.i]; if (!x) return;
  const now = new Date().toISOString();
  try{
    if (a === 'no'){
      if (!confirm('이 위치 변경 요청을 거절할까요?\n고객 위치는 그대로 두고, 이 의뢰(예약)에 적힌 위치만 남습니다.')) return;
      await updateDoc(doc(db(), 'requests', x.r.id), { loc_sync: 'rejected', loc_sync_at: now });
      toast('거절했습니다 — 고객 위치는 그대로입니다');
      return;
    }
    const names = reqNames(x.r);
    const targets = await collectTargets({ phone: x.r.phone, names, cust: x.c, oldLoc: x.old, newLoc: x.r.loc, skip: {} });
    const nm = (x.c && x.c.name) || x.r.condo || '고객';
    const r = await modal({ title: '고객 위치를 바꿀까요?', intro: '<b>' + esc(nm) + '</b> 고객이 의뢰신청서에서 직접 등록한 위치입니다.',
      oldLoc: x.old, oldLb: x.old ? '지금 고객 위치 (' + srcLabel(x.old) + ')' : '지금 고객 위치', newLoc: x.r.loc, newLb: '고객이 등록한 위치', newBd: '고객 직접',
      targets, custLine: '고객관리 고객 위치' + (x.c ? '' : ' (고객 마스터 새로 등록)'), okLb: '승인 · 변경', noLb: '취소' });
    if (!r) return;
    await apply({ cust: x.c, phone: x.r.phone, name: x.c ? x.c.name : (x.r.condo || x.r.condo_name || ''), newLoc: x.r.loc, src: 'customer', via: 'request', targets: r });
    await updateDoc(doc(db(), 'requests', x.r.id), { loc_sync: 'approved', loc_sync_at: now });
    // 같은 고객의 다른 대기 요청은 이 승인으로 정리
    for (const y of (h._hlsList || [])) if (y !== x && y.key === x.key) await updateDoc(doc(db(), 'requests', y.r.id), { loc_sync: 'replaced', loc_sync_at: now }).catch(() => {});
    CUSTS = null;
    toast('📍 승인했습니다 — 고객 위치' + (r.length ? '와 예정 일정 ' + r.length + '곳' : '') + '을 바꿨습니다');
  }catch(err){ console.warn('[HHCLS]', err); toast('처리하지 못했습니다: ' + (err.message || '')); }
}
function watchPending(host){
  if (!host || hosts.has(host)) return;
  hosts.add(host); host.addEventListener('click', onClick);
  if (unsub){ renderAll(); return; }
  unsub = onSnapshot(query(collection(db(), 'requests'), where('loc_sync', '==', 'pending')), snap => {
    PEND = snap.docs.map(d => ({ ...d.data(), id: d.id })).filter(r => ok(r.loc));
    CUSTS = null; renderAll();
  }, e => console.warn('[HHCLS] pending', e));
}

// ── 🧹 (2026-11-17) 첫 배포본 오류 정리 ──
//   95ea766 에서 고객관리 위치 등록이 기존 고객 대신 「같은 이름·연락처의 새 고객 문서」에 저장되던 문제.
//   2026-11-17 오후 5시(말레이시아) 이후 위치 저장 때 만들어진 빈 고객 문서 중, 같은 연락처·이름의 기존 고객이 있는 것만 골라
//   위치를 기존 고객으로 옮기고 새 문서를 지웁니다. 지우기 전에 목록을 보여 주고 확인을 받습니다. 한 번 정리하면 다시 묻지 않습니다.
async function repairDups(){
  try{
    if (localStorage.getItem('hhc_ls_fix1') === 'done') return 0;
    const list = await loadCustomers();
    const blank = c => !c.member && !c.email && !c.addr && !c.memo && !(c.aliases || []).length && ok(c.loc) && c.loc.via &&
      String(c.created_at || '') >= '2026-11-17T09:00' && Object.keys(c).every(k => ['id','name','phone','member','email','addr','memo','aliases','loc','created_at','updated_at','__id'].includes(k));
    const fixes = [];
    for (const d of list.filter(blank)){
      const p = pn(d.phone);
      const orig = list.filter(c => c.__id !== d.__id && String(c.created_at || '') < String(d.created_at || '') &&
        ((p.length >= 6 && pn(c.phone) === p) || (nn(d.name) && [c.name].concat(c.aliases || []).some(a => nn(a) === nn(d.name)))))
        .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))[0];
      if (orig) fixes.push({ d, orig });
    }
    if (!fixes.length){ localStorage.setItem('hhc_ls_fix1', 'done'); return 0; }
    const names = fixes.map(f => '· ' + (f.orig.name || f.d.name) + ' → ' + (f.d.loc.name || '지도 위치')).join('\n');
    if (!confirm('📍 방문 위치가 기존 고객이 아닌 「중복 고객」에 저장된 것이 ' + fixes.length + '건 있습니다.\n\n' + names + '\n\n위치를 기존 고객으로 옮기고 중복 고객을 지울까요?\n(중복 고객은 오늘 위치 저장 때 자동으로 만들어진 빈 고객 정보입니다)')) return 0;
    for (const f of fixes){
      const keep = ok(f.orig.loc) && String(f.orig.loc.at || '') > String(f.d.loc.at || '');
      if (!keep) await updateDoc(doc(db(), 'customers', f.orig.__id), { loc: f.d.loc, updated_at: new Date().toISOString() });
      await deleteDoc(doc(db(), 'customers', f.d.__id));
    }
    localStorage.setItem('hhc_ls_fix1', 'done');
    toast('📍 위치 ' + fixes.length + '건을 기존 고객으로 옮기고 중복 고객을 정리했습니다');
    return fixes.length;
  }catch(e){ console.warn('[HHCLS] repair', e); return 0; }
}

window.HHCLS = { setDb(d){ if (d) DB = d; }, proposeAdmin, watchPending, repairDups, same, ok };
window.dispatchEvent(new Event('hhcls-ready'));
