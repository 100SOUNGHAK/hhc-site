// ─────────────────────────────────────────────────────────────────────────────
// 🤝 지인 추천(소개) 공통 도구 (2026-11-12)
//
//  · 고객마다 추천 코드(customers.ref_code, 6자리)를 하나 둔다. 추천 링크 = /nc?ref=코드
//    (고객 문서 ID 는 마이페이지 열쇠라 링크에 넣지 않는다)
//  · 보상 금액·켜기/끄기는 settings/points 문서에 함께 둔다 (관리자 고객관리 「🤝 추천 보상 → 금액 설정」)
//      ref_on       추천 기능 사용 (기본 켜짐)
//      ref_pts      추천인 보상 해피포인트 RM (기본 10)
//      ref_new_on   소개받은 신규 고객 혜택 사용 (기본 켜짐)
//      ref_new_pts  신규 고객 혜택 RM (기본 5)
//  · 실제 지급은 관리자가 고객관리에서 「지급」을 눌러 pt_adj(적립 조정)로 넣는다.
//  같은 규칙: customer-admin.html (REF_DEF · refCfg)
// ─────────────────────────────────────────────────────────────────────────────
import { getDoc, listAll, queryEq, patchDoc, pn } from './fs.js';

export const REF_DEF = { on: true, pts: 10, newOn: true, newPts: 5 };
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // 헷갈리는 글자(0·O·1·I·L) 제외
export const REF_RE = /^[A-Z2-9]{6}$/;

export function refCfg(ps){
  const p = ps || {};
  const num = (v, d) => { const n = parseFloat(v); return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : d; };
  return {
    on:     p.ref_on !== false,
    pts:    num(p.ref_pts, REF_DEF.pts),
    newOn:  p.ref_new_on !== false,
    newPts: num(p.ref_new_pts, REF_DEF.newPts),
  };
}
export async function loadRefCfg(env){
  const ps = await getDoc(env, 'settings', 'points').catch(() => null);
  return refCfg(ps);
}

// 이름 가리기 — 김민지 → 김○지 · 김민 → 김○ · Kim Minji → Kim M.
export function maskName(s){
  s = String(s || '').trim();
  if (!s) return '';
  if (/[가-힣]/.test(s)) {
    const t = s.replace(/\s+/g, '');
    if (t.length <= 1) return t;
    if (t.length === 2) return t[0] + '○';
    return t[0] + '○'.repeat(t.length - 2) + t[t.length - 1];
  }
  const w = s.split(/\s+/);
  return w.length > 1 ? w[0] + ' ' + w[1][0].toUpperCase() + '.' : (s.length > 2 ? s.slice(0, 2) + '*'.repeat(Math.min(4, s.length - 2)) : s);
}

function newCode(){
  const a = new Uint8Array(6); crypto.getRandomValues(a);
  let s = ''; for (const b of a) s += ALPHA[b % ALPHA.length];
  return s;
}
// 고객의 추천 코드 — 없으면 만들어 저장 (겹치지 않는지 확인)
export async function ensureRefCode(env, m){
  if (m && REF_RE.test(String(m.ref_code || ''))) return m.ref_code;
  for (let i = 0; i < 5; i++) {
    const c = newCode();
    const hit = await queryEq(env, 'customers', 'ref_code', c, 1).catch(() => []);
    if (hit.length) continue;
    await patchDoc(env, 'customers', m.__id, { ref_code: c });
    m.ref_code = c;
    return c;
  }
  return '';
}
export async function findReferrer(env, code){
  code = String(code || '').trim().toUpperCase();
  if (!REF_RE.test(code)) return null;
  const r = await queryEq(env, 'customers', 'ref_code', code, 1);
  return r[0] || null;
}

// 이 전화번호로 「서비스를 받은 기록」이 있는가 — 의뢰 접수 순간의 1차 판정
//  서비스 기록 = 인보이스(작성중 제외) · 점검/설치보고서 · 계약서 · 작업완료 예약
//  (견적서만 받았거나 의뢰만 한 분은 신규로 본다 — 2026-11-12 대표님 결정)
//  최종 판정은 관리자 고객관리에서 다시 한다 (동호수 일치 등 「확인 필요」 포함)
export async function hasServiceHistory(env, phone){
  const p = pn(phone);
  if (p.length < 6) return false;
  const [inv, ins, ct, bk] = await Promise.all([
    listAll(env, 'invoices', 300, ['customer.phone', 'status']).catch(() => []),
    listAll(env, 'inspections', 300, ['phone']).catch(() => []),
    listAll(env, 'contracts', 300, ['phone']).catch(() => []),
    listAll(env, 'bookings', 300, ['customer_phone', 'status']).catch(() => []),
  ]);
  return inv.some(x => x.status !== 'draft' && pn(x.customer && x.customer.phone) === p)
      || ins.some(x => pn(x.phone) === p)
      || ct.some(x => pn(x.phone) === p)
      || bk.some(x => x.status === 'done' && pn(x.customer_phone) === p);
}
