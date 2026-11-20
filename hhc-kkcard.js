/* ─────────────────────────────────────────────────────────────────────────────
   💛 hhc-kkcard.js — 관리자 화면 공통 「카카오톡 그림 카드」 발송 도우미 (2026-11-20)

   사용: await hhcKkCard({ msg, img, btn, en, title?, desc?, url? })
     · msg   : 왓츠앱과 같은 전체 안내 문구 (*굵은 글씨* 포함 가능)
     · img   : 카드 위 그림 파일 이름 (예: 'og-booking.jpg') — 1200×630
     · btn   : 카드 버튼 이름 (예: '날짜 고르기') — 14자 이내 권장
     · title / desc / url 을 생략하면 msg 에서 자동으로 뽑습니다
         제목 = 첫 *굵은 글씨* 줄 · 설명 = 그 아래 안내 줄(주소·서명 제외) · 주소 = 첫 「👉 https://…」
     · copy:false 이면 문구를 복사하지 않습니다 (화면이 클립보드를 따로 쓰는 경우)
     · 주소가 두 개 이상이면 두 번째 주소는 카드의 두 번째 버튼이 됩니다 (그 줄 앞 글자가 버튼 이름)

   동작: ① 전체 문구(굵은 글씨 표시 제거)를 먼저 복사 ② 카카오 공유창을 그림 카드로 엶
         카드를 열 수 없으면(키 없음·SDK 실패) 복사만 하고 false 를 돌려줍니다 → 예전과 같은 결과
   카카오 키: 기기에 저장된 hhc_kakao_key(고객관리와 같은 값) → 없으면 한 번 입력
   이 파일은 이것만 합니다. 각 화면의 다른 동작에는 영향이 없습니다.
   ───────────────────────────────────────────────────────────────────────────── */
(function(){
  if (window.hhcKkCard) return;
  var SITE = 'https://happyhomecare.com.my';
  var SDKS = ['https://t1.kakaocdn.net/kakao_js_sdk/2.7.5/kakao.min.js',
              'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js',
              'https://developers.kakao.com/sdk/js/kakao.js'];

  // 관리자 허브(iframe) 안이면 최상위 창에서 공유 — iframe 이 kakaolink:// 로 바뀌어 빈 화면이 되는 것을 막음
  function win(){ try{ if(window.top && window.top!==window && window.top.location.origin===location.origin) return window.top; }catch(_){} return window; }
  function load(){
    var W = win(); if (W.Kakao) return Promise.resolve(W.Kakao); if (W.__hhcKkLoad) return W.__hhcKkLoad;
    W.__hhcKkLoad = new Promise(function(res, rej){ var i = 0; (function next(){
      if (i >= SDKS.length){ W.__hhcKkLoad = null; rej(new Error('sdk')); return; }
      var sc = W.document.createElement('script'); sc.src = SDKS[i++]; sc.async = true;
      sc.onload = function(){ W.Kakao ? res(W.Kakao) : next(); };
      sc.onerror = function(){ try{ sc.remove(); }catch(_){} next(); };
      W.document.head.appendChild(sc); })(); });
    return W.__hhcKkLoad;
  }
  function getKey(){
    var k = ''; try{ k = localStorage.getItem('hhc_kakao_key') || ''; }catch(_){}
    if (k) return k;
    var v = prompt('카카오 JavaScript 키를 입력하세요.\n\ndevelopers.kakao.com → 내 애플리케이션 → 앱 키 → JavaScript 키\n(처음 한 번만 입력하면 계속 사용됩니다 · 고객관리에 등록한 키와 같습니다)', '');
    k = String(v || '').trim(); if (k){ try{ localStorage.setItem('hhc_kakao_key', k); }catch(_){} }
    return k;
  }
  function plain(s){ return String(s || '').replace(/\*([^*\n]+)\*/g, '$1'); }
  // 앞쪽 그림문자·기호 떼기 (제목·설명·버튼용)
  function trimLead(s){ return String(s || '').replace(/^[\s -⯿☀-➿️‍\u{1F000}-\u{1FAFF}·•:\-–—]+/u, '').trim(); }
  function cut(s, n){ var a = Array.from(String(s || '')); return a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join(''); }

  // 제목 = 첫 *굵은 글씨* 줄(없으면 인사 다음 첫 줄) · 설명 = 그 아래 안내 줄(주소·서명 제외, 들여쓴 줄은 앞 줄에 이어 붙임)
  function parse(msg){
    var L = String(msg || '').split('\n'), links = [], reLink = /^(.*?)\s*\u{1F449}\s*(https?:\/\/\S+)\s*$/u;
    L.forEach(function(x){ var m = reLink.exec(x.trim()); if (m) links.push({ label: trimLead(plain(m[1])), url: m[2] }); });
    var ti = -1;
    for (var i = 0; i < L.length; i++){ if (/\*[^*\n]{2,}\*/.test(L[i])){ ti = i; break; } }
    if (ti < 0){ for (var j = 1; j < L.length; j++){ if (trimLead(plain(L[j])) && !/https?:\/\//.test(L[j])){ ti = j; break; } } }
    var title = ti >= 0 ? trimLead(plain(L[ti])).replace(/\s+/g, ' ') : '', desc = '';
    L.slice(ti + 1).forEach(function(x){
      var y = trimLead(plain(x)).replace(/\s+/g, ' ');
      if (!y || /https?:\/\//.test(x) || /2774/.test(x) || /^Happy Home Care$/i.test(y)) return;
      desc += desc ? ((/^\s{3,}\S/.test(x) ? ' ' : ' · ') + y) : y;
    });
    return { title: title, desc: desc, links: links };
  }

  window.hhcKkCard = async function(o){
    o = o || {};
    var msg = String(o.msg || ''), en = !!o.en;
    if (o.copy !== false){ try{ await navigator.clipboard.writeText(plain(msg)); }catch(_){} }
    var p = parse(msg);
    var url = o.url || (p.links[0] && p.links[0].url) || '';
    if (!url) return false;
    var key = getKey(); if (!key) return false;
    var K; try{ K = await load(); }catch(_){ return false; }
    try{ if (!K.isInitialized()) K.init(key); }catch(_){ try{ localStorage.removeItem('hhc_kakao_key'); }catch(__){} return false; }
    var share = K.Share || K.Link; if (!share || !share.sendDefault) return false;
    var lk = { mobileWebUrl: url, webUrl: url };
    var btns = [{ title: cut(o.btn || (en ? 'Open' : '열기'), 14), link: lk }];
    var two = p.links.filter(function(l){ return l.url !== url; })[0];
    if (two && o.btn2 !== false) btns.push({ title: cut(o.btn2 || two.label || (en ? 'More' : '자세히'), 14), link: { mobileWebUrl: two.url, webUrl: two.url } });
    var img = o.img ? (/^https?:/.test(o.img) ? o.img : SITE + '/' + String(o.img).replace(/^\//, '')) : SITE + '/og-my.jpg';
    try{
      share.sendDefault({ objectType: 'feed',
        content: { title: cut(o.title || p.title || 'Happy Home Care', 60), description: cut(o.desc != null ? o.desc : p.desc, 90),
                   imageUrl: img, imageWidth: 1200, imageHeight: 630, link: lk },
        buttons: btns });
      return true;
    }catch(_){ return false; }
  };
  window.hhcKkParse = parse;   // 시험용
})();
