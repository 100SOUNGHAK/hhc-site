// ─────────────────────────────────────────────────────────────────────────────
// GET /r?k={단축키}  → r.html 을 그대로 내보내되, 링크 미리보기 태그(og:*)만
//                     「그 링크가 여는 문서」에 맞는 그림·제목으로 바꿔 줍니다. (2026-11-20)
//
//  왓츠앱·카카오톡은 링크를 받으면 자바스크립트를 실행하지 않고 머리글 태그만 읽어
//  미리보기 카드를 만듭니다. 예전에는 모든 단축 링크가 같은 H 로고 카드였습니다.
//
//  · 견적서·인보이스·계약서·예약서·마이페이지·상품권·결제 계좌·작업방문등록·
//    출장점검·적립포인트 → 문서별 그림(og-*.jpg, 1200×630, 한/영 공용)
//  · 그 밖의 우리 화면(보고서·멤버십·공동계약 안내장 등) → 그 화면의 미리보기 태그를 그대로 이어받음
//  · 조회 실패·키 없음 → 예전 r.html 그대로 (이동 기능은 r.html 이 /api/r 로 따로 처리)
//
//  이 파일은 미리보기 태그만 바꿉니다. 이동·보안 동작은 r.html · /api/r.js 그대로입니다.
// ─────────────────────────────────────────────────────────────────────────────
import { queryEq } from './api/_lib/fs.js';

const SITE = 'https://happyhomecare.com.my';
const OUR_HOSTS = /^(www\.)?happyhomecare\.com\.my$|^hhc-3p8\.pages\.dev$/i;

// [경로 규칙, 그림, 한국어 제목, 영어 제목, 한국어 설명, 영어 설명]
const TYPES = [
  [/^\/(quote|quoteadmin)(\.html)?$/i, 'quote',
    '견적서 · Quotation | Happy Home Care', 'Quotation | Happy Home Care',
    '요청하신 견적서가 도착했습니다 · 항목별 금액 확인', 'Your quotation is ready · check each item and the total'],
  [/^\/(hhc-invoice|hhcinvoice|inv)(\.html)?$/i, 'invoice',
    '인보이스 · Invoice | Happy Home Care', 'Invoice | Happy Home Care',
    '서비스 이용 내역과 결제 금액 안내', 'Service details and amount due'],
  [/^\/(admin|customer)(\.html)?$/i, 'contract',
    '계약서 · 이용내역 | Happy Home Care', 'Contract & Usage | Happy Home Care',
    '계약서와 이용내역을 한눈에 확인', 'Your package contract and usage at a glance'],
  [/^\/booking(\.html)?$/i, 'booking',
    '예약서 · Booking | Happy Home Care', 'Booking | Happy Home Care',
    '편하신 날짜를 골라 예약을 확정해 주세요', 'Pick a date that suits you to confirm'],
  [/^\/(my|mypage|my-en)(\.html)?$/i, 'my',
    '마이페이지 · MY PAGE | Happy Home Care', 'MY PAGE | Happy Home Care',
    '우리 집 케어 현황, 한곳에서 확인', 'Reports, invoices, points and bookings in one place'],
  [/^\/(coupon|evoucher)(\.html)?$/i, 'voucher',
    '상품권 · E-Voucher | Happy Home Care', 'E-Voucher | Happy Home Care',
    '고객님께 드리는 상품권 · 할인권', 'Your gift voucher · check the balance'],
  [/^\/pay(\.html)?$/i, 'pay',
    '결제 계좌 안내 | Happy Home Care', 'Payment Details | Happy Home Care',
    '계좌번호 복사 한 번으로 간편하게 이체', 'Copy the account number and transfer in one tap'],
  [/^\/workpermit(\.html)?$/i, 'permit',
    '작업방문 등록 · Work Permit | Happy Home Care', 'Work Permit | Happy Home Care',
    '관리사무소 제출용 작업방문 등록 정보', 'Worker, vehicle and visit details for management office'],
  [/^\/visit-fee(\.html)?$/i, 'visitfee',
    '출장점검 비용 확인 | Happy Home Care', 'On-site Check Fee | Happy Home Care',
    '우리 집 출장점검 비용, 주소로 바로 확인', 'Enter your address to see your on-site check fee'],
  [/^\/points(\.html)?$/i, 'points',
    '해피포인트 · Happy Point | Happy Home Care', 'Happy Point | Happy Home Care',
    '이용할수록 쌓이는 해피포인트', 'Earn points every time you use our service'],
];

// 마이페이지 링크는 발송 종류(f=)마다 다른 그림 — 고객관리 발송 창 FOCUS_OF 와 같은 표시 (2026-11-20)
//   f 가 없으면(기본 안내) 마이페이지 그림 그대로
const MY_FOCUS = {
  py:  ['invoice',   '결제 안내 · Payment | Happy Home Care', 'Payment Due | Happy Home Care', '결제 예정 금액과 결제 방법 안내', 'Amount due and how to pay'],
  ivl: ['paid',      '결제 확인 · Payment Confirmed | Happy Home Care', 'Payment Confirmed | Happy Home Care', '결제가 확인되었습니다 · 이용해 주셔서 감사합니다', 'Your payment is confirmed · thank you'],
  rw:  ['points',    '적립 안내 · Happy Point | Happy Home Care', 'Happy Point | Happy Home Care', '해피포인트가 적립되었습니다', 'Happy Points have been added to your account'],
  ip:  ['svcreport', '점검보고서 · Report | Happy Home Care', 'Service Report | Happy Home Care', '작업이 끝났습니다 · 보고서를 확인하세요', 'Your service report is ready'],
  ct:  ['contract',  '계약서 · 이용내역 | Happy Home Care', 'Contract & Usage | Happy Home Care', '계약서와 이용내역을 한눈에 확인', 'Your package contract and usage at a glance'],
  cp:  ['voucher',   '상품권 · E-Voucher | Happy Home Care', 'E-Voucher | Happy Home Care', '고객님께 드리는 상품권 · 할인권', 'Your gift voucher · check the balance'],
  qt:  ['quote',     '견적서 · Quotation | Happy Home Care', 'Quotation | Happy Home Care', '요청하신 견적서가 도착했습니다', 'Your quotation is ready'],
  bk:  ['booking',   '예약 안내 · Booking | Happy Home Care', 'Booking | Happy Home Care', '예약 일정을 확인해 주세요', 'Please check your booking'],
  rq:  ['received',  '의뢰 접수 · Request Received | Happy Home Care', 'Request Received | Happy Home Care', '의뢰가 접수되었습니다 · 확인 후 일정과 견적을 안내드립니다', 'We received your request · we\'ll be in touch shortly'],
  mm:  ['repair',    '수리요청 처리 · Service Visit | Happy Home Care', 'Service Visit | Happy Home Care', '수리요청 처리 결과를 확인하세요', 'See the result of your service request'],
  ap:  ['app',       '앱 설치 안내 · Install App | Happy Home Care', 'Install App | Happy Home Care', '마이페이지를 홈 화면에 설치하세요', 'Add MY PAGE to your home screen'],
  sv:  ['reqform',   '서비스 의뢰 · Request | Happy Home Care', 'Service Request | Happy Home Care', '필요한 서비스를 바로 신청하세요', 'Request a service in a minute'],
  cr:  ['care',      '우리집 케어 현황 · My Home Care | Happy Home Care', 'My Home Care | Happy Home Care', '품목별 마지막 청소일과 관리 시기를 한눈에 확인하세요', 'Last cleaning dates and next care at a glance'],
};

const isEn = (t) => /[?&](lang=en|en=1)\b/i.test(t.search) || /-en(\.html)?$/i.test(t.pathname);

// 우리 화면 하나의 미리보기 태그 읽기 (보고서·안내장 등)
async function pageMeta(env, origin, path){
  const r = await env.ASSETS.fetch(new Request(new URL(path, origin)));
  if (!r.ok) return null;
  const m = {};
  const grab = (name) => ({ element(el){ const v = el.getAttribute('content'); if (v && !m[name]) m[name] = v; } });
  await new HTMLRewriter()
    .on('meta[property="og:title"]', grab('title'))
    .on('meta[property="og:description"]', grab('desc'))
    .on('meta[property="og:image"]', grab('image'))
    .on('meta[property="og:image:width"]', grab('w'))
    .on('meta[property="og:image:height"]', grab('h'))
    .transform(r).arrayBuffer();
  return m.image || m.title ? m : null;
}

async function metaFor(env, origin, target){
  let t; try { t = new URL(target, SITE); } catch (_) { return null; }
  if (!OUR_HOSTS.test(t.hostname)) return null;
  const en = isEn(t);
  const f = t.searchParams.get('f') || '';
  if (/^\/(my|mypage|my-en)(\.html)?$/i.test(t.pathname) && MY_FOCUS[f]) {
    const [img, tk, te, dk, de] = MY_FOCUS[f];
    return { title: en ? te : tk, desc: en ? de : dk, image: `${SITE}/og-${img}.jpg`, w: '1200', h: '630' };
  }
  for (const [re, img, tk, te, dk, de] of TYPES) {
    if (re.test(t.pathname)) return { title: en ? te : tk, desc: en ? de : dk,
      image: `${SITE}/og-${img}.jpg`, w: '1200', h: '630' };
  }
  const m = await pageMeta(env, origin, t.pathname);
  if (!m || /icon-512\.png$/.test(m.image || '')) return m && m.title ? { ...m, image: '' } : null;
  return m;
}

export async function onRequestGet(context){
  const { request, env } = context;
  const url = new URL(request.url);
  const page = await env.ASSETS.fetch(new Request(new URL('/r', url.origin), { headers: request.headers }));
  const k = (url.searchParams.get('k') || '').trim();
  if (!page.ok || !k || k.length > 64) return page;

  let m = null;
  try {
    const rows = await queryEq(env, 'shorts', 'key', k, 1);
    const target = rows[0] && typeof rows[0].url === 'string' ? rows[0].url : '';
    if (target) m = await metaFor(env, url.origin, target);
  } catch (_) { m = null; }
  if (!m) return page;

  const set = (v) => ({ element(el){ if (v) el.setAttribute('content', v); } });
  const res = new HTMLRewriter()
    .on('title', { element(el){ if (m.title) el.setInnerContent(m.title); } })
    .on('meta[property="og:title"], meta[name="twitter:title"]', set(m.title))
    .on('meta[property="og:description"], meta[name="twitter:description"]', set(m.desc))
    .on('meta[property="og:image"], meta[name="twitter:image"]', set(m.image))
    .on('meta[property="og:image:width"]', set(m.image ? (m.w || '1200') : ''))
    .on('meta[property="og:image:height"]', set(m.image ? (m.h || '630') : ''))
    .on('head', { element(el){ if (m.image) el.append('<meta name="twitter:card" content="summary_large_image">', { html: true }); } })
    .transform(page);
  const out = new Response(res.body, res);
  out.headers.delete('content-length');
  out.headers.set('Cache-Control', 'no-cache');
  return out;
}
