// HHC — 새 의뢰·예약 푸시 알림 발송 (Cloudflare Pages Function)
// POST /api/notify {type:'request'|'booking', edit?:true}  → 등록된 관리자 기기 전체에 웹 푸시 발송
// GET  /api/notify                                          → 상태 진단 페이지 (한국어)
//
// 필요 설정: Cloudflare Pages → Settings → Environment variables 에
//   VAPID_PRIVATE_KEY = (전달받은 비공개 키)

const VAPID_PUBLIC='BE5OUy5k4wwsty8t7vBJ1IH-9LMpqzKI66QAV78Z39lGhYRBImjekMHVyJMhqUDsHJvvwIIVbb-YT-gRtwL5O74';
const SUBJECT='mailto:kopeco100@gmail.com';
const FS_BASE='https://firestore.googleapis.com/v1/projects/happywork-packageplan/databases/(default)/documents';
const FS_KEY='AIzaSyAxAaB-CtySH2_ZHJKidwjbhn8ava6rM00';

const MSG={
  request:{title:'📥 새 의뢰요청 도착',body:'새 의뢰요청서가 접수되었습니다 — 눌러서 확인하세요',tab:'request'},
  booking:{title:'🗓️ 새 예약신청 도착',body:'고객이 예약 신청을 완료했습니다 — 눌러서 확인하세요',tab:'booking'},
  booking_edit:{title:'🗓️ 예약 변경',body:'고객이 예약 내용을 수정했습니다 — 눌러서 확인하세요',tab:'booking'},
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

// ---------- Firestore REST ----------
async function listSubs(){
  const r=await fetch(FS_BASE+'/push_subs?pageSize=300&key='+FS_KEY);
  if(!r.ok)return {error:'firestore '+r.status,subs:[]};
  const j=await r.json();
  const subs=[];
  for(const d of (j.documents||[])){
    try{
      const f=d.fields||{};
      subs.push({docName:d.name,endpoint:f.endpoint.stringValue,
        keys:{p256dh:f.keys.mapValue.fields.p256dh.stringValue,auth:f.keys.mapValue.fields.auth.stringValue}});
    }catch(e){}
  }
  return {subs};
}
async function deleteSub(docName){
  try{await fetch('https://firestore.googleapis.com/v1/'+docName+'?key='+FS_KEY,{method:'DELETE'});}catch(e){}
}

// ---------- 핸들러 ----------
export async function onRequestPost(context){
  const priv=context.env.VAPID_PRIVATE_KEY;
  if(!priv)return json({ok:false,error:'VAPID_PRIVATE_KEY 환경변수가 설정되지 않았습니다'},500);
  let type='request';
  try{const b=await context.request.json();type=b.edit?'booking_edit':(b.type==='booking'?'booking':'request');}catch(e){}
  const msg=MSG[type]||MSG.request;
  const {subs,error}=await listSubs();
  if(error)return json({ok:false,error},500);
  let sent=0,removed=0;
  await Promise.all(subs.map(async s=>{
    try{
      const st=await sendPush(s,msg,priv);
      if(st===404||st===410){await deleteSub(s.docName);removed++;}
      else if(st>=200&&st<300)sent++;
    }catch(e){}
  }));
  return json({ok:true,sent,removed,total:subs.length});
}

export async function onRequestGet(context){
  const priv=context.env.VAPID_PRIVATE_KEY;
  const {subs,error}=await listSubs();
  const html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<body style="font-family:sans-serif;max-width:480px;margin:40px auto;padding:0 16px;line-height:1.7">'+
    '<h2>🔔 HHC 푸시 알림 상태</h2>'+
    '<p>서버 키(VAPID): '+(priv?'✅ 설정됨':'❌ <b>미설정</b> — Cloudflare Pages → Settings → Environment variables 에 <code>VAPID_PRIVATE_KEY</code> 추가 후 재배포 필요')+'</p>'+
    '<p>등록된 수신 기기: '+(error?('❌ 조회 실패 ('+error+')'):('<b>'+subs.length+'대</b>'))+'</p>'+
    '<p style="color:#666;font-size:13px">관리자 앱에서 알림을 허용하면 기기가 자동 등록됩니다.<br>의뢰요청·예약신청이 접수되면 등록된 모든 기기로 알림이 발송됩니다.</p></body>';
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}});
}

function json(o,status){return new Response(JSON.stringify(o),{status:status||200,headers:{'content-type':'application/json'}});}
