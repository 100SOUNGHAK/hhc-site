/* ─────────────────────────────────────────────────────────────
   🅿️ 해피포인트 큰 카드 공통 (2026-11-26)
   이벤트 안내장(event.html) · 홈페이지(home.html) · 전자명함(namecard.html) 이 함께 쓴다.
   · 소개 보상 금액·켜기/끄기는 관리자 고객관리 「🤝 추천 보상 → 금액 설정」을 따른다 (/api/refcfg)
   · 추천 보상을 끄면 「결제할 때마다 1% 자동 적립」 카드로 바뀐다
   · 모양(CSS)은 각 화면의 e3hp 블록에 있다
   ───────────────────────────────────────────────────────────── */
(function(){
  if(window.HHCHP)return;
  var C={on:true,pts:10,newOn:true,newPts:5},waits=[],started=false;
  try{var s=JSON.parse(localStorage.getItem('hhc_refcfg')||'null');if(s&&typeof s.pts==='number')C=s;}catch(e){}
  function rm(n){n=Math.round((+n||0)*100)/100;return 'RM '+(n%1?n.toFixed(2):n);}
  function card(ko,href){
    var ref=C.on&&C.pts>0,nw=ref&&C.newOn&&C.newPts>0;
    var h=ref?(ko?'친구 소개하면<br><em>'+rm(C.pts)+'</em> 적립':'Refer a friend,<br>get <em>'+rm(C.pts)+'</em>')
             :(ko?'결제할 때마다<br><em>1%</em> 자동 적립':'Earn <em>1%</em> back<br>on every bill');
    var s=ref?(nw?(ko?'소개받은 분도 <b>'+rm(C.newPts)+'</b> 적립 · 신규 고객':'Your friend gets <b>'+rm(C.newPts)+'</b> too · new customers')
                  :(ko?'소개받은 분의 결제가 끝나면 적립돼요':'Added once your friend has paid'))
             :(ko?'가입 없이 누구나 · 현금처럼 사용':'No sign-up · use it like cash');
    return '<div class="e3hp"><div class="e3hp-top"><span class="e3hp-coin"><i></i></span><span>'+
      '<span class="e3hp-tg">'+(ko?'해피포인트':'HAPPY POINTS')+'</span>'+
      '<b class="e3hp-h">'+h+'</b><span class="e3hp-s">'+s+'</span></span></div>'+
      '<div class="e3hp-rw">'+
        '<div><i>💳</i><b>'+(ko?'결제마다 1%':'1% back')+'</b><span>'+(ko?'자동 적립':'on every bill')+'</span></div>'+
        '<div><i>✋</i><b>'+(ko?'가입 없이':'No sign-up')+'</b><span>'+(ko?'누구나':'for everyone')+'</span></div>'+
        '<div><i>💵</i><b>'+(ko?'현금처럼':'Like cash')+'</b><span>'+(ko?'RM 10부터 사용':'from RM 10')+'</span></div>'+
      '</div>'+
      '<a class="e3hp-go" href="'+href+'">'+(ko?'해피포인트 자세히 보기 ›':'How Happy Points work ›')+'</a>'+
      (ref?'<span class="e3hp-nt">'+(ko?'소개 보상은 소개받은 분의 결제 완료 후 적립됩니다':'Referral rewards are added after your friend’s payment')+'</span>':'')+
    '</div>';
  }
  /* 관리자 설정 읽기 — 값이 바뀌었을 때만 화면을 다시 그리도록 cb 를 부른다 */
  function load(cb){
    if(cb)waits.push(cb);
    if(started)return;started=true;
    try{fetch('/api/refcfg').then(function(r){return r.ok?r.json():null;}).then(function(j){
      if(!j||!j.ok)return;
      var n={on:j.on!==false,pts:+j.pts||0,newOn:j.newOn!==false,newPts:+j.newPts||0};
      var changed=JSON.stringify(n)!==JSON.stringify(C);C=n;
      try{localStorage.setItem('hhc_refcfg',JSON.stringify(n));}catch(e){}
      if(changed)waits.forEach(function(f){try{f();}catch(e){}});
    }).catch(function(){});}catch(e){}
  }
  window.HHCHP={card:card,load:load,cfg:function(){return C;}};
})();
