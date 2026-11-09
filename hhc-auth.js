// ─────────────────────────────────────────────────────────────────────────────
// hhc-auth.js — Happy Home Care 관리자 화면 공통 로그인 (2026-11-09)
//
// 쓰는 법: 관리자 화면 <head> 안, 다른 <script type="module"> 보다 앞에 한 줄
//   <script type="module" src="/hhc-auth.js"></script>
// compat 방식 화면(hhc-invoice·expense-admin)은 위 한 줄에 더해, 본문의
// firebase-firestore-compat.js 바로 뒤에 아래 두 줄을 넣는다.
//   <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
//   <script src="/hhc-auth-boot.js"></script>
//
// 동작:
//  1) 이 모듈은 화면의 다른 모듈보다 먼저 실행된다(머리글에 있고, await 없이 동기로 초기화).
//     Firebase 앱을 먼저 만들고 로그인(Auth)을 붙여 두면, 화면이 그 뒤에 만드는 Firestore 가
//     로그인 토큰을 자동으로 함께 보낸다. 화면 쪽 initializeApp 은 같은 설정이라 그대로 통과한다.
//     ⚠️ 그래서 모든 관리자 화면의 Firebase 설정(CFG)은 아래와 완전히 같아야 한다(appId 포함).
//  2) 로그인 상태를 확인하는 동안 화면을 가려 두고(visibility), 허용된 계정이면 바로 보여 준다.
//  3) 로그인되어 있지 않으면 로그인 화면을 띄운다. 로그인 성공 → 화면 새로고침.
//  4) 허용 목록(ALLOWED)에 없는 계정은 로그인되어도 들어올 수 없다. (실제 차단은 Firestore 규칙이 하고,
//     여기 목록은 안내용이다. 직원 계정을 추가하면 Firestore 규칙의 목록도 함께 고친다.)
//
// window.HHCAuth = { ready: Promise<user>, user, email, logout() }
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider,
         signOut, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// 관리자 화면 공통 Firebase 설정 — 화면 쪽 설정과 글자 하나까지 같아야 한다
const CFG = {
  apiKey: "AIzaSyAxAaB-CtySH2_ZHJKidwjbhn8ava6rM00",
  authDomain: "happywork-packageplan.firebaseapp.com",
  projectId: "happywork-packageplan",
  storageBucket: "happywork-packageplan.firebasestorage.app",
  messagingSenderId: "101289103022",
  appId: "1:101289103022:web:d81aca7f3747dd26df673f"
};

// 관리자 화면을 열 수 있는 계정 (소문자). 직원을 추가하면 여기와 Firestore 규칙 둘 다 고친다.
const ALLOWED = [
  'kopeco100@gmail.com',
];

// 고객이 여는 「보기」 주소(admin.html?view=… · hhc-invoice.html?view=…)에는 로그인 화면을 띄우지 않는다.
// (고객 화면의 진짜 보호는 2단계에서 서버 경유 /api 로, 3단계에서 Firestore 규칙으로 처리)
const CUSTOMER_VIEW = /[?&]view=/.test(location.search);

// ── 1. 화면 가리기 (로그인 확인이 끝날 때까지) ─────────────────────────────
const LOCK_ID = 'hhcAuthLock';
(function lock(){
  if (CUSTOMER_VIEW || document.getElementById(LOCK_ID)) return;
  const st = document.createElement('style'); st.id = LOCK_ID;
  st.textContent = 'html.hhc-lock body > *:not(#hhcAuth){visibility:hidden !important}';
  document.head.appendChild(st);
  document.documentElement.classList.add('hhc-lock');
})();
function unlock(){ document.documentElement.classList.remove('hhc-lock'); const o = document.getElementById('hhcAuth'); if (o) o.remove(); }

// ── 2. Auth 준비 (동기) — 화면의 Firestore 보다 먼저 ──────────────────────
const compat = !!(window.firebase && window.firebase.auth && window.firebase.apps);
let A; // 어댑터: 방식(modular/compat)에 상관없이 같은 함수 이름으로 쓴다
if (compat) {
  const fa = window.firebase.apps.length ? window.firebase.auth() : window.firebase.auth(window.firebase.initializeApp(CFG));
  A = {
    onState: cb => fa.onAuthStateChanged(cb),
    email:   (e, p) => fa.signInWithEmailAndPassword(e, p),
    google:  () => fa.signInWithPopup(new window.firebase.auth.GoogleAuthProvider()),
    out:     () => fa.signOut(),
    emu:     url => fa.useEmulator(url, { disableWarnings: true }),
    user:    () => fa.currentUser,
  };
} else {
  const app = getApps().length ? getApp() : initializeApp(CFG);
  const auth = getAuth(app);
  A = {
    onState: cb => onAuthStateChanged(auth, cb),
    email:   (e, p) => signInWithEmailAndPassword(auth, e, p),
    google:  () => signInWithPopup(auth, new GoogleAuthProvider()),
    out:     () => signOut(auth),
    emu:     url => connectAuthEmulator(auth, url, { disableWarnings: true }),
    user:    () => auth.currentUser,
  };
}
// 로컬 테스트 전용 (실서버 주소에서는 절대 켜지지 않음): http://127.0.0.1/…?authemu=1
try {
  if (location.hostname === '127.0.0.1' && new URLSearchParams(location.search).get('authemu') === '1') A.emu('http://127.0.0.1:9099');
} catch (e) {}

function allowed(u){ return !!(u && u.email && ALLOWED.indexOf(String(u.email).toLowerCase()) >= 0); }

// ── 3. 로그인 화면 ───────────────────────────────────────────────────────────
const CSS = `
#hhcAuth{position:fixed;inset:0;z-index:2147483000;background:#F6F8FC;color:#14192A;
  font-family:'Pretendard',-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;
  font-size:16px;line-height:1.55;letter-spacing:-.01em;-webkit-font-smoothing:antialiased;overflow:auto}
#hhcAuth *{box-sizing:border-box}
.hha-wrap{max-width:400px;margin:0 auto;padding:calc(56px + env(safe-area-inset-top)) 20px 40px}
.hha-card{background:#fff;border-radius:16px;overflow:hidden;
  box-shadow:0 1px 2px rgba(11,24,51,.10),0 8px 16px -4px rgba(11,24,51,.16),0 26px 44px -14px rgba(11,24,51,.34)}
.hha-head{background:linear-gradient(120deg,#0E2350,#16346E);padding:24px 28px 22px;color:#fff}
.hha-tag{font-size:11px;font-weight:700;letter-spacing:.12em;color:rgba(255,255,255,.55)}
.hha-title{font-size:22px;font-weight:800;letter-spacing:-.02em;margin-top:6px}
.hha-sub{font-size:13px;color:rgba(255,255,255,.62);margin-top:2px}
.hha-body{padding:24px 28px 26px}
.hha-f{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
.hha-l{font-size:12px;font-weight:700;color:#5A6478}
.hha-i{width:100%;padding:13px 14px;border:1.5px solid #E4E9F2;border-radius:12px;font:inherit;font-size:16px;color:#14192A;background:#fff;outline:none;transition:border-color .16s}
.hha-i:focus{border-color:#16346E}
.hha-btn{width:100%;padding:14px;border:0;border-radius:13px;font:inherit;font-size:16px;font-weight:700;cursor:pointer;transition:transform .14s,filter .14s}
.hha-btn:active{transform:scale(.985)}
.hha-p{background:linear-gradient(120deg,#0E2350,#16346E);color:#fff;margin-top:4px}
.hha-p:hover{filter:brightness(1.1)}
.hha-g{background:#fff;color:#14192A;border:1.5px solid #E4E9F2;margin-top:12px;display:flex;align-items:center;justify-content:center;gap:10px}
.hha-g:hover{background:#F6F8FC}
.hha-g b{display:inline-flex;width:22px;height:22px;border-radius:50%;background:#0f766e;color:#fff;font-size:13px;align-items:center;justify-content:center;font-weight:800}
.hha-or{display:flex;align-items:center;gap:12px;margin:18px 0 0;color:#98A1B4;font-size:12px}
.hha-or:before,.hha-or:after{content:'';flex:1;height:1px;background:#E4E9F2}
.hha-err{display:none;margin-top:12px;padding:11px 13px;border-radius:10px;background:#FEF2F2;color:#B91C1C;font-size:13px;font-weight:600}
.hha-err.on{display:block}
.hha-note{margin-top:16px;font-size:12px;color:#98A1B4;text-align:center}
.hha-wait{text-align:center;padding:60px 20px 0;color:#5A6478;font-size:14px}
.hha-spin{width:28px;height:28px;border:3px solid #E4E9F2;border-top-color:#16346E;border-radius:50%;margin:0 auto 14px;animation:hhaSpin .8s linear infinite}
@keyframes hhaSpin{to{transform:rotate(360deg)}}
.hha-den{padding:24px 28px 26px}
.hha-den .hha-mail{font-weight:800;color:#0E2350;word-break:break-all}
.hha-den p{margin:0 0 10px;font-size:14px;color:#5A6478}
.hha-s{background:#F6F8FC;color:#14192A;border:1.5px solid #E4E9F2;margin-top:14px}
.hha-btn[disabled]{opacity:.6;cursor:default}
@media (prefers-reduced-motion:reduce){.hha-spin{animation:none}.hha-btn{transition:none}}
/* 로그인 뒤 왼쪽 아래 작은 계정 표시 */
#hhcAuthChip{position:fixed;left:10px;bottom:calc(10px + env(safe-area-inset-bottom));z-index:2147482000;
  font-family:'Pretendard',-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;line-height:1}
#hhcAuthChip button{border:0;cursor:pointer;font:inherit}
.hhc-av{width:30px;height:30px;border-radius:50%;background:#0E2350;color:#fff;font-weight:800;font-size:13px;
  box-shadow:0 1px 2px rgba(11,24,51,.2),0 6px 14px -4px rgba(11,24,51,.35);opacity:.9}
.hhc-pop{display:none;position:absolute;left:0;bottom:38px;background:#fff;border-radius:12px;padding:10px 12px;white-space:nowrap;
  box-shadow:0 1px 2px rgba(11,24,51,.10),0 8px 16px -4px rgba(11,24,51,.16),0 26px 44px -14px rgba(11,24,51,.34);color:#14192A}
.hhc-pop.on{display:block}
.hhc-pop .m{font-size:12px;color:#5A6478;margin-bottom:8px}
.hhc-pop .o{background:#F6F8FC;border:1px solid #E4E9F2 !important;border-radius:8px;padding:7px 10px;font-size:12px;font-weight:700;color:#B91C1C}
`;

const ERR = {
  'auth/invalid-credential': '이메일 또는 비밀번호가 맞지 않습니다.',
  'auth/invalid-email': '이메일 주소 형식이 올바르지 않습니다.',
  'auth/user-not-found': '등록되지 않은 이메일입니다.',
  'auth/wrong-password': '비밀번호가 맞지 않습니다.',
  'auth/missing-password': '비밀번호를 입력해 주세요.',
  'auth/too-many-requests': '시도가 너무 많습니다. 잠시 뒤 다시 해 주세요.',
  'auth/user-disabled': '사용이 중지된 계정입니다.',
  'auth/network-request-failed': '인터넷 연결을 확인해 주세요.',
  'auth/popup-blocked': '팝업이 막혔습니다. 이메일로 로그인해 주세요.',
  'auth/popup-closed-by-user': '로그인 창이 닫혔습니다.',
  'auth/cancelled-popup-request': '로그인 창이 닫혔습니다.',
  'auth/operation-not-allowed': 'Firebase 콘솔에서 이 로그인 방식이 아직 켜져 있지 않습니다.',
  'auth/unauthorized-domain': '이 주소는 Firebase 콘솔의 승인된 도메인에 없습니다.',
};
function errText(e){ const c = (e && e.code) || ''; return ERR[c] || ('로그인에 실패했습니다. (' + (c || (e && e.message) || '알 수 없는 오류') + ')'); }

function el(html){ const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function ensureStyle(){ if (!document.getElementById('hhcAuthCss')) { const s = document.createElement('style'); s.id = 'hhcAuthCss'; s.textContent = CSS; document.head.appendChild(s); } }
function mount(node){
  ensureStyle();
  let o = document.getElementById('hhcAuth');
  if (!o) { o = el('<div id="hhcAuth" role="dialog" aria-modal="true" aria-label="관리자 로그인"></div>'); (document.body || document.documentElement).appendChild(o); }
  o.innerHTML = ''; o.appendChild(node);
}

function viewWait(){ mount(el('<div class="hha-wait"><div class="hha-spin"></div>로그인 확인 중…</div>')); }

function viewLogin(msg){
  const v = el(`
  <div class="hha-wrap"><div class="hha-card">
    <div class="hha-head"><div class="hha-tag">관리자 전용</div><div class="hha-title">Happy Home Care</div><div class="hha-sub">관리자 화면에 로그인하세요</div></div>
    <form class="hha-body" id="hhaForm" autocomplete="on">
      <div class="hha-f"><label class="hha-l" for="hhaEmail">이메일</label><input class="hha-i" id="hhaEmail" type="email" name="email" inputmode="email" autocomplete="username" placeholder="name@example.com" required></div>
      <div class="hha-f"><label class="hha-l" for="hhaPw">비밀번호</label><input class="hha-i" id="hhaPw" type="password" name="password" autocomplete="current-password" placeholder="비밀번호" required></div>
      <button class="hha-btn hha-p" id="hhaGo" type="submit">로그인</button>
      <div class="hha-or">또는</div>
      <button class="hha-btn hha-g" id="hhaGoogle" type="button"><b>G</b>Google 계정으로 로그인</button>
      <div class="hha-err" id="hhaErr"></div>
      <div class="hha-note">계정은 대표가 Firebase 콘솔에서 발급합니다.</div>
    </form>
  </div></div>`);
  mount(v);
  const err = v.querySelector('#hhaErr'), go = v.querySelector('#hhaGo'), gg = v.querySelector('#hhaGoogle');
  const showErr = t => { err.textContent = t; err.classList.toggle('on', !!t); };
  if (msg) showErr(msg);
  const busy = on => { go.disabled = on; gg.disabled = on; go.textContent = on ? '확인 중…' : '로그인'; };
  async function after(cred){
    const u = (cred && cred.user) || A.user();
    if (!allowed(u)) { await A.out().catch(()=>{}); viewDenied(u); return; }
    location.reload();
  }
  v.querySelector('#hhaForm').addEventListener('submit', async e => {
    e.preventDefault(); showErr('');
    const em = v.querySelector('#hhaEmail').value.trim().toLowerCase(), pw = v.querySelector('#hhaPw').value;
    if (!em || !pw) { showErr('이메일과 비밀번호를 입력해 주세요.'); return; }
    busy(true);
    try { await after(await A.email(em, pw)); } catch (ex) { busy(false); showErr(errText(ex)); }
  });
  gg.addEventListener('click', async () => {
    showErr(''); busy(true);
    try { await after(await A.google()); } catch (ex) { busy(false); showErr(errText(ex)); }
  });
  setTimeout(() => { try { v.querySelector('#hhaEmail').focus(); } catch (e) {} }, 50);
}

function viewDenied(u){
  const mail = (u && u.email) || '(이메일 없음)';
  const v = el(`
  <div class="hha-wrap"><div class="hha-card">
    <div class="hha-head"><div class="hha-tag">관리자 전용</div><div class="hha-title">허용되지 않은 계정</div><div class="hha-sub">이 계정은 관리자 목록에 없습니다</div></div>
    <div class="hha-den">
      <p>로그인한 계정: <span class="hha-mail"></span></p>
      <p>관리자 화면을 쓰려면 대표에게 이 이메일의 등록을 요청하세요.</p>
      <button class="hha-btn hha-s" id="hhaOut" type="button">다른 계정으로 로그인</button>
    </div>
  </div></div>`);
  v.querySelector('.hha-mail').textContent = mail;
  mount(v);
  v.querySelector('#hhaOut').addEventListener('click', async () => { await A.out().catch(()=>{}); viewLogin(''); });
}

function chip(u){
  if (window.top !== window) return;               // 직원앱 안의 iframe 에는 표시하지 않음
  if (document.getElementById('hhcAuthChip')) return;
  ensureStyle();
  const name = String(u.email || '?');
  const c = el(`<div id="hhcAuthChip"><button class="hhc-av" type="button" title="${name}" aria-label="계정">${name.charAt(0).toUpperCase()}</button>
    <div class="hhc-pop"><div class="m"></div><button class="o" type="button">로그아웃</button></div></div>`);
  c.querySelector('.m').textContent = name;
  const pop = c.querySelector('.hhc-pop');
  c.querySelector('.hhc-av').addEventListener('click', () => pop.classList.toggle('on'));
  c.querySelector('.o').addEventListener('click', async () => { await A.out().catch(()=>{}); location.reload(); });
  document.addEventListener('click', e => { if (!c.contains(e.target)) pop.classList.remove('on'); });
  document.body.appendChild(c);
}

// ── 4. 상태 확인 → 화면 결정 ────────────────────────────────────────────────
let resolveReady; const ready = new Promise(r => { resolveReady = r; });
window.HHCAuth = { ready, user: null, email: '', logout: async () => { await A.out().catch(()=>{}); location.reload(); } };

function start(){
  viewWait();
  let first = true;
  A.onState(u => {
    if (!first) return;          // 로그인·로그아웃 뒤에는 새로고침으로 처리하므로 첫 판정만 쓴다
    first = false;
    if (allowed(u)) {
      window.HHCAuth.user = u; window.HHCAuth.email = u.email || '';
      unlock(); chip(u); resolveReady(u);
    } else if (u) {
      A.out().catch(()=>{}); viewDenied(u);
    } else {
      viewLogin('');
    }
  });
  // 10초가 지나도 판정이 없으면(네트워크 문제 등) 로그인 화면을 띄운다
  setTimeout(() => { if (first) { first = false; viewLogin('로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요.'); } }, 10000);
}
if (!CUSTOMER_VIEW) { if (document.body) start(); else document.addEventListener('DOMContentLoaded', start); }
else { resolveReady(null); }
