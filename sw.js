// Happy Home Care — 홈 화면 설치(PWA)용 최소 서비스워커.
// 데이터를 캐시하지 않고 항상 네트워크의 최신 내용을 그대로 사용합니다.
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) { /* 네트워크 그대로 사용 (no cache) */ });


// ── HHC 관리자 알림 클릭: 앱 창을 앞으로 가져오고 해당 탭을 엽니다 ──
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var tab = (e.notification.data && e.notification.data.tab) || '';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url && (c.url.indexOf('staff-app') >= 0 || c.url.indexOf('staffapp') >= 0)) {
        if (c.focus) c.focus();
        if (tab && c.postMessage) c.postMessage({ hhcOpenTab: tab });
        return;
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow('/staff-app.html' + (tab ? '#' + tab : ''));
  }));
});
