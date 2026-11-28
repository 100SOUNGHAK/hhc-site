/* ─────────────────────────────────────────────────────────────
   🅿️ 해피포인트 큰 카드 공통 (2026-11-26)
   이벤트 안내장(event.html) · 홈페이지(home.html) · 전자명함(namecard.html) 이 함께 쓴다.
   · 소개 보상 금액·켜기/끄기는 관리자 고객관리 「🤝 추천 보상 → 금액 설정」을 따른다 (/api/refcfg)
   · 추천 보상을 끄면 「결제할 때마다 1% 자동 적립」 카드로 바뀐다
   · 모양(CSS)은 각 화면의 e3hp 블록에 있다
   · 2026-11-28 : 카드 맨 아래 「📖 N가지 한눈에 보기」 → 통합 안내장 /hp-guide
   · 2026-11-27 : 「해피포인트 모으는 3가지 방법」 카드로 바꿈 — ① 결제마다 1%(/points) ② 친구 소개(/refer) ③ 리뷰 쓰기(/review), 꺼진 이벤트는 빠짐
   ───────────────────────────────────────────────────────────── */
(function(){
  if(window.HHCHP)return;
  var C={on:true,pts:10,newOn:true,newPts:5},waits=[],started=false;
  try{var s=JSON.parse(localStorage.getItem('hhc_refcfg')||'null');if(s&&typeof s.pts==='number')C=s;}catch(e){}
  function rm(n){n=Math.round((+n||0)*100)/100;return 'RM '+(n%1?n.toFixed(2):n);}
  /* ⭐ 리뷰 이벤트 줄 (2026-11-27) — 금액 · 켜기는 고객관리 「⭐ 리뷰 보상 → 금액 설정」(/api/refcfg revOn · revPts) */
  var R={on:true,pts:10};
  try{var rs=JSON.parse(localStorage.getItem('hhc_revcfg')||'null');if(rs&&typeof rs.pts==='number')R=rs;}catch(e){}
  /* ── 🅿️ 해피포인트 모으는 3가지 방법 카드 (2026-11-27) — e3p3 접두사 ─────────────────────
     ① 결제할 때마다 1% (자동) ② 친구 소개 (이벤트) ③ 리뷰 쓰기 (이벤트) — 켜진 것만 보이고 금액은 관리자 설정을 따른다.
     모양은 이 파일이 스스로 넣는다(화면마다 따로 고치지 않음). 폭이 좁은 곳(휴대폰 · 이벤트 안내장)은 한 줄 카드로 쌓인다. */
  (function(){try{if(document.getElementById('e3p3-css'))return;var st=document.createElement('style');st.id='e3p3-css';
    st.textContent=[
    '.e3p3{container-type:inline-size;position:relative;overflow:hidden;border-radius:20px;padding:18px;color:#241b03;text-align:left;',
    ' background:radial-gradient(120% 90% at 100% 0%,rgba(255,255,255,.75),rgba(255,255,255,0) 55%),linear-gradient(150deg,#fdf6e3,#f6e8bc 45%,#e9cf8e);',
    ' box-shadow:inset 0 1px 0 #fff,0 2px 4px rgba(143,111,40,.18),0 22px 40px -22px rgba(143,111,40,.85),0 3px 0 #b08d3a}',
    '.e3p3 *{box-sizing:border-box}',
    '.e3p3-hd{display:flex;align-items:center;gap:12px;flex-wrap:wrap}',
    '.e3p3-coin{flex:none;width:46px;height:46px;perspective:300px}',
    '.e3p3-coin>i{display:grid;place-items:center;width:100%;height:100%;border-radius:50%;font-style:normal;font-size:22px;font-weight:900;color:#fff;',
    ' background:radial-gradient(circle at 35% 30%,#7fe0d2,#14958a 45%,#0b5f59);box-shadow:inset 0 0 0 3px rgba(255,255,255,.35),0 4px 0 #073f3b,0 10px 16px -6px rgba(7,63,59,.7);animation:e3p3spin 5s ease-in-out infinite}',
    '@keyframes e3p3spin{0%,100%{transform:rotateY(-25deg)}50%{transform:rotateY(25deg)}}',
    '.e3p3-tt{flex:1;min-width:180px}.e3p3-tt small{display:inline-block;font-size:11px;font-weight:900;letter-spacing:.04em;color:#fff;background:#0b5f59;border-radius:999px;padding:3px 10px}',
    '.e3p3-tt b{display:block;margin-top:5px;font-size:20px;font-weight:900;letter-spacing:-.04em;line-height:1.25;color:#1b1503}.e3p3-tt b em{font-style:normal;color:#0b5f59}',
    '.e3p3-ck{display:flex;gap:5px;flex-wrap:wrap}.e3p3-ck span{font-size:11.5px;font-weight:800;color:#5a4614;background:rgba(255,255,255,.7);border-radius:999px;padding:4px 9px;box-shadow:inset 0 1px 0 #fff}',
    '.e3p3-g{display:grid;grid-template-columns:repeat(var(--n,3),minmax(0,1fr));gap:10px;margin-top:14px}',
    '.e3p3-c{position:relative;display:flex;flex-direction:column;gap:3px;padding:14px 14px 12px;border-radius:16px;text-decoration:none;color:inherit;',
    ' background:rgba(255,255,255,.78);box-shadow:inset 0 1px 0 #fff,0 2px 0 rgba(143,111,40,.35),0 12px 20px -14px rgba(143,111,40,.9);transition:transform .15s,background .15s}',
    '.e3p3-c:hover{transform:translateY(-3px);background:#fff}.e3p3-c:active{transform:translateY(1px)}',
    '.e3p3-c .ic{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;font-size:20px;background:linear-gradient(150deg,#fff,#fbf5e6);box-shadow:inset 0 0 0 1px rgba(201,164,76,.35),0 6px 10px -6px rgba(143,111,40,.6)}',
    '.e3p3-c .tg{position:absolute;top:12px;right:12px;font-size:10.5px;font-weight:900;border-radius:999px;padding:2px 8px;color:#0b5f59;background:#e1f3ef}',
    '.e3p3-c .tg.ev{color:#7a5a10;background:#fbecc4}',
    '.e3p3-c .lb{margin-top:8px;font-size:12.5px;font-weight:800;color:#6b5520}',
    '.e3p3-c .v{font-size:30px;line-height:1.05;font-weight:900;letter-spacing:-.04em;color:#0b5f59;font-variant-numeric:tabular-nums}.e3p3-c .v small{font-size:14px;margin-right:2px}',
    '.e3p3-c .t{font-size:13.5px;font-weight:900;color:#1b1503}.e3p3-c .d{font-size:11.5px;font-weight:600;line-height:1.45;color:#6b5520}',
    '.e3p3-c .go{margin-top:8px;align-self:flex-start;font-size:12px;font-weight:900;color:#fff;background:#0b5f59;border-radius:999px;padding:6px 12px;box-shadow:0 3px 0 #073f3b}',
    '.e3p3-c.ev .go{background:#173a5e;box-shadow:0 3px 0 #08172b}',
    '.e3p3-ex{display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;margin-top:12px;padding:10px 12px;border-radius:14px;font-size:12.5px;font-weight:700;color:#5a4614;background:rgba(255,255,255,.55);border:1px dashed rgba(143,111,40,.45)}',
    '.e3p3-ex b{color:#1b1503;font-weight:900}.e3p3-ex .eq{font-size:15px;color:#0b5f59;font-weight:900}',
    '.e3p3-all{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding:13px 16px;border-radius:14px;text-decoration:none;font-size:14.5px;font-weight:900;letter-spacing:-.02em;color:#fff;background:#0f2540;box-shadow:0 3px 0 #08172b,0 0 0 3px rgba(20,149,138,.45);transition:transform .15s}',
    '.e3p3-all b{color:#e3c98a;font-size:20px;line-height:1}.e3p3-all:hover{transform:translateY(-2px)}.e3p3-all:active{transform:translateY(1px)}',
    '@container (max-width:560px){',
    ' .e3p3-g{grid-template-columns:1fr;gap:8px}',
    ' .e3p3-c{display:grid;grid-template-columns:40px 1fr auto;column-gap:12px;align-items:center;padding:12px}',
    ' .e3p3-c .ic{grid-row:1/4}.e3p3-c .tg{position:static;grid-column:3;grid-row:1;justify-self:end}',
    ' .e3p3-c .lb{margin:0;grid-column:2;grid-row:1}.e3p3-c .v{grid-column:2;grid-row:2;font-size:24px}.e3p3-c .t{grid-column:3;grid-row:2;justify-self:end;font-size:12.5px;text-align:right}',
    ' .e3p3-c .d{grid-column:2;grid-row:3}.e3p3-c .go{grid-column:3;grid-row:3;justify-self:end;align-self:center;margin:0;padding:4px 10px;font-size:11px;box-shadow:0 2px 0 #073f3b;white-space:nowrap}',
    ' .e3p3-c.ev .go{box-shadow:0 2px 0 #08172b}',
    ' .e3p3-tt b{font-size:18px}}',
    '@media (prefers-reduced-motion:reduce){.e3p3-coin>i{animation:none}.e3p3-c,.e3p3-all{transition:none}}'
    ].join('');
    (document.head||document.documentElement).appendChild(st);}catch(e){}})();
  function card(ko,href){
    var ref=C.on&&C.pts>0,nw=ref&&C.newOn&&C.newPts>0,rv=R.on&&R.pts>0;
    var H=String(href),hPt=H,hRf=H.replace(/points(\.html)?/,'refer'),hRv=H.replace(/points(\.html)?/,'review'),hGd=H.replace(/points(\.html)?/,'hp-guide');
    function tile(cls,ic,tg,lb,v,t,d,go,h){
      return '<a class="e3p3-c'+cls+'" href="'+h+'"><span class="ic" aria-hidden="true">'+ic+'</span><span class="tg'+(cls?' ev':'')+'">'+tg+'</span>'+
        '<span class="lb">'+lb+'</span><span class="v">'+v+'</span><span class="t">'+t+'</span><span class="d">'+d+'</span><span class="go">'+go+' ›</span></a>';}
    var V=function(n){return '<small>RM</small>'+String(rm(n)).replace('RM ','');};
    var tiles=[tile('', '💳',ko?'자동':'AUTO',ko?'결제할 때마다':'Every payment','1%',ko?'자동 적립':'added automatically',ko?'가입 · 신청 없이 결제만 하면 쌓여요':'No sign-up — just pay as usual',ko?'자세히 보기':'How it works',hPt)];
    if(ref)tiles.push(tile(' ev','🤝',ko?'이벤트':'EVENT',ko?'친구 소개':'Refer a friend',V(C.pts),nw?(ko?'친구도 '+rm(C.newPts):'friend gets '+rm(C.newPts)):(ko?'소개할 때마다':'per referral'),ko?'신규 고객 첫 결제 후 적립':'After a new customer’s first payment',ko?'친구 소개':'Refer now',hRf));
    if(rv)tiles.push(tile(' ev','⭐',ko?'이벤트':'EVENT',ko?'리뷰 쓰기':'Write a review',V(R.pts),ko?'서비스마다 1회':'once per service',ko?'별점 + 한 줄 · 확인 후 적립':'Stars + one line · added once checked',ko?'리뷰 이벤트':'Review event',hRv));
    var parts=[[ko?'결제 RM 1,000':'Pay RM 1,000',10]];
    if(ref)parts.push([ko?'친구 1명':'1 friend',C.pts]);
    if(rv)parts.push([ko?'리뷰 1회':'1 review',R.pts]);
    var sum=parts.reduce(function(a,p){return a+p[1];},0);
    var ex=parts.length>1?'<div class="e3p3-ex"><span>'+(ko?'예)':'e.g.')+'</span>'+parts.map(function(p){return '<span>'+p[0]+' <b>'+rm(p[1])+'</b></span>';}).join('<span>+</span>')+
      '<span class="eq">= '+rm(sum)+'</span><span>'+(ko?'다음 결제에서 차감':'off your next bill')+'</span></div>':'';
    return '<div class="e3p3"><div class="e3p3-hd"><span class="e3p3-coin" aria-hidden="true"><i>P</i></span>'+
      '<div class="e3p3-tt"><small>'+(ko?'해피포인트':'HAPPY POINTS')+'</small><b>'+(ko?'해피포인트 <em>모으는 '+tiles.length+'가지 방법</em>':'<em>'+tiles.length+' ways</em> to collect Happy Points')+'</b></div>'+
      '<div class="e3p3-ck"><span>💵 '+(ko?'현금처럼 사용':'Use like cash')+'</span><span>♾️ '+(ko?'유효기간 없음':'No expiry')+'</span><span>🎯 '+(ko?'RM 10부터 사용':'From RM 10')+'</span></div></div>'+
      '<div class="e3p3-g" style="--n:'+tiles.length+'">'+tiles.join('')+'</div>'+ex+
      /* 📖 통합 안내장 /hp-guide (2026-11-28) */
      '<a class="e3p3-all" href="'+hGd+'"><span>📖 '+(ko?tiles.length+'가지 한눈에 보기':'See all '+tiles.length+' ways')+'</span><b aria-hidden="true">›</b></a></div>';
  }
  /* 관리자 설정 읽기 — 값이 바뀌었을 때만 화면을 다시 그리도록 cb 를 부른다 */
  function load(cb){
    if(cb)waits.push(cb);
    if(started)return;started=true;
    try{fetch('/api/refcfg').then(function(r){return r.ok?r.json():null;}).then(function(j){
      if(!j||!j.ok)return;
      var n={on:j.on!==false,pts:+j.pts||0,newOn:j.newOn!==false,newPts:+j.newPts||0};
      var changed=JSON.stringify(n)!==JSON.stringify(C);C=n;
      if(typeof j.revPts==='number'){var r2={on:j.revOn!==false,pts:j.revPts};if(JSON.stringify(r2)!==JSON.stringify(R))changed=true;R=r2;try{localStorage.setItem('hhc_revcfg',JSON.stringify(r2));}catch(e){}}
      try{localStorage.setItem('hhc_refcfg',JSON.stringify(n));}catch(e){}
      if(changed)waits.forEach(function(f){try{f();}catch(e){}});
    }).catch(function(){});}catch(e){}
  }
  window.HHCHP={card:card,load:load,cfg:function(){return C;}};
})();
