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
import { getDoc, listAll, batchGet, json, fail, rateLimited, nn, pn } from './_lib/fs.js';

const PICK = {   // 각 문서에서 고객명·전화를 읽는 자리
  invoices:    x => [x.customer && x.customer.name, x.customer && x.customer.phone],
  inspections: x => [x.client, x.phone],
  contracts:   x => [x.name, x.phone],
  bookings:    x => [x.customer_name, x.customer_phone],
  quotes:      x => [x.client, x.phone],
  memos:       x => [x.name, x.phone],
};
// 의뢰서(requests)의 고객명 — 관리자 화면 reqName() 과 같은 규칙 (콘도명 + 호수)
const reqNames = x => {
  const n = String((x && x.condo_name) || '').trim(), u = String((x && x.condo_unit) || '').trim();
  const c = String((x && x.condo) || '').trim().replace(/\s*\(\s*(.+?)\s*\)\s*$/, ' $1').trim();
  const out = [];
  if (n && u) { if (nn(n).indexOf(nn(u)) >= 0) out.push(n); else out.push(n + ' ' + u, u + ' ' + n); }
  else if (n) out.push(n);
  if (c) out.push(c);
  return out;
};
// 1차로 가볍게 훑을 때 받는 필드 (매칭에 필요한 것만 — 전체 컬렉션을 통째로 변환하면 무료 플랜 CPU 한도(10ms)를 넘김)
const LINK = ['ca_link', 'ca_links', 'ca_off'];
const MASK = {
  invoices:    ['customer.name', 'customer.phone', ...LINK],
  inspections: ['client', 'phone', ...LINK],
  contracts:   ['name', 'phone', ...LINK],
  bookings:    ['customer_name', 'customer_phone', 'status', ...LINK],
  quotes:      ['client', 'phone', ...LINK],
  memos:       ['name', 'phone', ...LINK],
  coupons:     ['name', 'receiver', ...LINK],
  requests:    ['condo_name', 'condo_unit', 'condo', 'phone', 'submitted_at', ...LINK],
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

  const want = { invoices: VIS.includes('iv'), inspections: VIS.includes('ip'), contracts: VIS.includes('ct') };
  // 1차: 매칭 필드만 가볍게 훑어 「내 문서」 ID 를 고른다 → 2차: 그 문서들만 전체 내용으로 받는다
  const pick = async (coll, filter) => {
    const light = await listAll(env, coll, 300, MASK[coll]);
    const ids = light.filter(filter).map(x => x.__id);
    return ids.length ? batchGet(env, coll, ids) : [];
  };
  try {
    // 서비스 의뢰서 — 최근 30일 안에 접수된 것만 (마이페이지 「지금 확인하실 일」의 「의뢰 접수 완료」 카드용)
    const rqFrom = new Date(Date.now() - 30 * 86400000).toISOString();
    const [ps, invs, insps, cts, cps, bks, qts, mms, prs, rqs] = await Promise.all([
      getDoc(env, 'settings', 'points').catch(() => null),
      want.invoices    ? pick('invoices',    x => { const [n, p] = PICK.invoices(x);    return hit(n, p, x); }) : [],
      want.inspections ? pick('inspections', x => { const [n, p] = PICK.inspections(x); return hit(n, p, x); }) : [],
      want.contracts   ? pick('contracts',   x => { const [n, p] = PICK.contracts(x);   return hit(n, p, x); }) : [],
      pick('coupons',  x => inLinks(x) || (x.ca_link ? linked(x) : (!offMine(x) && (keys.includes(nn(x.name)) || keys.includes(nn(x.receiver)))))),
      pick('bookings', x => { const [n, p] = PICK.bookings(x); return ['waiting', 'booked', 'confirmed'].indexOf(x.status) >= 0 && hit(n, p, x); }),
      pick('quotes',   x => { const [n, p] = PICK.quotes(x);   return hit(n, p, x); }),
      pick('memos',    x => { const [n, p] = PICK.memos(x);    return hit(n, p, x); }),
      listAll(env, 'promos'),
      pick('requests', x => String(x.submitted_at || '') >= rqFrom && (inLinks(x) || (x.ca_link ? linked(x) : (!offMine(x) &&
        ((mp && pn(x.phone) === mp) || reqNames(x).some(v => keys.includes(nn(v)))))))).catch(() => []),
    ]);
    const out = {
      ok: true,
      m,
      ptStart: String((ps && ps.pt_start) || ''),
      invoices:    invs.sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
      inspections: insps.sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
      contracts:   cts,
      coupons:     cps,
      bookings:    bks.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
      quotes:      qts.sort((a, b) => String(b.issueDate || '').localeCompare(String(a.issueDate || ''))),
      // 수리요청: 내부 메모(memo)·발송이력(sent_log)은 고객에게 보내지 않음
      memos:       mms.map(x => { const y = { ...x }; delete y.memo; delete y.sent_log; return y; })
                     .sort((a, b) => String(b.req_date || '').localeCompare(String(a.req_date || ''))),
      promos:      prs,
      // 의뢰서: 카드에 필요한 필드만 (요청사항·연락처 등은 보내지 않음)
      requests:    rqs.map(x => ({ __id: x.__id, status: x.status || 'pending', submitted_at: x.submitted_at || '', items: x.items || '', lang: x.lang || '' }))
                     .sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at))),
    };
    return json(out);
  } catch (e) {
    return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500);
  }
}
