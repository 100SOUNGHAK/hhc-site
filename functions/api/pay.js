// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pay  → {ok:true,banks:[{bankName,accName,accNum,qr}]}   결제 계좌 안내장(pay.html)용 (2026-11-17)
//  인보이스 설정의 「입금 계좌」(banks) 중 계좌번호가 있는 것만, order 순서로 돌려준다.
//  인보이스에 이미 공개되는 회사 계좌 정보뿐이며 다른 필드는 내보내지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
import { listAll, json, fail, rateLimited } from './_lib/fs.js';

export async function onRequestGet(context){
  const { request, env } = context;
  if (rateLimited(request, 'pay', 60)) return fail('too many requests', 429);
  try {
    const rows = await listAll(env, 'banks', 50, ['bankName','accName','accNum','qr','order']);
    const banks = rows
      .filter(b => String(b.accNum || '').replace(/[^0-9A-Za-z]/g, ''))
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
      .map(b => ({
        bankName: String(b.bankName || '').slice(0, 60),
        accName:  String(b.accName  || '').slice(0, 80),
        accNum:   String(b.accNum   || '').slice(0, 40),
        qr: (typeof b.qr === 'string' && /^https:\/\//.test(b.qr)) ? b.qr : ''
      }));
    return json({ ok: true, banks });
  } catch (e) { return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500); }
}
