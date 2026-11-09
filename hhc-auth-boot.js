// hhc-auth-boot.js — compat 방식 화면(hhc-invoice·expense-admin) 전용 (2026-11-09)
// firebase-app-compat / firebase-auth-compat 다음, 화면의 firebase.firestore() 보다 먼저 실행된다.
// Firebase 앱을 같은 설정으로 먼저 만들고 로그인(Auth)을 붙여, 그 뒤 만들어지는 Firestore 가 로그인 토큰을 함께 보내게 한다.
// ⚠️ 설정(CFG)은 hhc-auth.js 및 화면 쪽 설정과 완전히 같아야 한다 — 다르면 「duplicate-app」 오류.
(function(){
  if (!window.firebase || !window.firebase.auth) return;
  var CFG = {
    apiKey: "AIzaSyAxAaB-CtySH2_ZHJKidwjbhn8ava6rM00",
    authDomain: "happywork-packageplan.firebaseapp.com",
    projectId: "happywork-packageplan",
    storageBucket: "happywork-packageplan.firebasestorage.app",
    messagingSenderId: "101289103022",
    appId: "1:101289103022:web:d81aca7f3747dd26df673f"
  };
  try {
    var app = window.firebase.apps.length ? window.firebase.app() : window.firebase.initializeApp(CFG);
    window.firebase.auth(app);
  } catch (e) { try { console.warn('hhc-auth-boot', e); } catch (_) {} }
})();
