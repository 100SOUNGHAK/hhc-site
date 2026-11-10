// Happy Home Care — 홈 화면 설치(PWA)용 최소 서비스워커.
// 데이터를 캐시하지 않고 항상 네트워크의 최신 내용을 그대로 사용합니다.
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) { /* 네트워크 그대로 사용 (no cache) */ });


// ── HHC 관리자 알림 클릭: 앱 창을 앞으로 가져오고 해당 탭을 엽니다 ──
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  try { if (navigator.clearAppBadge) navigator.clearAppBadge(); } catch (err) {}
  var tab = (e.notification.data && e.notification.data.tab) || '';
  var url = (e.notification.data && e.notification.data.url) || '';
  // 주소가 정해진 알림(예: 내일 일정 보내기 → /sched-send.html)은 그 화면을 바로 엽니다
  if (url) {
    e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url && c.url.indexOf('sched-send') >= 0 && c.navigate) { if (c.focus) c.focus(); return c.navigate(url); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }));
    return;
  }
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
  var url = (typeof d.url === 'string' && d.url.charAt(0) === '/') ? d.url : '';   // 우리 사이트 안 주소만
  var tab = url ? (d.tab || 'link') : (d.tab === 'booking' ? 'booking' : 'request');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    // 2026-11-10: 알림은 항상 표시합니다.
    //  · 예전에는 앱 창이 「보이는 중」이면 건너뛰었는데, 화면이 꺼지거나 다른 앱으로 넘어간 뒤에도
    //    기기가 「보이는 중」으로 잘못 알려 주는 경우가 있어 알림이 안 울리고, 앱을 열어야 울리는 일이 있었습니다.
    //  · 알림을 띄우지 않고 넘어가는 푸시가 반복되면 휴대폰·브라우저가 이 사이트의 푸시를 늦추거나 끊습니다.
    //  · 관리자 앱을 실제로 보고 있을 때(focused)만 소리 없이 띄우고 잠시 뒤 지웁니다 — 앱 안의 알림음이 대신 울립니다.
    var focused = false;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.focused && c.visibilityState === 'visible' && c.url && (c.url.indexOf('staff-app') >= 0 || c.url.indexOf('staffapp') >= 0)) focused = true;
    }
    if (url) focused = false;   // 주소가 정해진 알림은 앱 안에서 따로 알려 주지 않으므로 항상 소리
    if (!focused) { try { if (navigator.setAppBadge) navigator.setAppBadge(1); } catch (err) {} }   // 앱 아이콘 배지 (지원 기기)
    var tag = 'hhc-push-' + tab;
    var opt = {
      body: d.body || '눌러서 바로 확인하세요',
      icon: 'icon-admin-192.png', badge: 'icon-admin-192.png',
      tag: tag, renotify: !focused, requireInteraction: !focused, timestamp: Date.now(),
      data: { tab: tab, url: url }
    };
    if (focused) opt.silent = true; else opt.vibrate = [300, 120, 300, 120, 300];   // silent 와 vibrate 는 함께 쓸 수 없음
    return self.registration.showNotification(d.title || 'HHC 알림', opt).then(function () {
      if (!focused) return;
      return new Promise(function (res) { setTimeout(res, 4000); }).then(function () {
        return self.registration.getNotifications({ tag: tag });
      }).then(function (ns) { (ns || []).forEach(function (n) { try { n.close(); } catch (err) {} }); }).catch(function () {});
    });
  }));
});
