// ─────────────────────────────────────────────────────────────────────────────
// /api/travel — 출장점검 비용 확인 화면(visit-fee.html)의 거리 계산 창구 (2026-11-15)
//
//  GET /api/travel?cfg=1          → {ok, ready, key}  화면이 구글 지도를 띄울 브라우저 키
//  GET /api/travel?lat=..&lng=..  → {ok, meters, km, minutes, path:[[lat,lng],...]}
//      · 출발지 → 고객이 고른 위치까지 「자동차」 경로 거리 (Google Routes API)
//      · 교통 상황을 넣지 않고(TRAFFIC_UNAWARE) 대안 경로 중 가장 짧은 거리를 씀
//        → 같은 주소는 언제 열어도 같은 거리 · 같은 금액
//      · 출발지는 화면에 보내지 않음. 경로선도 출발지 주변 약 600m 를 잘라서 보냄
//        (공개 저장소라 출발지 주소는 코드에 적지 않고 환경변수로만 둠)
//
//  Cloudflare Pages 환경변수 (Production · 바꾸면 Retry deployment 후 적용)
//    GMAPS_BROWSER_KEY  지도·장소검색·주소변환용 브라우저 키 (HTTP 리퍼러 제한)
//    GMAPS_SERVER_KEY   Routes API 전용 서버 키 (Secret)
//    HHC_ORIGIN         출발지 — 주소 글자 또는 "위도,경도" (Secret)
//  셋 중 하나라도 없으면 ready:false → 화면은 구역 요금표만 보여 줌
//
//  GET /api/travel?mem=1&c={고객문서ID}  → {ok, exempt, warranty, last}   (2026-11-16)
//      · exempt: 패키지 회원(유효 계약 적립잔액 합계 RM500 초과) · warranty: 마지막 에어컨 서비스 30일 이내
//      · 잔액 RM500 이하면 회원 면제 제외 (무상점검 제한 규정). 금액·계약 내용은 돌려주지 않음
//      · 고객 문서 찾는 규칙은 /api/my 와 같음 (ca_links · ca_link · ca_off · 전화/이름)
// ─────────────────────────────────────────────────────────────────────────────
import { json, fail, rateLimited, originAllowed, getDoc, listAll, batchGet, nn, pn } from './_lib/fs.js';

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const TRIM_M = 600;            // 출발지 주변 경로선 자르는 거리 (m)

export async function onRequestGet(context){
  const { request, env } = context;
  const q = new URL(request.url).searchParams;
  const ready = !!(env.GMAPS_BROWSER_KEY && env.GMAPS_SERVER_KEY && env.HHC_ORIGIN);

  if (q.get('mem')) return memberExempt(request, env, (q.get('c') || '').trim());

  if (q.get('cfg')) {
    if (rateLimited(request, 'travel-cfg', 60)) return fail('too many requests', 429);
    return json({ ok: true, ready, key: ready ? env.GMAPS_BROWSER_KEY : '' });
  }

  // 우리 화면에서 부른 것만 (구글 사용량 보호) + IP 별 분당 20회
  if (!originAllowed(request)) return fail('forbidden', 403);
  if (rateLimited(request, 'travel', 20)) return fail('too many requests', 429);
  if (!ready) return fail('server-not-configured', 503);

  const lat = Number(q.get('lat')), lng = Number(q.get('lng'));
  // 말레이시아 범위 밖이면 거절
  if (!isFinite(lat) || !isFinite(lng) || lat < 0.8 || lat > 7.6 || lng < 99.5 || lng > 119.5) return fail('bad-location', 400);

  // 같은 위치(약 11m 격자)는 30일 동안 저장해 둔 결과를 씀 → 구글 호출 절약
  const rl = lat.toFixed(4), rg = lng.toFixed(4);
  const cache = caches.default;
  const ckey = new Request('https://hhc-cache.internal/travel/v1/' + rl + ',' + rg);
  const hit = await cache.match(ckey);
  if (hit) return json(await hit.json());

  const origin = parseOrigin(env.HHC_ORIGIN);
  let r;
  try {
    r = await fetch(ROUTES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': env.GMAPS_SERVER_KEY,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline'
      },
      body: JSON.stringify({
        origin,
        destination: { location: { latLng: { latitude: +rl, longitude: +rg } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE',
        computeAlternativeRoutes: true,
        regionCode: 'MY',
        units: 'METRIC'
      })
    });
  } catch (e) { return fail('route-unreachable', 502); }
  if (!r.ok) return fail('route-error-' + r.status, 502);
  const d = await r.json().catch(() => ({}));
  const routes = (d.routes || []).filter(x => x && x.distanceMeters > 0);
  if (!routes.length) return json({ ok: false, error: 'no-route' }, 200);

  const best = routes.reduce((a, b) => (b.distanceMeters < a.distanceMeters ? b : a));
  const meters = best.distanceMeters;
  const minutes = Math.max(1, Math.round(parseInt(String(best.duration || '0s'), 10) / 60));
  const full = decode((best.polyline && best.polyline.encodedPolyline) || '');
  const out = { ok: true, meters, km: Math.round(meters / 100) / 10, minutes, path: trimStart(full, TRIM_M) };

  context.waitUntil(cache.put(ckey, new Response(JSON.stringify(out), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=2592000' }
  })));
  return json(out);
}

function parseOrigin(s){
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(String(s || ''));
  return m ? { location: { latLng: { latitude: +m[1], longitude: +m[2] } } } : { address: String(s) };
}

// 구글 encoded polyline → [[lat,lng],...] (소수 5자리)
function decode(str){
  const pts = []; let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let b, sh = 0, res = 0;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20 && i < str.length);
      const v = (res & 1) ? ~(res >> 1) : (res >> 1);
      if (k === 0) lat += v; else lng += v;
    }
    pts.push([lat / 1e5, lng / 1e5]);
  }
  return pts;
}
function hav(a, b){
  const R = 6371000, r = Math.PI / 180, dl = (b[0] - a[0]) * r, dn = (b[1] - a[1]) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// 출발지에서 m 미터 안쪽 점들을 버림 (출발지 위치가 지도에 드러나지 않도록)
function trimStart(pts, m){
  if (pts.length < 3) return pts.slice(-1);
  const o = pts[0]; let k = 0;
  while (k < pts.length - 2 && hav(o, pts[k]) < m) k++;
  // 화면에 너무 많은 점을 보내지 않도록 간추림 (최대 약 400개)
  const rest = pts.slice(k), step = Math.max(1, Math.ceil(rest.length / 400));
  const out = rest.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== rest[rest.length - 1]) out.push(rest[rest.length - 1]);
  return out.map(p => [+p[0].toFixed(5), +p[1].toFixed(5)]);
}

// 출장점검 면제 확인 (2026-11-16)
//  · exempt  : 패키지 회원 — 유효 계약(status≠ended) 적립잔액 합계 RM500 초과 (my.html balCalc 과 같은 계산)
//  · warranty: 마지막 에어컨 「세척」 인보이스(초안 제외) 날짜로부터 30일 이내 — 기본세척만 했으면 7일 이내
//              출장점검·수리·냉매·설치·부품 품목은 세척이 아니므로 세지 않음. 「1회」 사용 여부는 보지 않음 (대표님 결정)
//  · last·days: 기준 세척 날짜(YYYY-MM-DD)와 무상 기간(30 또는 7) — 안내 문구용. 금액·계약 내용은 돌려주지 않음
const AC_RE = /에어컨|벽걸이|천정|천장|카세트|스탠드|매립|덕트|실외기|FCU|air[- ]?con|cassette|ceiling(?!\s*fan)|wall[- ]?mount|duct|outdoor/i;  // 고객관리 CARE_AC 와 같음
const CLEAN_RE = /세척|청소|살균|스팀|약품|wash|clean|steam|overhaul|chemical|saniti/i;
const NOT_CLEAN_RE = /출장점검|점검|수리|repair|inspect|냉매|refrigerant|가스|gas|설치|install|부품|part|진공|vacuum/i;
const BASIC_RE = /기본\s*세척|basic/i;
const WARRANTY_DAYS = 30, BASIC_DAYS = 7;
async function memberExempt(request, env, CID){
  if (!originAllowed(request)) return fail('forbidden', 403);
  if (rateLimited(request, 'travel-mem', 20)) return fail('too many requests', 429);
  const none = { ok: true, exempt: false, warranty: false, last: '' };
  if (!CID || CID.length > 128) return json(none);
  try {
    const m = await getDoc(env, 'customers', CID);
    if (!m) return json(none);
    const keys = [nn(m.name)].concat((m.aliases || []).map(nn)).filter(Boolean);
    const mp = pn(m.phone);
    const MYK = ['m:' + CID, 'k:' + nn(m.name) + '#' + pn(m.phone)];
    const has = (x, f) => (x && Array.isArray(x[f]) ? x[f] : []).some(v => MYK.indexOf(v) >= 0);
    const hit = (name, phone, x) => {
      if (has(x, 'ca_links')) return true;
      if (x && x.ca_link) return MYK.indexOf(x.ca_link) >= 0;
      if (has(x, 'ca_off')) return false;
      return (mp && pn(phone) === mp) || (!!name && keys.includes(nn(name)));
    };
    const LNK = ['ca_link', 'ca_links', 'ca_off'];
    const [lc, li] = await Promise.all([
      listAll(env, 'contracts', 300, ['name', 'phone', 'status', ...LNK]),
      listAll(env, 'invoices', 300, ['customer.name', 'customer.phone', 'status', 'date', ...LNK]),
    ]);
    // ① 패키지 회원
    const cIds = lc.filter(x => x.status !== 'ended' && hit(x.name, x.phone, x)).map(x => x.__id);
    let remain = 0;
    if (cIds.length) (await batchGet(env, 'contracts', cIds)).forEach(c => {
      const paid = parseFloat(c.amount_paid) || 0, bonus = (parseFloat(c.bonus_credit) || 0) + (parseFloat(c.special_bonus_credit) || 0);
      let h = []; try { h = typeof c.usage_history === 'string' ? JSON.parse(c.usage_history || '[]') : (c.usage_history || []); } catch (e) { h = []; }
      const used = h.reduce((a, u) => a + (parseFloat(u.amount) || 0), 0);
      const disc = h.reduce((a, u) => a + (parseFloat(u.discount) || 0), 0);
      const carry = h.reduce((a, u) => a + (parseFloat(u.carryover) || 0), 0);
      remain += paid + bonus - used + disc + carry;
    });
    const exempt = cIds.length > 0 && remain > 500;
    // ② 마지막 에어컨 서비스 30일 이내 (최근 인보이스부터 확인)
    const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);   // 말레이시아 날짜
    const from = new Date(Date.now() + 8 * 3600e3 - (WARRANTY_DAYS + 1) * 86400e3).toISOString().slice(0, 10);
    const iIds = li.filter(x => x.status !== 'draft' && /^\d{4}-\d{2}-\d{2}/.test(String(x.date || '')) && String(x.date).slice(0, 10) >= from &&
      hit(x.customer && x.customer.name, x.customer && x.customer.phone, x)).map(x => x.__id);
    // 인보이스마다 무상 기간: 에어컨 세척 품목이 있으면 30일, 그 세척이 모두 「기본세척」이면 7일
    let last = '', lim = 0;
    if (iIds.length) (await batchGet(env, 'invoices', iIds)).forEach(x => {
      let L = 0;
      (x.items || []).forEach(it => {
        const t = String((it && it.cat) || '') + ' ' + String((it && it.subcat) || '') + ' ' + String((it && it.name) || '');
        if (!AC_RE.test(t) || !CLEAN_RE.test(t) || NOT_CLEAN_RE.test(t)) return;
        L = Math.max(L, BASIC_RE.test(t) ? BASIC_DAYS : WARRANTY_DAYS);
      });
      const d = String(x.date || '').slice(0, 10);
      const age = Math.round((Date.parse(today) - Date.parse(d)) / 86400e3);
      if (L && age >= 0 && age <= L && d > last) { last = d; lim = L; }
    });
    return json({ ok: true, exempt, warranty: !!last, last, days: lim });
  } catch (e) {
    return json({ ok: false, exempt: false, warranty: false, last: '', days: 0 });
  }
}
