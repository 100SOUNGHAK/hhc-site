// ─────────────────────────────────────────────────────────────────────────────
// POST /api/quote — 견적서(quote.html)에서 고객이 고른 에어컨 옵션 저장 (2026-11-09)
//  본문: {id, choice:{selections:[…], label, price, at}}
//  → quotes/{id}.customerChoice 만 바뀐다 (견적 내용 자체는 고객이 바꿀 수 없음)
// ─────────────────────────────────────────────────────────────────────────────
import { getDoc, patchDoc, json, fail, rateLimited, originAllowed } from './_lib/fs.js';

export async function onRequestPost(context){
  const { request, env } = context;
  if (!originAllowed(request)) return fail('forbidden', 403);
  if (rateLimited(request, 'qt', 30)) return fail('too many requests', 429);
  let b; try { b = await request.json(); } catch (e) { return fail('bad request', 400); }
  const id = String((b && b.id) || '').trim();
  if (!id || id.length > 200) return fail('no-id', 400);
  const c = b && b.choice;
  if (!c || typeof c !== 'object' || !Array.isArray(c.selections) || c.selections.length > 50) return fail('bad-choice', 400);
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const choice = {
    selections: c.selections.slice(0, 50).map(s => ({
      key: String((s && s.key) || '').slice(0, 100), hp: String((s && s.hp) || '').slice(0, 50), qty: num(s && s.qty) || 1,
      label: String((s && s.label) || '').slice(0, 300), price: num(s && s.price), amount: num(s && s.amount),
    })),
    label: String(c.label || '').slice(0, 1000),
    price: num(c.price),
    at: new Date().toISOString(),
  };
  try {
    const cur = await getDoc(env, 'quotes', id);
    if (!cur) return fail('not-found', 404);
    await patchDoc(env, 'quotes', id, { customerChoice: choice });
    return json({ ok: true, choice });
  } catch (e) { return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500); }
}
