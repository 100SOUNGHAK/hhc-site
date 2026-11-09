// ─────────────────────────────────────────────────────────────────────────────
// functions/api/_lib/push.js — 관리자 기기 웹 푸시 발송 (notify.js 에서 분리, 2026-11-09)
// · 수신 기기 목록(push_subs)은 서비스 계정으로 읽는다 (3단계에서 규칙을 잠가도 동작)
// · 필요 설정: VAPID_PRIVATE_KEY (Pages 환경변수)
// ─────────────────────────────────────────────────────────────────────────────
import { listAll, deleteDoc } from './fs.js';

const VAPID_PUBLIC='BE5OUy5k4wwsty8t7vBJ1IH-9LMpqzKI66QAV78Z39lGhYRBImjekMHVyJMhqUDsHJvvwIIVbb-YT-gRtwL5O74';
const SUBJECT='mailto:kopeco100@gmail.com';

export const MSG={
  request:{title:'📥 새 의뢰요청 도착',body:'새 의뢰요청서가 접수되었습니다 — 눌러서 확인하세요',tab:'request'},
  booking:{title:'🗓️ 새 예약신청 도착',body:'고객이 예약 신청을 완료했습니다 — 눌러서 확인하세요',tab:'booking'},
  booking_edit:{title:'🗓️ 예약 변경',body:'고객이 예약 내용을 수정했습니다 — 눌러서 확인하세요',tab:'booking'},
  tomorrow:{title:'📤 내일 일정 단체방 보내기',body:'눌러서 영문 일정을 직원 단체방에 보내세요',tab:'sched'},   // 매일 밤 11시 (캘린더 Worker)
};

// ---------- base64url ----------
const te=new TextEncoder();
function b64uToBytes(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const bin=atob(s);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u;}
function bytesToB64u(u){let s='';const b=new Uint8Array(u);for(let i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function concat(...arrs){let n=0;for(const a of arrs)n+=a.length;const o=new Uint8Array(n);let p=0;for(const a of arrs){o.set(a,p);p+=a.length;}return o;}

// ---------- VAPID JWT (ES256) ----------
async function vapidJwt(aud,privB64u){
  const pub=b64uToBytes(VAPID_PUBLIC);
  const jwkPriv={kty:'EC',crv:'P-256',d:privB64u,x:bytesToB64u(pub.slice(1,33)),y:bytesToB64u(pub.slice(33,65))};
  const key=await crypto.subtle.importKey('jwk',jwkPriv,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const hdr=bytesToB64u(te.encode(JSON.stringify({typ:'JWT',alg:'ES256'})));
  const exp=Math.floor(Date.now()/1000)+12*3600;
  const pay=bytesToB64u(te.encode(JSON.stringify({aud,exp,sub:SUBJECT})));
  const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,te.encode(hdr+'.'+pay));
  return hdr+'.'+pay+'.'+bytesToB64u(sig);
}

// ---------- HKDF ----------
async function hkdf(salt,ikm,info,len){
  const key=await crypto.subtle.importKey('raw',ikm,'HKDF',false,['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},key,len*8));
}

// ---------- RFC 8291 aes128gcm 암호화 ----------
async function encryptPayload(plainText,p256dhB64u,authB64u){
  const uaPub=b64uToBytes(p256dhB64u);
  const authSecret=b64uToBytes(authB64u);
  const asKeys=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const asPub=new Uint8Array(await crypto.subtle.exportKey('raw',asKeys.publicKey));
  const uaKey=await crypto.subtle.importKey('raw',uaPub,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const ecdh=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:uaKey},asKeys.privateKey,256));
  const ikm=await hkdf(authSecret,ecdh,concat(te.encode('WebPush: info\0'),uaPub,asPub),32);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const cek=await hkdf(salt,ikm,te.encode('Content-Encoding: aes128gcm\0'),16);
  const nonce=await hkdf(salt,ikm,te.encode('Content-Encoding: nonce\0'),12);
  const aesKey=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']);
  const padded=concat(te.encode(plainText),new Uint8Array([2]));   // 마지막 레코드 구분자 0x02
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},aesKey,padded));
  const rs=new Uint8Array(4);new DataView(rs.buffer).setUint32(0,4096);
  return concat(salt,rs,new Uint8Array([asPub.length]),asPub,cipher);
}

// ---------- 푸시 1건 발송 ----------
async function sendPush(sub,payload,privKey){
  const ep=sub.endpoint;
  const aud=new URL(ep).origin;
  const jwt=await vapidJwt(aud,privKey);
  const body=await encryptPayload(JSON.stringify(payload),sub.keys.p256dh,sub.keys.auth);
  const res=await fetch(ep,{method:'POST',headers:{
    'Authorization':'vapid t='+jwt+', k='+VAPID_PUBLIC,
    'Content-Encoding':'aes128gcm',
    'Content-Type':'application/octet-stream',
    'TTL':'86400','Urgency':'high',
  },body});
  return res.status;
}

// ---------- 등록 기기 목록 ----------
export async function listSubs(env){
  try{
    const rows=await listAll(env,'push_subs');
    const subs=[];
    for(const r of rows){ try{ subs.push({id:r.__id,endpoint:r.endpoint,keys:{p256dh:r.keys.p256dh,auth:r.keys.auth}}); }catch(e){} }
    return {subs};
  }catch(e){ return {error:e.message||'firestore',subs:[]}; }
}

// ---------- 관리자 전체에 발송 ----------
// type: 'request' | 'booking' | 'booking_edit' | 'tomorrow'   → {ok,sent,removed,total} 또는 {ok:false,error}
// extra: 알림 문구·열 주소 덮어쓰기 (예: {body:'…', url:'/sched-send.html?d=…'})
export async function sendAdminPush(env,type,extra){
  const priv=env&&env.VAPID_PRIVATE_KEY;
  if(!priv) return {ok:false,error:'VAPID_PRIVATE_KEY 환경변수가 설정되지 않았습니다'};
  const msg=Object.assign({},MSG[type]||MSG.request,extra||{});
  const {subs,error}=await listSubs(env);
  if(error) return {ok:false,error};
  let sent=0,removed=0;
  await Promise.all(subs.map(async s=>{
    try{
      const st=await sendPush(s,msg,priv);
      if(st===404||st===410){ await deleteDoc(env,'push_subs',s.id).catch(()=>{}); removed++; }
      else if(st>=200&&st<300) sent++;
    }catch(e){}
  }));
  return {ok:true,sent,removed,total:subs.length};
}
