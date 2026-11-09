// HHC — 새 의뢰·예약 푸시 알림 (Cloudflare Pages Function)
// POST /api/notify {type:'request'|'booking', edit?:true}  → 등록된 관리자 기기 전체에 웹 푸시 발송
// GET  /api/notify                                          → 상태 진단 페이지 (한국어)
//
// 2026-11-09: 발송 코드는 _lib/push.js 로 옮겼고, 수신 기기 목록은 서비스 계정으로 읽는다.
//   의뢰서·예약서는 이제 /api/request · /api/booking 이 저장과 함께 알림을 보내므로 이 POST 는
//   예전 화면(캐시)이 남아 있을 때를 위한 호환용이다. 보호(출처 검사·호출 제한)는 그대로 둔다.
// 필요 설정: VAPID_PRIVATE_KEY · FIREBASE_CLIENT_EMAIL · FIREBASE_PRIVATE_KEY (Pages 환경변수)
import { sendAdminPush, listSubs } from './_lib/push.js';
import { json, originAllowed } from './_lib/fs.js';

// 호출 횟수 제한: 같은 IP 10분 10회 · 전체 1분 30회 (메모리 기반 · 알림 폭탄 완화용)
const RL_IP=new Map(); let RL_ALL=[];
function rateLimited(req){
  const now=Date.now();
  RL_ALL=RL_ALL.filter(t=>now-t<60e3);
  if(RL_ALL.length>=30)return true;
  const ip=req.headers.get('CF-Connecting-IP')||'?';
  const arr=(RL_IP.get(ip)||[]).filter(t=>now-t<600e3);
  if(arr.length>=10){RL_IP.set(ip,arr);return true;}
  arr.push(now);RL_IP.set(ip,arr);RL_ALL.push(now);
  if(RL_IP.size>5000)RL_IP.clear();
  return false;
}

export async function onRequestPost(context){
  if(!originAllowed(context.request))return json({ok:false,error:'forbidden'},403);
  if(rateLimited(context.request))return json({ok:false,error:'too many requests'},429);
  let type='';
  try{
    const b=await context.request.json();
    if(b&&b.type==='booking')type=b.edit?'booking_edit':'booking';
    else if(b&&b.type==='request')type='request';
  }catch(e){}
  if(!type)return json({ok:false,error:'bad request'},400);
  const r=await sendAdminPush(context.env,type);
  return json(r,r.ok?200:500);
}

export async function onRequestGet(context){
  const env=context.env||{};
  const priv=env.VAPID_PRIVATE_KEY;
  const sa=!!(env.FIREBASE_CLIENT_EMAIL&&env.FIREBASE_PRIVATE_KEY);
  const {subs,error}=sa?await listSubs(env):{subs:[],error:'서비스 계정 미설정'};
  const html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<body style="font-family:sans-serif;max-width:480px;margin:40px auto;padding:0 16px;line-height:1.7">'+
    '<h2>🔔 HHC 푸시 알림 상태</h2>'+
    '<p>서버 키(VAPID): '+(priv?'✅ 설정됨':'❌ <b>미설정</b> — Cloudflare Pages → Settings → Variables 에 <code>VAPID_PRIVATE_KEY</code> 추가 후 재배포 필요')+'</p>'+
    '<p>서비스 계정(FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY): '+(sa?'✅ 설정됨':'❌ <b>미설정</b>')+'</p>'+
    '<p>등록된 수신 기기: '+(error?('❌ 조회 실패 ('+error+')'):('<b>'+subs.length+'대</b>'))+'</p>'+
    '<p style="color:#666;font-size:13px">관리자 앱에서 알림을 허용하면 기기가 자동 등록됩니다.<br>의뢰요청·예약신청이 접수되면 등록된 모든 기기로 알림이 발송됩니다.</p></body>';
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
}
