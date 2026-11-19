// ─────────────────────────────────────────────────────────────────────────────
// functions/api/_lib/myauth.js — 고객 마이페이지 본인 확인(휴대폰 인증코드) 공통 도구 (2026-11-19)
//
// 흐름: my.html → POST /api/myauth {op:'send'}  → Twilio Verify 가 고객상세 전화번호로 6자리 코드 문자 발송
//       my.html → POST /api/myauth {op:'check'} → 코드가 맞으면 「마이페이지 열쇠」(서명된 토큰)를 돌려줌
//       my.html → GET  /api/my  (머리글 X-HHC-My: 열쇠) → 열쇠가 맞을 때만 자료를 내줌
//
// · 전화번호는 서버에서만 다룬다. 화면에는 가린 번호(+60 12-***-4567)만 내려간다.
// · 열쇠에는 고객번호 + 전화번호 지문이 들어 있다 → 고객상세 번호를 바꾸면 그 휴대폰은 다시 인증해야 함.
// · 관리자 미리보기(고객관리 「고객화면」)는 관리자 로그인 토큰(Firebase)으로 인증을 건너뛴다.
//
// 환경변수 (Cloudflare Pages → Settings → Variables and Secrets, Production, 모두 Secret):
//   TWILIO_ACCOUNT_SID · TWILIO_AUTH_TOKEN · TWILIO_VERIFY_SID · MY_AUTH_SECRET(아무 긴 무작위 글자)
//   → 네 개가 모두 있어야 인증이 켜진다. 하나라도 없으면 지금처럼 인증 없이 열린다(안전한 기본값).
//   로컬 테스트용: TWILIO_BASE (가짜 Twilio 주소)
// ─────────────────────────────────────────────────────────────────────────────
import { pn } from './fs.js';

const PROJECT = 'happywork-packageplan';
// 관리자 미리보기를 허용할 계정 (소문자) — hhc-auth.js ALLOWED · firestore.rules 목록과 같게 유지
export const ADMIN_EMAILS = ['kopeco100@gmail.com'];
const TOK_DAYS = 365;   // 한 번 인증하면 이 휴대폰에서 1년 동안 다시 묻지 않음 (열 때마다 연장)

export function authOn(env){
  return !!(env && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_VERIFY_SID && env.MY_AUTH_SECRET);
}

// 고객상세 전화번호 → 국제 형식(+60…). 한국 번호(+82…)는 + 가 붙어 있을 때 그대로 씀
export function e164(raw){
  const s = String(raw || '').trim();
  let d = s.replace(/[^0-9]/g, '');
  if (!d) return '';
  if (s.startsWith('+')) return '+' + d;
  if (d.startsWith('00')) return '+' + d.slice(2);
  if (d.startsWith('60')) return '+' + d;
  if (d.startsWith('82') && d.length >= 11) return '+' + d;
  if (d.startsWith('0')) return '+60' + d.slice(1);
  return '+60' + d;   // 12-3456789 처럼 0 없이 적은 말레이시아 번호
}
// +60123456789 → +60 12-***-6789
export function maskPhone(p){
  const d = String(p || '').replace(/[^0-9]/g, '');
  if (d.length < 7) return '***';
  const cc = d.startsWith('60') ? '60' : d.startsWith('82') ? '82' : d.slice(0, 2);
  const rest = d.slice(cc.length);
  return '+' + cc + ' ' + rest.slice(0, 2) + '-***-' + rest.slice(-4);
}

// ── 서명 도구 ────────────────────────────────────────────────────────────────
const enc = new TextEncoder();
function b64u(bytes){ let s = ''; const a = new Uint8Array(bytes); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64u(s){ s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s); const o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; }
async function hmac(secret, data){
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}
async function phoneTag(env, phone){ return (await hmac(env.MY_AUTH_SECRET, 'ph|' + pn(phone))).slice(0, 16); }
function same(a, b){ a = String(a); b = String(b); if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

export async function makeTok(env, cid, phone){
  const now = Math.floor(Date.now() / 1000);
  const body = b64u(enc.encode(JSON.stringify({ c: cid, ph: await phoneTag(env, phone), iat: now, exp: now + TOK_DAYS * 86400 })));
  return body + '.' + await hmac(env.MY_AUTH_SECRET, body);
}
export async function checkTok(env, tok, cid, phone){
  const [body, sig] = String(tok || '').split('.');
  if (!body || !sig) return false;
  if (!same(sig, await hmac(env.MY_AUTH_SECRET, body))) return false;
  let p; try { p = JSON.parse(new TextDecoder().decode(unb64u(body))); } catch (e) { return false; }
  if (!p || p.c !== cid || !(p.exp > Date.now() / 1000)) return false;
  return same(p.ph, await phoneTag(env, phone));
}

// ── 관리자 로그인 토큰(Firebase ID 토큰) 확인 — 관리자 미리보기용 ─────────────
let _jwks = null, _jwksAt = 0;
async function jwks(){
  if (_jwks && Date.now() - _jwksAt < 3600e3) return _jwks;
  const r = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  const j = await r.json(); _jwks = (j && j.keys) || []; _jwksAt = Date.now(); return _jwks;
}
export async function isAdminReq(req){
  const h = req.headers.get('Authorization') || '';
  const t = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  const parts = t.split('.');
  if (parts.length !== 3) return false;
  try {
    const hd = JSON.parse(new TextDecoder().decode(unb64u(parts[0])));
    const p = JSON.parse(new TextDecoder().decode(unb64u(parts[1])));
    const now = Date.now() / 1000;
    if (hd.alg !== 'RS256' || p.aud !== PROJECT || p.iss !== 'https://securetoken.google.com/' + PROJECT) return false;
    if (!(p.exp > now) || !(p.iat < now + 300)) return false;
    if (ADMIN_EMAILS.indexOf(String(p.email || '').toLowerCase()) < 0) return false;
    const jwk = (await jwks()).find(k => k.kid === hd.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64u(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
  } catch (e) { return false; }
}

// /api/my 문 앞 검사 → { ok:true, mode } 또는 { ok:false, mask }
//   mode: off(인증 꺼짐) · nophone(번호 미등록 → 지금처럼 열림) · admin(관리자 미리보기) · tok(본인 확인됨)
export async function gateMy(env, req, cid, m){
  if (!authOn(env)) return { ok: true, mode: 'off' };
  const ph = e164(m && m.phone);
  if (!ph || pn(m.phone).length < 7) return { ok: true, mode: 'nophone' };
  if (await isAdminReq(req)) return { ok: true, mode: 'admin' };
  if (await checkTok(env, req.headers.get('X-HHC-My'), cid, m.phone)) return { ok: true, mode: 'tok' };
  return { ok: false, mask: maskPhone(ph) };
}

// ── Twilio Verify ───────────────────────────────────────────────────────────
export async function twilio(env, path, params){
  const base = env.TWILIO_BASE || 'https://verify.twilio.com';
  const r = await fetch(base + '/v2/Services/' + env.TWILIO_VERIFY_SID + path, {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + btoa(env.TWILIO_ACCOUNT_SID + ':' + env.TWILIO_AUTH_TOKEN), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}
