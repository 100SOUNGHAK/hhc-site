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
import { getDoc, queryEq, patchDoc, deleteDoc, json, fail, rateLimited, originAllowed } from './_lib/fs.js';
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
    await patchDoc(env,'cust_push',id,{
      c, name:String(cu.name||''), endpoint:ep, keys:{p256dh:String(k.p256dh),auth:String(k.auth)},
      lang:b.lang==='en'?'en':'ko', ua:clip(req.headers.get('User-Agent'),200), updated_at:new Date().toISOString(),
    });
    return json({ok:true});
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
    const subs=await queryEq(env,'cust_push','c',String(o.c||''),20);
    let sent=0,removed=0,failed=0;
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
  return fail('bad request');
}
