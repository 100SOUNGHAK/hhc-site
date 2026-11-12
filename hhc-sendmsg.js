/* ═══════════════════════════════════════════════════════════════════════
   hhc-sendmsg.js — 고객 발송 문구 공통 원본 (한 곳에서 고치면 모두 바뀝니다)
   ───────────────────────────────────────────────────────────────────────
   쓰는 곳
     · customer-admin.html  총괄 고객관리 「📱 마이페이지 발송」 → 의뢰 접수 안내(rq) · 예약 확정 안내(bkc)
     · request-admin.html   의뢰관리 「✓ 접수완료」 발송 메시지          → HHCMsg.rq()
     · booking-admin.html   예약관리 「예약 확정」 발송 메시지           → HHCMsg.bkc()
   ⚠️ 의뢰 접수 · 예약 확정 문구를 바꿀 때는 이 파일만 고치면 세 화면에 함께 반영됩니다.
      품목명 영문 사전(ITEM_EN) · 문장 영문 사전(RP_EN) · 품목 아이콘(RQ_ICON_KW)도 여기 한 곳입니다.
   ═══════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
var BASE='https://happyhomecare.com.my';

// ══ 품목명 KO→EN 사전 · 문장 영문 변환 ══
var ITEM_EN={"기타 (직접 입력)":"Other (Custom)","천정형 (카세트)":"Ceiling Cassette","FCU · 덕트형":"FCU / Duct","기타(직접 입력)":"Other (Custom)","에어컨(가정용)":"AC (Home)","매립형 (덕트)":"Ducted (Concealed)","공기청정기 청소":"Air Purifier Clean","에어컨(매장용)":"AC (Commercial)","스팀살균세척":"Steam Sterilize Clean","전체분해세척":"Full Disassembly Clean","스팀그릴세척":"Steam Grill Clean","통돌이세탁기":"Top Load","습식살균방식":"Wet Sterilize Method","완전분해세척":"Full Disassembly Clean","카페트 세탁":"Carpet Clean","콘센트 교체":"Socket/Outlet Replacement","드럼세탁기":"Front Load (Drum)","공기청정기":"Air Purifier","기타서비스":"Other Services","벽걸이형":"Wall-mounted","기본세척":"Basic Clean","약품세척":"Chemical Clean","분해세척":"Disassembly Clean","매트리스":"Mattress","건식방식":"Dry Method","현장세탁":"On-site Wash","수거세탁":"Take-away Wash","주방후드":"Kitchen Hood","간이청소":"Quick Clean","분해청소":"Disassembly Clean","식탁의자":"Dining Chair","스팀세탁":"Steam Clean","전등교체":"Light Replacement","화학세척":"Chemical Clean","실외기":"Outdoor Unit","세탁기":"Washing Machine","I 형":"I-Shape","L 형":"L-Shape","건조기":"Dryer","냉장고":"Refrigerator","단문형":"Single Door","양문형":"Double Door","실링팬":"Ceiling Fan","카페트":"Carpet","서비스":"Service","쇼파":"Sofa","커튼":"Curtain"};
var _IEK=Object.keys(ITEM_EN).sort(function(a,b){return b.length-a.length;});
// ═══ 📝 메모장 문장 영문 변환 ═══
// 관리자가 영문(증상 English)을 적지 않은 메모라도 영문 발송 시 한국어가 그대로 나가지 않도록,
// 메모장(memo-admin) · 고객 마이페이지(my.html)와 똑같은 사전으로 변환합니다.
const RP_EN={
  '에어컨 냉방이 안됨':'air-con is not cooling','냉방이 안됨':'not cooling','냉방 안됨':'not cooling',
  '바람이 안나옴':'no air coming out','바람이 약함':'weak airflow','풍량이 약함':'weak airflow',
  '물이 샘':'water leaking','물 샘':'water leaking','물이 떨어짐':'water dripping','물떨어짐':'water dripping',
  '누수':'water leak','소음이 남':'making noise','소음':'noise','시끄러움':'noisy',
  '냄새가 남':'bad smell','냄새':'smell','곰팡이':'mould','얼음이 얼음':'icing up','결빙':'icing up',
  '리모컨':'remote control','작동 안함':'not working','작동안함':'not working','작동이 안됨':'not working',
  '전원이 안들어옴':'no power','전원':'power','실외기':'outdoor unit','실내기':'indoor unit',
  '에어컨':'air-con','세탁기':'washing machine','건조기':'dryer','냉장고':'refrigerator',
  '공기청정기':'air purifier','실링팬':'ceiling fan','주방후드':'kitchen hood',
  '필터':'filter','청소':'cleaning','세척':'cleaning','점검':'inspection','수리':'repair',
  '교체 완료':'replaced','교체':'replacement','냉매 보충':'refrigerant top-up','냉매':'refrigerant',
  '가스 충전':'gas charging','가스':'gas','충전':'charging','보충':'top-up','누설':'leak',
  '배관':'piping','드레인 배관':'drain piping','드레인':'drain','배수':'drainage','급수':'water supply',
  '탈수':'spin','팬모터':'fan motor','컴프레서':'compressor','콘덴서':'condenser',
  '기판':'PCB','캐패시터':'capacitor','센서':'sensor','온도':'temperature','습도':'humidity',
  '진동':'vibration','떨림':'shaking','차단기':'breaker','누전':'electrical leakage',
  '배선':'wiring','콘센트':'socket','전등':'light','타공':'drilling','거치대':'bracket',
  '부품 주문':'part ordered','부품':'part','재방문':'revisit','방문':'visit',
  '정상 작동':'working normally','정상':'normal','이상 없음':'no issue found','이상없음':'no issue found',
  '완료':'completed','확인':'checked','조치':'action taken','처리':'handled',
  '설치':'installation','철거':'removal','이전':'relocation','재설치':'reinstallation',
  '분해':'disassembly','조립':'reassembly','약품':'chemical','스팀':'steam','고압':'high-pressure',
  '벽걸이형':'wall-mounted','천정형':'ceiling cassette','매립형':'ducted',
  '및':'and','또는':'or','후':'after','전':'before','필요':'needed','예정':'scheduled',
  '요청':'request','고객':'customer','대기':'pending','완료됨':'completed',
  '거실':'living room','안방':'master bedroom','침실':'bedroom','작은방':'small room','방':'room',
  '주방':'kitchen','화장실':'bathroom','욕실':'bathroom','베란다':'balcony','사무실':'office',
  '매장':'shop','위층':'upstairs','아래층':'downstairs','전체':'all','일부':'some',
  '심함':'severe','약간':'slight','가끔':'intermittent','계속':'continuous','간헐적':'intermittent',
  '발생':'occurring','되지 않음':'not working','안 됨':'not working','안됨':'not working',
  '재발':'recurring','임시':'temporary','영구':'permanent','견적':'quotation','추가':'additional'
};
const _RPK=Object.keys(RP_EN).sort(function(a,b){return b.length-a.length;});
function toEn(t){
  t=String(t||'');
  if(!/[\uAC00-\uD7A3]/.test(t))return t;      // 이미 영문이면 그대로
  for(var i=0;i<_RPK.length;i++){if(t.indexOf(_RPK[i])>=0)t=t.split(_RPK[i]).join(RP_EN[_RPK[i]]);}
  t=t.replace(/(\d+)\s*\uB300(?![\uAC00-\uD7A3])/g,function(m,q){return q+(q==='1'?' unit':' units');});
  t=t.replace(/(\d+)\s*\uAC1C(?![\uAC00-\uD7A3])/g,function(m,q){return q+(q==='1'?' item':' items');});
  // 남은 한국어 조사·어미를 정리합니다
  t=t.replace(/[\uAC00-\uD7A3]+/g,' ')
     .replace(/\s{2,}/g,' ')
     .replace(/\s+([,.])/g,'$1')
     .replace(/\s*·\s*/g,' · ')
     .replace(/^[\s·,]+|[\s·,]+$/g,'')
     .trim();
  return t;
}
function trItemsEn(s){
  if(s==null)return s;
  s=String(s);
  if(!/[\uAC00-\uD7A3]/.test(s))return s;
  for(var i=0;i<_IEK.length;i++){if(s.indexOf(_IEK[i])>=0)s=s.split(_IEK[i]).join(ITEM_EN[_IEK[i]]);}
  s=s.replace(/(\d+)\s*\uB300(?![\uAC00-\uD7A3])/g,function(m,n){return n+(n==='1'?' unit':' units');});
  s=s.replace(/(\d+)\s*\uAC1C(?![\uAC00-\uD7A3])/g,function(m,n){return n+(n==='1'?' item':' items');});
  return s;
}

// 영문 발송 품목명 — 사전(trItemsEn)에 없는 말이 남으면 문장 사전(toEn)으로 한 번 더 바꿔
// 영문 문구에 한글이 섞여 나가지 않게 합니다.
function sEnIt(x){var t=trItemsEn(String(x||''));if(/[가-힣]/.test(t))t=toEn(t);return t;}

// ══ 품목 아이콘 ══
const RQ_ICON_KW=[
  ['건조기','♨️'],['세탁','🧺'],['냉장','🧊'],['냉동','🧊'],['후드','🍳'],['오븐','🍳'],
  ['가스레인지','🔥'],['인덕션','🔥'],['전자레인지','🔥'],['공기청정','💨'],['제습','💧'],['가습','💧'],
  ['정수기','🚰'],['실링팬','🌀'],['선풍기','🌀'],['환풍','🌀'],['식탁','🍽️'],['의자','🪑'],
  ['소파','🛋️'],['쇼파','🛋️'],['침대','🛏️'],['매트리스','🛏️'],['이불','🛏️'],
  ['카페트','🧶'],['카펫','🧶'],['러그','🧶'],['커튼','🪟'],['블라인드','🪟'],
  ['실외기','🌬️'],['냉매','❄️'],['에어컨','❄️'],['필터','🧽'],['곰팡이','🧼'],['배수','🚿'],
  ['철거','🔨'],['타공','🪛'],['복원','🛠️'],['도색','🎨'],['배관','🚰'],['누수','🚰'],['전기','⚡'],
  ['세척','🧼'],['청소','🧹'],['설치','🔩'],['수리','🔧'],['교체','🔧'],['점검','🔍'],
  ['자재','🧰'],['부품','🧰'],['인건','👷'],['운반','🚚'],['출장','🚗']
];
function rqIcon(nm2){
  const u=String(nm2||'');
  for(let i=0;i<RQ_ICON_KW.length;i++){if(u.indexOf(RQ_ICON_KW[i][0])>=0)return RQ_ICON_KW[i][1];}
  return '🧾';
}

// ══ 의뢰 품목 줄 — 「❄️ 에어컨(가정용) · 벽걸이형 · 약품세척 × 2대」 ══
function rqItemLines2(x,en){
  let a=[];
  try{a=JSON.parse(String((x&&x.items)||'[]'));}catch(_){a=[];}
  if(!Array.isArray(a))a=[];
  return a.map(it=>{
    const sv=String((it&&it.svc)||'').trim();
    if(!sv)return '';
    // 품목명(에어컨(가정용)·세탁기·냉장고 등)을 앞에 붙입니다 — 이미 들어 있으면 그대로
    const ct=String((it&&it.cat)||'').trim();
    const ko2=(ct&&sv.indexOf(ct)<0)?(ct+' · '+sv):sv;
    const ic2=rqIcon(ko2);            // 아이콘은 한글 원본 기준으로 판단 (품목명 포함)
    const nm2=en?trItemsEn(ko2):ko2;
    const q=(it&&it.qty)?String(it.qty).trim():'';
    const qt=(!q||q==='0')?'-':(/^\d+$/.test(q)?(q+(en?(q==='1'?' unit':' units'):'대')):q);
    return ic2+' '+nm2+' × '+qt;
  }).filter(t=>t).join('\n');
}

// ══ 예약 확정 방문일시 ══
var CS_MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var CS_DOW=[['일','Sun'],['월','Mon'],['화','Tue'],['수','Wed'],['목','Thu'],['금','Fri'],['토','Sat']];
function bkcWhen(x,en){
  if(!x)return '';
  const d=String(x.booking_date||'');
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  let out='';
  if(m){
    const w=CS_DOW[new Date(+m[1],+m[2]-1,+m[3]).getDay()];
    out=en?(w[1]+', '+parseInt(m[3],10)+' '+CS_MN[parseInt(m[2],10)-1]+' '+m[1])
          :(parseInt(m[1],10)+'년 '+parseInt(m[2],10)+'월 '+parseInt(m[3],10)+'일('+w[0]+')');
  }else out=d;
  if(!out)return '';
  // 방문시간 — 「11:30」·「오전 11:30」·「09:00|11:00」 모두 처리
  let t=String(x.booking_time||'').trim();
  if(t.indexOf('|')>=0)t=(t.split('|')[0]||t).trim();
  if(t){
    const tm=/(\d{1,2})\s*[:시]\s*(\d{1,2})?/.exec(t);
    if(tm){
      let hh=parseInt(tm[1],10)||0;
      const mi=(tm[2]||'00').padStart(2,'0');
      if(/오후|저녁|p\.?m\.?/i.test(t)&&hh<12)hh+=12;
      if(/오전|아침|a\.?m\.?/i.test(t)&&hh===12)hh=0;
      const h12=(hh%12)||12;
      out+=en?(', around '+h12+':'+mi+' '+(hh<12?'AM':'PM'))
             :(' '+(hh<12?'오전':'오후')+' '+h12+':'+mi+' 전후');
    }else out+=' '+t;
  }
  return out;
}

// ══ 공통 인사 · 서명 ══
var SIG='📞 +60 17-247 2774 · Happy Home Care';
function sHi(en,nm){return en?('Hello, '+nm+' 😊'):('안녕하세요, '+nm+' 고객님 😊');}

// ══ 🪪 작업방문등록 안내장 주소 — 확정 예약이 있으면 표지 위에 예약 확정 카드를 함께 보여 줍니다 ══
// 주소 값 인코딩 — 괄호 ( ) 도 %28 %29 로 바꿔 메시지 속 주소가 중간에 끊기지 않게 합니다
function wpEnc(v){return encodeURIComponent(v).replace(/[()'!*]/g,function(c){return '%'+c.charCodeAt(0).toString(16).toUpperCase();});}
function wpLink(x,nm,en){
  var q=[];
  if(x){
    q.push('bk=1');
    if(x.booking_date)q.push('d='+wpEnc(x.booking_date));
    var t=String(x.booking_time||'').trim();
    if(t.indexOf('|')>=0)t=String((en?t.split('|')[1]:t.split('|')[0])||t.split('|')[0]).trim();
    if(t)q.push('t='+wpEnc(t));
    if(nm)q.push('nm='+wpEnc(nm));
    var it=String(x.booking_items||'').trim();
    if(en&&it)it=trItemsEn(it);
    if(it)q.push('it='+wpEnc(it));
  }
  if(en)q.push('lang=en');
  return BASE+'/workpermit.html'+(q.length?'?'+q.join('&'):'');
}

// ══ 고객 마이페이지 주소 (customers 문서 ID) — f: 열자마자 강조할 카드 (rq · bk) ══
function myLink(cid,en,f){
  return BASE+(en?'/my-en.html?c=':'/my.html?c=')+encodeURIComponent(cid)+'&v=iv,ip,ct,cp&lang='+(en?'en':'ko')+(f?'&f='+f:'');
}

// ══════════════ 발송 문구 ══════════════
// 📥 의뢰 접수 안내
//   o.name : 고객명 · o.req : requests 문서({items,...}) · o.en : 영문 여부 · o.link : 마이페이지 주소(짧은 주소)
function rq(o){
  var en=!!o.en,nm=o.name||'',r=o.req||{};
  var ri=rqItemLines2(r,en);                  // 품목 한 줄에 하나 (앞에 품목 아이콘)
  var items=String(ri||'').split('\n').filter(Boolean).map(function(x){return en?sEnIt(x):x;});
  var il=items.length?('\n'+items.join('\n')):'';
  return en
    ?(sHi(en,nm)+'\nYour request has been received. Thank you!\n'+il+
      '\n📅 Our team will check and contact you with a visit time.\n\n📱 My Page 👉 '+o.link+'\n'+SIG)
    :(sHi(en,nm)+'\n의뢰가 접수되었습니다. 감사합니다!\n'+il+
      '\n📅 방문 일정은 담당자가 확인 후 연락드리겠습니다.\n\n📱 마이페이지 👉 '+o.link+'\n'+SIG);
}
// ✅ 예약 확정 안내 — 방문일시를 본문에 넣고, 상세는 마이페이지에서 확인하도록 짧게 유지
//   o.name · o.en · o.link(마이페이지 주소)
//   o.booking   : 방문일시를 적을 예약 (bookings 문서)
//   o.wpBooking : 작업방문등록 안내장 표지에 보여 줄 예약 (생략하면 o.booking · null 이면 표지 카드 없음)
function bkc(o){
  var en=!!o.en,nm=o.name||'';
  var wb=('wpBooking' in o)?o.wpBooking:o.booking;
  var bkcW=bkcWhen(o.booking,en);
  var tail='\n👉 '+o.link+'\n\n'+SIG;
  return en
    ?(sHi(en,nm)+'\n✅ Your booking has been confirmed.\n'+(bkcW?'📅 '+bkcW+'\n':'')+
      '\n⚠️ Please complete the Work Permit (visit registration) before we arrive.\n'+
      '🪪 Work permit guide\n🔗 '+wpLink(wb,nm,true)+'\n'+
      '\nFull details are on your My Page.'+tail)
    :(sHi(en,nm)+'\n✅ 예약이 확정되었습니다.\n'+(bkcW?'📅 '+bkcW+'\n':'')+
      '\n⚠️ 방문 전 작업방문등록(Work Permit)을 꼭 완료해 주세요.\n'+
      '🪪 작업방문등록 안내장\n🔗 '+wpLink(wb,nm,false)+'\n'+
      '\n상세 정보는 마이페이지에서 확인하세요.'+tail);
}

window.HHCMsg={
  BASE:BASE,SIG:SIG,ITEM_EN:ITEM_EN,
  toEn:toEn,trItemsEn:trItemsEn,sEnIt:sEnIt,rqIcon:rqIcon,rqItemLines2:rqItemLines2,
  bkcWhen:bkcWhen,sHi:sHi,wpLink:wpLink,myLink:myLink,
  rq:rq,bkc:bkc
};
})();
