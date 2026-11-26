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
  var od = (e.notification.data && e.notification.data.od) || '';   // 열 문서(의뢰 · 예약) ID (2026-11-25)
  // 🔔 고객 앱 알림 : 열려 있는 마이페이지 창이 있으면 그 창에서 열고, 없으면 새로 엽니다
  if (url && e.notification.data.cust) {
    // 📋 열람 기록 (2026-11-19) — 고객관리 「알림 이력」에 「열어 봄」으로 표시됩니다. 실패해도 화면 열기는 그대로.
    var oid = e.notification.data.oid || '';
    if (oid) e.waitUntil(self.registration.pushManager.getSubscription().then(function (s) {
      return fetch('/api/cpush', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ op: 'open', id: oid, ep: (s && s.endpoint) || '' }) });
    }).catch(function () {}));
    e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url && /^\/my(\.html)?$/.test(new URL(c.url).pathname) && c.navigate) { if (c.focus) c.focus(); return c.navigate(url); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }));
    return;
  }
  // 🔔 방문 안내 보낼 차례(/customer-admin.html?vl=…) → 관리자 앱(고객 탭) 안에서 목록을 바로 엽니다 (2026-11-25)
  var vlm = /customer-admin\.html\?vl=(d7|d3|tm|td)/.exec(url || '');
  if (vlm) {
    e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url && (c.url.indexOf('staff-app') >= 0 || c.url.indexOf('staffapp') >= 0)) {
          if (c.focus) c.focus();
          if (c.postMessage) c.postMessage({ hhcOpenTab: 'customers', hhcVl: vlm[1] });
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow('/staff-app.html?vl=' + vlm[1] + '#customers');
    }));
    return;
  }
  // 주소가 정해진 알림은 그 화면을 바로 엽니다
  if (url) {
    e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url && /customer-admin\.html\?vl=/.test(c.url) && c.navigate) { if (c.focus) c.focus(); return c.navigate(url); }
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
        if (tab && c.postMessage) c.postMessage({ hhcOpenTab: tab, hhcOpenDoc: od });
        return;
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow('/staff-app.html' + (od ? '?od=' + od : '') + (tab ? '#' + tab : ''));
  }));
});

// ── 서버 푸시 수신: 앱이 완전히 꺼져 있어도 알림창에 표시됩니다 ──
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) {}
  // 🔔 고객 앱 알림 (2026-11-16 · /api/cpush) — 관리자 알림과 따로: 고객 아이콘 · 누르면 마이페이지의 해당 안내로
  if (d.kind === 'cust') {
    var cu = (typeof d.url === 'string' && d.url.charAt(0) === '/' && d.url.charAt(1) !== '/') ? d.url : '/my';
    e.waitUntil(self.registration.showNotification(d.title || 'Happy Home Care', {
      body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png',
      tag: d.tag || 'hhc-cust', renotify: true, timestamp: Date.now(),
      data: { url: cu, cust: true, oid: (typeof d.oid === 'string' ? d.oid.slice(0, 160) : '') }
    }));
    return;
  }
  var url = (typeof d.url === 'string' && d.url.charAt(0) === '/') ? d.url : '';   // 우리 사이트 안 주소만
  var tab = url ? (d.tab || 'link') : (d.tab === 'booking' || d.tab === 'transfer' || d.tab === 'rplan' ? d.tab : 'request');   // rplan = 수리 의향서 회신 (2026-11-26)   // transfer = 양도·전환 신청 (2026-11-23)
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
    // 알림마다 다른 tag (2026-11-25) — 같은 tag 면 앞 알림을 조용히 바꿔치기만 해서(갤럭시) 두 번째부터 안 울리는 것처럼 보였음
    var tag = 'hhc-push-' + tab + '-' + Date.now().toString(36);
    var opt = {
      body: d.body || '눌러서 바로 확인하세요',
      icon: 'icon-admin-192.png', badge: 'icon-admin-192.png',
      tag: tag, renotify: !focused, requireInteraction: !focused, timestamp: Date.now(),
      data: { tab: tab, url: url, od: (typeof d.od === 'string' && /^[A-Za-z0-9_-]{4,80}$/.test(d.od)) ? d.od : '' }   // od = 열 문서 ID (2026-11-25)
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
