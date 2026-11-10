// HHC — 새 의뢰·예약 푸시 알림 (Cloudflare Pages Function)
// POST /api/notify {type:'request'|'booking', edit?:true}  → 등록된 관리자 기기 전체에 웹 푸시 발송
// GET  /api/notify                                          → 상태 진단 페이지 (한국어)
//
// 2026-11-09: 발송 코드는 _lib/push.js 로 옮겼고, 수신 기기 목록은 서비스 계정으로 읽는다.
//   의뢰서·예약서는 이제 /api/request · /api/booking 이 저장과 함께 알림을 보내므로 이 POST 는
//   예전 화면(캐시)이 남아 있을 때를 위한 호환용이다. 보호(출처 검사·호출 제한)는 그대로 둔다.
// 필요 설정: VAPID_PRIVATE_KEY · FIREBASE_CLIENT_EMAIL · FIREBASE_PRIVATE_KEY (Pages 환경변수)
import { sendAdminPush, listSubs } from './_lib/push.js';
import { json, originAllowed, queryEq } from './_lib/fs.js';

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
    else if(b&&b.type==='tomorrow')type='tomorrow';
  }catch(e){}
  if(!type)return json({ok:false,error:'bad request'},400);
  if(type==='tomorrow')return tomorrowPush(context.env);
  const r=await sendAdminPush(context.env,type);
  return json(r,r.ok?200:500);
}

// ── 매일 밤 11시: 내일 일정 건수를 세어 「단체방 보내기」 알림 (캘린더 Worker 의 cron 이 호출) ──
//    · 말레이시아 시각 22:00~23:59 에만 받음(엉뚱한 시간의 알림 방지) · 내일 일정이 0건이면 보내지 않음
//    · 세는 규칙은 sched-send.html 과 같음: 예약 미러 일정·휴일·완료(✅) 할 일 제외, 확정 예약 포함
async function tomorrowPush(env){
  const my=new Date(Date.now()+8*3600e3);                     // UTC+8 을 UTC 필드로 읽음
  const h=my.getUTCHours();
  if(h<22)return json({ok:false,error:'not now'},409);
  const t=new Date(my.getTime()+86400e3);
  const ds=t.getUTCFullYear()+'-'+String(t.getUTCMonth()+1).padStart(2,'0')+'-'+String(t.getUTCDate()).padStart(2,'0');
  const [sch,bk]=await Promise.all([queryEq(env,'schedules','date',ds,300),queryEq(env,'bookings','booking_date',ds,300)]);
  const n=sch.filter(s=>!s.booking_id&&s.type!=='holiday'&&!/^✅/.test(String(s.title||''))).length
         +bk.filter(b=>b.status==='confirmed').length;
  if(!n)return json({ok:true,skipped:'no schedules',date:ds});
  const D=['일','월','화','수','목','금','토'];
  const label=(t.getUTCMonth()+1)+'/'+t.getUTCDate()+'('+D[t.getUTCDay()]+')';
  const r=await sendAdminPush(env,'tomorrow',{body:'내일 '+label+' 일정 '+n+'건 — 눌러서 직원 단체방에 영어로 보내세요',url:'/sched-send.html?d='+ds});
  return json(Object.assign({date:ds,count:n},r),r.ok?200:500);
}

// 기기별 상태 — 기기 종류(OS)만 표시하고 주소·키는 보여 주지 않습니다
function devKind(ua){ua=String(ua||'');if(/iPhone|iPad/i.test(ua))return '📱 iPhone';if(/Android/i.test(ua))return '📱 Android';if(/Windows/i.test(ua))return '💻 Windows';if(/Mac/i.test(ua))return '💻 Mac';return '기기';}
function myTime(iso){if(!iso)return '—';const d=new Date(Date.parse(iso)+8*3600e3);if(isNaN(d))return '—';return (d.getUTCMonth()+1)+'/'+d.getUTCDate()+' '+String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0');}
function devTable(subs){
  if(!subs||!subs.length)return '';
  const rows=subs.slice().sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at))).map(s=>{
    const st=s.last_status;
    const res=!st?'<span style="color:#999">아직 없음</span>':(st>=200&&st<300?'✅ 전달됨':'❌ 실패('+st+')');
    return '<tr><td>'+devKind(s.ua)+'</td><td>'+myTime(s.updated_at)+'</td><td>'+myTime(s.last_at)+' '+res+'</td></tr>';
  }).join('');
  return '<table style="width:100%;border-collapse:collapse;font-size:13px" border="1" cellpadding="6"><tr style="background:#f4f6fa"><th>기기</th><th>앱 연 시각</th><th>마지막 알림</th></tr>'+rows+'</table>'+
    '<p style="color:#666;font-size:12px">「앱 연 시각」이 오래된 기기는 알림이 늦거나 안 올 수 있습니다 — 그 기기에서 관리자 앱을 한 번 열면 다시 등록됩니다.</p>';
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
    '<p>등록된 수신 기기: '+(error?('❌ 조회 실패 ('+error+')'):('<b>'+subs.length+'대</b>'))+'</p>'+devTable(subs)+
    '<p style="color:#666;font-size:13px">관리자 앱에서 알림을 허용하면 기기가 자동 등록됩니다.<br>의뢰요청·예약신청이 접수되면 등록된 모든 기기로 알림이 발송됩니다.</p></body>';
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
}
