// ─────────────────────────────────────────────────────────────────────────────
// GET /api/r?k={단축키}  → {ok:true,url}   단축주소(r.html) 조회 (2026-11-09)
//  shorts 컬렉션에서 key 가 일치하는 문서 하나의 url 만 돌려준다. (목록 조회 불가)
// ─────────────────────────────────────────────────────────────────────────────
import { queryEq, json, fail, rateLimited } from './_lib/fs.js';

export async function onRequestGet(context){
  const { request, env } = context;
  if (rateLimited(request, 'r', 120)) return fail('too many requests', 429);
  const k = (new URL(request.url).searchParams.get('k') || '').trim();
  if (!k || k.length > 64) return fail('no-key', 400);
  try {
    const rows = await queryEq(env, 'shorts', 'key', k, 1);
    const url = rows[0] && typeof rows[0].url === 'string' ? rows[0].url : '';
    if (!url) return fail('not-found', 404);
    return json({ ok: true, url });
  } catch (e) { return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500); }
}
