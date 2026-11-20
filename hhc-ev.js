/* ══════════════════════════════════════════════════════════════
   🎉 패키지 신규가입 무상적립 이벤트 설정 (공용) — 2026-11-20
   · 관리자 「월별 프로모션 → 상시 혜택 → 패키지 신규가입 시 무상적립금(pkg10)」에서
       「고객에게 보이기」 켜기/끄기 = 이벤트 진행/종료,  「무상적립 이벤트 배수」 = 1.5 · 2 · 2.5 · 3배
     를 고르면 아래 화면들이 그 값을 따릅니다.
       membership.html · home.html · namecard.html · smart.html · joint.html · customer-admin.html(발송 문구)
   · 쓰는 법: <head> 에서 <script src="/hhc-ev.js"></script> 를 먼저 불러 둡니다.
       window.PK_EVENT  = 지난번에 받아 둔 값(휴대폰에 저장) — 화면이 처음 그릴 때 바로 씀
       HHCEv.get()      = {on, mult, tag?}  지금 값
       HHCEv.on(fn)     = 새 값을 받아 왔고 달라졌으면 fn(값) — 화면을 다시 그리면 됨
   · 설정을 못 읽으면(인터넷 끊김 등) 2배 진행으로 봅니다.
   ══════════════════════════════════════════════════════════════ */
(function(){
  if(window.HHCEv)return;
  var KEY='hhc_pkev_v1',DEF={on:true,mult:2},cur=null,fns=[];
  try{var c=JSON.parse(localStorage.getItem(KEY)||'null');if(c&&typeof c.on==='boolean'&&+c.mult>1)cur=c;}catch(e){}
  window.PK_EVENT=cur?JSON.parse(JSON.stringify(cur)):{};
  function get(){var o={on:DEF.on,mult:DEF.mult},p=window.PK_EVENT||{};if(typeof p.on==='boolean')o.on=p.on;if(+p.mult>1)o.mult=+p.mult;if(p.tag)o.tag=p.tag.slice();return o;}
  window.HHCEv={get:get,on:function(fn){if(typeof fn==='function')fns.push(fn);}};
  function fsVal(v){if(!v)return null;
    if('stringValue' in v)return v.stringValue;if('integerValue' in v)return +v.integerValue;if('doubleValue' in v)return v.doubleValue;
    if('booleanValue' in v)return v.booleanValue;if('arrayValue' in v)return (v.arrayValue.values||[]).map(fsVal);
    if('mapValue' in v){var o={},f=v.mapValue.fields||{};for(var k in f)o[k]=fsVal(f[k]);return o;}return null;}
  try{
    fetch('https://firestore.googleapis.com/v1/projects/happywork-packageplan/databases/(default)/documents/promos/_always?key=AIzaSyAxAaB-CtySH2_ZHJKidwjbhn8ava6rM00',{cache:'no-store'})
    .then(function(r){return r.ok?r.json():null;}).then(function(j){
      if(!j||!j.fields)return;
      var d=fsVal({mapValue:{fields:j.fields}}),it=(d.items||[]).filter(function(a){return a&&a.id==='pkg10';})[0];
      if(!it)return;
      var m=+it.mult,v={on:it.on!==false,mult:(m>1&&m<=5)?m:2},a=String(it.rb_ko||'').trim(),b=String(it.rb_en||'').trim();
      if(a||b)v.tag=[a||b,b||a];
      var before=JSON.stringify(cur?{on:cur.on,mult:+cur.mult,tag:cur.tag}:{on:DEF.on,mult:DEF.mult,tag:v.tag});
      try{localStorage.setItem(KEY,JSON.stringify(v));}catch(e){}
      window.PK_EVENT=v;cur=v;
      if(JSON.stringify({on:v.on,mult:v.mult,tag:v.tag})===before)return;
      fns.forEach(function(fn){try{fn(get());}catch(e){if(window.console)console.warn('hhc-ev',e);}});
    }).catch(function(){});
  }catch(e){}
})();
