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
  'guides':    ['og-guides-en.jpg',    'Our service process in photos | Happy Home Care', 'Air-con · washer · dryer · sofa · mattress · curtains'],
  'ac-guides': ['og-ac-guides-en.jpg', 'Air-con: good to know | Happy Home Care', 'Causes & fixes by symptom · before you book'],
  'smart':     ['og-smart-en.jpg',     'Smart ways to save | Happy Home Care', 'Membership bonus credit · E-voucher 10% off'],
  'prices':    ['og-prices-en.jpg',    'Prices by service | Happy Home Care', 'Air-con · washer · sofa · mattress · curtain prices at a glance'],
  'fees':      ['og-fees-en.jpg',      'Extra charges | Happy Home Care', 'Minimum charge · parking · booking deposit'],
  'visit-fee': ['og-visitfee-en.jpg',  'On-site check fee | Happy Home Care', 'Enter your address to see your on-site check fee'],
  'calc':      ['og-calc-en.jpg',      'Quick price calculator | Happy Home Care', 'Pick your items and see the estimate instantly'],
  'moveout':   ['og-moveout-en.jpg',   'Moving out — 2 services you need | Happy Home Care', 'Air-con · curtains before you hand over the keys'],
};

export async function onRequest(context){
  const { request } = context;
  if (request.method !== 'GET') return context.next();
  const url = new URL(request.url);
  const m = /^\/([a-z-]+?)(\.html)?$/.exec(url.pathname);
  const key = m && m[1];
  if (!key || !EN[key] || url.searchParams.get('lang') !== 'en') return context.next();

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
