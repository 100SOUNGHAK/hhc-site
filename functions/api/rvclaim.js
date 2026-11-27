// ─────────────────────────────────────────────────────────────────────────────
// POST /api/rvclaim — ⭐ 리뷰 이벤트 적립 신청 (2026-11-27)
//  홈페이지 리뷰 작성 창에서 「🎁 해피포인트 적립 받기」 칸(콘도명 · 동호수 · 전화번호)을 채운 경우,
//  리뷰가 저장된 직후 화면이 이 창구를 부른다.
//
//  · 리뷰 자체(이름 · 별점 · 후기 · 사진)는 지금처럼 공개 저장소 reviews 에 저장된다.
//  · 연락처는 공개 저장소에 넣지 않고 관리자 전용 review_claims 에만 저장한다 (문서 ID = 리뷰 ID).
//  · 고객 정보와의 교차검증 · 지급은 관리자 고객관리 「⭐ 리뷰 보상」에서 한다 (customer-admin.html rvRows).
//  · 손님에게는 「접수됨」만 알려 주고, 고객으로 확인됐는지는 알려 주지 않는다 (남의 번호로 고객 여부를 떠보는 일 방지).
//
//  본문: {rid, condo, unit, phone, lang}
//  응답: {ok:true} · 이미 접수된 리뷰면 {ok:true, dup:true}
// ─────────────────────────────────────────────────────────────────────────────
import { getDoc, patchDoc, json, fail, rateLimited, originAllowed, pn } from './_lib/fs.js';

const ID_RE = /^[A-Za-z0-9]{10,40}$/;
const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

export async function onRequestPost(context){
  const { request, env } = context;
  if (!originAllowed(request)) return fail('forbidden', 403);
  if (rateLimited(request, 'rvclaim', 6)) return fail('too many requests', 429);
  let b;
  try { b = await request.json(); } catch (e) { return fail('bad-json'); }
  const rid = String((b && b.rid) || '');
  const condo = clip(b.condo, 80), unit = clip(b.unit, 30), phone = clip(b.phone, 30);
  if (!ID_RE.test(rid)) return fail('bad-id');
  if (!condo || !unit || pn(phone).length < 7) return fail('missing');
  try {
    const rv = await getDoc(env, 'reviews', rid);
    if (!rv) return fail('no-review', 404);
    // 방금 쓴 리뷰에만 (30분 이내) — 남의 오래된 리뷰에 신청을 붙이는 일 방지
    const age = Date.now() - Date.parse(rv.created_at || 0);
    if (!(age > -5 * 60e3 && age < 30 * 60e3)) return fail('too-late', 409);
    const ex = await getDoc(env, 'review_claims', rid).catch(() => null);
    if (ex) return json({ ok: true, dup: true });
    const now = new Date().toISOString();
    await patchDoc(env, 'review_claims', rid, {
      rid,
      name: clip(rv.name, 40),
      rating: Number(rv.rating) || 0,
      text: clip(rv.text, 300),
      photos: Array.isArray(rv.photos) ? rv.photos.length : 0,
      review_at: String(rv.created_at || ''),
      condo, unit, phone,
      lang: b.lang === 'en' ? 'en' : 'ko',
      status: 'pending',
      created_at: now,
    });
    return json({ ok: true });
  } catch (e) {
    return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500);
  }
}
