// ─────────────────────────────────────────────────────────────────────────────
// functions/api/_lib/fs.js — 서버(Pages Functions)에서 Firestore 를 읽고 쓰는 공통 도구 (2026-11-09)
//
// · 서비스 계정(FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)으로 접근 토큰을 받아 Firestore REST 를 호출한다.
//   → Firestore 보안 규칙과 무관하게 동작하므로, 어떤 문서를 돌려줄지는 각 API 가 책임지고 거른다.
// · 환경변수는 Cloudflare Pages → Settings → Variables and Secrets (Production) 에 넣는다.
// · 로컬 테스트용 덮어쓰기: HHC_FS_BASE(Firestore 주소) · HHC_TOKEN_URL(토큰 주소) — 실서버에서는 비워 둔다.
// · 이 폴더(_lib)는 밑줄로 시작해 라우트가 되지 않는다(wrangler 로 확인함).
// ─────────────────────────────────────────────────────────────────────────────
const PROJECT = 'happywork-packageplan';
const DOC_PREFIX = 'projects/' + PROJECT + '/databases/(default)/documents';
const DEFAULT_BASE = 'https://firestore.googleapis.com/v1/' + DOC_PREFIX;
const DEFAULT_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export function fsBase(env){ return (env && env.HHC_FS_BASE) || DEFAULT_BASE; }

// ── 서비스 계정 토큰 (worker.js 와 같은 방식) ─────────────────────────────────
function b64url(bytes){ let s=''; const a=new Uint8Array(bytes); for(let i=0;i<a.length;i++) s+=String.fromCharCode(a[i]); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function b64urlStr(str){ return b64url(new TextEncoder().encode(str)); }
function pemToBinary(pem){
  const clean=String(pem||'').replace(/\\n/g,'\n').replace('-----BEGIN PRIVATE KEY-----','').replace('-----END PRIVATE KEY-----','').replace(/\s/g,'');
  const bin=atob(clean); const bytes=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i); return bytes.buffer;
}
let _tok=null, _tokExp=0;   // 같은 인스턴스 안에서 토큰 재사용 (만료 1분 전까지)
export async function getToken(env){
  const now=Math.floor(Date.now()/1000);
  if(_tok && now < _tokExp-60) return _tok;
  if(!env || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) throw new Error('env-missing');
  const tokenUrl = env.HHC_TOKEN_URL || DEFAULT_TOKEN_URL;
  const header={alg:'RS256',typ:'JWT'};
  const payload={iss:env.FIREBASE_CLIENT_EMAIL,scope:'https://www.googleapis.com/auth/datastore',aud:DEFAULT_TOKEN_URL,exp:now+3600,iat:now};
  const unsigned=b64urlStr(JSON.stringify(header))+'.'+b64urlStr(JSON.stringify(payload));
  const key=await crypto.subtle.importKey('pkcs8',pemToBinary(env.FIREBASE_PRIVATE_KEY),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign({name:'RSASSA-PKCS1-v1_5'},key,new TextEncoder().encode(unsigned));
  const jwt=unsigned+'.'+b64url(sig);
  const res=await fetch(tokenUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt})});
  const data=await res.json().catch(()=>({}));
  if(!data.access_token) throw new Error('token-failed');
  _tok=data.access_token; _tokExp=now+(parseInt(data.expires_in,10)||3600);
  return _tok;
}

// ── Firestore 값 ↔ JS 값 ───────────────────────────────────────────────────────
// 시각(Timestamp)은 ISO 문자열로 내려보낸다 (고객 화면은 .toDate() 를 쓰지 않음 — 확인함)
export function fromFs(v){
  if(v==null) return null;
  if('stringValue' in v) return v.stringValue;
  if('integerValue' in v) return Number(v.integerValue);
  if('doubleValue' in v) return v.doubleValue;
  if('booleanValue' in v) return v.booleanValue;
  if('nullValue' in v) return null;
  if('timestampValue' in v) return v.timestampValue;
  if('referenceValue' in v) return v.referenceValue;
  if('geoPointValue' in v) return v.geoPointValue;
  if('bytesValue' in v) return v.bytesValue;
  if('arrayValue' in v) return (v.arrayValue.values||[]).map(fromFs);
  if('mapValue' in v){ const o={},f=v.mapValue.fields||{}; for(const k in f) o[k]=fromFs(f[k]); return o; }
  return null;
}
export function toFs(x){
  if(x===null||x===undefined) return {nullValue:null};
  if(typeof x==='string') return {stringValue:x};
  if(typeof x==='boolean') return {booleanValue:x};
  if(typeof x==='number') return Number.isInteger(x)?{integerValue:String(x)}:{doubleValue:x};
  if(Array.isArray(x)) return {arrayValue:{values:x.map(toFs)}};
  if(x instanceof Date) return {timestampValue:x.toISOString()};
  if(typeof x==='object'){ const f={}; for(const k in x){ if(x[k]!==undefined) f[k]=toFs(x[k]); } return {mapValue:{fields:f}}; }
  return {stringValue:String(x)};
}
export function docToObj(d){
  if(!d||!d.name) return null;
  const o=fromFs({mapValue:{fields:d.fields||{}}})||{};
  o.__id=String(d.name).split('/').pop();
  return o;
}

// ── 호출 ─────────────────────────────────────────────────────────────────────
async function call(env, method, path, body, query){
  const tok=await getToken(env);
  let url=fsBase(env)+path;
  if(query){ const q=new URLSearchParams(query).toString(); if(q) url+=(url.includes('?')?'&':'?')+q; }
  const res=await fetch(url,{method,headers:{'Authorization':'Bearer '+tok,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  if(res.status===404) return {status:404,json:null};
  const json=await res.json().catch(()=>null);
  if(!res.ok) throw new Error('firestore-'+res.status+(json&&json.error&&json.error.message?': '+json.error.message:''));
  return {status:res.status,json};
}

// 문서 1건 → 객체(없으면 null)
export async function getDoc(env, coll, id){
  if(!id) return null;
  // Firestore 가 거부하는 문서 ID(예약어 __x__ · 슬래시 포함)는 조회하지 않고 「없음」으로 처리 (500 대신 404)
  if(/^__.*__$/.test(id) || id.includes('/')) return null;
  const r=await call(env,'GET','/'+coll+'/'+encodeURIComponent(id));
  return r.status===404?null:docToObj(r.json);
}
// 컬렉션 전체 (페이지 넘김 포함). mask 를 주면 그 필드만 받는다 → 큰 컬렉션을 가볍게 훑을 때 CPU 절약
export async function listAll(env, coll, pageSize, mask){
  const out=[]; let pageToken='';
  for(let i=0;i<50;i++){
    const q=new URLSearchParams({pageSize:String(pageSize||300)}); if(pageToken) q.set('pageToken',pageToken);
    for(const m of (mask||[])) q.append('mask.fieldPaths',m);
    const r=await call(env,'GET','/'+coll+'?'+q.toString());
    const j=r.json||{};
    for(const d of (j.documents||[])){ const o=docToObj(d); if(o) out.push(o); }
    pageToken=j.nextPageToken||''; if(!pageToken) break;
  }
  return out;
}
// 여러 문서를 한 번에 (최대 100개씩) — 가볍게 훑어 고른 ID 들의 전체 내용을 받을 때
export async function batchGet(env, coll, ids){
  const out=[]; const list=(ids||[]).filter(Boolean);
  for(let i=0;i<list.length;i+=100){
    const names=list.slice(i,i+100).map(id=>DOC_PREFIX+'/'+coll+'/'+id);
    const r=await call(env,'POST',':batchGet',{documents:names});
    for(const x of (Array.isArray(r.json)?r.json:[])) if(x.found){ const o=docToObj(x.found); if(o) out.push(o); }
  }
  return out;
}
// 필드 일치 조회 (where field == value)
export async function queryEq(env, coll, field, value, limit){
  const body={structuredQuery:{from:[{collectionId:coll}],where:{fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:toFs(value)}},limit:limit||50}};
  const r=await call(env,'POST',':runQuery',body);
  const rows=Array.isArray(r.json)?r.json:[];
  return rows.filter(x=>x.document).map(x=>docToObj(x.document));
}
// 필드가 목록 중 하나와 일치 (where field in [...]) — 10개씩 나눠 조회
export async function queryIn(env, coll, field, values, limitPer){
  const out=[]; const vals=(values||[]).filter(v=>v!==undefined&&v!==null&&v!=='');
  for(let i=0;i<vals.length;i+=10){
    const chunk=vals.slice(i,i+10);
    const body={structuredQuery:{from:[{collectionId:coll}],where:{fieldFilter:{field:{fieldPath:field},op:'IN',value:toFs(chunk)}},limit:limitPer||100}};
    const r=await call(env,'POST',':runQuery',body);
    for(const x of (Array.isArray(r.json)?r.json:[])) if(x.document) out.push(docToObj(x.document));
  }
  return out;
}
// 일부 필드만 고치기 (updateMask 로 지정한 필드만 바뀜 — 나머지는 그대로)
export async function patchDoc(env, coll, id, data){
  const keys=Object.keys(data);
  const fields={}; for(const k of keys) fields[k]=toFs(data[k]);
  const mask=keys.map(k=>'updateMask.fieldPaths='+encodeURIComponent(k)).join('&');
  const r=await call(env,'PATCH','/'+coll+'/'+encodeURIComponent(id)+'?'+mask,{fields});
  return docToObj(r.json);
}
// 새 문서 만들기 (ID 자동)
export async function createDoc(env, coll, data){
  const fields={}; for(const k in data){ if(data[k]!==undefined) fields[k]=toFs(data[k]); }
  const r=await call(env,'POST','/'+coll,{fields});
  return docToObj(r.json);
}
export async function deleteDoc(env, coll, id){
  await call(env,'DELETE','/'+coll+'/'+encodeURIComponent(id));
}

// ── 응답·보호 도구 ──────────────────────────────────────────────────────────────
export function json(o, status, extra){
  return new Response(JSON.stringify(o),{status:status||200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...(extra||{})}});
}
export function fail(msg, status){ return json({ok:false,error:msg},status||400); }

// 같은 IP 가 분당 N회 넘게 부르면 429 (인스턴스 메모리 기반 · 대량 호출 완화용)
const RL=new Map();
export function rateLimited(req, key, perMin){
  const now=Date.now(); const ip=req.headers.get('CF-Connecting-IP')||'?'; const k=key+'|'+ip;
  const arr=(RL.get(k)||[]).filter(t=>now-t<60e3);
  if(arr.length>=(perMin||60)){ RL.set(k,arr); return true; }
  arr.push(now); RL.set(k,arr); if(RL.size>5000) RL.clear();
  return false;
}
// 우리 도메인에서 열린 화면의 요청인지 (POST 보호용 · GET 은 링크 직접 열기라 쓰지 않음)
const ALLOWED_HOSTS=['happyhomecare.com.my','www.happyhomecare.com.my','hhc-3p8.pages.dev','127.0.0.1','localhost'];
export function originAllowed(req){
  let src=req.headers.get('Origin')||'';
  if(!src){ const ref=req.headers.get('Referer')||''; try{ src=new URL(ref).origin; }catch(e){ src=''; } }
  if(!src) return false;
  let u; try{ u=new URL(src); }catch(e){ return false; }
  if(u.hostname==='127.0.0.1'||u.hostname==='localhost') return true;
  if(u.protocol!=='https:') return false;
  return ALLOWED_HOSTS.includes(u.hostname)||u.hostname.endsWith('.hhc-3p8.pages.dev');
}
// 고객 화면 공통: 이름·전화 정규화 (my.html 의 nn/pn 과 같은 규칙)
export function nn(n){ return String(n||'').toLowerCase().replace(/\s+/g,''); }
export function pn(p){ p=String(p||'').replace(/[^0-9]/g,''); if(p.indexOf('60')===0) p=p.slice(2); return p.replace(/^0+/,''); }
