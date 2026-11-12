// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ref?k=추천코드 — 추천 링크로 들어온 분에게 보여 줄 내용 (2026-11-12)
//  전자명함(namecard.html)·의뢰서(request.html) 위쪽의 「○○ 님이 소개해 주셨어요」 띠에 쓴다.
//  응답: {ok:true, on, name(가린 이름), newOn, newPts}  · 코드가 없거나 틀리면 {ok:false}
//  추천인의 연락처·문서 ID 는 절대 돌려주지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
import { json, fail, rateLimited } from './_lib/fs.js';
import { findReferrer, loadRefCfg, maskName, REF_RE } from './_lib/ref.js';

export async function onRequestGet(context){
  const { request, env } = context;
  if (rateLimited(request, 'ref', 30)) return fail('too many requests', 429);
  const k = (new URL(request.url).searchParams.get('k') || '').trim().toUpperCase();
  if (!REF_RE.test(k)) return fail('bad-code', 400);
  try {
    const [m, cfg] = await Promise.all([findReferrer(env, k), loadRefCfg(env)]);
    if (!m || !cfg.on) return json({ ok: false, error: 'not-found' }, 200);
    return json({ ok: true, on: true, name: maskName(m.name), newOn: cfg.newOn && cfg.newPts > 0, newPts: cfg.newPts });
  } catch (e) {
    return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500);
  }
}
