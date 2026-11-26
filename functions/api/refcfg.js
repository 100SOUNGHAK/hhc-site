// ─────────────────────────────────────────────────────────────────────────────
// GET /api/refcfg — 지인 추천 보상 금액 (2026-11-26)
//  이벤트 안내장 · 홈페이지 · 전자명함의 「🅿️ 해피포인트」 큰 카드가 쓴다.
//  관리자 고객관리 「🤝 추천 보상 → 금액 설정」(settings/points 의 ref_*)을 그대로 돌려준다.
//  응답: {ok:true, on, pts, newOn, newPts}  — 금액·켜짐 여부만, 그 밖의 설정은 내보내지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
import { json, fail, rateLimited } from './_lib/fs.js';
import { loadRefCfg } from './_lib/ref.js';

export async function onRequestGet(context){
  const { request, env } = context;
  if (rateLimited(request, 'refcfg', 60)) return fail('too many requests', 429);
  try {
    const c = await loadRefCfg(env);
    return json({ ok: true, on: c.on, pts: c.pts, newOn: c.newOn, newPts: c.newPts }, 200, { 'cache-control': 'public, max-age=120' });
  } catch (e) {
    return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500);
  }
}
