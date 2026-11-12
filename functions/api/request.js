// ─────────────────────────────────────────────────────────────────────────────
// POST /api/request — 고객 서비스 의뢰서(request.html) 접수 (2026-11-09)
//  본문: {condo_name, condo_unit, phone, remarks, lang, items, items_struct, ref?}
//  ref = 추천 코드 (2026-11-12 지인 추천) — 맞는 코드면 추천인(ref_by·ref_by_name)과 1차 신규 판정(ref_new)을 함께 저장
//  → requests 컬렉션에 새 문서 생성(status:'pending') + 관리자 기기 푸시 알림
//  응답: {ok:true, id}
// ─────────────────────────────────────────────────────────────────────────────
import { createDoc, json, fail, rateLimited, originAllowed } from './_lib/fs.js';
import { sendAdminPush } from './_lib/push.js';
import { findReferrer, loadRefCfg, hasServiceHistory } from './_lib/ref.js';
import { pn } from './_lib/fs.js';

// ── 콘도명 · 동호수 겹침 정리 (2026-11-10) ─────────────────────────────
//  · 콘도명 칸에 동호수가 같이 들어간 경우 → 콘도명에서 동호수를 뺍니다
//  · 동호수 칸에 콘도명이 같이 들어간 경우 → 동호수에서 콘도명을 뺍니다
//  · 대소문자 · 띄어쓰기 · 「-」 차이는 무시하고 비교합니다
//  · 「12」처럼 숫자 두 자리 이하만 있는 동호수는 콘도명 속 숫자와 헷갈릴 수 있어 건드리지 않습니다
//  같은 규칙: request.html · request-admin.html · functions/api/request.js
var HHC_SEP='[\\s\\-–—_.,#\\/]*';
function hhcCN(s){return String(s||'').toUpperCase().replace(/[\s\-–—_.,#\/()]/g,'');}
function hhcPat(s){return hhcCN(s).split('').map(function(c){return c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}).join(HHC_SEP);}
function hhcTrimSep(s){return String(s||'').replace(/\(\s*\)|\[\s*\]/g,' ').replace(/^[\s,\-–—_.#\/()]+|[\s,\-–—_.#\/(]+$/g,'').replace(/\s{2,}/g,' ').trim();}
function hhcUnitOk(u){var c=hhcCN(u);return c.length>=3||(/-/.test(String(u))&&c.length>=2)||/[A-Z]/i.test(c)&&/\d/.test(c);}
function hhcCleanCondo(name,unit){
  var n=String(name||'').trim(),u=String(unit||'').trim();
  if(!n||!u)return {name:n,unit:u};
  var Nn=hhcCN(n),Nu=hhcCN(u);
  if(Nn===Nu)return {name:n,unit:u};
  // ① 동호수 칸에 콘도명까지 적은 경우
  if(Nn.length>=3&&Nu.indexOf(Nn)>=0){
    var u2=hhcTrimSep(u.replace(new RegExp(hhcPat(n),'i'),' '));
    if(u2&&/\d/.test(u2)){
      // 남은 앞쪽 글자 단어(숫자 없는 단어)는 콘도명의 나머지로 보고 콘도명 뒤로 옮깁니다 — 「Verve」+「Verve Suites B-21-08」
      var t2=u2.split(/\s+/),j=0,mv=[];
      while(j<t2.length-1&&!/\d/.test(t2[j])&&t2[j].length>=3&&!/^(BLOCK|BLK|BLOK|TOWER|UNIT|NO\.?|LEVEL|FLOOR|LOT|WING)$/i.test(t2[j])){mv.push(t2[j]);j++;}
      if(mv.length){n=hhcTrimSep(n+' '+mv.join(' '));Nn=hhcCN(n);u2=t2.slice(j).join(' ');}
      u=u2;Nu=hhcCN(u);
    }
  }else if(Nn.length>=3){
    // 콘도명 일부(첫 단어 등)만 동호수 앞에 붙인 경우 — 「Arcoris A-12-3」 → 「A-12-3」
    var W=n.toUpperCase().split(/[\s,]+/).filter(function(w){return w.length>=3&&!/\d/.test(w);});
    var tk=u.split(/\s+/),k=0;
    while(k<tk.length-1&&!/\d/.test(tk[k])&&W.indexOf(tk[k].toUpperCase().replace(/[,.]/g,''))>=0)k++;
    if(k>0){var u3=hhcTrimSep(tk.slice(k).join(' '));if(u3&&/\d/.test(u3)){u=u3;Nu=hhcCN(u);}}
  }
  // ② 콘도명 칸에 동호수까지 적은 경우
  if(hhcUnitOk(u)&&Nn.indexOf(Nu)>=0){
    var re=new RegExp('(^|[\\s,(\\/#-])(?:(?:UNIT|NO\\.?|BLK|BLOK|BLOCK)\\s*)?#?\\s*'+hhcPat(u)+'(?=$|[\\s,)\\/])','i');
    var n2=hhcTrimSep(n.replace(re,'$1 '));
    if(n2&&hhcCN(n2)!==Nn)n=n2;
  }
  return {name:n,unit:u};
}
// 이름 끝의 동호수 모양(A-12-3 · 12-3 · T2-15-02 · 3A-7 · C-23A-07)을 떼어냅니다 — 마이페이지 자동 입력용
function hhcSplitTail(s){
  var m=/^(.*?)[\s,]+(?:(?:UNIT|NO\.?)\s*)?#?([A-Z0-9]{1,4}(?:\s*-\s*[A-Z0-9]{1,4}){1,3})$/i.exec(String(s||'').trim());
  if(m&&/\d/.test(m[2])&&hhcTrimSep(m[1]))return {name:hhcTrimSep(m[1]),unit:m[2].replace(/\s+/g,'')};
  return null;
}
// 주소 칸 값이 동호수처럼 짧은지 (긴 주소면 동호수 칸에 넣지 않음)
function hhcUnitLike(a){a=String(a||'').trim();return !!a&&a.length<=24&&/\d/.test(a)&&a.split(/\s+/).length<=3&&!/\b(JALAN|JLN|LORONG|LRG|PERSIARAN|ROAD|RD|STREET|ST|TAMAN|KL|KUALA|LUMPUR|SELANGOR|PETALING|JAYA)\b/i.test(a);}
// 마이페이지에서 넘어온 고객명(nm) · 주소(ad) → 콘도명 · 동호수
function hhcPrefillSplit(nm,ad){
  var a=hhcUnitLike(ad)?String(ad).trim():'';
  var c=hhcCleanCondo(nm,a);
  var name=c.name,unit=a?c.unit:'';
  if(!unit){var t=hhcSplitTail(name);if(t){name=t.name;unit=t.unit;}}
  return {name:name,unit:unit};
}

const MAX = { condo_name: 200, condo_unit: 100, phone: 40, remarks: 3000, lang: 5, items: 8000, items_struct: 20000, ref: 12 };

export async function onRequestPost(context){
  const { request, env } = context;
  if (!originAllowed(request)) return fail('forbidden', 403);
  if (rateLimited(request, 'rq', 10)) return fail('too many requests', 429);
  let b; try { b = await request.json(); } catch (e) { return fail('bad request', 400); }
  const str = (k) => { const v = b && b[k]; return typeof v === 'string' ? v.slice(0, MAX[k]) : ''; };
  // 콘도명 · 동호수 겹침 정리 (request.html 과 같은 규칙) — 예전 화면으로 보내도 깨끗하게 저장
  const _cc = hhcCleanCondo(str('condo_name').trim(), str('condo_unit').trim());
  const condo_name = _cc.name, condo_unit = _cc.unit, phone = str('phone').trim();
  // 고객 제출은 콘도명 · 동호수 · 전화번호 · 의뢰품목이 모두 있어야 접수됩니다 (화면 검사와 같은 기준)
  if (!condo_name || !condo_unit || !phone) return fail('missing-fields', 400);
  if (phone.replace(/\D/g, '').length < 9) return fail('invalid-phone', 400);
  let itemsArr = null; try { itemsArr = JSON.parse(str('items') || '[]'); } catch (e) {}
  if (!Array.isArray(itemsArr) || !itemsArr.length) return fail('missing-items', 400);
  const data = {
    condo_name, condo_unit,
    condo: condo_name + ' (' + condo_unit + ')',
    phone,
    remarks: str('remarks'),
    lang: str('lang') === 'en' ? 'en' : 'ko',
    items: str('items'),
    items_struct: str('items_struct'),
    status: 'pending',
    submitted_at: new Date().toISOString(),
  };
  // 🤝 추천 코드 — 추천 정보가 잘못돼도 의뢰 접수는 그대로 진행합니다
  const ref = str('ref').trim().toUpperCase();
  if (ref) {
    try {
      const [rf, cfg] = await Promise.all([findReferrer(env, ref), loadRefCfg(env)]);
      if (rf && cfg.on) {
        data.ref_code = ref;
        data.ref_by = rf.__id;
        data.ref_by_name = String(rf.name || '');
        // 1차 판정: 본인 추천 → self · 같은 번호로 서비스 기록 → existing · 그 외 → new
        data.ref_new = (pn(rf.phone) && pn(rf.phone) === pn(phone)) ? 'self'
                     : (await hasServiceHistory(env, phone)) ? 'existing' : 'new';
        data.ref_status = 'pending';
      }
    } catch (e) {}
  }
  try {
    const d = await createDoc(env, 'requests', data);
    const push = await sendAdminPush(env, 'request').catch(() => ({ ok: false }));
    return json({ ok: true, id: d.__id, push });
  } catch (e) { return fail(e.message === 'env-missing' ? 'server-not-configured' : 'server-error', 500); }
}
