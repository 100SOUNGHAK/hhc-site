// ─────────────────────────────────────────────────────────────────────────────
// functions/api/_lib/stg.js — 서버에서 Firebase Storage(사진) 올리기 · 받기 · 지우기 (2026-11-24)
//
// · 직원 현장 사진(work.html → /api/work POST) 용. 직원 휴대폰은 로그인이 없어 Storage 에 직접 못 올리므로
//   서버가 서비스 계정(fs.js 와 같은 FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)으로 대신 올린다.
// · fs.js 의 토큰은 Firestore 범위만 갖고 있어 Storage 용 토큰을 따로 받는다(이 파일 안에서만 씀 · fs.js 는 그대로).
// · 올린 사진은 Firebase 다운로드 주소(토큰 포함)로 돌려준다 → 관리자 화면 · 직원 화면에서 그대로 보임.
// · 로컬 테스트용: HHC_STG_BASE(Storage 주소) · HHC_STG_UP(업로드 주소) · HHC_TOKEN_URL — 실서버에서는 비워 둔다.
// ─────────────────────────────────────────────────────────────────────────────
export const BUCKET = 'happywork-packageplan.firebasestorage.app';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function b64url(bytes){ let s=''; const a=new Uint8Array(bytes); for(let i=0;i<a.length;i++) s+=String.fromCharCode(a[i]); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function b64urlStr(str){ return b64url(new TextEncoder().encode(str)); }
function pemToBinary(pem){
  const clean=String(pem||'').replace(/\\n/g,'\n').replace('-----BEGIN PRIVATE KEY-----','').replace('-----END PRIVATE KEY-----','').replace(/\s/g,'');
  const bin=atob(clean); const bytes=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i); return bytes.buffer;
}
let _tok=null, _exp=0;
async function token(env){
  const now=Math.floor(Date.now()/1000);
  if(_tok && now < _exp-60) return _tok;
  if(!env || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) throw new Error('env-missing');
  const payload={iss:env.FIREBASE_CLIENT_EMAIL,scope:'https://www.googleapis.com/auth/devstorage.read_write',aud:TOKEN_URL,exp:now+3600,iat:now};
  const unsigned=b64urlStr(JSON.stringify({alg:'RS256',typ:'JWT'}))+'.'+b64urlStr(JSON.stringify(payload));
  const key=await crypto.subtle.importKey('pkcs8',pemToBinary(env.FIREBASE_PRIVATE_KEY),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign({name:'RSASSA-PKCS1-v1_5'},key,new TextEncoder().encode(unsigned));
  const res=await fetch(env.HHC_TOKEN_URL||TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+b64url(sig)})});
  const d=await res.json().catch(()=>({}));
  if(!d.access_token) throw new Error('stg-token-failed');
  _tok=d.access_token; _exp=now+(parseInt(d.expires_in,10)||3600);
  return _tok;
}
const base = env => (env && env.HHC_STG_BASE) || 'https://storage.googleapis.com/storage/v1/b/'+BUCKET+'/o';
const upBase = env => (env && env.HHC_STG_UP) || 'https://storage.googleapis.com/upload/storage/v1/b/'+BUCKET+'/o';

// 사진 올리기 → Firebase 다운로드 주소
export async function stgPut(env, path, bytes, ctype){
  const tk=await token(env);
  const dl=crypto.randomUUID();
  const meta={name:path,contentType:ctype||'image/jpeg',cacheControl:'public,max-age=31536000',metadata:{firebaseStorageDownloadTokens:dl}};
  const bd='hhc'+dl.replace(/-/g,'');
  const enc=new TextEncoder();
  const head=enc.encode('--'+bd+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+'\r\n--'+bd+'\r\nContent-Type: '+meta.contentType+'\r\n\r\n');
  const tail=enc.encode('\r\n--'+bd+'--');
  const body=new Uint8Array(head.length+bytes.byteLength+tail.length);
  body.set(head,0); body.set(new Uint8Array(bytes),head.length); body.set(tail,head.length+bytes.byteLength);
  const res=await fetch(upBase(env)+'?uploadType=multipart',{method:'POST',headers:{'Authorization':'Bearer '+tk,'Content-Type':'multipart/related; boundary='+bd},body});
  if(!res.ok) throw new Error('stg-put-'+res.status);
  return 'https://firebasestorage.googleapis.com/v0/b/'+BUCKET+'/o/'+encodeURIComponent(path)+'?alt=media&token='+dl;
}
// 사진 받기 (관리자 보고서 화면이 같은 주소로 받아 가도록 서버가 대신 받아 줌)
export async function stgGet(env, path){
  const tk=await token(env);
  const res=await fetch(base(env)+'/'+encodeURIComponent(path)+'?alt=media',{headers:{'Authorization':'Bearer '+tk}});
  if(!res.ok) throw new Error('stg-get-'+res.status);
  return res;
}
// 지우기 (이미 없으면 그냥 넘어감)
export async function stgDel(env, path){
  if(!path) return;
  const tk=await token(env);
  const res=await fetch(base(env)+'/'+encodeURIComponent(path),{method:'DELETE',headers:{'Authorization':'Bearer '+tk}});
  if(!res.ok && res.status!==404) throw new Error('stg-del-'+res.status);
}
