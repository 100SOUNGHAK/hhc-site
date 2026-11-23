/* ─────────────────────────────────────────────────────────────
   해피홈케어 복사 방지 + 워터마크 (2026-11-24)
   홈페이지 · 전자명함 · 각종 안내장 · 3D 영상 화면 공통.

   막는 것 : 글자 선택·복사, 사진·영상 길게 눌러 저장, 링크 길게 눌러
            「주소 복사」, 우클릭 메뉴, 끌어다 놓기, Ctrl+C/S/U/P/A,
            개발자 도구 단축키, 영상 다운로드 버튼, 인쇄
   허용하는 것 : 입력칸(주소·전화번호 입력 등), 화면 안 「복사」 버튼
            (보내기·계좌 복사 등 기존 기능은 그대로 작동)
   주인 화면(전자명함 ?me=1)에서는 아무것도 막지 않는다.

   워터마크 : 「Happy Home Care · 해피홈케어」를 화면 전체에 흐리게.
            주소에 ?name= 또는 ?n= 이 있으면 그 이름도 함께 넣는다.
   끄기 : 페이지에서 이 파일을 부르는 <script> 줄을 지우면 원래대로.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.__hhcProtect) return;
  window.__hhcProtect = 1;

  var q;
  try { q = new URLSearchParams(location.search); } catch (e) { q = { get: function () { return null; } }; }

  /* 주인(관리자) 화면은 보호하지 않는다 — 전자명함 보내기 버튼 등이 필요하므로 */
  try {
    var me = q.get('me');
    if (me === '0' || location.hash === '#c') { /* 고객 화면 강제 */ }
    else if (me === '1' || location.hash === '#me' || localStorage.getItem('hhc-namecard-owner') === '1') return;
  } catch (e) {}

  var OK = 'input,textarea,select,[contenteditable=""],[contenteditable="true"],[data-copy-ok]';
  function okEl(el) {
    try { return !!(el && el.closest && el.closest(OK)); } catch (e) { return false; }
  }
  /* 화면 안 「복사」 버튼은 숨은 입력칸을 만들어 복사하므로, 그때는 막지 않는다 */
  function okActive() {
    var a = document.activeElement;
    return !!(a && /^(INPUT|TEXTAREA)$/.test(a.tagName));
  }
  function stop(e) { e.preventDefault(); e.stopPropagation(); return false; }

  /* ── 1) 화면 규칙 ── */
  var css =
    'html,body{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important}' +
    '*{-webkit-touch-callout:none!important}' +
    'img,video,canvas,svg,a{-webkit-user-drag:none!important;user-drag:none!important}' +
    'input,textarea,select,[contenteditable=""],[contenteditable="true"],[data-copy-ok],[data-copy-ok] *{-webkit-user-select:text!important;user-select:text!important;-webkit-touch-callout:default!important}' +
    'video::-internal-media-controls-download-button{display:none!important}' +
    'video::-webkit-media-controls-enclosure{overflow:hidden}' +
    '#hhc-wm{position:fixed;inset:0;z-index:2147483000;pointer-events:none;background-repeat:repeat;background-size:300px 190px;opacity:1}' +
    '@media print{body>*{display:none!important}body::after{content:"Happy Home Care · happyhomecare.com.my";display:block;padding:40px;font:16px sans-serif;color:#0f2540}}';
  var st = document.createElement('style');
  st.id = 'hhc-protect-css';
  st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  /* ── 2) 동작 막기 ── */
  var D = document;
  D.addEventListener('contextmenu', function (e) { if (!okEl(e.target)) return stop(e); }, true);
  D.addEventListener('dragstart', function (e) { if (!okEl(e.target)) return stop(e); }, true);
  D.addEventListener('selectstart', function (e) { if (!okEl(e.target)) return stop(e); }, true);
  ['copy', 'cut'].forEach(function (t) {
    D.addEventListener(t, function (e) { if (!okEl(e.target) && !okActive()) return stop(e); }, true);
  });
  D.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase();
    if (k === 'f12') return stop(e);
    var mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) return stop(e);   /* 개발자 도구 */
    if (k === 's' || k === 'u' || k === 'p') return stop(e);                    /* 저장·소스 보기·인쇄 */
    if ((k === 'c' || k === 'x' || k === 'a') && !okEl(e.target)) return stop(e); /* 복사·전체 선택 */
  }, true);
  window.addEventListener('beforeprint', function () { try { D.getSelection().removeAllRanges(); } catch (e) {} });

  /* ── 3) 영상 — 다운로드·작은 창 메뉴 없애기 (나중에 생기는 영상도 포함) ── */
  function lockMedia(root) {
    var list = root.querySelectorAll ? root.querySelectorAll('video,img') : [];
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      v.setAttribute('draggable', 'false');
      if (v.tagName === 'VIDEO') {
        v.setAttribute('controlslist', 'nodownload noremoteplayback noplaybackrate');
        v.setAttribute('disablepictureinpicture', '');
        v.setAttribute('disableremoteplayback', '');
        try { v.disablePictureInPicture = true; } catch (e) {}
      }
    }
  }

  /* ── 4) 워터마크 ── */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function watermark() {
    if (D.getElementById('hhc-wm')) return;
    var nm = '';
    try { nm = (q.get('name') || q.get('n') || '').trim().slice(0, 26); } catch (e) {}
    var l1 = 'Happy Home Care · 해피홈케어';
    var l2 = nm ? nm + ' 님 전용' : 'happyhomecare.com.my';
    if (nm && /^[\x00-\x7F]+$/.test(nm)) l2 = 'For ' + nm;
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="190">' +
      '<g transform="rotate(-24 150 95)" font-family="-apple-system,Segoe UI,Noto Sans KR,sans-serif" text-anchor="middle">' +
      /* 밝은 바탕용 진한 글씨 + 어두운 바탕용 흰 글씨를 겹쳐 어디서나 은은하게 보이게 */
      '<text x="150" y="92" font-size="15" font-weight="700" fill="rgba(15,37,64,.075)">' + esc(l1) + '</text>' +
      '<text x="150" y="112" font-size="11" font-weight="600" fill="rgba(15,37,64,.065)">' + esc(l2) + '</text>' +
      '<text x="151" y="93" font-size="15" font-weight="700" fill="rgba(255,255,255,.06)">' + esc(l1) + '</text>' +
      '<text x="151" y="113" font-size="11" font-weight="600" fill="rgba(255,255,255,.05)">' + esc(l2) + '</text>' +
      '</g></svg>';
    var d = D.createElement('div');
    d.id = 'hhc-wm';
    d.setAttribute('aria-hidden', 'true');
    d.style.backgroundImage = 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '")';
    D.body.appendChild(d);
  }

  function start() {
    watermark();
    lockMedia(D);
    try {
      new MutationObserver(function (ms) {
        for (var i = 0; i < ms.length; i++) {
          var a = ms[i].addedNodes;
          for (var j = 0; j < a.length; j++) {
            var n = a[j];
            if (n.nodeType !== 1) continue;
            if (n.tagName === 'VIDEO' || n.tagName === 'IMG') lockMedia(n.parentNode || D);
            else lockMedia(n);
          }
          /* 워터마크가 지워지면 다시 붙인다 */
          if (!D.getElementById('hhc-wm')) watermark();
        }
      }).observe(D.body, { childList: true, subtree: true });
    } catch (e) {}
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', start);
  else start();
})();
