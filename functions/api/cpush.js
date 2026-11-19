// ─────────────────────────────────────────────────────────────────────────────
// /api/cpush — 고객 앱 알림(웹 푸시) (2026-11-16)
//
// POST {op:'sub',   c, sub:{endpoint,keys:{p256dh,auth}}, lang}  ← 마이페이지 「알림 받기」 : 이 기기를 고객에게 등록
// POST {op:'unsub', c, endpoint}                                  ← 마이페이지 「알림 끄기」 : 등록 삭제
// POST {op:'send',  id}                                           ← 관리자 고객관리 「🔔 앱 알림」
//
// · 고객 기기 목록은 cust_push 컬렉션 (문서 ID = 기기 주소의 SHA-256 앞 32자 → 같은 기기는 한 문서)
// · 관리자 발송은 「관리자만 쓸 수 있는」 cust_push_out 문서(규칙상 관리자 전용)를 먼저 만들고, 그 문서 ID 로 부른다.
//   → 서버는 그 문서가 실제로 있고 · 5분 안에 만들어졌고 · 아직 안 보냈을 때만 보낸다.
//   (로그인 토큰을 따로 검증하지 않아도 「관리자가 만든 발송 요청」만 처리됨 · 같은 요청을 두 번 보내지 않음)
// · 발송 엔진(암호화·VAPID 서명)은 관리자 알림과 같은 _lib/push.js 를 쓴다.
// 필요 설정: VAPID_PRIVATE_KEY · FIREBASE_CLIENT_EMAIL · FIREBASE_PRIVATE_KEY (이미 설정됨)
// ─────────────────────────────────────────────────────────────────────────────
import { getDoc, listAll, batchGet, queryEq, patchDoc, deleteDoc, json, fail, rateLimited, originAllowed, nn, pn } from './_lib/fs.js';
import { sendPush } from './_lib/push.js';

async function subId(endpoint){
  const h=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint)));
  return Array.from(h).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,32);
}
// 웹 푸시 서비스 주소만 받는다 (Chrome·Edge·Firefox·Safari·삼성)
function okEndpoint(u){
  try{ const x=new URL(u); return x.protocol==='https:'&&u.length<1000&&
    /(^|\.)(googleapis\.com|mozilla\.com|windows\.com|push\.apple\.com|microsoft\.com|samsung\.com|samsungcloud\.com)$/.test(x.hostname); }
  catch(e){ return false; }
}
const clip=(s,n)=>Array.from(String(s||'')).slice(0,n).join('');
// 🛡 관리자(직원) 기기 구분 (2026-11-19)
//  · 직원앱 알림을 허용한 기기는 push_subs 에 「기기 주소 끝 48자」 ID 로 등록돼 있다 (staffapp.html setupPush 와 같은 규칙)
//  · 그런 기기가 고객 마이페이지를 열어 본 것만으로 고객 기기로 등록되던 문제를 막는다.
//    고객 기기로 인정하는 것은 「그 마이페이지에서 직접 알림 켜기를 누른」 등록(explicit)뿐.
const adminId=ep=>String(ep||'').replace(/[^a-zA-Z0-9]/g,'').slice(-48);
async function isAdminDev(env,ep){ const id=adminId(ep); if(!id) return false; try{ return !!(await getDoc(env,'push_subs',id)); }catch(e){ return false; } }
// 발송 대상에서 「관리자 기기인데 직접 켠 적 없는」 등록을 빼고, 그 등록은 지운다 → [보낼 기기, 정리한 수]
async function realDevs(env,subs){
  const keep=[]; let cleaned=0;
  await Promise.all(subs.map(async s=>{
    if(s.explicit!==true&&await isAdminDev(env,s.endpoint)){ await deleteDoc(env,'cust_push',s.__id).catch(()=>{}); cleaned++; }
    else keep.push(s);
  }));
  return [keep,cleaned];
}

export async function onRequestPost(context){
  const req=context.request, env=context.env||{};
  if(!originAllowed(req)) return fail('forbidden',403);
  if(rateLimited(req,'cpush',30)) return fail('too many requests',429);
  let b={}; try{ b=await req.json(); }catch(e){}
  const op=b&&b.op;

  // ── 고객: 이 기기 등록 ──
  if(op==='sub'){
    const c=String(b.c||''), s=b.sub||{};
    const ep=String(s.endpoint||''), k=s.keys||{};
    if(!c||!okEndpoint(ep)||!k.p256dh||!k.auth) return fail('bad request');
    const cu=await getDoc(env,'customers',c);
    if(!cu) return fail('not found',404);
    const id=await subId(ep);
    const rec={
      c, name:String(cu.name||''), endpoint:ep, keys:{p256dh:String(k.p256dh),auth:String(k.auth)},
      lang:b.lang==='en'?'en':'ko', ua:clip(req.headers.get('User-Agent'),200), updated_at:new Date().toISOString(),
    };
    // 조용한 재등록(quiet) : 마이페이지를 열 때마다 자동으로 부르는 것 — 「이미 이 고객의 기기」일 때만 갱신한다.
    //  · 다른 고객 기기이거나(가족이 다른 링크를 연 경우) 처음 보는 기기면 아무것도 바꾸지 않고 mine:false
    //  · 관리자 기기는 직접 켠 등록(explicit)이 아니면 고객 기기로 보지 않고, 잘못 들어가 있던 등록은 지운다
    if(b.quiet){
      const cur=await getDoc(env,'cust_push',id);
      if(!cur||cur.c!==c) return json({ok:true,mine:false});
      const adm=await isAdminDev(env,ep);
      if(adm&&cur.explicit!==true){ await deleteDoc(env,'cust_push',id).catch(()=>{}); return json({ok:true,mine:false,adm:true}); }
      await patchDoc(env,'cust_push',id,rec);
      return json({ok:true,mine:true,adm});
    }
    // 직접 「알림 켜기」를 누른 등록
    rec.explicit=true;
    await patchDoc(env,'cust_push',id,rec);
    return json({ok:true,mine:true});
  }

  // ── 고객: 이 기기 등록 해제 ──
  if(op==='unsub'){
    const ep=String(b.endpoint||'');
    if(!ep) return fail('bad request');
    const id=await subId(ep);
    const d=await getDoc(env,'cust_push',id);
    if(d&&d.c===String(b.c||'')) await deleteDoc(env,'cust_push',id).catch(()=>{});
    return json({ok:true});
  }

  // ── 관리자: 발송 ──
  if(op==='send'){
    const priv=env.VAPID_PRIVATE_KEY;
    if(!priv) return fail('VAPID_PRIVATE_KEY 미설정',500);
    const id=String(b.id||'');
    const o=await getDoc(env,'cust_push_out',id);
    if(!o) return fail('not found',404);
    if(o.sent_at) return fail('already sent',409);
    const age=Date.now()-Date.parse(o.created_at||0);
    if(!(age>=0&&age<5*60e3)) return fail('expired',410);
    const url=(typeof o.url==='string'&&o.url.charAt(0)==='/'&&o.url.charAt(1)!=='/')?o.url:'';
    const payload={kind:'cust',title:clip(o.title,60)||'Happy Home Care',body:clip(o.body,180),url,tag:'hhc-c-'+id};
    const [subs,cleaned]=await realDevs(env,await queryEq(env,'cust_push','c',String(o.c||''),20));
    let sent=0,removed=cleaned,failed=0;
    await Promise.all(subs.map(async s=>{
      try{
        const st=await sendPush({endpoint:s.endpoint,keys:s.keys},payload,priv);
        if(st===404||st===410){ await deleteDoc(env,'cust_push',s.__id).catch(()=>{}); removed++; }
        else if(st>=200&&st<300) sent++;
        else failed++;
      }catch(e){ failed++; }
    }));
    await patchDoc(env,'cust_push_out',id,{sent_at:new Date().toISOString(),sent,removed,failed,total:subs.length}).catch(()=>{});
    return json({ok:true,sent,removed,failed,total:subs.length});
  }
  // ── 자동 알림 (2단계) : 캘린더 Worker 가 매일 오전 9시(MYT)에 부름 ──
  if(op==='auto') return autoPush(env,b&&b.dry);
  return fail('bad request');
}

// ═════════════════════════════════════════════════════════════════════════════
// 🔔 자동 알림 (2026-11-16 · 2단계)
//  ① 방문 전날 : 내일 날짜의 「확정(confirmed)」 예약
//  ② 결제 기한 하루 전 : 내일이 만기일인 미결제 인보이스(billing·overdue)
//  ③ 결제 기한 지남 : 만기일이 어제였던 미결제 인보이스 (한 번만)
//  · 알림을 켠 고객(cust_push)에게만 · 기기마다 그 기기에서 고른 언어로
//  · 같은 건은 한 번만 — cust_push_out 에 「auto-…」 고정 ID 로 기록하고, 이미 있으면 건너뜀(Worker 가 두 번 불러도 안전)
//  · 말레이시아 시각 08:00~11:59 에만 동작 (엉뚱한 시간 발송 방지) · dry:true 면 보내지 않고 대상만 돌려줌(확인용)
// ═════════════════════════════════════════════════════════════════════════════
const DOW={ko:['일','월','화','수','목','금','토'],en:['Sun','Mon','Tue','Wed','Thu','Fri','Sat']};
const MON_EN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function ymd(t){return t.getUTCFullYear()+'-'+String(t.getUTCMonth()+1).padStart(2,'0')+'-'+String(t.getUTCDate()).padStart(2,'0');}
function dLabel(ds,lang){
  const t=new Date(ds+'T00:00:00Z'); if(isNaN(t)) return ds;
  return lang==='en'?DOW.en[t.getUTCDay()]+', '+t.getUTCDate()+' '+MON_EN[t.getUTCMonth()]
                    :(t.getUTCMonth()+1)+'월 '+t.getUTCDate()+'일('+DOW.ko[t.getUTCDay()]+')';
}
function timeOf(s,lang){
  s=String(s||'').trim(); if(!s) return '';
  if(s.indexOf('|')>=0){ const p=s.split('|'); s=String((lang==='en'?p[1]:p[0])||p[0]).trim(); }
  return s;
}
const AUTO_MSG={
  visit:{ko:(x)=>({title:'🗓️ 내일 방문 예정 안내',body:'내일 '+dLabel(x.date,'ko')+(x.time?' '+x.time:'')+' 해피홈케어가 방문합니다. 작업방문(Work Permit) 등록 확인 부탁드립니다.'}),
         en:(x)=>({title:'🗓️ Visit tomorrow',body:'Happy Home Care will visit tomorrow, '+dLabel(x.date,'en')+(x.time?', '+x.time.replace(/^Around/,'around'):'')+'. Please confirm that the work permit (visit registration) has been arranged.'})},
  due:  {ko:(x)=>({title:'🧾 결제 기한 안내',body:'인보이스 '+x.id+'의 결제 기한이 내일 '+dLabel(x.date,'ko')+'입니다. 눌러서 결제 금액과 방법을 확인해 주세요.'}),
         en:(x)=>({title:'🧾 Payment due tomorrow',body:'Invoice '+x.id+' is due tomorrow ('+dLabel(x.date,'en')+'). Tap to see the amount and how to pay.'})},
  over: {ko:(x)=>({title:'🧾 결제 기한이 지났습니다',body:'인보이스 '+x.id+'의 결제 기한 '+dLabel(x.date,'ko')+'이 지났습니다. 이미 결제하셨다면 이 알림은 무시해 주세요.'}),
         en:(x)=>({title:'🧾 Payment overdue',body:'Invoice '+x.id+' was due on '+dLabel(x.date,'en')+'. If you have already paid, please ignore this message.'})},
};
async function autoPush(env,dry){
  const priv=env.VAPID_PRIVATE_KEY;
  if(!priv) return fail('VAPID_PRIVATE_KEY 미설정',500);
  const my=new Date(Date.now()+8*3600e3);                           // 말레이시아 시각을 UTC 필드로 읽음
  const h=my.getUTCHours();
  if(!dry&&(h<8||h>11)) return fail('not now',409);
  const today=ymd(my), tmr=ymd(new Date(my.getTime()+86400e3)), yst=ymd(new Date(my.getTime()-86400e3));

  // 알림을 켠 고객과 그 기기
  const subs0=await listAll(env,'cust_push');
  if(!subs0.length) return json({ok:true,today,jobs:0,note:'no subscribers'});
  // 관리자 기기(직접 켠 적 없는 등록)는 대상에서 뺀다 — 확인용(dry) 호출에서는 지우지 않고 빼기만
  let subs=subs0;
  try{
    const adm=new Set((await listAll(env,'push_subs')).map(r=>r.endpoint).filter(Boolean));
    subs=subs0.filter(s=>s.explicit===true||!adm.has(s.endpoint));
    if(!dry) await Promise.all(subs0.filter(s=>subs.indexOf(s)<0).map(s=>deleteDoc(env,'cust_push',s.__id).catch(()=>{})));
  }catch(e){ subs=subs0; }
  const byC={}; subs.forEach(s=>{ if(s.c) (byC[s.c]=byC[s.c]||[]).push(s); });
  const custs=await batchGet(env,'customers',Object.keys(byC));
  // 고객별 「내 문서」 판정 — /api/my 와 같은 규칙 (추가 연결 · 소속 이동 · 떼어냄 · 전화/이름/별칭)
  const M=custs.map(m=>{
    const keys=[nn(m.name)].concat((m.aliases||[]).map(nn)).filter(Boolean), mp=pn(m.phone);
    const MYK=['m:'+m.__id,'k:'+nn(m.name)+'#'+pn(m.phone)];
    const has=(a,x)=>Array.isArray(x&&x[a])&&x[a].some(v=>MYK.indexOf(v)>=0);
    return {c:m.__id,hit:(name,phone,x)=>{
      if(has('ca_links',x)) return true;
      if(x&&x.ca_link) return MYK.indexOf(x.ca_link)>=0;
      if(has('ca_off',x)) return false;
      return (mp&&pn(phone)===mp)||(!!name&&keys.includes(nn(name)));
    }};
  });
  const owners=(name,phone,x)=>M.filter(m=>m.hit(name,phone,x)).map(m=>m.c);

  const [bks,ivT,ivY]=await Promise.all([
    queryEq(env,'bookings','booking_date',tmr,300).catch(()=>[]),
    queryEq(env,'invoices','due',tmr,300).catch(()=>[]),
    queryEq(env,'invoices','due',yst,300).catch(()=>[]),
  ]);
  const unpaid=x=>x.status==='billing'||x.status==='overdue';
  const jobs=[];
  bks.filter(x=>x.status==='confirmed').forEach(x=>owners(x.customer_name,x.customer_phone,x).forEach(c=>
    jobs.push({key:'auto-bk-'+x.__id+'-'+tmr+'-'+c,c,kind:'visit',f:'bk',d:{date:tmr,timeRaw:x.booking_time}})));
  ivT.filter(unpaid).forEach(x=>owners(x.customer&&x.customer.name,x.customer&&x.customer.phone,x).forEach(c=>
    jobs.push({key:'auto-due-'+x.__id+'-'+c,c,kind:'due',f:'py',d:{date:tmr,id:x.id||x.__id}})));
  ivY.filter(unpaid).forEach(x=>owners(x.customer&&x.customer.name,x.customer&&x.customer.phone,x).forEach(c=>
    jobs.push({key:'auto-over-'+x.__id+'-'+c,c,kind:'over',f:'py',d:{date:yst,id:x.id||x.__id}})));

  const out=[];
  for(const j of jobs){
    const key=j.key.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,140);
    if(await getDoc(env,'cust_push_out',key)){ out.push({kind:j.kind,skip:'already'}); continue; }
    const devs=byC[j.c]||[];
    const url='/my?c='+encodeURIComponent(j.c)+'&f='+j.f;
    if(dry){ out.push({kind:j.kind,devices:devs.length}); continue; }   // 확인용 — 고객·문서 ID 는 돌려주지 않음
    let sent=0,removed=0,failed=0;
    await Promise.all(devs.map(async s=>{
      const lang=s.lang==='en'?'en':'ko';
      const m=AUTO_MSG[j.kind][lang](Object.assign({time:timeOf(j.d.timeRaw,lang)},j.d));
      try{
        const st=await sendPush({endpoint:s.endpoint,keys:s.keys},{kind:'cust',title:m.title,body:m.body,url,tag:'hhc-'+key},priv);
        if(st===404||st===410){ await deleteDoc(env,'cust_push',s.__id).catch(()=>{}); removed++; }
        else if(st>=200&&st<300) sent++; else failed++;
      }catch(e){ failed++; }
    }));
    const m0=AUTO_MSG[j.kind].ko(Object.assign({time:timeOf(j.d.timeRaw,'ko')},j.d));
    await patchDoc(env,'cust_push_out',key,{auto:true,kind:j.kind,c:j.c,title:m0.title,body:m0.body,url,
      created_at:new Date().toISOString(),sent_at:new Date().toISOString(),sent,removed,failed,total:devs.length}).catch(()=>{});
    out.push({kind:j.kind,sent,removed,failed});   // 응답에 문서·고객 ID 를 싣지 않음 (누구나 부를 수 있는 창구)
  }
  return json({ok:true,today,tomorrow:tmr,dry:!!dry,jobs:jobs.length,result:out});
}
