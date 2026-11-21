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
  mm:  ['confirmed', '수리 방문 안내 · Service Visit | Happy Home Care', 'Service Visit | Happy Home Care', '방문 일정을 확인해 주세요', 'Please check your visit schedule'],
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
  // 인보이스 주소는 항상 lang=en 이 붙어 있어, 발송 언어 표시(ml=en)가 있을 때만 영어 (2026-11-21)
  const en = /^\/(hhc-invoice|hhcinvoice|inv)(\.html)?$/i.test(t.pathname) ? t.searchParams.get('ml') === 'en' : isEn(t);
  const f = t.searchParams.get('f') || '';
  if (/^\/(my|mypage|my-en)(\.html)?$/i.test(t.pathname) && MY_FOCUS[f]) {
    let [img, tk, te, dk, de] = MY_FOCUS[f];
    // 💎 적립 안내 종류(pk=) — 불편 보상 · 지인 추천 보상 · 리뷰 감사 (2026-11-21)
    const PK = { sorry: ['pt-sorry', '불편 보상 적립 · Apology | Happy Home Care', 'Apology Points | Happy Home Care', '불편을 드려 진심으로 죄송합니다 · 사과의 의미로 적립해 드렸습니다', 'We are truly sorry · Happy Points have been added as an apology'],
                 referral: ['pt-referral', '지인 추천 보상 · Referral | Happy Home Care', 'Referral Reward | Happy Home Care', '소개해 주셔서 감사합니다 · 추천 보상이 적립되었습니다', 'Thank you for referring us · your reward has been added'],
                 review: ['pt-review', '리뷰 감사 적립 · Review | Happy Home Care', 'Review Thanks | Happy Home Care', '소중한 리뷰 감사합니다 · 감사 적립해 드렸습니다', 'Thank you for your review · Happy Points have been added'] };
    const pk = f === 'rw' && PK[t.searchParams.get('pk')];
    if (pk) [img, tk, te, dk, de] = pk;
    // 📅 예약 방문 안내(vi=) — 리마인드 · 이동중 · 지연(교통/작업) 그림 (2026-11-21)
    const VI = { '1': ['remind', '예약 방문 알림 · Reminder | Happy Home Care', 'Visit Reminder | Happy Home Care', '예정된 방문을 다시 알려 드려요 · 날짜와 시간을 확인해 주세요', 'A friendly reminder of your visit · please check the date and time'],
                 tm: ['remind-tmr', '내일 방문 안내 · Tomorrow | Happy Home Care', 'See You Tomorrow | Happy Home Care', '내일 방문합니다 · 방문 시간을 확인해 주세요', 'See you tomorrow · please check the visit time'],
                 td: ['remind-today', '오늘 방문 안내 · Today | Happy Home Care', 'See You Today | Happy Home Care', '오늘 방문합니다 · 방문 시간을 확인해 주세요', 'See you today · please check the visit time'],
                 mv: ['onway', '방문하러 가는 중 · On the way | Happy Home Care', 'On the Way | Happy Home Care', '지금 방문하러 가는 중입니다 · 곧 도착합니다', 'We are on our way · arriving soon'],
                 dt: ['delay', '도착 지연 안내 · Delay | Happy Home Care', 'Running Late | Happy Home Care', '교통 체증으로 조금 늦어집니다 · 양해 부탁드립니다', 'Stuck in traffic — running a bit late'],
                 ar: ['arrive', '가드하우스 도착 · Arrived | Happy Home Care', 'Arrived | Happy Home Care', '가드하우스에 도착했습니다 · 출입수속 후 곧 방문드리겠습니다', 'We have arrived at the guardhouse · see you shortly'],
                 dw: ['delayw', '도착 지연 안내 · Delay | Happy Home Care', 'Running Late | Happy Home Care', '앞 작업이 길어져 조금 늦어집니다 · 양해 부탁드립니다', 'The previous job took longer — running a little late'] };
    if ((f === 'bk' || f === 'mm') && VI[t.searchParams.get('vi')]) [img, tk, te, dk, de] = VI[t.searchParams.get('vi')];
    // 🧾 작업 후 안내(f=ct&vi=aw) — 「보고서와 이용내역을 한눈에 확인」 그림 (2026-11-21)
    if (f === 'ct' && t.searchParams.get('vi') === 'aw')
      [img, tk, te, dk, de] = ['aftwork', '작업 완료 · 보고서와 이용내역 | Happy Home Care', 'Service Completed | Happy Home Care', '보고서와 이용내역을 한눈에 확인하세요', 'Your report & usage at a glance'];
    // 📅 사전 안내(vi=pd&vd=MMDD) — 방문 날짜가 찍힌 그림 og-d/MMDD.jpg (2026-11-21)
    const vd = t.searchParams.get('vd') || '';
    if ((f === 'bk' || f === 'mm') && t.searchParams.get('vi') === 'pd') {
      const mm = +vd.slice(0, 2), dd = +vd.slice(2, 4);
      const ok = /^\d{4}$/.test(vd) && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
      const ME = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      [img, tk, te, dk, de] = ok
        ? ['d/' + vd, mm + '월 ' + dd + '일 방문 예정 · Reminder | Happy Home Care', 'Visit on ' + dd + ' ' + ME[mm - 1] + ' | Happy Home Care',
           mm + '월 ' + dd + '일 방문 예정입니다 · 방문 시간을 확인해 주세요', 'Your visit on ' + dd + ' ' + ME[mm - 1] + ' · please check the time']
        : VI['1'];
    }
    return { title: en ? te : tk, desc: en ? de : dk, image: `${SITE}/og-${img}${en ? '-en' : ''}.jpg`, w: '1200', h: '630' };
  }
  for (const [re, img, tk, te, dk, de] of TYPES) {
    if (re.test(t.pathname)) return { title: en ? te : tk, desc: en ? de : dk,
      image: `${SITE}/og-${img}${en ? '-en' : ''}.jpg`, w: '1200', h: '630' };   // 영어 발송은 영어 그림(og-*-en.jpg)
  }
  const m = await pageMeta(env, origin, t.pathname);
  if (!m || /icon-512\.png$/.test(m.image || '')) return m && m.title ? { ...m, image: '' } : null;
  return m;
}

const MEMO = new Map();   // 같은 인스턴스 안에서 다시 쓰는 결과

export async function onRequestGet(context){
  const { request, env } = context;
  const url = new URL(request.url);
  const page = await env.ASSETS.fetch(new Request(new URL('/r', url.origin), { headers: request.headers }));
  const k = (url.searchParams.get('k') || '').trim();
  if (!page.ok || !k || k.length > 64) return page;

  // ⚡ 빠른 응답 (2026-11-21) — 왓츠앱은 미리보기 응답이 늦으면 큰 그림 대신 작은 썸네일을 붙입니다.
  //    단축 주소 → 그림 정보는 바뀌지 않으므로, 한 번 찾은 결과를 Cloudflare 캐시(7일)와 메모리에 보관해
  //    다음부터는 데이터베이스를 거치지 않고 바로 응답합니다. (관리자 화면이 주소를 만들 때 미리 한 번 열어 둡니다)
  let m = MEMO.get(k) || null;
  const ckey = new Request(url.origin + '/__r_meta?k=' + encodeURIComponent(k));
  if (!m) { try { const c = await caches.default.match(ckey); if (c) m = await c.json(); } catch (_) {} }
  if (!m) {
    try {
      const rows = await queryEq(env, 'shorts', 'key', k, 1);
      const target = rows[0] && typeof rows[0].url === 'string' ? rows[0].url : '';
      if (target) m = await metaFor(env, url.origin, target);
    } catch (_) { m = null; }
    if (m) {
      try { context.waitUntil(caches.default.put(ckey, new Response(JSON.stringify(m), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=604800' } }))); } catch (_) {}
    }
  }
  if (!m) return page;
  if (MEMO.size > 500) MEMO.clear();
  MEMO.set(k, m);

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
