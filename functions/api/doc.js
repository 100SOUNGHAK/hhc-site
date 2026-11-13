// ─────────────────────────────────────────────────────────────────────────────
// GET /api/doc?t={종류}&id={문서ID}   → 고객에게 보내는 문서 1건 (2026-11-09)
//
//  t=invoice     인보이스 (inv.html · hhc-invoice.html?view=) — 문서ID 또는 id 필드로 찾음, 발행처·이미지·카탈로그·품목·연결 보고서 포함
//  t=inspection  점검·출장점검·설치·세탁기 보고서 (inspect / install / washer.html)
//  t=contract    계약서·이용내역 (customer.html · admin.html?view=) — 이용내역 인보이스의 점검보고서 목록(inspMap) 포함
//  t=quote       견적서 (quote.html)
//  t=coupon      상품권 (coupon.html)
//  t=memo        수리요청 처리내역 (repair.html) — 내부 메모·발송이력 제거
//  t=booking     예약 (booking.html) — /api/booking 과 같은 내용
//
// 접근 방식은 지금과 같다: 문서ID 를 아는 사람(= 링크를 받은 고객)이 연다. 전체 목록은 어떤 경우에도 돌려주지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
import { getDoc, queryEq, queryIn, listAll, json, fail, rateLimited } from './_lib/fs.js';

const TYPES = {
  invoice:    { coll: 'invoices' },
  inspection: { coll: 'inspections' },
  contract:   { coll: 'contracts' },
  quote:      { coll: 'quotes' },
  coupon:     { coll: 'coupons' },
  memo:       { coll: 'memos', strip: ['memo', 'sent_log'] },
  booking:    { coll: 'bookings' },
};

export async function loadDoc(env, t, id){
  const T = TYPES[t]; if (!T) return { error: 'bad-type', status: 400 };
  if (!id || id.length > 200) return { error: 'no-id', status: 400 };
  let d = await getDoc(env, T.coll, id);
  if (!d && t === 'invoice') { const rows = await queryEq(env, 'invoices', 'id', id, 1); d = rows[0] || null; }   // inv.html 은 id 필드로 찾았음
  if (!d) return { error: 'not-found', status: 404 };
  if (T.strip) for (const k of T.strip) delete d[k];
  const out = { ok: true, doc: d };
  if (t === 'invoice') {
    // 인보이스 화면이 함께 쓰는 것들: 발행처·로고/서명 이미지·품목 카탈로그(공개 자료) + 이 인보이스에 연결된 점검보고서 목록
    const invId = d.id || id;
    const [issuer, images, catalog, services, insps] = await Promise.all([
      getDoc(env, 'settings', 'issuer').catch(() => null),
      getDoc(env, 'settings', 'images').catch(() => null),
      getDoc(env, 'settings', 'catalog').catch(() => null),
      listAll(env, 'services', 300, ['id', 'cat', 'subcat', 'sub2', '_del', 'name', 'name_ko', 'name_en', 'unit']).catch(() => []),   // 고객 보기: 분류 최신화 + 품목 한글/영문 이름·단위 (공개 자료)
      queryEq(env, 'inspections', 'invoice_id', invId, 50).catch(() => []),
    ]);
    out.issuer = issuer || null; out.images = images || null; out.catalog = catalog || null; out.services = services || [];
    out.insp = (insps || []).map(x => ({ _id: x.__id, type: x.type || 'inspect', client: x.client || '', date: x.date || '' }));
  }
  if (t === 'contract') {
    // 계약서 화면: 이용내역의 인보이스에 연결된 점검보고서 → 「점검보고서 보기」 버튼용 (inv_id → [{id,type,date}])
    let hist = []; try { hist = typeof d.usage_history === 'string' ? JSON.parse(d.usage_history || '[]') : (d.usage_history || []); } catch (e) { hist = []; }
    const ids = [...new Set(hist.map(u => String((u && u.inv_id) || '')).filter(Boolean))].slice(0, 200);
    const map = {};
    try {
      const rows = ids.length ? await queryIn(env, 'inspections', 'invoice_id', ids, 100) : [];
      for (const x of rows) { const k = String(x.invoice_id || ''); (map[k] = map[k] || []).push({ id: x.__id, type: x.type || 'inspect', date: x.date || '' }); }
    } catch (e) {}
    out.inspMap = map;
  }
  return out;
}

export async function onRequestGet(context){
  const { request, env } = context;
  if (rateLimited(request, 'doc', 120)) return fail('too many requests', 429);
  const u = new URL(request.url);
  const t = (u.searchParams.get('t') || '').trim(), id = (u.searchParams.get('id') || '').trim();
  try {
    const r = await loadDoc(env, t, id);
    if (r.error) return fail(r.error, r.status);
    return json(r);
  } catch (e) {
    return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500);
  }
}
