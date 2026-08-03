// Happy Home Care — 홈 화면 설치(PWA)용 최소 서비스워커.
// 데이터를 캐시하지 않고 항상 네트워크의 최신 내용을 그대로 사용합니다.
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) { /* 네트워크 그대로 사용 (no cache) */ });
