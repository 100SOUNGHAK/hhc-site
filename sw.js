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

// ── 서버 푸시 수신: 앱이 완전히 꺼져 있어도 알림창에 표시됩니다 ──
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) {}
  var tab = d.tab === 'booking' ? 'booking' : 'request';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    // 관리자 앱이 화면에 열려 있으면 앱 내 알림(토스트·소리)이 처리하므로 중복 표시하지 않음
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.visibilityState === 'visible' && c.url && (c.url.indexOf('staff-app') >= 0 || c.url.indexOf('staffapp') >= 0)) return;
    }
    return self.registration.showNotification(d.title || 'HHC 알림', {
      body: d.body || '눌러서 바로 확인하세요',
      icon: 'icon-admin-192.png', badge: 'icon-admin-192.png',
      tag: 'hhc-push-' + tab, renotify: true, vibrate: [220, 110, 220],
      data: { tab: tab }
    });
  }));
});
