// ─────────────────────────────────────────────────────────────────────────────
// 안내장 페이지의 링크 미리보기를 영어 링크(?lang=en)일 때 영어 그림·제목으로 (2026-11-21)
//
//  전자명함 「안내 링크 보내기」·고객관리 발송은 /guides?lang=en 처럼 안내장 주소를 바로 보냅니다.
//  왓츠앱·카카오톡은 페이지 머리글(og:*)만 읽어 미리보기를 만드는데, 안내장 페이지의 머리글은 한국어뿐이라
//  영어로 보내도 한국어 그림이 붙었습니다. → 아래 목록의 페이지 + lang=en 일 때만 머리글을 영어로 바꿉니다.
//
//  · 그 밖의 모든 요청(관리자 화면·/api·/r·한국어 링크)은 손대지 않고 그대로 통과합니다.
//  · 페이지 내용·동작은 바꾸지 않습니다. 머리글 태그(og:*, twitter:*, <title>)만 바꿉니다.
// ─────────────────────────────────────────────────────────────────────────────
const SITE = 'https://happyhomecare.com.my';
const EN = {
  'guides':    ['og-guides-en.jpg?v=20261123', 'Our service process in photos & video | Happy Home Care', 'Air-con job videos & 3D · washer · dryer · sofa · mattress · curtains'],
  'ac-guides': ['og-ac-guides-en.jpg', 'Air-con: good to know | Happy Home Care', 'Causes & fixes by symptom · before you book'],
  'smart':     ['og-save-en.jpg',      'Smart ways to save | Happy Home Care', 'Membership bonus credit · E-voucher 10% off'],
  'prices':    ['og-prices-en.jpg',    'Prices by service | Happy Home Care', 'Air-con · washer · sofa · mattress · curtain prices at a glance'],
  'fees':      ['og-fees-en.jpg',      'Extra charges | Happy Home Care', 'Minimum charge · parking · booking deposit'],
  'visit-fee': ['og-visitfee-en.jpg',  'On-site check fee | Happy Home Care', 'Enter your address to see your on-site check fee'],
  'calc':      ['og-calc-en.jpg',      'Quick price calculator | Happy Home Care', 'Pick your items and see the estimate instantly'],
  'moveout':   ['og-move-en.jpg',   'Moving out — 2 services you need | Happy Home Care', 'Air-con · curtains before you hand over the keys'],
  'visit-pm':  ['og-pmvisit-en.jpg', 'Visit time — our apologies | Happy Home Care', 'No morning slot available · visit around 3:30 PM'],
};

// ─────────────────────────────────────────────────────────────────────────────
// 고객 문서 페이지를 링크로 「바로」 보낼 때의 미리보기 그림 (2026-11-21)
//  결제 계좌(/pay)처럼 짧은 링크(/r)를 거치지 않는 발송은 페이지 자체 머리글을 읽는데,
//  회사 아이콘(icon-512)이거나 그림 설정이 없었습니다 → 문서에 맞는 그림(og-*.jpg)으로.
//  영어 링크(lang=en · 인보이스는 ml=en · my-en)는 영어 그림. 제목·설명은 페이지 것을 그대로 두고,
//  페이지에 제목 태그가 없을 때만 아래 이름을 넣습니다.
// ─────────────────────────────────────────────────────────────────────────────
import { visitImg } from './api/_lib/vimg.js';   // 날짜·분이 찍힌 그림 (2026-11-21)
const DOC = {
  'pay': ['pay', '결제 계좌 안내', 'Payment details'], 'points': ['points', '해피포인트 안내', 'Happy Point'],
  'workpermit': ['permit', '작업방문 등록 안내', 'Work permit'], 'evoucher': ['voucher', '전자상품권 안내', 'E-voucher'],
  'coupon': ['voucher', '상품권 · 할인권', 'Gift voucher'], 'quote': ['quote', '견적서', 'Quotation'],
  'admin': ['contract', '계약서 · 이용내역', 'Contract & usage'], 'customer': ['contract', '계약서 · 이용내역', 'Contract & usage'],
  'booking': ['booking', '예약서', 'Booking'], 'hhc-invoice': ['invoice', '인보이스', 'Invoice'], 'inv': ['invoice', '인보이스', 'Invoice'],
  'repair': ['repair', '방문 결과 보고서', 'Service visit report'],
  'my': ['my', 'MY PAGE', 'MY PAGE'], 'my-en': ['my', 'MY PAGE', 'MY PAGE'], 'mypage': ['my', 'MY PAGE', 'MY PAGE'],
};
// 마이페이지 링크의 발송 종류(f=) → 그림 (functions/r.js 와 같은 표)
const MY_F = { py:'invoice', ivl:'paid', rw:'points', ip:'svcreport', ct:'contract', cp:'voucher', qt:'quote', bk:'booking',
               rq:'received', mm:'confirmed', ap:'app', sv:'reqform', cr:'care' };
const PK = { sorry:'pt-sorry', referral:'pt-referral', review:'pt-review' };

async function docPreview(context, url, key){
  const res = await context.next();
  const type = res.headers.get('content-type') || '';
  if (!res.ok || type.indexOf('text/html') < 0) return res;
  const q = url.searchParams, [base, tk, te] = DOC[key];
  const en = (key === 'hhc-invoice' || key === 'inv') ? q.get('ml') === 'en' : (q.get('lang') === 'en' || key === 'my-en');
  let img = base;
  if (base === 'my'){ const f = q.get('f') || ''; img = MY_F[f] || 'my'; if (f === 'rw' && PK[q.get('pk')]) img = PK[q.get('pk')]; const VI = { '1':'remind', tm:'remind-tmr', td:'remind-today', mv:'onway', dt:'delay', dw:'delayw', ar:'arrive' }; if ((f === 'bk' || f === 'mm') && VI[q.get('vi')]) img = VI[q.get('vi')]; if (f === 'ct' && q.get('vi') === 'aw') img = 'aftwork'; if ((f === 'bk' || f === 'mm') && q.get('vi') === 'pd') img = /^(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(q.get('vd') || '') ? 'd/' + q.get('vd') : 'remind'; }
  // 📅 예약 확정·신청 날짜 / ⏱ 00분 후 도착 / ⚡ 지금 방문 / 🔧 점검 접수 — 예약서(id) 조회는 미리보기 로봇일 때만 (고객 화면은 느려지지 않게)
  let W = '1200', H = '630';
  if (base === 'my' || key === 'workpermit' || key === 'booking'){
    const bot = /whatsapp|facebookexternalhit|facebot|kakaotalk-scrap|kakao|telegram|twitterbot|slackbot|discordbot|linkedinbot|line-poker|skypeuri|googlebot|bingbot/i.test(context.request.headers.get('user-agent') || '');
    if (key !== 'booking' || bot){ let vx = null; try { vx = await visitImg(key === 'booking' ? context.env : null, url); } catch (_) {}
      if (vx){ img = vx.img; W = vx.w; H = vx.h; } }
  }
  const src = `${SITE}/og-${img}${en ? '-en' : ''}.jpg`, title = (en ? te : tk) + ' | Happy Home Care';
  let hasTitle = false, hasSite = false;
  const drop = { element(el){ el.remove(); } };
  return new HTMLRewriter()
    .on('meta[property="og:image"], meta[property="og:image:width"], meta[property="og:image:height"], meta[property="og:image:type"], meta[name="twitter:image"], meta[name="twitter:card"]', drop)
    // 영어 링크는 페이지의 한국어 제목·설명 대신 영어 제목
    .on('meta[property="og:title"], meta[name="twitter:title"]', { element(el){ if (en) el.setAttribute('content', title); if (el.getAttribute('property') === 'og:title') hasTitle = true; } })
    .on('meta[property="og:description"], meta[name="twitter:description"]', { element(el){ if (en) el.setAttribute('content', te + ' · Happy Home Care'); } })
    .on('meta[property="og:site_name"]', { element(){ hasSite = true; } })
    .on('head', { element(el){ el.onEndTag(function(end){
        end.before((hasTitle ? '' : `<meta property="og:title" content="${title}">`) +
                   (hasSite ? '' : '<meta property="og:site_name" content="Happy Home Care">') +
                   `<meta property="og:image" content="${src}"><meta property="og:image:width" content="${W}"><meta property="og:image:height" content="${H}">` +
                   `<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${src}">`, { html: true });
      }); } })
    .transform(res);
}


// ─────────────────────────────────────────────────────────────────────────────
// ⚡ 화면 파일 「바뀐 것만 다시 받기」 (2026-11-21)
//  Cloudflare 가 HTML 을 압축하면서 ETag(파일 지문)를 지워 버려, 관리자 앱·전자명함 화면을 열 때마다
//  파일 전체(인보이스 188KB·점검보고서 223KB 등)를 매번 새로 받고 있었습니다.
//  → HTML 응답에 약한 ETag(W/"…")를 붙이고, 브라우저가 가진 지문과 같으면 「안 바뀜(304)」만 돌려줍니다.
//  · 파일이 바뀌면 지문도 바뀌므로 올리자마자 새 화면이 그대로 반영됩니다(no-cache 규칙 유지).
//  · 화면 내용·자료(Firestore)는 전혀 건드리지 않습니다. HTML 이 아닌 응답과 오류 응답은 그대로 통과.
// ─────────────────────────────────────────────────────────────────────────────
async function withEtag(request, res, rehash){
  try{
    const type = res.headers.get('content-type') || '';
    if (res.status !== 200 || type.indexOf('text/html') < 0) return res;
    let tag = rehash ? '' : (res.headers.get('etag') || '').replace(/^W\//, '');
    let body = null;
    if (!tag){
      body = await res.arrayBuffer();
      const d = new Uint8Array(await crypto.subtle.digest('SHA-1', body));
      tag = '"' + Array.from(d, b => b.toString(16).padStart(2, '0')).join('') + '"';
    }
    const hdr = new Headers(res.headers);
    hdr.set('etag', 'W/' + tag);
    const inm = request.headers.get('if-none-match') || '';
    if (inm && inm.split(',').some(t => t.trim().replace(/^W\//, '') === tag)){
      hdr.delete('content-length'); hdr.delete('content-encoding');
      return new Response(null, { status: 304, headers: hdr });
    }
    return new Response(body !== null ? body : res.body, { status: res.status, statusText: res.statusText, headers: hdr });
  }catch(_){ return res; }
}

export async function onRequest(context){
  const { request } = context;
  if (request.method !== 'GET') return context.next();
  const url = new URL(request.url);
  const m = /^\/([a-z-]+?)(\.html)?$/.exec(url.pathname);
  const key = m && m[1];
  // 문서 화면: 주소에 ?…가 없을 때(관리자 앱이 여는 인보이스·계약 화면)만 지문을 붙입니다 — 고객 링크는 그대로
  if (key && DOC[key]){ const r = await docPreview(context, url, key); return url.search ? r : withEtag(request, r, true); }
  if (!key || !EN[key] || url.searchParams.get('lang') !== 'en') return withEtag(request, await context.next(), false);

  const res = await context.next();
  const type = res.headers.get('content-type') || '';
  if (!res.ok || type.indexOf('text/html') < 0) return res;
  const [img, title, desc] = EN[key];
  const set = (v) => ({ element(el){ el.setAttribute('content', v); } });
  return new HTMLRewriter()
    .on('title', { element(el){ el.setInnerContent(title); } })
    .on('meta[property="og:title"], meta[name="twitter:title"]', set(title))
    .on('meta[property="og:description"], meta[name="twitter:description"]', set(desc))
    .on('meta[property="og:image"], meta[name="twitter:image"]', set(`${SITE}/${img}`))
    .on('meta[property="og:image:width"]', set('1200'))
    .on('meta[property="og:image:height"]', set('630'))
    .on('meta[property="og:locale"]', set('en_US'))
    .transform(res);
}
