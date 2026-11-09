// ─────────────────────────────────────────────────────────────────────────────
// POST /api/request — 고객 서비스 의뢰서(request.html) 접수 (2026-11-09)
//  본문: {condo_name, condo_unit, phone, remarks, lang, items, items_struct}
//  → requests 컬렉션에 새 문서 생성(status:'pending') + 관리자 기기 푸시 알림
//  응답: {ok:true, id}
// ─────────────────────────────────────────────────────────────────────────────
import { createDoc, json, fail, rateLimited, originAllowed } from './_lib/fs.js';
import { sendAdminPush } from './_lib/push.js';

const MAX = { condo_name: 200, condo_unit: 100, phone: 40, remarks: 3000, lang: 5, items: 8000, items_struct: 20000 };

export async function onRequestPost(context){
  const { request, env } = context;
  if (!originAllowed(request)) return fail('forbidden', 403);
  if (rateLimited(request, 'rq', 10)) return fail('too many requests', 429);
  let b; try { b = await request.json(); } catch (e) { return fail('bad request', 400); }
  const str = (k) => { const v = b && b[k]; return typeof v === 'string' ? v.slice(0, MAX[k]) : ''; };
  const condo_name = str('condo_name').trim(), condo_unit = str('condo_unit').trim(), phone = str('phone').trim();
  if (!condo_name || !phone) return fail('missing-fields', 400);
  const data = {
    condo_name, condo_unit,
    condo: condo_name + ' (' + condo_unit + ')',
    phone,
    remarks: str('remarks'),
    lang: str('lang') === 'en' ? 'en' : 'ko',
    items: str('items'),
    items_struct: str('items_struct'),
    status: 'pending',
    submitted_at: new Date().toISOString(),
  };
  try {
    const d = await createDoc(env, 'requests', data);
    const push = await sendAdminPush(env, 'request').catch(() => ({ ok: false }));
    return json({ ok: true, id: d.__id, push });
  } catch (e) { return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500); }
}
