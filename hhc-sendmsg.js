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
    // 연도는 생략합니다 — 요일이 함께 있어 헷갈리지 않고, 한 줄이 짧아져 한눈에 읽힙니다 (2026-11 발송 문구 개편)
    out=en?(w[1]+', '+parseInt(m[3],10)+' '+CS_MN[parseInt(m[2],10)-1])
          :(parseInt(m[2],10)+'월 '+parseInt(m[3],10)+'일('+w[0]+')');
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
// 📐 공통 모양 (2026-11 개편 — 고객이 한눈에 이해하도록 모든 발송 문구를 같은 순서로)
//    인사
//    (빈 줄)
//    아이콘 *제목 한 줄*            ← 무슨 일인지 (왓츠앱은 *…* 가 굵은 글씨)
//    핵심 정보 한 줄에 하나          ← 날짜 · 금액 · 품목
//    👉 고객이 할 일 한 줄            ← 없으면 「따로 하실 일은 없습니다」
//    「이름 👉 주소」 링크 줄         ← 무엇이 열리는지 이름을 붙임 (카카오는 이 줄이 버튼으로 바뀜)
//    서명
// 카카오톡은 굵은 글씨를 지원하지 않으므로 보낼 때 noBold() 로 별표를 뗍니다.
function noBold(t){return String(t==null?'':t).replace(/\*([^*\n]+)\*/g,'$1');}
// 방문 일시 — 「11월 20일(금) 오전 11:00 전후」 / 「Fri, 20 Nov, around 11:00 AM」
function whenOf(d,t,en){return bkcWhen({booking_date:d,booking_time:t},en);}
// 링크 줄 — 「📄 보고서 보기 👉 https://…」
function lk(label,url){return label+' 👉 '+url;}

// 📥 의뢰 접수 안내
//   o.name : 고객명 · o.req : requests 문서({items,...}) · o.en : 영문 여부 · o.link : 마이페이지 주소(짧은 주소) · o.lb : 링크 이름(없으면 「📱 마이페이지」, 2026-11-25 진행 안내)
function rq(o){
  var en=!!o.en,nm=o.name||'',r=o.req||{};
  var ri=rqItemLines2(r,en);                  // 품목 한 줄에 하나 (앞에 품목 아이콘)
  var items=String(ri||'').split('\n').filter(Boolean).map(function(x){return en?sEnIt(x):x;});
  var il=items.length?(items.join('\n')+'\n'):'';
  return en
    ?(sHi(en,nm)+'\n\n📥 *Your request has been received*\n'+il+
      '\n👉 Our staff will check and let you know the available dates.\n      (Nothing else needed from you)\n\n'+lk(o.lb||'📱 My Page',o.link)+'\n'+SIG)
    :(sHi(en,nm)+'\n\n📥 *의뢰가 접수되었습니다*\n'+il+
      '\n👉 담당 직원이 확인 후 가능 일정을 안내드리겠습니다.\n      (따로 하실 일은 없습니다)\n\n'+lk(o.lb||'📱 마이페이지',o.link)+'\n'+SIG);
}
// ✅ 예약 확정 안내 — 방문일시를 본문에 넣고, 상세는 마이페이지에서 확인하도록 짧게 유지
//   o.name · o.en · o.link(마이페이지 주소)
//   o.booking   : 방문일시를 적을 예약 (bookings 문서)
//   o.wpBooking : 작업방문등록 안내장 표지에 보여 줄 예약 (생략하면 o.booking · null 이면 표지 카드 없음)
// vi=bc : 예약 확정 표시 — 왓츠앱은 첫 링크로 미리보기를 만들므로, 작업방문등록 링크에 「예약 확정 + 날짜」 그림이 붙게 합니다 (2026-11-21)
function bcMark(u){return u+(u.indexOf('?')>=0?'&':'?')+'vi=bc';}
function bkc(o){
  var en=!!o.en,nm=o.name||'';
  var wb=('wpBooking' in o)?o.wpBooking:o.booking;
  var bkcW=bkcWhen(o.booking,en);
  // 📍 방문 위치 (2026-11-16) — 예약에 위치(customer_loc)가 있을 때만. 고객이 잘못 찍은 위치를 방문 전에 바로잡도록
  var lc=o.booking&&o.booking.customer_loc,lcN=lc&&isFinite(lc.lat)?String(lc.name||'').trim():'';
  var bkcL=lcN?('📍 '+lcN+'\n      '+(en?'(let us know if this is not correct)':'(위치가 다르면 알려 주세요)')+'\n'):'';
  return en
    ?(sHi(en,nm)+'\n\n✅ *Booking confirmed*\n'+(bkcW?'📅 '+bkcW+'\n':'')+bkcL+
      '\n📌 *Work Permit registration required*\nPlease register our visit with management before we arrive.\n'+
      lk('🪪 Registration details',bcMark(wpLink(wb,nm,true)))+'\n\n'+lk(o.lb||'📱 Booking details',o.link)+'\n'+SIG)
    :(sHi(en,nm)+'\n\n✅ *예약이 확정되었습니다*\n'+(bkcW?'📅 '+bkcW+'\n':'')+bkcL+
      '\n📌 *작업방문등록 필수 요망*\n방문 전 매니지먼트에 작업방문등록(Work Permit)을 꼭 완료해 주세요.\n'+
      lk('🪪 등록에 필요한 정보',bcMark(wpLink(wb,nm,false)))+'\n\n'+lk(o.lb||'📱 예약 상세',o.link)+'\n'+SIG);
}

// 💛 예약 확정 카카오 카드 전용 짧은 문구 (2026-11-23) — 왓츠앱·복사 문구는 그대로, 카톡 카드만
//    제목 「예약이 확정되었습니다」 / 본문 「11월 25일(수) 오후 8:00 전후」 + 「작업방문등록 필수 요망.」 (위치 확인 문구는 뺌)
function bkcKk(b,en){
  var w=bkcWhen(b,en);
  return {t:en?'Booking confirmed':'예약이 확정되었습니다',
          d:(w?w+'\n':'')+(en?'Work Permit registration required.':'작업방문등록 필수 요망.')};
}
// 💛 의뢰 접수 카카오 카드 전용 본문 (2026-11-23) — 품목 목록 대신 한 줄. 왓츠앱·복사 문구는 그대로
// 📅 예약 신청(날짜 고르기) 카카오 카드 전용 본문 (2026-11-23) — 품목 목록 대신
function bkqKk(en){return en?'Please tap the link below to confirm your date.':'아래 링크 클릭 후 일정 확정 부탁드립니다.';}
function rqKk(en){return en?'Our staff will check and get back to you.':'담당자가 확인 후 안내드리겠습니다.';}
// ══ 🔔 방문 안내 8종 (2026-11-25) — 문구 원본은 여기 한 곳 ══════════════════════════
//   날짜 안내 : pre(사전) · tomorrow(내일) · today(당일)   → visitMsg(k,name,lang,dateStr,timeS)
//   현장 안내 : move(이동 중) · early(이른 방문) · arrive(가드하우스 도착) · delayT(지연·교통) · delayW(지연·작업)
//               → visitMsg(k,name,lang,null,null,{area,mins})
//   쓰는 곳 : schedule.html 방문 안내 창 · customer-admin.html 「🔔 방문 안내 보낼 고객」 · msg-center.html
//   (예전 schedule.html getVisitReminderMsg · getMovingMsg · getEarlyMsg · getDelayMsg · getArrivedMsg 와 글자 하나까지 같음)
function vDT(dateStr,timeS){
  var dKo='',dEn='';
  if(dateStr){
    var p=String(dateStr).split('-');
    if(p.length===3){
      var mn=parseInt(p[1],10),dy=parseInt(p[2],10);
      var monEn=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mn-1]||'';
      var d=new Date(dateStr+'T00:00:00');
      var wk='',wkEn='';
      if(!isNaN(d)){
        wk=['일','월','화','수','목','금','토'][d.getDay()];
        wkEn=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
      }
      dKo=mn+'월 '+dy+'일'+(wk?'('+wk+')':'');
      dEn=monEn+' '+dy+(wkEn?' ('+wkEn+')':'');
    }
  }
  var tKo='',tEn='';
  if(timeS){
    var tm=String(timeS).match(/^(\d{1,2}):(\d{2})/);
    if(tm){
      var h=parseInt(tm[1],10),mi=parseInt(tm[2],10);
      var h12=h%12;if(h12===0)h12=12;
      tKo=(h<12?'오전 ':'오후 ')+h12+'시'+(mi?' '+mi+'분':'')+' 전후';
      tEn='around '+h12+(mi?':'+String(mi).padStart(2,'0'):'')+(h<12?' AM':' PM');
    }
  }
  return {dKo:dKo,dEn:dEn,tKo:tKo,tEn:tEn};
}
function visitMsg(k,name,lang,dateStr,timeS,x){
  var en=(lang==='en');x=x||{};
  var M=(x.mins!=null&&x.mins!=='')?x.mins:'00';
  if(k==='move'){
    var A=x.area||'000';
    if(en)return 'Hello, '+name+' 😊\n\n🚗 *We\'re on our way*\n📍 Departed from '+A+'.\n⏱ Expected to arrive in about '+M+' min.\n\n👉 See you very soon!';
    return '안녕하세요, '+name+' 고객님 😊\n\n🚗 *이동 중입니다*\n📍 '+A+'에서 출발.\n⏱ '+M+'분 후 도착 예상입니다.\n\n👉 곧 방문드릴게요.';
  }
  if(k==='delayW'){
    if(en)return 'Hello, '+name+' 😊\n\n🛠 *Visit delay notice*\nOur current job is running late, so we will arrive later than the scheduled visit time.\n⏱ We expect to arrive in about '+M+' min.\n\n🙏 We sincerely apologize.';
    return '안녕하세요, '+name+' 고객님 😊\n\n🛠 *방문 지연 안내*\n현재 작업이 지연되고 있어 약속드린 방문 시간보다 늦어질 것 같습니다.\n⏱ 약 '+M+'분 후 도착 예상됩니다.\n\n🙏 죄송합니다.';
  }
  if(k==='delayT'){
    if(en)return 'Hello, '+name+' 😊\n\n🚗 *Arrival delay notice*\nWe are on our way, but heavy traffic is delaying our arrival.\n⏱ We expect to arrive in about '+M+' min.\n\n🙏 We sincerely apologize.';
    return '안녕하세요, '+name+' 고객님 😊\n\n🚗 *도착 지연 안내*\n현재 이동 중이나 교통체증으로 도착이 지연되고 있습니다.\n⏱ 약 '+M+'분 후 도착 예정입니다.\n\n🙏 죄송합니다.';
  }
  if(k==='early'){
    if(en)return 'Hello, '+name+' 😊\n\n⏰ *Early visit request*\nWould it be okay if we visit a little earlier than your scheduled time?\n⏱ We can arrive in about '+M+' min.\n\n🙏 Please let us know.';
    return '안녕하세요, '+name+' 고객님 😊\n\n⏰ *이른 방문 문의*\n혹시 예약된 방문 시간보다 조금 일찍 방문드려도 괜찮으실까요?\n⏱ 현재 약 '+M+'분 후 도착 가능합니다.\n\n🙏 편하실 때 답장 부탁드립니다.';
  }
  if(k==='arrive'){
    if(en)return 'Hello, '+name+' 😊\n\n🏢 *We\'ve arrived at the guardhouse*\n📝 We\'ll come up right after the entry check-in.\n\n🙏 Thank you for waiting a moment.';
    return '안녕하세요, '+name+' 고객님 😊\n\n🏢 *가드하우스에 도착했습니다*\n📝 출입 수속 후 곧 방문드리겠습니다.\n\n🙏 잠시만 기다려 주세요.';
  }
  // 날짜 안내 (pre · tomorrow · today)
  var tpl=k||'pre';
  var D=vDT(dateStr,timeS);
  var when=(tpl==='today')?(en?D.tEn:D.tKo):[en?D.dEn:D.dKo,en?D.tEn:D.tKo].filter(Boolean).join(' ');
  if(en){
    var tEN={tomorrow:'🔔 *We\'re visiting tomorrow*',today:'🔔 *We\'re visiting today*'}[tpl]||'📅 *Your scheduled visit*';
    var aEN={tomorrow:'👉 If you haven\'t registered our visit (Work Permit) yet,\n      please do it with your management office today.',
             today:'👉 If you haven\'t registered our visit (Work Permit) yet,\n      please do it right away. See you shortly!'}[tpl]
             ||'👉 If you haven\'t registered our visit (Work Permit) yet,\n      please do it with your management office before we arrive.';
    return 'Hello, '+name+' 😊\n\n'+tEN+(when?'\n'+(tpl==='today'?'⏰ ':'📅 ')+when:'')+'\n\n'+aEN;
  }
  var tKO={tomorrow:'🔔 *내일 방문합니다*',today:'🔔 *오늘 방문합니다*'}[tpl]||'📅 *예약 방문 안내*';
  var aKO={tomorrow:'👉 작업방문등록(Work Permit)을 아직 안 하셨다면\n      오늘 중으로 매니지먼트에 등록 부탁드립니다.',
           today:'👉 작업방문등록(Work Permit)을 아직 안 하셨다면\n      지금 바로 부탁드립니다. 잠시 후 뵙겠습니다.'}[tpl]
           ||'👉 작업방문등록(Work Permit)을 아직 안 하셨다면\n      방문 전까지 매니지먼트에 등록 부탁드립니다.';
  return '안녕하세요, '+name+' 고객님 😊\n\n'+tKO+(when?'\n'+(tpl==='today'?'⏰ ':'📅 ')+when:'')+'\n\n'+aKO;
}
// 방문 안내 링크 줄 — 진행 안내장(/go)이면 「📍 진행 안내」, 그 밖(예전 마이페이지 · 수리)은 넘겨받은 이름
function visitTail(url,en,lb){
  if(!url||/\/home(\?|$)/.test(url))return '\n\n'+SIG;
  return '\n\n'+(lb||(en?'📍 Progress':'📍 진행 안내'))+' 👉 '+url+'\n'+SIG;
}
// 진행 안내장 주소 — 예약 ID 가 열쇠 · vi= 는 링크 미리보기 그림 (functions/api/_lib/vimg.js)
//   k → vi : pre=pd(+vd) · tomorrow=tm · today=td · move/early=mv(+mn) · delayT=dt(+mn) · delayW=dw(+mn) · arrive=ar
var VISIT_VI={pre:'pd',tomorrow:'tm',today:'td',move:'mv',early:'mv',delayT:'dt',delayW:'dw',arrive:'ar'};
function visitGoUrl(bkId,cid,en,k,dateStr,mins){
  var vi=VISIT_VI[k]||'1',u=BASE+'/go?j=b:'+encodeURIComponent(bkId)+(cid?'&c='+encodeURIComponent(cid):'')+(en?'&lang=en':'')+'&vi='+vi;
  var md=(/^\d{4}-(\d{2})-(\d{2})/.exec(String(dateStr||''))||[]).slice(1).join('');
  if(vi==='pd'&&md)u+='&vd='+md;
  var n=parseInt(mins,10);if((vi==='mv'||vi==='dt'||vi==='dw')&&n>=1&&n<=180)u+='&mn='+n;
  return u;
}
// 카톡 카드 · 앱 알림용 짧은 제목/본문 (날짜 안내)
function visitKk(k,en,dateStr,timeS){
  var D=vDT(dateStr,timeS),w=[en?D.dEn:D.dKo,en?D.tEn:D.tKo].filter(Boolean).join(' ');
  if(k==='tomorrow')return {t:en?'We\'re visiting tomorrow':'내일 방문합니다',d:(w?w+'\n':'')+(en?'Please register our visit (Work Permit) today.':'작업방문등록 오늘 중 부탁드립니다.')};
  if(k==='today')return {t:en?'We\'re visiting today':'오늘 방문합니다',d:((en?D.tEn:D.tKo)?(en?D.tEn:D.tKo)+'\n':'')+(en?'See you shortly!':'잠시 후 뵙겠습니다.')};
  return {t:en?'Your scheduled visit':'예약 방문 안내',d:(w?w+'\n':'')+(en?'Please register our visit (Work Permit) in advance.':'작업방문등록 미리 부탁드립니다.')};
}
window.HHCMsg={
  BASE:BASE,SIG:SIG,ITEM_EN:ITEM_EN,
  toEn:toEn,trItemsEn:trItemsEn,sEnIt:sEnIt,rqIcon:rqIcon,rqItemLines2:rqItemLines2,
  bkcWhen:bkcWhen,sHi:sHi,wpLink:wpLink,myLink:myLink,
  noBold:noBold,whenOf:whenOf,lk:lk,
  rq:rq,rqKk:rqKk,bkqKk:bkqKk,bkc:bkc,bkcKk:bkcKk,
  vDT:vDT,visitMsg:visitMsg,visitTail:visitTail,visitGoUrl:visitGoUrl,visitKk:visitKk,VISIT_VI:VISIT_VI
};
})();
