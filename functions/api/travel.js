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
// ─────────────────────────────────────────────────────────────────────────────
import { json, fail, rateLimited, originAllowed } from './_lib/fs.js';

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const TRIM_M = 600;            // 출발지 주변 경로선 자르는 거리 (m)

export async function onRequestGet(context){
  const { request, env } = context;
  const q = new URL(request.url).searchParams;
  const ready = !!(env.GMAPS_BROWSER_KEY && env.GMAPS_SERVER_KEY && env.HHC_ORIGIN);

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
