// ─────────────────────────────────────────────────────────────────────────────
// GET /api/my?c={고객문서ID}&v=iv,ip,ct,cp   → 고객 마이페이지(my.html) 자료 (2026-11-09)
//
// 예전에는 my.html 이 invoices·inspections·contracts… 컬렉션 「전체」를 내려받아 브라우저에서 내 것만 걸렀다.
// 이제는 서버가 같은 규칙으로 거른 뒤 「이 고객 것」만 돌려준다. 거르는 규칙은 my.html 의 load() 와 같다:
//   · 관리자가 추가 연결(ca_links)한 문서 → 포함
//   · 소속을 옮긴 문서(ca_link) → 그 값이 이 고객을 가리킬 때만 포함
//   · 이 고객에서 떼어낸 문서(ca_off) → 제외
//   · 그 외 → 전화번호 일치 또는 이름/별칭 일치
// ─────────────────────────────────────────────────────────────────────────────
import { getDoc, listAll, json, fail, rateLimited, nn, pn } from './_lib/fs.js';

const PICK = {   // 각 문서에서 고객명·전화를 읽는 자리
  invoices:    x => [x.customer && x.customer.name, x.customer && x.customer.phone],
  inspections: x => [x.client, x.phone],
  contracts:   x => [x.name, x.phone],
  bookings:    x => [x.customer_name, x.customer_phone],
  quotes:      x => [x.client, x.phone],
  memos:       x => [x.name, x.phone],
};

export async function onRequestGet(context){
  const { request, env } = context;
  if (rateLimited(request, 'my', 60)) return fail('too many requests', 429);
  const u = new URL(request.url);
  const CID = (u.searchParams.get('c') || '').trim();
  if (!CID || CID.length > 128) return fail('no-id', 400);
  const VIS = (u.searchParams.get('v') || 'iv,ip,ct,cp').split(',');

  let m;
  try { m = await getDoc(env, 'customers', CID); }
  catch (e) { return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500); }
  if (!m) return fail('not-found', 404);

  const keys = [nn(m.name)].concat((m.aliases || []).map(nn)).filter(Boolean);
  const mp = pn(m.phone);
  const MYK = ['m:' + CID, 'k:' + nn(m.name) + '#' + pn(m.phone)];
  const linked   = x => MYK.indexOf(x && x.ca_link) >= 0;
  const inLinks  = x => { const ls = (x && Array.isArray(x.ca_links)) ? x.ca_links : []; return ls.some(v => MYK.indexOf(v) >= 0); };
  const offMine  = x => { const ls = (x && Array.isArray(x.ca_off)) ? x.ca_off : []; return ls.some(v => MYK.indexOf(v) >= 0); };
  const hit = (name, phone, x) => {
    if (inLinks(x)) return true;
    if (x && x.ca_link) return linked(x);
    if (offMine(x)) return false;
    return (mp && pn(phone) === mp) || (!!name && keys.includes(nn(name)));
  };
  const mine = (coll, rows) => rows.filter(x => { const [n, p] = PICK[coll](x); return hit(n, p, x); });

  const want = { invoices: VIS.includes('iv'), inspections: VIS.includes('ip'), contracts: VIS.includes('ct') };
  try {
    const [ps, invs, insps, cts, cps, bks, qts, mms, prs] = await Promise.all([
      getDoc(env, 'settings', 'points').catch(() => null),
      want.invoices    ? listAll(env, 'invoices')    : [],
      want.inspections ? listAll(env, 'inspections') : [],
      want.contracts   ? listAll(env, 'contracts')   : [],
      listAll(env, 'coupons'),
      listAll(env, 'bookings'),
      listAll(env, 'quotes'),
      listAll(env, 'memos'),
      listAll(env, 'promos'),
    ]);
    const out = {
      ok: true,
      m,
      ptStart: String((ps && ps.pt_start) || ''),
      invoices:    mine('invoices', invs).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
      inspections: mine('inspections', insps).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
      contracts:   mine('contracts', cts),
      coupons:     cps.filter(x => inLinks(x) || (x.ca_link ? linked(x) : (!offMine(x) && (keys.includes(nn(x.name)) || keys.includes(nn(x.receiver)))))),
      bookings:    mine('bookings', bks).filter(x => ['waiting', 'booked', 'confirmed'].indexOf(x.status) >= 0)
                     .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
      quotes:      mine('quotes', qts).sort((a, b) => String(b.issueDate || '').localeCompare(String(a.issueDate || ''))),
      // 수리요청: 내부 메모(memo)·발송이력(sent_log)은 고객에게 보내지 않음
      memos:       mine('memos', mms).map(x => { const y = { ...x }; delete y.memo; delete y.sent_log; return y; })
                     .sort((a, b) => String(b.req_date || '').localeCompare(String(a.req_date || ''))),
      promos:      prs,
    };
    return json(out);
  } catch (e) {
    return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500);
  }
}
