// ─────────────────────────────────────────────────────────────────────────────
// POST /api/myauth — 고객 마이페이지 본인 확인 (2026-11-19)
//   {op:'send',  c, lang}   → 고객상세 전화번호로 인증코드 문자 (Twilio Verify)  → {ok, mask}
//   {op:'check', c, code}   → 코드 확인 → {ok, tok}  (tok = 이 휴대폰의 「마이페이지 열쇠」)
// 전화번호는 화면에서 받지 않는다 — 항상 고객상세(customers/{c}.phone)의 번호로만 보낸다.
// 자세한 구조는 _lib/myauth.js 머리말.
// ─────────────────────────────────────────────────────────────────────────────
import { getDoc, patchDoc, json, fail, rateLimited, originAllowed, pn } from './_lib/fs.js';
import { authOn, e164, maskPhone, makeTok, twilio } from './_lib/myauth.js';

export async function onRequestPost(context){
  const { request, env } = context;
  if (!originAllowed(request)) return fail('origin', 403);
  if (rateLimited(request, 'myauth', 12)) return fail('too-many', 429);
  if (!authOn(env)) return fail('auth-off', 400);
  let b = {}; try { b = await request.json(); } catch (e) {}
  const CID = String(b.c || '').trim();
  if (!CID || CID.length > 128) return fail('no-id', 400);

  let m;
  try { m = await getDoc(env, 'customers', CID); } catch (e) { return fail('server-error', 500); }
  if (!m) return fail('not-found', 404);
  const to = e164(m.phone);
  if (!to || pn(m.phone).length < 7) return fail('no-phone', 400);

  try {
    if (b.op === 'send') {
      if (rateLimited(request, 'myauth-send', 4)) return fail('too-many', 429);
      const r = await twilio(env, '/Verifications', { To: to, Channel: 'sms', Locale: b.lang === 'en' ? 'en' : 'ko' });
      const code = r.j && r.j.code;
      if (r.status === 201 || r.status === 200) return json({ ok: true, mask: maskPhone(to) });
      if (r.status === 429 || code === 60203) return fail('too-many', 429);
      if (code === 60200 || code === 60205 || code === 21211 || code === 21614) return fail('bad-number', 400);
      return fail('send-failed', 502);
    }
    if (b.op === 'check') {
      const code = String(b.code || '').replace(/[^0-9]/g, '');
      if (code.length < 4 || code.length > 10) return fail('wrong', 400);
      const r = await twilio(env, '/VerificationCheck', { To: to, Code: code });
      if (r.status === 404 || (r.j && r.j.code === 20404)) return fail('expired', 400);
      if (r.status === 429 || (r.j && r.j.code === 60202)) return fail('too-many', 429);
      if (r.status === 200 && r.j && r.j.status === 'approved') {
        // 기록: 마지막 본인 확인 시각 · 횟수 (고객상세에서 볼 수 있게)
        const rec = patchDoc(env, 'customers', CID, { my_auth_at: new Date().toISOString(), my_auth_n: (parseInt(m.my_auth_n, 10) || 0) + 1 }).catch(() => {});
        if (context.waitUntil) context.waitUntil(rec);
        return json({ ok: true, tok: await makeTok(env, CID, m.phone) });
      }
      if (r.status === 200) return fail('wrong', 400);
      return fail('check-failed', 502);
    }
    return fail('bad-op', 400);
  } catch (e) {
    return fail('server-error', 500);
  }
}
