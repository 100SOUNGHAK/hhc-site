// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pay  → {ok:true,banks:[{bankName,accName,accNum,qr}]}   결제 계좌 안내장(pay.html)용 (2026-11-17)
//  인보이스 설정의 「입금 계좌」(banks) 중 계좌번호가 있는 것만, order 순서로 돌려준다.
//  인보이스에 이미 공개되는 회사 계좌 정보뿐이며 다른 필드는 내보내지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
import { listAll, json, fail, rateLimited } from './_lib/fs.js';

const accKey = (b) => String(b.accNum || '').replace(/[^0-9A-Za-z]/g, '');
// 같은 계좌의 이름들 중 「+ 현금 · + 카드결제」 같은 결제방식 꼬리가 없는 이름 (없으면 꼬리만 떼서)
function plainName(rows, b){
  const same = rows.filter(x => accKey(x) === accKey(b)).map(x => String(x.bankName || '').trim());
  return same.find(n => n && !/\+/.test(n)) || String(b.bankName || '').replace(/\s*\+.*$/, '').trim();
}

export async function onRequestGet(context){
  const { request, env } = context;
  if (rateLimited(request, 'pay', 60)) return fail('too many requests', 429);
  try {
    const rows = await listAll(env, 'banks', 50, ['bankName','accName','accNum','qr','order']);
    const banks = rows
      .filter(b => String(b.accNum || '').replace(/[^0-9A-Za-z]/g, ''))
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
      // 같은 계좌번호는 한 번만 (2026-11-21) — 「MAYBANK + 현금」「MAYBANK + 카드결제」처럼 인보이스의
      //   섞어 결제용 항목이 같은 계좌를 가리켜 안내장에 세 번 나오던 문제. 순서상 첫 항목을 남기되,
      //   「+ 현금/카드」가 붙지 않은 이름이 있으면 그 이름을 씁니다.
      .filter((b, i, arr) => arr.findIndex(x => accKey(x) === accKey(b)) === i)
      .map(b => Object.assign({}, b, { bankName: plainName(rows, b) }))
      .map(b => ({
        bankName: String(b.bankName || '').slice(0, 60),
        accName:  String(b.accName  || '').slice(0, 80),
        accNum:   String(b.accNum   || '').slice(0, 40),
        qr: (typeof b.qr === 'string' && /^https:\/\//.test(b.qr)) ? b.qr : ''
      }));
    return json({ ok: true, banks });
  } catch (e) { return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500); }
}
